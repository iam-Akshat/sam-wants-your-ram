import type { MissionState } from './types';

export interface RunStats {
  ram: number; gold: number; cableJumps: number; limiterSlides: number; lanes: number; closeCalls: number; letters: number;
  smashed: number; platformM: number; dist: number; score: number; noHitDist: number; drones: number; coolRam: number; shieldBlocks: number;
  ddr: number; magnet: number; shield: number; cool: number; oc: number; powerups: number; jumps: number; slides: number; carts: number;
}
export const newStats = (): RunStats => ({ ram: 0, gold: 0, cableJumps: 0, limiterSlides: 0, lanes: 0, closeCalls: 0, letters: 0, smashed: 0, platformM: 0, dist: 0, score: 0, noHitDist: 0, drones: 0, coolRam: 0, shieldBlocks: 0, ddr: 0, magnet: 0, shield: 0, cool: 0, oc: 0, powerups: 0, jumps: 0, slides: 0, carts: 0 });

export interface MissionDef { id: string; text: (t: number) => string; stat: keyof RunStats; base: number; step: number; reward: number }
export const MISSION_POOL: MissionDef[] = [
  { id: 'ram', text: (t) => `Collect ${t} RAM in one run`, stat: 'ram', base: 500, step: 100, reward: 150 },
  { id: 'limiter', text: (t) => `Slide under ${t} rate limiters`, stat: 'limiterSlides', base: 10, step: 2, reward: 150 },
  { id: 'cable', text: (t) => `Jump over ${t} cable bundles`, stat: 'cableJumps', base: 12, step: 3, reward: 150 },
  { id: 'close', text: (t) => `Get ${t} CLOSE CALLs in one run`, stat: 'closeCalls', base: 8, step: 2, reward: 200 },
  { id: 'letter', text: (t) => `Dissolve ${t} Letters of Intent`, stat: 'letters', base: 6, step: 2, reward: 150 },
  { id: 'gold', text: (t) => `Grab ${t} golden 64 GB kits`, stat: 'gold', base: 3, step: 1, reward: 200 },
  { id: 'smash', text: (t) => `Smash ${t} obstacles with Overclock`, stat: 'smashed', base: 6, step: 2, reward: 200 },
  { id: 'rack', text: (t) => `Run ${t * 20} m along rack tops`, stat: 'platformM', base: 5, step: 2, reward: 200 },
  { id: 'dist', text: (t) => `Run ${t} m in a single run`, stat: 'dist', base: 1500, step: 300, reward: 150 },
  { id: 'lane', text: (t) => `Switch lanes ${t} times in one run`, stat: 'lanes', base: 60, step: 10, reward: 100 },
  { id: 'nohit', text: (t) => `Run ${t} m without getting hit`, stat: 'noHitDist', base: 800, step: 200, reward: 250 },
  { id: 'pow', text: (t) => `Collect ${t} power-ups in one run`, stat: 'powerups', base: 5, step: 1, reward: 150 },
  { id: 'cool', text: (t) => `Collect ${t} RAM while riding the Cooling Slide`, stat: 'coolRam', base: 25, step: 5, reward: 200 },
  { id: 'shield', text: (t) => `Block ${t} hits with an ECC Shield`, stat: 'shieldBlocks', base: 2, step: 1, reward: 150 },
  { id: 'score', text: (t) => `Score ${t} points in one run`, stat: 'score', base: 8000, step: 2000, reward: 250 },
];
export function newMissionState(p: MissionDef, done: number): MissionState {
  const lvl = Math.min(6, Math.floor(done / 3));
  const target = p.base + p.step * lvl;
  return { id: p.id, progress: 0, target, text: p.text(target), reward: p.reward + lvl * 50 };
}
