# Brief thực thi cho Opencode (Deepseek v4 flash) — ProWorship

Bối cảnh: Tauri v2 (Rust backend) + React/TypeScript frontend + C++ core (FFmpeg decode,
NDI output) nối qua `cxx`. ~9.300 dòng Rust, ~16.200 dòng TS/TSX, ~7.100 dòng CSS.
Repo đã có sẵn `ARCHITECTURE.md`, `README.md`, `ProWorship_fix_brief.md`,
`6-huong-giam-rui-ro.md` — đọc cả 4 file này trước khi bắt đầu, đừng lặp lại hướng đã
thử và loại bỏ.

## Quy tắc bắt buộc trong suốt phiên làm việc

1. Làm từng mục theo đúng thứ tự dưới đây, **mỗi mục một commit riêng**, không gộp
   nhiều thay đổi không liên quan vào một commit.
2. Sau **mỗi mục**, chạy `tsc --noEmit` (frontend) và `cargo check` (backend trong
   `src-tauri/`) — không sang mục tiếp theo nếu build đỏ.
3. Không đoán nguyên nhân hiệu năng. Nếu một thay đổi liên quan hiệu năng, đo trước/sau
   (số liệu cụ thể) rồi mới quyết định, và ghi số liệu đó vào commit message.
4. Nếu thay đổi động chạm tới kiến trúc (đổi thư viện, đổi pipeline, đổi format truyền
   dữ liệu), **cập nhật `ARCHITECTURE.md`** (mục Changelog kiến trúc ở cuối file) trong
   cùng commit — không để quyết định chỉ nằm trong log chat với agent.
5. Giữ đường lùi (fallback) cho mọi thay đổi kiến trúc lớn — không xoá code/pipeline cũ
   đang chạy ổn định cho tới khi bản mới được xác nhận ổn định trên nhiều máy.
6. **KHÔNG được tự ý làm** (đã cân nhắc và quyết định giữ nguyên, xem lý do ở cuối file):
   - Không migrate JSON → SQLite trừ khi có số liệu thực tế cho thấy đã vượt ~500-1000
     bài hát hoặc ghi đĩa gây giật dù đã debounce.
   - Không viết lại render engine sang C++/Skia/bgfx trừ khi Track 3 (hybrid `<video>` +
     WebGPU) đã triển khai rộng trên nhiều máy thật và vẫn còn giật/lag không tối ưu được
     thêm trong WebView.

---

## GIAI ĐOẠN A — Đóng rủi ro pháp lý & ổn định nền tảng hiện có

### A1. Xác nhận license NDI SDK
- Đọc kỹ NDI SDK License Agreement (Vizrt/NewTek).
- Xác nhận bản `Processing.NDI.Lib.x64.dll` dùng trong build production tải từ nguồn
  chính thức, không mượn từ dự án khác.
- Cập nhật mục 6 của `ARCHITECTURE.md` — thay dòng `[CẦN CẬP NHẬT...]` bằng kết quả xác
  nhận thật.
- Nếu license không cho phép phân phối như hiện tại: dừng lại, báo cáo, không tự ý code
  tiếp phần NDI.

### A2. Tự động bơm frame vào NDI sender
- File liên quan: `src-tauri/src/native/ndi.rs`, `src-tauri/src/commands/native.rs`,
  `src-tauri/src/native/player.rs`.
- Hiện tại phải gọi `ndi_output_send_frame` thủ công (ghi trong README, mục Phase 5+).
- Yêu cầu: khi NDI output đang bật, tự động lấy frame từ video player/output đang chạy
  (theo đúng target resolution của Output window, xem mục 4.3 `ARCHITECTURE.md`) và gọi
  `send_frame` mà không cần thao tác tay.
- Viết ít nhất 1 smoke test integration xác nhận luồng end-to-end chạy được.

### A3. Hợp nhất Track 2 (wgpu Rust decode) và Track 3 (hybrid `<video>` + WebGPU)
- Đọc mục 5 và 5.1 `ARCHITECTURE.md`.
- Xác nhận: Track 3 (2026-08-15) đã thay thế hoàn toàn Track 2, hay cả 2 vẫn cần giữ
  song song cho mục đích khác nhau?
- Nếu Track 2 đã lỗi thời: xoá code không dùng, cập nhật `ARCHITECTURE.md` ghi rõ lý do
  loại bỏ (không xoá âm thầm).
- Nếu vẫn cần cả 2: ghi rõ trong `ARCHITECTURE.md` khi nào dùng track nào, để người sau
  không nhầm lẫn.

### A4. Tách kênh dữ liệu tần suất cao khỏi Tauri event system
- Rà soát: dữ liệu tần suất cao (frame video, clock đồng bộ) hiện có đang đi qua Tauri
  event (`emit`/`listen`) không? Nếu có, đây là điểm nghẽn tiềm ẩn (xem mục 7.4
  `6-huong-giam-rui-ro.md`).
- Nếu phát hiện events đang bị dùng cho dữ liệu tần suất cao gây nghẽn (đo cụ thể): tách
  sang `crossbeam-channel`/`tokio::sync`, giữ Tauri event cho thông báo trạng thái tần
  suất thấp (`live-update` và tương tự).
- Nếu đo không thấy nghẽn: không đổi, chỉ ghi chú kết quả đo vào `ARCHITECTURE.md`.

### A5. Mở rộng test biên cho `output.rs` / `server.rs`
- Đã có mẫu tốt: `plan_advance` trong `src-tauri/src/commands/output.rs` (10 test case,
  tách logic thuần khỏi side-effect Tauri command).
- Áp dụng đúng pattern này cho các hàm public còn lại trong `output.rs` (79 hàm,
  1.450 dòng) chưa có test — ưu tiên: `goto_slide`, `goto_playlist_entry`,
  `auto_advance_service`, `apply_template_to_slide`.
- `server.rs` (2.508 dòng, companion server LAN): thêm test cho luồng xác thực
  `X-Church-Token` (PIN đúng/sai/rỗng) và các route `/api/companion/*`.

---

## GIAI ĐOẠN B — Củng cố độ tin cậy

### B1. So sánh PIN companion server bằng constant-time
- File: `src-tauri/src/server.rs`, đoạn so khớp `X-Church-Token` (hiện dùng `==` chuỗi
  thường).
- Đổi sang so sánh constant-time (ví dụ dùng crate `subtle`, hoặc tự viết hàm so sánh
  không rẽ nhánh sớm).
- Viết test xác nhận hành vi không đổi (đúng PIN → pass, sai → fail).

### B2. Ghi tài liệu vận hành: companion server chỉ dùng LAN
- Thêm một đoạn cảnh báo rõ trong `README.md` (mục companion/remote control): không
  port-forward port này ra Internet, vì `Access-Control-Allow-Origin: *` được set toàn
  cục và xác thực chỉ là PIN 6 số.

---

## GIAI ĐOẠN C — Dọn nợ kỹ thuật (song song, không chặn tiến độ tính năng)

### C1. Chuẩn hoá `src/styles/global.css` (~6.300 dòng)
- Audit: liệt kê class trùng lặp/không dùng (dead CSS) — có thể dùng công cụ như
  `purgecss --css src/styles/*.css --content src/**/*.tsx --output ...` chỉ để LIỆT KÊ,
  không tự động xoá hàng loạt.
- Chuẩn hoá màu sắc/spacing thành CSS custom properties (`:root { --color-...; --space-...; }`),
  áp dụng nhất quán cho `global.css`, `output.css`, `stage.css`, `template-editor.css`,
  `splash.css`.
- Viết `src/styles/README.md` mô tả convention để người sau follow đúng.
- Không đổi sang CSS Modules/Tailwind — rủi ro regression UI cao hơn lợi ích, không làm.

### C2. Tách companion HTML ra khỏi `server.rs`
- Hiện `companion_html()` trong `server.rs` trả về một string literal HTML/CSS/JS khổng
  lồ nhúng trong Rust.
- Chuyển nội dung này ra file tĩnh riêng (ví dụ `src-tauri/resources/companion/index.html`),
  Rust chỉ đọc và phục vụ file qua `tiny_http`, không giữ UI logic trong chuỗi Rust.
- Xác nhận route `/`, `/index.html` vẫn hoạt động đúng sau khi tách.

### C3. Audit Win32 API trực tiếp trong C++ core
- Rà `src-tauri/cpp/src/video_engine.cpp` và `ndi_output.cpp` xem có gọi Win32 API trực
  tiếp không (ngoài phần bắt buộc qua `windows-sys` ở Rust).
- Chỉ cần liệt kê và ghi chú — **không tự ý sửa để hỗ trợ macOS/Linux** trừ khi có yêu
  cầu rõ ràng (đúng mục 6 `6-huong-giam-rui-ro.md`: giới hạn nền tảng theo nhu cầu thực
  tế, hiện ưu tiên Windows).

---

## GIAI ĐOẠN D — Chỉ làm khi có yêu cầu thực tế rõ ràng (không tự ý bắt đầu)

- Auto-updater (Tauri plugin update) — chỉ update khi khởi động lại hoặc người dùng xác
  nhận, không update giữa lúc app đang chạy buổi lễ.
- Migrate SQLite — chỉ khi số liệu thực tế vượt ngưỡng đã định (xem "Quy tắc bắt buộc"
  mục 6 ở trên).
- MIDI/OSC/DMX (`midir`, `rosc`) — chỉ khi có khách hàng yêu cầu cụ thể.

---

## Vì sao KHÔNG migrate SQLite / KHÔNG viết lại bằng Skia ngay (tham khảo, không cần làm)

Tài liệu thiết kế gốc (`_design_extract.txt`, 57 trang) đề xuất SQLite + C++/Skia/bgfx,
nhưng đây là bản thiết kế lý thuyết viết **trước khi có code** — lúc đó chưa ai biết
WebGPU trong WebView2 có đủ mượt không nên đề xuất an toàn nhất trên giấy là native hẳn.

Sau khi thực thi và đo (xem mục 4 và 5.1 `ARCHITECTURE.md`): Track 3 (hybrid `<video>` +
WebGPU) đã xác nhận mượt ở cả 1080p và 4K — mục tiêu latency mà thiết kế gốc lo ngại đã
đạt được trong WebView, với chi phí thấp hơn nhiều lần so với viết lại toàn bộ 61
component React bằng Skia (Skia chỉ vẽ pixel, không có layout/state engine — phải tự
dựng lại từ đầu). Tương tự, mọi vấn đề hiệu năng đo được trong dự án đều nằm ở video
pipeline, không phải ở JSON/Mutex — nên SQLite chưa phải việc cần ưu tiên.

**Nguyên tắc áp dụng**: chỉ đổi kiến trúc lưu trữ/render khi có số liệu đo thực tế cho
thấy giải pháp hiện tại không đáp ứng được, không đổi vì "về lý thuyết nó tốt hơn".
