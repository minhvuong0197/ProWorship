import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  AudioItem,
  AudioPlaylist,
  BibleBookMeta,
  BibleChapter,
  BibleSearchHit,
  BibleVersion,
  CcliLog,
  CompanionInfo,
  EditShow,
  InterlinearWord,
  LiveState,
  MediaItem,
  MonitorInfo,
  Overlay,
  OutputWindowInfo,
  Playlist,
  Prop,
  Song,
  StrongEntry,
  Template,
} from "./types";

export const api = {
  getSongs: (): Promise<Song[]> => invoke("get_songs"),
  saveSong: (song: Song): Promise<Song> => invoke("save_song", { song }),
  deleteSong: (id: string): Promise<void> => invoke("delete_song", { id }),

  getEditShows: (): Promise<EditShow[]> => invoke("get_edit_shows"),
  saveEditShow: (show: EditShow): Promise<EditShow> =>
    invoke("save_edit_show", { show }),
  deleteEditShow: (id: string): Promise<void> =>
    invoke("delete_edit_show", { id }),

  getMediaLibrary: (): Promise<MediaItem[]> => invoke("get_media_library"),
  importMedia: (paths: string[]): Promise<MediaItem[]> =>
    invoke("import_media", { paths }),
  deleteMedia: (id: string): Promise<void> => invoke("delete_media", { id }),
  getMediaDir: (): Promise<string> => invoke("get_media_dir"),

  getAudioLibrary: (): Promise<AudioItem[]> => invoke("get_audio_library"),
  importAudio: (paths: string[]): Promise<AudioItem[]> =>
    invoke("import_audio", { paths }),
  deleteAudio: (id: string): Promise<void> => invoke("delete_audio", { id }),
  getAudioPlaylists: (): Promise<AudioPlaylist[]> =>
    invoke("get_audio_playlists"),
  saveAudioPlaylist: (playlist: AudioPlaylist): Promise<AudioPlaylist> =>
    invoke("save_audio_playlist", { playlist }),
  deleteAudioPlaylist: (id: string): Promise<void> =>
    invoke("delete_audio_playlist", { id }),

  getPlaylists: (): Promise<Playlist[]> => invoke("get_playlists"),
  savePlaylist: (playlist: Playlist): Promise<Playlist> =>
    invoke("save_playlist", { playlist }),
  deletePlaylist: (id: string): Promise<void> =>
    invoke("delete_playlist", { id }),

  getTemplates: (): Promise<Template[]> => invoke("get_templates"),
  saveTemplate: (template: Template): Promise<Template> =>
    invoke("save_template", { template }),
  deleteTemplate: (id: string): Promise<void> =>
    invoke("delete_template", { id }),
  restoreDefaultTemplates: (): Promise<Template[]> =>
    invoke("restore_default_templates"),

  getProps: (): Promise<Prop[]> => invoke("get_props"),
  saveProp: (prop: Prop): Promise<Prop> => invoke("save_prop", { prop }),
  deleteProp: (id: string): Promise<void> => invoke("delete_prop", { id }),

  getOverlays: (): Promise<Overlay[]> => invoke("get_overlays"),
  saveOverlay: (overlay: Overlay): Promise<Overlay> =>
    invoke("save_overlay", { overlay }),
  deleteOverlay: (id: string): Promise<void> => invoke("delete_overlay", { id }),

  getCcliLog: (): Promise<CcliLog[]> => invoke("get_ccli_log"),

  getSettings: (): Promise<AppSettings> => invoke("get_settings"),
  setSettings: (settings: AppSettings): Promise<AppSettings> =>
    invoke("set_settings", { settings }),

  getCompanionInfo: (): Promise<CompanionInfo> =>
    invoke("get_companion_info"),

  listMonitors: (): Promise<MonitorInfo[]> => invoke("list_monitors"),
  openOutputWindow: (monitorName: string | null): Promise<void> =>
    invoke("open_output_window", { monitorName }),
  openExtraOutputWindow: (monitorName: string | null): Promise<string> =>
    invoke("open_extra_output_window", { monitorName }),
  closeOutputWindow: (): Promise<void> => invoke("close_output_window"),
  closeOutputWindowByLabel: (label: string): Promise<void> =>
    invoke("close_output_window_by_label", { label }),
  listOutputWindows: (): Promise<OutputWindowInfo[]> =>
    invoke("list_output_windows"),
  isOutputOpen: (): Promise<boolean> => invoke("is_output_open"),
  isStageOpen: (): Promise<boolean> => invoke("is_stage_open"),
  openStageWindow: (): Promise<void> => invoke("open_stage_window"),
  closeStageWindow: (): Promise<void> => invoke("close_stage_window"),
  getLiveState: (): Promise<LiveState> => invoke("get_live_state"),
  setLiveState: (live: LiveState): Promise<LiveState> =>
    invoke("set_live_state", { live }),
  setStageMessage: (message: string): Promise<LiveState> =>
    invoke("set_stage_message", { message }),
  setOutputLocked: (locked: boolean): Promise<LiveState> =>
    invoke("set_output_locked", { locked }),
  refreshOutput: (): Promise<void> => invoke("refresh_output"),
  clearLive: (): Promise<LiveState> => invoke("clear_live"),
  advanceLive: (dir: number): Promise<LiveState> =>
    invoke("advance_live", { dir }),
  setMediaPlaying: (playing: boolean): Promise<LiveState> =>
    invoke("set_media_playing", { playing }),
  setAudioState: (
    playing?: boolean,
    volume?: number,
  ): Promise<LiveState> => invoke("set_audio_state", { playing, volume }),
  stopAudio: (): Promise<LiveState> => invoke("stop_audio"),
  startCountdown: (seconds: number): Promise<LiveState> =>
    invoke("start_countdown", { seconds }),
  stopCountdown: (): Promise<LiveState> => invoke("stop_countdown"),
  gotoSlide: (index: number): Promise<LiveState> =>
    invoke("goto_slide", { index }),
  loadPlaylist: (playlistId: string): Promise<LiveState> =>
    invoke("load_playlist", { playlistId }),
  gotoPlaylistEntry: (playlistId: string, index: number): Promise<LiveState> =>
    invoke("goto_playlist_entry", { playlistId, index }),
  startServiceTimeline: (): Promise<LiveState> =>
    invoke("start_service_timeline"),
  stopServiceTimeline: (): Promise<LiveState> =>
    invoke("stop_service_timeline"),

  getBibleBooks: (): Promise<BibleBookMeta[]> => invoke("get_bible_books"),
  getBibleChapter: (
    abbrev: string,
    chapter: number,
  ): Promise<BibleChapter> => invoke("get_bible_chapter", { abbrev, chapter }),
  bibleSearch: (query: string, limit?: number): Promise<BibleSearchHit[]> =>
    invoke("bible_search", { query, limit }),

  listBibleVersions: (): Promise<BibleVersion[]> =>
    invoke("list_bible_versions"),
  getBibleBooksVersion: (version: string): Promise<BibleBookMeta[]> =>
    invoke("get_bible_books_version", { version }),
  getBibleChapterVersion: (
    version: string,
    abbrev: string,
    chapter: number,
  ): Promise<BibleChapter> =>
    invoke("get_bible_chapter_version", { version, abbrev, chapter }),
  importBibleXmlText: (
    text: string,
    versionName?: string,
  ): Promise<BibleVersion> =>
    invoke("import_bible_xml_text", { text, versionName }),
  deleteBibleVersion: (id: string): Promise<void> =>
    invoke("delete_bible_version", { id }),
  renameBibleVersion: (id: string, newName: string): Promise<BibleVersion> =>
    invoke("rename_bible_version", { id, newName }),
  setBibleVersionTemplate: (
    id: string,
    templateId: string | null,
  ): Promise<BibleVersion> =>
    invoke("set_bible_version_template", { id, templateId }),
  editBibleBook: (id: string, abbrev: string, newName: string): Promise<void> =>
    invoke("edit_bible_book", { id, abbrev, newName }),
  editBibleVerse: (
    id: string,
    abbrev: string,
    chapter: number,
    verse: number,
    newText: string,
  ): Promise<void> =>
    invoke("edit_bible_verse", { id, abbrev, chapter, verse, newText }),
  getInterlinearVerse: (
    abbrev: string,
    chapter: number,
    verse: number,
  ): Promise<InterlinearWord[]> => invoke("get_interlinear_verse", { abbrev, chapter, verse }),
  getStrongEntry: (id: string): Promise<StrongEntry> => invoke("get_strong_entry", { id }),
  searchStrong: (query: string, limit?: number): Promise<StrongEntry[]> =>
    invoke("search_strong", { query, limit }),
  openUrl: (url: string): Promise<void> => invoke("open_url", { url }),
  onlineBibleBooks: async (): Promise<BibleBookMeta[]> => {
    const books: Array<[string, string, number]> = [
      ["Gen", "Genesis", 50], ["Exod", "Exodus", 40], ["Lev", "Leviticus", 27],
      ["Num", "Numbers", 36], ["Deut", "Deuteronomy", 34], ["Josh", "Joshua", 24],
      ["Judg", "Judges", 21], ["Rut", "Ruth", 4], ["1Sam", "1 Samuel", 31],
      ["2Sam", "2 Samuel", 24], ["1Kgs", "1 Kings", 22], ["2Kgs", "2 Kings", 25],
      ["1Chr", "1 Chronicles", 29], ["2Chr", "2 Chronicles", 36], ["Ezra", "Ezra", 10],
      ["Neh", "Nehemiah", 13], ["Est", "Esther", 10], ["Job", "Job", 42],
      ["Ps", "Psalms", 150], ["Prov", "Proverbs", 31], ["Eccl", "Ecclesiastes", 12],
      ["Song", "Song of Solomon", 8], ["Isa", "Isaiah", 66], ["Jer", "Jeremiah", 52],
      ["Lam", "Lamentations", 5], ["Ezek", "Ezekiel", 48], ["Dan", "Daniel", 12],
      ["Hos", "Hosea", 14], ["Joel", "Joel", 3], ["Amos", "Amos", 9],
      ["Obad", "Obadiah", 1], ["Jon", "Jonah", 4], ["Mic", "Micah", 7],
      ["Nah", "Nahum", 3], ["Hab", "Habakkuk", 3], ["Zeph", "Zephaniah", 3],
      ["Hag", "Haggai", 2], ["Zech", "Zechariah", 14], ["Mal", "Malachi", 4],
      ["Matt", "Matthew", 28], ["Mark", "Mark", 16], ["Luke", "Luke", 24],
      ["John", "John", 21], ["Acts", "Acts", 28], ["Rom", "Romans", 16],
      ["1Cor", "1 Corinthians", 16], ["2Cor", "2 Corinthians", 13], ["Gal", "Galatians", 6],
      ["Eph", "Ephesians", 6], ["Phil", "Philippians", 4], ["Col", "Colossians", 4],
      ["1Thess", "1 Thessalonians", 5], ["2Thess", "2 Thessalonians", 3],
      ["1Tim", "1 Timothy", 6], ["2Tim", "2 Timothy", 4], ["Titus", "Titus", 3],
      ["Phlm", "Philemon", 1], ["Heb", "Hebrews", 13], ["Jas", "James", 5],
      ["1Pet", "1 Peter", 5], ["2Pet", "2 Peter", 3], ["1John", "1 John", 5],
      ["2John", "2 John", 1], ["3John", "3 John", 1], ["Jude", "Jude", 1],
      ["Rev", "Revelation", 22],
    ];
    return books.map(([abbrev, name, chapters]) => ({
      abbrev,
      name,
      short: abbrev,
      chapters,
      onlineRef: name.toLowerCase(),
    }));
  },
  onlineBibleChapter: async (
    onlineRef: string,
    chapter: number,
    name: string,
  ): Promise<BibleChapter> => {
    const res = await fetch(
      `https://bible-api.com/${encodeURIComponent(onlineRef)} ${chapter}`,
    );
    if (!res.ok) throw new Error("Không tải được chương trực tuyến");
    const data = await res.json();
    const verses: string[] = [];
    for (const v of data.verses as Array<{ verse: number; text: string }>) {
      verses[v.verse - 1] = v.text.trim();
    }
    return { abbrev: onlineRef, name, chapter, verses };
  },

  mediaUrl: (path: string): string => convertFileSrc(path),
};
