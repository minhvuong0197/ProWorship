mod bible;
mod builtin_templates;
mod commands;
mod interlinear;
mod models;
mod native;
mod server;
mod state;

use state::{load_from_disk, seed_default_templates, AppState};
use tauri::Manager;

/// Percent-decode a URL-encoded string (used for the media:// path segment).
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hi = (b[i + 1] as char).to_digit(16);
            let lo = (b[i + 2] as char).to_digit(16);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Serve a media file (mp4) over a custom scheme with HTTP Range support so
/// the WebView's <video>/<audio> element can seek and stream it natively
/// (hardware decode + A/V sync handled by the browser). Track 3.
fn serve_media(app: &tauri::AppHandle, request: &tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    use tauri::http::StatusCode;
    let path = request.uri().path();
    let decoded = percent_decode(path.trim_start_matches('/'));
    let dir = match crate::state::media_dir(app) {
        Ok(d) => d,
        Err(_) => {
            return tauri::http::Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Vec::new())
                .unwrap()
        }
    };
    let file = std::path::Path::new(&decoded);
    // Only serve files inside the media directory.
    let file = match file.canonicalize() {
        Ok(f) if dir.canonicalize().map(|d| f.starts_with(&d)).unwrap_or(false) => f,
        _ => {
            return tauri::http::Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Vec::new())
                .unwrap()
        }
    };
    let meta = match std::fs::metadata(&file) {
        Ok(m) if m.is_file() => m,
        _ => {
            return tauri::http::Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Vec::new())
                .unwrap()
        }
    };
    let len = meta.len();

    let range = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);

    let build = |status: StatusCode, extra: Vec<(String, String)>, body: Vec<u8>| {
        let mut b = tauri::http::Response::builder();
        b = b.status(status);
        b = b.header("Accept-Ranges", "bytes");
        b = b.header("Content-Type", "video/mp4");
        b = b.header("Access-Control-Allow-Origin", "*");
        for (k, v) in extra {
            b = b.header(k, v);
        }
        b.body(body).unwrap()
    };

    if let Some(r) = range {
        // bytes=start-end
        if let Some(rest) = r.strip_prefix("bytes=") {
            let mut it = rest.split('-');
            let start: u64 = it.next().and_then(|s| s.trim().parse().ok()).unwrap_or(0);
            let end: u64 = it
                .next()
                .and_then(|s: &str| s.trim().parse::<u64>().ok())
                .map(|e: u64| e.min(len.saturating_sub(1)))
                .unwrap_or_else(|| len.saturating_sub(1));
            if start >= len || start > end {
                return build(
                    StatusCode::RANGE_NOT_SATISFIABLE,
                    vec![("Content-Range".into(), format!("bytes */{len}"))],
                    Vec::new(),
                );
            }
            let mut f = match std::fs::File::open(&file) {
                Ok(f) => f,
                Err(_) => return build(StatusCode::INTERNAL_SERVER_ERROR, Vec::new(), Vec::new()),
            };
            let count = (end - start + 1) as usize;
            use std::io::{Read, Seek, SeekFrom};
            let mut buf = vec![0u8; count];
            if f.seek(SeekFrom::Start(start)).is_err() || f.read_exact(&mut buf).is_err() {
                return build(StatusCode::INTERNAL_SERVER_ERROR, Vec::new(), Vec::new());
            }
            return build(
                StatusCode::PARTIAL_CONTENT,
                vec![
                    ("Content-Range".into(), format!("bytes {start}-{end}/{len}")),
                    ("Content-Length".into(), count.to_string()),
                ],
                buf,
            );
        }
    }

    let bytes = match std::fs::read(&file) {
        Ok(b) => b,
        Err(_) => return build(StatusCode::INTERNAL_SERVER_ERROR, Vec::new(), Vec::new()),
    };
    build(StatusCode::OK, vec![("Content-Length".into(), len.to_string())], bytes)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        // Track 2: serve the latest decoded frame over a custom scheme so the
        // WebView can fetch raw RGBA without the invoke/IPC overhead.
        .register_uri_scheme_protocol("frames", |ctx, _request| {
            let state = ctx.app_handle().state::<AppState>();
            let bytes = state.native_player.pull().unwrap_or_default();
            tauri::http::Response::builder()
                .header("Content-Type", "application/octet-stream")
                .header("Cache-Control", "no-store")
                .header("Access-Control-Allow-Origin", "*")
                .body(bytes)
.unwrap_or_else(|e| {
                        tauri::http::Response::builder()
                            .status(500)
                            .body(format!("frame error: {e}").into_bytes())
                            .unwrap()
                    })
        })
        // Track 3: serve the source media file (Range-capable) so the WebView
        // <video>/<audio> element streams it natively — real 1080p/4K + A/V.
        .register_uri_scheme_protocol("media", |ctx, request| {
            serve_media(ctx.app_handle(), &request)
        })
        .setup(|app| {
            let handle = app.handle();
            let state = handle.state::<AppState>();
            load_from_disk(handle, &state);
            seed_default_templates(handle, &state);
            server::start(handle.clone());
            {
                let timeline_handle = handle.clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    let state = timeline_handle.state::<AppState>();
                    commands::output::auto_advance_service(&timeline_handle, &state);
                });
            }
            if let Some(win) = app.get_webview_window("main") {
                let win2 = win.clone();
                let splash = app.get_webview_window("splash");
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(2500));
                    if let Some(s) = splash {
                        let _ = s.close();
                    }
                    let _ = win2.unminimize();
                    let _ = win2.show();
                    if let Some(monitor) = win2.current_monitor().ok().flatten() {
                        let msize = *monitor.size();
                        let mpos = *monitor.position();
                        let outer = win2.outer_size().ok().unwrap_or_default();
                        let inner = win2.inner_size().ok().unwrap_or_default();
                        let frame_w = outer.width as i64 - inner.width as i64;
                        let frame_h = outer.height as i64 - inner.height as i64;
                        let target_w = (msize.width as i64 - frame_w).max(640) as u32;
                        let target_h = (msize.height as i64 - frame_h).max(480) as u32;
                        if (outer.width as u32) > msize.width
                            || (outer.height as u32) > msize.height
                        {
                            let _ = win2.set_position(tauri::Position::Physical(mpos));
                            let _ = win2.set_size(tauri::Size::Physical(
                                tauri::PhysicalSize::new(target_w, target_h),
                            ));
                        }
                    }
                    let _ = win2.set_focus();
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bible::get_bible_books,
            bible::get_bible_chapter,
            bible::bible_search,
            bible::list_bible_versions,
            bible::get_bible_books_version,
            bible::get_bible_chapter_version,
            bible::import_bible_xml,
            bible::import_bible_xml_text,
            bible::delete_bible_version,
            bible::rename_bible_version,
            bible::edit_bible_book,
            bible::edit_bible_verse,
            bible::set_bible_version_template,
            bible::open_url,
            interlinear::get_interlinear_verse,
            interlinear::get_strong_entry,
            interlinear::search_strong,
            commands::edit::get_edit_shows,
            commands::edit::save_edit_show,
            commands::edit::delete_edit_show,
            commands::songs::get_songs,
            commands::songs::save_song,
            commands::songs::delete_song,
            commands::media::get_media_library,
            commands::media::import_media,
            commands::media::delete_media,
            commands::media::get_media_dir,
            commands::native::native_video_probe,
            commands::native::native_ndi_probe,
            commands::native::gpu_probe,
            commands::player::native_video_play,
            commands::player::native_video_stop,
            commands::player::native_video_pull,
            commands::player::native_video_set_target,
            commands::player::native_video_set_paused,
            commands::player::native_video_set_chroma,
            commands::player::native_video_seek,
            commands::player::native_video_set_transport,
            commands::audio::get_audio_library,
            commands::audio::import_audio,
            commands::audio::delete_audio,
            commands::audio::get_audio_playlists,
            commands::audio::save_audio_playlist,
            commands::audio::delete_audio_playlist,
            commands::playlists::get_playlists,
            commands::playlists::save_playlist,
            commands::playlists::delete_playlist,
            commands::templates::get_templates,
            commands::templates::save_template,
            commands::templates::delete_template,
            commands::templates::restore_default_templates,
            commands::props::get_props,
            commands::props::save_prop,
            commands::props::delete_prop,
            commands::overlays::get_overlays,
            commands::overlays::save_overlay,
            commands::overlays::delete_overlay,
            commands::settings::get_settings,
            commands::settings::set_settings,
            server::get_companion_info,
            commands::output::list_monitors,
            commands::output::open_output_window,
            commands::output::close_output_window,
            commands::output::is_output_open,
            commands::output::is_stage_open,
            commands::output::open_stage_window,
            commands::output::close_stage_window,
            commands::output::open_template_editor_window,
            commands::output::close_template_editor_window,
            commands::output::get_live_state,
            commands::output::set_live_state,
            commands::output::set_stage_message,
            commands::output::clear_live,
            commands::output::set_output_locked,
            commands::output::refresh_output,
            commands::output::advance_live,
            commands::output::set_media_playing,
            commands::output::set_audio_state,
            commands::output::stop_audio,
            commands::output::start_countdown,
            commands::output::stop_countdown,
            commands::output::get_ccli_log,
            commands::output::goto_slide,
            commands::output::load_playlist,
            commands::output::present_song,
            commands::output::goto_playlist_entry,
            commands::output::start_service_timeline,
            commands::output::stop_service_timeline,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Pro WorshipFlow")
        .run(|app_handle, event| {
            // Flush đồng bộ dữ liệu còn "bẩn" xuống đĩa trước khi process kết
            // thúc — debounce ghi đĩa không được làm mất dữ liệu khi đóng app.
            if matches!(event, tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }) {
                state::flush_save(app_handle);
            }
        });
}
