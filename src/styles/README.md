# Styles — quy ước viết CSS của ProWorship

CSS thuần, **không** dùng CSS Modules / Tailwind / CSS-in-JS. Tất cả stylesheet
được bundle qua Vite (mỗi window import đúng 1 file CSS từ entry `.tsx`, không
có `<link rel="stylesheet">` trong HTML).

## Bản đồ window → stylesheet

| Window           | Entry                  | Stylesheet                | Import `global.css`? |
| ---------------- | ---------------------- | ------------------------- | -------------------- |
| Main app (chính) | `src/main.tsx`         | `src/styles/global.css`   | — (file gốc)         |
| Output (chiếu)   | `src/windows/output-main.tsx` | `src/styles/output.css` | Không (cố ý)     |
| Stage            | `src/windows/stage-main.tsx`  | `src/styles/stage.css`  | Có                  |
| Splash           | `src/windows/splash-main.tsx` | `src/styles/splash.css` | Có                  |
| Template editor  | `src/windows/template-editor-main.tsx` | `src/styles/template-editor.css` | Có |

## Design tokens — `:root` trong `global.css`

Mọi màu/spacing của UI app phải lấy từ palette dưới đây, không hardcode hex:

- Nền: `--bg` `--panel` `--panel-2` `--panel-3`
- Viền: `--border` `--border-strong`
- Chữ: `--text` `--muted`
- Accent: `--accent` `--accent-2` `--accent-gradient` `--accent-soft`
- Trạng thái: `--success` `--danger` `--warn`
- Spacing: `--space-1` (6px) `--space-2` (8px) `--space-3` (12px) `--space-4` (16px)
- Khác: `--shadow` `--shadow-lg` `--radius` `--radius-sm` `--font`

**Window phụ** cần dùng palette: đặt `@import "./global.css";` ở dòng đầu
stylesheet của window đó (xem `stage.css`, `splash.css`, `template-editor.css`).

**Ngoại lệ — window trình chiếu** (`output.css`): cố ý **không** import
`global.css` và dùng đen/trắng thuần (`#000`, `#fff`) vì đó là tín hiệu hình
ảnh trên màn hình chiếu — không phải màu UI. `stage.css` tương tự dùng trắng
cho text và 2 accent riêng của Stage (`#ffd166` vàng, `#7fb0ff` xanh nhạt) —
giữ nguyên, không map sang palette.

## Quy tắc đặt tên

- **Kebab-case**, một class/selector, không dùng CSS Modules hash.
- **Namespace theo tính năng** bằng tiền tố: `.toolbar-*`, `.playlist-*`,
  `.settings-*`, `.tpl-*`, `.song-*`, `.bible-*`, `.media-*`, `.audio-*`,
  `.obs-*`, `.edit-*`, `.service-*`, `.timeline-*`, `.stage-*`, `.output-*`,
  `.prop-*`, `.overlay-*`, `.splash-*`.
- **Trạng thái** dùng class modifier không kế thừa: `.active`, `.sel`, `.danger`,
  `.overdue`, `.expired`, `.full`, `.bg`.
- Class dùng chung cho cả React lẫn DOM: đặt tên ngắn, mô tả đúng thứ nó style
  (`.swatch`, `.name`, `.cat`, `.grow`).

## Khi thêm style mới

1. Màu mới → thêm token vào `:root` của `global.css`, dùng `var(--token)`.
2. Đặt selector dưới namespace tương ứng; giữ nguyên thứ tự nhóm (layout →
   text → trạng thái).
3. Window trình chiếu: dùng đơn vị viewport (`vh`/`vw`, `clamp()`) thay vì px
   để scale theo màn hình chiếu.
4. Không viết CSS global cho component đơn lẻ nếu có thể — prefixed class theo
   feature.

## Audit dead CSS (chạy lại sau này)

Cách phát hiện class không dùng: trích tất cả token `\.([a-z][\w-]*)` từ
`global.css`, kiểm tra chuỗi đó có xuất hiện trong `src/**/*.{ts,tsx}` hay
không (không đếm các file CSS khác, vì định nghĩa tự tham chiếu).

Danh sách **37 class dead** ghi nhận lúc audit (chỉ tồn tại trong `global.css`,
không được component nào dùng — di tích của bản UI cũ, nên gỡ khi chạm vào
vùng code liên quan):

```
audio-now            bc-modeicon          bible-version-actions
chapter-grid         color-input-wrap     mini-btn
now-label            now-title            nv-progress
nv-progress-fill     obs-audio-list       obs-audio-row
obs-connected        obs-connecting       obs-field-row
obs-input-name       obs-panel            obs-scene
obs-scene-grid       obs-stream-row       obs-studio-main
preview-text-wrapper status-ic
template-preview     toolbar-tools
tpl-default-row      tpl-edit-tools       tpl-override-transform
tpl-selected-info    tpl-swatch           tpl-toolbar
tpl-topbar           tpl-transpose        tpl-transpose-reset
tpl-transpose-val    view-hint
```

> Lưu ý: audit dựa trên so khớp chuỗi tĩnh. Class được dựng động
> (`` `cls-${x}` ``) có thể bị liệt kê nhầm — trước khi xoá hãy grep thủ công
> phần prefix. Không bắt buộc xoá ngay; ưu tiên tài liệu hoá như hiện tại.