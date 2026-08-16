Yêu cầu áp dụng các nguyên tắc sau vào toàn bộ codebase ProWorshipCast (Rust + C++ + React), để giảm rủi ro và dễ bảo trì lâu dài. Không cần làm hết trong 1 lượt — đọc toàn bộ trước, xác nhận hiểu, rồi đề xuất thứ tự thực hiện hợp lý.

1. THU HẸP VÀ NIÊM PHONG PHẦN C++
- C++ chỉ được chứa phần bắt buộc phải native (nhận input, trả output) — không chứa business logic. Toàn bộ điều phối (khi nào gọi, gọi với tham số gì) phải nằm ở Rust.
- Mọi con trỏ C++ phải wrap trong UniquePtr/RAII qua cxx — không tự new/delete tay ở boundary.
- Trước khi thêm bất kỳ dependency C++ mới nào trong tương lai, phải tự kiểm tra crates.io xem có crate Rust tương đương không, và báo cáo lý do nếu vẫn chọn C++.
- Rà soát lại code hiện tại xem có phần nào ở C++ có thể chuyển về Rust thuần mà không mất hiệu năng đáng kể không, báo cáo danh sách (không tự ý chuyển).

2. THÊM TEST TỰ ĐỘNG CHO MỖI BUG HIỆU NĂNG ĐÃ SỬA
- Với mỗi bug hiệu năng đã sửa (RGBA qua IPC, StrictMode double-mount, Preview decode phí tài nguyên, JPEG encoder chậm), viết 1 test hoặc benchmark tự động tương ứng để nếu ai (kể cả AI agent) vô tình sửa lại thành trạng thái cũ, CI/test phải báo lỗi.
- Thêm performance regression test: đo IPC/frame và production fps, có ngưỡng cảnh báo nếu vượt quá mức đã đo được ở bản ổn định gần nhất.

3. GIỮ ĐƯỜNG LÙI (FALLBACK) CHO MỌI THAY ĐỔI KIẾN TRÚC LỚN
- Không xóa code/pipeline cũ đang chạy ổn định cho tới khi pipeline mới được xác nhận chạy ổn định trên nhiều máy, không chỉ máy dev.
- Áp dụng cụ thể cho Track 2 (wgpu): giữ nguyên libjpeg-turbo làm fallback cho máy yếu/không hỗ trợ WebGPU và cho Preview window.

4. TẠO VÀ DUY TRÌ FILE ARCHITECTURE.md
- Đã có file ARCHITECTURE.md ở gốc repo — mỗi khi có quyết định kiến trúc mới (đổi thư viện, đổi pipeline, đổi format truyền dữ liệu...), phải tự cập nhật file này (thêm vào mục Changelog kiến trúc ở cuối file), không chỉ để quyết định nằm trong lịch sử chat.
- Trước khi thực hiện thay đổi kiến trúc lớn, đọc lại ARCHITECTURE.md để tránh lặp lại hướng đã thử và loại bỏ trước đó.

5. LUÔN ĐO TRƯỚC KHI SỬA
- Không đoán nguyên nhân hiệu năng — mọi đề xuất sửa lỗi hiệu năng phải kèm số liệu đo thực tế trước (production time ở C++ VÀ end-to-end bao gồm IPC + draw ở frontend), không chỉ đo 1 phía rồi kết luận.
- Nếu chưa đo được, phải báo cáo rõ đang đoán, không trình bày như đã xác nhận.

6. GIỚI HẠN PHẠM VI NỀN TẢNG THEO NHU CẦU THỰC TẾ
- Xác nhận lại: ProWorshipCast hiện ưu tiên nền tảng nào (mặc định giả sử Windows theo log hiện có). Chưa mở rộng hỗ trợ build C++/wgpu cho macOS/Linux cho tới khi có yêu cầu rõ ràng, để giảm số lượng cấu hình cần test và bảo trì.

7. TÍNH NĂNG TẬN DỤNG ĐÚNG THẾ MẠNH RIÊNG CỦA TỪNG CÔNG NGHỆ
Lưu ý: Remote control qua QR (tiny_http + qrcode) đã làm xong — không làm lại. Dưới đây là các hạng mục còn lại, xếp theo thứ tự ưu tiên ROI (làm cao trước, thấp sau — không bắt buộc làm hết trong 1 lượt).

7.1 Auto-save / persist state (ưu tiên cao nhất — rẻ, giá trị lớn)
- Dùng Zustand persist middleware (hoặc tương đương) để tự động lưu trạng thái Control (project đang mở, slide đang chiếu, vị trí trong bài hát) định kỳ hoặc theo sự kiện thay đổi.
- Mục tiêu: nếu app crash hoặc mất điện giữa buổi lễ, mở lại app phải khôi phục được đúng vị trí đang trình chiếu, không mất tiến trình.
- Rust phía backend: đảm bảo ghi file persist an toàn (atomic write, tránh hỏng file nếu crash giữa lúc ghi).

7.2 Global shortcuts + system tray (ưu tiên cao — rẻ, native, nâng trải nghiệm)
- Dùng plugin Tauri có sẵn cho global shortcut: cho phép next/previous slide bằng phím tắt toàn cục, hoạt động cả khi cửa sổ Control không focus (người vận hành có thể đang nhìn màn hình khác).
- System tray: icon ở khay hệ thống, cho phép ẩn/hiện Control window nhanh, không tắt nhầm app giữa buổi lễ.

7.3 Auto-updater (ưu tiên trung bình)
- Tích hợp plugin update của Tauri, vì máy chạy phần mềm thờ phượng thường ít được IT chăm sóc thường xuyên — cần cơ chế cập nhật tự động, an toàn (không tự ý cập nhật giữa lúc app đang chạy buổi lễ, chỉ update khi khởi động lại hoặc người dùng xác nhận).

7.4 Kênh giao tiếp Control ↔ Output nhất quán hơn (ưu tiên trung bình, thuộc Rust)
- Rà soát lại: dữ liệu tần suất cao (frame video, clock đồng bộ) nên đi qua channel trực tiếp (crossbeam-channel/tokio::sync), tách khỏi Tauri events vốn phù hợp hơn cho thông báo trạng thái tần suất thấp.
- Không bắt buộc đổi ngay nếu hệ thống hiện tại đã ổn định — chỉ áp dụng khi phát hiện events đang bị dùng cho dữ liệu tần suất cao gây nghẽn.

7.5 MIDI / OSC / DMX integration (ưu tiên thấp — chỉ làm nếu có nhu cầu thực tế rõ ràng)
- Dùng crate Rust (midir cho MIDI, rosc cho OSC) để tích hợp điều khiển từ control surface hoặc đồng bộ với hệ thống ánh sáng sân khấu (DMX) nếu khách hàng có nhu cầu.
- Không tự ý làm nếu chưa có yêu cầu cụ thể — hạng mục này tốn công, chỉ nên làm khi biết chắc có người dùng cần.

7.6 Nguyên tắc chung khi thêm tính năng ở mục 7
- Ưu tiên dùng đúng công nghệ đã có sẵn trong stack (Tauri plugin, Rust crate) thay vì tự viết lại hoặc thêm C++ không cần thiết — áp dụng đúng tinh thần mục 1 (thu hẹp C++).
- Mỗi tính năng mới ở mục 7 nên được ghi lại vào ARCHITECTURE.md (mục 4) khi hoàn thành.

Sau khi đọc xong, báo cáo: mục nào (cả nhóm giảm rủi ro 1-6 và nhóm tính năng mới ở mục 7) có thể áp dụng ngay (ít rủi ro), mục nào cần thêm thời gian/thảo luận trước khi làm. Đề xuất thứ tự thực hiện tổng thể hợp lý (không nhất thiết theo đúng thứ tự liệt kê ở trên).
