import { I18N } from './i18n.js';

export const TAU = Math.PI * 2;
export const VIRTUAL_H = 520;
export const CORE_R = 36;
export const BASE_ORBIT_R = 60;
export const OUTER_ORBIT_R = 178;
export const PLAYER_BASE_H = 11.5;
export const PLAYER_BASE_W = 10.5;
export const TURN_SPEED = 6.25;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export function normAng(a) {
  a = a % TAU;
  return a < 0 ? a + TAU : a;
}
export function angDiff(a, b) {
  let d = normAng(a - b);
  if (d > Math.PI) d -= TAU;
  return d;
}
export function isAngleInArc(ang, start, span) {
  if (span >= TAU - 0.001) return true;
  const d = normAng(ang - start);
  return d >= 0 && d <= span;
}

export const LEVELS = [
  {
    id: 0,
    num: '01',
    name: { ru: 'ЦИАН-ПУЛЬС', en: 'CYAN PULSE' },
    tag: { ru: 'БАСТИОНЫ · СПИРАЛИ', en: 'BASTIONS · SPIRALS' },
    baseHue: 186,
    hueSwing: 36,
    huePartner: 34,
    bg: '#002228',
    bgMid: '#00171c',
    bgDeep: '#000c0f',
    accent: '#00f5ff',
    rim: '#d4ffff',
    sideShade: '#007480',
    bpm: 122,
    baseSpeed: 120,
    baseSpin: 0.34,
    camProfile: 'dive',
    notes: [55, 65.41, 73.42, 82.41, 98, 82.41, 73.42, 65.41],
    lead: [220, 261.63, 329.63, 392, 440, 392, 329.63, 293.66]
  },
  {
    id: 1,
    num: '02',
    name: { ru: 'АЛЫЙ МИРАЖ', en: 'CRIMSON PHANTOM' },
    tag: { ru: 'РАДАР · СКРЫТЫЕ ПЛИТЫ', en: 'RADAR · DISGUISED WALLS' },
    baseHue: 352,
    hueSwing: 32,
    huePartner: -28,
    bg: '#240208',
    bgMid: '#160004',
    bgDeep: '#0b0002',
    accent: '#ff1e3c',
    rim: '#ffc2cc',
    sideShade: '#7d0a1c',
    bpm: 128,
    baseSpeed: 126,
    baseSpin: -0.38,
    camProfile: 'bank',
    notes: [51.91, 51.91, 61.74, 69.3, 77.78, 69.3, 61.74, 58.27],
    lead: [207.65, 246.94, 311.13, 369.99, 415.3, 369.99, 311.13, 277.18]
  },
  {
    id: 2,
    num: '03',
    name: { ru: 'ЗОЛОТОЙ МЕХАНИЗМ', en: 'GOLD ECLIPSE' },
    tag: { ru: 'ШЕСТЕРНИ · ЛАЗЕРЫ', en: 'GEARS · LASERS' },
    baseHue: 48,
    hueSwing: 30,
    huePartner: -24,
    bg: '#201900',
    bgMid: '#140f00',
    bgDeep: '#0a0700',
    accent: '#ffd400',
    rim: '#fff6c4',
    sideShade: '#856900',
    bpm: 132,
    baseSpeed: 132,
    baseSpin: 0.42,
    camProfile: 'iso',
    notes: [58.27, 58.27, 69.3, 77.78, 87.31, 77.78, 69.3, 65.41],
    lead: [233.08, 277.18, 349.23, 415.3, 466.16, 415.3, 349.23, 311.13]
  },
  {
    id: 3,
    num: '04',
    name: { ru: 'ДВОЙНАЯ ПРИЗМА', en: 'VIOLET DUALITY' },
    tag: { ru: 'КЛОН 180° · КРЫЛЬЯ', en: 'TWIN 180° · WINGS' },
    baseHue: 278,
    hueSwing: 40,
    huePartner: -42,
    bg: '#19052e',
    bgMid: '#10021f',
    bgDeep: '#070110',
    accent: '#ca4eff',
    rim: '#f2d4ff',
    sideShade: '#621a8c',
    bpm: 130,
    baseSpeed: 122,
    baseSpin: 0.36,
    camProfile: 'wave',
    notes: [49, 58.27, 65.41, 73.42, 87.31, 73.42, 65.41, 58.27],
    lead: [196, 233.08, 293.66, 349.23, 392, 349.23, 293.66, 261.63]
  },
  {
    id: 4,
    num: '05',
    isNew: true,
    name: { ru: 'ГОРИЗОНТ СОБЫТИЙ', en: 'EVENT HORIZON' },
    tag: { ru: 'АНТИГРАВИТАЦИЯ · ТАРАН', en: 'ANTI-GRAVITY · SHATTER' },
    baseHue: 152,
    hueSwing: 34,
    huePartner: 36,
    bg: '#022217',
    bgMid: '#01140e',
    bgDeep: '#000806',
    accent: '#00ff88',
    rim: '#d4ffea',
    sideShade: '#006e3e',
    bpm: 134,
    baseSpeed: 124,
    baseSpin: -0.36,
    camProfile: 'vortex',
    notes: [73.42, 77.78, 87.31, 77.78, 73.42, 65.41, 73.42, 110],
    lead: [293.66, 311.13, 349.23, 392, 440, 392, 349.23, 311.13]
  }
];

export const SKINS = [
  { id: 'M', price: 0 },
  { id: 'A', price: 25 },
  { id: 'X', price: 50 }
];
export const PERKS = [
  { id: 'magnet', price: 30 },
  { id: 'phasePlus', price: 45 },
  { id: 'stabilizer', price: 60 }
];

const SAVE_KEY = 'spiral_pulse_pwa_v1';
const defaultSave = {
  coins: 0,
  skin: 'M',
  ownedSkins: ['M'],
  perks: { magnet: false, phasePlus: false, stabilizer: false },
  best: [0, 0, 0, 0, 0],
  sound: true,
  vibe: true,
  lang: 'ru',
  selectedLevel: 0
};

function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    const migratedBest = Array.isArray(raw.best) ? raw.best.slice(0, LEVELS.length) : [];
    while (migratedBest.length < LEVELS.length) migratedBest.push(0);
    return {
      ...defaultSave,
      ...raw,
      perks: { ...defaultSave.perks, ...(raw.perks || {}) },
      ownedSkins: Array.isArray(raw.ownedSkins) ? raw.ownedSkins : ['M'],
      best: migratedBest,
      lang: raw.lang === 'en' ? 'en' : 'ru',
      vibe: raw.vibe !== undefined ? !!raw.vibe : true,
      selectedLevel: Math.min(LEVELS.length - 1, Math.max(0, raw.selectedLevel || 0))
    };
  } catch (_) {
    return JSON.parse(JSON.stringify(defaultSave));
  }
}

export const save = loadSave();

export function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
}

export function tr() {
  return I18N[save.lang] || I18N.ru;
}

// ===== PRE-ALLOCATED ZERO-GC OBJECT POOLS =====
function createPool(cap, factory) {
  const items = new Array(cap);
  for (let i = 0; i < cap; i++) items[i] = factory();
  return { items, count: 0, cap };
}

export const pools = {
  sparks: createPool(220, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff' })),
  shards: createPool(96, () => ({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0, sz: 4, life: 0, maxLife: 1, color: '#fff' })),
  ripples: createPool(16, () => ({ r: 0, alpha: 0 })),
  floatTexts: createPool(24, () => ({ x: 0, y: 0, text: '', color: '#ffd800', life: 0, maxLife: 0.85 }))
};

export function poolAlloc(pool) {
  if (pool.count < pool.cap) {
    return pool.items[pool.count++];
  }
  // Recycle oldest slot smoothly if saturated
  return pool.items[pool.cap - 1];
}

export function poolSwapRemove(pool, idx) {
  const last = pool.count - 1;
  if (idx !== last) {
    const tmp = pool.items[idx];
    pool.items[idx] = pool.items[last];
    pool.items[last] = tmp;
  }
  pool.count = last;
}

export function clearPools() {
  pools.sparks.count = 0;
  pools.shards.count = 0;
  pools.ripples.count = 0;
  pools.floatTexts.count = 0;
}

// Background ambient particles (fixed size, mutated in place)
const bgParticles = [];
for (let i = 0; i < 48; i++) {
  bgParticles.push({
    ang: Math.random() * TAU,
    r: 50 + Math.random() * 440,
    spd: 14 + Math.random() * 32,
    sz: 1.2 + Math.random() * 2.2,
    alpha: 0.2 + Math.random() * 0.55
  });
}

// ===== SHARED GAME STATE =====
export const game = {
  // Viewport metrics (logical landscape W x H, raw viewport vw x vh)
  W: 960,
  H: 540,
  vw: 960,
  vh: 540,
  DPR: 1,
  isRotated: false,
  arenaScale: 1,

  mode: 'menu', // 'menu' | 'play' | 'dying' | 'over'
  curLvl: LEVELS[save.selectedLevel] || LEVELS[0],
  runTime: 0,
  runCoins: 0,
  worldRot: 0,
  worldSpin: 0,
  shake: 0,
  hitStop: 0,
  deathTimer: 0,
  bannerTimer: 0,
  lastSpeedTier: 0,
  scrapeCooldown: 0,

  beatAccum: 0,
  stepIdx: 0,
  beatPulse: 0,

  depth3D: 0,
  chromaAmt: 0,
  chromaPhase: 0,
  camTiltX: 0,
  camTiltY: 0,
  camZoom: 1,
  camSway: 0,

  player: {
    ang: -Math.PI / 2,
    angVel: 0,
    orbitR: BASE_ORBIT_R,
    faceRot: 0,
    radialBounce: 0,
    radialVel: 0,
    scale: 1.0,
    phaseFuel: 3.0,
    phaseMax: 3.0,
    phasing: false,
    nearMissCd: 0,
    grace: 0
  },

  duality: {
    active: false,
    splitBlend: 0,
    respawnTimer: 5.0
  },

  singularity: {
    phase: 'inward',
    timer: 9.5,
    transDur: 1.9,
    orbitFactor: 0,
    coreFlare: 0,
    crystalHintShown: false
  },

  walls: [],
  coins: [],
  lasers: [],
  bgParticles,
  laserTimer: 4.6,
  patternCount: 0,
  lastSafeGapAng: -Math.PI / 2,
  nextRequiredClearance: 0
};
