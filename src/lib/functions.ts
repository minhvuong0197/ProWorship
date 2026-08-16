import { uid } from "./types";

export type MacroActionType =
  | "advance"
  | "clear_output"
  | "obs_scene"
  | "toggle_overlay"
  | "start_timeline"
  | "stop_timeline";

export interface MacroAction {
  type: MacroActionType;
  value?: string;
}

export interface MacroFunction {
  id: string;
  name: string;
  actions: MacroAction[];
}

const KEY = "pwcFunctions";

export function loadFunctions(): MacroFunction[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveFunctions(list: MacroFunction[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function newFunction(name: string): MacroFunction {
  return { id: uid(), name, actions: [] };
}

export const ACTION_LABELS: { type: MacroActionType; label: string }[] = [
  { type: "advance", label: "Advance slide (+1)" },
  { type: "clear_output", label: "Clear output" },
  { type: "obs_scene", label: "Switch OBS scene" },
  { type: "toggle_overlay", label: "Toggle overlay" },
  { type: "start_timeline", label: "Start service timeline" },
  { type: "stop_timeline", label: "Stop service timeline" },
];