const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_REG = /^([A-G][#b]?)(.*)$/;

// Transpose a single chord symbol (e.g. "A#m7") by `semitones`.
export function transposeChord(chord: string, semitones: number): string {
  const m = NOTE_REG.exec(chord.trim());
  if (!m) return chord;
  const [, note, rest] = m;
  let norm = note.replace("b", "#");
  let idx = NOTE_NAMES.indexOf(norm);
  if (idx === -1) {
    // handle double-sharp / unusual: fall back as-is
    return chord;
  }
  idx = (idx + semitones % 12 + 12) % 12;
  return NOTE_NAMES[idx] + rest;
}

// Transpose every chord found in a text block, preserving surrounding content.
export function transposeChords(text: string, semitones: number): string {
  if (!semitones || !text) return text;
  return text.replace(
    /(^|[^A-Ga-g])([A-G][#b]?(?:m|maj|dim|aug|sus|add|2|4|5|6|7|9|11|13)*(?:\/[A-G][#b]?)?)/g,
    (_all, lead: string, chord: string) => lead + transposeChord(chord, semitones),
  );
}