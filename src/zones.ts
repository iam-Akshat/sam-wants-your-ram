// Zone / stage definitions and the global tuning constants of the track.
export const LW = 2.2;               // lane width
export const LANE_X = [-LW, 0, LW];
export const CHUNK_LEN = 50;
export const BEAT_LEN = 10;
export const BEATS = 5;
export const WALL_X = 5.7;
export const CEIL_Y = 6.6;

export interface ZoneDef {
  name: string;
  fog: number; fogNear: number; fogFar: number;
  hemiSky: number; hemiGround: number; hemiI: number;
  key: number; keyI: number;
  env: number;                // scene.environmentIntensity
  led: number[];              // LED palette for racks
  light: number;              // ceiling light colour
  lightI: number;             // HDR multiplier for lights
  floorTint: number;
  bloom: number;              // bloom intensity
  sat: number; contrast: number; bright: number; hue: number;
  heat: number;               // heat shimmer 0..1
  mote: number;               // ambient particle colour
  moteMode: 0 | 1 | 2 | 3 | 4; // 0 snow 1 embers 2 data 3 mist 4 sparkle
  wall: 'rack' | 'tank' | 'rail';
  ceiling: boolean;
  sky: number;                // sky colour (rooftop)
}

export const ZONES: ZoneDef[] = [
  { name: 'Cold Aisle', fog: 0x0a2a4a, fogNear: 30, fogFar: 175, hemiSky: 0x9fd8ff, hemiGround: 0x1a3555, hemiI: 0.55,
    key: 0xcfeaff, keyI: 1.8, env: 0.55, led: [0x35d6ff, 0x7dffea, 0xffffff, 0x4f8bff], light: 0x8fe6ff, lightI: 2.6,
    floorTint: 0x7aa9d6, bloom: 0.85, sat: 0.12, contrast: 0.08, bright: 0.02, hue: 0, heat: 0, mote: 0xd8f4ff, moteMode: 0,
    wall: 'rack', ceiling: true, sky: 0x0a2a4a },
  { name: 'Hot Aisle', fog: 0x3a1608, fogNear: 28, fogFar: 160, hemiSky: 0xffc27a, hemiGround: 0x3a1408, hemiI: 0.5,
    key: 0xffb070, keyI: 1.9, env: 0.45, led: [0xff7a1f, 0xffc23a, 0xff3b30, 0xffffff], light: 0xff9a3c, lightI: 2.8,
    floorTint: 0xd49a78, bloom: 1.0, sat: 0.2, contrast: 0.1, bright: 0.0, hue: 0, heat: 1, mote: 0xffa040, moteMode: 1,
    wall: 'rack', ceiling: true, sky: 0x3a1608 },
  { name: 'GPU Hall', fog: 0x06240f, fogNear: 30, fogFar: 175, hemiSky: 0x8dffa8, hemiGround: 0x0a2a14, hemiI: 0.5,
    key: 0xc6ffd2, keyI: 1.8, env: 0.455, led: [0x3dff6a, 0xb6ff3d, 0x00ffb4, 0xffffff], light: 0x57ff7d, lightI: 2.8,
    floorTint: 0x7fc48f, bloom: 1.05, sat: 0.2, contrast: 0.12, bright: 0.0, hue: 0, heat: 0, mote: 0x7dff9a, moteMode: 2,
    wall: 'rack', ceiling: true, sky: 0x06240f },
  { name: 'Cooling Towers', fog: 0x0b3a52, fogNear: 25, fogFar: 150, hemiSky: 0xa8ecff, hemiGround: 0x0c3a55, hemiI: 0.55,
    key: 0xe0f8ff, keyI: 1.8, env: 0.6, led: [0x38c8ff, 0x7af0ff, 0xffffff, 0x2f7bff], light: 0x7ae8ff, lightI: 2.4,
    floorTint: 0x7ab8d0, bloom: 0.9, sat: 0.18, contrast: 0.08, bright: 0.03, hue: 0, heat: 0, mote: 0xe6faff, moteMode: 3,
    wall: 'tank', ceiling: true, sky: 0x0b3a52 },
  { name: 'Rooftop Exit', fog: 0xffa070, fogNear: 45, fogFar: 260, hemiSky: 0xffd9b0, hemiGround: 0x6a4a5a, hemiI: 0.8,
    key: 0xffd2a0, keyI: 2.4, env: 0.75, led: [0xffd23f, 0xff7aa8, 0xffffff, 0xffa23a], light: 0xffd6a0, lightI: 2.0,
    floorTint: 0xe6c4a8, bloom: 0.8, sat: 0.28, contrast: 0.1, bright: 0.04, hue: 0, heat: 0, mote: 0xfff0c0, moteMode: 4,
    wall: 'rail', ceiling: false, sky: 0xff8a5a },
];

// Escape-mode stages: goal distance (m) per stage, base speed, end speed
export const STAGE_GOALS = [2400, 2900, 3300, 3700, 4100];
export const STAGE_SPEED: [number, number][] = [[13, 17.5], [16, 20.5], [18.5, 23], [20.5, 25], [22.5, 27]];
export const stageStart = (s: number): number => { let a = 0; for (let i = 0; i < s; i++) a += STAGE_GOALS[i]!; return a; };
export const ENDLESS_ZONE_LEN = 2400;
