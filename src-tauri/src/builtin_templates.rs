use crate::models::{StyleOverride, Template, TemplateElement};

/// Bump this when the built-in template set changes so existing installs get
/// the new defaults automatically on the next launch.
pub const TEMPLATES_VERSION: u32 = 5;

pub fn default_templates() -> Vec<Template> {
    let mut out = Vec::new();

    let text = |content: &str, x: f64, y: f64, w: f64, h: f64, color: &str, fs: f64, align: &str| TemplateElement {
        id: uuid::Uuid::new_v4().to_string(),
        kind: "text".into(),
        content: content.into(),
        x,
        y,
        w,
        h,
        color: color.into(),
        font_size: fs,
        align: align.into(),
        bold: false,
        italic: false,
        underline: false,
        outline: false,
        shadow: true,
        opacity: 1.0,
        visible: true,
        auto_size: true,
        fit_mode: "shrink".into(),
        dir: "h".into(),
        stroke_width: 2.0,
        filter: String::new(),
        box_color: String::new(),
        radius: 0.0,
        icon: String::new(),
        duration_s: 0.0,
        speed: 30.0,
        css: String::new(),
        transpose: 0.0,
    };

    let box_el = |x: f64, y: f64, w: f64, h: f64, color: &str, radius: f64, border: &str| TemplateElement {
        id: uuid::Uuid::new_v4().to_string(),
        kind: "box".into(),
        content: String::new(),
        x,
        y,
        w,
        h,
        color: border.into(),
        font_size: 0.0,
        align: "center".into(),
        bold: false,
        italic: false,
        underline: false,
        outline: false,
        shadow: false,
        opacity: 1.0,
        visible: true,
        auto_size: false,
        fit_mode: "none".into(),
        dir: "h".into(),
        stroke_width: 2.0,
        filter: String::new(),
        box_color: color.into(),
        radius,
        icon: String::new(),
        duration_s: 0.0,
        speed: 30.0,
        css: String::new(),
        transpose: 0.0,
    };

    let line_el = |dir: &str, color: &str, x: f64, y: f64, w: f64, h: f64| TemplateElement {
        id: uuid::Uuid::new_v4().to_string(),
        kind: "line".into(),
        content: String::new(),
        x,
        y,
        w,
        h,
        color: color.into(),
        font_size: 0.0,
        align: "center".into(),
        bold: false,
        italic: false,
        underline: false,
        outline: false,
        shadow: false,
        opacity: 1.0,
        visible: true,
        auto_size: false,
        fit_mode: "none".into(),
        dir: dir.into(),
        stroke_width: 2.0,
        filter: String::new(),
        box_color: String::new(),
        radius: 0.0,
        icon: String::new(),
        duration_s: 0.0,
        speed: 30.0,
        css: String::new(),
        transpose: 0.0,
    };

    let tpl = |id: &str, name: &str, category: &str, bg: &str, fg: &str, fs: u32, align: &str, position: &str, bg_filter: &str, elements: Vec<TemplateElement>, first: Option<&str>| Template {
        id: id.into(),
        name: name.into(),
        category: category.into(),
        bg_color: bg.into(),
        text_color: fg.into(),
        font_size: fs,
        align: align.into(),
        position: position.into(),
        bg_filter: bg_filter.into(),
        elements,
        overrides: Vec::<StyleOverride>::new(),
        first_template_id: first.map(|s| s.into()),
    };

    // ===== Lyric =====
    out.push(tpl(
        "tpl-lyric-minimal-white", "Trắng tối giản", "lyric", "#ffffff", "#111111", 7, "center", "center", "",
        vec![], Some("tpl-lyric-minimal-black"),
    ));
    out.push(tpl(
        "tpl-lyric-minimal-black", "Đen tối giản", "lyric", "#0a0a0a", "#ffffff", 7, "center", "center", "",
        vec![], None,
    ));
    out.push(tpl(
        "tpl-lyric-modern", "Hiện đại xanh navy", "lyric", "#0f1b2d", "#f5f7fa", 7, "center", "center", "",
        vec![line_el("h", "#3b82f6", 0.0, 8.0, 100.0, 0.4)], None,
    ));
    out.push(tpl(
        "tpl-lyric-sunset", "Hoàng hôn tím", "lyric", "#2d1b4e", "#f6ecff", 7, "center", "center", "",
        vec![box_el(0.0, 88.0, 100.0, 12.0, "#7c3aed99", 0.0, "")], None,
    ));
    out.push(tpl(
        "tpl-lyric-warm", "Đỏ ấm áp", "lyric", "#3a0f1d", "#ffe9ef", 7, "center", "center", "",
        vec![], None,
    ));
    out.push(tpl(
        "tpl-lyric-tropical", "Xanh nhiệt đới", "lyric", "#0e3b3a", "#eafff9", 7, "center", "center", "",
        vec![], None,
    ));
    out.push(tpl(
        "tpl-lyric-left-accent", "Viền vàng trái", "lyric", "#10131a", "#ffffff", 6.5 as u32, "left", "center", "",
        vec![
            box_el(0.0, 35.0, 1.2, 30.0, "#f0b429", 0.0, ""),
            text("", 2.0, 0.0, 96.0, 100.0, "#ffffff", 6.5, "left"),
        ],
        None,
    ));
    out.push(tpl(
        "tpl-lyric-elegant", "Thanh lịch viền kép", "lyric", "#141414", "#e8e6df", 6.5 as u32, "center", "center", "",
        vec![
            line_el("h", "#e8e6df", 12.0, 18.0, 76.0, 0.3),
            line_el("h", "#e8e6df", 12.0, 80.0, 76.0, 0.3),
        ],
        None,
    ));

    // ===== Christmas =====
    out.push(tpl(
        "tpl-xmas-red", "Giáng sinh đỏ", "christmas", "#6b0f1a", "#fff5f0", 7, "center", "center", "",
        vec![box_el(0.0, 4.0, 100.0, 2.0, "#e7b10a", 0.0, "")], Some("tpl-xmas-green"),
    ));
    out.push(tpl(
        "tpl-xmas-green", "Giáng sinh xanh", "christmas", "#14532d", "#f2fff5", 7, "center", "center", "",
        vec![box_el(0.0, 94.0, 100.0, 2.0, "#e7b10a", 0.0, "")], Some("tpl-xmas-night"),
    ));
    out.push(tpl(
        "tpl-xmas-night", "Giáng sinh đêm tuyết", "christmas", "#1b1b3a", "#eef1ff", 7, "center", "center", "",
        vec![], None,
    ));

    // ===== Easter =====
    out.push(tpl(
        "tpl-easter-light", "Phục sinh tươi sáng", "easter", "#fdf6ec", "#6b4a1f", 7, "center", "center", "",
        vec![line_el("h", "#e0b84d", 25.0, 16.0, 50.0, 0.4)], Some("tpl-easter-gold"),
    ));
    out.push(tpl(
        "tpl-easter-gold", "Phục sinh vàng óng", "easter", "#f5e6c8", "#3a2a0a", 7, "center", "center", "",
        vec![], None,
    ));

    // ===== Notice =====
    out.push(tpl(
        "tpl-notice-center", "Thông báo trung tâm", "notice", "#10131a", "#ffffff", 6, "center", "center", "",
        vec![box_el(18.0, 34.0, 64.0, 32.0, "#1f293780", 10.0, "#3b82f6")], None,
    ));
    out.push(tpl(
        "tpl-notice-banner", "Banner dưới", "notice", "#0a0a0a", "#ffffff", 5.5 as u32, "center", "bottom", "",
        vec![box_el(0.0, 80.0, 100.0, 16.0, "#7c3aedcc", 0.0, "")], None,
    ));

    // ===== Other =====
    out.push(tpl(
        "tpl-other-white", "Màn hình trắng", "other", "#ffffff", "#111111", 6, "center", "center", "",
        vec![], None,
    ));
    out.push(tpl(
        "tpl-other-black", "Màn hình đen", "other", "#000000", "#ffffff", 6, "center", "center", "",
        vec![], None,
    ));
    out.push(tpl(
        "tpl-other-blue", "Gradient xanh", "other", "#1e3a8a", "#ffffff", 6, "center", "center", "brightness(1.05)",
        vec![], None,
    ));

    out
}
