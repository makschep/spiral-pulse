import {
  TAU, CORE_R, TURN_SPEED,
  clamp, lerp, normAng, game, tr
} from './state.js';

export function hsl(h, s, l, a = 1) {
  h = ((h % 360) + 360) % 360;
  return a >= 0.999
    ? `hsl(${h.toFixed(1)}, ${s}%, ${l}%)`
    : `hsla(${h.toFixed(1)}, ${s}%, ${l}%, ${a.toFixed(3)})`;
}

// Reusable palette object (mutated in-place every frame -> Zero-GC!)
const dynPal = {
  hA: 186, hB: 220, hC: 152,
  accentA: '#00f5ff', accentB: '#00f5ff',
  sideA: '#007480', sideB: '#007480',
  rim: '#d4ffff',
  bgInner: '#002228', bgMid: '#00171c', bgDeep: '#000c0f',
  lobe1: 'rgba(0,0,0,0)', lobe2: 'rgba(0,0,0,0)', lobe3: 'rgba(0,0,0,0)'
};

export function getDynamicPalette() {
  const lvl = game.curLvl;
  const h0 = lvl.baseHue;
  const c = game.chromaAmt;
  const ph = game.chromaPhase;

  if (c < 0.01) {
    dynPal.hA = h0;
    dynPal.hB = h0 + lvl.huePartner * 0.25;
    dynPal.hC = h0;
    dynPal.accentA = lvl.accent;
    dynPal.accentB = lvl.accent;
    dynPal.sideA = lvl.sideShade;
    dynPal.sideB = lvl.sideShade;
    dynPal.rim = lvl.rim;
    dynPal.bgInner = lvl.bg;
    dynPal.bgMid = lvl.bgMid;
    dynPal.bgDeep = lvl.bgDeep;
    return dynPal;
  }

  const drift1 = Math.sin(ph * 0.95) * lvl.hueSwing * c;
  const drift2 = Math.cos(ph * 0.65) * (lvl.hueSwing * 0.85) * c;
  const hA = h0 + drift1;
  const hB = h0 + lvl.huePartner * (0.25 + 0.75 * c) + drift2;
  const hC = h0 - lvl.huePartner * 0.65 * c + Math.sin(ph * 0.5) * 18 * c;

  dynPal.hA = hA;
  dynPal.hB = hB;
  dynPal.hC = hC;
  dynPal.accentA = hsl(hA, 98, 55);
  dynPal.accentB = hsl(hB, 96, 58);
  dynPal.sideA = hsl(hA, 85, 25);
  dynPal.sideB = hsl(hB, 80, 22);
  dynPal.rim = hsl((hA + hB) * 0.5, 100, 88);
  dynPal.bgInner = hsl(hA, 78, 12);
  dynPal.bgMid = hsl(hB, 72, 7);
  dynPal.bgDeep = hsl(hC, 75, 4);
  dynPal.lobe1 = hsl(hA, 95, 52, 0.24 * c);
  dynPal.lobe2 = hsl(hB, 95, 55, 0.22 * c);
  dynPal.lobe3 = hsl(hC, 90, 50, 0.16 * c);
  return dynPal;
}

// Reusable profile output (mutated in-place -> Zero-GC!)
export const profileOut = { rIn: 0, rOut: 0 };

export function evalWallRadialProfile(w, f, out = profileOut) {
  let rIn = w.r + w.vibeOff;
  let rOut = rIn + w.thick;
  const prof = w.profile;

  if (prof === 'bastion') {
    if (f > 0.24 && f < 0.76) {
      rOut += w.turretH || 46;
    } else if (f > 0.14 && f < 0.86) {
      rOut += (w.turretH || 46) * 0.38;
    }
  } else if (prof === 'fortress') {
    const tier = Math.floor(f * 5);
    const bump = (tier === 1 || tier === 3) ? (w.turretH || 28) : (tier === 2 ? 12 : 0);
    rOut += bump;
    if (tier === 2) rIn -= 6;
  } else if (prof === 'blade') {
    const t = w.flip ? (1 - f) : f;
    rOut += Math.pow(t, 1.35) * (w.turretH || 44);
    rIn += (1 - t) * 10;
  } else if (prof === 'chevron') {
    const peak = 1 - Math.abs(f * 2 - 1);
    rOut += peak * (w.turretH || 34);
    rIn -= peak * 9;
  } else if (prof === 'notch') {
    if (f > 0.30 && f < 0.70) {
      rIn += Math.min(w.thick * 0.48, 22);
      rOut += 14;
    }
  } else if (prof === 'wing') {
    const bell = Math.sin(f * Math.PI);
    rOut += bell * (w.turretH || 30);
    rIn += (1 - bell) * 8;
  } else if (prof === 'piston') {
    const pump = (0.5 + 0.5 * Math.sin(game.runTime * 3.0 + w.phase)) * 18;
    if (f > 0.22 && f < 0.78) rOut += pump + 16;
  } else if (prof === 'prism') {
    const tri = 1 - Math.abs(((f * 3) % 1) * 2 - 1);
    rOut += tri * (w.turretH || 28);
    rIn -= tri * 6;
  }

  const minR = CORE_R * 0.84;
  out.rIn = rIn < minR ? minR : rIn;
  out.rOut = rOut < minR + 3 ? minR + 3 : rOut;
  return out;
}

export function getSpawnRadius() {
  const vW = game.W / game.arenaScale;
  const vH = game.H / game.arenaScale;
  return Math.hypot(vW, vH) * 0.54 + 42;
}

export function getOutermostInwardWallOuterR() {
  let maxR = 0;
  const walls = game.walls;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.dir !== -1 || w.vanished) continue;
    const outer = w.r + w.thick + (w.turretH || 0);
    if (outer > maxR) maxR = outer;
  }
  return maxR;
}

export function getInnermostOutwardWallInnerR() {
  let minR = 99999;
  const walls = game.walls;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.dir !== 1 || w.vanished) continue;
    if (w.r < minR) minR = w.r;
  }
  return minR;
}

function addWall(opts) {
  game.walls.push({
    r: opts.r,
    dir: opts.dir === 1 ? 1 : -1,
    thick: opts.thick || 24,
    start: normAng(opts.start),
    span: clamp(opts.span, 0.14, TAU - 0.14),
    rotSpd: opts.rotSpd || 0,
    kind: opts.kind || 'arc',
    profile: opts.profile || 'arc',
    turretH: opts.turretH || 0,
    flip: !!opts.flip,
    baseStart: normAng(opts.start),
    baseSpan: clamp(opts.span, 0.14, TAU - 0.14),
    oscAmp: opts.oscAmp || 0.15,
    phase: opts.phase || 0,
    phantomAlpha: 1,
    vanishSfxDone: false,
    vanished: false,
    hitFlash: 0,
    vibeOff: 0,
    nearAwarded: false,
    height3D: opts.height3D || 34
  });
}

function addCoin(r, ang, dir = -1) {
  game.coins.push({ r, ang: normAng(ang), dir, taken: false, pulse: Math.random() * TAU });
}

function addRingWithGap(r, thick, gapCenter, gapWidth, extra = {}) {
  addWall({ r, thick, start: normAng(gapCenter + gapWidth * 0.5), span: TAU - gapWidth, ...extra });
}

function addSymmetricPair(r, thick, gapCenter, gapWidth, extra = {}) {
  const startA = normAng(gapCenter + gapWidth * 0.5);
  const span = Math.PI - gapWidth;
  addWall({ r, thick, start: startA, span, ...extra });
  addWall({ r, thick, start: normAng(startA + Math.PI), span, ...extra });
}

export function spawnFairWave(wallSpd, showBanner) {
  const R0 = getSpawnRadius();
  const t = game.runTime;
  const ease = clamp(1 - t / 44, 0, 1);
  game.patternCount++;
  const pat = game.patternCount;
  const lvlId = game.curLvl.id;

  const isDualLvl = (lvlId === 3);
  const maxDelta = isDualLvl ? 0.92 : 1.35;
  const minDelta = 0.40;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const delta = dir * (minDelta + Math.random() * (maxDelta - minDelta));
  const gapAng = normAng(game.lastSafeGapAng + delta);

  const stdGap = lerp(1.18, 1.62, ease);
  const dualGap = lerp(1.06, 1.34, ease);

  let exitGapAng = gapAng;
  let extraClearance = 0;

  // --- LEVEL 05: EVENT HORIZON ---
  if (lvlId === 4) {
    const sing = game.singularity;
    if (sing.phase === 'outward') {
      const rStart = CORE_R + 4;
      const outGap = lerp(1.15, 1.48, ease);
      const pick = pat % 4;
      sing.coreFlare = 1.0;

      if (pick === 0) {
        const bonusSpan = 0.95;
        const solidSpan = TAU - outGap - bonusSpan;
        const solid1Start = normAng(gapAng + outGap * 0.5);
        const halfSolid = solidSpan * 0.5;
        addWall({ r: rStart, dir: 1, thick: 22, start: solid1Start, span: halfSolid, profile: 'prism', turretH: 18, height3D: 38 });
        const crysStart = normAng(solid1Start + halfSolid + 0.04);
        addWall({ r: rStart, dir: 1, thick: 24, start: crysStart, span: bonusSpan - 0.08, kind: 'crystal', profile: 'chevron', turretH: 16, height3D: 40 });
        addWall({ r: rStart, dir: 1, thick: 22, start: normAng(crysStart + bonusSpan - 0.04), span: halfSolid, profile: 'prism', turretH: 18, height3D: 38 });
        addCoin(rStart + 12, gapAng, 1);
      } else if (pick === 1) {
        addSymmetricPair(rStart, 20, gapAng, lerp(1.05, 1.32, ease), { dir: 1, profile: 'blade', turretH: 26, flip: dir > 0, height3D: 38 });
        addCoin(rStart + 10, gapAng, 1);
      } else if (pick === 2) {
        const crysW = lerp(1.55, 1.85, ease);
        addRingWithGap(rStart, 22, gapAng, crysW, { dir: 1, profile: 'fortress', turretH: 18, height3D: 38 });
        addWall({ r: rStart, dir: 1, thick: 24, start: normAng(gapAng - crysW * 0.5 + 0.04), span: crysW - 0.08, kind: 'crystal', height3D: 42 });
      } else {
        const open = lerp(0.84, 1.02, ease);
        const span = TAU / 3 - open;
        for (let k = 0; k < 3; k++) {
          addWall({ r: rStart, dir: 1, thick: 22, start: gapAng + open * 0.5 + k * (TAU / 3), span, rotSpd: dir * 0.22, profile: 'chevron', turretH: 18, height3D: 36 });
        }
        addCoin(rStart + 11, gapAng, 1);
      }
      game.lastSafeGapAng = gapAng;
      game.nextRequiredClearance = 104 + lerp(16, 0, 1 - ease);
      return;
    }

    const pick = pat % 4;
    if (pick === 1) {
      if (!sing.crystalHintShown) {
        sing.crystalHintShown = true;
        showBanner(tr().bannerCrystalHint, 2.0);
      }
      const crysGap = lerp(1.48, 1.82, ease);
      addRingWithGap(R0, 28, gapAng, crysGap, { profile: 'prism', turretH: 24, height3D: 40 });
      addWall({ r: R0, thick: 30, start: normAng(gapAng - crysGap * 0.5 + 0.04), span: crysGap - 0.08, kind: 'crystal', profile: 'chevron', turretH: 18, height3D: 44 });
      extraClearance = 28;
    } else if (pick === 2) {
      const monSpan = lerp(2.35, 2.1, ease);
      addWall({ r: R0, thick: 64, start: normAng(gapAng + stdGap * 0.55), span: monSpan, profile: 'bastion', turretH: 42, height3D: 48 });
      addWall({ r: R0 + 18, thick: 24, start: normAng(gapAng - stdGap * 0.45), span: stdGap * 0.42, kind: 'crystal', height3D: 40 });
      addCoin(R0 + 32, gapAng + stdGap * 0.2);
      extraClearance = 36;
    } else if (pick === 3) {
      addSymmetricPair(R0, 24, gapAng, lerp(1.12, 1.40, ease), { profile: 'prism', turretH: 28, rotSpd: dir * 0.22, height3D: 40 });
      addCoin(R0 + 14, gapAng);
      extraClearance = 24;
    } else {
      addRingWithGap(R0, 30, gapAng, stdGap, { profile: 'fortress', turretH: 28, height3D: 40 });
      addCoin(R0 + 16, gapAng);
    }
  }

  // --- LEVEL 01: CYAN PULSE ---
  else if (lvlId === 0) {
    const pick = pat % 5;
    if (pick === 0) {
      const monSpan = lerp(2.65, 2.35, ease);
      addWall({ r: R0, thick: 72, start: normAng(gapAng + stdGap * 0.55), span: monSpan, profile: 'bastion', turretH: 48, height3D: 48 });
      const a2 = normAng(gapAng + dir * 0.72);
      addRingWithGap(R0 + 138, 34, a2, stdGap + 0.14, { profile: 'fortress', turretH: 30, height3D: 36 });
      if (Math.random() < 0.65) addCoin(R0 + 36, gapAng);
      exitGapAng = a2;
      extraClearance = 38;
    } else if (pick === 1) {
      addSymmetricPair(R0, 22, gapAng, lerp(1.08, 1.36, ease), { profile: 'blade', turretH: 48, flip: dir > 0, height3D: 42 });
      if (Math.random() < 0.55) addCoin(R0 + 28, gapAng);
      extraClearance = 24;
    } else if (pick === 2) {
      addRingWithGap(R0, 28, gapAng, stdGap, { profile: 'fortress', turretH: 32, height3D: 40 });
      if (Math.random() < 0.5) addCoin(R0 + 18, gapAng);
    } else if (pick === 3) {
      const open = lerp(0.80, 0.96, ease);
      const span = TAU / 3 - open;
      for (let k = 0; k < 3; k++) {
        addWall({ r: R0, thick: 28, start: gapAng + open * 0.5 + k * (TAU / 3), span, profile: 'chevron', turretH: 30, height3D: 38 });
      }
      const a2 = normAng(gapAng + dir * 0.68);
      addRingWithGap(R0 + 136, 36, a2, stdGap + 0.12, { profile: 'notch', height3D: 36 });
      exitGapAng = a2;
      extraClearance = 32;
    } else {
      const steps = 4;
      const segSpan = (TAU - stdGap) / steps;
      const s0 = normAng(gapAng + stdGap * 0.5);
      for (let k = 0; k < steps; k++) {
        const idx = dir > 0 ? k : (steps - 1 - k);
        addWall({ r: R0 + idx * 20, thick: 26 + (k % 2) * 14, start: s0 + k * segSpan, span: segSpan + 0.02, height3D: 32 + idx * 5 });
      }
      addCoin(R0 + 30, gapAng);
    }
  }

  // --- LEVEL 02: CRIMSON PHANTOM ---
  else if (lvlId === 1) {
    const pick = pat % 4;
    if (pick === 0) {
      const mirageGap = lerp(1.36, 1.70, ease);
      addRingWithGap(R0, 32, gapAng, mirageGap, { profile: 'fortress', turretH: 26, height3D: 38 });
      addWall({ r: R0, thick: 32, start: normAng(gapAng - mirageGap * 0.5 + 0.03), span: mirageGap - 0.06, kind: 'phantom', profile: 'arc', height3D: 38 });
      addCoin(R0 + 16, gapAng);
      extraClearance = 32;
    } else if (pick === 1) {
      const wedgeSpan = lerp(1.12, 0.96, ease);
      const laneHalf = (Math.PI - wedgeSpan) * 0.5;
      addWall({ r: R0, thick: 74, start: gapAng + laneHalf, span: wedgeSpan, profile: 'bastion', turretH: 40, height3D: 48 });
      addWall({ r: R0, thick: 74, start: gapAng + laneHalf + Math.PI, span: wedgeSpan, profile: 'bastion', turretH: 40, height3D: 48 });
      addWall({ r: R0 + 16, thick: 28, start: gapAng - laneHalf + 0.04, span: laneHalf * 2 - 0.08, kind: 'phantom', height3D: 36 });
      addCoin(R0 + 38, gapAng);
      extraClearance = 44;
    } else if (pick === 2) {
      addSymmetricPair(R0, 26, gapAng, lerp(1.14, 1.40, ease), { kind: 'split', profile: 'blade', turretH: 32, oscAmp: 0.14, flip: dir > 0, height3D: 38 });
      extraClearance = 24;
    } else {
      const mirageW = lerp(1.30, 1.56, ease);
      addRingWithGap(R0, 42, gapAng, mirageW, { profile: 'notch', height3D: 42 });
      addWall({ r: R0 + 6, thick: 30, start: normAng(gapAng - mirageW * 0.5 + 0.04), span: mirageW - 0.08, kind: 'phantom', height3D: 40 });
      extraClearance = 30;
    }
  }

  // --- LEVEL 03: GOLD ECLIPSE ---
  else if (lvlId === 2) {
    const pick = pat % 4;
    if (pick === 0) {
      const g = lerp(1.28, 1.62, ease);
      const rot = dir * 0.26;
      addRingWithGap(R0, 30, gapAng, g, { kind: 'gear', rotSpd: rot, height3D: 42 });
      if (Math.random() < 0.6) addCoin(R0 + 15, gapAng);
      exitGapAng = normAng(gapAng + rot * 1.4);
    } else if (pick === 1) {
      addSymmetricPair(R0, 28, gapAng, lerp(1.12, 1.38, ease), { profile: 'piston', turretH: 34, phase: 0, rotSpd: dir * 0.18, height3D: 44 });
      addCoin(R0 + 18, gapAng);
      extraClearance = 30;
    } else if (pick === 2) {
      const monSpan = lerp(2.45, 2.2, ease);
      addWall({ r: R0, thick: 64, start: normAng(gapAng + stdGap * 0.55), span: monSpan, profile: 'bastion', turretH: 42, rotSpd: 0.16, height3D: 48 });
      const a2 = normAng(gapAng + dir * 0.72);
      addRingWithGap(R0 + 144, 26, a2, stdGap + 0.14, { kind: 'gear', rotSpd: -0.22, height3D: 36 });
      exitGapAng = a2;
      extraClearance = 40;
    } else {
      const open = lerp(0.84, 1.0, ease);
      const span = TAU / 3 - open;
      const rot = -dir * 0.22;
      for (let k = 0; k < 3; k++) {
        addWall({ r: R0, thick: 24, start: gapAng + open * 0.5 + k * (TAU / 3), span, profile: 'blade', turretH: 38, rotSpd: rot, flip: dir < 0, height3D: 40 });
      }
      if (Math.random() < 0.55) addCoin(R0 + 16, gapAng);
      extraClearance = 28;
    }
  }

  // --- LEVEL 04: VIOLET DUALITY ---
  else {
    const pick = pat % 4;
    if (pick === 0) {
      addSymmetricPair(R0, 26, gapAng, Math.max(1.22, dualGap), { kind: 'breathe', profile: 'wing', turretH: 34, oscAmp: 0.12, phase: 0, height3D: 42 });
      if (Math.random() < 0.65) {
        addCoin(R0 + 15, gapAng);
        addCoin(R0 + 15, gapAng + Math.PI);
      }
      extraClearance = 24;
    } else if (pick === 1) {
      addSymmetricPair(R0, 52, gapAng, lerp(1.16, 1.40, ease), { profile: 'bastion', turretH: 36, height3D: 48 });
      addCoin(R0 + 26, gapAng);
      extraClearance = 42;
    } else if (pick === 2) {
      const step = dir * 0.42;
      for (let k = 0; k < 3; k++) {
        const a = normAng(gapAng + k * step);
        const r = R0 + k * 116;
        addSymmetricPair(r, 22, a, dualGap + 0.08, { profile: 'chevron', turretH: 24, height3D: 34 + k * 4 });
        if (k === 1) addCoin(r + 12, a);
        exitGapAng = a;
      }
      extraClearance = 36;
    } else {
      const open = lerp(0.74, 0.88, ease);
      const span = Math.PI * 0.5 - open;
      const rot = dir * 0.24;
      for (let k = 0; k < 4; k++) {
        addWall({ r: R0, thick: 22, start: gapAng + open * 0.5 + k * Math.PI * 0.5, span, profile: 'blade', turretH: 32, rotSpd: rot, height3D: 38 });
      }
      extraClearance = 28;
    }
  }

  game.lastSafeGapAng = exitGapAng;
  const safeTurnTime = (maxDelta / (TURN_SPEED * 0.68)) + 0.34;
  game.nextRequiredClearance = Math.max(134, safeTurnTime * wallSpd) + extraClearance;
}
