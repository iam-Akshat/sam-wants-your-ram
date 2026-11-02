import type { SaveData, ShopItem, PowerKind } from './types';
import { MISSION_POOL, newMissionState } from './missions';

const KEY = 'ramrun.save.v1';
export const SKINS = [
  { id: 'kilo', name: 'Kilo Classic', cost: 0, desc: 'The original teal bot.' },
  { id: 'retro', name: 'Retro Beige PC', cost: 1800, desc: 'Beige plastic. Turbo button not included.' },
  { id: 'rgb', name: 'RGB Gamer', cost: 3600, desc: '+400 FPS. Mostly feelings.' },
  { id: 'rasp', name: 'Raspberry', cost: 2700, desc: 'Tiny, tasty, surprisingly capable.' },
];
export const POWER_BASE: Record<PowerKind, number> = { ddr: 8, magnet: 8, shield: 0, cool: 5, oc: 4 };
export const UPGRADE_DEFS: { id: 'ddr' | 'magnet' | 'cool' | 'oc' | 'shield' | 'head'; name: string; desc: string; icon: string; max: number; cost: number[] }[] = [
  { id: 'shield', name: 'Start with ECC Shield', desc: 'Every run begins with a free ECC Shield.', icon: '🛡️', max: 1, cost: [700] },
  { id: 'head', name: 'Head Start', desc: 'Begin each run with an Overclock burst.', icon: '🚀', max: 3, cost: [600, 1350, 2400] },
  { id: 'ddr', name: 'Longer DDR x2', desc: '+2.5s of double score per level.', icon: '✖️', max: 3, cost: [450, 1050, 1950] },
  { id: 'magnet', name: 'Longer DMA Magnet', desc: '+2.5s of magnetism per level.', icon: '🧲', max: 3, cost: [450, 1050, 1950] },
  { id: 'cool', name: 'Longer Cooling Slide', desc: '+1.5s on the cooling rail per level.', icon: '💧', max: 3, cost: [500, 1200, 2100] },
  { id: 'oc', name: 'Longer Overclock', desc: '+1.2s of smashing per level.', icon: '⚡', max: 3, cost: [500, 1200, 2100] },
];

export function defaultSave(): SaveData {
  const s: SaveData = {
    v: 1, ram: 0, totalRam: 0, bestEndless: 0, bestEndlessDist: 0, bestEscape: 0, stageReached: 1, escapeDone: false,
    upgrades: { ddr: 0, magnet: 0, cool: 0, oc: 0, shield: 0, head: 0 }, skins: { owned: ['kilo'], selected: 'kilo' },
    missions: [], missionsDone: 0,
    settings: { master: 0.8, music: 0.7, sfx: 0.9, muted: false, quality: 'auto', shake: true }, tutorialSeen: false,
  };
  return s;
}

export class SaveStore {
  data: SaveData;
  constructor() {
    this.data = defaultSave();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const p = JSON.parse(raw) as Partial<SaveData>; this.data = { ...this.data, ...p, upgrades: { ...this.data.upgrades, ...(p.upgrades ?? {}) }, settings: { ...this.data.settings, ...(p.settings ?? {}) }, skins: { ...this.data.skins, ...(p.skins ?? {}) } }; }
    } catch { /* ignore */ }
    if (!Array.isArray(this.data.skins.owned)) this.data.skins.owned = ['kilo'];
    if (typeof this.data.ram !== 'number' || !isFinite(this.data.ram)) this.data.ram = 0;
    this.data.missions = (this.data.missions || []).filter((m) => MISSION_POOL.some((p) => p.id === m.id));
    this.fillMissions();
  }
  fillMissions() {
    let guard = 0;
    while (this.data.missions.length < 3 && guard++ < 50) {
      const pool = MISSION_POOL.filter((p) => !this.data.missions.some((m) => m.id === p.id));
      const p = pool[Math.floor(Math.random() * pool.length)]!;
      this.data.missions.push(newMissionState(p, this.data.missionsDone));
    }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } }
  /** score multiplier from missions */
  missionMult(): number { return Math.min(10, 1 + Math.floor(this.data.missionsDone / 3)); }
  duration(k: PowerKind): number {
    const u = this.data.upgrades; const lvl = k === 'shield' ? 0 : u[k];
    const inc = k === 'cool' ? 1.5 : k === 'oc' ? 1.2 : 2.5;
    return POWER_BASE[k] + lvl * inc;
  }
  shopItems(): ShopItem[] {
    const d = this.data; const items: ShopItem[] = [];
    for (const u of UPGRADE_DEFS) {
      const lvl = d.upgrades[u.id];
      items.push({ id: 'up_' + u.id, kind: 'upgrade', name: u.name, desc: u.desc, icon: u.icon, level: lvl, maxLevel: u.max, cost: lvl >= u.max ? null : u.cost[lvl]! });
    }
    for (const s of SKINS) {
      const owned = d.skins.owned.includes(s.id);
      items.push({ id: 'skin_' + s.id, kind: 'skin', name: s.name, desc: s.desc, icon: '🎨', level: owned ? 1 : 0, maxLevel: 1, cost: owned ? null : s.cost, owned, selected: d.skins.selected === s.id });
    }
    return items;
  }
  buy(id: string): boolean {
    const d = this.data;
    if (id.startsWith('up_')) {
      const k = id.slice(3) as keyof SaveData['upgrades']; const def = UPGRADE_DEFS.find((u) => u.id === k); if (!def) return false;
      const lvl = d.upgrades[k]; if (lvl >= def.max) return false; const cost = def.cost[lvl]!; if (d.ram < cost) return false;
      d.ram -= cost; d.upgrades[k] = lvl + 1; this.save(); return true;
    }
    if (id.startsWith('skin_')) {
      const sk = SKINS.find((s) => 'skin_' + s.id === id); if (!sk) return false;
      if (d.skins.owned.includes(sk.id)) { d.skins.selected = sk.id; this.save(); return true; }
      if (d.ram < sk.cost) return false; d.ram -= sk.cost; d.skins.owned.push(sk.id); d.skins.selected = sk.id; this.save(); return true;
    }
    return false;
  }
}
