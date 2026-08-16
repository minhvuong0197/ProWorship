# Pro WorshipCast

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

## Build bản release

```bash
npm run tauri build
```

> Trước khi build release, tạo icon bằng `npm run tauri icon path/to/logo-1024.png`
> (hiện tại `tauri.conf.json` chưa khai báo icon để tránh lỗi khi chưa có file).

## Kiến trúc

```
src-tauri/            Rust backend (Tauri v2)
  src/
    models/            Song, Slide, MediaItem, AudioItem, Template, Playlist, LiveState, AppSettings
    state.rs            AppState (in-memory, Mutex) + persistence (JSON trong app data dir)
    commands/           songs.rs, media.rs, audio.rs, playlists.rs, templates.rs, settings.rs, output.rs
    lib.rs / main.rs     Đăng ký plugin, state, commands

src/                  React frontend
  store/useAppStore.ts  Zustand store trung tâm — gọi Rust commands qua lib/api.ts
  lib/api.ts             Wrapper cho tauri invoke() + convertFileSrc cho media
  lib/live.ts            Helper go-live: resolve template style, dựng LiveState cho song slide
  components/
    Toolbar/              Chọn màn hình, Output/Stage windows, đếm ngược, tin nhắn Stage, Cài đặt
    SongEditor/            CRUD bài hát + slides (notes, template), nút "Go Live"
    MediaLibrary/          Import ảnh/video (native file dialog), go-live nền
    AudioLibrary/          Import audio, nghe thử, phát làm nhạc nền
    Settings/              Modal cài đặt: transition, template default, templates editor, Stage options
    Playlist/              Chương trình thờ phượng: bài hát/media/audio/slide đen, sắp xếp, phát nhanh
    LivePreview/            Xem trước + điều hướng slide, audio/video controls, đếm ngược (panel phải)
    Output/OutputView.tsx   Component render fullscreen cho cửa sổ Output (projector)
    Stage/StageView.tsx      Stage Display: lời, slide kế, ghi chú, đồng hồ, đếm ngược, tin nhắn
  windows/output-main.tsx  Entry point riêng cho output.html (build đa entry qua Vite)
```

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
(`data.json`), file media gốc được copy vào thư mục con `media/`. Đây là nền tảng đơn giản —
có thể nâng cấp sang SQLite (`tauri-plugin-sql`) khi thư viện bài hát lớn dần mà không đổi API
phía frontend (`lib/api.ts` giữ nguyên interface).

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

- **NDI / streaming output**: thêm module Rust mới trong `commands/`, gọi từ cùng `LiveState`.
- **MIDI/OSC control** (foot pedal, bàn mixer): thêm crate `midir`/`rosc`, một command mới
  `trigger_next_slide` map vào cùng luồng `advance_live`.
- **Bible module**: model `BibleVerse` tương tự `Song`, tái dùng toàn bộ UI go-live/playlist.
- **CCLI SongSelect import**: thêm command Rust gọi API CCLI, map kết quả vào `Song`.
- **SQLite thay JSON**: đổi `state.rs` sang `tauri-plugin-sql`, API commands giữ nguyên chữ ký.
- **Verse highlight trên Stage** (tô dòng đang hát theo từng dòng): mở rộng `LiveState` với
  `current_line` và lệnh `advance_line`.
- **Chord notation** cho bài hát: parse `[G]`, `[Am7]` trong text slide và hiển thị hợp âm.

## Ghi chú

- App dùng `convertFileSrc` để load ảnh/video trực tiếp từ thư mục app data — không copy dữ liệu
  vào bundle của app.
- Output window được tạo **động** bằng `WebviewWindowBuilder` (không khai trong `tauri.conf.json`)
  để chọn đúng monitor lúc runtime.
