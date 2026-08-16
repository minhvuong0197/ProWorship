// Interlinear Hebrew/Greek lookup backed by prebuilt data emitted by
// build_interlinear.mjs (assets/bible/ilg, gzip-compressed JSON).
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::sync::Mutex;

include!("interlinear_files.rs");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterlinearWord {
    pub word: String,
    #[serde(default)]
    pub translit: String,
    pub strong: String,
    #[serde(default)]
    pub morph: String,
    #[serde(default)]
    pub lexeme: String,
    #[serde(default)]
    pub gloss: String,
    #[serde(default)]
    pub order: String,
    pub lang: String, // "hebrew" | "greek"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrongEntry {
    pub id: String, // HXXXX / GXXXX
    pub lang: String,
    #[serde(default)]
    pub lemma: String,
    #[serde(default)]
    pub translit: String,
    #[serde(default)]
    pub pron: String,
    #[serde(default)]
    pub derivation: String,
    #[serde(default)]
    pub strongs_def: String,
    #[serde(default)]
    pub kjv_def: String,
    #[serde(default)]
    pub count: u32,
}

// Per-book decompressed cache: abbrev -> parsed book JSON
static GRK_CACHE: Mutex<Option<HashMap<String, serde_json::Value>>> = Mutex::new(None);
static HEB_CACHE: Mutex<Option<HashMap<String, serde_json::Value>>> = Mutex::new(None);
// Strong's dicts (decompressed once), plus occurrence counts
static STR_G: Mutex<Option<serde_json::Value>> = Mutex::new(None);
static STR_H: Mutex<Option<serde_json::Value>> = Mutex::new(None);

fn gunzip_obj(bytes: &[u8]) -> Result<serde_json::Value, String> {
    let mut dec = flate2::read::GzDecoder::new(bytes);
    let mut s = String::new();
    dec.read_to_string(&mut s)
        .map_err(|e| format!("giải nén dữ liệu: {e}"))?;
    serde_json::from_str(&s).map_err(|e| format!("đọc JSON: {e}"))
}

fn load_book(abbrev: &str) -> Option<serde_json::Value> {
    let bytes = book_bytes(abbrev)?;
    let greek = is_greek_book(abbrev);
    let mut guard = if greek {
        GRK_CACHE.lock().unwrap()
    } else {
        HEB_CACHE.lock().unwrap()
    };
    let cache = guard.get_or_insert_with(HashMap::new);
    let key = abbrev.to_string();
    cache
        .entry(key)
        .or_insert_with(|| gunzip_obj(bytes).unwrap_or(serde_json::json!({})))
        .clone()
        .into()
}

fn strongs(lang: &str) -> serde_json::Value {
    if lang == "greek" {
        let mut guard = STR_G.lock().unwrap();
        guard
            .get_or_insert_with(|| {
                gunzip_obj(strong_bytes_greek()).unwrap_or(serde_json::json!({}))
            })
            .clone()
    } else {
        let mut guard = STR_H.lock().unwrap();
        guard
            .get_or_insert_with(|| {
                gunzip_obj(strong_bytes_hebrew()).unwrap_or(serde_json::json!({}))
            })
            .clone()
    }
}

fn occurrence_counts(lang: &str) -> HashMap<String, u32> {
    let mut counts = HashMap::new();
    if lang == "greek" {
        for book in ["Matt","Mark","Luke","John","Acts","Rom","1Cor","2Cor","Gal","Eph","Phil","Col","1Thess","2Thess","1Tim","2Tim","Titus","Phlm","Heb","Jas","1Pet","2Pet","1John","2John","3John","Jude","Rev"] {
            if let Some(v) = load_book(book) {
                count_in_book(&v, &mut counts);
            }
        }
    } else {
        for book in ["Gen","Exod","Lev","Num","Deut","Josh","Judg","Rut","1Sam","2Sam","1Kgs","2Kgs","1Chr","2Chr","Ezra","Neh","Est","Job","Ps","Prov","Eccl","Song","Isa","Jer","Lam","Ezek","Dan","Hos","Joel","Amos","Obad","Jon","Mic","Nah","Hab","Zeph","Hag","Zech","Mal"] {
            if let Some(v) = load_book(book) {
                count_in_book(&v, &mut counts);
            }
        }
    }
    counts
}

fn count_in_book(book: &serde_json::Value, counts: &mut HashMap<String, u32>) {
    if let Some(chs) = book.as_object() {
        for c in chs.values() {
            if let Some(verses) = c.as_object() {
                for words in verses.values() {
                    if let Some(arr) = words.as_array() {
                        for w in arr {
                            if let Some(s) = w.get("strong").and_then(|s| s.as_str()) {
                                *counts.entry(s.to_string()).or_insert(0) += 1;
                            }
                        }
                    }
                }
            }
        }
    }
}

fn word_from_json(w: &serde_json::Value, lang: &str) -> InterlinearWord {
    InterlinearWord {
        word: w.get("word").and_then(|s| s.as_str()).unwrap_or("").into(),
        translit: w.get("translit").and_then(|s| s.as_str()).unwrap_or("").into(),
        strong: w.get("strong").and_then(|s| s.as_str()).unwrap_or("").into(),
        morph: w.get("morph").and_then(|s| s.as_str()).unwrap_or("").into(),
        lexeme: w.get("lexeme").and_then(|s| s.as_str()).unwrap_or("").into(),
        gloss: w.get("gloss").and_then(|s| s.as_str()).unwrap_or("").into(),
        order: w.get("order").and_then(|s| s.as_str()).unwrap_or("").into(),
        lang: lang.into(),
    }
}

#[tauri::command]
pub fn get_interlinear_verse(
    abbrev: String,
    chapter: u32,
    verse: u32,
) -> Result<Vec<InterlinearWord>, String> {
    let lang = if is_greek_book(&abbrev) { "greek" } else { "hebrew" };
    let book = load_book(&abbrev).ok_or_else(|| format!("không có dữ liệu nguyên ngữ cho {abbrev}"))?;
    let ch = book
        .get(chapter.to_string().as_str())
        .ok_or_else(|| format!("không có chương {chapter} trong {abbrev}"))?;
    let v = ch
        .get(verse.to_string().as_str())
        .ok_or_else(|| format!("không có câu {chapter}:{verse} trong {abbrev}"))?;
    let words = v
        .as_array()
        .ok_or_else(|| format!("dữ liệu câu {chapter}:{verse} không hợp lệ"))?;
    Ok(words
        .iter()
        .map(|w| {
            let mut wr = word_from_json(w, lang);
            // Hebrew has no lexeme/gloss in per-word data; fill from strongs dict
            if lang == "hebrew" {
                if let Some(h) = strongs("hebrew").get(&wr.strong) {
                    if wr.lexeme.is_empty() {
                        wr.lexeme = h.get("lemma").and_then(|s| s.as_str()).unwrap_or("").into();
                    }
                    if wr.gloss.is_empty() {
                        wr.gloss = h
                            .get("kjv_def")
                            .and_then(|s| s.as_str())
                            .or_else(|| h.get("strongs_def").and_then(|s| s.as_str()))
                            .unwrap_or("")
                            .into();
                    }
                    if wr.translit.is_empty() {
                        wr.translit = h.get("xlit").and_then(|s| s.as_str()).unwrap_or("").into();
                    }
                }
            } else {
                if wr.lexeme.is_empty() {
                    wr.lexeme = wr.translit.clone();
                }
                if let Some(g) = strongs("greek").get(&wr.strong) {
                    if wr.gloss.is_empty() {
                        wr.gloss = g
                            .get("strongs_def")
                            .and_then(|s| s.as_str())
                            .unwrap_or("")
                            .into();
                    }
                }
            }
            wr
        })
        .collect::<Vec<_>>())
}

#[tauri::command]
pub fn get_strong_entry(id: String) -> Result<StrongEntry, String> {
    let (lang, key) = if id.starts_with("G") && id.len() > 1 {
        ("greek", id.as_str())
    } else if id.starts_with("H") && id.len() > 1 {
        ("hebrew", id.as_str())
    } else {
        return Err(format!("mã Strong không hợp lệ: {id}"));
    };
    let dict = strongs(lang);
    let entry = dict
        .get(key)
        .ok_or_else(|| format!("không tìm thấy mục {}", id))?;
    let count = if lang == "greek" {
        strong_greek_counts().get(key).copied().unwrap_or(0)
    } else {
        strong_hebrew_counts().get(key).copied().unwrap_or(0)
    };
    Ok(StrongEntry {
        id,
        lang: lang.into(),
        lemma: entry.get("lemma").and_then(|s| s.as_str()).unwrap_or("").into(),
        translit: entry
            .get("xlit")
            .and_then(|s| s.as_str())
            .or_else(|| entry.get("translit").and_then(|s| s.as_str()))
            .unwrap_or("")
            .into(),
        pron: entry.get("pron").and_then(|s| s.as_str()).unwrap_or("").into(),
        derivation: entry.get("derivation").and_then(|s| s.as_str()).unwrap_or("").into(),
        strongs_def: entry.get("strongs_def").and_then(|s| s.as_str()).unwrap_or("").into(),
        kjv_def: entry.get("kjv_def").and_then(|s| s.as_str()).unwrap_or("").into(),
        count,
    })
}

#[tauri::command]
pub fn search_strong(query: String, limit: Option<u32>) -> Vec<StrongEntry> {
    let q = norm_search(&query);
    let limit = limit.unwrap_or(50) as usize;
    let mut out = Vec::new();
    let g = strong_greek_counts();
    let h = strong_hebrew_counts();
    for (lang, dict) in [("greek", strongs("greek")), ("hebrew", strongs("hebrew"))] {
        if let Some(obj) = dict.as_object() {
            for (key, e) in obj {
                if out.len() >= limit {
                    break;
                }
                let lemma = e.get("lemma").and_then(|s| s.as_str()).unwrap_or("");
                let translit = e
                    .get("xlit")
                    .and_then(|s| s.as_str())
                    .or_else(|| e.get("translit").and_then(|s| s.as_str()))
                    .unwrap_or("");
                let sdef = e.get("strongs_def").and_then(|s| s.as_str()).unwrap_or("");
                let kdef = e.get("kjv_def").and_then(|s| s.as_str()).unwrap_or("");
                let norm = e
                    .get("__norm")
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();
                let matches = if norm.is_empty() {
                    let k = key.to_lowercase();
                    let hay = format!(
                        "{} {} {} {} {}",
                        norm_search(&k),
                        norm_search(lemma),
                        norm_search(translit),
                        norm_search(sdef),
                        norm_search(kdef)
                    );
                    hay.contains(&q) || k.contains(&q)
                } else {
                    norm.contains(&q) || key.to_lowercase().contains(&q)
                };
                if matches {
                    let count = if lang == "greek" {
                        g.get(key).copied().unwrap_or(0)
                    } else {
                        h.get(key).copied().unwrap_or(0)
                    };
                    out.push(StrongEntry {
                        id: key.clone(),
                        lang: lang.into(),
                        lemma: lemma.into(),
                        translit: translit.into(),
                        pron: e.get("pron").and_then(|s| s.as_str()).unwrap_or("").into(),
                        derivation: e.get("derivation").and_then(|s| s.as_str()).unwrap_or("").into(),
                        strongs_def: sdef.into(),
                        kjv_def: kdef.into(),
                        count,
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out.truncate(limit);
    out
}

// Lowercase + strip combining diacritics so "agapáō" matches "agapa".
fn norm_search(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if !(c as u32 >= 0x300 && c as u32 <= 0x36f) {
            out.push(c.to_ascii_lowercase());
        }
    }
    out
}

// Lazy per-language occurrence counts (not stored statically)
static COUNT_G: Mutex<Option<HashMap<String, u32>>> = Mutex::new(None);
static COUNT_H: Mutex<Option<HashMap<String, u32>>> = Mutex::new(None);

fn strong_greek_counts() -> HashMap<String, u32> {
    let mut guard = COUNT_G.lock().unwrap();
    if guard.is_none() {
        *guard = Some(occurrence_counts("greek"));
    }
    guard.clone().unwrap_or_default()
}

fn strong_hebrew_counts() -> HashMap<String, u32> {
    let mut guard = COUNT_H.lock().unwrap();
    if guard.is_none() {
        *guard = Some(occurrence_counts("hebrew"));
    }
    guard.clone().unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greek_matt_1_1() {
        let words = get_interlinear_verse("Matt".into(), 1, 1).unwrap();
        assert_eq!(words.len(), 8);
        assert_eq!(words[0].strong, "G976");
        assert_eq!(words[0].word, "Βίβλος");
        assert_eq!(words[0].translit, "biblos");
    }

    #[test]
    fn hebrew_gen_1_1() {
        let words = get_interlinear_verse("Gen".into(), 1, 1).unwrap();
        assert_eq!(words.len(), 7);
        assert_eq!(words[0].strong, "H7225");
        assert!(words[0].gloss.len() > 2, "gloss was empty");
    }

    #[test]
    fn strong_lookup() {
        let e = get_strong_entry("G25".into()).unwrap();
        assert!(e.strongs_def.to_lowercase().contains("love"));
        let e = get_strong_entry("H7225".into()).unwrap();
        assert!(e.count > 0);
    }

    #[test]
    fn search_works() {
        let r = search_strong("agapa".into(), Some(10));
        assert!(!r.is_empty());
        assert!(r.iter().any(|e| e.id == "G25"));
    }

    #[test]
    fn unknown_book() {
        assert!(get_interlinear_verse("Zzz".into(), 1, 1).is_err());
    }
}