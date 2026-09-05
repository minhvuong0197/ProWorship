# Pro WorshipCast

## License

ProWorship is available under the Apache License 2.0. Forks and commercial use are
permitted under that license. The copyright holder may also offer separate commercial
licenses, support, services, or proprietary distributions.

Third-party components, including the NDI SDK, FFmpeg builds, fonts, and media assets,
remain subject to their own licenses. See [LICENSE](LICENSE) and the relevant notices
before redistributing a release bundle.

Phần mềm trình chiếu thờ phượng (worship presentation software) — Tauri v2 (Rust) + React/TypeScript.
Kiến trúc mở rộng theo hướng FreeShow / ProPresenter: Song Library, Media Library, Playlist, Live Output đa màn hình.

## Chạy thử (dev)

Yêu cầu: Node.js ≥ 18, Rust stable + `cargo`, Tauri CLI prerequisites cho hệ điều hành của bạn
(xem https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

Cửa sổ **Control** sẽ mở lên. Bấm **"Mở Output"** ở toolbar để mở cửa sổ trình chiếu fullscreen
trên màn hình bạn chọn (ví dụ màn hình projector nối ngoài).

Trong lúc vận hành, có thể điều khiển live ngay cả khi Control không được focus:
`Ctrl+Shift+Right` sang slide kế tiếp, `Ctrl+Shift+Left` quay lại, và `Ctrl+Shift+Space`
để clear output. Icon ProWorship trong system tray cho phép hiện lại Control hoặc thoát app.

## Build bản release

```bash
npm run tauri build
```

> **NDI DLL**: `Processing.NDI.Lib.x64.dll` bị loại khỏi git (license NDI).
> Nếu clone repo trên máy khác, đặt file DLL vào `src-tauri/resources/`
> trước khi `npm run tauri build` — nếu thiếu, build sẽ lỗi và tính năng NDI
> output không chạy (phần video/NDI probe sẽ báo lỗi tạo sender).

## ⚠️ Companion server (Church App / Stage Remote) — chỉ dùng trong LAN

Companion server chạy trên cổng `8500` (mặc định, đổi được trong Cài đặt), lắng nghe
trên **`0.0.0.0`** nên **mọi thiết bị trong mạng cục bộ đều truy cập được**. Nó phục vụ
giao diện Church App (`/`) và Stage Remote (`/stage`) cho phone/máy tính bảng điều khiển
trình chiếu.

> **KHÔNG port-forward cổng này ra Internet.** `Access-Control-Allow-Origin: *` được set
> toàn cục và xác thực chỉ là **PIN 6 số** gửi qua header `X-Church-Token` — không đủ
> mạnh để bảo vệ một dịch vụ lộ ra ngoài mạng công cộng. Nếu cần điều khiển từ xa qua
> Internet, hãy đặt app sau một proxy/ứng dụng VPN có xác thực riêng.

## Kiến trúc

```
src-tauri/            Rust backend (Tauri v2)
  src/
    models/            Song, Slide, MediaItem, AudioItem, Template, Playlist, LiveState, AppSettings,
                       Prop, Overlay, BibleVerse, EditShow...
    state.rs            AppState (in-memory, Mutex) + persistence (JSON trong app data dir)
                       ghi đĩa debounce 500ms + flush khi thoát (state::SaveCoalescer)
    commands/           songs, media, audio, playlists, templates, settings, output, props,
                       overlays, edit, bible, native (video/NDI probe + NDI output)
    native/             bridge.rs (cxx FFI → C++), player.rs (video player nền), ndi.rs (NDI output)
    cpp/                video_engine.cpp (FFmpeg decode), ndi_output.cpp (NDI SDK) — core C++
    bible.rs            Load/search Kinh Thánh, template theo version, advance selection
    interlinear.rs      Interlinear + Strong (assets/bible/ilg/)
    server.rs           Companion server (LAN, PIN) cho remote control
    lib.rs / main.rs     Đăng ký plugin, state, commands

src/                  React frontend
  store/useAppStore.ts  Zustand store trung tâm — gọi Rust commands qua lib/api.ts
  lib/api.ts             Wrapper cho tauri invoke() + convertFileSrc cho media
  lib/live.ts            Helper go-live: resolve template style, dựng LiveState cho song slide
  lib/obs.ts             OBS WebSocket v5 client (tự viết, xác thực SHA-256)
  components/            Toolbar, SongEditor, MediaLibrary, AudioLibrary, Settings, Playlist,
                       LivePreview, Output, Stage, BiblePanel, Edit, Props, Overlays, OBS, ...
  windows/*-main.tsx     Entry point riêng cho từng window (multi-entry qua Vite)
```

**Render engine**: giao diện render bằng **Tauri WebView (React/CSS)** — *không* dùng native
render engine riêng (Skia/bgfx như bản thiết kế gốc). Phần C++ chỉ đảm nhiệm 2 việc: **giải mã
video** (FFmpeg → frame RGBA/JPEG, phục vụ nền video/WebGPU) và **xuất NDI** (đẩy frame RGBA ra
mạng LAN). Bản thiết kế gốc (`_design_extract.txt`) đề xuất SQLite + C++/Skia render — đó là định
hướng tương lai, không phải trạng thái hiện tại.

### Luồng dữ liệu Live Output

1. Người vận hành bấm **"Go Live"** trên một slide (SongEditor / Playlist / MediaLibrary).
2. Frontend gọi lệnh Rust `set_live_state` → Rust cập nhật `AppState.live` và **emit event
   `live-update`** tới toàn bộ app (Tauri event system).
3. Cửa sổ **Output** (`OutputView.tsx`) lắng nghe event này và crossfade sang nội dung mới bằng CSS
   transition — tách biệt hoàn toàn khỏi cửa sổ Control, y hệt cách ProPresenter/FreeShow tách
   Control ↔ Stage/Output.
4. Nếu Output window bị đóng/mở lại, nó tự gọi `get_live_state` để đồng bộ lại trạng thái hiện tại.

### Lưu trữ dữ liệu

Toàn bộ Song/Media/Playlist được lưu dạng JSON tại thư mục app data của hệ điều hành
(`data.json`), file media gốc được copy vào thư mục con `media/`. Mọi thay đổi được ghi qua
`save_to_disk` **debounce ~500ms** (gộp nhiều lệnh) và **flush đồng bộ khi app đóng** — atomic
write (`.tmp` + rename) để không hỏng file giữa chừng.

> **Quyết định tạm thời.** JSON + Mutex là nền tảng đơn giản phù hợp quy mô hiện tại. Ước tính
> **> 500–1000 bài hát** (hoặc media > vài nghìn mục, hoặc khi ghi đĩa gây giật dù đã debounce)
> thì nên migrate sang **SQLite** (`tauri-plugin-sql`). Migration không đổi API phía frontend:
> giữ nguyên interface `lib/api.ts`, chỉ thay phần đọc/ghi trong `commands/*.rs`.

Mỗi lần ghi thành công, app giữ hai bản backup gần nhất tại `data.json.backup-1` và
`data.json.backup-2`. Khi khởi động, nếu `data.json` bị hỏng do sự cố nguồn điện hoặc process,
app sẽ thử file `.tmp` và các backup hợp lệ gần nhất trước khi dùng state mặc định.

## Đã có (Phase 1 — khung sườn)

- [x] Multi-window: Control window + Output window fullscreen trên màn hình chọn được
- [x] Song library: CRUD bài hát, nhiều slide/bài, metadata CCLI/copyright
- [x] Media library: import ảnh/video, hiển thị làm nền, preview grid
- [x] Playlist: gộp bài hát + media + slide đen, sắp xếp thứ tự, phát nhanh
- [x] Live preview đồng bộ 2 chiều (Control ↔ Output) qua Tauri event
- [x] Transition cắt/fade cấu hình được trong `LiveState.transition`
- [x] Lưu trữ bền vững (JSON) qua các phiên làm việc

## Đã có (Phase 2 — Stage Display)

- [x] Cửa sổ **Stage Display** riêng (`stage.html` → `windows/stage-main.tsx` →
  `components/Stage/StageView.tsx`) dành cho màn hình confidence monitor trước ca sĩ/nhạc công
- [x] Hiện lời đang chiếu (to) + **xem trước slide kế tiếp** (mờ, phía dưới) — `next_text`/`next_label`
  trong `LiveState`, được `SongEditor`/`PlaylistPanel` tự tính khi "Go Live"
- [x] Đồng hồ thời gian thực trên Stage Display
- [x] Ô **gửi tin nhắn nhanh** từ Toolbar → hiện trên Stage Display (`stage_message`,
  command `set_stage_message`) — dùng để nhắc "còn 2 bài nữa", "chuẩn bị lời cầu nguyện"...
- [x] Stage Display là window thường (không fullscreen ép buộc) vì thường đặt trong 1 khung nhỏ
  trên màn hình sân khấu, khác với Output luôn fullscreen trên máy chiếu

## Đã có (Phase 3 — Tính năng kiểu FreeShow)

- [x] **Điều hướng slide** (`advance_live`): bấm **Space / → / N / PageDown** để sang slide kế tiếp,
  **← / P / PageUp** để quay lại, **B** để Clear Live. Đi theo ngữ cảnh: trong bài hát đi hết thì
  nhảy sang mục kế tiếp trong playlist, hết playlist thì dừng. Có nút Trước/Kế tiếp trong LivePreview.
- [x] **Audio Library**: import nhạc nền (mp3, wav, ogg, m4a, flac…) từ native dialog, nghe thử,
  "Phát nền" chạy song song với nội dung đang chiếu (`LiveState.audio`), điều khiển play/pause/âm
  lượng/Dừng ngay trong LivePreview, auto dừng khi hết bài.
- [x] **Audio trong Playlist**: mục `audio` trong chương trình, khi Go Live sẽ phát làm nhạc nền.
- [x] **Video control**: play/pause video trên Output và LivePreview (`set_media_playing`).
- [x] **Templates trình chiếu** (kiểu FreeShow Themes): định nghĩa màu chữ, màu nền, cỡ chữ (vh),
  căn lề (trái/giữa/phải), vị trí (trên/giữa/dưới) cho slide. Chọn template mặc định trong Cài đặt,
  mỗi slide bài hát có thể gán template riêng. Output render theo template tự động.
- [x] **Ghi chú per slide** (`SongSlide.notes`): hiện trên Stage Display cho nhạc công, không hiện
  trên Output.
- [x] **Đếm ngược** trên Toolbar (phút:giây) → hiển thị lớn trên Stage Display và LivePreview,
  đỏ khi hết giờ (`start_countdown`/`stop_countdown`).
- [x] **Cài đặt toàn cục** (`AppSettings`): transition mặc định, template mặc định, và các tùy chọn
  Stage Display (đồng hồ / slide kế tiếp / ghi chú / tin nhắn) — modal **⚙ Cài đặt** ở Toolbar.
- [x] Templates được lưu trữ và quản lý (CRUD) ngay trong modal Cài đặt.

## Đã có (Phase 4 — Tích hợp OBS Studio)

- [x] **Bước 9 — OBS Studio integration qua WebSocket v5** (`src/lib/obs.ts` client tự viết, theo
  đúng protocol v5: Hello/Identify/Identified/Event/Request/RequestResponse, xác thực SHA-256):
  - [x] Kết nối host:port + mật khẩu, hiển thị trạng thái kết nối + lỗi rõ ràng (sai mật khẩu / OBS
        yêu cầu mật khẩu / không tới được OBS)
  - [x] **Scene control**: liệt kê scene (nút bấm) + chuyển scene tức thì (`SetCurrentProgramScene`)
  - [x] **Stream / Record**: bật/tắt stream và ghi hình (`StartStream/StopStream`,
        `StartRecord/StopRecord`), đồng bộ trạng thái theo event `StreamStateChanged`/
        `RecordStateChanged`
  - [x] **Audio mixer**: danh sách input kèm slider âm lượng (dB) + nút mute (`Get/SetInputVolume`,
        `Get/SetInputMute`), cập nhật theo `InputVolumeMeters`
  - [x] **Auto scene switch**: trong Cài đặt OBS gán scene cho trạng thái lyric/camera/blank, khi
        "Go Live" theo loại nội dung thì app tự chuyển scene tương ứng (map `live.current.kind`)
  - [x] Đăng ký `eventSubscriptions` (Scenes/Inputs/Outputs/…) để nhận event thời gian thực như
        FreeShow/obs-websocket-js
  - [x] Lưu cấu hình OBS (host/port/password, auto scene switch) vào `AppSettings`
  - [x] **Màn hình điều khiển OBS ngay trong app**: tab **OBS** ở Sidebar (thay modal cũ) — kết nối,
        scene grid, nút Stream/Record, audio mixer, auto scene switch
  - [x] **Nút tắt/bật Stream + Ghi hình** trên Toolbar, bấm ngay khi đang kết nối OBS

## Lộ trình mở rộng (Phase 5+)

Kiến trúc đã chừa sẵn chỗ để thêm mà **không cần đập lại code hiện tại**:

- **NDI**: đã có khung xuất NDI thực chạy (`ndi_output_start/send_frame/stop` + smoke test) và **tự động
  bơm frame**: khi NDI bật, decode loop đẩy mỗi frame giải mã thẳng vào sender theo applied target của
  Output window (không cần `ndi_output_send_frame` tay). Còn thiếu: UI bật/tắt NDI trên Output window.
- **MIDI/OSC control** (foot pedal, bàn mixer): thêm crate `midir`/`rosc`, một command mới
  `trigger_next_slide` map vào cùng luồng `advance_live`.
- **CCLI SongSelect import**: thêm command Rust gọi API CCLI, map kết quả vào `Song` (CCLI *log*
  local đã có).
- **SQLite thay JSON**: đổi `state.rs` sang `tauri-plugin-sql`, API commands giữ nguyên chữ ký —
  ngưỡng khuyến nghị: > 500–1000 bài hát (xem mục "Lưu trữ dữ liệu").
- **Verse highlight trên Stage** (tô dòng đang hát theo từng dòng): mở rộng `LiveState` với
  `current_line` và lệnh `advance_line`.
- **Chord notation** cho bài hát: parse `[G]`, `[Am7]` trong text slide và hiển thị hợp âm.

## Ghi chú

- App dùng `convertFileSrc` để load ảnh/video trực tiếp từ thư mục app data — không copy dữ liệu
  vào bundle của app.
- Output window được tạo **động** bằng `WebviewWindowBuilder` (không khai trong `tauri.conf.json`)
  để chọn đúng monitor lúc runtime.
