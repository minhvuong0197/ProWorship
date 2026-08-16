import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { audioEngine } from "../lib/audioController";

export default function AudioPlayer() {
  const audio = useAppStore((s) => s.live?.audio);

  useEffect(() => {
    const st = audioEngine.getState();
    if (!audio) {
      if (st.source === "live") audioEngine.stop();
      return;
    }
    if (st.source === "playlist") return;
    const track = {
      id: audio.id,
      title: audio.title,
      file_path: audio.file_path,
    };
    const current = st.tracks[st.index];
    if (
      st.source === "live" &&
      current &&
      current.id === audio.id &&
      current.file_path === audio.file_path
    ) {
      if (audio.playing && !st.playing) audioEngine.play();
      else if (!audio.playing && st.playing) audioEngine.pause();
      audioEngine.setVolume(audio.volume);
      return;
    }
    audioEngine.loadAndPlay([track], {
      source: "live",
      play: audio.playing,
      volume: audio.volume,
    });
  }, [audio?.id, audio?.playing, audio?.file_path, audio?.volume, audio]);

  return null;
}
