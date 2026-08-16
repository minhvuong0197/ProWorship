export interface FontOption {
  name: string;
  css: string;
  google?: string;
}

const GOOGLE_FONTS = [
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap",
  "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;700;800&display=swap",
];

let fontsLoaded = false;

export function ensureFontsLoaded() {
  if (fontsLoaded || typeof document === "undefined") return;
  fontsLoaded = true;
  GOOGLE_FONTS.forEach((href) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  });
}

export const FONT_OPTIONS: FontOption[] = [
  { name: "Be Vietnam Pro (tối ưu TV)", css: "'Be Vietnam Pro', Segoe UI, sans-serif" },
  { name: "Montserrat", css: "'Montserrat', Segoe UI, sans-serif" },
  { name: "Oswald", css: "'Oswald', Segoe UI, sans-serif" },
  { name: "Roboto", css: "'Roboto', Segoe UI, sans-serif" },
  { name: "Open Sans", css: "'Open Sans', Segoe UI, sans-serif" },
  { name: "Lato", css: "'Lato', Segoe UI, sans-serif" },
  { name: "Playfair Display", css: "'Playfair Display', Georgia, serif" },
  { name: "Merriweather", css: "'Merriweather', Georgia, serif" },
  { name: "Segoe UI", css: "Segoe UI, sans-serif" },
  { name: "Arial", css: "Arial, sans-serif" },
  { name: "Verdana", css: "Verdana, sans-serif" },
  { name: "Georgia", css: "Georgia, serif" },
  { name: "Times New Roman", css: "'Times New Roman', serif" },
  { name: "Courier New", css: "'Courier New', monospace" },
];

const VI_REGEX = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;

// fonts that may lack full Vietnamese diacritic glyphs
const WEAK_VI_FONTS = ["Courier New", "Verdana", "Arial"];

export function vietnameseIssue(
  css: string,
  text: string,
): { diacritics: boolean; weakFont: boolean } {
  return {
    diacritics: VI_REGEX.test(text),
    weakFont: text ? WEAK_VI_FONTS.some((f) => css.includes(f)) : false,
  };
}