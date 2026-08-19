# Kiến trúc ProWorshipCast — Native Media Pipeline

> File này ghi lại các quyết định kiến trúc quan trọng liên quan đến việc tích hợp C++ vào backend Tauri v2 + Rust, lý do lựa chọn, và các đánh đổi đã cân nhắc. Cập nhật file này mỗi khi có thay đổi kiến trúc lớn — đừng để quyết định chỉ tồn tại trong lịch sử chat.

---

## 1. Tổng quan stack

```
React (TypeScript, Zustand, Vite) — UI, multi-window
        │  Tauri IPC (invoke/emit)
Rust (Tauri v2 backend) — điều phối, commands, events, state
        │  cxx bridge (FFI an toàn)
C++ core — chỉ phần bắt buộc phải native
```

**Nguyên tắc bất biến:** C++ không bao giờ nói chuyện trực tiếp với React. C++ chỉ nói chuyện với Rust. Rust là lớp điều phối duy nhất.

---

## 2. Vì sao dùng C++ (và vì sao chỉ 2 module)

Ban đầu cân nhắc 6 module C++ (Video, Audio, Image, Text, Streaming, Perf Utils). Sau đánh giá, thu hẹp còn **2 module thực sự bắt buộc phải native**:

| Module | Lý do bắt buộc C++ |
|---|---|
| **Video Engine** (FFmpeg) | HTML5 `<video>`/Canvas API không đủ hiệu năng cho nhiều lớp video độ phân giải cao đồng thời; chưa có crate Rust nào đạt hiệu năng tương đương khi wrap libavcodec trực tiếp |
| **NDI Output** | NDI SDK (Vizrt/NewTek) chỉ phát hành dạng thư viện C/C++, không có binding Rust chính thức đáng tin cậy |

**4 module còn lại dùng Rust thuần** — xem Phụ lục A của tài liệu spec gốc:
- Audio: `cpal` + `rodio`
- Ảnh: `fast_image_resize` + `image`
- Font/text (kể cả tiếng Việt, ligature): `cosmic-text` + `rustybuzz`
- Buffer/threading: `crossbeam-channel`

**Nguyên tắc áp dụng về sau:** trước khi thêm bất kỳ dependency C++ mới nào, luôn tự hỏi "crates.io có crate Rust tương đương không" trước.

---

## 3. Vì sao dùng `cxx` thay vì `bindgen`

- `cxx` cho type-safety hai chiều giữa Rust và C++, giảm hẳn `unsafe` block so với `bindgen`/FFI tay.
- Mỗi module native có `#[cxx::bridge]` riêng (`video_bridge.rs`, `ndi_bridge.rs`...) — lỗi biên dịch của module này không chặn module khác.
- Không tự quản lý bộ nhớ tay: dùng `UniquePtr`/RAII qua `cxx`, không viết `new`/`delete` thủ công ở boundary.

---

## 4. Lịch sử vấn đề hiệu năng & quyết định (quan trọng — đọc trước khi đổi kiến trúc media pipeline)

Đây là chuỗi vấn đề thực tế đã gặp khi tích hợp Video Engine + Chroma Key, theo đúng thứ tự phát hiện — để tránh lặp lại đường vòng debug.

### 4.1 Vấn đề: truyền frame RGBA thô qua IPC
- **Triệu chứng:** bật chroma key → lag nặng (~5-12fps thực tế dù engine đo được 28.6fps).
- **Nguyên nhân gốc:** mỗi frame RGBA (~3.68MB ở 720p) serialize qua Tauri IPC (WebView2) mỗi lần — đo được 84-200ms/frame chỉ riêng phần IPC.
- **Quyết định:** đổi sang **"keyed" format** — gửi 2 phần: JPEG màu (nén) + alpha-mask raw ở nửa độ phân giải, composite ở frontend bằng `globalCompositeOperation: destination-in`. Payload giảm từ 3.68MB → ~248KB/frame (giảm ~60-70×). IPC giảm còn 8-17ms.
- **Bài học:** Tauri IPC không phù hợp để truyền buffer lớn liên tục mỗi frame. Bất kỳ tính năng real-time media nào sau này cần cân nhắc kỹ chi phí IPC trước khi thiết kế.

### 4.2 Vấn đề: giật chớp ngay lúc mở app
- **Triệu chứng:** giật chớp xảy ra ngay khi khởi động, không cần thao tác gì, không tích lũy theo thời gian.
- **Nguyên nhân gốc:** `React.StrictMode` bật ở cả 5 cửa sổ → dev mode mount component 2 lần → mỗi video player bị play→stop→play, player restart + seq reset.
- **Quyết định:** gỡ `StrictMode` cho các cửa sổ có `NativeVideo`.
- **Bài học:** hiện tượng "tức thời, không tích lũy" là dấu hiệu tốt để loại trừ nguyên nhân kiểu memory leak/GC — nên khai thác đặc điểm thời gian của bug để thu hẹp phạm vi chẩn đoán sớm.

### 4.3 Vấn đề: Preview window phí tài nguyên
- **Nguyên nhân gốc:** Output đẩy target 1080p → Preview cũng decode/vẽ ở 1080p dù canvas nhỏ (draw 40-73ms).
- **Quyết định:** dùng `createImageBitmap` với `resizeWidth/resizeHeight` theo đúng kích thước vẽ thực tế của từng instance, thay vì vẽ nguyên kích thước gốc.
- Đồng thời: **tách target theo vai trò** — chỉ Output window (`kind="output"`) điều khiển resolution decode; Preview chỉ fallback, không tự đẩy target riêng (tránh tranh chấp "last-writer-wins" giữa 2 cửa sổ).

### 4.4 Vấn đề: JPEG encode chậm ở độ phân giải cao
- **Nguyên nhân gốc:** encoder MJPEG nội bộ của FFmpeg không dùng SIMD → 1080p mất 70-79ms/frame (~13-14fps), release build không cải thiện đáng kể.
- **Quyết định:** đổi sang **libjpeg-turbo** (SIMD, feed RGBA thẳng qua `JCS_EXT_RGBA`, bỏ hẳn bước `swscale` trung gian). Kết quả: 1080p từ 79ms → 21ms ở release build (47fps), không đánh đổi chất lượng ảnh.

### 4.5 Giới hạn hiện tại: 4K không khả thi bằng CPU encode
- Đo thực tế (release, libjpeg-turbo): 1080p = 21ms (47fps) → ngoại suy 4K ≈ 60-85ms (~12-16fps) — không đạt 30fps ổn định bằng CPU thuần.
- **Quyết định:** để đạt 4K mượt thật sự, cần pipeline GPU (xem Mục 5). Không cố ép CPU JPEG lên 4K.

---

## 5. Track 2 (đang triển khai): GPU pipeline cho 4K

**Đã cân nhắc 2 phương án:**

| Phương án | Ưu điểm | Nhược điểm | Quyết định |
|---|---|---|---|
| NVENC (H.264 hardware encode → MediaSource `<video>`) | Dev nhanh hơn (~1.5-2 tuần), tận dụng lại IPC hiện có | **Chỉ chạy trên GPU NVIDIA** — máy tính vận hành thực tế ở nhà thờ thường dùng GPU tích hợp (Intel/AMD) hoặc NVIDIA đời cũ | ❌ Không chọn — loại quá nhiều người dùng thực tế |
| wgpu/WebGPU + shared memory (zero-copy) | Không phụ thuộc hãng GPU, độ trễ thấp nhất, xử lý được cả chroma key trong shader | Phức tạp hơn (~2-2.5 tuần), cần xác minh WebGPU chạy được trong WebView2 | ✅ **Đã chọn** |

**Quy tắc triển khai Track 2:**
- Làm **spike nhỏ (1-2 ngày)** xác minh WebGPU chạy được trong WebView2 trước khi viết pipeline đầy đủ.
- Nhánh wgpu chỉ áp dụng cho **Output window** — không phá nhánh libjpeg-turbo đang ổn định.
- **libjpeg-turbo giữ làm fallback** cho máy yếu/không hỗ trợ WebGPU + cho Preview window.
- Không merge thay đổi lớn của Track 2 vào nhánh chính cho tới khi Track 1 (sửa giật chóp) đã được xác nhận ổn định trên app thật.

### 5.1 Track 3 (đã triển khai 2026-08): hybrid `<video>` + WebGPU external texture

**Mục tiêu:** hiển thị nguồn video **đúng độ phân giải gốc** (1080p/4K) với audio + seek + loop, không phụ thuộc CPU JPEG (giới hạn Mục 4.5).

**Cách làm:** `<video>` phát file qua asset/media protocol (browser hardware decode + A/V sync); mỗi frame đẩy vào WebGPU qua `importExternalTexture` (shader NV12/YUV → display, hỗ trợ chroma key trong shader). Khác Track 2 (Rust wgpu decode) ở chỗ decode do trình duyệt lo — đơn giản hơn và tận dụng HW decode của máy.

**Các lỗi đã vấp phải (theo thứ tự phát hiện):**
1. `texture_external` **không** dùng được `textureSample` — phải dùng `textureSampleBaseClampToEdge`.
2. `Failed to construct 'VideoFrame': VideoFrames can't be created from tainted sources` — thiếu `crossOrigin="anonymous"` trên `<video>`; asset protocol đã tự gửi `Access-Control-Allow-Origin` nên chỉ cần set attribute (không cần `enableCors` — field đó không tồn tại).
3. `additionalBrowserArgs "--autoplay-policy=no-user-gesture-required"` làm WebView2 env init fail (app thoát im lặng) → **bỏ hẳn**; WebView2 autoplay media mặc định hoạt động.
4. **Giật/khựng (quan trọng):** mọi cách đọc frame từ `<video>` sang WebGPU đều nhiễu pipeline decode/composite của WebView2:
   - `importExternalTexture({source: videoElement})` mỗi rAF → **video dừng hẳn** (currentTime đứng yên).
   - giữ `new VideoFrame(video)` chờ rAF → **timeline giật** (thanh progress cũng giật theo).
   - present ở nhịp nguồn (rvfc) không đồng bộ màn hình → judder 30fps-on-60Hz.

**Quyết định chống giật (2026-08-15):** khi **không bật chroma**, hiển thị **`<video>` trực tiếp** (compositor trình duyệt tự đồng bộ v-sync → mượt tuyệt đối); WebGPU **chỉ chạy khi bật chroma key**, dùng rvfc → `new VideoFrame` → present → `close()` ngay (không giữ frame). Đã xác nhận mượt cả Preview lẫn Output ở 1080p và 4K.

### 5.2 Khi nào dùng Track 2, khi nào dùng Track 3 (quyết định runtime, 2026-08-19)

Cả hai track **vẫn được giữ song song** — Track 2 (Rust decode → raw NV12 → WebGPU) là đường **fallback**, Track 3 (hybrid `<video>` + external texture) là đường **chính**. Không track nào bị loại:

| Điều kiện runtime (`NativeVideo.tsx`) | Đường phát | Track |
|---|---|---|
| WebGPU có + `requestVideoFrameCallback` có | `startHybrid()` | **Track 3** (chính) |
| WebGPU có + RVFC **không** có | `startPull()` + raw NV12 → `gpu.present()` | **Track 2** (fallback) |
| `<video>` load asset/media protocol **thất bại** hoặc meta-timeout (6s) | `onError` → `startPull()` | **Track 2** (fallback) |
| WebGPU **không** có | `startPull()` + JPEG → `drawFrame()` canvas 2D | libjpeg-turbo (fallback cũ, mục 4.4) |

**Vì sao giữ Track 2:** (1) WebView2 chưa có RVFC trên mọi máy → nếu chỉ có Track 3 thì Output/preview mất video; (2) hybrid phụ thuộc browser HW decode + asset protocol — khi file không load được (codec lạ, đường dẫn lỗi) phải có đường decode bằng Rust C++ thay thế; (3) NDI auto-pump (mục A2) vẫn bơm từ decode loop Rust ở mọi chế độ.

**Quy tắc cho người sửa sau:** không xoá `WebGpuVideoRenderer.present()` (Track 2) hay `presentVideoFrame()` (Track 3) riêng lẻ — hai hàm phục vụ 2 đường khác nhau. Khi sửa `NativeVideo.tsx`, giữ đúng thứ tự quyết định ở bảng trên.

---

## 6. NDI SDK — lưu ý về license

- NDI SDK (Vizrt NDI AB) có license riêng, không tự động cho phép tái phân phối trong sản phẩm khác.
- **Kết quả xác nhận (2026-08-19):** đã đọc NDI SDK License Agreement (Vizrt NDI AB, bản 2024-11) tại `http://ndi.link/ndisdk_license`.
  - **Nguồn SDK:** `Processing.NDI.Lib.x64.dll` (v6.3.2.0 = SDK 6.3.2, bản mới nhất lúc xác nhận) được tải từ nguồn chính thức Vizrt/NewTek — **không mượn từ dự án khác**. DLL bị gitignore (do license), người dùng phải tự đặt vào `src-tauri/resources/` khi clone repo (ghi trong README).
  - **Quyền phân phối:** license cho phép phân phối object code của SDK **kèm theo Product** ("Bundled Product") dưới dạng royalty-free, với các điều kiện sau phải tuân thủ:
    1. Giữ DLL trong thư mục app (hiện đặt trong `src-tauri/resources/` — đúng, **không** cài vào system path).
    2. Include bản quyền NDI — file `Processing.NDI.Lib.Licenses.txt` đã đi kèm trong `resources/`.
    3. **Chưa làm (TODO trước khi phát hành):** khi có UI chọn/dùng NDI, phải đặt link tới `https://ndi.video/` gần nơi dùng NDI + statement "NDI® is a registered trademark of Vizrt NDI AB".
    4. Không sửa/short/reverse-engineer SDK; khi phát hành bản production phải dùng SDK < 30 ngày tuổi nếu có.
  - **Kết luận:** license **cho phép** mô hình phân phối hiện tại (DLL nằm trong bundle app + Licenses.txt đi kèm), nhưng cần hoàn thành mục 3 ở trên trước khi phân phối/bán. Không chặn việc phát triển NDI tiếp.

---

## 7. Nguyên tắc chung khi mở rộng thêm module native trong tương lai

1. **Đo trước khi sửa** — không đoán nguyên nhân, luôn có số liệu (production time ở C++ VÀ end-to-end bao gồm IPC + draw) trước khi chọn hướng sửa.
2. **Ưu tiên Rust thuần** — chỉ xuống C++ khi có lý do cụ thể không thể tránh (xem Mục 2).
3. **Giữ đường lùi (fallback)** cho mọi thay đổi lớn về kiến trúc, không xóa đường cũ cho tới khi đường mới ổn định trên nhiều máy, không chỉ máy dev.
4. **Mỗi bug hiệu năng đã sửa nên có 1 test/benchmark tự động tương ứng**, để tránh lặp lại (ví dụ: test đảm bảo không có ai vô tình quay lại gửi RGBA thô qua IPC thay vì keyed format).
5. **Giới hạn nền tảng hỗ trợ** theo đúng nhu cầu thực tế hiện tại (ví dụ nếu ban đầu chỉ nhắm Windows, chưa vội mở rộng C++/wgpu cho macOS/Linux) để giảm tải bảo trì cho 1 người.
6. **Cập nhật file này** mỗi khi có quyết định kiến trúc mới — không để quyết định chỉ tồn tại trong lịch sử chat với AI agent.

---

## 8. Changelog kiến trúc

| Ngày | Thay đổi |
|---|---|
| 2026-08-15 | 7.1 Auto-save: persist `live` đã có (Rust, mọi mutation) — bổ sung **atomic write** (tmp + MoveFileExW) + load-fallback tmp; persist `activePlaylistId` qua Zustand persist (localStorage) |
| 2026-08-15 | Track 3 — hybrid `<video>` + WebGPU external texture: hiển thị đúng độ phân giải gốc (1080p/4K) |
| 2026-08-15 | Sửa giật preview/output: khi không chroma hiển thị `<video>` trực tiếp (bỏ WebGPU khỏi đường phát thường); chroma vẫn dùng WebGPU |
| 2026-08-15 | Bỏ `--autoplay-policy` (gây WebView2 env init fail) + thêm `crossOrigin="anonymous"` cho `<video>` |
| 2026-08-15 | Media tab chống lag: lazy-load thumbnail (IntersectionObserver), content-visibility, preload="metadata" |
| 2026-08-15 | Fix preview co khi phát nhạc nền: `.preview-canvas { flex:none; flex-shrink:0 }`, `.live-preview { overflow-y:auto }` |
| 2026-08-19 | **A3 — Xác nhận Track 2/Track 3**: cả 2 đều cần giữ song song — Track 3 (hybrid `<video>`) là đường chính, Track 2 (Rust decode → NV12 → WebGPU) là fallback khi RVFC thiếu hoặc `<video>` không load được; thêm mục 5.2 ghi rõ bảng quyết định runtime |
| 2026-08-19 | **A4 — Audit Tauri event system**: KHÔNG có dữ liệu tần suất cao chạy qua `emit`/`listen`. Video frame đi qua custom protocol `frames://` (fetch, không qua event system); clock sync là `setInterval` phía frontend (`Date.now()`); SSE 50ms `/api/v1/events` thuộc companion server (HTTP riêng, không phải Tauri event). Mọi `emit` còn lại (`live-update`, `output-refresh`, `windows-update`, `settings-update`, `templates-updated`) đều là state notification tần suất thấp theo thao tác người dùng. Kết luận: không cần tách channel — không đổi code |
| 2026-08-19 | **A2 — NDI auto-pump**: decode loop tự bơm RGBA vào NDI sender khi NDI output bật (theo applied target của Output window), không cần `ndi_output_send_frame` tay; thêm `fill_frame_rgba_and_jpeg` (decode 1 lần cho cả NDI + JPEG), sink NDI vào `PlayerManager.set_ndi_sink`, `AppState.ndi` → `Arc<NdiOutput>`, counter `frames_sent` |
| 2026-08-19 | Fix crash NDI @1080p: `data_size_in_bytes` và `line_stride_in_bytes` là **cùng union member** trong `NDIlib_video_frame_v2_t` — ghi `data_size` đè stride → SDK đọc hàng ở offset 8MB; chỉ set stride |
| [Điền ngày] | Thêm Video Engine (FFmpeg) + NDI Output (C++ core qua cxx) |
| [Điền ngày] | Đổi RGBA thô → keyed format (JPEG màu + alpha mask) để giảm chi phí IPC |
| [Điền ngày] | Gỡ StrictMode ở các cửa sổ NativeVideo, sửa lỗi giật chớp lúc khởi động |
| [Điền ngày] | Đổi encoder JPEG sang libjpeg-turbo (SIMD) |
| [Điền ngày] | Bắt đầu Track 2 — GPU pipeline (wgpu) cho Output window, mục tiêu 4K |
