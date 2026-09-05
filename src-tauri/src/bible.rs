use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use tauri::Manager;

pub const BUILTIN_VERSION_ID: &str = "vie";

#[derive(Debug, Clone, Serialize)]
pub struct BibleVersion {
    pub id: String,
    pub name: String,
    pub language: String,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BibleFile {
    pub name: String,
    pub language: String,
    pub books: Vec<BibleBook>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub template_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BibleBook {
    abbrev: String,
    name: String,
    chapters: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BibleBookMeta {
    pub abbrev: String,
    pub name: String,
    pub short: String,
    pub chapters: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct BibleChapter {
    pub abbrev: String,
    pub name: String,
    pub chapter: usize,
    pub verses: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BibleSearchHit {
    pub abbrev: String,
    pub name: String,
    pub chapter: usize,
    pub verse: usize,
    pub reference: String,
    pub text: String,
}

struct FoldedVerse {
    book: usize,
    chapter: usize,
    verse: usize,
    text: String,
}

struct BibleIndex {
    books: Vec<BibleBook>,
    folded: Vec<FoldedVerse>,
}

static INDEX: OnceLock<BibleIndex> = OnceLock::new();

const BOOK_NAMES: &[(&str, &str)] = &[
    ("Gen", "Sáng-thế Ký"),
    ("Exod", "Xuất Ê-díp-tô Ký"),
    ("Lev", "Lê-vi Ký"),
    ("Num", "Dân-số Ký"),
    ("Deut", "Phục-truyền Luật-lệ Ký"),
    ("Josh", "Giô-suê"),
    ("Judg", "Các Quan Xét"),
    ("Rut", "Ru-tơ"),
    ("1Sam", "1 Sa-mu-ên"),
    ("2Sam", "2 Sa-mu-ên"),
    ("1Kgs", "1 Các Vua"),
    ("2Kgs", "2 Các Vua"),
    ("1Chr", "1 Sử-ký"),
    ("2Chr", "2 Sử-ký"),
    ("Ezra", "E-xơ-ra"),
    ("Neh", "Nê-hê-mi"),
    ("Est", "Ê-xơ-tê"),
    ("Job", "Gióp"),
    ("Ps", "Thi-thiên"),
    ("Prov", "Châm-ngôn"),
    ("Eccl", "Truyền-đạo"),
    ("Song", "Nhã-ca"),
    ("Isa", "Ê-sai"),
    ("Jer", "Giê-rê-mi"),
    ("Lam", "Ca-thương"),
    ("Ezek", "Ê-xê-chi-ên"),
    ("Dan", "Đa-ni-ên"),
    ("Hos", "Ô-sê"),
    ("Joel", "Giô-ên"),
    ("Amos", "A-mốt"),
    ("Obad", "Áp-đia"),
    ("Jon", "Giô-na"),
    ("Mic", "Mi-chê"),
    ("Nah", "Na-hum"),
    ("Hab", "Ha-ba-cúc"),
    ("Zeph", "Sô-phô-ni"),
    ("Hag", "A-ghê"),
    ("Zech", "Xa-cha-ri"),
    ("Mal", "Ma-la-chi"),
    ("Matt", "Ma-thi-ơ"),
    ("Mark", "Mác"),
    ("Luke", "Lu-ca"),
    ("John", "Giăng"),
    ("Acts", "Công-vụ các Sứ-đồ"),
    ("Rom", "Rô-ma"),
    ("1Cor", "1 Cô-rinh-tô"),
    ("2Cor", "2 Cô-rinh-tô"),
    ("Gal", "Ga-la-ti"),
    ("Eph", "Ê-phê-sô"),
    ("Phil", "Phi-líp"),
    ("Col", "Cô-lô-se"),
    ("1Thess", "1 Tê-sa-lô-ni-ca"),
    ("2Thess", "2 Tê-sa-lô-ni-ca"),
    ("1Tim", "1 Ti-mô-thê"),
    ("2Tim", "2 Ti-mô-thê"),
    ("Titus", "Tít"),
    ("Phlm", "Phi-lê-môn"),
    ("Heb", "Hê-bơ-rơ"),
    ("Jas", "Gia-cơ"),
    ("1Pet", "1 Phi-e-rơ"),
    ("2Pet", "2 Phi-e-rơ"),
    ("1John", "1 Giăng"),
    ("2John", "2 Giăng"),
    ("3John", "3 Giăng"),
    ("Jude", "Giu-đe"),
    ("Rev", "Khải-huyền"),
];

const BOOK_SHORTS: &[(&str, &str)] = &[
    ("Gen", "Sa"),
    ("Exod", "Xu"),
    ("Lev", "Le"),
    ("Num", "Dans"),
    ("Deut", "Pht"),
    ("Josh", "Gios"),
    ("Judg", "Cac"),
    ("Rut", "Ru"),
    ("1Sam", "1Sa"),
    ("2Sam", "2Sa"),
    ("1Kgs", "1Ca"),
    ("2Kgs", "2Ca"),
    ("1Chr", "1Su"),
    ("2Chr", "2Su"),
    ("Ezra", "Exr"),
    ("Neh", "Ne"),
    ("Est", "Ext"),
    ("Job", "Giop"),
    ("Ps", "Thi"),
    ("Prov", "Cham"),
    ("Eccl", "Tru"),
    ("Song", "Nha"),
    ("Isa", "Es"),
    ("Jer", "Gie"),
    ("Lam", "Cat"),
    ("Ezek", "Exc"),
    ("Dan", "Dani"),
    ("Hos", "Ose"),
    ("Joel", "Gioe"),
    ("Amos", "Am"),
    ("Obad", "Ap"),
    ("Jon", "Gion"),
    ("Mic", "Mi"),
    ("Nah", "Na"),
    ("Hab", "Ha"),
    ("Zeph", "So"),
    ("Hag", "Ag"),
    ("Zech", "Xa"),
    ("Mal", "Mal"),
    ("Matt", "Mat"),
    ("Mark", "Mac"),
    ("Luke", "Lu"),
    ("John", "Gian"),
    ("Acts", "Con"),
    ("Rom", "Ro"),
    ("1Cor", "1Co"),
    ("2Cor", "2Co"),
    ("Gal", "Ga"),
    ("Eph", "Ep"),
    ("Phil", "Phl"),
    ("Col", "Col"),
    ("1Thess", "1Te"),
    ("2Thess", "2Te"),
    ("1Tim", "1Ti"),
    ("2Tim", "2Ti"),
    ("Titus", "Tit"),
    ("Phlm", "Phi"),
    ("Heb", "He"),
    ("Jas", "Giac"),
    ("1Pet", "1Phi"),
    ("2Pet", "2Phi"),
    ("1John", "1Gia"),
    ("2John", "2Gia"),
    ("3John", "3Gia"),
    ("Jude", "Giu"),
    ("Rev", "Kha"),
];

fn vn_name(abbrev: &str, fallback: &str) -> String {
    BOOK_NAMES
        .iter()
        .find(|(a, _)| *a == abbrev)
        .map(|(_, n)| n.to_string())
        .unwrap_or_else(|| fallback.to_string())
}

fn vn_short(abbrev: &str) -> String {
    BOOK_SHORTS
        .iter()
        .find(|(a, _)| *a == abbrev)
        .map(|(_, n)| n.to_string())
        .unwrap_or_default()
}

fn bible_index() -> &'static BibleIndex {
    INDEX.get_or_init(|| {
        let books: Vec<BibleBook> =
            serde_json::from_str(include_str!("../assets/bible/vi_bible.json"))
                .expect("invalid embedded bible data");
        let mut folded = Vec::with_capacity(32000);
        for (bi, book) in books.iter().enumerate() {
            for (ci, chapter) in book.chapters.iter().enumerate() {
                for (vi, text) in chapter.iter().enumerate() {
                    if !text.is_empty() {
                        folded.push(FoldedVerse {
                            book: bi,
                            chapter: ci + 1,
                            verse: vi + 1,
                            text: fold(text),
                        });
                    }
                }
            }
        }
        BibleIndex { books, folded }
    })
}

fn fold_char(c: char) -> char {
    match c {
        'à' | 'á' | 'ả' | 'ã' | 'ạ' | 'ă' | 'ắ' | 'ằ' | 'ẳ' | 'ẵ' | 'ặ' | 'â' | 'ấ'
        | 'ầ' | 'ẩ' | 'ẫ' | 'ậ' => 'a',
        'è' | 'é' | 'ẻ' | 'ẽ' | 'ẹ' | 'ê' | 'ế' | 'ề' | 'ể' | 'ễ' | 'ệ' => 'e',
        'ì' | 'í' | 'ỉ' | 'ĩ' | 'ị' => 'i',
        'ò' | 'ó' | 'ỏ' | 'õ' | 'ọ' | 'ô' | 'ố' | 'ồ' | 'ổ' | 'ỗ' | 'ộ' | 'ơ' | 'ớ'
        | 'ờ' | 'ở' | 'ỡ' | 'ợ' => 'o',
        'ù' | 'ú' | 'ủ' | 'ũ' | 'ụ' | 'ư' | 'ứ' | 'ừ' | 'ử' | 'ữ' | 'ự' => 'u',
        'ỳ' | 'ý' | 'ỷ' | 'ỹ' | 'ỵ' => 'y',
        'đ' => 'd',
        'ð' => 'd',
        _ => c,
    }
}

fn fold(s: &str) -> String {
    s.to_lowercase().chars().map(fold_char).collect()
}

#[tauri::command]
pub fn get_bible_books() -> Vec<BibleBookMeta> {
    bible_index()
        .books
        .iter()
        .map(|b| BibleBookMeta {
            abbrev: b.abbrev.clone(),
            name: vn_name(&b.abbrev, &b.name),
            short: vn_short(&b.abbrev),
            chapters: b.chapters.len(),
        })
        .collect()
}

#[tauri::command]
pub fn get_bible_chapter(abbrev: String, chapter: usize) -> Result<BibleChapter, String> {
    let idx = bible_index();
    let book = idx
        .books
        .iter()
        .find(|b| b.abbrev == abbrev)
        .ok_or_else(|| format!("không tìm thấy sách: {abbrev}"))?;
    if chapter == 0 || chapter > book.chapters.len() {
        return Err(format!("số chương ngoài phạm vi: {chapter}"));
    }
    Ok(BibleChapter {
        abbrev: book.abbrev.clone(),
        name: vn_name(&book.abbrev, &book.name),
        chapter,
        verses: book.chapters[chapter - 1].clone(),
    })
}

#[tauri::command]
pub fn bible_search(query: String, limit: Option<usize>) -> Vec<BibleSearchHit> {
    let idx = bible_index();
    let limit = limit.unwrap_or(50).min(200);
    if query.trim().is_empty() {
        return Vec::new();
    }
    let tokens: Vec<String> = fold(&query)
        .split_whitespace()
        .map(|t| t.to_string())
        .collect();
    if tokens.is_empty() {
        return Vec::new();
    }

    let mut hits = Vec::new();
    for fv in &idx.folded {
        if tokens.iter().all(|t| fv.text.contains(t.as_str())) {
            let book = &idx.books[fv.book];
            let bname = vn_name(&book.abbrev, &book.name);
            hits.push(BibleSearchHit {
                abbrev: book.abbrev.clone(),
                name: bname.clone(),
                chapter: fv.chapter,
                verse: fv.verse,
                reference: format!("{} {}:{}", bname, fv.chapter, fv.verse),
                text: book.chapters[fv.chapter - 1][fv.verse - 1].clone(),
            });
            if hits.len() >= limit {
                break;
            }
        }
    }
    hits
}

pub fn present_bible_selection_version(
    app: &tauri::AppHandle,
    version: Option<String>,
    abbrev: &str,
    chapter: usize,
    verses: Vec<usize>,
) -> Option<crate::models::LiveSlide> {
    let bf = load_bible_file(app, &version.unwrap_or_else(|| BUILTIN_VERSION_ID.into())).ok()?;
    let book = bf.books.iter().find(|b| b.abbrev == abbrev)?;
    if chapter == 0 || chapter > book.chapters.len() {
        return None;
    }
    let chap = &book.chapters[chapter - 1];
    let refs = if verses.is_empty() {
        chap.iter().enumerate().filter(|(_, t)| !t.is_empty()).collect::<Vec<_>>()
    } else {
        verses.into_iter().filter(|&v| v > 0 && v <= chap.len()).map(|v| (v - 1, &chap[v - 1])).collect()
    };
    if refs.is_empty() {
        return None;
    }
    let bname = vn_name(&book.abbrev, &book.name);
    let first = refs[0].0 + 1;
    let last = refs[refs.len() - 1].0 + 1;
    let reference = if first == last {
        format!("{} {}:{}", bname, chapter, first)
    } else {
        format!("{} {}:{}-{}", bname, chapter, first, last)
    };
    let text = refs
        .iter()
        .map(|(vi, t)| format!("{} {}", vi + 1, t.trim()))
        .collect::<Vec<_>>()
        .join("\n\n");
    Some(crate::models::LiveSlide {
        kind: "song".into(),
        title: reference.clone(),
        text: Some(text),
        label: Some(reference),
        media_path: None,
        live_source: None,
        background: None,
        notes: None,
        text_color: None,
        font_size: None,
        align: None,
        position: None,
        bg_color: None,
        bg_filter: None,
        layers: Vec::new(),
        elements: Vec::new(),
        overrides: Vec::new(),
        formatting: None,
        // Format: abbrev|chapter|first|last|bookName|versionName
        // Extra trailing fields are ignored by parsers that read only the first 4 parts,
        // but let the output renderer resolve dynamic values like {scripture_book} and {scripture_name}.
        bible_ref: Some(format!(
            "{}|{}|{}|{}|{}|{}",
            book.abbrev,
            chapter,
            first,
            last,
            bname,
            bf.name
        )),
    })
}

/// Hiển thị một câu Kinh Thánh trong một đoạn (range) đang trình chiếu từng câu.
/// bible_ref mang thông tin cả đoạn để `advance_bible_selection` bước từng câu
/// trong giới hạn: `abbrev|chapter|cauHienTai|cauHienTai|bookName|versionName|rangeStart|rangeEnd`.
pub fn present_bible_verse_in_range(
    app: &tauri::AppHandle,
    version: Option<String>,
    abbrev: &str,
    chapter: usize,
    verse: usize,
    range_start: usize,
    range_end: usize,
) -> Option<crate::models::LiveSlide> {
    let bf = load_bible_file(app, &version.unwrap_or_else(|| BUILTIN_VERSION_ID.into())).ok()?;
    let book = bf.books.iter().find(|b| b.abbrev == abbrev)?;
    if chapter == 0 || chapter > book.chapters.len() {
        return None;
    }
    let chap = &book.chapters[chapter - 1];
    if verse == 0 || verse > chap.len() {
        return None;
    }
    let text = chap[verse - 1].clone();
    if text.trim().is_empty() {
        return None;
    }
    let bname = vn_name(&book.abbrev, &book.name);
    let reference = if range_start == range_end {
        format!("{} {}:{}", bname, chapter, verse)
    } else {
        format!("{} {}:{}-{}", bname, chapter, range_start, range_end)
    };
    Some(crate::models::LiveSlide {
        kind: "song".into(),
        title: reference.clone(),
        text: Some(format!("{} {}", verse, text.trim())),
        label: Some(reference),
        media_path: None,
        live_source: None,
        background: None,
        notes: None,
        text_color: None,
        font_size: None,
        align: None,
        position: None,
        bg_color: None,
        bg_filter: None,
        layers: Vec::new(),
        elements: Vec::new(),
        overrides: Vec::new(),
        formatting: None,
        bible_ref: Some(format!(
            "{}|{}|{}|{}|{}|{}|{}|{}",
            book.abbrev,
            chapter,
            verse,
            verse,
            bname,
            bf.name,
            range_start,
            range_end
        )),
    })
}

pub fn advance_bible_selection(
    app: &tauri::AppHandle,
    version: Option<String>,
    bible_ref: &str,
    dir: i32,
) -> Option<crate::models::LiveSlide> {
    let parts: Vec<&str> = bible_ref.split('|').collect();
    if parts.len() < 4 {
        return None;
    }
    let abbrev = parts[0].to_string();
    let chapter: usize = parts[1].parse().ok()?;
    let first: usize = parts[2].parse().ok()?;
    let last: usize = parts[3].parse().ok()?;
    let bf = load_bible_file(app, &version.as_deref().unwrap_or(BUILTIN_VERSION_ID)).ok()?;
    let book = bf.books.iter().find(|b| b.abbrev == abbrev)?;
    if chapter == 0 || chapter > book.chapters.len() {
        return None;
    }

    // Trình chiếu từng câu trong đoạn: bible_ref đuôi "|rangeStart|rangeEnd".
    if parts.len() >= 8 {
        let range_start: usize = parts[6].parse().ok()?;
        let range_end: usize = parts[7].parse().ok()?;
        if range_start == 0 || range_end < range_start {
            return None;
        }
        let cur = first;
        let (nc, nv) = if dir > 0 {
            if cur < range_end {
                (chapter, cur + 1)
            } else {
                return None;
            }
        } else if cur > range_start {
            (chapter, cur - 1)
        } else {
            return None;
        };
        return present_bible_verse_in_range(app, version, &abbrev, nc, nv, range_start, range_end);
    }

    // Các trường hợp còn lại (một câu đơn lẻ): đi tiếp câu/chương kế tiếp.
    let chap_len = book.chapters[chapter - 1].len();
    let (nc, nv) = if dir > 0 {
        if last < chap_len {
            (chapter, last + 1)
        } else if chapter < book.chapters.len() {
            (chapter + 1, 1)
        } else {
            return None;
        }
    } else if first > 1 {
        (chapter, first - 1)
    } else if chapter > 1 {
        (chapter - 1, book.chapters[chapter - 2].len())
    } else {
        return None;
    };
    present_bible_selection_version(app, version, &abbrev, nc, vec![nv])
}

const ABBREV_ORDER: &[&str] = &[
    "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Rut", "1Sam", "2Sam", "1Kgs", "2Kgs",
    "1Chr", "2Chr", "Ezra", "Neh", "Est", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer",
    "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jon", "Mic", "Nah", "Hab", "Zeph",
    "Hag", "Zech", "Mal", "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal",
    "Eph", "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas",
    "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
];

fn bibles_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("không lấy được thư mục dữ liệu: {e}"))?
        .join("bibles");
    std::fs::create_dir_all(&dir).map_err(|e| format!("không tạo thư mục bibles: {e}"))?;
    Ok(dir)
}

fn builtin_bible() -> Result<BibleFile, String> {
    let books: Vec<BibleBook> = serde_json::from_str(include_str!("../assets/bible/vi_bible.json"))
        .map_err(|e| format!("lỗi dữ liệu Bible mặc định: {e}"))?;
    Ok(BibleFile {
        name: "Kinh Thánh Tiếng Việt (1925)".to_string(),
        language: "vi".to_string(),
        books,
        template_id: None,
    })
}

fn read_bible_file(path: &std::path::Path, version: &str) -> Result<BibleFile, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("không tìm thấy bản dịch {version}: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("lỗi dữ liệu bản dịch {version}: {e}"))
}

fn load_bible_file(app: &tauri::AppHandle, version: &str) -> Result<BibleFile, String> {
    if version.is_empty() || version == BUILTIN_VERSION_ID {
        let path = bibles_dir(app)?.join(format!("{BUILTIN_VERSION_ID}.json"));
        if path.exists() {
            return read_bible_file(&path, BUILTIN_VERSION_ID);
        }
        return builtin_bible();
    }
    let dir = bibles_dir(app)?;
    let by_id = dir.join(format!("{version}.json"));
    if by_id.exists() {
        return read_bible_file(&by_id, version);
    }
    // ref_id có thể lưu TÊN bản dịch thay vì ID (file). Tìm file theo tên.
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let raw = match std::fs::read_to_string(&path) {
                Ok(r) => r,
                Err(_) => continue,
            };
            if let Ok(bf) = serde_json::from_str::<BibleFile>(&raw) {
                if bf.name == version {
                    return read_bible_file(&path, version);
                }
            }
        }
    }
    Err(format!("không tìm thấy bản dịch {version}"))
}

pub fn bible_version_template_id(app: &tauri::AppHandle, version: Option<&str>) -> Option<String> {
    load_bible_file(app, version.unwrap_or(BUILTIN_VERSION_ID))
        .ok()
        .and_then(|bf| bf.template_id)
}

fn save_bible_file(app: &tauri::AppHandle, version: &str, bf: &BibleFile) -> Result<(), String> {
    let json = serde_json::to_string(bf).map_err(|e| e.to_string())?;
    std::fs::write(
        bibles_dir(app)?.join(format!("{version}.json")),
        json,
    )
    .map_err(|e| format!("không lưu được bản dịch: {e}"))
}

fn editable_version(app: &tauri::AppHandle, id: &str) -> Result<BibleFile, String> {
    if id == "online" {
        return Err("bản dịch trực tuyến không thể chỉnh sửa".into());
    }
    if id == BUILTIN_VERSION_ID {
        let path = bibles_dir(app)?.join(format!("{BUILTIN_VERSION_ID}.json"));
        if path.exists() {
            return read_bible_file(&path, BUILTIN_VERSION_ID);
        }
        let bf = builtin_bible()?;
        save_bible_file(app, id, &bf)?;
        return Ok(bf);
    }
    load_bible_file(app, id)
}

fn safe_id(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if c == '-' || c == '_' {
            out.push(c);
        } else if c.is_whitespace() {
            out.push('_');
        }
    }
    if out.is_empty() {
        out = "bible".into();
    }
    out
}

#[tauri::command]
pub fn list_bible_versions(app: tauri::AppHandle) -> Vec<BibleVersion> {
    let vie_file = bibles_dir(&app)
        .ok()
        .and_then(|d| std::fs::read_to_string(d.join(format!("{BUILTIN_VERSION_ID}.json"))).ok())
        .and_then(|raw| serde_json::from_str::<BibleFile>(&raw).ok());
    let vie_name = vie_file
        .as_ref()
        .map(|f| f.name.clone())
        .unwrap_or_else(|| "Kinh Thánh Tiếng Việt (1925)".to_string());
    let vie_tpl = vie_file.as_ref().and_then(|f| f.template_id.clone());
    let mut out = vec![BibleVersion {
        id: BUILTIN_VERSION_ID.into(),
        name: vie_name,
        language: "vi".into(),
        source: "builtin".into(),
        template_id: vie_tpl,
    }];
    out.push(BibleVersion {
        id: "online".into(),
        name: "bible-api.com (Trực tuyến)".into(),
        language: "vi".into(),
        source: "online".into(),
        template_id: None,
    });
    if let Ok(dir) = bibles_dir(&app) {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for entry in rd.flatten() {
                let fname = entry.file_name().to_string_lossy().to_string();
                let Some(id) = fname.strip_suffix(".json") else {
                    continue;
                };
                if id == BUILTIN_VERSION_ID {
                    continue;
                }
                let meta = std::fs::read_to_string(entry.path())
                    .ok()
                    .and_then(|raw| serde_json::from_str::<BibleFile>(&raw).ok());
                out.push(BibleVersion {
                    id: id.to_string(),
                    name: meta
                        .as_ref()
                        .map(|m| m.name.clone())
                        .unwrap_or_else(|| id.to_string()),
                    language: meta
                        .as_ref()
                        .map(|m| m.language.clone())
                        .unwrap_or_default(),
                    source: "imported".into(),
                    template_id: meta.as_ref().and_then(|m| m.template_id.clone()),
                });
            }
        }
    }
    out
}

#[tauri::command]
pub fn get_bible_books_version(
    app: tauri::AppHandle,
    version: Option<String>,
) -> Result<Vec<BibleBookMeta>, String> {
    let bf = load_bible_file(&app, &version.unwrap_or_else(|| BUILTIN_VERSION_ID.into()))?;
    Ok(bf
        .books
        .iter()
        .map(|b| BibleBookMeta {
            abbrev: b.abbrev.clone(),
            name: vn_name(&b.abbrev, &b.name),
            short: vn_short(&b.abbrev),
            chapters: b.chapters.len(),
        })
        .collect())
}

#[tauri::command]
pub fn get_bible_chapter_version(
    app: tauri::AppHandle,
    version: Option<String>,
    abbrev: String,
    chapter: usize,
) -> Result<BibleChapter, String> {
    let bf = load_bible_file(&app, &version.unwrap_or_else(|| BUILTIN_VERSION_ID.into()))?;
    let book = bf
        .books
        .iter()
        .find(|b| b.abbrev == abbrev)
        .ok_or_else(|| format!("không tìm thấy sách: {abbrev}"))?;
    if chapter == 0 || chapter > book.chapters.len() {
        return Err(format!("số chương ngoài phạm vi: {chapter}"));
    }
    Ok(BibleChapter {
        abbrev: book.abbrev.clone(),
        name: vn_name(&book.abbrev, &book.name),
        chapter,
        verses: book.chapters[chapter - 1].clone(),
    })
}

#[tauri::command]
pub fn import_bible_xml(
    app: tauri::AppHandle,
    path: String,
    version_name: Option<String>,
) -> Result<BibleVersion, String> {
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("không đọc được file: {e}"))?;
    let (name, language, books) = parse_bible_xml(&raw)?;
    if books.is_empty() {
        return Err("không tìm thấy sách nào trong file XML".into());
    }
    let final_name = version_name
        .as_ref()
        .filter(|n| !n.trim().is_empty())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| {
            if name.trim().is_empty() {
                "Kinh Thánh Import".to_string()
            } else {
                name.clone()
            }
        });
    let id = safe_id(&final_name);
    let bf = BibleFile {
        name: final_name.clone(),
        language,
        books,
        template_id: None,
    };
    let json = serde_json::to_string(&bf).map_err(|e| e.to_string())?;
    std::fs::write(bibles_dir(&app)?.join(format!("{id}.json")), json)
        .map_err(|e| format!("không lưu được bản dịch: {e}"))?;
    Ok(BibleVersion {
        id,
        name: final_name,
        language: bf.language,
        source: "imported".into(),
        template_id: None,
    })
}

#[tauri::command]
pub fn import_bible_xml_text(
    app: tauri::AppHandle,
    text: String,
    version_name: Option<String>,
) -> Result<BibleVersion, String> {
    let (name, language, books) = parse_bible_xml(&text)?;
    if books.is_empty() {
        return Err("không tìm thấy sách nào trong file XML".into());
    }
    let final_name = version_name
        .as_ref()
        .filter(|n| !n.trim().is_empty())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| {
            if name.trim().is_empty() {
                "Kinh Thánh Import".to_string()
            } else {
                name.clone()
            }
        });
    let id = safe_id(&final_name);
    let bf = BibleFile {
        name: final_name.clone(),
        language,
        books,
        template_id: None,
    };
    let json = serde_json::to_string(&bf).map_err(|e| e.to_string())?;
    std::fs::write(bibles_dir(&app)?.join(format!("{id}.json")), json)
        .map_err(|e| format!("không lưu được bản dịch: {e}"))?;
    Ok(BibleVersion {
        id,
        name: final_name,
        language: bf.language,
        source: "imported".into(),
        template_id: None,
    })
}

fn parse_bible_xml(raw: &str) -> Result<(String, String, Vec<BibleBook>), String> {
    let raw = raw.trim_start_matches('\u{feff}');
    let mut reader = quick_xml::Reader::from_str(raw);
    let mut books: Vec<BibleBook> = Vec::new();
    let mut cur_book: Option<usize> = None;
    let mut cur_chap: Option<usize> = None;
    let mut cur_verse: Option<usize> = None;
    let mut in_note = false;
    let mut lang = String::new();
    let mut name_hint = String::new();
    let mut pending_text = String::new();

    let is_book = |tag: &[u8], attrs: &HashMap<String, String>| {
        tag == b"book"
            || tag == b"biblebook"
            || (tag == b"div" && attrs.get("type").map(|t| t == "book").unwrap_or(false))
    };
    let is_chapter = |tag: &[u8], attrs: &HashMap<String, String>| {
        tag == b"chapter"
            || tag == b"c"
            || (tag == b"div" && attrs.get("type").map(|t| t == "chapter").unwrap_or(false))
    };
    let is_verse = |tag: &[u8], attrs: &HashMap<String, String>| {
        tag == b"verse"
            || tag == b"vers"
            || tag == b"v"
            || (tag == b"div" && attrs.get("type").map(|t| t == "verse").unwrap_or(false))
    };

    loop {
        let ev = reader.read_event();
        match ev {
            Ok(quick_xml::events::Event::Start(e)) => {
                let tag = e.name().as_ref().to_ascii_lowercase();
                let mut attrs: HashMap<String, String> = e
                    .attributes()
                    .flatten()
                    .map(|a| {
                        (
                            String::from_utf8_lossy(a.key.as_ref())
                                .to_lowercase()
                                .to_string(),
                            String::from_utf8_lossy(&a.value).to_string(),
                        )
                    })
                    .collect();
                if tag == b"bible" || tag == b"osisText" || tag == b"xmlbible" {
                    if lang.is_empty() {
                        lang = attrs
                            .get("xml:lang")
                            .cloned()
                            .or_else(|| attrs.remove("lang"))
                            .unwrap_or_default();
                    }
                    if name_hint.is_empty() {
                        name_hint = attrs.get("biblename").cloned().unwrap_or_default();
                    }
                } else if tag == b"language" {
                    pending_text.clear();
                    if lang.is_empty() {
                        let code = attrs
                            .get("code")
                            .cloned()
                            .unwrap_or_default()
                            .trim()
                            .to_string();
                        if !code.is_empty() {
                            lang = code;
                            in_note = true;
                        }
                    }
                } else if is_book(&tag, &attrs) {
                    let bnumber = attrs.get("bnumber").cloned().unwrap_or_default();
                    let osis = attrs.get("osisid").cloned().unwrap_or_default();
                    let abbr = attrs.get("babbr").cloned().unwrap_or_default();
                    let disp = attrs
                        .get("n")
                        .cloned()
                        .or_else(|| attrs.get("name").cloned())
                        .or_else(|| attrs.get("bname").cloned())
                        .unwrap_or_default();
                    let abbrev = resolve_abbrev(&bnumber, &abbr, &osis);
                    let abbrev = if abbrev.is_empty() {
                        ABBREV_ORDER
                            .get(books.len())
                            .cloned()
                            .unwrap_or_default()
                            .to_string()
                    } else {
                        abbrev
                    };
                    if name_hint.is_empty() && !disp.is_empty() {
                        name_hint = disp.clone();
                    }
                    books.push(BibleBook {
                        abbrev,
                        name: disp,
                        chapters: Vec::new(),
                    });
                    cur_book = Some(books.len() - 1);
                    cur_chap = None;
                    cur_verse = None;
                } else if is_chapter(&tag, &attrs) {
                    if attrs.contains_key("eid") {
                        if cur_chap.is_some() {
                            cur_verse = None;
                            pending_text.clear();
                        }
                    } else if let Some(bi) = cur_book {
                        books[bi].chapters.push(Vec::new());
                        cur_chap = Some(books[bi].chapters.len() - 1);
                        cur_verse = None;
                    }
                } else if is_verse(&tag, &attrs) {
                    if cur_chap.is_some() {
                        if attrs.contains_key("eid") {
                            if let (Some(bi), Some(ci), Some(vi)) =
                                (cur_book, cur_chap, cur_verse)
                            {
                                push_verse_text(&mut books, bi, ci, vi, &pending_text);
                                pending_text.clear();
                            }
                            cur_verse = None;
                        } else if let Some(num) = verse_number(&attrs) {
                            cur_verse = Some(num);
                            pending_text.clear();
                        }
                    }
                } else if tag == b"note" || tag == b"footnote" {
                    in_note = true;
                }
            }
            Ok(quick_xml::events::Event::Empty(e)) => {
                let tag = e.name().as_ref().to_ascii_lowercase();
                let attrs: HashMap<String, String> = e
                    .attributes()
                    .flatten()
                    .map(|a| {
                        (
                            String::from_utf8_lossy(a.key.as_ref())
                                .to_lowercase()
                                .to_string(),
                            String::from_utf8_lossy(&a.value).to_string(),
                        )
                    })
                    .collect();
                if tag == b"language" {
                    in_note = true;
                    pending_text.clear();
                    if lang.is_empty() {
                        lang = attrs
                            .get("code")
                            .cloned()
                            .unwrap_or_default()
                            .trim()
                            .to_string();
                    }
                } else if is_book(&tag, &attrs) {
                    let bnumber = attrs.get("bnumber").cloned().unwrap_or_default();
                    let osis = attrs.get("osisid").cloned().unwrap_or_default();
                    let abbr = attrs.get("babbr").cloned().unwrap_or_default();
                    let disp = attrs
                        .get("n")
                        .cloned()
                        .or_else(|| attrs.get("name").cloned())
                        .or_else(|| attrs.get("bname").cloned())
                        .unwrap_or_default();
                    let abbrev = resolve_abbrev(&bnumber, &abbr, &osis);
                    let abbrev = if abbrev.is_empty() {
                        ABBREV_ORDER
                            .get(books.len())
                            .cloned()
                            .unwrap_or_default()
                            .to_string()
                    } else {
                        abbrev
                    };
                    if name_hint.is_empty() && !disp.is_empty() {
                        name_hint = disp.clone();
                    }
                    books.push(BibleBook {
                        abbrev,
                        name: disp,
                        chapters: Vec::new(),
                    });
                    cur_book = Some(books.len() - 1);
                    cur_chap = None;
                    cur_verse = None;
                } else if is_chapter(&tag, &attrs) {
                    if attrs.contains_key("eid") {
                        cur_chap = None;
                        cur_verse = None;
                    } else if let Some(bi) = cur_book {
                        books[bi].chapters.push(Vec::new());
                        cur_chap = Some(books[bi].chapters.len() - 1);
                        cur_verse = None;
                    }
                } else if is_verse(&tag, &attrs) {
                    if cur_chap.is_some() {
                        if attrs.contains_key("eid") {
                            if let (Some(bi), Some(ci), Some(vi)) =
                                (cur_book, cur_chap, cur_verse)
                            {
                                push_verse_text(&mut books, bi, ci, vi, &pending_text);
                                pending_text.clear();
                            }
                            cur_verse = None;
                        } else if let Some(num) = verse_number(&attrs) {
                            cur_verse = Some(num);
                            pending_text.clear();
                        }
                    }
                } else if tag == b"note" || tag == b"footnote" {
                    in_note = false;
                }
            }
            Ok(quick_xml::events::Event::Text(t)) => {
                if in_note {
                    continue;
                }
                if let Ok(decoded) = t.unescape() {
                    pending_text.push_str(&decoded);
                }
            }
            Ok(quick_xml::events::Event::End(e)) => {
                let tag = e.name().as_ref().to_ascii_lowercase();
                if tag == b"language" {
                    if lang.is_empty() {
                        lang = pending_text.trim().to_string();
                    }
                    in_note = false;
                } else if tag == b"note" || tag == b"footnote" {
                    in_note = false;
                } else if is_verse(&tag, &HashMap::new()) {
                    if let (Some(bi), Some(ci), Some(vi)) = (cur_book, cur_chap, cur_verse) {
                        push_verse_text(&mut books, bi, ci, vi, &pending_text);
                        pending_text.clear();
                    }
                    cur_verse = None;
                } else if is_chapter(&tag, &HashMap::new()) {
                    cur_chap = None;
                } else if is_book(&tag, &HashMap::new()) {
                    cur_book = None;
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => return Err(format!("lỗi parse XML: {e}")),
            _ => {}
        }
    }

    Ok((name_hint, lang, books))
}

fn verse_number(attrs: &HashMap<String, String>) -> Option<usize> {
    let raw_n = attrs
        .get("vnumber")
        .or_else(|| attrs.get("number"))
        .or_else(|| attrs.get("n"))
        .cloned()
        .or_else(|| attrs.get("sid").or_else(|| attrs.get("osisid")).cloned())
        .unwrap_or_default();
    raw_n
        .rsplit(['.', ':'])
        .next()
        .unwrap_or("")
        .trim()
        .parse::<usize>()
        .ok()
}

fn push_verse_text(books: &mut [BibleBook], bi: usize, ci: usize, vi: usize, text: &str) {
    let trimmed = text.trim();
    if !trimmed.is_empty() {
        let chap = &mut books[bi].chapters[ci];
        if chap.len() < vi {
            chap.resize(vi, String::new());
        }
        chap[vi - 1] = trimmed.to_string();
    }
}

fn resolve_abbrev(bnumber: &str, abbr: &str, osis: &str) -> String {
    if !abbr.trim().is_empty() {
        let clean: String = abbr.chars().filter(|c| !c.is_whitespace()).collect();
        for a in ABBREV_ORDER.iter() {
            if a.eq_ignore_ascii_case(&clean) {
                return a.to_string();
            }
        }
        return clean;
    }
    if let Ok(n) = bnumber.trim().parse::<usize>() {
        if (1..=66).contains(&n) {
            return ABBREV_ORDER[n - 1].to_string();
        }
    }
    if !osis.is_empty() {
        let base = osis.split('.').next().unwrap_or("").to_string();
        for abbr in ABBREV_ORDER.iter() {
            if abbr.eq_ignore_ascii_case(&base) {
                return abbr.to_string();
            }
        }
        return base;
    }
    String::new()
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("chỉ cho phép mở địa chỉ http/https".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &url])
            .spawn()
            .map_err(|e| format!("không mở được trình duyệt: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("không mở được trình duyệt: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_bible_version(
    app: tauri::AppHandle,
    id: String,
    new_name: String,
) -> Result<BibleVersion, String> {
    let new_name = new_name.trim().to_string();
    if new_name.is_empty() {
        return Err("tên bản dịch không được để trống".into());
    }
    let mut bf = editable_version(&app, &id)?;
    bf.name = new_name.clone();
    save_bible_file(&app, &id, &bf)?;
    Ok(BibleVersion {
        id,
        name: new_name,
        language: bf.language,
        source: "imported".into(),
        template_id: bf.template_id,
    })
}

#[tauri::command]
pub fn set_bible_version_template(
    app: tauri::AppHandle,
    id: String,
    template_id: Option<String>,
) -> Result<BibleVersion, String> {
    let mut bf = editable_version(&app, &id)?;
    bf.template_id = template_id.clone();
    save_bible_file(&app, &id, &bf)?;
    Ok(BibleVersion {
        id,
        name: bf.name,
        language: bf.language,
        source: "imported".into(),
        template_id,
    })
}

#[tauri::command]
pub fn edit_bible_book(
    app: tauri::AppHandle,
    id: String,
    abbrev: String,
    new_name: String,
) -> Result<(), String> {
    let new_name = new_name.trim().to_string();
    if new_name.is_empty() {
        return Err("tên sách không được để trống".into());
    }
    let mut bf = editable_version(&app, &id)?;
    let book = bf
        .books
        .iter_mut()
        .find(|b| b.abbrev == abbrev)
        .ok_or_else(|| format!("không tìm thấy sách {abbrev}"))?;
    book.name = new_name;
    save_bible_file(&app, &id, &bf)
}

#[tauri::command]
pub fn edit_bible_verse(
    app: tauri::AppHandle,
    id: String,
    abbrev: String,
    chapter: usize,
    verse: usize,
    new_text: String,
) -> Result<(), String> {
    let mut bf = editable_version(&app, &id)?;
    let book = bf
        .books
        .iter_mut()
        .find(|b| b.abbrev == abbrev)
        .ok_or_else(|| format!("không tìm thấy sách {abbrev}"))?;
    if chapter == 0 || chapter > book.chapters.len() {
        return Err(format!("số chương ngoài phạm vi: {chapter}"));
    }
    let ch = &mut book.chapters[chapter - 1];
    if verse == 0 || verse > ch.len() {
        return Err(format!("số câu ngoài phạm vi: {verse}"));
    }
    ch[verse - 1] = new_text;
    save_bible_file(&app, &id, &bf)
}

#[tauri::command]
pub fn delete_bible_version(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if id == "online" {
        return Err("không thể xóa bản trực tuyến".into());
    }
    let path = bibles_dir(&app)?.join(format!("{id}.json"));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("không xóa được file: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parse_zefania_sample() {
        let xml = r#"<?xml version="1.0"?>
<bible translation="VIN">
  <language code="vi">Vietnamese</language>
  <book bnumber="1" name="Genesis">
    <chapter number="1">
      <verse number="1">Ban đầu Đức Chúa Trời dựng nên trời và đất.</verse>
      <verse number="2">Đất vốn không hình dạng và trống rỗng.</verse>
    </chapter>
    <chapter number="2">
      <verse number="1">Vậy các từng trời và đất đã dựng nên xong.</verse>
    </chapter>
  </book>
  <book bnumber="2" name="Exodus">
    <chapter number="1">
      <verse number="1">Nầy là các tên các con trai của Y-sơ-ra-ên.</verse>
    </chapter>
  </book>
</bible>"#;
        let (name, lang, books) = parse_bible_xml(xml).unwrap();
        assert_eq!(lang, "vi");
        assert_eq!(name, "Genesis");
        assert_eq!(books.len(), 2);
        assert_eq!(books[0].abbrev, "Gen");
        assert_eq!(books[0].chapters.len(), 2);
        assert_eq!(books[0].chapters[0].len(), 2);
        assert_eq!(books[0].chapters[0][0], "Ban đầu Đức Chúa Trời dựng nên trời và đất.");
        assert_eq!(books[0].chapters[1][0], "Vậy các từng trời và đất đã dựng nên xong.");
        assert_eq!(books[1].abbrev, "Exod");
    }

    #[test]
    fn parse_osis_sample() {
        let xml = r#"<osisText osisIDWork="KTHD">
  <div type="book" osisID="Matt">
    <chapter osisID="Matt.1">
      <verse osisID="Matt.1.1">Sách gia phổ của Đức Chúa Jêsus Christ.</verse>
    </chapter>
  </div>
</osisText>"#;
        let (_name, _lang, books) = parse_bible_xml(xml).unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].abbrev, "Matt");
        assert_eq!(books[0].chapters[0][0], "Sách gia phổ của Đức Chúa Jêsus Christ.");
    }

    #[test]
    fn parse_osis_markers() {
        let xml = r#"<osisText>
  <div type="book" osisID="Gen">
    <chapter sID="Gen.1"/>
    <verse sID="Gen.1.1"/>Ban đầu Đức Chúa Trời dựng nên trời và đất.<verse eID="Gen.1.1"/>
    <verse sID="Gen.1.2"/>Đất vốn không hình dạng.<verse eID="Gen.1.2"/>
    <chapter eID="Gen.1"/>
  </div>
</osisText>"#;
        let (_name, _lang, books) = parse_bible_xml(xml).unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].abbrev, "Gen");
        assert_eq!(books[0].chapters.len(), 1);
        assert_eq!(books[0].chapters[0].len(), 2);
        assert_eq!(books[0].chapters[0][0], "Ban đầu Đức Chúa Trời dựng nên trời và đất.");
        assert_eq!(books[0].chapters[0][1], "Đất vốn không hình dạng.");
    }

    #[test]
    fn parse_bom_prefix() {
        let xml = "\u{feff}<bible><book bnumber=\"1\" name=\"Genesis\"><chapter number=\"1\"><verse number=\"1\">Test.</verse></chapter></book></bible>";
        let (_name, _lang, books) = parse_bible_xml(xml).unwrap();
        assert_eq!(books[0].chapters[0][0], "Test.");
    }

    #[test]
    fn parse_zefania_uppercase() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<XMLBIBLE biblename="Kinh Thanh">
  <INFORMATION><language>vi</language></INFORMATION>
  <BIBLEBOOK bnumber="1" bname="Sáng-thế Ký" bshort="St" babbr="Gen">
    <CHAPTER cnumber="1">
      <VERS vnumber="1">Ban đầu Đức Chúa Trời dựng nên trời và đất.</VERS>
      <VERS vnumber="2">Đất vốn không hình dạng.</VERS>
    </CHAPTER>
    <CHAPTER cnumber="2">
      <VERS vnumber="1">Vậy các từng trời và đất đã dựng nên xong.</VERS>
    </CHAPTER>
  </BIBLEBOOK>
  <BIBLEBOOK bnumber="2" bname="Xuất Ê-díp-tô Ký" bshort="Xh" babbr="Exod">
    <CHAPTER cnumber="1">
      <VERS vnumber="1">Nầy là các tên các con trai của Y-sơ-ra-ên.</VERS>
    </CHAPTER>
  </BIBLEBOOK>
</XMLBIBLE>"#;
        let (name, lang, books) = parse_bible_xml(xml).unwrap();
        assert_eq!(name, "Kinh Thanh");
        assert_eq!(lang, "vi");
        assert_eq!(books.len(), 2);
        assert_eq!(books[0].abbrev, "Gen");
        assert_eq!(books[0].name, "Sáng-thế Ký");
        assert_eq!(books[0].chapters.len(), 2);
        assert_eq!(books[0].chapters[0][0], "Ban đầu Đức Chúa Trời dựng nên trời và đất.");
        assert_eq!(books[0].chapters[0][1], "Đất vốn không hình dạng.");
        assert_eq!(books[1].abbrev, "Exod");
    }
}
