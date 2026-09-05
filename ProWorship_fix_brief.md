# Brief sửa lỗi/cải thiện — ProWorship

Bối cảnh: đây là app trình chiếu thờ phượng (Tauri v2 + Rust backend + React/TS frontend,
~22.5k dòng frontend, ~9.2k dòng Rust, có module C++ riêng cho NDI/video). Dưới đây là các
việc cần làm theo mức độ ưu tiên, dựa trên review code thực tế của repo.

Hãy làm từng mục theo thứ tự, mỗi mục commit riêng, không gộp nhiều thay đổi không liên quan
vào một commit. Sau mỗi mục, chạy `tsc --noEmit` (frontend) và `cargo check` (backend) để đảm
bảo không phá vỡ build.

---

## Ưu tiên cao

### 1. Debounce ghi đĩa (`src-tauri/src/state.rs`)
`save_to_disk()` hiện được gọi đồng bộ ngay sau mỗi lệnh thay đổi state (khoảng 50 điểm gọi
rải rác trong `src-tauri/src/commands/*.rs`). Với thao tác gõ nhanh liên tục (sửa lyric trong
SongEditor, kéo-thả playlist) sẽ serialize + ghi file JSON toàn bộ app data mỗi lần — có thể
gây giật trên máy cấu hình thấp (RAM 4-8GB, đúng mục tiêu phần cứng ghi trong tài liệu thiết kế).

**Yêu cầu:**
- Thêm cơ chế debounce/coalesce cho `save_to_disk` (ví dụ: đánh dấu "dirty" + spawn một task
  nền ghi đĩa mỗi ~500ms-1s nếu có thay đổi, thay vì ghi ngay lập tức mỗi lệnh).
- Vẫn phải đảm bảo ghi ngay lập tức (flush) khi app đóng (`on_window_event` / tauri exit hook)
  để không mất dữ liệu.
- Giữ nguyên cơ chế atomic write hiện tại (`.tmp` + rename) — không thay đổi phần đó, nó đã ổn.
- Viết test cho việc: nhiều lệnh gọi liên tiếp trong <500ms chỉ dẫn tới 1 lần ghi đĩa thực sự.

### 2. Test coverage quá mỏng
Hiện chỉ có 2 file test frontend (`tests/autofit.test.ts`, `tests/nativeVideoRegressions.test.ts`)
cho ~21.5k dòng, và test Rust chỉ có 1 test nhỏ trong `state.rs`.

**Yêu cầu — bổ sung test cho các phần rủi ro cao trước:**
- `src-tauri/src/state.rs`: test load/save round-trip với dữ liệu thật (songs, playlists,
  settings), test trường hợp file JSON bị corrupt/thiếu field (đảm bảo `#[serde(default)]`
  hoạt động đúng, không panic).
- `src/lib/obs.ts`: test xử lý các mã lỗi kết nối (4007, 4009, 4006, 1006) và luồng
  auth SHA-256 (có thể mock `crypto.subtle` và `WebSocket`).
- `src/lib/live.ts`: test logic tính `next_text`/`next_label` khi "Go Live" — đây là logic
  nghiệp vụ lõi, sai sẽ ảnh hưởng trực tiếp Stage Display lúc vận hành thật.
- Command `advance_live` (điều hướng slide bằng phím tắt) trong Rust: test các trường hợp biên
  (hết slide trong bài → nhảy playlist item kế; hết playlist → dừng).

### 3. Xác minh mức tích hợp NDI/C++ core
`src-tauri/cpp/src/ndi_output.cpp` và `video_engine.cpp` tồn tại cùng `src-tauri/src/native/
bridge.rs` (83 dòng) và `player.rs` (445 dòng), nhưng cần làm rõ:
- FFI bridge đã gọi được đầy đủ NDI output từ Rust chưa, hay chỉ là khung sườn?
- Nếu chưa hoàn chỉnh: hoàn thiện `bridge.rs` để expose ít nhất 1 command Tauri
  bật/tắt NDI output thực sự chạy được, có test integration (dù chỉ smoke test).
- Nếu đã hoàn chỉnh: thêm comment/doc rõ ràng trong `bridge.rs` mô tả luồng dữ liệu
  Rust → C++ → NDI SDK, để tránh nhầm lẫn cho người maintain sau.

---

## Ưu tiên trung bình

### 4. CSS thuần không có convention rõ ràng
`src/styles/global.css` (~5500+ dòng) không dùng framework, không rõ có theo BEM/CSS Modules
hay biến CSS thống nhất không.

**Yêu cầu:**
- Audit `global.css`: liệt kê các class trùng lặp/không dùng (dead CSS).
- Chuẩn hoá màu sắc/spacing thành CSS custom properties (`:root { --color-... }`) nếu chưa có,
  áp dụng nhất quán cho `output.css`, `stage.css`, `template-editor.css`, `splash.css`.
- Không cần đổi sang CSS Modules/Tailwind ngay — chỉ cần tài liệu hoá convention hiện tại
  trong một file `src/styles/README.md` để người sau follow đúng.

### 5. Đồng bộ tài liệu thiết kế vs thực thi
Tài liệu `_design_extract.txt` (bản thiết kế 57 trang) đề xuất SQLite + C++/Skia/bgfx render
engine, nhưng thực thi hiện tại dùng JSON file (Mutex in-memory) + render bằng Tauri webview
(React/CSS), không phải native render engine riêng.

**Yêu cầu:**
- Cập nhật `README.md` (phần kiến trúc) để phản ánh đúng trạng thái hiện tại, tránh gây hiểu
  nhầm cho contributor mới đọc tài liệu thiết kế gốc rồi tưởng app đã dùng SQLite/C++ render.
- Ghi rõ trong README: JSON+Mutex là quyết định tạm thời, ngưỡng dữ liệu nào (số bài hát ước
  tính) thì nên migrate sang SQLite (`tauri-plugin-sql`, API `lib/api.ts` giữ nguyên interface
  theo đúng note đã có sẵn trong README).

---

## Ưu tiên thấp / theo dõi

### 6. Kiểm tra hiệu năng ghi settings companion password
Trong `state.rs`, hàm `ensure_companion_password` sinh mã 6 số từ timestamp XOR — không phải
lỗ hổng bảo mật nghiêm trọng (đây là PIN kết nối LAN nội bộ cho remote control, không phải mật
khẩu tài khoản), nhưng nên xem lại có đủ ngẫu nhiên không nếu dùng cho mục đích xác thực quan
trọng hơn trong tương lai (ví dụ dùng `rand` crate thay vì timestamp-based).

### 7. Rà soát lock ordering trong `AppState`
`AppState` có nhiều `Mutex` riêng biệt cho từng field (songs, media, playlists, settings...).
Nếu một command nào đó lock nhiều field cùng lúc theo thứ tự không nhất quán giữa các hàm khác
nhau, có nguy cơ deadlock khi app lớn dần và nhiều command hơn được thêm vào. Nên rà soát và
ghi quy ước thứ tự lock (nếu có command nào lock >1 mutex) vào comment đầu `state.rs`.

---

## Không cần làm ngay (chỉ ghi chú)
- Không cần đổi kiến trúc JSON→SQLite ngay trừ khi có báo cáo hiệu năng thực tế cho thấy
  cần thiết — tránh over-engineering khi chưa có dữ liệu thực từ người dùng thật.
- Không cần viết lại CSS sang framework mới — rủi ro regression UI cao hơn lợi ích.
