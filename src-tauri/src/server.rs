use std::io::{self, Read};
use std::net::TcpListener;
use std::thread;
use std::time::Duration;

use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use tauri::{AppHandle, Manager};

use crate::state::AppState;

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).unwrap()
}

fn json_response(status: StatusCode, body: String) -> Response<io::Cursor<Vec<u8>>> {
    Response::from_string(body)
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json; charset=utf-8"))
        .with_header(header("Access-Control-Allow-Origin", "*"))
}

fn lan_ip() -> String {
    use std::net::UdpSocket;
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "localhost".into()
}

fn base_url(ip: &str, port: u16) -> String {
    format!("http://{}:{}", ip, port)
}

fn companion_html() -> String {
    let style = "
      * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
      body { font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; background: #0f1117; color: #eef; min-height: 100vh; }
      #app { display: flex; flex-direction: column; height: 100vh; }
      header { position: relative; z-index: 10; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #161a23; border-bottom: 1px solid #232a38; }
      header .brand { font-weight: 800; font-size: 16px; }
      nav { display: flex; gap: 6px; flex: 1; justify-content: flex-end; }
      nav button { background: transparent; border: none; color: #8b93a7; padding: 8px 12px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
      nav button.active { background: #232a38; color: #fff; }
      main { flex: 1; overflow: hidden; position: relative; }
      .page { position: absolute; inset: 0; overflow-y: auto; padding: 14px; display: none; }
      .page.active { display: block; }
      /* Output */
      .output { position: relative; inset: 0; overflow-y: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100%; padding: 24px 20px; }
      .output .label { color: #ffd166; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px; }
      .output .text { font-size: 26px; line-height: 1.55; text-align: center; max-width: 100%; white-space: pre-wrap; word-break: break-word; }
      .output .next { margin-top: 18px; font-size: 12px; color: #6b7280; text-align: center; max-width: 100%; white-space: pre-wrap; }
      .output .pos { margin-top: 8px; font-size: 12px; color: #475569; font-weight: 700; }
      .tap-left, .tap-right { position: fixed; top: 0; bottom: 0; width: 33%; z-index: 5; }
      .tap-left { left: 0; } .tap-right { right: 0; }
      .empty { color: #8b93a7; text-align: center; margin-top: 40vh; transform: translateY(-50%); }
      /* Slide list */
      .slides { display: flex; flex-direction: column; gap: 10px; }
      .slide-card { background: #171b25; border: 2px solid #232a38; border-radius: 12px; padding: 12px 14px; cursor: pointer; }
      .slide-card.active { border-color: #3b82f6; background: #1c2433; }
      .slide-card .s-label { color: #7dd3fc; font-size: 12px; font-weight: 700; margin-bottom: 6px; }
      .slide-card .s-text { font-size: 15px; line-height: 1.45; white-space: pre-wrap; color: #e2e8f0; }
      .song-head { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
      .pv-area { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
      .pv-current { border: 3px solid #3b82f6; background: #141926; border-radius: 14px; padding: 14px 16px; cursor: pointer; }
      .pv-current .pv-label { color: #ffd166; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
      .pv-current .pv-text { font-size: 20px; line-height: 1.5; color: #f1f5f9; white-space: pre-wrap; word-break: break-word; }
      .pv-next { font-size: 13px; color: #8b93a7; padding: 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .slides-nav { display: flex; align-items: center; gap: 10px; justify-content: center; margin: 6px 0 12px; }
      .slides-nav .nav-arrow { width: 46px; height: 46px; border: none; border-radius: 50%; background: #232a38; color: #eef; font-size: 22px; font-weight: 700; cursor: pointer; }
      .slides-nav .nav-arrow:active { background: #3b82f6; }
      .slides-nav #slidesPos { min-width: 58px; text-align: center; font-size: 14px; color: #8b93a7; font-weight: 600; }
      /* Scriptures */
      .books, .chapters, .verses { display: flex; flex-direction: column; gap: 8px; }
      .b-item { background: #171b25; border: 2px solid #232a38; border-radius: 10px; padding: 12px 14px; cursor: pointer; }
      .b-item .t { font-weight: 600; font-size: 15px; }
      .b-item .s { color: #8b93a7; font-size: 12px; margin-top: 2px; }
      .ch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 8px; margin-bottom: 14px; }
      .ch-grid button { background: #171b25; border: 1px solid #232a38; color: #eef; border-radius: 8px; padding: 10px 0; font-size: 14px; cursor: pointer; }
      .ch-grid button.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
      .book-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
      .book-bar button { background: #232a38; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 8px 12px; font-size: 14px; font-weight: 600; cursor: pointer; }
      .book-bar .bname { font-weight: 700; font-size: 15px; flex: 1; }
      .verse-row { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #1d2432; cursor: pointer; }
      .verse-row .no { color: #3b82f6; font-size: 13px; min-width: 20px; text-align: right; }
      .verse-row .vt { font-size: 15px; line-height: 1.5; flex: 1; }
      .verse-row.presenting { outline: 3px solid #3b82f6; outline-offset: 3px; border-radius: 8px; background: #1c2433; }
      .bible-ctrl { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
      .bible-ctrl .lbl { font-size: 13px; color: #8b93a7; }
      .bible-search-form { flex: 1; min-width: 0; display: flex; gap: 6px; }
      .bible-search-form .bibleSearch { flex: 1; min-width: 0; background: #161a23; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
      .bible-search-form .bibleSearch.err { border-color: #f87171; color: #f87171; }
      .bible-search-form .bibleSearchBtn { background: #232a38; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 0 12px; font-size: 15px; cursor: pointer; }
      .autoBtn { background: #232a38; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
      .autoBtn.on { background: #16a34a; border-color: #16a34a; color: #fff; }
      .auto-ctrl { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .auto-ctrl input { width: 52px; background: #161a23; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 6px 8px; font-size: 13px; text-align: center; }
      .auto-ctrl .sec { font-size: 12px; color: #8b93a7; }
      #page-bible { padding-bottom: 78px; }
      .bible-nav { position: fixed; left: 50%; transform: translateX(-50%); bottom: 14px; z-index: 20; display: flex; align-items: center; gap: 10px; background: #161a23; border: 1px solid #2a3040; border-radius: 999px; padding: 6px 12px; }
      .bible-nav .nav-arrow { width: 44px; height: 44px; border: none; border-radius: 50%; background: #232a38; color: #eef; font-size: 22px; font-weight: 700; cursor: pointer; }
      .bible-nav .nav-arrow:active { background: #3b82f6; }
      .bible-nav #navPos { min-width: 52px; text-align: center; font-size: 13px; color: #8b93a7; font-weight: 600; }
      #page-bible.active { display: flex; flex-direction: column; overflow: hidden; }
      .bible-ctrl { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
      .bibleVersionSel { flex: 1 1 100%; min-width: 0; background: #161a23; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
      .bibleVersionSel:disabled { opacity: 0.6; }
      .verse-row .editbtn { flex-shrink: 0; width: 26px; height: 26px; border: 1px solid #2a3040; border-radius: 6px; background: #232a38; color: #8b93a7; font-size: 13px; line-height: 1; cursor: pointer; }
      .verse-row .editbtn:active { background: #3b82f6; color: #fff; }
      #chapterBar { flex-shrink: 0; max-height: 132px; overflow-y: auto; background: #141821; border: 1px solid #232a38; border-radius: 10px; padding: 8px; margin-bottom: 8px; }
      #chapterBar .ch-grid { margin-bottom: 0; }
      #bibleBody { flex: 1; min-height: 0; overflow-y: auto; }
      /* Project / playlist */
      .pl-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
      .pl-bar button { background: #232a38; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 8px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
      .pl-bar button:active { background: #3b82f6; }
      .pl-bar .pl-new { background: #16a34a; border-color: #16a34a; color: #fff; }
      .pl-bar .pl-run { background: #3b82f6; border-color: #3b82f6; color: #fff; }
      .pl-bar .pl-del { background: #7f1d1d; border-color: #7f1d1d; color: #fff; }
      .pl-addbible { background: #232a38; border: 1px solid #2a3040; color: #eef; border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
      .pl-addbible:active { background: #16a34a; }
      .pl-play { display: inline-block; cursor: pointer; color: #3b82f6; }
      .pl-x { display: inline-block; cursor: pointer; color: #f87171; }
      .pl-play:active, .pl-x:active { opacity: 0.6; }
      #songsList { display: flex; flex-direction: column; gap: 8px; }
      /* Login */
      #login { position: fixed; inset: 0; z-index: 50; background: #0f1117; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .login-box { width: 100%; max-width: 340px; }
      .login-box h2 { margin-bottom: 6px; }
      .login-box p { color: #8b93a7; font-size: 14px; margin-bottom: 16px; }
      .login-box input { width: 100%; border: 1px solid #2a3040; background: #161a23; color: #eef; border-radius: 10px; padding: 14px; font-size: 22px; letter-spacing: 8px; text-align: center; margin-bottom: 12px; }
      .login-box button { width: 100%; background: #3b82f6; border: none; color: #fff; border-radius: 10px; padding: 14px 0; font-size: 16px; font-weight: 700; cursor: pointer; }
      #loginErr { color: #f87171; font-size: 13px; margin-top: 10px; min-height: 18px; }
      .remember { display: flex; align-items: center; gap: 8px; color: #8b93a7; font-size: 14px; margin-bottom: 12px; cursor: pointer; user-select: none; }
      .remember input { width: auto; margin: 0; padding: 0; letter-spacing: 0; text-align: left; accent-color: #3b82f6; }
      .remember-label { color: #8b93a7; }
            .pin-wrap input { width: 100%; padding-right: 0; box-sizing: border-box; }
      .headright { display: flex; align-items: center; gap: 8px; }
    ";
    let html = format!(
        r#"<!DOCTYPE html><html lang='vi'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'><title>Church App</title><style>{STYLE}</style></head><body>
<div id='login'>
  <div class='login-box'>
    <h2>Church App</h2>
    <p>Nhập mã PIN để kết nối với máy trình chiếu</p>
    <div class='pin-wrap'>
      <input id='pin' type='password' inputmode='numeric' maxlength='10' placeholder='••••••'>
    </div>
    <label class='remember'><input type='checkbox' id='rememberPin' checked><span class='remember-label'>Nhớ mật khẩu</span></label>
    <button onclick='doLogin()'>Kết nối</button>
    <div id='loginErr'></div>
  </div>
</div>
<div id='app' style='display:none'>
  <header>
    <span class='brand'>Church App</span>
    <nav>
      <button data-tab='output' class='active' onclick='switchTab("output")' title='Màn hình'>🖥️</button>
      <button data-tab='slides' onclick='switchTab("slides")' title='Danh sách'>📜</button>
      <button data-tab='songs' onclick='switchTab("songs")' title='Bài hát'>🎵</button>
      <button data-tab='bible' onclick='switchTab("bible")' title='Kinh thánh'>📖</button>
    </nav>
  </header>
  <main>
    <div class='page output-page active' id='page-output'>
      <div class='tap-left' onclick='tapPrev()'></div>
      <div class='tap-right' onclick='tapNext()'></div>
      <div class='output'>
        <div class='label' id='outLabel'></div>
        <div class='text' id='outText'>…</div>
        <div class='pos' id='outPos'></div>
        <div class='next' id='outNext'></div>
      </div>
    </div>
    <div class='page' id='page-slides'>
      <div class='song-head' id='slidesSong'></div>
      <div id='slidesList'></div>
    </div>
    <div class='page' id='page-songs'>
      <div class='song-head' id='songsHead'></div>
      <div id='songsList'></div>
    </div>
    <div class='page' id='page-bible'>
      <div class='bible-ctrl'>
        <form class='bible-search-form' onsubmit='event.preventDefault();searchBible();return false'>
          <input id='bibleSearch' class='bibleSearch' type='search' enterkeyhint='search' autocomplete='off' placeholder='Tìm kiếm' onkeydown="if(event.key==='Enter'||event.keyCode===13)searchBible()" oninput='searchKey()'>
          <button type='submit' class='bibleSearchBtn'>🔍</button>
        </form>
        <div class='auto-ctrl'>
          <input id='autoSec' type='number' min='1' max='60' value='3' onchange='autoSecChange(this.value)'>
          <span class='sec'>giây</span>
          <button id='autoBtn' class='autoBtn' onclick='toggleAuto()'>● Tự động</button>
        </div>
        <select id='bibleVersionSel' class='bibleVersionSel' onchange='setVersion(this.value)'><option value='vie'>Đang tải bản dịch...</option></select>
      </div>
      <div id='chapterBar'></div>
      <div id='bibleBody'></div>
      <div class='bible-nav'>
        <button class='nav-arrow' onclick='verseStep(-1)'>‹</button>
        <button id='plAddBible' class='pl-addbible' onclick='addBibleEntry()'>＋ Kinh Thánh</button>
        <button class='nav-arrow' onclick='verseStep(1)'>›</button>
        <span id='navPos'>-</span>
      </div>
    </div>
  </main>
</div>
<div id='verseModal' style='display:none;position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:20px'>
  <div style='width:100%;max-width:420px;background:#141821;border:1px solid #2a3040;border-radius:12px;padding:16px'>
    <div id='verseModalTitle' style='font-weight:700;font-size:15px;margin-bottom:10px'></div>
    <textarea id='verseModalText' style='width:100%;height:120px;box-sizing:border-box;background:#161a23;border:1px solid #2a3040;color:#eef;border-radius:8px;padding:10px;font-size:14px;line-height:1.5'></textarea>
    <div style='display:flex;gap:8px;margin-top:10px'>
      <button onclick='closeVerseModal()' style='flex:1;background:#232a38;border:1px solid #2a3040;color:#eef;border-radius:8px;padding:10px;font-size:14px;cursor:pointer'>Hủy</button>
      <button onclick='saveVerse()' style='flex:1;background:#3b82f6;border:none;color:#fff;border-radius:8px;padding:10px;font-size:14px;font-weight:700;cursor:pointer'>Lưu</button>
    </div>
  </div>
</div>
<script>
let TOKEN = localStorage.getItem('church_token') || '';
let currentSlide = -1;
let curBook = null, curChapter = null;
let curVersion = 'vie';
let versionsCache = [];
let verseModal = {{ version: '', abbrev: '', chapter: 1, verse: 0 }};
let presentedVerse = -1;
let autoTimer = null;
let autoRunning = false;
let autoEnabled = false;
let autoInterval = 3;
let autoBusy = false;

async function call(path, opts) {{
  opts = opts || {{}};
  opts.headers = Object.assign({{ 'X-Church-Token': TOKEN }}, opts.headers || {{}});
  const r = await fetch(path, opts);
  if (r.status === 401) {{ logout(); throw new Error('unauthorized'); }}
  return r;
}}

async function init() {{
  try {{
    const r = await fetch('/api/companion/needsPin');
    const d = await r.json();
    if (!d.needsPin) {{
      document.getElementById('login').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      refreshAll();
      return;
    }}
  }} catch(e) {{}}
  if (TOKEN) {{ doLogin(); }} else {{ document.getElementById('login').style.display = 'flex'; }}
}}

function logout() {{
  localStorage.removeItem('church_token');
  TOKEN = '';
  document.getElementById('login').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginErr').textContent = 'Phiên hết hạn, nhập lại mã PIN';
}}

function togglePin() {{}}

async function doLogin() {{
  let pin = document.getElementById('pin').value.trim() || TOKEN;
  if (!pin) return;
  TOKEN = pin;
  if (document.getElementById('rememberPin').checked) {{
    localStorage.setItem('church_token', pin);
  }} else {{
    localStorage.removeItem('church_token');
  }}
  document.getElementById('loginErr').textContent = '';
  try {{
    await call('/api/companion/status');
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    refreshAll();
  }} catch(e) {{
    document.getElementById('loginErr').textContent = 'Sai mã PIN, thử lại';
    localStorage.removeItem('church_token');
    TOKEN = '';
  }}
}}

function switchTab(name) {{
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  if (name === 'bible') {{ loadVersions(); if (!curBook) loadBooks(); }}
  if (name === 'slides') {{ loadPlaylists(); }}
  if (name === 'songs') {{ loadSongs(); }}
  if (name === 'output') refreshAll();
}}

function tapNext() {{ call('/api/companion/next').then(refreshAll).catch(()=>{{}}); }}
function tapPrev() {{ call('/api/companion/prev').then(refreshAll).catch(()=>{{}}); }}

async function refreshAll() {{
  try {{
    const r = await call('/api/companion/status');
    const d = await r.json();
    document.getElementById('outLabel').textContent = d.label || d.title || '';
    document.getElementById('outText').textContent = d.text || (d.hasContent ? '…' : '');
    document.getElementById('outPos').textContent = d.slideCount ? ((d.slideIndex+1) + ' / ' + d.slideCount) : '';
    document.getElementById('outNext').textContent = d.next_text ? ('Tiếp theo: ' + (d.next_label ? d.next_label + ' — ' : '') + d.next_text) : '';
    if ((d.bible_ref || null) !== lastBibleRef) {{
      lastBibleRef = d.bible_ref || null;
      syncBibleRef(d.bible_ref);
    }}
  }} catch(e) {{}}
}}

function renderSlides(d) {{
  const box = document.getElementById('slidesList');
  const n = (d.slides && d.slides.length) || 0;
  const idx = (d.slideIndex != null && d.slideIndex >= 0) ? d.slideIndex : -1;
  if (!box || !n) return;
  currentSlide = idx;
  window.__slideCount = n;
  box.innerHTML = d.slides.map((s, i) =>
    '<div class="slide-card' + (i === idx ? ' active' : '') + '" onclick="gotoSlide(' + i + ')">' +
      '<div class="s-label">' + (i + 1) + '. ' + (s.label || '') + '</div>' +
      '<div class="s-text">' + (s.content || '').replace(/</g, '&lt;') + '</div>' +
    '</div>').join('');
}}

function slideStep(dir) {{
  if (currentSlide < 0) return;
  const t = currentSlide + dir;
  if (t < 0 || t >= (window.__slideCount || 1)) return;
  gotoSlide(t);
}}

function gotoSlide(i) {{
  call('/api/companion/goto', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify({{index: i}}) }}).then(refreshAll).catch(()=>{{}});
}}

async function loadBooks() {{
  const box = document.getElementById('bibleBody');
  const cb = document.getElementById('chapterBar');
  if (cb) cb.innerHTML = '';
  box.innerHTML = '<div class="empty">Đang tải...</div>';
  try {{
    const r = await call('/api/companion/bible/books?version=' + encodeURIComponent(curVersion));
    const books = await r.json();
    box.innerHTML = '<div class="books">' + books.map(b =>
      '<div class="b-item" onclick="openChapter(&quot;' + b.abbrev + '&quot;,&quot;' + b.name + '&quot;,' + b.chapters + ')"><div class="t">' + b.name + '</div><div class="s">' + b.chapters + ' chương</div></div>'
    ).join('') + '</div>';
  }} catch(e) {{}}
}}

async function fetchBooks() {{
  const r = await call('/api/companion/bible/books?version=' + encodeURIComponent(curVersion));
  return await r.json();
}}

async function loadVersions() {{
  const sel = document.getElementById('bibleVersionSel');
  if (!sel) return;
  try {{
    const r = await call('/api/companion/bible/versions');
    const versions = await r.json();
    versionsCache = versions;
    const cur = versions.some(v => v.id === curVersion) ? curVersion : (versions.length ? versions[0].id : 'vie');
    sel.innerHTML = versions.map(v => '<option value="' + v.id + '"' + (v.id === cur ? ' selected' : '') + '>' + String(v.name).replace(/</g, '&lt;') + '</option>').join('');
    sel.disabled = false;
    if (cur !== curVersion) setVersion(cur);
  }} catch(e) {{}}
}}

function setVersion(v) {{
  if (v === curVersion) return;
  const was = {{ abbrev: curBook ? curBook.abbrev : null, book: curBook ? curBook.name : null, chapters: curBook ? curBook.chapters : 0, chapter: curChapter, verse: presentedVerse >= 0 ? presentedVerse + 1 : 0 }};
  curVersion = v;
  booksCache = [];
  curBook = null;
  curChapter = null;
  presentedVerse = -1;
  loadBooks();
  if (was.abbrev && was.verse > 0) {{
    loadBookChapter(was.abbrev, was.book, was.chapters, was.chapter || 1).then(function() {{
      presentVerse(was.verse - 1);
    }});
  }}
}}

function editVerse(v) {{
  const rows = document.querySelectorAll('.verse-row .vt');
  const el = rows[v - 1];
  if (!el) return;
  verseModal = {{ version: curVersion, abbrev: curBook.abbrev, chapter: curChapter, verse: v }};
  document.getElementById('verseModalTitle').textContent = curBook.name + ' ' + curChapter + ':' + v;
  document.getElementById('verseModalText').value = el.textContent;
  const m = document.getElementById('verseModal');
  m.style.display = 'flex';
  setTimeout(function() {{ document.getElementById('verseModalText').focus(); }}, 50);
}}

function closeVerseModal() {{
  document.getElementById('verseModal').style.display = 'none';
}}

async function saveVerse() {{
  const text = document.getElementById('verseModalText').value;
  const body = {{ version: verseModal.version, abbrev: verseModal.abbrev, chapter: verseModal.chapter, verse: verseModal.verse, text: text }};
  try {{
    const r = await call('/api/companion/bible/verse', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify(body) }});
    if (!r.ok) {{ const d = await r.json().catch(()=>{{}}); flashSearch(d && d.error ? d.error : 'Lỗi lưu'); return; }}
    closeVerseModal();
    await loadChapter();
    flashSearch('Đã lưu.');
  }} catch(e) {{ flashSearch('Lỗi lưu'); }}
}}

let playlistsCache = [];
let curPlaylist = null;
let songsCache = [];

async function loadPlaylists() {{
  try {{
    const r = await call('/api/companion/playlists');
    playlistsCache = await r.json();
  }} catch(e) {{ playlistsCache = []; }}
  renderPlaylists();
}}

function genEntryId() {{ return 'e' + Date.now() + Math.floor(Math.random() * 1000); }}

async function savePlaylist() {{
  if (!curPlaylist) return;
  curPlaylist.updated_at = Date.now();
  try {{
    const r = await call('/api/companion/playlist/save', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify(curPlaylist) }});
    const saved = await r.json();
    if (saved && saved.id) curPlaylist = saved;
  }} catch(e) {{}}
}}

function renderPlaylists() {{
  const box = document.getElementById('slidesList');
  const head = document.getElementById('slidesSong');
  if (!box) return;
  if (curPlaylist) {{
    head.textContent = 'Dự án: ' + curPlaylist.name;
    const es = curPlaylist.entries || [];
    let html = '<div class="pl-bar">' +
      '<button onclick="curPlaylist=null;renderPlaylists()">← Dự án</button>' +
      '<button onclick="switchTab(&quot;songs&quot;)">＋ Bài hát</button>' +
      '<button onclick="switchTab(&quot;bible&quot;)">＋ Kinh Thánh</button>' +
      '<button class="pl-run" onclick="runTimeline()">▶ Chạy mục lục</button>' +
      '<button class="pl-del" onclick="delPlaylist()">✕ Dự án</button>' +
      '</div>';
    if (!es.length) {{
      html += '<div class="empty">Chưa có mục nào. Bấm ＋ Bài hát hoặc ＋ Kinh Thánh để thêm.</div>';
    }} else {{
      html += '<div class="books">' + es.map(function(e, i) {{
        const kindLabel = e.kind === 'bible' ? '📖 Kinh Thánh' : (e.kind === 'song' ? '🎵 Bài hát' : e.kind);
        return '<div class="b-item" onclick="presentEntry(' + i + ')">' +
          '<div class="t">' + (i+1) + '. ' + String(e.title || '').replace(/</g, '&lt;') + '</div>' +
          '<div class="s">' + kindLabel + ' &nbsp;<span class="pl-play" onclick="event.stopPropagation();presentEntry(' + i + ')">▶</span> <span class="pl-x" onclick="event.stopPropagation();removeEntry(' + i + ')">✕</span></div>' +
          '</div>';
      }}).join('') + '</div>';
    }}
    box.innerHTML = html;
  }} else {{
    head.textContent = 'Dự án buổi nhóm';
    let html = '<div class="pl-bar"><button class="pl-new" onclick="createPlaylist()">＋ Dự án mới</button></div>';
    if (!playlistsCache.length) {{
      html += '<div class="empty">Chưa có dự án nào</div>';
    }} else {{
      html += '<div class="books">' + playlistsCache.map(function(p) {{
        const n = (p.entries || []).length;
        return '<div class="b-item" onclick="openPlaylist(&quot;' + p.id + '&quot;)">' +
          '<div class="t">' + String(p.name || 'Dự án').replace(/</g, '&lt;') + '</div>' +
          '<div class="s">' + n + ' mục · bấm để mở</div>' +
          '</div>';
      }}).join('') + '</div>';
    }}
    box.innerHTML = html;
  }}
}}

async function createPlaylist() {{
  const now = Date.now();
  curPlaylist = {{ id: 'pl_' + now, name: 'Dự án buổi nhóm', entries: [], created_at: now, updated_at: now }};
  await savePlaylist();
  renderPlaylists();
}}

async function openPlaylist(id) {{
  curPlaylist = playlistsCache.find(function(p) {{ return p.id === id; }}) || null;
  if (!curPlaylist) {{
    const r = await call('/api/companion/playlists');
    playlistsCache = await r.json();
    curPlaylist = playlistsCache.find(function(p) {{ return p.id === id; }}) || null;
  }}
  renderPlaylists();
}}

async function delPlaylist() {{
  if (!curPlaylist) return;
  if (!confirm('Xóa dự án "' + curPlaylist.name + '"?')) return;
  await call('/api/companion/playlist/delete', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify({{id: curPlaylist.id}}) }});
  curPlaylist = null;
  await loadPlaylists();
}}

function ensurePlaylist() {{
  if (curPlaylist) return;
  const now = Date.now();
  curPlaylist = {{ id: 'pl_' + now, name: 'Dự án buổi nhóm', entries: [], created_at: now, updated_at: now }};
}}

async function addSongEntry(song) {{
  ensurePlaylist();
  curPlaylist.entries = curPlaylist.entries || [];
  curPlaylist.entries.push({{ id: genEntryId(), kind: 'song', ref_id: song.id, title: song.title, estimated_duration_sec: null, actual_start_time: null, arrangement_id: null }});
  await savePlaylist();
  switchTab('slides');
}}

async function addBibleEntry() {{
  if (!curBook || !curChapter) {{ flashSearch('Chọn sách chương trước'); return; }}
  const v = presentedVerse >= 0 ? presentedVerse + 1 : 1;
  const title = curBook.name + ' ' + curChapter + ':' + v;
  ensurePlaylist();
  curPlaylist.entries = curPlaylist.entries || [];
  curPlaylist.entries.push({{ id: genEntryId(), kind: 'bible', ref_id: curBook.abbrev + '|' + curChapter + '|' + v + '|' + v + '|' + curVersion, title: title, estimated_duration_sec: null, actual_start_time: null, arrangement_id: null }});
  await savePlaylist();
  flashSearch('Đã thêm: ' + title);
}}

async function removeEntry(i) {{
  if (!curPlaylist) return;
  curPlaylist.entries.splice(i, 1);
  await savePlaylist();
  renderPlaylists();
}}

async function presentEntry(i) {{
  if (!curPlaylist) return;
  await call('/api/companion/playlist/goto', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify({{id: curPlaylist.id, index: i}}) }});
  refreshAll();
}}

async function runTimeline() {{
  if (!curPlaylist) return;
  await call('/api/companion/timeline/start', {{ method: 'POST' }});
  await call('/api/companion/playlist/load', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify({{id: curPlaylist.id}}) }});
  refreshAll();
  switchTab('output');
}}

async function loadSongs() {{
  const box = document.getElementById('songsList');
  const head = document.getElementById('songsHead');
  if (!box) return;
  try {{
    const r = await call('/api/companion/songs');
    songsCache = await r.json();
  }} catch(e) {{ songsCache = []; }}
  head.textContent = 'Bài hát có sẵn';
  if (!songsCache.length) {{
    box.innerHTML = '<div class="empty">Chưa có bài hát nào</div>';
    return;
  }}
  box.innerHTML = '<div class="books">' + songsCache.map(function(s) {{
    return '<div class="b-item" onclick="presentSong(' + JSON.stringify(s.id) + ')">' +
      '<div class="t">' + String(s.title || '').replace(/</g, '&lt;') + '</div>' +
      '<div class="s">' + (s.artist ? String(s.artist).replace(/</g, '&lt;') + ' · ' : '') + (s.key || '') + ' · ' + s.slideCount + ' slide · <span class="pl-x" onclick="event.stopPropagation();addSongEntry(' + JSON.stringify(s).replace(/"/g, '&quot;') + ')">＋ Mục lục</span></div>' +
      '</div>';
  }}).join('') + '</div>';
}}

async function presentSong(songId) {{
  await call('/api/companion/song/present', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify({{song_id: songId}}) }});
  refreshAll();
  switchTab('output');
}}

async function loadBookChapter(abbrev, name, chapters, chapter) {{
  curBook = {{ abbrev, name, chapters: chapters || 1 }};
  curChapter = chapter || 1;
  presentedVerse = -1;
  stopAuto();
  syncAuto();
  await loadChapter();
}}

function openChapter(abbrev, name, nch) {{
  loadBookChapter(abbrev, name, nch, 1);
}}

async function stepChapter(dir) {{
  if (dir > 0) {{
    if (curChapter < curBook.chapters) {{ await loadBookChapter(curBook.abbrev, curBook.name, curBook.chapters, curChapter + 1); return true; }}
    const books = await fetchBooks();
    const idx = books.findIndex(b => b.abbrev === curBook.abbrev);
    if (idx >= 0 && idx < books.length - 1) {{ const nb = books[idx + 1]; await loadBookChapter(nb.abbrev, nb.name, nb.chapters, 1); return true; }}
    return false;
  }} else {{
    if (curChapter > 1) {{ await loadBookChapter(curBook.abbrev, curBook.name, curBook.chapters, curChapter - 1); return true; }}
    const books = await fetchBooks();
    const idx = books.findIndex(b => b.abbrev === curBook.abbrev);
    if (idx > 0) {{ const pb = books[idx - 1]; await loadBookChapter(pb.abbrev, pb.name, pb.chapters, pb.chapters); return true; }}
    return false;
  }}
}}

async function loadChapter() {{
  const box = document.getElementById('bibleBody');
  const cb = document.getElementById('chapterBar');
  if (!curBook) return;
  if (cb) cb.innerHTML = '<div class="ch-grid">' + (curChapter > 1 ? '<button onclick="curChapter--;loadChapter()">‹</button>' : '') + '<button class="active">' + curChapter + '</button></div>';
  box.innerHTML = '<div class="empty">Đang tải...</div>';
  const r = await call('/api/companion/bible/chapter?version=' + encodeURIComponent(curVersion) + '&abbrev=' + curBook.abbrev + '&chapter=' + curChapter);
  const ch = await r.json();
  if (cb) cb.innerHTML = '<div class="ch-grid">' +
    Array.from({{length: curBook.chapters}}, (_, n) => n+1).map(n =>
      '<button class="' + (n === curChapter ? 'active' : '') + '" onclick="curChapter=' + n + ';presentedVerse=-1;stopAuto();loadChapter()">' + n + '</button>').join('') +
    '</div>';
  const canEdit = curVersion !== 'online';
  box.innerHTML = '<div class="book-bar"><button onclick="loadBooks()">‹ Sách</button><span class="bname">' + ch.name + ' ' + ch.chapter + '</span></div><div class="verses">' + ch.verses.map((v, i) => v ? '<div class="verse-row' + (i === presentedVerse ? ' presenting' : '') + '" onclick="playFrom(' + i + ')"><span class="no">' + (i+1) + '</span><span class="vt">' + v.replace(/</g, '&lt;') + '</span>' + (canEdit ? '<button class="editbtn" onclick="event.stopPropagation();editVerse(' + (i+1) + ')">✎</button>' : '') + '</div>' : '').join('') + '</div>';
}}

async function presentVerse(i) {{
  const body = {{ version: curVersion, abbrev: curBook.abbrev, chapter: curChapter, verses: [i + 1] }};
  try {{
    await call('/api/companion/bible/present', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify(body) }});
    presentedVerse = i;
    setPresenting(i);
    refreshAll();
    scrollToPresented(i);
    updateNavPos();
  }} catch(e) {{}}
}}

async function presentVerses(chapter, arr) {{
  const body = {{ version: curVersion, abbrev: curBook.abbrev, chapter: chapter, verses: arr }};
  try {{
    await call('/api/companion/bible/present', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify(body) }});
    presentedVerse = arr[0] - 1;
    setPresenting(presentedVerse);
    refreshAll();
    scrollToPresented(presentedVerse);
    updateNavPos();
  }} catch(e) {{}}
}}

function setPresenting(i) {{
  document.querySelectorAll('.verse-row').forEach(function(r, idx) {{
    r.classList.toggle('presenting', idx === i);
  }});
}}

function verseStep(d) {{
  const total = chapterVerseCount();
  if (total === 0) return;
  const i = presentedVerse >= 0 ? presentedVerse + d : (d > 0 ? 0 : total - 1);
  if (d > 0 && i >= total) {{ stepChapter(1).then(function(ok) {{ if (ok) presentVerse(0); }}); return; }}
  if (d < 0 && i < 0) {{ stepChapter(-1).then(function(ok) {{ if (ok) {{ const c = chapterVerseCount(); if (c) presentVerse(c - 1); }} }}); return; }}
  presentVerse(i);
}}

function updateNavPos() {{
  const p = document.getElementById('navPos');
  if (!p) return;
  const total = chapterVerseCount();
  p.textContent = (presentedVerse >= 0 && total) ? ((presentedVerse + 1) + ' / ' + total) : '-';
}}

function norm(s) {{ return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ð/g, 'd'); }}
function comp(s) {{ return norm(s).replace(/[^a-z0-9]/g, ''); }}

function matchBooks(q) {{
  const needle = comp(q);
  const ql = (q || '').trim().toLowerCase();
  const byShort = booksCache.filter(b => comp(b.short) === needle || comp(b.name) === needle);
  if (byShort.length) return byShort;
  const byAbbrev = booksCache.filter(b => b.abbrev.toLowerCase() === ql);
  const byPrefix = booksCache.filter(b => comp(b.name).startsWith(needle) || comp(b.short).startsWith(needle));
  const seen = {{}};
  return byAbbrev.concat(byPrefix).filter(b => seen[b.abbrev] ? false : (seen[b.abbrev] = true));
}}

let booksCache = [];
let lastBibleRef = null;

async function searchBible() {{
  const s = document.getElementById('bibleSearch');
  const q = (s.value || '').trim();
  if (!q || /^\d+$/.test(q)) {{ flashSearch('Vd: Sáng 1:3'); return; }}
  if (!booksCache.length) {{ try {{ booksCache = await fetchBooks(); }} catch(e) {{}} }}
  if (!booksCache.length) {{ flashSearch('Lỗi dữ liệu'); return; }}
  let book = null, chapter = 1, startVerse = 0, endVerse = 0;
  const m = q.match(/^\s*(.+?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?\s*$/);
  if (m) {{
    const needle = comp(m[1]);
    const matches = matchBooks(m[1]);
    if (!matches.length) {{ flashSearch('Không tìm thấy sách'); return; }}
    chapter = parseInt(m[2], 10);
    startVerse = m[3] ? parseInt(m[3], 10) : 0;
    endVerse = m[4] ? parseInt(m[4], 10) : 0;
    if (matches.length > 1) {{ showBookPicker(matches, chapter, startVerse, endVerse); return; }}
    book = matches[0];
  }} else {{
    const needle = comp(q);
    const matches = matchBooks(q);
    if (!matches.length) {{ flashSearch('Không tìm thấy sách'); return; }}
    if (matches.length > 1) {{ showBookPicker(matches, 1, 0, 0); return; }}
    book = matches[0];
  }}
  if (chapter < 1 || chapter > book.chapters) {{ flashSearch('Chương không tồn tại'); return; }}
  await loadBookChapter(book.abbrev, book.name, book.chapters, chapter);
  if (startVerse) {{
    const end = endVerse && endVerse >= startVerse ? endVerse : startVerse;
    if (startVerse < 1 || end > chapterVerseCount()) {{ flashSearch('Câu không tồn tại'); return; }}
    const arr = [];
    for (let k = startVerse; k <= end; k++) arr.push(k);
    presentVerses(chapter, arr);
  }}
  s.value = '';
  s.blur();
}}

async function searchKey() {{
  const s = document.getElementById('bibleSearch');
  if (!s) return;
  const v = s.value;
  if (!booksCache.length) {{ try {{ booksCache = await fetchBooks(); }} catch(e) {{}} }}
  if (v.endsWith(' ')) {{
    const body = v.slice(0, -1);
    for (const b of booksCache) {{
      const pref = b.name + ' ';
      if (body.startsWith(pref)) {{
        const rest = body.slice(pref.length);
        if (/^\d+:\d+$/.test(rest)) {{ s.value = body + '-'; return; }}
        if (/^\d+$/.test(rest)) {{ s.value = body + ':'; return; }}
        break;
      }}
      const sref = b.short + ' ';
      if (body.startsWith(sref)) {{
        const rest = body.slice(sref.length);
        if (/^\d+:\d+$/.test(rest)) {{ s.value = body + '-'; return; }}
        if (/^\d+$/.test(rest)) {{ s.value = body + ':'; return; }}
        break;
      }}
    }}
    return;
  }}
  const parts = v.split(/\s+/).filter(Boolean);
  if (parts.length === 1 && !/^\d+$/.test(parts[0]) && booksCache.length) {{
    const needle = comp(parts[0]);
    const books = matchBooks(parts[0]);
    if (books.length === 1 && s.value !== books[0].name) s.value = books[0].name + ' ';
  }}
}}

function showBookPicker(books, chapter, startVerse, endVerse) {{
  const box = document.getElementById('bibleBody');
  box.innerHTML = '<div style="font-size:13px;color:#8b93a7;margin-bottom:8px">Tên gọi trùng, chọn sách:</div><div class="books">' + books.map(b =>
    '<div class="b-item" onclick="pickBook(&quot;' + b.abbrev + '&quot;,&quot;' + b.name + '&quot;,' + b.chapters + ',' + chapter + ',' + startVerse + ',' + endVerse + ')"><div class="t">' + b.name + '</div><div class="s">' + b.chapters + ' chương</div></div>'
  ).join('') + '</div>';
}}

function pickBook(abbrev, name, chapters, chapter, startVerse, endVerse) {{
  loadBookChapter(abbrev, name, chapters, chapter || 1).then(function() {{
    if (startVerse > 0) {{
      const end = endVerse >= startVerse ? endVerse : startVerse;
      if (end > chapterVerseCount()) {{ flashSearch('Câu không tồn tại'); return; }}
      const arr = [];
      for (let k = startVerse; k <= end; k++) arr.push(k);
      presentVerses(chapter || 1, arr);
    }}
  }});
}}

function flashSearch(msg) {{
  const s = document.getElementById('bibleSearch');
  if (!s) return;
  s.value = msg;
  s.classList.add('err');
  setTimeout(function() {{ s.value = ''; s.classList.remove('err'); }}, 1600);
}}

function playFrom(i) {{
  presentVerse(i);
  if (!autoEnabled) return;
  stopAuto();
  autoRunning = true;
  autoTimer = setInterval(autoTick, autoInterval * 1000);
}}

function autoTick() {{
  if (autoBusy) return;
  const total = chapterVerseCount();
  const next = presentedVerse + 1;
  if (next >= total) {{
    autoBusy = true;
    stepChapter(1).then(function(ok) {{
      autoBusy = false;
      if (!ok) {{ stopAuto(); return; }}
      if (autoRunning) presentVerse(0);
    }});
    return;
  }}
  presentVerse(next);
}}

function stopAuto() {{
  if (autoTimer) {{ clearInterval(autoTimer); autoTimer = null; }}
  autoRunning = false;
}}

function toggleAuto() {{
  autoEnabled = !autoEnabled;
  syncAuto();
  if (autoEnabled) startAutoFrom(); else stopAuto();
}}

function startAutoFrom() {{
  stopAuto();
  const total = chapterVerseCount();
  if (total === 0) return;
  let start = presentedVerse >= 0 ? presentedVerse + 1 : 0;
  if (start >= total) start = 0;
  if (start !== presentedVerse) presentVerse(start);
  autoRunning = true;
  autoTimer = setInterval(function() {{
    const next = presentedVerse + 1;
    if (next >= chapterVerseCount()) {{ stopAuto(); return; }}
    presentVerse(next);
  }}, autoInterval * 1000);
}}

function autoSecChange(v) {{
  const s = parseInt(v, 10);
  if (s > 0 && s <= 3600) autoInterval = s;
  if (autoRunning) startAutoFrom();
}}

function syncAuto() {{
  const b = document.getElementById('autoBtn');
  if (!b) return;
  b.classList.toggle('on', autoEnabled);
  b.textContent = autoEnabled ? '● Đang theo dõi' : '● Tự động';
}}

function scrollToPresented(i) {{
  const rows = document.querySelectorAll('.verse-row');
  if (i >= 0 && rows[i]) rows[i].scrollIntoView({{ block: 'center', behavior: 'smooth' }});
}}

function scrollToPresentedFast(i) {{
  const rows = document.querySelectorAll('.verse-row');
  if (i >= 0 && rows[i]) rows[i].scrollIntoView({{ block: 'center', behavior: 'auto' }});
}}

function chapterVerseCount() {{
  return document.querySelectorAll('.verse-row').length;
}}

async function syncBibleRef(ref) {{
  if (!ref) return;
  const p = ref.split('|');
  if (p.length < 3) return;
  const abbrev = p[0], chapter = parseInt(p[1], 10), verse = parseInt(p[2], 10);
  if (!abbrev || !chapter || !verse) return;
  if (!booksCache.length) {{ try {{ booksCache = await fetchBooks(); }} catch(e) {{ return; }} }}
  const book = booksCache.find(b => b.abbrev === abbrev);
  if (!book) return;
  try {{
    const target = verse - 1;
    if (curBook && curBook.abbrev === abbrev && curChapter === chapter) {{
      presentedVerse = target;
      setPresenting(presentedVerse);
      updateNavPos();
      scrollToPresentedFast(target);
    }} else {{
      await loadBookChapter(book.abbrev, book.name, book.chapters, chapter);
      presentedVerse = target;
      setPresenting(presentedVerse);
      updateNavPos();
      scrollToPresentedFast(target);
    }}
  }} catch(e) {{}}
}}

function startEvents() {{
  var es;
  try {{ es = new EventSource('/api/v1/events'); }} catch(e) {{ return; }}
  es.onmessage = function(ev) {{
    var d;
    try {{ d = JSON.parse(ev.data); }} catch(e) {{ return; }}
    if (!d) return;
    var cur = d.current;
    var has = !!cur;
    document.getElementById('outLabel').textContent = has ? ((cur.label || cur.title) || '') : '';
    document.getElementById('outText').textContent = has ? (cur.text || '…') : '';
    document.getElementById('outNext').textContent = d.next_text ? ('Tiếp theo: ' + (d.next_label ? d.next_label + ' — ' : '') + d.next_text) : '';
    var ref = cur && cur.bible_ref ? cur.bible_ref : null;
    if (ref !== lastBibleRef) {{
      lastBibleRef = ref;
      syncBibleRef(ref);
    }}
  }};
  es.onerror = function() {{}};
}}

init();
startEvents();
setInterval(refreshAll, 250);
</script>
</body></html>"#,
        STYLE = style,
    );
    html
}

/// So sánh chuỗi trong thời gian tỷ lệ với chuỗi dài hơn (không rẽ nhánh sớm
/// theo từng byte), tránh timing attack qua `==` chuỗi thường. Byte thiếu khi
/// độ dài khác nhau được coi là `0`, nên chuỗi khác độ dài luôn trả `false`
/// mà không trả về sớm.
fn ct_str_eq(a: &str, b: &str) -> bool {
    let ab = a.as_bytes();
    let bb = b.as_bytes();
    let max_len = ab.len().max(bb.len());
    let mut diff = 0u8;
    for i in 0..max_len {
        let x = ab.get(i).copied().unwrap_or(0);
        let y = bb.get(i).copied().unwrap_or(0);
        diff |= x ^ y;
    }
    diff == 0
}

fn api_key_ok(headers: &[Header], api_key: &str) -> bool {
    if api_key.is_empty() {
        return true;
    }
    headers
        .iter()
        .any(|h| h.field.equiv("X-API-Key") && ct_str_eq(h.value.as_str(), api_key))
}

fn is_authorized(req: &Request, api_key: &str) -> bool {
    api_key_ok(req.headers(), api_key)
}

/// True nếu PIN rỗng (không cài mật khẩu) hoặc header `X-Church-Token` khớp
/// PIN. Tách thành hàm thuần để test được luồng xác thực — xem module test.
fn church_token_ok(headers: &[Header], pin: &str) -> bool {
    pin.is_empty()
        || headers.iter().any(|h| {
            h.field.equiv("X-Church-Token") && ct_str_eq(h.value.as_str(), pin)
        })
}

fn auth_ok(req: &Request, api_key: &str) -> Result<(), Response<io::Cursor<Vec<u8>>>> {
    if is_authorized(req, api_key) {
        Ok(())
    } else {
        Err(json_response(
            StatusCode(401),
            "{\"error\":\"unauthorized\"}".to_string(),
        ))
    }
}

struct SseSource {
    queue: std::sync::mpsc::Receiver<Vec<u8>>,
    current: Vec<u8>,
    pos: usize,
}

impl Read for SseSource {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        while self.pos >= self.current.len() {
            self.current = self
                .queue
                .recv()
                .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "client disconnected"))?;
            self.pos = 0;
        }
        let n = std::cmp::min(buf.len(), self.current.len() - self.pos);
        buf[..n].copy_from_slice(&self.current[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

fn handle(app: AppHandle, mut req: Request) {
    let url = req.url().to_string();
    let method = req.method().clone();

    if method == Method::Options {
        let _ = req.respond(
            Response::from_string("")
                .with_status_code(StatusCode(204))
                .with_header(header("Access-Control-Allow-Origin", "*"))
                .with_header(header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"))
                .with_header(header("Access-Control-Allow-Headers", "Content-Type, X-API-Key")),
        );
        return;
    }

    let state = app.state::<AppState>();
    let settings = state.settings.lock().map(|s| s.clone()).unwrap_or_default();
    let ip = lan_ip();
    let base = base_url(&ip, settings.server_port);
    let server_enabled = settings.server_enabled;
    let companion_enabled = settings.companion_enabled;
    let stage_remote_enabled = settings.stage_remote_enabled;
    let api_enabled = settings.api_enabled;
    let api_key = settings.api_key.clone();

    if !server_enabled {
        let _ = req.respond(json_response(StatusCode(403), "{\"error\":\"server disabled\"}".to_string()));
        return;
    }

    // Server info (always served when server enabled)
    if url == "/api/info" {
        let body = serde_json::json!({
            "base_url": base,
            "server_enabled": server_enabled,
            "companion_enabled": companion_enabled,
            "stage_remote_enabled": stage_remote_enabled,
            "api_enabled": api_enabled,
            "port": settings.server_port,
        })
        .to_string();
        let _ = req.respond(json_response(StatusCode(200), body));
        return;
    }

    // Public API v1
    if url.starts_with("/api/v1/") {
        if !api_enabled {
            let _ = req.respond(json_response(StatusCode(403), "{\"error\":\"api disabled\"}".to_string()));
            return;
        }
        match auth_ok(&req, &api_key) {
            Err(resp) => {
                let _ = req.respond(resp);
                return;
            }
            Ok(_) => {}
        }

        if url == "/api/v1/status" {
            let live = state.live.lock().map(|g| g.clone()).unwrap_or_default();
            let body = serde_json::to_string(&live).unwrap_or_else(|_| "{}".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/v1/playlists" {
            let playlists = state.playlists.lock().map(|g| g.clone()).unwrap_or_default();
            let body = serde_json::to_string(&playlists).unwrap_or_else(|_| "[]".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/v1/slide/next" {
            let _ = crate::commands::output::advance_live(app.clone(), app.state::<AppState>(), 1);
            let live = state.live.lock().map(|g| g.clone()).unwrap_or_default();
            let body = serde_json::to_string(&live).unwrap_or_else(|_| "{}".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/v1/slide/prev" {
            let _ = crate::commands::output::advance_live(app.clone(), app.state::<AppState>(), -1);
            let live = state.live.lock().map(|g| g.clone()).unwrap_or_default();
            let body = serde_json::to_string(&live).unwrap_or_else(|_| "{}".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/v1/slide/goto" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(idx) = v.get("index").and_then(|i| i.as_u64()) {
                    let _ = crate::commands::output::goto_slide(
                        app.clone(),
                        app.state::<AppState>(),
                        idx as usize,
                    );
                }
            }
            let live = state.live.lock().map(|g| g.clone()).unwrap_or_default();
            let body = serde_json::to_string(&live).unwrap_or_else(|_| "{}".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/v1/output/clear" && method == Method::Post {
            let _ = crate::commands::output::clear_live(app.clone(), app.state::<AppState>());
            let live = state.live.lock().map(|g| g.clone()).unwrap_or_default();
            let body = serde_json::to_string(&live).unwrap_or_else(|_| "{}".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/v1/playlist/load" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(pid) = v.get("playlistId").and_then(|p| p.as_str()) {
                    let _ = crate::commands::output::load_playlist(
                        app.clone(),
                        app.state::<AppState>(),
                        pid.to_string(),
                    );
                }
            }
            let live = state.live.lock().map(|g| g.clone()).unwrap_or_default();
            let body = serde_json::to_string(&live).unwrap_or_else(|_| "{}".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/v1/events" {
            let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
            let app_for_thread = app.clone();
            thread::spawn(move || loop {
                let live = app_for_thread
                    .state::<AppState>()
                    .live
                    .lock()
                    .map(|g| g.clone())
                    .unwrap_or_default();
                let payload = serde_json::to_string(&live).unwrap_or_else(|_| "{}".into());
                let line = format!("data: {}\n\n", payload);
                if tx.send(line.into_bytes()).is_err() {
                    break;
                }
                thread::sleep(Duration::from_millis(50));
            });
            let resp = Response::new(
                StatusCode(200),
                vec![
                    header("Content-Type", "text/event-stream"),
                    header("Cache-Control", "no-cache"),
                    header("Access-Control-Allow-Origin", "*"),
                ],
                SseSource {
                    queue: rx,
                    current: Vec::new(),
                    pos: 0,
                },
                None,
                None,
            );
            let sse_req = req;
            thread::spawn(move || {
                let _ = sse_req.respond(resp);
            });
            return;
        }

        let _ = req.respond(json_response(StatusCode(404), "{\"error\":\"not found\"}".to_string()));
        return;
    }

    // Stage Remote: điều khiển Stage/Output từ điện thoại
    if url == "/stage" || url == "/stage/index.html" {
        if !stage_remote_enabled {
            let _ = req.respond(json_response(StatusCode(403), "{\"error\":\"stage remote disabled\"}".to_string()));
            return;
        }
        let _ = req.respond(
            Response::from_string(stage_remote_html())
                .with_header(header("Content-Type", "text/html; charset=utf-8"))
                .with_header(header("Access-Control-Allow-Origin", "*")),
        );
        return;
    }
    if url == "/stage/qr.svg" {
        if !stage_remote_enabled {
            let _ = req.respond(json_response(StatusCode(403), "{\"error\":\"stage remote disabled\"}".to_string()));
            return;
        }
        let target = format!("{}/stage", base);
        if let Ok(code) = qrcode::QrCode::new(target.as_bytes()) {
            let svg = code
                .render::<qrcode::render::svg::Color>()
                .min_dimensions(420, 420)
                .build();
            let _ = req.respond(
                Response::from_string(svg)
                    .with_header(header("Content-Type", "image/svg+xml"))
                    .with_header(header("Access-Control-Allow-Origin", "*")),
            );
            return;
        }
    }
    if url.starts_with("/stage/api/") {
        if !stage_remote_enabled {
            let _ = req.respond(json_response(StatusCode(403), "{\"error\":\"stage remote disabled\"}".to_string()));
            return;
        }
        if url == "/stage/api/status" {
            let live = state.live.lock().map(|g| g.clone()).unwrap_or_default();
            let current = live.current.clone();
            let song = state
                .songs
                .lock()
                .map(|songs| {
                    songs
                        .iter()
                        .find(|s| Some(&s.id) == live.song_id.as_ref())
                        .cloned()
                })
                .unwrap_or_default();
            let order = if let Some(song) = &song {
                resolve_song_order(song, live.arrangement_id.as_deref())
            } else {
                Vec::new()
            };
            let index = live.song_slide_index.unwrap_or(0);
            let count = order.len();
            let slides: Vec<serde_json::Value> = order
                .iter()
                .map(|sid| {
                    let s = song
                        .as_ref()
                        .and_then(|song| song.slides.iter().find(|sl| sl.id == *sid));
                    serde_json::json!({
                        "id": sid,
                        "label": s.as_ref().map(|s| s.label.clone()).unwrap_or_default(),
                        "content": s.as_ref().map(|s| s.text.clone()).unwrap_or_default(),
                    })
                })
                .collect();
            let body = serde_json::json!({
                "hasContent": current.is_some(),
                "title": current.as_ref().map(|c| c.title.clone()).unwrap_or_default(),
                "label": current.as_ref().and_then(|c| c.label.clone()).unwrap_or_default(),
                "text": current.as_ref().and_then(|c| c.text.clone()).unwrap_or_default(),
                "next_label": live.next_label.clone(),
                "next_text": live.next_text.clone(),
                "song_title": song.as_ref().map(|s| s.title.clone()),
                "slideIndex": index,
                "slideCount": count,
                "slides": slides,
                "bible_ref": current.as_ref().and_then(|c| c.bible_ref.clone()),
            })
            .to_string();
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/stage/api/next" {
            let _ = crate::commands::output::advance_live(app.clone(), app.state::<AppState>(), 1);
        } else if url == "/stage/api/prev" {
            let _ = crate::commands::output::advance_live(app.clone(), app.state::<AppState>(), -1);
        } else if url == "/stage/api/clear" {
            let _ = crate::commands::output::clear_live(app.clone(), app.state::<AppState>());
        } else if url == "/stage/api/timeline/start" {
            let _ = crate::commands::output::start_service_timeline(app.clone(), app.state::<AppState>());
        } else if url == "/stage/api/timeline/stop" {
            let _ = crate::commands::output::stop_service_timeline(app.clone(), app.state::<AppState>());
        } else if url == "/stage/api/message" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                let msg = v.get("message").and_then(|m| m.as_str()).unwrap_or("");
                let _ = crate::commands::output::set_stage_message(
                    app.clone(),
                    app.state::<AppState>(),
                    msg.to_string(),
                );
            }
        } else if url == "/stage/api/goto" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(idx) = v.get("index").and_then(|i| i.as_u64()) {
                    let _ = crate::commands::output::goto_slide(
                        app.clone(),
                        app.state::<AppState>(),
                        idx as usize,
                    );
                }
            }
        } else if url == "/stage/api/song" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(pid) = v.get("playlistId").and_then(|p| p.as_str()) {
                    let _ = crate::commands::output::load_playlist(
                        app.clone(),
                        app.state::<AppState>(),
                        pid.to_string(),
                    );
                }
            }
        }
        if url == "/stage/api/bible/versions" {
            let versions: Vec<crate::bible::BibleVersion> = crate::bible::list_bible_versions(app.clone())
                .into_iter()
                .filter(|v| v.id != "online")
                .collect();
            let body = serde_json::to_string(&versions).unwrap_or_else(|_| "[]".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/stage/api/bible/books" || url.starts_with("/stage/api/bible/books?") {
            let version = url
                .split('?')
                .nth(1)
                .map(|q| parse_query(q))
                .and_then(|m| m.get("version").cloned())
                .unwrap_or_default();
            let version = if version.is_empty() { None } else { Some(version) };
            match crate::bible::get_bible_books_version(app.clone(), version) {
                Ok(books) => {
                    let body = serde_json::to_string(&books).unwrap_or_else(|_| "[]".into());
                    let _ = req.respond(json_response(StatusCode(200), body));
                }
                Err(e) => {
                    let body = serde_json::json!({"error": e}).to_string();
                    let _ = req.respond(json_response(StatusCode(404), body));
                }
            }
            return;
        }
        if let Some(query) = url.strip_prefix("/stage/api/bible/chapter?") {
            let params = parse_query(query);
            let version = params.get("version").cloned().unwrap_or_default();
            let version = if version.is_empty() { None } else { Some(version) };
            let abbrev = params.get("abbrev").cloned().unwrap_or_default();
            let chapter = params.get("chapter").and_then(|v| v.parse::<usize>().ok()).unwrap_or(1);
            match crate::bible::get_bible_chapter_version(app.clone(), version, abbrev, chapter) {
                Ok(ch) => {
                    let body = serde_json::to_string(&ch).unwrap_or_else(|_| "{}".into());
                    let _ = req.respond(json_response(StatusCode(200), body));
                }
                Err(e) => {
                    let body = serde_json::json!({"error": e}).to_string();
                    let _ = req.respond(json_response(StatusCode(404), body));
                }
            }
            return;
        }
        if url == "/stage/api/bible/verse" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = v.get("version").and_then(|x| x.as_str()).unwrap_or("");
                let abbrev = v.get("abbrev").and_then(|x| x.as_str()).unwrap_or("");
                let chapter = v.get("chapter").and_then(|x| x.as_u64()).unwrap_or(0) as usize;
                let verse = v.get("verse").and_then(|x| x.as_u64()).unwrap_or(0) as usize;
                let text = v.get("text").and_then(|x| x.as_str()).unwrap_or("");
                match crate::bible::edit_bible_verse(app.clone(), id.to_string(), abbrev.to_string(), chapter, verse, text.to_string()) {
                    Ok(()) => {
                        let _ = req.respond(json_response(StatusCode(200), "{\"ok\":true}".to_string()));
                    }
                    Err(e) => {
                        let body = serde_json::json!({"error": e}).to_string();
                        let _ = req.respond(json_response(StatusCode(400), body));
                    }
                }
            } else {
                let _ = req.respond(json_response(StatusCode(400), "{\"error\":\"bad json\"}".to_string()));
            }
            return;
        }
        if url == "/stage/api/bible/present" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                let version = v.get("version").and_then(|x| x.as_str()).unwrap_or("");
                let version = if version.is_empty() { None } else { Some(version.to_string()) };
                let abbrev = v.get("abbrev").and_then(|x| x.as_str()).unwrap_or("");
                let chapter = v.get("chapter").and_then(|x| x.as_u64()).unwrap_or(1) as usize;
                let verses: Vec<usize> = v
                    .get("verses")
                    .and_then(|x| x.as_array())
                    .map(|a| a.iter().filter_map(|i| i.as_u64().map(|n| n as usize)).collect())
                    .unwrap_or_default();
                let present = crate::bible::present_bible_selection_version(&app, version.clone(), abbrev, chapter, verses);
                if let Some(slide) = present {
                    let style = resolve_bible_style(&app, &settings, &state, version.as_deref());
                    let mut l = state.live.lock().map(|g| g.clone()).unwrap_or_default();
                    l.current = Some(merge_slide_style(slide, style));
                    l.next_text = None;
                    l.next_label = None;
                    let _ = crate::commands::output::set_live_state(app.clone(), app.state::<AppState>(), l);
                    let body = serde_json::json!({"ok": true}).to_string();
                    let _ = req.respond(json_response(StatusCode(200), body));
                } else {
                    let _ = req.respond(json_response(StatusCode(404), "{\"error\":\"not found\"}".to_string()));
                }
            }
            return;
        }
        let live = state.live.lock().map(|g| g.clone()).unwrap_or_default();
        let body = serde_json::to_string(&live).unwrap_or_else(|_| "{}".into());
        let _ = req.respond(json_response(StatusCode(200), body));
        return;
    }

    // Companion page
    if !companion_enabled {
        let _ = req.respond(json_response(StatusCode(403), "{\"error\":\"companion disabled\"}".to_string()));
        return;
    }
    let pin = crate::state::ensure_companion_password(&app, &state);
    if url == "/" || url == "/index.html" {
        let _ = req.respond(
            Response::from_string(companion_html())
                .with_header(header("Content-Type", "text/html; charset=utf-8"))
                .with_header(header("Access-Control-Allow-Origin", "*")),
        );
        return;
    }
    if url == "/api/companion/needsPin" {
        let body = serde_json::json!({ "needsPin": !pin.is_empty() }).to_string();
        let _ = req.respond(json_response(StatusCode(200), body));
        return;
    }
    // Church App: xem + điều khiển lyrics, slide list, Kinh thánh
    // Auth: header X-Church-Token = companion_password (bỏ trống = không cần mật khẩu)
    if url.starts_with("/api/companion") && !url.starts_with("/api/companion/bible") {
        let live = state.live.lock().map(|g| g.clone()).unwrap_or_default();
        let songs = state.songs.lock().map(|g| g.clone()).unwrap_or_default();

        if !church_token_ok(req.headers(), &pin) {
            let _ = req.respond(json_response(StatusCode(401), "{\"error\":\"unauthorized\"}".to_string()));
            return;
        }

        // Trạng thái + lời + next + danh sách slide của bài hiện tại
        if url == "/api/companion/status" {
            let current = live.current.clone();
            let song = songs.iter().find(|s| Some(&s.id) == live.song_id.as_ref());
            let order = if let Some(song) = song {
                resolve_song_order(song, live.arrangement_id.as_deref())
            } else {
                Vec::new()
            };
            let index = live.song_slide_index.unwrap_or(0);
            let count = order.len();
            let slides: Vec<serde_json::Value> = order
                .iter()
                .map(|sid| {
                    let s = song.and_then(|song| song.slides.iter().find(|sl| sl.id == *sid));
                    serde_json::json!({
                        "id": sid,
                        "label": s.as_ref().map(|s| s.label.clone()).unwrap_or_default(),
                        "content": s.as_ref().map(|s| s.text.clone()).unwrap_or_default(),
                        "active": false,
                    })
                })
                .collect();
            let body = serde_json::json!({
                "hasContent": current.is_some(),
                "title": current.as_ref().map(|c| c.title.clone()).unwrap_or_default(),
                "label": current.as_ref().and_then(|c| c.label.clone()).unwrap_or_default(),
                "text": current.as_ref().and_then(|c| c.text.clone()).unwrap_or_default(),
                "next_label": live.next_label.clone(),
                "next_text": live.next_text.clone(),
                "song_title": song.map(|s| s.title.clone()),
                "slideIndex": index,
                "slideCount": count,
                "slides": slides,
                "bible_ref": current.as_ref().and_then(|c| c.bible_ref.clone()),
            })
            .to_string();
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/companion/next" {
            let _ = crate::commands::output::advance_live(app.clone(), app.state::<AppState>(), 1);
        } else if url == "/api/companion/prev" {
            let _ = crate::commands::output::advance_live(app.clone(), app.state::<AppState>(), -1);
        } else if url == "/api/companion/goto" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(idx) = v.get("index").and_then(|i| i.as_u64()) {
                    let _ = crate::commands::output::goto_slide(
                        app.clone(),
                        app.state::<AppState>(),
                        idx as usize,
                    );
                }
            }
        } else if url == "/api/companion/clear" && method == Method::Post {
            let _ = crate::commands::output::clear_live(app.clone(), app.state::<AppState>());
        }
        if url == "/api/companion/playlists" {
            let playlists = state.playlists.lock().map(|g| g.clone()).unwrap_or_default();
            let body = serde_json::to_string(&playlists).unwrap_or_else(|_| "[]".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/companion/playlist/save" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(playlist) = serde_json::from_str::<crate::models::Playlist>(&content) {
                match crate::commands::playlists::save_playlist(app.clone(), app.state::<AppState>(), playlist) {
                    Ok(p) => {
                        let body = serde_json::to_string(&p).unwrap_or_else(|_| "{}".into());
                        let _ = req.respond(json_response(StatusCode(200), body));
                    }
                    Err(e) => {
                        let body = serde_json::json!({"error": e}).to_string();
                        let _ = req.respond(json_response(StatusCode(400), body));
                    }
                }
            } else {
                let _ = req.respond(json_response(StatusCode(400), "{\"error\":\"bad json\"}".to_string()));
            }
            return;
        }
        if url == "/api/companion/playlist/delete" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("");
                let _ = crate::commands::playlists::delete_playlist(app.clone(), app.state::<AppState>(), id.to_string());
                let _ = req.respond(json_response(StatusCode(200), "{\"ok\":true}".to_string()));
            } else {
                let _ = req.respond(json_response(StatusCode(400), "{\"error\":\"bad json\"}".to_string()));
            }
            return;
        }
        if url == "/api/companion/playlist/load" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("");
                let _ = crate::commands::output::load_playlist(app.clone(), app.state::<AppState>(), id.to_string());
                let _ = req.respond(json_response(StatusCode(200), "{\"ok\":true}".to_string()));
            } else {
                let _ = req.respond(json_response(StatusCode(400), "{\"error\":\"bad json\"}".to_string()));
            }
            return;
        }
        if url == "/api/companion/playlist/goto" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("");
                let index = v.get("index").and_then(|x| x.as_u64()).unwrap_or(0) as usize;
                let _ = crate::commands::output::goto_playlist_entry(app.clone(), app.state::<AppState>(), id.to_string(), index);
                let _ = req.respond(json_response(StatusCode(200), "{\"ok\":true}".to_string()));
            } else {
                let _ = req.respond(json_response(StatusCode(400), "{\"error\":\"bad json\"}".to_string()));
            }
            return;
        }
        if url == "/api/companion/songs" {
            let list: Vec<serde_json::Value> = songs
                .iter()
                .map(|s| {
                    serde_json::json!({
                        "id": s.id,
                        "title": s.title,
                        "artist": s.artist,
                        "key": s.key,
                        "slideCount": s.slides.len(),
                    })
                })
                .collect();
            let body = serde_json::to_string(&list).unwrap_or_else(|_| "[]".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/companion/song/present" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                let song_id = v.get("song_id").and_then(|x| x.as_str()).unwrap_or("");
                let _ = crate::commands::output::present_song(app.clone(), app.state::<AppState>(), song_id.to_string());
                let _ = req.respond(json_response(StatusCode(200), "{\"ok\":true}".to_string()));
            } else {
                let _ = req.respond(json_response(StatusCode(400), "{\"error\":\"bad json\"}".to_string()));
            }
            return;
        }
        if url == "/api/companion/timeline/start" && method == Method::Post {
            let _ = crate::commands::output::start_service_timeline(app.clone(), app.state::<AppState>());
            let _ = req.respond(json_response(StatusCode(200), "{\"ok\":true}".to_string()));
            return;
        }
        if url == "/api/companion/timeline/stop" && method == Method::Post {
            let _ = crate::commands::output::stop_service_timeline(app.clone(), app.state::<AppState>());
            let _ = req.respond(json_response(StatusCode(200), "{\"ok\":true}".to_string()));
            return;
        }
        let live = state.live.lock().map(|g| g.clone()).unwrap_or_default();
        let body = serde_json::json!({
            "hasContent": live.current.is_some(),
        })
        .to_string();
        let _ = req.respond(json_response(StatusCode(200), body));
        return;
    }

    // Kinh thánh cho Church App (dùng chung khoá)
    if url.starts_with("/api/companion/bible") {
        if !church_token_ok(req.headers(), &pin) {
            let _ = req.respond(json_response(StatusCode(401), "{\"error\":\"unauthorized\"}".to_string()));
            return;
        }
        if url == "/api/companion/bible/versions" {
            let versions: Vec<crate::bible::BibleVersion> = crate::bible::list_bible_versions(app.clone())
                .into_iter()
                .filter(|v| v.id != "online")
                .collect();
            let body = serde_json::to_string(&versions).unwrap_or_else(|_| "[]".into());
            let _ = req.respond(json_response(StatusCode(200), body));
            return;
        }
        if url == "/api/companion/bible/books" || url.starts_with("/api/companion/bible/books?") {
            let version = url
                .split('?')
                .nth(1)
                .map(|q| parse_query(q))
                .and_then(|m| m.get("version").cloned())
                .unwrap_or_default();
            let version = if version.is_empty() { None } else { Some(version) };
            match crate::bible::get_bible_books_version(app.clone(), version) {
                Ok(books) => {
                    let body = serde_json::to_string(&books).unwrap_or_else(|_| "[]".into());
                    let _ = req.respond(json_response(StatusCode(200), body));
                }
                Err(e) => {
                    let body = serde_json::json!({"error": e}).to_string();
                    let _ = req.respond(json_response(StatusCode(404), body));
                }
            }
            return;
        }
        if let Some(query) = url.strip_prefix("/api/companion/bible/chapter?") {
            let params = parse_query(query);
            let version = params.get("version").cloned().unwrap_or_default();
            let version = if version.is_empty() { None } else { Some(version) };
            let abbrev = params.get("abbrev").cloned().unwrap_or_default();
            let chapter = params.get("chapter").and_then(|v| v.parse::<usize>().ok()).unwrap_or(1);
            match crate::bible::get_bible_chapter_version(app.clone(), version, abbrev, chapter) {
                Ok(ch) => {
                    let body = serde_json::to_string(&ch).unwrap_or_else(|_| "{}".into());
                    let _ = req.respond(json_response(StatusCode(200), body));
                }
                Err(e) => {
                    let body = serde_json::json!({"error": e}).to_string();
                    let _ = req.respond(json_response(StatusCode(404), body));
                }
            }
            return;
        }
        if url == "/api/companion/bible/verse" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                let id = v.get("version").and_then(|x| x.as_str()).unwrap_or("");
                let abbrev = v.get("abbrev").and_then(|x| x.as_str()).unwrap_or("");
                let chapter = v.get("chapter").and_then(|x| x.as_u64()).unwrap_or(0) as usize;
                let verse = v.get("verse").and_then(|x| x.as_u64()).unwrap_or(0) as usize;
                let text = v.get("text").and_then(|x| x.as_str()).unwrap_or("");
                match crate::bible::edit_bible_verse(app.clone(), id.to_string(), abbrev.to_string(), chapter, verse, text.to_string()) {
                    Ok(()) => {
                        let _ = req.respond(json_response(StatusCode(200), "{\"ok\":true}".to_string()));
                    }
                    Err(e) => {
                        let body = serde_json::json!({"error": e}).to_string();
                        let _ = req.respond(json_response(StatusCode(400), body));
                    }
                }
            } else {
                let _ = req.respond(json_response(StatusCode(400), "{\"error\":\"bad json\"}".to_string()));
            }
            return;
        }
        if url == "/api/companion/bible/present" && method == Method::Post {
            let mut content = String::new();
            let _ = req.as_reader().read_to_string(&mut content);
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                let version = v.get("version").and_then(|x| x.as_str()).unwrap_or("");
                let version = if version.is_empty() { None } else { Some(version.to_string()) };
                let abbrev = v.get("abbrev").and_then(|x| x.as_str()).unwrap_or("");
                let chapter = v.get("chapter").and_then(|x| x.as_u64()).unwrap_or(1) as usize;
                let verses: Vec<usize> = v
                    .get("verses")
                    .and_then(|x| x.as_array())
                    .map(|a| a.iter().filter_map(|i| i.as_u64().map(|n| n as usize)).collect())
                    .unwrap_or_default();
                let present = crate::bible::present_bible_selection_version(&app, version.clone(), abbrev, chapter, verses);
                if let Some(slide) = present {
                    let style = resolve_bible_style(&app, &settings, &state, version.as_deref());
                    let mut l = state.live.lock().map(|g| g.clone()).unwrap_or_default();
                    l.current = Some(merge_slide_style(slide, style));
                    l.next_text = None;
                    l.next_label = None;
                    let _ = crate::commands::output::set_live_state(app.clone(), app.state::<AppState>(), l);
                    let body = serde_json::json!({"ok": true}).to_string();
                    let _ = req.respond(json_response(StatusCode(200), body));
                } else {
                    let _ = req.respond(json_response(StatusCode(404), "{\"error\":\"not found\"}".to_string()));
                }
            }
            return;
        }
        let _ = req.respond(json_response(StatusCode(404), "{\"error\":\"not found\"}".to_string()));
        return;
    }

    if url == "/qr.svg" {
        if let Ok(code) = qrcode::QrCode::new(base.as_bytes()) {
            let svg = code
                .render::<qrcode::render::svg::Color>()
                .min_dimensions(420, 420)
                .build();
            let _ = req.respond(
                Response::from_string(svg)
                    .with_header(header("Content-Type", "image/svg+xml"))
                    .with_header(header("Access-Control-Allow-Origin", "*")),
            );
            return;
        }
    }

    let _ = req.respond(json_response(StatusCode(404), "{\"error\":\"not found\"}".to_string()));
}

#[tauri::command]
pub fn get_companion_info(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    let settings = state
        .settings
        .lock()
        .map(|s| s.clone())
        .map_err(|e| e.to_string())?;
    let base = base_url(&lan_ip(), settings.server_port);
    Ok(serde_json::json!({
        "base_url": base,
        "server_enabled": settings.server_enabled,
        "companion_enabled": settings.companion_enabled,
        "stage_remote_enabled": settings.stage_remote_enabled,
        "api_enabled": settings.api_enabled,
        "port": settings.server_port,
    }))
}

pub fn start(app: AppHandle) {
    let port = {
        let state = app.state::<AppState>();
        state.settings.lock().map(|s| s.server_port).unwrap_or(8500)
    };
    let listener = match TcpListener::bind(("0.0.0.0", port)) {
        Ok(l) => l,
        Err(_) => return,
    };
    let server = match Server::from_listener(listener, None) {
        Ok(s) => s,
        Err(_) => return,
    };
    thread::spawn(move || {
        for request in server.incoming_requests() {
            let app = app.clone();
            handle(app, request);
        }
    });
}

fn stage_remote_html() -> String {
    let style = "
      * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
      body { font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; background: #0f1117; color: #eef; min-height: 100vh; }
      #app { display: flex; flex-direction: column; height: 100vh; }
      header { position: relative; z-index: 10; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #161a23; border-bottom: 1px solid #232a38; }
      header .brand { font-weight: 800; font-size: 16px; }
      nav { display: flex; gap: 6px; flex: 1; justify-content: flex-end; }
      nav button { background: transparent; border: none; color: #8b93a7; padding: 8px 12px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
      nav button.active { background: #232a38; color: #fff; }
      main { flex: 1; overflow: hidden; position: relative; }
      .page { position: absolute; inset: 0; overflow-y: auto; padding: 14px; display: none; }
      .page.active { display: block; }
      .output { display: flex; flex-direction: column; gap: 14px; }
      .preview { border: 1px solid #2a3040; background: #141926; border-radius: 14px; padding: 16px; min-height: 150px; }
      .pv-label { color: #ffd166; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
      .pv-title { color: #7dd3fc; font-size: 15px; font-weight: 700; margin-bottom: 6px; }
      .pv-text { font-size: 18px; line-height: 1.5; color: #f1f5f9; white-space: pre-wrap; word-break: break-word; }
      .pv-next { margin-top: 12px; font-size: 12px; color: #6b7280; white-space: pre-wrap; }
      .empty { color: #8b93a7; text-align: center; margin-top: 40vh; transform: translateY(-50%); }
      .panel { display: flex; flex-direction: column; gap: 12px; }
      .btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .btns button { border: none; border-radius: 12px; padding: 16px 0; font-size: 16px; font-weight: 700; cursor: pointer; color: #fff; background: #232839; }
      button:active { transform: scale(.97); }
      .primary { background: #3b82f6; }
      .danger { background: #dc2626; }
      .full { grid-column: 1 / -1; }
      .message-box { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
      .message-box input { border: 1px solid #2a3040; background: #161a23; color: #eef; border-radius: 10px; padding: 12px; font-size: 15px; }
      .message-box button { padding: 12px 18px; background: #16a34a; }
      #status { font-size: 13px; color: #f0b45d; min-height: 20px; text-align: center; }
      /* Slide list */
      .slides { display: flex; flex-direction: column; gap: 10px; }
      .slide-card { background: #171b25; border: 2px solid #232a38; border-radius: 12px; padding: 12px 14px; cursor: pointer; }
      .slide-card.active { border-color: #3b82f6; background: #1c2433; }
      .slide-card .s-label { color: #7dd3fc; font-size: 12px; font-weight: 700; margin-bottom: 6px; }
      .slide-card .s-text { font-size: 15px; line-height: 1.45; white-space: pre-wrap; color: #e2e8f0; }
      .song-head { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
      /* Scriptures */
      .books, .chapters, .verses { display: flex; flex-direction: column; gap: 8px; }
      .b-item { background: #171b25; border: 2px solid #232a38; border-radius: 10px; padding: 12px 14px; cursor: pointer; }
      .b-item .t { font-weight: 600; font-size: 15px; }
      .b-item .s { color: #8b93a7; font-size: 12px; margin-top: 2px; }
      .ch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 8px; margin-bottom: 14px; }
      .ch-grid button { background: #171b25; border: 1px solid #232a38; color: #eef; border-radius: 8px; padding: 10px 0; font-size: 14px; cursor: pointer; }
      .ch-grid button.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
      .book-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
      .book-bar button { background: #232a38; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 8px 12px; font-size: 14px; font-weight: 600; cursor: pointer; }
      .book-bar .bname { font-weight: 700; font-size: 15px; flex: 1; }
      .verse-row { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #1d2432; cursor: pointer; }
      .verse-row .no { color: #3b82f6; font-size: 13px; min-width: 20px; text-align: right; }
      .verse-row .vt { font-size: 15px; line-height: 1.5; flex: 1; }
      .verse-row.presenting { outline: 3px solid #3b82f6; outline-offset: 3px; border-radius: 8px; background: #1c2433; }
      .bible-ctrl { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
      .bible-ctrl .lbl { font-size: 13px; color: #8b93a7; }
      .bible-search-form { flex: 1; min-width: 0; display: flex; gap: 6px; }
      .bible-search-form .bibleSearch { flex: 1; min-width: 0; background: #161a23; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
      .bible-search-form .bibleSearch.err { border-color: #f87171; color: #f87171; }
      .bible-search-form .bibleSearchBtn { background: #232a38; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 0 12px; font-size: 15px; cursor: pointer; }
      .autoBtn { background: #232a38; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
      .autoBtn.on { background: #16a34a; border-color: #16a34a; color: #fff; }
      .auto-ctrl { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .auto-ctrl input { width: 52px; background: #161a23; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 6px 8px; font-size: 13px; text-align: center; }
      .auto-ctrl .sec { font-size: 12px; color: #8b93a7; }
      #page-bible { padding-bottom: 78px; }
      .bible-nav { position: fixed; left: 50%; transform: translateX(-50%); bottom: 14px; z-index: 20; display: flex; align-items: center; gap: 10px; background: #161a23; border: 1px solid #2a3040; border-radius: 999px; padding: 6px 12px; }
      .bible-nav .nav-arrow { width: 44px; height: 44px; border: none; border-radius: 50%; background: #232a38; color: #eef; font-size: 22px; font-weight: 700; cursor: pointer; }
      .bible-nav .nav-arrow:active { background: #3b82f6; }
      .bible-nav #navPos { min-width: 52px; text-align: center; font-size: 13px; color: #8b93a7; font-weight: 600; }
      #page-bible.active { display: flex; flex-direction: column; overflow: hidden; }
      .bible-ctrl { flex-shrink: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
      .bibleVersionSel { flex: 1 1 100%; min-width: 0; background: #161a23; border: 1px solid #2a3040; color: #eef; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
      .bibleVersionSel:disabled { opacity: 0.6; }
      .verse-row .editbtn { flex-shrink: 0; width: 26px; height: 26px; border: 1px solid #2a3040; border-radius: 6px; background: #232a38; color: #8b93a7; font-size: 13px; line-height: 1; cursor: pointer; }
      .verse-row .editbtn:active { background: #3b82f6; color: #fff; }
      #chapterBar { flex-shrink: 0; max-height: 132px; overflow-y: auto; background: #141821; border: 1px solid #232a38; border-radius: 10px; padding: 8px; margin-bottom: 8px; }
      #chapterBar .ch-grid { margin-bottom: 0; }
      #bibleBody { flex: 1; min-height: 0; overflow-y: auto; }
    ";
    let html = format!(
        r#"<!DOCTYPE html><html lang='vi'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'><title>Stage Remote</title><style>{STYLE}</style></head><body>
<div id='app'>
  <header>
    <span class='brand'>Stage Remote</span>
    <nav>
      <button data-tab='output' class='active' onclick='switchTab("output")' title='Màn hình'>🖥️</button>
      <button data-tab='slides' onclick='switchTab("slides")' title='Danh sách'>📜</button>
      <button data-tab='bible' onclick='switchTab("bible")' title='Kinh thánh'>📖</button>
    </nav>
  </header>
  <main>
    <div class='page output-page active' id='page-output'>
      <div class='tap-left' onclick='tapPrev()'></div>
      <div class='tap-right' onclick='tapNext()'></div>
      <div class='output'>
        <div class='preview'>
          <div class='pv-label' id='outLabel'>Đang trống</div>
          <div class='pv-title' id='outTitle'></div>
          <div class='pv-text' id='outText'>—</div>
          <div class='pv-next' id='outNext'></div>
        </div>
        <div class='panel'>
          <div class='btns'>
            <button class='primary' onclick='tapNext()'>Tiếp theo</button>
            <button onclick='tapPrev()'>Quay lại</button>
          </div>
          <div class='btns'>
            <button onclick="stageAct('timeline/start')">Chạy mục lục</button>
            <button onclick="stageAct('timeline/stop')">Dừng mục lục</button>
          </div>
          <div class='message-box'>
            <input id='msg' placeholder='Nhập tin nhắn lên màn hình...' onkeydown="if(event.key==='Enter')stageAct('message')">
            <button onclick="stageAct('message')">Gửi</button>
          </div>
          <button class='danger full' onclick="stageAct('clear')">Ẩn màn hình</button>
          <div id='status'></div>
        </div>
      </div>
    </div>
    <div class='page' id='page-slides'>
      <div class='song-head' id='slidesSong'></div>
      <div class='slides' id='slidesList'></div>
    </div>
    <div class='page' id='page-bible'>
      <div class='bible-ctrl'>
        <form class='bible-search-form' onsubmit='event.preventDefault();searchBible();return false'>
          <input id='bibleSearch' class='bibleSearch' type='search' enterkeyhint='search' autocomplete='off' placeholder='Tìm kiếm' onkeydown="if(event.key==='Enter'||event.keyCode===13)searchBible()" oninput='searchKey()'>
          <button type='submit' class='bibleSearchBtn'>🔍</button>
        </form>
        <div class='auto-ctrl'>
          <input id='autoSec' type='number' min='1' max='60' value='3' onchange='autoSecChange(this.value)'>
          <span class='sec'>giây</span>
          <button id='autoBtn' class='autoBtn' onclick='toggleAuto()'>● Tự động</button>
        </div>
        <select id='bibleVersionSel' class='bibleVersionSel' onchange='setVersion(this.value)'><option value='vie'>Đang tải bản dịch...</option></select>
      </div>
      <div id='chapterBar'></div>
      <div id='bibleBody'></div>
      <div class='bible-nav'>
        <button class='nav-arrow' onclick='verseStep(-1)'>‹</button>
        <span id='navPos'>-</span>
        <button class='nav-arrow' onclick='verseStep(1)'>›</button>
      </div>
    </div>
  </main>
</div>
<div id='verseModal' style='display:none;position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:20px'>
  <div style='width:100%;max-width:420px;background:#141821;border:1px solid #2a3040;border-radius:12px;padding:16px'>
    <div id='verseModalTitle' style='font-weight:700;font-size:15px;margin-bottom:10px'></div>
    <textarea id='verseModalText' style='width:100%;height:120px;box-sizing:border-box;background:#161a23;border:1px solid #2a3040;color:#eef;border-radius:8px;padding:10px;font-size:14px;line-height:1.5'></textarea>
    <div style='display:flex;gap:8px;margin-top:10px'>
      <button onclick='closeVerseModal()' style='flex:1;background:#232a38;border:1px solid #2a3040;color:#eef;border-radius:8px;padding:10px;font-size:14px;cursor:pointer'>Hủy</button>
      <button onclick='saveVerse()' style='flex:1;background:#3b82f6;border:none;color:#fff;border-radius:8px;padding:10px;font-size:14px;font-weight:700;cursor:pointer'>Lưu</button>
    </div>
  </div>
</div>
<script>
let curBook = null, curChapter = null;
let curVersion = 'vie';
let versionsCache = [];
let verseModal = {{ version: '', abbrev: '', chapter: 1, verse: 0 }};
let presentedVerse = -1;
let autoTimer = null;
let autoRunning = false;
let autoEnabled = false;
let autoInterval = 3;
let autoBusy = false;

async function stageAct(action) {{
  const st = document.getElementById('status');
  let opts = {{}};
  if (action === 'message') {{
    const m = document.getElementById('msg').value;
    opts = {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify({{message: m}}) }};
  }}
  try {{
    const r = await fetch('/stage/api/' + action, opts);
    st.textContent = 'Đã thực hiện: ' + action + (r.ok ? '' : ' (lỗi)');
    if (r.ok) refreshAll();
  }} catch(e) {{
    st.textContent = 'Lỗi kết nối';
  }}
}}

function tapNext() {{ fetch('/stage/api/next').then(refreshAll).catch(()=>{{}}); }}
function tapPrev() {{ fetch('/stage/api/prev').then(refreshAll).catch(()=>{{}}); }}

function switchTab(name) {{
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  if (name === 'bible') {{ loadVersions(); if (!curBook) loadBooks(); }}
  if (name === 'slides') refreshAll();
}}

async function refreshAll() {{
  try {{
    const r = await fetch('/stage/api/status');
    const d = await r.json();
    document.getElementById('outLabel').textContent = d.hasContent ? (d.label || d.title || 'Đang trình chiếu') : 'Đang trống';
    document.getElementById('outTitle').textContent = d.title || (d.song_title ? d.song_title : '');
    document.getElementById('outText').textContent = d.text || (d.hasContent ? '…' : '—');
    document.getElementById('outNext').textContent = d.next_text ? ('Tiếp theo: ' + (d.next_label ? d.next_label + ' — ' : '') + d.next_text) : '';
    renderSlides(d);
    if ((d.bible_ref || null) !== lastBibleRef) {{
      lastBibleRef = d.bible_ref || null;
      syncBibleRef(d.bible_ref);
    }}
  }} catch(e) {{}}
}}

function renderSlides(d) {{
  document.getElementById('slidesSong').textContent = d.song_title || '';
  const box = document.getElementById('slidesList');
  if (!d.slides || !d.slides.length) {{
    box.innerHTML = '<div class="empty">Chưa có bài hát nào đang chiếu</div>';
    return;
  }}
  box.innerHTML = d.slides.map((s, i) =>
    '<div class="slide-card' + (i === d.slideIndex ? ' active' : '') + '" onclick="gotoSlide(' + i + ')">' +
      '<div class="s-label">' + (s.label || ('Slide ' + (i+1))) + '</div>' +
      '<div class="s-text">' + (s.content || '').replace(/</g, '&lt;') + '</div>' +
    '</div>').join('');
}}

function gotoSlide(i) {{
  fetch('/stage/api/goto', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify({{index: i}}) }}).then(refreshAll).catch(()=>{{}});
}}

async function loadBooks() {{
  const box = document.getElementById('bibleBody');
  const cb = document.getElementById('chapterBar');
  if (cb) cb.innerHTML = '';
  box.innerHTML = '<div class="empty">Đang tải...</div>';
  try {{
    const r = await fetch('/stage/api/bible/books?version=' + encodeURIComponent(curVersion));
    const books = await r.json();
    box.innerHTML = '<div class="books">' + books.map(b =>
      '<div class="b-item" onclick="openChapter(&quot;' + b.abbrev + '&quot;,&quot;' + b.name + '&quot;,' + b.chapters + ')"><div class="t">' + b.name + '</div><div class="s">' + b.chapters + ' chương</div></div>'
    ).join('') + '</div>';
  }} catch(e) {{}}
}}

async function fetchBooks() {{
  const r = await fetch('/stage/api/bible/books?version=' + encodeURIComponent(curVersion));
  return await r.json();
}}

async function loadVersions() {{
  const sel = document.getElementById('bibleVersionSel');
  if (!sel) return;
  try {{
    const r = await fetch('/stage/api/bible/versions');
    const versions = await r.json();
    versionsCache = versions;
    const cur = versions.some(v => v.id === curVersion) ? curVersion : (versions.length ? versions[0].id : 'vie');
    sel.innerHTML = versions.map(v => '<option value="' + v.id + '"' + (v.id === cur ? ' selected' : '') + '>' + String(v.name).replace(/</g, '&lt;') + '</option>').join('');
    sel.disabled = false;
    if (cur !== curVersion) setVersion(cur);
  }} catch(e) {{}}
}}

function setVersion(v) {{
  if (v === curVersion) return;
  const was = {{ abbrev: curBook ? curBook.abbrev : null, book: curBook ? curBook.name : null, chapters: curBook ? curBook.chapters : 0, chapter: curChapter, verse: presentedVerse >= 0 ? presentedVerse + 1 : 0 }};
  curVersion = v;
  booksCache = [];
  curBook = null;
  curChapter = null;
  presentedVerse = -1;
  loadBooks();
  if (was.abbrev && was.verse > 0) {{
    loadBookChapter(was.abbrev, was.book, was.chapters, was.chapter || 1).then(function() {{
      presentVerse(was.verse - 1);
    }});
  }}
}}

function editVerse(v) {{
  const rows = document.querySelectorAll('.verse-row .vt');
  const el = rows[v - 1];
  if (!el) return;
  verseModal = {{ version: curVersion, abbrev: curBook.abbrev, chapter: curChapter, verse: v }};
  document.getElementById('verseModalTitle').textContent = curBook.name + ' ' + curChapter + ':' + v;
  document.getElementById('verseModalText').value = el.textContent;
  const m = document.getElementById('verseModal');
  m.style.display = 'flex';
  setTimeout(function() {{ document.getElementById('verseModalText').focus(); }}, 50);
}}

function closeVerseModal() {{
  document.getElementById('verseModal').style.display = 'none';
}}

async function saveVerse() {{
  const text = document.getElementById('verseModalText').value;
  const body = {{ version: verseModal.version, abbrev: verseModal.abbrev, chapter: verseModal.chapter, verse: verseModal.verse, text: text }};
  try {{
    const r = await fetch('/stage/api/bible/verse', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify(body) }});
    if (!r.ok) {{ const d = await r.json().catch(()=>{{}}); flashSearch(d && d.error ? d.error : 'Lỗi lưu'); return; }}
    closeVerseModal();
    await loadChapter();
    flashSearch('Đã lưu.');
  }} catch(e) {{ flashSearch('Lỗi lưu'); }}
}}

async function loadBookChapter(abbrev, name, chapters, chapter) {{
  curBook = {{ abbrev, name, chapters: chapters || 1 }};
  curChapter = chapter || 1;
  presentedVerse = -1;
  stopAuto();
  syncAuto();
  await loadChapter();
}}

function openChapter(abbrev, name, nch) {{
  loadBookChapter(abbrev, name, nch, 1);
}}

async function stepChapter(dir) {{
  if (dir > 0) {{
    if (curChapter < curBook.chapters) {{ await loadBookChapter(curBook.abbrev, curBook.name, curBook.chapters, curChapter + 1); return true; }}
    const books = await fetchBooks();
    const idx = books.findIndex(b => b.abbrev === curBook.abbrev);
    if (idx >= 0 && idx < books.length - 1) {{ const nb = books[idx + 1]; await loadBookChapter(nb.abbrev, nb.name, nb.chapters, 1); return true; }}
    return false;
  }} else {{
    if (curChapter > 1) {{ await loadBookChapter(curBook.abbrev, curBook.name, curBook.chapters, curChapter - 1); return true; }}
    const books = await fetchBooks();
    const idx = books.findIndex(b => b.abbrev === curBook.abbrev);
    if (idx > 0) {{ const pb = books[idx - 1]; await loadBookChapter(pb.abbrev, pb.name, pb.chapters, pb.chapters); return true; }}
    return false;
  }}
}}

async function loadChapter() {{
  const box = document.getElementById('bibleBody');
  const cb = document.getElementById('chapterBar');
  if (!curBook) return;
  if (cb) cb.innerHTML = '<div class="ch-grid">' + (curChapter > 1 ? '<button onclick="curChapter--;loadChapter()">‹</button>' : '') + '<button class="active">' + curChapter + '</button></div>';
  box.innerHTML = '<div class="empty">Đang tải...</div>';
  try {{
    const r = await fetch('/stage/api/bible/chapter?version=' + encodeURIComponent(curVersion) + '&abbrev=' + encodeURIComponent(curBook.abbrev) + '&chapter=' + curChapter);
    const ch = await r.json();
    if (cb) cb.innerHTML = '<div class="ch-grid">' +
      Array.from({{length: curBook.chapters}}, (_, n) => n+1).map(n =>
        '<button class="' + (n === curChapter ? 'active' : '') + '" onclick="curChapter=' + n + ';presentedVerse=-1;stopAuto();loadChapter()">' + n + '</button>').join('') +
      '</div>';
    const canEdit = curVersion !== 'online';
    box.innerHTML = '<div class="book-bar"><button onclick="loadBooks()">‹ Sách</button><span class="bname">' + ch.name + ' ' + ch.chapter + '</span></div><div class="verses">' +
      ch.verses.map((v, i) => v ? '<div class="verse-row' + (i === presentedVerse ? ' presenting' : '') + '" onclick="playFrom(' + i + ')"><span class="no">' + (i+1) + '</span><span class="vt">' + v.replace(/</g, '&lt;') + '</span>' + (canEdit ? '<button class="editbtn" onclick="event.stopPropagation();editVerse(' + (i+1) + ')">✎</button>' : '') + '</div>' : '').join('') + '</div>';
  }} catch(e) {{}}
}}

async function presentVerse(i) {{
  const body = {{ version: curVersion, abbrev: curBook.abbrev, chapter: curChapter, verses: [i + 1] }};
  try {{
    await fetch('/stage/api/bible/present', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify(body) }});
    presentedVerse = i;
    setPresenting(i);
    refreshAll();
    scrollToPresented(i);
    updateNavPos();
  }} catch(e) {{}}
}}

async function presentVerses(chapter, arr) {{
  const body = {{ version: curVersion, abbrev: curBook.abbrev, chapter: chapter, verses: arr }};
  try {{
    await fetch('/stage/api/bible/present', {{ method: 'POST', headers: {{'Content-Type':'application/json'}}, body: JSON.stringify(body) }});
    presentedVerse = arr[0] - 1;
    setPresenting(presentedVerse);
    refreshAll();
    scrollToPresented(presentedVerse);
    updateNavPos();
  }} catch(e) {{}}
}}

function setPresenting(i) {{
  document.querySelectorAll('.verse-row').forEach(function(r, idx) {{
    r.classList.toggle('presenting', idx === i);
  }});
}}

function verseStep(d) {{
  const total = chapterVerseCount();
  if (total === 0) return;
  const i = presentedVerse >= 0 ? presentedVerse + d : (d > 0 ? 0 : total - 1);
  if (d > 0 && i >= total) {{ stepChapter(1).then(function(ok) {{ if (ok) presentVerse(0); }}); return; }}
  if (d < 0 && i < 0) {{ stepChapter(-1).then(function(ok) {{ if (ok) {{ const c = chapterVerseCount(); if (c) presentVerse(c - 1); }} }}); return; }}
  presentVerse(i);
}}

function updateNavPos() {{
  const p = document.getElementById('navPos');
  if (!p) return;
  const total = chapterVerseCount();
  p.textContent = (presentedVerse >= 0 && total) ? ((presentedVerse + 1) + ' / ' + total) : '-';
}}

function norm(s) {{ return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ð/g, 'd'); }}
function comp(s) {{ return norm(s).replace(/[^a-z0-9]/g, ''); }}

function matchBooks(q) {{
  const needle = comp(q);
  const ql = (q || '').trim().toLowerCase();
  const byShort = booksCache.filter(b => comp(b.short) === needle || comp(b.name) === needle);
  if (byShort.length) return byShort;
  const byAbbrev = booksCache.filter(b => b.abbrev.toLowerCase() === ql);
  const byPrefix = booksCache.filter(b => comp(b.name).startsWith(needle) || comp(b.short).startsWith(needle));
  const seen = {{}};
  return byAbbrev.concat(byPrefix).filter(b => seen[b.abbrev] ? false : (seen[b.abbrev] = true));
}}

let booksCache = [];
let lastBibleRef = null;

async function searchBible() {{
  const s = document.getElementById('bibleSearch');
  const q = (s.value || '').trim();
  if (!q || /^\d+$/.test(q)) {{ flashSearch('Vd: Sáng 1:3'); return; }}
  if (!booksCache.length) {{ try {{ booksCache = await fetchBooks(); }} catch(e) {{}} }}
  if (!booksCache.length) {{ flashSearch('Lỗi dữ liệu'); return; }}
  let book = null, chapter = 1, startVerse = 0, endVerse = 0;
  const m = q.match(/^\s*(.+?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?\s*$/);
  if (m) {{
    const needle = comp(m[1]);
    const matches = matchBooks(m[1]);
    if (!matches.length) {{ flashSearch('Không tìm thấy sách'); return; }}
    chapter = parseInt(m[2], 10);
    startVerse = m[3] ? parseInt(m[3], 10) : 0;
    endVerse = m[4] ? parseInt(m[4], 10) : 0;
    if (matches.length > 1) {{ showBookPicker(matches, chapter, startVerse, endVerse); return; }}
    book = matches[0];
  }} else {{
    const needle = comp(q);
    const matches = matchBooks(q);
    if (!matches.length) {{ flashSearch('Không tìm thấy sách'); return; }}
    if (matches.length > 1) {{ showBookPicker(matches, 1, 0, 0); return; }}
    book = matches[0];
  }}
  if (chapter < 1 || chapter > book.chapters) {{ flashSearch('Chương không tồn tại'); return; }}
  await loadBookChapter(book.abbrev, book.name, book.chapters, chapter);
  if (startVerse) {{
    const end = endVerse && endVerse >= startVerse ? endVerse : startVerse;
    if (startVerse < 1 || end > chapterVerseCount()) {{ flashSearch('Câu không tồn tại'); return; }}
    const arr = [];
    for (let k = startVerse; k <= end; k++) arr.push(k);
    presentVerses(chapter, arr);
  }}
  s.value = '';
  s.blur();
}}

async function searchKey() {{
  const s = document.getElementById('bibleSearch');
  if (!s) return;
  const v = s.value;
  if (!booksCache.length) {{ try {{ booksCache = await fetchBooks(); }} catch(e) {{}} }}
  if (v.endsWith(' ')) {{
    const body = v.slice(0, -1);
    for (const b of booksCache) {{
      const pref = b.name + ' ';
      if (body.startsWith(pref)) {{
        const rest = body.slice(pref.length);
        if (/^\d+:\d+$/.test(rest)) {{ s.value = body + '-'; return; }}
        if (/^\d+$/.test(rest)) {{ s.value = body + ':'; return; }}
        break;
      }}
      const sref = b.short + ' ';
      if (body.startsWith(sref)) {{
        const rest = body.slice(sref.length);
        if (/^\d+:\d+$/.test(rest)) {{ s.value = body + '-'; return; }}
        if (/^\d+$/.test(rest)) {{ s.value = body + ':'; return; }}
        break;
      }}
    }}
    return;
  }}
  const parts = v.split(/\s+/).filter(Boolean);
  if (parts.length === 1 && !/^\d+$/.test(parts[0]) && booksCache.length) {{
    const needle = comp(parts[0]);
    const books = matchBooks(parts[0]);
    if (books.length === 1 && s.value !== books[0].name) s.value = books[0].name + ' ';
  }}
}}

function showBookPicker(books, chapter, startVerse, endVerse) {{
  const box = document.getElementById('bibleBody');
  box.innerHTML = '<div style="font-size:13px;color:#8b93a7;margin-bottom:8px">Tên gọi trùng, chọn sách:</div><div class="books">' + books.map(b =>
    '<div class="b-item" onclick="pickBook(&quot;' + b.abbrev + '&quot;,&quot;' + b.name + '&quot;,' + b.chapters + ',' + chapter + ',' + startVerse + ',' + endVerse + ')"><div class="t">' + b.name + '</div><div class="s">' + b.chapters + ' chương</div></div>'
  ).join('') + '</div>';
}}

function pickBook(abbrev, name, chapters, chapter, startVerse, endVerse) {{
  loadBookChapter(abbrev, name, chapters, chapter || 1).then(function() {{
    if (startVerse > 0) {{
      const end = endVerse >= startVerse ? endVerse : startVerse;
      if (end > chapterVerseCount()) {{ flashSearch('Câu không tồn tại'); return; }}
      const arr = [];
      for (let k = startVerse; k <= end; k++) arr.push(k);
      presentVerses(chapter || 1, arr);
    }}
  }});
}}

function flashSearch(msg) {{
  const s = document.getElementById('bibleSearch');
  if (!s) return;
  s.value = msg;
  s.classList.add('err');
  setTimeout(function() {{ s.value = ''; s.classList.remove('err'); }}, 1600);
}}

function playFrom(i) {{
  presentVerse(i);
  if (!autoEnabled) return;
  stopAuto();
  autoRunning = true;
  autoTimer = setInterval(autoTick, autoInterval * 1000);
}}

function autoTick() {{
  if (autoBusy) return;
  const total = chapterVerseCount();
  const next = presentedVerse + 1;
  if (next >= total) {{
    autoBusy = true;
    stepChapter(1).then(function(ok) {{
      autoBusy = false;
      if (!ok) {{ stopAuto(); return; }}
      if (autoRunning) presentVerse(0);
    }});
    return;
  }}
  presentVerse(next);
}}

function stopAuto() {{
  if (autoTimer) {{ clearInterval(autoTimer); autoTimer = null; }}
  autoRunning = false;
}}

function toggleAuto() {{
  autoEnabled = !autoEnabled;
  syncAuto();
  if (autoEnabled) startAutoFrom(); else stopAuto();
}}

function startAutoFrom() {{
  stopAuto();
  const total = chapterVerseCount();
  if (total === 0) return;
  let start = presentedVerse >= 0 ? presentedVerse + 1 : 0;
  if (start >= total) start = 0;
  if (start !== presentedVerse) presentVerse(start);
  autoRunning = true;
  autoTimer = setInterval(function() {{
    const next = presentedVerse + 1;
    if (next >= chapterVerseCount()) {{ stopAuto(); return; }}
    presentVerse(next);
  }}, autoInterval * 1000);
}}

function autoSecChange(v) {{
  const s = parseInt(v, 10);
  if (s > 0 && s <= 3600) autoInterval = s;
  if (autoRunning) startAutoFrom();
}}

function syncAuto() {{
  const b = document.getElementById('autoBtn');
  if (!b) return;
  b.classList.toggle('on', autoEnabled);
  b.textContent = autoEnabled ? '● Đang theo dõi' : '● Tự động';
}}

function scrollToPresented(i) {{
  const rows = document.querySelectorAll('.verse-row');
  if (i >= 0 && rows[i]) rows[i].scrollIntoView({{ block: 'center', behavior: 'smooth' }});
}}

function scrollToPresentedFast(i) {{
  const rows = document.querySelectorAll('.verse-row');
  if (i >= 0 && rows[i]) rows[i].scrollIntoView({{ block: 'center', behavior: 'auto' }});
}}

function chapterVerseCount() {{
  return document.querySelectorAll('.verse-row').length;
}}

async function syncBibleRef(ref) {{
  if (!ref) return;
  const p = ref.split('|');
  if (p.length < 3) return;
  const abbrev = p[0], chapter = parseInt(p[1], 10), verse = parseInt(p[2], 10);
  if (!abbrev || !chapter || !verse) return;
  if (!booksCache.length) {{ try {{ booksCache = await fetchBooks(); }} catch(e) {{ return; }} }}
  const book = booksCache.find(b => b.abbrev === abbrev);
  if (!book) return;
  try {{
    const target = verse - 1;
    if (curBook && curBook.abbrev === abbrev && curChapter === chapter) {{
      presentedVerse = target;
      setPresenting(presentedVerse);
      updateNavPos();
      scrollToPresentedFast(target);
    }} else {{
      await loadBookChapter(book.abbrev, book.name, book.chapters, chapter);
      presentedVerse = target;
      setPresenting(presentedVerse);
      updateNavPos();
      scrollToPresentedFast(target);
    }}
  }} catch(e) {{}}
}}

function startEvents() {{
  var es;
  try {{ es = new EventSource('/api/v1/events'); }} catch(e) {{ return; }}
  es.onmessage = function(ev) {{
    var d;
    try {{ d = JSON.parse(ev.data); }} catch(e) {{ return; }}
    if (!d) return;
    var cur = d.current;
    var has = !!cur;
    document.getElementById('outLabel').textContent = has ? (cur.label || cur.title || 'Đang trình chiếu') : 'Đang trống';
    document.getElementById('outTitle').textContent = (cur && cur.title) || '';
    document.getElementById('outText').textContent = has ? (cur.text || '…') : '—';
    document.getElementById('outNext').textContent = d.next_text ? ('Tiếp theo: ' + (d.next_label ? d.next_label + ' — ' : '') + d.next_text) : '';
    var ref = cur && cur.bible_ref ? cur.bible_ref : null;
    if (ref !== lastBibleRef) {{
      lastBibleRef = ref;
      syncBibleRef(ref);
    }}
  }};
  es.onerror = function() {{}};
}}

startEvents();
setInterval(refreshAll, 2000);
refreshAll();
</script>
</body></html>"#,
        STYLE = style,
    );
    html
}

fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            map.insert(k.to_string(), percent_decode(v));
        }
    }
    map
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn resolve_song_order(song: &crate::models::Song, arrangement_id: Option<&str>) -> Vec<String> {
    if let Some(aid) = arrangement_id {
        if let Some(arr) = song.arrangements.iter().find(|a| a.id == aid) {
            if !arr.order.is_empty() {
                return arr.order.clone();
            }
        }
    }
    song.slides.iter().map(|s| s.id.clone()).collect()
}

struct BibleStyleBundle {
    text_color: String,
    font_size: u32,
    align: String,
    position: String,
    bg_color: String,
    bg_filter: String,
    elements: Vec<crate::models::TemplateElement>,
    overrides: Vec<crate::models::StyleOverride>,
}

fn resolve_bible_style(
    app: &tauri::AppHandle,
    settings: &crate::models::AppSettings,
    state: &AppState,
    version: Option<&str>,
) -> BibleStyleBundle {
    let templates = state.templates.lock().map(|g| g.clone()).unwrap_or_default();
    let version_tpl = crate::bible::bible_version_template_id(app, version)
        .and_then(|id| templates.iter().find(|t| t.id == id));
    let tpl_id = version_tpl
        .map(|t| t.id.clone())
        .or_else(|| settings.default_bible_template_id.clone())
        .or_else(|| settings.default_template_id.clone())
        .or_else(|| templates.iter().find(|t| t.category == "bible").map(|t| t.id.clone()));
    let tpl = tpl_id
        .as_ref()
        .and_then(|id| templates.iter().find(|t| t.id == *id));
    BibleStyleBundle {
        text_color: tpl.as_ref().map(|t| t.text_color.clone()).unwrap_or_default(),
        font_size: tpl.as_ref().map(|t| t.font_size).unwrap_or(0),
        align: tpl.as_ref().map(|t| t.align.clone()).unwrap_or_else(|| "center".into()),
        position: tpl
            .as_ref()
            .map(|t| t.position.clone())
            .unwrap_or_else(|| "center".into()),
        bg_color: tpl.as_ref().map(|t| t.bg_color.clone()).unwrap_or_default(),
        bg_filter: tpl
            .as_ref()
            .map(|t| t.bg_filter.clone())
            .unwrap_or_default(),
        elements: tpl.map(|t| t.elements.clone()).unwrap_or_default(),
        overrides: tpl.map(|t| t.overrides.clone()).unwrap_or_default(),
    }
}

fn merge_slide_style(
    mut slide: crate::models::LiveSlide,
    fmt: BibleStyleBundle,
) -> crate::models::LiveSlide {
    slide.text_color = if fmt.text_color.is_empty() {
        slide.text_color.clone()
    } else {
        Some(fmt.text_color)
    };
    if fmt.font_size > 0 {
        slide.font_size = Some(fmt.font_size);
    }
    slide.align = Some(fmt.align);
    slide.position = Some(fmt.position);
    if !fmt.bg_color.is_empty() {
        slide.bg_color = Some(fmt.bg_color);
    }
    if !fmt.bg_filter.is_empty() {
        slide.bg_filter = Some(fmt.bg_filter);
    }
    if !fmt.elements.is_empty() {
        slide.elements = fmt.elements;
    }
    if !fmt.overrides.is_empty() {
        slide.overrides = fmt.overrides;
    }
    slide
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(field: &str, value: &str) -> Header {
        Header::from_bytes(field.as_bytes(), value.as_bytes())
            .unwrap_or_else(|_| panic!("invalid header {field}: {value}"))
    }

    fn token_headers(pin: &str) -> Vec<Header> {
        vec![header("X-Church-Token", pin)]
    }

    #[test]
    fn token_empty_pin_allows_any_request() {
        assert!(church_token_ok(&[], ""));
        assert!(church_token_ok(&token_headers("anything"), ""));
    }

    #[test]
    fn token_correct_pin_passes() {
        assert!(church_token_ok(&token_headers("1234"), "1234"));
    }

    #[test]
    fn token_wrong_pin_fails() {
        assert!(!church_token_ok(&token_headers("0000"), "1234"));
    }

    #[test]
    fn token_missing_header_fails_when_pin_set() {
        assert!(!church_token_ok(&[], "1234"));
    }

    #[test]
    fn token_other_headers_do_not_matter() {
        let headers = vec![
            header("Host", "localhost"),
            header("Content-Type", "application/json"),
        ];
        assert!(!church_token_ok(&headers, "1234"));
        let headers = vec![
            header("Host", "localhost"),
            header("X-Church-Token", "1234"),
        ];
        assert!(church_token_ok(&headers, "1234"));
    }

    #[test]
    fn token_empty_pin_with_wrong_token_passes() {
        // PIN rỗng nghĩa là không cài mật khẩu → bỏ qua header.
        assert!(church_token_ok(&token_headers(""), ""));
    }

    #[test]
    fn ct_eq_equal_strings() {
        assert!(ct_str_eq("1234", "1234"));
        assert!(ct_str_eq("", ""));
    }

    #[test]
    fn ct_eq_different_strings() {
        assert!(!ct_str_eq("1234", "1235"));
        assert!(!ct_str_eq("1234", "12345"));
        assert!(!ct_str_eq("12345", "1234"));
        assert!(!ct_str_eq("", "1"));
    }

    #[test]
    fn ct_eq_unicode_safe() {
        assert!(ct_str_eq("Kinh Thánh", "Kinh Thánh"));
        assert!(!ct_str_eq("Kinh Thánh", "Kinh Thanh"));
    }

    #[test]
    fn api_key_empty_allows() {
        assert!(api_key_ok(&[], ""));
    }

    #[test]
    fn api_key_correct_passes() {
        assert!(api_key_ok(&[header("X-API-Key", "sekret")], "sekret"));
    }

    #[test]
    fn api_key_wrong_fails() {
        assert!(!api_key_ok(&[header("X-API-Key", "wrong")], "sekret"));
    }

    #[test]
    fn api_key_missing_header_fails() {
        assert!(!api_key_ok(&[], "sekret"));
    }

    // ---- parse_query / percent_decode ----

    #[test]
    fn query_parses_pairs() {
        let m = parse_query("a=1&b=2&c=");
        assert_eq!(m.get("a").map(String::as_str), Some("1"));
        assert_eq!(m.get("b").map(String::as_str), Some("2"));
        assert_eq!(m.get("c").map(String::as_str), Some(""));
    }

    #[test]
    fn query_empty_returns_empty_map() {
        let m = parse_query("");
        assert!(m.is_empty());
    }

    #[test]
    fn query_percent_encoded_decoded() {
        let m = parse_query("q=Kinh%20Th%C3%A1nh");
        assert_eq!(m.get("q").map(String::as_str), Some("Kinh Thánh"));
    }

    #[test]
    fn percent_decode_handles_bad_escape() {
        assert_eq!(percent_decode("a%zz"), "a%zz");
        assert_eq!(percent_decode("100%"), "100%");
    }

    // ---- resolve_song_order ----

    fn slide(id: &str) -> crate::models::SongSlide {
        crate::models::SongSlide {
            id: id.into(),
            label: id.into(),
            text: String::new(),
            notes: String::new(),
            template_id: None,
            layers: Vec::new(),
            formatting: None,
            background: None,
        }
    }

    fn song(id: &str, slide_ids: &[&str]) -> crate::models::Song {
        crate::models::Song {
            id: id.into(),
            title: id.into(),
            artist: String::new(),
            key: String::new(),
            ccli: String::new(),
            copyright: String::new(),
            slides: slide_ids.iter().map(|s| slide(s)).collect(),
            arrangements: Vec::new(),
            template_id: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn song_with_arrangement(s: &mut crate::models::Song, aid: &str, order: &[&str]) {
        s.arrangements.push(crate::models::SongArrangement {
            id: aid.into(),
            name: aid.into(),
            order: order.iter().map(|x| x.to_string()).collect(),
        });
    }

    #[test]
    fn order_defaults_to_slides_in_order() {
        let s = song("s1", &["a", "b", "c"]);
        assert_eq!(resolve_song_order(&s, None), order_str(&["a", "b", "c"]));
    }

    #[test]
    fn order_uses_arrangement_when_matching() {
        let mut s = song("s1", &["a", "b", "c"]);
        song_with_arrangement(&mut s, "arr1", &["c", "a"]);
        assert_eq!(resolve_song_order(&s, Some("arr1")), order_str(&["c", "a"]));
    }

    #[test]
    fn order_unknown_arrangement_falls_back() {
        let mut s = song("s1", &["a", "b", "c"]);
        song_with_arrangement(&mut s, "arr1", &["c", "a"]);
        assert_eq!(resolve_song_order(&s, Some("nope")), order_str(&["a", "b", "c"]));
    }

    #[test]
    fn order_empty_arrangement_falls_back() {
        let mut s = song("s1", &["a", "b", "c"]);
        song_with_arrangement(&mut s, "arr1", &[]);
        assert_eq!(resolve_song_order(&s, Some("arr1")), order_str(&["a", "b", "c"]));
    }

    fn order_str(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|x| x.to_string()).collect()
    }
}
