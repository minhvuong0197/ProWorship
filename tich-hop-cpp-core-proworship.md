# SPEC: Tích hợp C++ Core vào ProWorship (Tauri v2 + Rust)

> Tài liệu này dùng làm prompt/chỉ thị đầu vào cho AI coding agent (opencode, DeepSeek, v.v.) để thực thi việc tích hợp một lõi xử lý viết bằng C++ vào backend Rust của ứng dụng Tauri v2 hiện có. Agent cần đọc toàn bộ tài liệu trước khi bắt đầu, xác nhận hiểu đúng cấu trúc dự án, rồi mới thực thi từng bước.

---

## 1. Bối cảnh dự án

**Tên phần mềm:** ProWorship — phần mềm trình chiếu lời bài hát / Kinh Thánh / media cho buổi thờ phượng (tương tự ProPresenter).

**Stack hiện tại:**
- Desktop shell: **Tauri v2** (Rust backend + WebView frontend)
- Backend: Rust (Edition 2021), dùng `tauri`, `serde`/`serde_json`, `tauri-plugin-dialog`, `tauri-plugin-fs`, `tiny_http`, `qrcode`, `quick-xml`, `flate2`
- Frontend: TypeScript, React 18, Zustand, Vite (đa entry point: Control, Output, Stage, Splash, Template Editor)
- Kiến trúc multi-window với Live Sync qua Tauri Events + Zustand

**Mục tiêu của task này:** Thêm một **C++ core** (module xử lý hiệu năng cao) được gọi từ Rust backend thông qua FFI an toàn, phục vụ cho việc xử lý video/audio/hình ảnh mà Rust thuần hoặc thư viện Rust không đáp ứng đủ hiệu năng hoặc chưa có sẵn (ví dụ: decode video nhanh, xử lý audio real-time độ trễ thấp, các thuật toán xử lý ảnh).

---

## 2. Yêu cầu kỹ thuật bắt buộc

### 2.1 Công cụ FFI
- **Bắt buộc dùng crate [`cxx`](https://cxx.rs/)** (không dùng `bindgen` thô, không dùng `extern "C"` tay không an toàn) để đảm bảo type-safety hai chiều giữa Rust và C++.
- Không được thêm bất kỳ `unsafe` block nào ngoài phạm vi mà `cxx` yêu cầu.

### 2.2 Cấu trúc thư mục (bắt buộc tuân theo, không tự ý đổi tên)

```
src-tauri/
├── src/
│   ├── main.rs
│   ├── commands/              # các Tauri command hiện có — KHÔNG xóa/sửa logic cũ
│   └── native/
│       ├── mod.rs
│       └── bridge.rs          # định nghĩa #[cxx::bridge]
├── cpp/
│   ├── include/
│   │   └── core.h
│   └── src/
│       └── core.cpp
├── build.rs                   # thêm mới hoặc chỉnh sửa nếu đã tồn tại
└── Cargo.toml
```

### 2.3 Cargo.toml — thêm dependency (không xóa dependency cũ)
```toml
[build-dependencies]
cxx-build = "1"

[dependencies]
cxx = "1"
```

### 2.4 build.rs
```rust
fn main() {
    cxx_build::bridge("src/native/bridge.rs")
        .file("cpp/src/core.cpp")
        .include("cpp/include")
        .flag_if_supported("-std=c++17")
        .compile("proworship_core");

    println!("cargo:rerun-if-changed=src/native/bridge.rs");
    println!("cargo:rerun-if-changed=cpp/src/core.cpp");
    println!("cargo:rerun-if-changed=cpp/include/core.h");

    // Nếu build.rs đã tồn tại với nội dung khác (ví dụ cấu hình tauri-build),
    // PHẢI giữ nguyên phần đó và chỉ thêm đoạn cxx_build vào, không ghi đè toàn bộ file.
}
```

### 2.5 Khung bridge mẫu (`src/native/bridge.rs`)
```rust
#[cxx::bridge]
mod ffi {
    unsafe extern "C++" {
        include!("core.h");

        type VideoDecoder;

        fn new_decoder(path: &str) -> UniquePtr<VideoDecoder>;
        fn decode_frame(self: Pin<&mut VideoDecoder>) -> Vec<u8>;
        fn get_width(self: &VideoDecoder) -> i32;
        fn get_height(self: &VideoDecoder) -> i32;
    }
}

pub use ffi::*;
```
> Agent cần thay tên hàm/struct theo đúng module thực tế sẽ triển khai (xem mục 3), không copy nguyên mẫu này vào production nếu tên không khớp nhu cầu thật.

### 2.6 Gọi từ Tauri command (ví dụ)
```rust
use crate::native::bridge;

#[tauri::command]
fn decode_video_frame(path: String) -> Vec<u8> {
    let mut decoder = bridge::new_decoder(&path);
    decoder.pin_mut().decode_frame()
}
```
Command mới phải được đăng ký trong `invoke_handler` ở `main.rs` theo đúng cách các command hiện có đang được đăng ký — KHÔNG tạo cơ chế đăng ký song song.

---

## 3. Phạm vi chức năng cần triển khai trong C++ core

> **Nguyên tắc thu hẹp phạm vi:** C++ chỉ được dùng cho những phần **bắt buộc phải native** (không có lựa chọn Rust thuần khả thi hoặc hiệu năng Rust không đáp ứng đủ). Các chức năng khác (audio, ảnh, font) triển khai bằng **crate Rust thuần** — xem Phụ lục A. Việc này giúp giảm rủi ro về build đa nền tảng, bản quyền, và an toàn bộ nhớ đã phân tích trước đó, đồng thời vẫn đạt được lợi ích hiệu năng ở đúng chỗ cần thiết.

C++ core trong phạm vi task này **chỉ gồm 2 module**:

### 3.1 Video Engine (`cpp/src/video_engine.cpp`)
- Decode video (MP4, WebM, MOV) qua FFmpeg — trả frame RGBA cho canvas Output
- Hardware acceleration (NVDEC / VideoToolbox / VAAPI) nếu máy có GPU hỗ trợ
- Loop video nền (background video cho slide) không giật khung hình, không rò rỉ bộ nhớ khi lặp dài hạn
- Chroma key (xóa phông xanh/lục) real-time cho video overlay
- Lý do bắt buộc dùng C++: HTML5 `<video>`/Canvas API của WebView không đủ hiệu năng khi phát nhiều lớp video độ phân giải cao đồng thời (background video + overlay); FFmpeg là thư viện C/C++ chuẩn công nghiệp cho việc này, chưa có crate Rust nào đạt hiệu năng tương đương khi wrap trực tiếp libavcodec.

### 3.2 NDI Output (`cpp/src/ndi_output.cpp`)
- Gửi hình ảnh từ Output window qua mạng LAN cho phần mềm khác (vMix, OBS Studio, các switcher hỗ trợ NDI)
- Lý do bắt buộc dùng C++: NDI SDK của NewTek/Vizrt chỉ phát hành dưới dạng thư viện C/C++, không có binding Rust chính thức đáng tin cậy — bắt buộc phải FFI qua C++.
- ⚠️ Trước khi triển khai, cần tải và đọc kỹ **NDI SDK License Agreement** để xác nhận điều khoản phân phối phù hợp với việc bán/phân phối ProWorship (xem Mục 4).

### Ghi chú triển khai cho Agent
- Mỗi module tương ứng với **một `unsafe extern "C++"` block riêng** trong `src/native/bridge.rs` (hoặc tách file bridge riêng: `video_bridge.rs`, `ndi_bridge.rs`, rồi `include!` chung qua `mod.rs`), để lỗi biên dịch của module này không chặn module kia.
- Thứ tự triển khai đề xuất: **3.1 (Video Engine) trước, 3.2 (NDI Output) sau** — vì Video Engine phục vụ nhu cầu chính (hiển thị media), còn NDI là tính năng mở rộng chỉ cần khi Video Engine đã ổn định.
- Nếu môi trường build chưa có FFmpeg (3.1) hoặc NDI SDK (3.2), agent phải dừng lại và báo cáo rõ cần cài/vendor gì trước khi tiếp tục, không được tự ý mock hoặc bỏ qua chức năng.
- **Không mở rộng thêm module C++ nào khác ngoài 3.1 và 3.2** trừ khi có yêu cầu rõ ràng mới — các nhu cầu audio/ảnh/font đã có giải pháp Rust thuần ở Phụ lục A.

---

## Phụ lục A: Crate Rust thay thế cho các module không cần C++

> Các chức năng dưới đây trước đó được cân nhắc làm C++ nhưng đã xác định **không cần thiết** vì Rust có crate đủ mạnh. Agent nên triển khai các module này (nếu được yêu cầu ở lượt sau) bằng Rust thuần, tích hợp trực tiếp vào `src-tauri/src/`, không qua `cxx` bridge.

| Chức năng | Crate Rust đề xuất | Ghi chú |
|---|---|---|
| Audio mixing, playback, volume ducking | [`cpal`](https://crates.io/crates/cpal) (I/O device layer) + [`rodio`](https://crates.io/crates/rodio) (mixing/playback) | Đủ cho mixing nhiều track, độ trễ chấp nhận được cho ứng dụng thờ phượng (không phải DAW chuyên nghiệp) |
| Waveform / VU meter | Tự tính từ sample buffer của `cpal`, gửi qua Tauri event | Không cần thư viện riêng, chỉ cần FFT nhẹ nếu cần spectrum (`rustfft`) |
| Resize / crop / convert ảnh | [`fast_image_resize`](https://crates.io/crates/fast_image_resize) + [`image`](https://crates.io/crates/image) | Hiệu năng gần với C native nhờ SIMD, đủ nhanh cho thumbnail/background |
| Blur, overlay, compositing ảnh | [`image`](https://crates.io/crates/image) crate, hoặc GPU compositing qua [`wgpu`](https://crates.io/crates/wgpu) nếu cần real-time | `wgpu` cũng dùng được cho video frame compositing nếu Video Engine (3.1) cần GPU layer ở phía Rust |
| Text/font rendering (kể cả tiếng Việt, ligature) | [`cosmic-text`](https://crates.io/crates/cosmic-text) (layout + shaping) dựa trên [`rustybuzz`](https://crates.io/crates/rustybuzz) (port thuần Rust của HarfBuzz) | Xử lý tốt dấu tiếng Việt và ligature phức tạp, không cần bind tới HarfBuzz C++ gốc |
| Frame buffer cache, multi-threaded pipeline | `std::sync::mpsc` / [`crossbeam-channel`](https://crates.io/crates/crossbeam-channel) cho hàng đợi frame giữa decode thread (gọi vào C++ Video Engine) và render thread | Lớp điều phối threading nên nằm ở Rust, không cần viết lại bằng C++ |

Nếu trong quá trình triển khai Video Engine (3.1), agent nhận thấy cần một buffer/threading layer đặc thù mà các crate trên không đáp ứng được, agent phải **báo cáo lại cụ thể lý do** trước khi tự ý viết thêm module C++ mới ngoài phạm vi Mục 3.

---

## 4. Ràng buộc build đa nền tảng

| Nền tảng | Compiler yêu cầu |
|---|---|
| Windows | MSVC (Visual Studio Build Tools) |
| macOS | Clang (Xcode Command Line Tools) |
| Linux | GCC hoặc Clang |

- Nếu C++ core cần thư viện ngoài (FFmpeg, OpenCV...), **phải vendor/static-link** hoặc dùng `vcpkg`/`conan`, không được yêu cầu người dùng cuối cài thêm runtime.
- Agent phải kiểm tra `tauri.conf.json` và pipeline CI/CD (nếu có, ví dụ GitHub Actions) để đảm bảo bước build C++ được thêm vào đúng chỗ cho cả 3 nền tảng, không chỉ chạy được trên máy dev hiện tại.

---

## 5. Quy tắc thực thi cho AI Agent

1. **Đọc toàn bộ mã nguồn hiện có** (`src-tauri/src/`, `Cargo.toml`, `build.rs` nếu có) trước khi sửa bất cứ gì.
2. **Không xóa, không viết đè** lên logic Tauri command, plugin, hoặc cấu hình hiện có — chỉ bổ sung.
3. Sau khi thêm code, chạy thử build (`cargo build` trong `src-tauri/`) và báo cáo lỗi nếu có, không được để lại code không compile.
4. Nếu phát hiện xung đột tên module/hàm với code hiện có, phải báo lại thay vì tự ý đổi tên code cũ.
5. Viết code C++ theo chuẩn C++17, có comment ngắn gọn giải thích mục đích từng hàm public.
6. Sau khi hoàn tất, liệt kê rõ: các file đã tạo mới, các file đã chỉnh sửa (kèm diff tóm tắt), và các bước người dùng cần làm thủ công (nếu có, ví dụ cài compiler, cài vcpkg).

---

## 6. Việc cần làm tiếp theo (điền trước khi gửi)

- [x] Xác nhận chức năng cụ thể ở Mục 3 — đã thu hẹp còn 2 module C++: Video Engine (3.1) + NDI Output (3.2)
- [x] Xác nhận hướng xử lý cho các chức năng còn lại (audio, ảnh, font) — dùng crate Rust thuần, xem Phụ lục A
- [x] Xác nhận môi trường build đã có FFmpeg (dev libs: libavcodec, libavformat, libavutil, libswscale) — đã cài qua vcpkg: `D:\vcpkg\installed\x64-windows-static-md` (static libs + dynamic CRT /MD, FFmpeg 9.0)
- [x] Tải và đọc kỹ NDI SDK License Agreement, xác nhận điều khoản phù hợp với việc phân phối/bán ProWorship trước khi triển khai module 3.2 — đã chuyển sang NDI SDK chính thức (NDI 6 SDK) tại `C:\Program Files\NDI\NDI 6 SDK\`, license PDF: `C:\Program Files\NDI\NDI 6 SDK\NDI SDK License Agreement.pdf`; agent đã build + test pass với SDK này. Người dùng đã xác nhận ProWorship phân phối theo mô hình mã nguồn mở, điều khoản license NDI SDK phù hợp cho việc phân phối mã nguồn mở
- [x] Cung cấp đường dẫn thực tế của `src-tauri/` — thư mục `src-tauri/` trong repo ProWorship
- [x] Xác nhận có muốn agent làm cả 2 module (3.1 + 3.2) trong một lượt — đã làm cả 2, build + test pass
