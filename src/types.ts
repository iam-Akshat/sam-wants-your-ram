// Shared contracts between game / ui / models. Keep dependency-free.
export type PowerKind = 'ddr' | 'magnet' | 'shield' | 'cool' | 'oc';
export type QualityName = 'low' | 'medium' | 'high';
export const POWER_KINDS: PowerKind[] = ['ddr', 'magnet', 'shield', 'cool', 'oc'];
export const POWER_NAMES: Record<PowerKind, string> = {
  ddr: 'DDR x2', magnet: 'DMA Magnet', shield: 'ECC Shield', cool: 'Liquid Cooling Slide', oc: 'Overclock',
};
export const POWER_COLORS: Record<PowerKind, string> = {
  ddr: '#ffd23f', magnet: '#ff4fa3', shield: '#48f0a8', cool: '#46c8ff', oc: '#ff7a2f',
};

export interface Settings {
  master: number; music: number; sfx: number; muted: boolean;
  quality: QualityName | 'auto'; shake: boolean;
}
export interface MissionState { id: string; progress: number; target: number; text: string; reward: number; }
export interface SaveData {
  v: 1;
  ram: number;                 // spendable bank
  totalRam: number;
  bestEndless: number;         // score
  bestEndlessDist: number;
  bestEscape: number;          // best score in a completed escape
  stageReached: number;        // 1..5, highest stage unlocked in Escape (checkpoint)
  escapeDone: boolean;         // endless unlocked
  upgrades: { ddr: number; magnet: number; cool: number; oc: number; shield: number; head: number }; // levels
  skins: { owned: string[]; selected: string };
  missions: MissionState[];
  missionsDone: number;        // lifetime completed => score multiplier level
  settings: Settings;
  tutorialSeen: boolean;
  /** set after a graphics freeze / WebGL context loss on this machine: the auto quality ramp never goes up again */
  gpuTrouble?: boolean;
}
export interface PowerHud { kind: PowerKind; left: number; total: number }
export interface HudState {
  score: number; ram: number; multiplier: number; ddr: boolean;
  stack: number; stackMax: number;
  dist: number; goal: number;      // goal=0 in endless
  stage: number; zoneName: string;
  powers: PowerHud[];
  shield: boolean;
  speed: number;                   // m/s
  threat: number;                  // 0..1 Allocman closeness
  mode: 'escape' | 'endless';
  fps: number;
}
export interface Challenge { from: string; beat: number }
export interface LbEntry { rank: number; nick: string; gb: number }
export interface GlobalStats { totalGb: number; totalTb: number; runs: number }
export interface RunResult {
  mode: 'escape' | 'endless'; stage: number; score: number; ram: number; dist: number;
  newBest: boolean; completedMissions: string[]; reason: 'caught' | 'quit';
  gb: number;                 // GB of RAM saved this run (== ram)
  durationSec: number;        // seconds actually played
  challenge: Challenge | null; // from ?beat=&from= link, already sanitized
}
export interface ShopItem {
  id: string; kind: 'upgrade' | 'skin'; name: string; desc: string; icon: string;
  level: number; maxLevel: number; cost: number | null; owned?: boolean; selected?: boolean;
}
