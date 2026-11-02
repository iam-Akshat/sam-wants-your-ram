import { UI } from '../ui';
import type { SaveData, ShopItem, HudState, RunResult, LbEntry } from '../types';
import { renderShareCard, renderOgCard } from '../sharecard';
import { CUTSCENES } from '../jokes';

const q = new URLSearchParams(location.search);
const save: SaveData = {
  v: 1, ram: 1240, totalRam: 5000, bestEndless: 48210, bestEndlessDist: 2210, bestEscape: 31337, stageReached: Number(q.get('reached') || 3),
  escapeDone: q.get('done') === '1', upgrades: { ddr: 2, magnet: 1, cool: 0, oc: 3, shield: 1, head: 2 },
  skins: { owned: ['classic', 'gold'], selected: 'classic' },
  missions: [
    { id: 'm1', progress: 12, target: 30, text: 'Collect 30 RAM sticks in one run', reward: 150 },
    { id: 'm2', progress: 3, target: 5, text: 'Pull off 5 close calls', reward: 200 },
    { id: 'm3', progress: 0, target: 1, text: 'Survive 60 s with Sam on your tail', reward: 400 },
  ],
  missionsDone: 7,
  settings: { master: 0.8, music: 0.6, sfx: 1, muted: false, quality: 'auto', shake: true }, tutorialSeen: true,
};
const items: ShopItem[] = [
  { id: 'ddr', kind: 'upgrade', name: 'DDR Duration', desc: 'DDR x2 lasts longer.', icon: 'ddr', level: 2, maxLevel: 5, cost: 300 },
  { id: 'magnet', kind: 'upgrade', name: 'DMA Magnet', desc: 'Pulls RAM from further away.', icon: 'magnet', level: 1, maxLevel: 5, cost: 2500 },
  { id: 'shield', kind: 'upgrade', name: 'ECC Shield', desc: 'Absorbs one hit.', icon: 'shield', level: 5, maxLevel: 5, cost: null },
  { id: 'cool', kind: 'upgrade', name: 'Liquid Cooling', desc: 'Slide further, stay chill.', icon: 'cool', level: 0, maxLevel: 5, cost: 150 },
  { id: 'oc', kind: 'upgrade', name: 'Overclock', desc: 'Faster sprint boost.', icon: 'oc', level: 3, maxLevel: 5, cost: 900 },
  { id: 'head', kind: 'upgrade', name: 'Stack Headroom', desc: 'One more RAM stick of health.', icon: 'head', level: 2, maxLevel: 4, cost: 700 },
  { id: 'classic', kind: 'skin', name: 'Classic Kilo', desc: 'Scrappy original.', icon: '', level: 1, maxLevel: 1, cost: null, owned: true, selected: true },
  { id: 'gold', kind: 'skin', name: 'Gold Plated', desc: 'Very 24k.', icon: '', level: 1, maxLevel: 1, cost: null, owned: true },
  { id: 'neon', kind: 'skin', name: 'Neon Rave', desc: 'Glows in the data center.', icon: '', level: 0, maxLevel: 1, cost: 800 },
  { id: 'stealth', kind: 'skin', name: 'Stealth Bot', desc: 'Nobody saw that.', icon: '', level: 0, maxLevel: 1, cost: 5000 },
];
const names = ['RAMLORD', 'kilo_fan', 'DIMMsDaddy', 'xX_cache_Xx', 'NoRentPls', 'ECCgirl', 'Linda', 'idle5pct', 'bufferin', 'OwnIt'];
const lbRows: LbEntry[] = Array.from({ length: 50 }, (_, i) => ({ rank: i + 1, nick: names[i % 10] + (i > 9 ? i : ''), gb: Math.round(400 - i * 7.3) }));
const log = (...a: unknown[]) => console.log('[hook]', ...a);
const ui: UI = new UI(document.getElementById('ui')!, () => save, {
  startEscape: (n) => log('startEscape', n), startEndless: () => log('endless'), resume: () => { log('resume'); ui.hidePause(); },
  restart: () => log('restart'), quitToMenu: () => { log('quit'); ui.showTitle(); }, requestPause: () => { log('pause'); ui.showPause(); },
  buy: (id) => { const it = items.find((i) => i.id === id)!; if (it.cost === null || it.cost > save.ram) return false; save.ram -= it.cost; if (it.kind === 'upgrade') it.level++; else it.owned = true; return true; },
  selectSkin: (id) => { items.forEach((i) => { if (i.kind === 'skin') i.selected = i.id === id; }); },
  getShopItems: () => items, setSettings: (p) => { Object.assign(save.settings, p); log('settings', p); },
  submitScore: async (n, r) => { log('submit', n, r.gb); await new Promise((x) => setTimeout(x, 300)); lbRows.splice(6, 0, { rank: 0, nick: n, gb: r.gb }); return q.get('offline') ? null : { rank: 7 }; },
  getLeaderboard: async () => (q.get('lb') === '0' ? null : lbRows.map((x, i) => ({ ...x, rank: i + 1 }))),
  getStats: async () => (q.get('stats') === '0' ? null : { totalGb: 18_400_000, totalTb: 17968.75, runs: 912345 }),
  cutsceneDone: () => log('cutsceneDone'), finaleDone: () => log('finaleDone'), sfx: (n) => log('sfx', n),
});
(window as unknown as { ui: UI }).ui = ui;

const screen = q.get('screen') || 'title';
const hud = (t: number): HudState => ({
  score: 12840 + t * 13, ram: 87 + Math.floor(t / 30), multiplier: 3, ddr: true, stack: 3, stackMax: 5, dist: 640 + t, goal: 1500, stage: 2, zoneName: 'The Cold Aisle',
  powers: [{ kind: 'magnet', left: 6.4, total: 10 }, { kind: 'cool', left: 2.2, total: 8 }, { kind: 'oc', left: 9, total: 10 }], shield: true, speed: 30, threat: 0.75, mode: 'escape', fps: 60,
});
switch (screen) {
  case 'title': ui.showTitle(); break;
  case 'stages': ui.showTitle(); (document.querySelector('[data-act=escape]') as HTMLElement).click(); break;
  case 'shop': ui.showShop(); break;
  case 'missions': ui.showMissions(); break;
  case 'settings': ui.showSettings(); break;
  case 'credits': ui.showCredits(); break;
  case 'pause': ui.showHud(true); ui.updateHud(hud(0)); ui.showPause(); break;
  case 'pauseset': ui.showPause(); (document.querySelector('[data-act=psettings]') as HTMLElement).click(); break;
  case 'gameover': case 'gameover-win': case 'gameover-lose': {
    const ch = screen === 'gameover-win' ? { from: 'Linda', beat: 30 } : screen === 'gameover-lose' ? { from: 'RAMLORD', beat: 400 } : null;
    const r: RunResult = { mode: 'endless', stage: 2, score: 48, ram: 48, dist: 812, newBest: true, completedMissions: ['close_calls_5', 'collect-30'], reason: 'caught', gb: 48, durationSec: 60, challenge: ch };
    ui.showGameOver(r, 'Your RAM looks lonely.'); break;
  }
  case 'title-challenge': ui.setChallenge({ from: 'Linda', beat: 212 }); ui.showTitle(); break;
  case 'share': {
    const cv = renderShareCard({ gb: 48, nick: q.get('nick') || undefined, challenge: q.get('ch') ? { from: 'Linda', beat: 30 } : null });
    cv.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(96vw,1200px);height:auto;z-index:99;background:#000'; document.body.appendChild(cv); break;
  }
  case 'og': {
    const cv = renderOgCard();
    cv.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(96vw,1200px);height:auto;z-index:99;background:#000'; document.body.appendChild(cv); break;
  }
  case 'cutscene': ui.showCutscene(Number(q.get('i') || 0), 'Come back, little bot!'); for (let i = 0; i < Number(q.get('p') || 0); i++) (document.querySelector('.scr-cutscene') as HTMLElement).click(); break;
  case 'stage': ui.showStageClear(2, { score: 23450, ram: 64 }); break;
  case 'loading': ui.showLoading(true); break;
  case 'finale': ui.showFinale([]); if (q.get('credits')) setTimeout(() => (ui as unknown as { openFinalCredits(): void }).openFinalCredits(), 100); break;
  case 'hud': {
    ui.showHud(true); ui.showHint('Swipe left/right to change lanes'); ui.showStageBanner(2, 'The Cold Aisle', 1500);
    ui.setSamExpr((q.get('samexpr') || 'earnest') as 'earnest');
    if (q.get('bubble') !== '0') ui.setBubble(q.get('bubble') || 'Just rent it!', 150, 330);
    ui.updateHud(hud(0)); ui.toast('Mission complete: Close Calls x5!', '#48f0a8');
    ui.popup('CLOSE CALL!', 'close'); setTimeout(() => ui.popup('+50 RAM', 'pickup', '#ffd23f'), 100); setTimeout(() => ui.popup('COMBO x4', 'combo', '#46c8ff'), 200);
    ui.flash('close');
    let t = 0; const loop = () => { t++; ui.updateHud(hud(t)); requestAnimationFrame(loop); }; loop();
    if (q.get('count')) ui.showCountdown(3);
    break;
  }
}
void CUTSCENES;
