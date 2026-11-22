import {
  TAU, VIRTUAL_H, CORE_R,
  clamp, normAng, save, game, pools
} from './state.js';
import { hsl, getDynamicPalette, evalWallRadialProfile, getSpawnRadius } from './levels.js';

let canvas = null;
let ctx = null;
let uiLayer = null;

// ===== PRE-ALLOCATED ZERO-GC VERTEX & PROJECTION BUFFERS =====
const MAX_VERTS = 260;
const topOutX = new Float32Array(MAX_VERTS);
const topOutY = new Float32Array(MAX_VERTS);
const topInX = new Float32Array(MAX_VERTS);
const topInY = new Float32Array(MAX_VERTS);
const botOutX = new Float32Array(MAX_VERTS);
const botOutY = new Float32Array(MAX_VERTS);
const botInX = new Float32Array(MAX_VERTS);
const botInY = new Float32Array(MAX_VERTS);
const proj = { x: 0, y: 0, s: 1 };
const profTmp = { rIn: 0, rOut: 0 };

// Cached projection trig per frame (avoids 1,000+ redundant sin/cos calls per frame!)
let cosRot = 1, sinRot = 0;
let cosTiltX = 1, sinTiltX = 0;
let cosTiltY = 1, sinTiltY = 0;
let halfW = 480, halfH = 270;

function updateProjectionMatrix() {
  const rot = game.worldRot + game.camSway;
  cosRot = Math.cos(rot);
  sinRot = Math.sin(rot);
  cosTiltX = Math.cos(game.camTiltX);
  sinTiltX = Math.sin(game.camTiltX);
  cosTiltY = Math.cos(game.camTiltY);
  sinTiltY = Math.sin(game.camTiltY);
  halfW = game.W * 0.5;
  halfH = game.H * 0.5;
}

function projectInto(wx, wy, wz) {
  const x = wx * cosRot - wy * sinRot;
  const y = wx * sinRot + wy * cosRot;
  const z = wz * game.depth3D;

  const y1 = y * cosTiltX - z * sinTiltX;
  const z1 = y * sinTiltX + z * cosTiltX;

  const x2 = x * cosTiltY + z1 * sinTiltY;
  const z2 = -x * sinTiltY + z1 * cosTiltY;

  const denom = 720 - z2;
  const persp = 720 / (denom < 170 ? 170 : denom);
  const s = persp * game.camZoom * game.arenaScale;
  proj.x = halfW + x2 * s;
  proj.y = halfH + y1 * s;
  proj.s = s;
  return proj;
}

// ===== PRE-RENDERED OFFSCREEN GLOW SPRITE ATLAS (ZERO ctx.shadowBlur PER FRAME!) =====
const glowSprites = {};

function makeGlowSprite(rgb, size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const mid = size * 0.5;
  const grad = g.createRadialGradient(mid, mid, 1, mid, mid, mid);
  grad.addColorStop(0, `rgba(${rgb}, 0.95)`);
  grad.addColorStop(0.32, `rgba(${rgb}, 0.42)`);
  grad.addColorStop(0.7, `rgba(${rgb}, 0.10)`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function drawGlowSprite(sprite, x, y, radius) {
  const d = radius * 2;
  ctx.drawImage(sprite, x - radius, y - radius, d, d);
}

// Cached background radial gradient (rebuilt only on resize or color change!)
let cachedBgGrad = null;
let cachedBgKey = '';

function compareWallR(a, b) {
  return b.r - a.r;
}

export function initRenderer(canvasEl, uiLayerEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d', { alpha: false });
  uiLayer = uiLayerEl;

  glowSprites.gold = makeGlowSprite('255, 216, 0', 64);
  glowSprites.amber = makeGlowSprite('255, 168, 0', 64);
  glowSprites.white = makeGlowSprite('255, 255, 255', 64);
  glowSprites.cyan = makeGlowSprite('0, 245, 255', 64);
  glowSprites.crimson = makeGlowSprite('255, 30, 60', 64);
  glowSprites.violet = makeGlowSprite('202, 78, 255', 64);
  glowSprites.emerald = makeGlowSprite('0, 255, 136', 64);

  resizeViewport();
}

function getLevelGlowSprite(id) {
  if (id === 0) return glowSprites.cyan;
  if (id === 1) return glowSprites.crimson;
  if (id === 2) return glowSprites.gold;
  if (id === 3) return glowSprites.violet;
  return glowSprites.emerald;
}

export function resizeViewport() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  game.vw = vw;
  game.vh = vh;
  game.isRotated = vh > vw;

  if (game.isRotated) {
    game.W = vh;
    game.H = vw;
    // Rotate ONLY the lightweight HTML UI layer; <canvas> itself stays natively unrotated!
    uiLayer.style.width = game.W + 'px';
    uiLayer.style.height = game.H + 'px';
    uiLayer.style.left = ((vw - game.W) * 0.5) + 'px';
    uiLayer.style.top = ((vh - game.H) * 0.5) + 'px';
    uiLayer.style.transform = 'rotate(90deg)';
  } else {
    game.W = vw;
    game.H = vh;
    uiLayer.style.width = vw + 'px';
    uiLayer.style.height = vh + 'px';
    uiLayer.style.left = '0px';
    uiLayer.style.top = '0px';
    uiLayer.style.transform = 'none';
  }

  game.arenaScale = Math.max(0.55, Math.min(1.65, game.H / VIRTUAL_H));
  game.DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(vw * game.DPR);
  canvas.height = Math.round(vh * game.DPR);
  cachedBgKey = '';
}

function drawLevelBackground(pal) {
  const W = game.W;
  const H = game.H;
  const scale = game.arenaScale;
  const lvl = game.curLvl;
  const t = performance.now() * 0.001;

  // Cached base gradient
  const key = `${W}|${H}|${pal.bgInner}|${pal.bgMid}|${pal.bgDeep}`;
  if (key !== cachedBgKey) {
    cachedBgKey = key;
    const grad = ctx.createRadialGradient(W * 0.5, H * 0.5, 16 * scale, W * 0.5, H * 0.5, Math.max(W, H) * 0.74);
    grad.addColorStop(0, pal.bgInner);
    grad.addColorStop(0.55, pal.bgMid);
    grad.addColorStop(1, pal.bgDeep);
    cachedBgGrad = grad;
  }
  ctx.fillStyle = cachedBgGrad;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  // Smooth Gradient Iridescence Aurora Lobes (20:00–30:00 CHROMA FLOW!)
  if (game.chromaAmt > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const orbitR = Math.min(W, H) * 0.34;
    const ph = game.chromaPhase;
    const maxDim = Math.max(W, H);
    const lxs = [
      W * 0.5 + Math.cos(ph * 0.7) * orbitR,
      W * 0.5 + Math.cos(ph * 0.7 + 2.1) * orbitR,
      W * 0.5 + Math.cos(ph * 0.55 + 4.2) * orbitR * 0.8
    ];
    const lys = [
      H * 0.5 + Math.sin(ph * 0.7) * orbitR * 0.75,
      H * 0.5 + Math.sin(ph * 0.7 + 2.1) * orbitR * 0.75,
      H * 0.5 + Math.sin(ph * 0.55 + 4.2) * orbitR * 0.65
    ];
    const lrs = [maxDim * 0.52, maxDim * 0.48, maxDim * 0.45];
    const lcols = [pal.lobe1, pal.lobe2, pal.lobe3];
    for (let i = 0; i < 3; i++) {
      const lg = ctx.createRadialGradient(lxs[i], lys[i], 10, lxs[i], lys[i], lrs[i]);
      lg.addColorStop(0, lcols[i]);
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  ctx.save();
  if (lvl.id === 0) {
    ctx.strokeStyle = hsl(pal.hA, 90, 58, 0.09);
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      projectInto(ca * CORE_R, sa * CORE_R, -12);
      const x1 = proj.x, y1 = proj.y;
      projectInto(ca * 520, sa * 520, -12);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(proj.x, proj.y); ctx.stroke();
    }
  } else if (lvl.id === 1) {
    ctx.strokeStyle = hsl(pal.hA, 90, 56, 0.10);
    ctx.lineWidth = 1;
    for (let rad = 110; rad <= 440; rad += 110) {
      ctx.beginPath();
      for (let s = 0; s <= 40; s++) {
        const a = (s / 40) * TAU;
        projectInto(Math.cos(a) * rad, Math.sin(a) * rad, -10);
        if (s === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
      }
      ctx.closePath(); ctx.stroke();
    }
    const sweepA = t * 1.15;
    projectInto(0, 0, -8);
    ctx.beginPath();
    ctx.moveTo(proj.x, proj.y);
    for (let s = 0; s <= 12; s++) {
      const a = sweepA - (s / 12) * 0.72;
      projectInto(Math.cos(a) * 480, Math.sin(a) * 480, -8);
      ctx.lineTo(proj.x, proj.y);
    }
    ctx.closePath();
    ctx.fillStyle = hsl(pal.hA, 95, 55, 0.085);
    ctx.fill();
  } else if (lvl.id === 2) {
    const drawBgGear = (rad, teeth, rotOff, alpha) => {
      ctx.strokeStyle = pal.accentA;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const total = teeth * 2;
      for (let i = 0; i <= total; i++) {
        const a = rotOff + (i / total) * TAU;
        const rr = rad + ((i & 1) === 0 ? 18 : -6);
        projectInto(Math.cos(a) * rr, Math.sin(a) * rr, -22);
        if (i === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
      }
      ctx.closePath(); ctx.stroke();
    };
    drawBgGear(190, 16, t * 0.25, 0.11);
    drawBgGear(325, 24, -t * 0.18, 0.08);
    projectInto(0, 0, 0);
    ctx.globalAlpha = 0.22;
    drawGlowSprite(glowSprites.gold, proj.x, proj.y, 175 * scale);
  } else if (lvl.id === 3) {
    ctx.strokeStyle = hsl(pal.hB, 90, 62, 0.08);
    ctx.lineWidth = 1.2;
    for (let ring = 1; ring <= 3; ring++) {
      const rad = ring * 135;
      ctx.beginPath();
      for (let s = 0; s <= 6; s++) {
        const a = (s / 6) * TAU + (ring % 2) * 0.52;
        projectInto(Math.cos(a) * rad, Math.sin(a) * rad, -18);
        if (s === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
      }
      ctx.closePath(); ctx.stroke();
    }
    if (game.mode === 'play') {
      const spinDir = game.worldSpin >= 0 ? 1 : -1;
      const indR = CORE_R + 14;
      ctx.strokeStyle = spinDir > 0 ? pal.accentA : '#00f5ff';
      ctx.globalAlpha = 0.35 + Math.abs(game.worldSpin) * 0.45;
      ctx.lineWidth = 2;
      for (let side = 0; side < 2; side++) {
        const base = side * Math.PI + t * spinDir * 1.4;
        ctx.beginPath();
        for (let s = 0; s <= 8; s++) {
          const a = base + (s / 8) * 0.55 * spinDir;
          projectInto(Math.cos(a) * indR, Math.sin(a) * indR, 4);
          if (s === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
        }
        ctx.stroke();
      }
    }
  } else {
    // LEVEL 5: EVENT HORIZON
    const sing = game.singularity;
    projectInto(0, 0, -10);
    ctx.globalAlpha = 0.30 + sing.coreFlare * 0.22;
    drawGlowSprite(glowSprites.emerald, proj.x, proj.y, 235 * scale);

    ctx.globalAlpha = 1;
    ctx.strokeStyle = hsl(pal.hA, 95, 58, 0.11);
    ctx.lineWidth = 1.2;
    const sinTwist = Math.sin(t * 0.7) * 0.32;
    for (let k = 0; k < 8; k++) {
      const baseA = (k / 8) * TAU;
      ctx.beginPath();
      for (let s = 0; s <= 12; s++) {
        const frac = s / 12;
        const r = CORE_R + frac * 440;
        const a = baseA + (sinTwist + sing.orbitFactor * 0.45) * frac;
        projectInto(Math.cos(a) * r, Math.sin(a) * r, -16 - s * 2);
        if (s === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
      }
      ctx.stroke();
    }

    if (game.mode === 'play' && sing.orbitFactor > 0.02) {
      const trackR = game.player.orbitR;
      ctx.strokeStyle = pal.accentA;
      ctx.globalAlpha = 0.28 + sing.orbitFactor * 0.28;
      ctx.lineWidth = 1.8 * scale;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      for (let s = 0; s <= 52; s++) {
        const a = (s / 52) * TAU;
        projectInto(Math.cos(a) * trackR, Math.sin(a) * trackR, 6);
        if (s === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Ripples pool
  const ripPool = pools.ripples;
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = game.chromaAmt > 0.2 ? pal.accentB : pal.accentA;
  for (let i = 0; i < ripPool.count; i++) {
    const rp = ripPool.items[i];
    ctx.globalAlpha = clamp(rp.alpha, 0, 1);
    ctx.beginPath();
    for (let s = 0; s <= 36; s++) {
      const a = (s / 36) * TAU;
      projectInto(Math.cos(a) * rp.r, Math.sin(a) * rp.r, -6);
      if (s === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Ambient particles
  const bgP = game.bgParticles;
  const brightMotes = (lvl.id === 3 || lvl.id === 4 || game.chromaAmt > 0.3) ? 0.78 : 0.42;
  for (let i = 0; i < bgP.length; i++) {
    const bp = bgP[i];
    projectInto(Math.cos(bp.ang) * bp.r, Math.sin(bp.ang) * bp.r, -25);
    ctx.globalAlpha = bp.alpha * brightMotes;
    ctx.fillStyle = (lvl.id === 3 && bp.sz > 2.2) ? '#00f5ff' : (lvl.id === 4 && bp.sz > 2.4 ? '#ffae00' : pal.rim);
    const sz = bp.sz * scale;
    ctx.fillRect(proj.x, proj.y, sz, sz);
  }
  ctx.restore();
}

function drawArchitecturalWall(w, pal) {
  const isGear = (w.kind === 'gear');
  const isPhantom = (w.kind === 'phantom');
  const isCrystal = (w.kind === 'crystal');
  const d3 = game.depth3D;
  const has3D = d3 > 0.04;

  let segs = isGear
    ? Math.max(10, Math.ceil(w.span * 12))
    : (w.profile === 'bastion' || w.profile === 'fortress' || w.profile === 'notch' || w.profile === 'prism')
      ? Math.max(24, Math.ceil(w.span * 24))
      : Math.max(10, Math.ceil(w.span * 15));
  if (segs >= MAX_VERTS) segs = MAX_VERTS - 1;

  const zTop = w.height3D;
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const a = w.start + f * w.span;
    evalWallRadialProfile(w, f, profTmp);
    let rIn = profTmp.rIn;
    let rOut = profTmp.rOut;
    if (isGear) {
      const tooth = ((i & 1) === 0 ? 7.5 : -2.5);
      rOut += tooth;
      rIn += tooth * 0.35;
    }
    const ca = Math.cos(a), sa = Math.sin(a);
    projectInto(ca * rOut, sa * rOut, zTop);
    topOutX[i] = proj.x; topOutY[i] = proj.y;
    projectInto(ca * rIn, sa * rIn, zTop);
    topInX[i] = proj.x; topInY[i] = proj.y;
    if (has3D) {
      projectInto(ca * rOut, sa * rOut, 0);
      botOutX[i] = proj.x; botOutY[i] = proj.y;
      projectInto(ca * rIn, sa * rIn, 0);
      botInX[i] = proj.x; botInY[i] = proj.y;
    }
  }

  let alpha = 1;
  let subtleGlitchRim = false;
  if (isPhantom) {
    alpha = clamp(w.phantomAlpha, 0, 1);
    if (w.r < 185 && w.r >= 138) {
      if (Math.sin(game.runTime * 22 + w.start * 3) > 0.65) {
        alpha = 0.88;
        subtleGlitchRim = true;
      }
    } else if (w.r < 138) {
      subtleGlitchRim = true;
    }
  }

  let fillTop = pal.accentA;
  let fillSide = pal.sideA;
  let rimStroke = pal.rim;

  if (isCrystal) {
    const gCrys = ctx.createLinearGradient(topOutX[0], topOutY[0], topOutX[segs], topOutY[segs]);
    gCrys.addColorStop(0, '#ff9800');
    gCrys.addColorStop(0.5, '#ffe875');
    gCrys.addColorStop(1, '#ff9800');
    fillTop = gCrys;
    fillSide = '#8f4b00';
    rimStroke = '#fff8d6';
  } else if (w.hitFlash > 0.05) {
    fillTop = '#ffffff';
    rimStroke = '#ffffff';
  } else if (game.chromaAmt > 0.03) {
    const gTop = ctx.createLinearGradient(topOutX[0], topOutY[0], topOutX[segs], topOutY[segs]);
    gTop.addColorStop(0, pal.accentA);
    gTop.addColorStop(0.5, pal.accentB);
    gTop.addColorStop(1, pal.accentA);
    fillTop = gTop;

    const gSide = ctx.createLinearGradient(topOutX[0], topOutY[0], topOutX[segs], topOutY[segs]);
    gSide.addColorStop(0, pal.sideA);
    gSide.addColorStop(0.5, pal.sideB);
    gSide.addColorStop(1, pal.sideA);
    fillSide = gSide;
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  if (has3D) {
    ctx.fillStyle = fillSide;
    ctx.beginPath();
    ctx.moveTo(botInX[0], botInY[0]);
    for (let i = 1; i <= segs; i++) ctx.lineTo(botInX[i], botInY[i]);
    for (let i = segs; i >= 0; i--) ctx.lineTo(topInX[i], topInY[i]);
    ctx.closePath(); ctx.fill();

    ctx.beginPath();
    ctx.moveTo(botOutX[0], botOutY[0]);
    for (let i = 1; i <= segs; i++) ctx.lineTo(botOutX[i], botOutY[i]);
    for (let i = segs; i >= 0; i--) ctx.lineTo(topOutX[i], topOutY[i]);
    ctx.closePath(); ctx.fill();

    ctx.beginPath();
    ctx.moveTo(botInX[0], botInY[0]); ctx.lineTo(botOutX[0], botOutY[0]);
    ctx.lineTo(topOutX[0], topOutY[0]); ctx.lineTo(topInX[0], topInY[0]);
    ctx.closePath(); ctx.fill();

    ctx.beginPath();
    ctx.moveTo(botInX[segs], botInY[segs]); ctx.lineTo(botOutX[segs], botOutY[segs]);
    ctx.lineTo(topOutX[segs], topOutY[segs]); ctx.lineTo(topInX[segs], topInY[segs]);
    ctx.closePath(); ctx.fill();
  }

  // Fast sprite halo behind smashable Amber Crystals (replaces heavy shadowBlur!)
  if (isCrystal) {
    const mid = segs >> 1;
    const gx = (topInX[mid] + topOutX[mid]) * 0.5;
    const gy = (topInY[mid] + topOutY[mid]) * 0.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 * alpha;
    drawGlowSprite(glowSprites.amber, gx, gy, 54 * game.arenaScale);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
  }

  // Top Cap
  ctx.beginPath();
  ctx.moveTo(topOutX[0], topOutY[0]);
  for (let i = 1; i <= segs; i++) ctx.lineTo(topOutX[i], topOutY[i]);
  for (let i = segs; i >= 0; i--) ctx.lineTo(topInX[i], topInY[i]);
  ctx.closePath();
  ctx.fillStyle = fillTop;
  ctx.fill();

  // Diagonal crystalline fracture lines across smashable Amber Crystals
  if (isCrystal) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.6 * game.arenaScale;
    const step = Math.max(2, Math.floor(segs / 5));
    ctx.beginPath();
    for (let i = 1; i < segs - 1; i += step) {
      const j = Math.min(segs, i + Math.max(1, Math.floor(step * 0.7)));
      ctx.moveTo(topInX[i], topInY[i]); ctx.lineTo(topOutX[j], topOutY[j]);
      ctx.moveTo(topOutX[i], topOutY[i]); ctx.lineTo(topInX[j], topInY[j]);
    }
    ctx.stroke();
  }

  // Leading-edge crisp rim highlight
  const rX = w.dir === 1 ? topOutX : topInX;
  const rY = w.dir === 1 ? topOutY : topInY;
  ctx.beginPath();
  ctx.moveTo(rX[0], rY[0]);
  for (let i = 1; i <= segs; i++) ctx.lineTo(rX[i], rY[i]);
  ctx.strokeStyle = subtleGlitchRim ? '#ffffff' : rimStroke;
  ctx.lineWidth = (subtleGlitchRim || isCrystal ? 2.2 : (1.5 + d3 * 0.8)) * game.arenaScale;
  ctx.stroke();

  ctx.restore();
}

// Pre-allocated glyph screen vertices (Zero-GC!)
const gX = new Float32Array(5);
const gY = new Float32Array(5);
const M_PTS = [[-0.95, -0.75], [-0.72, 0.95], [0, 0.05], [0.72, 0.95], [0.95, -0.75]];

function drawSkinLetter(ang, scale, pal, isPhasing, isCloneB) {
  const p = game.player;
  const r = p.orbitR + p.radialBounce;
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const vx = -uy, vy = ux;
  const sz = 9.5 * scale;
  const d3 = game.depth3D;

  if (d3 > 0.08) {
    projectInto(ux * r, uy * r, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, sz * 0.72 * proj.s, 0, TAU);
    ctx.fill();
  }

  const zLift = 12 * d3;
  const cf = Math.cos(p.faceRot), sf = Math.sin(p.faceRot);
  const projectLocal = (lx, ly, idx) => {
    const rx = lx * cf - ly * sf;
    const ry = lx * sf + ly * cf;
    projectInto(ux * r + vx * rx * sz + ux * ry * sz, uy * r + vy * rx * sz + uy * ry * sz, zLift);
    gX[idx] = proj.x;
    gY[idx] = proj.y;
  };

  ctx.save();
  const baseAlpha = isPhasing
    ? (0.68 + Math.sin(game.runTime * 28) * 0.22)
    : (p.grace > 0 && (Math.floor(game.runTime * 18) & 1) === 0 ? 0.45 : 1);

  // Fast offscreen glow halo behind player (replaces expensive shadowBlur!)
  projectInto(ux * r, uy * r, zLift);
  const cx = proj.x, cy = proj.y, cs = proj.s;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (isPhasing ? 0.65 : 0.42) * baseAlpha;
  drawGlowSprite(isPhasing ? glowSprites.white : (isCloneB ? glowSprites.cyan : getLevelGlowSprite(game.curLvl.id)), cx, cy, sz * 2.2 * cs);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = baseAlpha;

  ctx.strokeStyle = isPhasing ? '#ffffff' : (isCloneB ? '#00f5ff' : pal.rim);
  ctx.lineWidth = Math.max(2.2, 2.6 * Math.sqrt(scale) * game.arenaScale);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';

  const skin = save.skin || 'M';
  if (skin === 'M') {
    for (let i = 0; i < 5; i++) projectLocal(M_PTS[i][0], M_PTS[i][1], i);
    ctx.beginPath();
    ctx.moveTo(gX[0], gY[0]);
    for (let i = 1; i < 5; i++) ctx.lineTo(gX[i], gY[i]);
    ctx.stroke();
  } else if (skin === 'A') {
    projectLocal(-0.85, -0.8, 0);
    projectLocal(0, 1.05, 1);
    projectLocal(0.85, -0.8, 2);
    projectLocal(-0.46, -0.15, 3);
    projectLocal(0.46, -0.15, 4);
    ctx.beginPath();
    ctx.moveTo(gX[0], gY[0]); ctx.lineTo(gX[1], gY[1]); ctx.lineTo(gX[2], gY[2]);
    ctx.moveTo(gX[3], gY[3]); ctx.lineTo(gX[4], gY[4]);
    ctx.stroke();
  } else {
    projectLocal(-0.82, -0.82, 0);
    projectLocal(0.82, 0.88, 1);
    projectLocal(0.82, -0.82, 2);
    projectLocal(-0.82, 0.88, 3);
    ctx.beginPath();
    ctx.moveTo(gX[0], gY[0]); ctx.lineTo(gX[1], gY[1]);
    ctx.moveTo(gX[2], gY[2]); ctx.lineTo(gX[3], gY[3]);
    ctx.stroke();
  }

  if (isPhasing) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, sz * 1.45 * cs, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLevelCore(pal) {
  const lvl = game.curLvl;
  const d3 = game.depth3D;
  const scale = game.arenaScale;
  const coreZ = 18 * d3;
  const flare = lvl.id === 4 ? game.singularity.coreFlare : 0;
  const coreR = CORE_R + game.beatPulse * 2.5 + flare * 5;
  const coreSteps = 44;

  if (d3 > 0.06) {
    ctx.fillStyle = lvl.id === 4 ? '#000000' : pal.sideA;
    ctx.beginPath();
    for (let i = 0; i <= coreSteps; i++) {
      const a = (i / coreSteps) * TAU;
      projectInto(Math.cos(a) * CORE_R, Math.sin(a) * CORE_R, 0);
      if (i === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.save();
  // Level 5 blazing photon halo via sprite (Zero shadowBlur!)
  if (lvl.id === 4) {
    projectInto(0, 0, coreZ);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42 + flare * 0.45;
    drawGlowSprite(flare > 0.35 ? glowSprites.white : glowSprites.emerald, proj.x, proj.y, (coreR + 28) * proj.s);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  if (lvl.id === 2) {
    const tot = 24;
    for (let i = 0; i <= tot; i++) {
      const a = (i / tot) * TAU + game.runTime * 0.6;
      const rr = coreR + ((i & 1) === 0 ? 4.5 : -1.5);
      projectInto(Math.cos(a) * rr, Math.sin(a) * rr, coreZ);
      if (i === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
    }
  } else {
    for (let i = 0; i <= coreSteps; i++) {
      const a = (i / coreSteps) * TAU;
      projectInto(Math.cos(a) * coreR, Math.sin(a) * coreR, coreZ);
      if (i === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = lvl.id === 4 ? '#000000' : pal.bgDeep;
  ctx.fill();

  if (lvl.id === 4) {
    ctx.strokeStyle = flare > 0.35 ? '#ffffff' : pal.accentA;
    ctx.lineWidth = (4.5 + flare * 2) * scale;
    ctx.stroke();
  } else if (lvl.id === 3) {
    for (let half = 0; half < 2; half++) {
      ctx.beginPath();
      for (let i = 0; i <= 22; i++) {
        const a = half * Math.PI + (i / 22) * Math.PI;
        projectInto(Math.cos(a) * coreR, Math.sin(a) * coreR, coreZ);
        if (i === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
      }
      ctx.strokeStyle = half === 0 ? pal.accentA : '#00f5ff';
      ctx.lineWidth = 4.2 * scale;
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = pal.accentA;
    ctx.lineWidth = 4.2 * scale;
    ctx.stroke();
  }

  if (lvl.id === 1) {
    ctx.strokeStyle = hsl(pal.hA, 95, 58, 0.55);
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI * 0.5;
      const ca = Math.cos(a), sa = Math.sin(a);
      projectInto(ca * (CORE_R - 11), sa * (CORE_R - 11), coreZ);
      const x1 = proj.x, y1 = proj.y;
      projectInto(ca * (CORE_R - 3), sa * (CORE_R - 3), coreZ);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(proj.x, proj.y); ctx.stroke();
    }
  }

  if (game.mode === 'play') {
    const p = game.player;
    const frac = p.phaseFuel / p.phaseMax;
    if (frac > 0.01) {
      const rG = CORE_R - 7.5;
      const gSteps = Math.max(4, Math.ceil(frac * 36));
      ctx.beginPath();
      for (let i = 0; i <= gSteps; i++) {
        const a = -Math.PI * 0.5 + (i / gSteps) * frac * TAU;
        projectInto(Math.cos(a) * rG, Math.sin(a) * rG, coreZ);
        if (i === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
      }
      ctx.strokeStyle = p.phasing ? '#ffffff' : 'rgba(255,255,255,0.48)';
      ctx.lineWidth = 2.4 * scale;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawFrame() {
  const pal = getDynamicPalette();
  const scale = game.arenaScale;

  // Native Canvas orientation transform (ZERO CSS rotation lag on portrait mobile screens!)
  ctx.setTransform(game.DPR, 0, 0, game.DPR, 0, 0);
  if (game.isRotated) {
    ctx.translate(game.vw, 0);
    ctx.rotate(Math.PI * 0.5);
  }

  ctx.save();
  if (game.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }

  updateProjectionMatrix();
  drawLevelBackground(pal);

  // 3D Depth Tunnel Rings
  if (game.depth3D > 0.04) {
    ctx.save();
    ctx.strokeStyle = game.chromaAmt > 0.15 ? pal.accentB : pal.accentA;
    ctx.lineWidth = 1.2;
    for (let k = 1; k <= 5; k++) {
      const zDepth = -k * 65 * game.depth3D;
      const rad = 110 + k * 75;
      ctx.globalAlpha = (0.14 - k * 0.02) * game.depth3D;
      ctx.beginPath();
      for (let s = 0; s <= 36; s++) {
        const a = (s / 36) * TAU;
        projectInto(Math.cos(a) * rad, Math.sin(a) * rad, zDepth);
        if (s === 0) ctx.moveTo(proj.x, proj.y); else ctx.lineTo(proj.x, proj.y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // In-place outer-to-inner Z-sort (Zero-GC!)
  const walls = game.walls;
  walls.sort(compareWallR);
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (!w.vanished) drawArchitecturalWall(w, pal);
  }

  // Level 3 Solar Core Lasers (using offscreen glow sprites — Zero shadowBlur!)
  const lasers = game.lasers;
  if (lasers.length > 0) {
    const maxR = getSpawnRadius() + 40;
    for (let i = 0; i < lasers.length; i++) {
      const lz = lasers[i];
      ctx.save();
      if (lz.state === 'warn') {
        const prog = 1 - clamp(lz.timer / lz.maxWarn, 0, 1);
        const spread = (1 - prog) * 0.14 + lz.halfWidth;
        ctx.strokeStyle = prog > 0.72 ? '#ffffff' : pal.accentA;
        ctx.globalAlpha = 0.35 + prog * 0.55;
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 1.6 + prog * 1.2;
        for (let s = -1; s <= 1; s += 2) {
          const a = lz.ang + s * spread;
          const ca = Math.cos(a), sa = Math.sin(a);
          projectInto(ca * CORE_R, sa * CORE_R, 14);
          const x1 = proj.x, y1 = proj.y;
          projectInto(ca * maxR, sa * maxR, 14);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(proj.x, proj.y); ctx.stroke();
        }
        ctx.setLineDash([]);
        projectInto(Math.cos(lz.ang) * (CORE_R + 3), Math.sin(lz.ang) * (CORE_R + 3), 18);
        const ox = proj.x, oy = proj.y;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.75;
        drawGlowSprite(glowSprites.gold, ox, oy, (12 + prog * 16) * scale);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ox, oy, (3 + prog * 7) * scale, 0, TAU);
        ctx.fill();
      } else {
        const aL = lz.ang - lz.halfWidth;
        const aR = lz.ang + lz.halfWidth;
        projectInto(Math.cos(aL) * CORE_R, Math.sin(aL) * CORE_R, 20);
        const x1 = proj.x, y1 = proj.y;
        projectInto(Math.cos(aL) * maxR, Math.sin(aL) * maxR, 20);
        const x2 = proj.x, y2 = proj.y;
        projectInto(Math.cos(aR) * maxR, Math.sin(aR) * maxR, 20);
        const x3 = proj.x, y3 = proj.y;
        projectInto(Math.cos(aR) * CORE_R, Math.sin(aR) * CORE_R, 20);
        const x4 = proj.x, y4 = proj.y;

        // Outer additive golden aura pass
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = pal.accentA;
        ctx.lineWidth = 10 * scale;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo((x1 + x4) * 0.5, (y1 + y4) * 0.5);
        ctx.lineTo((x2 + x3) * 0.5, (y2 + y3) * 0.5);
        ctx.stroke();

        // Crisp white plasma core
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  // Coins (fast glow sprite + crisp diamond — Zero shadowBlur!)
  const coins = game.coins;
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    projectInto(Math.cos(c.ang) * c.r, Math.sin(c.ang) * c.r, 16);
    const sz = (7.2 + Math.sin(c.pulse) * 1.4) * proj.s;
    const cx = proj.x, cy = proj.y;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    drawGlowSprite(glowSprites.gold, cx, cy, sz * 2.1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.translate(cx, cy);
    ctx.rotate(c.pulse * 0.5);
    ctx.fillStyle = '#ffd800';
    ctx.beginPath();
    ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.78, 0); ctx.lineTo(0, sz); ctx.lineTo(-sz * 0.78, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawLevelCore(pal);

  // Level 4 Duality Neon Tether
  const dual = game.duality;
  const p = game.player;
  if (game.mode === 'play' && game.curLvl.id === 3 && dual.active) {
    const angA = p.ang;
    const angB = normAng(p.ang + Math.PI * dual.splitBlend);
    const rP = p.orbitR + p.radialBounce;
    projectInto(Math.cos(angA) * rP, Math.sin(angA) * rP, 12);
    const ax = proj.x, ay = proj.y;
    projectInto(Math.cos(angB) * rP, Math.sin(angB) * rP, 12);
    ctx.save();
    ctx.strokeStyle = '#00f5ff';
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2.0 * scale;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(proj.x, proj.y); ctx.stroke();
    ctx.restore();
  }

  // Player(s)
  if (game.mode === 'play' || game.mode === 'menu') {
    drawSkinLetter(p.ang, p.scale, pal, p.phasing, false);
    if (game.mode === 'play' && game.curLvl.id === 3 && dual.active) {
      drawSkinLetter(normAng(p.ang + Math.PI * dual.splitBlend), p.scale, pal, p.phasing, true);
    }
  }

  // Pooled Sparks
  const spPool = pools.sparks;
  if (spPool.count > 0) {
    ctx.save();
    for (let i = 0; i < spPool.count; i++) {
      const s = spPool.items[i];
      projectInto(s.x, s.y, 12);
      ctx.globalAlpha = clamp(s.life / s.maxLife, 0, 1);
      ctx.fillStyle = s.color;
      const d = s.size * scale;
      ctx.fillRect(proj.x - d * 0.5, proj.y - d * 0.5, d, d);
    }
    ctx.restore();
  }

  // Pooled Shards
  const shPool = pools.shards;
  if (shPool.count > 0) {
    for (let i = 0; i < shPool.count; i++) {
      const sh = shPool.items[i];
      projectInto(sh.x, sh.y, 14);
      ctx.save();
      ctx.globalAlpha = clamp(sh.life / sh.maxLife, 0, 1);
      ctx.translate(proj.x, proj.y);
      ctx.rotate(sh.rot);
      ctx.fillStyle = sh.color;
      const sz = sh.sz * scale;
      ctx.beginPath();
      ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.75, sz * 0.65); ctx.lineTo(-sz * 0.75, sz * 0.45);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // Pooled Floating +1/+2 Coin Texts
  const ftPool = pools.floatTexts;
  if (ftPool.count > 0) {
    ctx.save();
    ctx.font = `900 ${Math.round(13 * scale)}px Montserrat, sans-serif`;
    ctx.textAlign = 'center';
    for (let i = 0; i < ftPool.count; i++) {
      const ft = ftPool.items[i];
      projectInto(ft.x, ft.y, 18);
      ctx.globalAlpha = clamp(ft.life / ft.maxLife, 0, 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, proj.x, proj.y);
    }
    ctx.restore();
  }

  ctx.restore();
}
