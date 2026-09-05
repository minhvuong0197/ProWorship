import type { JSX } from "react";
import {
  faAnglesRight,
  faBackwardStep,
  faBan,
  faBell,
  faBolt,
  faBook,
  faBookBible,
  faCalendar,
  faCamera,
  faChalkboard,
  faChevronDown,
  faChevronLeft,
  faChevronUp,
  faCircle,
  faCircleDot,
  faClock,
  faDesktop,
  faDisplay,
  faEllipsis,
  faEye,
  faEyeSlash,
  faFilm,
  faForwardStep,
  faGear,
  faGem,
  faHeart,
  faImage,
  faFile,
  faKeyboard,
  faLayerGroup,
  faList,
  faMagnifyingGlass,
  faMagnet,
  faMicrophone,
  faMusic,
  faPaperPlane,
  faPause,
  faPen,
  faPlay,
  faPlus,
  faRepeat,
  faRotate,
  faRotateLeft,
  faRotateRight,
  faSearch,
  faShuffle,
  faSnowflake,
  faSquare,
  faStar,
  faStop,
  faStopwatch,
  faTableCells,
  faTableCellsLarge,
  faTextHeight,
  faTowerBroadcast,
  faTrash,
  faVideo,
  faVolumeHigh,
  faVolumeXmark,
  faWaveSquare,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

export type IconName =
  | "music"
  | "film"
  | "audio"
  | "book"
  | "bible"
  | "list"
  | "layout"
  | "layers"
  | "grid"
  | "monitor"
  | "camera"
  | "mic"
  | "clock"
  | "play"
  | "pause"
  | "stop"
  | "skipBack"
  | "skipForward"
  | "repeat"
  | "repeatOne"
  | "shuffle"
  | "send"
  | "trash"
  | "broadcast"
  | "record"
  | "calendar"
  | "file"
  | "gear"
  | "keyboard"
  | "zap"
  | "plus"
  | "x"
  | "chevronUp"
  | "chevronDown"
  | "chevronLeft"
  | "search"
  | "eye"
  | "eyeOff"
  | "volume"
  | "volumeX"
  | "image"
  | "heart"
  | "square"
  | "slash"
  | "chevronsRight"
  | "timer"
  | "snow"
  | "star"
  | "diamond"
  | "screen"
  | "video"
  | "wave"
  | "presentation"
  | "undo"
  | "redo"
  | "rotate"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignTop"
  | "alignMiddle"
  | "alignBottom"
  | "distributeH"
  | "distributeV"
  | "magnet"
  | "type"
  | "edit"
  | "bell"
  | "more"
  | "status";

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  color?: string;
}

type FaIcon = typeof faMusic;

const SOLID: Record<IconName, FaIcon | null> = {
  music: faMusic,
  film: faFilm,
  audio: faVolumeHigh,
  book: faBook,
  bible: faBookBible,
  list: faList,
  layout: faTableCellsLarge,
  layers: faLayerGroup,
  grid: faTableCells,
  monitor: faDisplay,
  camera: faCamera,
  mic: faMicrophone,
  clock: faClock,
  play: faPlay,
  pause: faPause,
  stop: faStop,
  skipBack: faBackwardStep,
  skipForward: faForwardStep,
  repeat: faRepeat,
  repeatOne: faRepeat,
  shuffle: faShuffle,
  send: faPaperPlane,
  trash: faTrash,
  broadcast: faTowerBroadcast,
  record: faCircle,
  calendar: faCalendar,
  file: faFile,
  gear: faGear,
  keyboard: faKeyboard,
  zap: faBolt,
  plus: faPlus,
  x: faXmark,
  chevronUp: faChevronUp,
  chevronDown: faChevronDown,
  chevronLeft: faChevronLeft,
  search: faMagnifyingGlass,
  eye: faEye,
  eyeOff: faEyeSlash,
  volume: faVolumeHigh,
  volumeX: faVolumeXmark,
  image: faImage,
  heart: faHeart,
  square: faSquare,
  slash: faBan,
  chevronsRight: faAnglesRight,
  timer: faStopwatch,
  snow: faSnowflake,
  star: faStar,
  diamond: faGem,
  screen: faDesktop,
  video: faVideo,
  wave: faWaveSquare,
  presentation: faChalkboard,
  undo: faRotateLeft,
  redo: faRotateRight,
  rotate: faRotate,
  alignLeft: null,
  alignCenter: null,
  alignRight: null,
  alignTop: null,
  alignMiddle: null,
  alignBottom: null,
  distributeH: null,
  distributeV: null,
  magnet: faMagnet,
  type: faTextHeight,
  edit: faPen,
  bell: faBell,
  more: faEllipsis,
  status: faCircleDot,
};

const CUSTOM: Record<IconName, JSX.Element | null> = {
  music: null,
  film: null,
  audio: null,
  book: null,
  bible: null,
  list: null,
  layout: null,
  layers: null,
  grid: null,
  monitor: null,
  camera: null,
  mic: null,
  clock: null,
  play: null,
  pause: null,
  stop: null,
  skipBack: null,
  skipForward: null,
  repeat: null,
  repeatOne: null,
  shuffle: null,
  send: null,
  trash: null,
  broadcast: null,
  record: null,
  calendar: null,
  file: null,
  gear: null,
  keyboard: null,
  zap: null,
  plus: null,
  x: null,
  chevronUp: null,
  chevronDown: null,
  chevronLeft: null,
  search: null,
  eye: null,
  eyeOff: null,
  volume: null,
  volumeX: null,
  image: null,
  heart: null,
  square: null,
  slash: null,
  chevronsRight: null,
  timer: null,
  snow: null,
  star: null,
  diamond: null,
  screen: null,
  video: null,
  wave: null,
  presentation: null,
  undo: null,
  redo: null,
  rotate: null,
  alignLeft: (
    <>
      <path d="M48 48h128a32 32 0 0 1 32 32v96a32 32 0 0 1-32 32H48a32 32 0 0 1-32-32V80a32 32 0 0 1 32-32z" />
      <path d="M208 64h224a32 32 0 1 1 0 64H208a32 32 0 1 1 0-64z" />
      <path d="M208 160h176a32 32 0 1 1 0 64H208a32 32 0 1 1 0-64z" />
      <path d="M208 256h224a32 32 0 1 1 0 64H208a32 32 0 1 1 0-64z" />
      <path d="M208 352h176a32 32 0 1 1 0 64H208a32 32 0 1 1 0-64z" />
    </>
  ),
  alignCenter: (
    <>
      <path d="M48 48h128a32 32 0 0 1 32 32v96a32 32 0 0 1-32 32H48a32 32 0 0 1-32-32V80a32 32 0 0 1 32-32z" />
      <path d="M48 176h128a32 32 0 0 1 32 32v96a32 32 0 0 1-32 32H48a32 32 0 0 1-32-32v-96a32 32 0 0 1 32-32z" />
      <path d="M48 304h128a32 32 0 0 1 32 32v96a32 32 0 0 1-32 32H48a32 32 0 0 1-32-32v-96a32 32 0 0 1 32-32z" />
      <path d="M208 96h224a32 32 0 1 1 0 64H208a32 32 0 1 1 0-64z" />
      <path d="M208 240h224a32 32 0 1 1 0 64H208a32 32 0 1 1 0-64z" />
      <path d="M208 384h224a32 32 0 1 1 0 64H208a32 32 0 1 1 0-64z" />
    </>
  ),
  alignRight: (
    <>
      <path d="M336 48h128a32 32 0 0 1 32 32v96a32 32 0 0 1-32 32H336a32 32 0 0 1-32-32V80a32 32 0 0 1 32-32z" />
      <path d="M80 64h224a32 32 0 1 1 0 64H80a32 32 0 1 1 0-64z" />
      <path d="M128 160h176a32 32 0 1 1 0 64H128a32 32 0 1 1 0-64z" />
      <path d="M80 256h224a32 32 0 1 1 0 64H80a32 32 0 1 1 0-64z" />
      <path d="M128 352h176a32 32 0 1 1 0 64H128a32 32 0 1 1 0-64z" />
    </>
  ),
  alignTop: (
    <>
      <path d="M80 48h96a32 32 0 0 1 32 32v400a32 32 0 0 1-32 32H80a32 32 0 0 1-32-32V80a32 32 0 0 1 32-32z" />
      <path d="M208 48h96a32 32 0 0 1 32 32v272a32 32 0 0 1-32 32h-96a32 32 0 0 1-32-32V80a32 32 0 0 1 32-32z" />
      <path d="M336 48h96a32 32 0 0 1 32 32v400a32 32 0 0 1-32 32h-96a32 32 0 0 1-32-32V80a32 32 0 0 1 32-32z" />
    </>
  ),
  alignMiddle: (
    <>
      <path d="M80 128h96a32 32 0 0 1 32 32v192a32 32 0 0 1-32 32H80a32 32 0 0 1-32-32V160a32 32 0 0 1 32-32z" />
      <path d="M208 64h96a32 32 0 0 1 32 32v320a32 32 0 0 1-32 32h-96a32 32 0 0 1-32-32V96a32 32 0 0 1 32-32z" />
      <path d="M336 160h96a32 32 0 0 1 32 32v192a32 32 0 0 1-32 32h-96a32 32 0 0 1-32-32v-192a32 32 0 0 1 32-32z" />
    </>
  ),
  alignBottom: (
    <>
      <path d="M80 48h96a32 32 0 0 1 32 32v384a32 32 0 0 1-32 32H80a32 32 0 0 1-32-32V80a32 32 0 0 1 32-32z" />
      <path d="M208 128h96a32 32 0 0 1 32 32v304a32 32 0 0 1-32 32h-96a32 32 0 0 1-32-32V160a32 32 0 0 1 32-32z" />
      <path d="M336 48h96a32 32 0 0 1 32 32v384a32 32 0 0 1-32 32h-96a32 32 0 0 1-32-32V80a32 32 0 0 1 32-32z" />
    </>
  ),
  distributeH: (
    <>
      <path d="M48 64h96a32 32 0 0 1 32 32v320a32 32 0 0 1-32 32H48a32 32 0 0 1-32-32V96a32 32 0 0 1 32-32z" />
      <path d="M208 64h96a32 32 0 0 1 32 32v320a32 32 0 0 1-32 32h-96a32 32 0 0 1-32-32V96a32 32 0 0 1 32-32z" />
      <path d="M368 64h96a32 32 0 0 1 32 32v320a32 32 0 0 1-32 32h-96a32 32 0 0 1-32-32V96a32 32 0 0 1 32-32z" />
    </>
  ),
  distributeV: (
    <>
      <path d="M64 48h384a32 32 0 0 1 32 32v96a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32V80a32 32 0 0 1 32-32z" />
      <path d="M64 208h384a32 32 0 0 1 32 32v96a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32v-96a32 32 0 0 1 32-32z" />
      <path d="M64 368h384a32 32 0 0 1 32 32v96a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32v-96a32 32 0 0 1 32-32z" />
    </>
  ),
  magnet: null,
  type: null,
  edit: null,
  bell: null,
  more: null,
  status: null,
};

export default function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 2,
  color,
}: Props) {
  const fa = SOLID[name];
  const d = fa ? fa.icon[4] : null;
  const paths = Array.isArray(d) ? d : d ? [d] : null;
  const w = fa ? fa.icon[0] : 512;
  const h = fa ? fa.icon[1] : 512;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${w} ${h}`}
      fill={color ?? "currentColor"}
      stroke="none"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {paths
        ? paths.map((p, i) => <path key={i} d={p} />)
        : CUSTOM[name]}
    </svg>
  );
}
