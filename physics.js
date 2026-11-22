import {
  TAU, CORE_R, BASE_ORBIT_R, OUTER_ORBIT_R,
  PLAYER_BASE_H, PLAYER_BASE_W, TURN_SPEED,
  clamp, lerp, smoothstep, normAng, angDiff, isAngleInArc,
  save, persist, tr, game, pools, poolAlloc, poolSwapRemove
} from './state.js';
import { playKick, playBass, playShimmerPad, playLead, playHat, playSfx, vibe } from './audio.js';
import { getInput } from './input.js';
import {
  getDynamicPalette, evalWallRadialProfile,
  getSpawnRadius, getOutermostInwardWallOuterR, getInnermostOutwardWallInnerR,
  spawnFairWave
} from './levels.js';

const collBounds = { rIn: 0, rOut: 0 };
const collResult = { ang: 0, died: false };

export function emitSparks(x, y, nx, ny, count, color, speedMul = 1) {
  const baseAng = Math.atan2(ny, nx);
  for (let i = 0; i < count; i++) {
    const s = poolAlloc(pools.sparks);
    const a = baseAng + (Math.random() - 0.5) * 1.9;
    const spd = (80 + Math.random() * 175) * speedMul;
    s.x = x;
    s.y = y;
    s.vx = Math.cos(a) * spd;
    s.vy = Math.sin(a) * spd;
    s.life = 0.25 + Math.random() * 0.28;
    s.maxLife = 0.53;
    s.size = 1.8 + Math.random() * 2.4;
    s.color = color;
  }
}

export function emitRipple(r, alpha) {
  const rp = poolAlloc(pools.ripples);
  rp.r = r;
  rp.alpha = alpha;
}

export function addFloatText(x, y, text, color) {
  const ft = poolAlloc(pools.floatTexts);
  ft.x = x;
  ft.y = y;
  ft.text = text;
  ft.color = color;
  ft.life = 0.85;
  ft.maxLife = 0.85;
}

export function shatterAt(ang, scale, color, customR = null, count = 18) {
  const p = game.player;
  const r = customR !== null ? customR : (p.orbitR + p.radialBounce);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const ox = ux * r;
  const oy = uy * r;
  emitSparks(ox, oy, ux, uy, count + 4, '#ffffff', 1.35);
  const szMul = Math.sqrt(scale);
  for (let i = 0; i < count; i++) {
    const sh = poolAlloc(pools.shards);
    const a = (i / count) * TAU + (Math.random() - 0.5) * 0.4;
    const spd = 110 + Math.random() * 230;
    sh.x = ox + (Math.random() - 0.5) * 8;
    sh.y = oy + (Math.random() - 0.5) * 8;
    sh.vx = Math.cos(a) * spd;
    sh.vy = Math.sin(a) * spd;
    sh.rot = Math.random() * TAU;
    sh.vrot = (Math.random() - 0.5) * 15;
    sh.sz = (3.4 + Math.random() * 5.2) * szMul;
    sh.life = 0.95 + Math.random() * 0.45;
    sh.maxLife = 1.4;
    sh.color = (i % 3 === 0) ? '#ffffff' : color;
  }
}

function smashCrystalWall(w, hitAng, hooks) {
  w.vanished = true;
  const rMid = w.r + w.thick * 0.5;
  for (let k = 0; k < 4; k++) {
    const a = w.start + ((k + 0.5) / 4) * w.span;
    shatterAt(a, 1.0, (k % 2 === 0) ? '#ffae00' : '#ffe680', rMid, 4);
  }
  playSfx('crystal');
  vibe([16, 18, 22]);
  game.hitStop = 0.032;
  if (game.shake < 6.5) game.shake = 6.5;
  const p = game.player;
  p.radialVel += (w.dir === 1 ? 45 : -45);
  save.coins += 2;
  game.runCoins += 2;
  p.phaseFuel = Math.min(p.phaseMax, p.phaseFuel + 0.35);
  hooks.onCoins();
  const pr = p.orbitR + p.radialBounce;
  addFloatText(Math.cos(hitAng) * pr, Math.sin(hitAng) * pr - 14, '+2 ◈', '#ffd800');
}

function triggerDeath(hitAng) {
  const pal = getDynamicPalette();
  playSfx('shatter');
  vibe([35, 30, 55]);
  game.hitStop = 0.08;
  game.shake = 13;
  shatterAt(hitAng, game.player.scale, pal.accentA);
  if (game.duality.active) {
    shatterAt(normAng(hitAng + Math.PI), game.player.scale, '#00f5ff');
  }
  game.mode = 'dying';
  game.deathTimer = 0.92;
  if (game.runTime > (save.best[game.curLvl.id] || 0)) {
    save.best[game.curLvl.id] = game.runTime;
  }
  persist();
}

function processCloneCollisions(cloneAng, dt, wallSpd, hooks) {
  const p = game.player;
  const pR = p.orbitR + p.radialBounce;
  const halfW = (PLAYER_BASE_W * 0.42 * p.scale) / pR;
  const facingInward = (game.curLvl.id === 4 && game.singularity.orbitFactor > 0.5);
  const noseExtent = PLAYER_BASE_H * 0.44 * p.scale;
  const tailExtent = PLAYER_BASE_H * 0.30 * p.scale;
  const bandMinR = facingInward ? (pR - noseExtent) : (pR - tailExtent);
  const bandMaxR = facingInward ? (pR + tailExtent) : (pR + noseExtent);
  let pushedAng = cloneAng;
  let died = false;

  const walls = game.walls;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (w.vanished) continue;
    if (w.kind === 'phantom' && w.r < 96) continue;

    const effSpd = w.dir === 1 ? wallSpd * 0.80 : wallSpd;
    const relAng = normAng(pushedAng - w.start);
    const f = clamp(relAng / w.span, 0, 1);
    evalWallRadialProfile(w, f, collBounds);
    const innerR = collBounds.rIn;
    const outerR = collBounds.rOut;

    // Near Miss coin bonus
    if (w.kind !== 'crystal' && !w.nearAwarded && !p.phasing) {
      const justPassed = w.dir === -1
        ? (outerR < pR && outerR > pR - effSpd * dt - 8)
        : (innerR > pR && innerR < pR + effSpd * dt + 8);
      if (justPassed) {
        const dStart = Math.abs(angDiff(pushedAng, w.start));
        const dEnd = Math.abs(angDiff(pushedAng, w.start + w.span));
        const nearThresh = halfW + 0.16;
        if ((dStart < nearThresh || dEnd < nearThresh) && !isAngleInArc(pushedAng, w.start, w.span)) {
          w.nearAwarded = true;
          if (p.nearMissCd <= 0) {
            p.nearMissCd = 0.48;
            save.coins += 1;
            game.runCoins += 1;
            hooks.onCoins();
            playSfx('nearmiss');
            const mx = Math.cos(pushedAng) * pR;
            const my = Math.sin(pushedAng) * pR;
            emitSparks(mx, my, Math.cos(pushedAng), Math.sin(pushedAng), 8, '#ffd800', 0.8);
            addFloatText(mx, my - 12, '+1 ◈', '#ffd800');
          }
        }
      }
    }

    if (innerR > bandMaxR || outerR < bandMinR) continue;

    const inCore = isAngleInArc(pushedAng, w.start, w.span);
    const inLeft = isAngleInArc(pushedAng - halfW, w.start, w.span);
    const inRight = isAngleInArc(pushedAng + halfW, w.start, w.span);
    if (!inCore && !inLeft && !inRight) continue;

    if (w.kind === 'crystal') {
      smashCrystalWall(w, pushedAng, hooks);
      continue;
    }

    if (p.phasing || p.grace > 0) continue;

    const dToStart = angDiff(pushedAng, w.start);
    const dToEnd = angDiff(pushedAng, normAng(w.start + w.span));
    const distStart = Math.abs(dToStart);
    const distEnd = Math.abs(dToEnd);
    const sideEdgeMargin = halfW + 0.24;

    const touchingSideEdge = !inCore || distStart < sideEdgeMargin || distEnd < sideEdgeMargin;
    let isAlreadyPastNose = false;
    let isFrontal = false;

    if (w.dir === -1) {
      const prevInnerR = innerR + effSpd * dt;
      isAlreadyPastNose = innerR < pR - 1;
      isFrontal = (prevInnerR >= bandMaxR - 12 || inCore);
    } else {
      const prevOuterR = outerR - effSpd * dt;
      isAlreadyPastNose = outerR > pR + 1;
      isFrontal = (prevOuterR <= bandMinR + 12 || inCore);
    }

    if (isAlreadyPastNose && touchingSideEdge) {
      if (distStart <= distEnd) {
        pushedAng = normAng(w.start - halfW - 0.012);
        p.angVel = Math.min(p.angVel, -0.7);
      } else {
        pushedAng = normAng(w.start + w.span + halfW + 0.012);
        p.angVel = Math.max(p.angVel, 0.7);
      }
      p.radialVel += (w.dir === 1 ? 28 : -32);
      w.hitFlash = 1.0;
      w.vibeOff = (Math.random() < 0.5 ? 1 : -1) * 3.2;
      const sx = Math.cos(pushedAng) * pR;
      const sy = Math.sin(pushedAng) * pR;
      const sgn = distStart <= distEnd ? 1 : -1;
      emitSparks(sx, sy, -Math.sin(pushedAng) * sgn, Math.cos(pushedAng) * sgn, 3, '#ffffff', 0.7);
      if (game.scrapeCooldown <= 0) {
        playSfx('scrape');
        vibe(7);
        game.scrapeCooldown = 0.08;
      }
    } else if (isFrontal) {
      died = true;
      break;
    }
  }

  if (!died && !p.phasing && p.grace <= 0) {
    const lasers = game.lasers;
    for (let i = 0; i < lasers.length; i++) {
      const lz = lasers[i];
      if (lz.state === 'fire' && Math.abs(angDiff(pushedAng, lz.ang)) < lz.halfWidth + halfW * 0.55) {
        died = true;
        break;
      }
    }
  }

  collResult.ang = pushedAng;
  collResult.died = died;
  return collResult;
}

// ===== FIXED TIMESTEP SIMULATION STEP (120 Hz) =====
export function stepSimulation(dt, hooks) {
  if (game.bannerTimer > 0) {
    game.bannerTimer -= dt;
    if (game.bannerTimer <= 0) hooks.onHideBanner();
  }

  // Ambient particles
  const lvl = game.curLvl;
  const sing = game.singularity;
  const particleDir = (lvl.id === 4 && sing.orbitFactor > 0.5) ? -1 : 1;
  const pAngSpd = (lvl.id === 4 ? 0.22 : 0.08) * dt * (lvl.id === 1 ? -1 : 1);
  const bgP = game.bgParticles;
  for (let i = 0; i < bgP.length; i++) {
    const bp = bgP[i];
    bp.r -= bp.spd * dt * (1 + game.chromaAmt * 0.4) * particleDir;
    bp.ang += pAngSpd;
    if (bp.r < CORE_R) {
      bp.r = 440 + Math.random() * 80;
      bp.ang = Math.random() * TAU;
    } else if (bp.r > 520) {
      bp.r = CORE_R + 6;
      bp.ang = Math.random() * TAU;
    }
  }

  // Ripples pool update
  const ripPool = pools.ripples;
  for (let i = ripPool.count - 1; i >= 0; i--) {
    const rp = ripPool.items[i];
    rp.r += 230 * dt;
    rp.alpha -= 0.72 * dt;
    if (rp.alpha <= 0) poolSwapRemove(ripPool, i);
  }

  if (game.mode === 'menu') {
    game.worldRot += 0.28 * dt;
    game.depth3D = lerp(game.depth3D, 0.35, dt * 2);
    game.chromaAmt = lerp(game.chromaAmt, 0, dt * 3);
    const now = performance.now();
    game.camTiltX = Math.sin(now * 0.00065) * 0.26;
    game.camTiltY = Math.cos(now * 0.00048) * 0.15;
    return;
  }

  if (game.hitStop > 0) {
    game.hitStop -= dt;
    return;
  }

  // Sparks pool update
  const spPool = pools.sparks;
  const spDrag = Math.pow(0.18, dt);
  for (let i = spPool.count - 1; i >= 0; i--) {
    const s = spPool.items[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= spDrag;
    s.vy *= spDrag;
    const dist = Math.hypot(s.x, s.y);
    if (dist < CORE_R + 2 && dist > 0.1) {
      const nx = s.x / dist, ny = s.y / dist;
      const dot = s.vx * nx + s.vy * ny;
      if (dot < 0) { s.vx -= 1.8 * dot * nx; s.vy -= 1.8 * dot * ny; }
      s.x = nx * (CORE_R + 3);
      s.y = ny * (CORE_R + 3);
    }
    s.life -= dt;
    if (s.life <= 0) poolSwapRemove(spPool, i);
  }

  // Shards pool update (with core & wall ricochet)
  const shPool = pools.shards;
  const shDrag = Math.pow(0.32, dt);
  const walls = game.walls;
  for (let i = shPool.count - 1; i >= 0; i--) {
    const sh = shPool.items[i];
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    sh.rot += sh.vrot * dt;
    sh.vx *= shDrag;
    sh.vy *= shDrag;
    const dist = Math.hypot(sh.x, sh.y);
    if (dist < CORE_R + sh.sz * 0.6 && dist > 0.1) {
      const nx = sh.x / dist, ny = sh.y / dist;
      const dot = sh.vx * nx + sh.vy * ny;
      if (dot < 0) {
        sh.vx -= 1.75 * dot * nx;
        sh.vy -= 1.75 * dot * ny;
        sh.vrot = -sh.vrot * 0.85;
        emitSparks(sh.x, sh.y, nx, ny, 2, '#ffffff', 0.45);
      }
      sh.x = nx * (CORE_R + sh.sz * 0.65);
      sh.y = ny * (CORE_R + sh.sz * 0.65);
    }
    const shAng = normAng(Math.atan2(sh.y, sh.x));
    for (let j = 0; j < walls.length; j++) {
      const w = walls[j];
      if (w.vanished) continue;
      if (isAngleInArc(shAng, w.start, w.span)) {
        evalWallRadialProfile(w, clamp(normAng(shAng - w.start) / w.span, 0, 1), collBounds);
        if (dist >= collBounds.rIn - sh.sz * 0.5 && dist <= collBounds.rOut + sh.sz * 0.5) {
          const inv = 1 / (dist || 1);
          const nx = sh.x * inv, ny = sh.y * inv;
          const dot = sh.vx * nx + sh.vy * ny;
          const mid = (collBounds.rIn + collBounds.rOut) * 0.5;
          if ((dist < mid && dot > 0) || (dist >= mid && dot < 0)) {
            sh.vx -= 1.7 * dot * nx;
            sh.vy -= 1.7 * dot * ny;
          }
          break;
        }
      }
    }
    sh.life -= dt;
    if (sh.life <= 0) poolSwapRemove(shPool, i);
  }

  // Float text pool update
  const ftPool = pools.floatTexts;
  for (let i = ftPool.count - 1; i >= 0; i--) {
    const ft = ftPool.items[i];
    ft.y -= 28 * dt;
    ft.life -= dt;
    if (ft.life <= 0) poolSwapRemove(ftPool, i);
  }

  game.shake = Math.max(0, game.shake - 32 * dt);

  if (game.mode === 'dying') {
    game.deathTimer -= dt;
    game.worldRot += game.worldSpin * 0.25 * dt;
    if (game.deathTimer <= 0) {
      game.mode = 'over';
      hooks.onGameOver();
    }
    return;
  }
  if (game.mode !== 'play') return;

  // ===== ACTIVE GAMEPLAY =====
  game.runTime += dt;
  const p = game.player;
  if (p.grace > 0) p.grace -= dt;
  if (p.nearMissCd > 0) p.nearMissCd -= dt;
  if (game.scrapeCooldown > 0) game.scrapeCooldown -= dt;

  const t = tr();
  const speedTier = Math.floor(game.runTime / 10);
  if (speedTier > game.lastSpeedTier) {
    game.lastSpeedTier = speedTier;
    if (speedTier === 2 || (speedTier > 2 && speedTier % 3 === 2)) {
      hooks.onBanner(t.bannerChroma, 2.2);
      vibe([18, 26, 30]);
    } else if (speedTier === 3) {
      hooks.onBanner(t.bannerOverdrive, 1.8);
      vibe(24);
    } else if (speedTier === 1 && lvl.id !== 4) {
      hooks.onBanner(t.banner3D, 1.6);
      vibe(16);
    } else if (lvl.id !== 4) {
      hooks.onBanner(t.bannerSpeed(Math.min(40, speedTier * 5)), 1.4);
    }
  }

  // Level 5 Singularity State Machine
  if (lvl.id === 4) {
    sing.coreFlare = Math.max(0, sing.coreFlare - dt * 2.4);
    sing.timer -= dt;
    if (sing.phase === 'inward' && sing.timer <= 0) {
      sing.phase = 'to_outward';
      sing.timer = sing.transDur;
      playSfx('gravity');
      vibe([22, 35, 28]);
      hooks.onBanner(t.bannerOutward, 2.2);
      emitRipple(CORE_R + 4, 0.85);
    } else if (sing.phase === 'to_outward') {
      const prog = 1 - clamp(sing.timer / sing.transDur, 0, 1);
      sing.orbitFactor = smoothstep(prog);
      if (p.grace < 0.3) p.grace = 0.3;
      if (sing.timer <= 0) {
        sing.phase = 'outward';
        sing.orbitFactor = 1;
        sing.timer = 11.0;
        game.lastSafeGapAng = p.ang;
        game.nextRequiredClearance = 0;
      }
    } else if (sing.phase === 'outward' && sing.timer <= 0) {
      sing.phase = 'to_inward';
      sing.timer = sing.transDur;
      playSfx('gravity');
      vibe([22, 30, 22]);
      hooks.onBanner(t.bannerInward, 1.8);
    } else if (sing.phase === 'to_inward') {
      const prog = clamp(sing.timer / sing.transDur, 0, 1);
      sing.orbitFactor = smoothstep(prog);
      if (p.grace < 0.3) p.grace = 0.3;
      if (sing.timer <= 0) {
        sing.phase = 'inward';
        sing.orbitFactor = 0;
        sing.timer = 11.5;
        game.lastSafeGapAng = p.ang;
        game.nextRequiredClearance = 0;
      }
    }
    p.orbitR = lerp(BASE_ORBIT_R, OUTER_ORBIT_R, sing.orbitFactor);
    p.faceRot = Math.PI * sing.orbitFactor;
  } else {
    p.orbitR = BASE_ORBIT_R;
    p.faceRot = 0;
  }

  // Smooth Gradient Flow (20:00–30:00 + every 30s)
  let targetChroma = 0;
  if (game.runTime >= 20.0) {
    const cyc30 = (game.runTime - 20.0) % 30.0;
    if (cyc30 <= 10.0) {
      targetChroma = Math.min(smoothstep(cyc30 / 1.8), smoothstep((10.0 - cyc30) / 1.8));
    }
  }
  game.chromaAmt = lerp(game.chromaAmt, targetChroma, 1 - Math.exp(-3.5 * dt));
  if (game.chromaAmt > 0.01) {
    game.chromaPhase += dt * 1.15;
    hooks.onAccentUpdate(getDynamicPalette().accentA);
  } else if (game.runTime > 19) {
    hooks.onAccentUpdate(lvl.accent);
  }

  // Smooth 3D phases
  let target3D = 0;
  if (lvl.id === 4) {
    target3D = Math.max(0.32 + sing.orbitFactor * 0.56, game.chromaAmt * 0.65);
  } else if (game.runTime >= 10.0 && game.runTime <= 18.8) {
    target3D = Math.min(smoothstep((game.runTime - 10.0) / 1.8), smoothstep((18.8 - game.runTime) / 1.8)) * 0.84;
  } else if (game.runTime > 20.0 && game.runTime < 30.0) {
    target3D = game.chromaAmt * 0.58;
  } else if (game.runTime >= 32.0) {
    const cyc = (game.runTime - 32.0) % 18.0;
    if (cyc < 11.0) {
      target3D = Math.min(smoothstep(cyc / 1.8), smoothstep((11.0 - cyc) / 1.8)) * 0.86;
    }
  }
  game.depth3D = lerp(game.depth3D, target3D, 1 - Math.exp(-3.5 * dt));

  const speedMul = 1 + Math.min(0.40, speedTier * 0.05);
  const wallSpd = lvl.baseSpeed * speedMul;

  // Beat Sequencer
  const effBpm = lvl.bpm * (1 + Math.min(0.12, speedTier * 0.02));
  const stepDur = 60 / effBpm / 2;
  game.beatAccum += dt;
  while (game.beatAccum >= stepDur) {
    game.beatAccum -= stepDur;
    const idx = game.stepIdx % 8;
    if (idx % 2 === 0) {
      playKick(idx === 0);
      game.beatPulse = 1.0;
      if (lvl.id === 0 || lvl.id === 4 || game.chromaAmt > 0.25) {
        emitRipple(CORE_R + 4, 0.42 + game.chromaAmt * 0.2);
      }
    }
    const isLush = game.chromaAmt > 0.25 || (lvl.id === 4 && sing.orbitFactor > 0.5);
    playBass(lvl.notes[idx], stepDur * 0.9, isLush);
    if (isLush && idx % 2 === 1) {
      playShimmerPad(lvl.lead[idx], stepDur);
    }
    if (game.stepIdx % 4 === 2 || game.chromaAmt > 0.35) {
      playHat(game.chromaAmt > 0.35 ? 0.1 : 0.06);
    }
    if (game.runTime >= 30 && idx % 2 === 0) {
      playLead(lvl.lead[idx], stepDur * 0.72);
    }
    game.stepIdx++;
  }
  game.beatPulse = Math.max(0, game.beatPulse - dt * 4.2);

  // Beat Camera
  let tX = 0, tY = 0;
  const rt = game.runTime;
  const d3 = game.depth3D;
  if (lvl.camProfile === 'dive') {
    tX = d3 * 0.48;
    tY = Math.sin(rt * 0.85) * 0.20 * d3;
  } else if (lvl.camProfile === 'bank') {
    tX = d3 * 0.40;
    tY = Math.sin(rt * 1.15) * 0.36 * d3;
  } else if (lvl.camProfile === 'iso') {
    tX = d3 * 0.52;
    tY = Math.cos(rt * 0.8) * 0.32 * d3;
  } else if (lvl.camProfile === 'vortex') {
    tX = d3 * (0.38 + sing.orbitFactor * 0.18);
    tY = Math.sin(rt * 0.75) * 0.24 * d3;
  } else {
    tX = (0.34 + Math.sin(rt * 1.0) * 0.16) * d3;
    tY = Math.cos(rt * 0.9) * 0.34 * d3;
  }
  const camAlpha = 1 - Math.exp(-4.0 * dt);
  game.camTiltX = lerp(game.camTiltX, tX, camAlpha);
  game.camTiltY = lerp(game.camTiltY, tY, camAlpha);
  const orbitZoomBase = lvl.id === 4 ? lerp(1.0, 0.78, sing.orbitFactor) : 1.0;
  const targetZoom = orbitZoomBase + game.beatPulse * 0.028 + game.chromaAmt * 0.03;
  game.camZoom = lerp(game.camZoom, targetZoom, 1 - Math.exp(-7 * dt));
  game.camSway = lerp(game.camSway, Math.sin(rt * 1.8) * 0.018 * (1 + game.beatPulse * 0.65), 1 - Math.exp(-6 * dt));

  // World Rotation
  if (lvl.id === 3) {
    const targetSpin = Math.sin(rt * 0.38) * 0.56 * (1 + Math.min(0.25, speedTier * 0.04));
    game.worldSpin = lerp(game.worldSpin, targetSpin, 1 - Math.exp(-2.4 * dt));
  } else if (lvl.id === 4) {
    const dirFlip = sing.orbitFactor > 0.5 ? -1 : 1;
    const targetSpin = lvl.baseSpin * dirFlip * (1 + Math.min(0.25, speedTier * 0.04));
    game.worldSpin = lerp(game.worldSpin, targetSpin, 1 - Math.exp(-2.2 * dt));
  } else {
    const dirFlip = (lvl.id === 1 && Math.floor(rt / 15) % 2 === 1) ? -1 : 1;
    const targetSpin = lvl.baseSpin * dirFlip * (1 + Math.min(0.3, speedTier * 0.05));
    game.worldSpin = lerp(game.worldSpin, targetSpin, 1 - Math.exp(-2.0 * dt));
  }
  game.worldRot += game.worldSpin * dt;

  // Level 4 Duality Split
  const dual = game.duality;
  if (lvl.id === 3) {
    if (!dual.active) {
      dual.respawnTimer -= dt;
      if (dual.respawnTimer <= 0) {
        dual.active = true;
        dual.splitBlend = 0;
        p.grace = 0.8;
        playSfx('split');
        vibe([18, 22, 22]);
        hooks.onBanner(t.bannerDual, 1.6);
      }
    } else {
      dual.splitBlend = lerp(dual.splitBlend, 1, 1 - Math.exp(-5.0 * dt));
    }
  }

  // Player Controls, Phase Shield & Irreversible Growth
  const inp = getInput();
  const bothHeld = inp.left && inp.right;

  if (bothHeld && p.phaseFuel > 0) {
    p.phasing = true;
    p.phaseFuel = Math.max(0, p.phaseFuel - dt);
    const maxScale = save.perks.stabilizer ? 1.55 : 2.0;
    const usedFrac = 1 - (p.phaseFuel / p.phaseMax);
    const grown = 1.0 + usedFrac * (maxScale - 1.0);
    if (grown > p.scale) p.scale = grown;
  } else {
    p.phasing = false;
  }

  const effTurnSpeed = lvl.id === 4 ? lerp(TURN_SPEED, TURN_SPEED * 0.86, sing.orbitFactor) : TURN_SPEED;
  let targetAngVel = 0;
  if (!bothHeld) {
    if (inp.right) targetAngVel = effTurnSpeed;
    else if (inp.left) targetAngVel = -effTurnSpeed;
  }
  p.angVel = lerp(p.angVel, targetAngVel, 1 - Math.exp(-26 * dt));
  if (Math.abs(p.angVel) < 0.02 && targetAngVel === 0) p.angVel = 0;
  p.ang = normAng(p.ang + p.angVel * dt);

  p.radialVel += (-p.radialBounce * 180 - p.radialVel * 14) * dt;
  p.radialBounce += p.radialVel * dt;

  // Spatial Wave Spawner
  const spawnR = getSpawnRadius();
  if (lvl.id === 4) {
    if (sing.phase === 'inward') {
      if (getOutermostInwardWallOuterR() <= spawnR - game.nextRequiredClearance) {
        spawnFairWave(wallSpd, hooks.onBanner);
      }
    } else if (sing.phase === 'outward') {
      if (getInnermostOutwardWallInnerR() >= CORE_R + game.nextRequiredClearance) {
        spawnFairWave(wallSpd, hooks.onBanner);
      }
    }
  } else if (getOutermostInwardWallOuterR() <= spawnR - game.nextRequiredClearance) {
    spawnFairWave(wallSpd, hooks.onBanner);
  }

  // Update Walls
  const maxCleanupR = spawnR + 90;
  const vibeDecay = Math.pow(0.01, dt);
  for (let i = walls.length - 1; i >= 0; i--) {
    const w = walls[i];
    const effSpd = w.dir === 1 ? wallSpd * 0.80 : wallSpd;
    w.r += w.dir * effSpd * dt;
    w.start = normAng(w.start + w.rotSpd * dt);
    if (w.hitFlash > 0) w.hitFlash = Math.max(0, w.hitFlash - dt * 5);
    w.vibeOff *= vibeDecay;

    if (w.kind === 'phantom' && !w.vanished) {
      if (w.r < 138) {
        if (!w.vanishSfxDone) {
          w.vanishSfxDone = true;
          playSfx('vanish');
        }
        w.phantomAlpha = clamp((w.r - 84) / 54, 0, 1);
        if (Math.random() < 0.45) {
          const pa = w.start + Math.random() * w.span;
          const pr = w.r + Math.random() * w.thick;
          emitSparks(Math.cos(pa) * pr, Math.sin(pa) * pr, Math.cos(pa), Math.sin(pa), 1, Math.random() < 0.45 ? '#ffffff' : lvl.accent, 0.55);
        }
        if (w.r <= 85) {
          w.vanished = true;
          w.phantomAlpha = 0;
        }
      }
    } else if (w.kind === 'split') {
      const osc = Math.sin(rt * 2.6 + w.phase);
      w.span = clamp(w.baseSpan + osc * w.oscAmp, 0.4, Math.PI - 0.96);
      w.start = normAng(w.baseStart - osc * w.oscAmp * 0.5);
    } else if (w.kind === 'breathe') {
      const osc = Math.sin(rt * 2.8 + w.phase);
      w.span = clamp(w.baseSpan + osc * w.oscAmp, 0.42, Math.PI - 0.96);
    }

    if (w.vanished || (w.dir === -1 && w.r + w.thick + (w.turretH || 0) < CORE_R - 8) || (w.dir === 1 && w.r > maxCleanupR)) {
      const last = walls.length - 1;
      if (i !== last) walls[i] = walls[last];
      walls.pop();
    }
  }

  // Level 3 Solar Core Lasers
  if (lvl.id === 2 && rt > 3.5) {
    game.laserTimer -= dt;
    if (game.laserTimer <= 0) {
      const aimAng = normAng(p.ang + (Math.random() - 0.5) * 0.4);
      game.lasers.push({ ang: aimAng, state: 'warn', timer: 1.70, maxWarn: 1.70, ticks: 3, halfWidth: 0.082 });
      game.laserTimer = Math.max(3.6, 5.4 - speedTier * 0.22);
    }
  }
  const lasers = game.lasers;
  for (let i = lasers.length - 1; i >= 0; i--) {
    const lz = lasers[i];
    lz.timer -= dt;
    if (lz.state === 'warn') {
      const remainTicks = Math.ceil(lz.timer / 0.52);
      if (remainTicks < lz.ticks && remainTicks >= 0) {
        lz.ticks = remainTicks;
        playSfx('tick');
      }
      if (lz.timer <= 0) {
        lz.state = 'fire';
        lz.timer = 0.42;
        playSfx('laser');
        if (game.shake < 4.0) game.shake = 4.0;
      }
    } else if (lz.timer <= 0) {
      lasers.splice(i, 1);
    }
  }

  // Coins
  const pR = p.orbitR + p.radialBounce;
  const magnetRange = save.perks.magnet ? 115 : 28 * p.scale;
  const pickDist = 24 * Math.sqrt(p.scale);
  const coins = game.coins;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    const effSpd = c.dir === 1 ? wallSpd * 0.80 : wallSpd;
    c.r += c.dir * effSpd * dt;
    c.pulse += dt * 5;
    const cloneCount = dual.active ? 2 : 1;
    for (let k = 0; k < cloneCount; k++) {
      const a = k === 0 ? p.ang : normAng(p.ang + Math.PI * dual.splitBlend);
      const dx = Math.cos(c.ang) * c.r - Math.cos(a) * pR;
      const dy = Math.sin(c.ang) * c.r - Math.sin(a) * pR;
      const dist = Math.hypot(dx, dy);
      if (save.perks.magnet && dist < magnetRange && dist > 1) {
        c.r = lerp(c.r, pR, dt * 7);
        c.ang = normAng(c.ang + angDiff(a, c.ang) * dt * 8);
      }
      if (dist < pickDist) {
        c.taken = true;
        save.coins += 1;
        game.runCoins += 1;
        hooks.onCoins();
        playSfx('coin');
        vibe(10);
        emitSparks(Math.cos(c.ang) * c.r, Math.sin(c.ang) * c.r, Math.cos(c.ang), Math.sin(c.ang), 10, '#ffd800', 0.85);
        addFloatText(Math.cos(c.ang) * c.r, Math.sin(c.ang) * c.r - 10, '+1 ◈', '#ffd800');
        break;
      }
    }
    if (c.taken || (c.dir === -1 && c.r < CORE_R) || (c.dir === 1 && c.r > maxCleanupR)) {
      const last = coins.length - 1;
      if (i !== last) coins[i] = coins[last];
      coins.pop();
    }
  }

  // Collisions
  if (lvl.id === 3 && dual.active) {
    const angA = p.ang;
    const angB = normAng(p.ang + Math.PI * dual.splitBlend);
    const rA = processCloneCollisions(angA, dt, wallSpd, hooks);
    const outAngA = rA.ang;
    const diedA = rA.died;
    const rB = processCloneCollisions(angB, dt, wallSpd, hooks);
    const outAngB = rB.ang;
    const diedB = rB.died;

    if (diedA && diedB) {
      triggerDeath(angA);
    } else if (diedA || diedB) {
      const hitAng = diedA ? angA : angB;
      const survAng = diedA ? angB : angA;
      playSfx('shatter');
      vibe([25, 25, 20]);
      game.hitStop = 0.06;
      game.shake = 9;
      shatterAt(hitAng, p.scale, diedA ? getDynamicPalette().accentA : '#00f5ff');
      dual.active = false;
      dual.splitBlend = 0;
      dual.respawnTimer = 9.0;
      p.ang = survAng;
      p.grace = 0.9;
      hooks.onBanner(t.bannerCloneLost, 1.7);
    } else {
      if (outAngA !== angA) p.ang = outAngA;
      else if (outAngB !== angB) p.ang = normAng(outAngB - Math.PI * dual.splitBlend);
    }
  } else {
    const res = processCloneCollisions(p.ang, dt, wallSpd, hooks);
    if (res.died) triggerDeath(p.ang);
    else p.ang = res.ang;
  }
}
