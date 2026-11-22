import {
  BASE_ORBIT_R, LEVELS, SKINS, PERKS,
  save, persist, tr, game, clearPools
} from './state.js';
import { formatTime, getMedal } from './i18n.js';
import { ensureAudio, playSfx, vibe } from './audio.js';
import { initInput, clearInput } from './input.js';
import { stepSimulation } from './physics.js';
import { initRenderer, resizeViewport, drawFrame } from './renderer.js';

// ===== DOM REFERENCES =====
const canvas = document.getElementById('game');
const uiLayer = document.getElementById('uiLayer');
const timerBox = document.getElementById('timerBox');
const hudTopLeft = document.getElementById('hudTopLeft');
const bestHud = document.getElementById('bestHud');
const coinHud = document.getElementById('coinHud');
const eventBanner = document.getElementById('eventBanner');
const menuOverlay = document.getElementById('menuOverlay');
const shopModal = document.getElementById('shopModal');
const settingsModal = document.getElementById('settingsModal');
const overOverlay = document.getElementById('overOverlay');
const installBtn = document.getElementById('installBtn');

// ===== PWA REGISTRATION & INSTALL =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.style.display = 'inline-block';
});
installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try { await deferredInstallPrompt.userChoice; } catch (_) {}
  deferredInstallPrompt = null;
  installBtn.style.display = 'none';
});
window.addEventListener('appinstalled', () => {
  installBtn.style.display = 'none';
});

// ===== THEME & LOCALIZED UI =====
let lastAccentCss = '';
function setAccentCss(color) {
  if (color === lastAccentCss) return;
  lastAccentCss = color;
  document.documentElement.style.setProperty('--accent', color);
}

function applyTheme(lvl) {
  document.documentElement.style.setProperty('--bg', lvl.bg);
  setAccentCss(lvl.accent);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', lvl.bgDeep);
}

function renderSettingsButtons() {
  document.getElementById('langRuBtn').classList.toggle('active', save.lang === 'ru');
  document.getElementById('langEnBtn').classList.toggle('active', save.lang === 'en');
  document.getElementById('soundOnBtn').classList.toggle('active', !!save.sound);
  document.getElementById('soundOffBtn').classList.toggle('active', !save.sound);
  document.getElementById('vibeOnBtn').classList.toggle('active', !!save.vibe);
  document.getElementById('vibeOffBtn').classList.toggle('active', !save.vibe);
}

function renderMenu() {
  const t = tr();
  document.getElementById('menuCoins').textContent = `◈ ${save.coins}`;
  const grid = document.getElementById('levelsGrid');
  grid.innerHTML = '';
  LEVELS.forEach((lvl, idx) => {
    const best = save.best[idx] || 0;
    const med = getMedal(best);
    const card = document.createElement('div');
    card.className = 'lvlCard' + (idx === save.selectedLevel ? ' selected' : '');
    card.style.setProperty('--c', lvl.accent);
    const rightTop = (lvl.isNew && best < 1)
      ? `<span class="lvlBadge">${t.newTag}</span>`
      : `<span class="medal ${med}"></span>`;
    card.innerHTML = `
      <div class="lvlNum"><span>${lvl.num}</span>${rightTop}</div>
      <div>
        <div class="lvlName">${lvl.name[save.lang]}</div>
        <div class="lvlTag">${lvl.tag[save.lang]}</div>
      </div>
      <div class="lvlFoot">
        <span>${t.best}</span>
        <span>${formatTime(best)}</span>
      </div>
    `;
    card.onclick = () => {
      ensureAudio();
      save.selectedLevel = idx;
      game.curLvl = lvl;
      applyTheme(lvl);
      persist();
      renderMenu();
    };
    grid.appendChild(card);
  });
}

function renderShop() {
  const t = tr();
  document.getElementById('shopCoins').textContent = `◈ ${save.coins}`;
  const sRow = document.getElementById('skinsRow');
  sRow.innerHTML = '';
  SKINS.forEach((s) => {
    const owned = save.ownedSkins.includes(s.id);
    const active = save.skin === s.id;
    const el = document.createElement('div');
    el.className = 'shopItem' + (owned ? ' owned' : '') + (active ? ' active' : '');
    el.innerHTML = `
      <div class="skinGlyph">${s.id}</div>
      <div class="priceTag">${active ? t.equipped : owned ? t.equip : `◈ ${s.price}`}</div>
    `;
    el.onclick = () => {
      ensureAudio();
      if (owned) {
        save.skin = s.id;
        playSfx('coin');
      } else if (save.coins >= s.price) {
        save.coins -= s.price;
        save.ownedSkins.push(s.id);
        save.skin = s.id;
        playSfx('split');
      } else {
        playSfx('scrape');
      }
      persist();
      renderShop();
      renderMenu();
    };
    sRow.appendChild(el);
  });

  const pRow = document.getElementById('perksRow');
  pRow.innerHTML = '';
  PERKS.forEach((p) => {
    const owned = !!save.perks[p.id];
    const meta = t.perksMeta[p.id];
    const el = document.createElement('div');
    el.className = 'shopItem' + (owned ? ' active' : '');
    el.innerHTML = `
      <div class="perkName">${meta.name}</div>
      <div class="perkSub">${meta.sub}</div>
      <div class="priceTag">${owned ? t.active : `◈ ${p.price}`}</div>
    `;
    el.onclick = () => {
      ensureAudio();
      if (!owned && save.coins >= p.price) {
        save.coins -= p.price;
        save.perks[p.id] = true;
        playSfx('split');
        persist();
        renderShop();
        renderMenu();
      } else if (!owned) {
        playSfx('scrape');
      }
    };
    pRow.appendChild(el);
  });
}

function applyLanguageUI() {
  const t = tr();
  document.documentElement.lang = save.lang;
  document.getElementById('playBtn').textContent = t.play;
  document.getElementById('pauseBackBtn').textContent = t.menu;
  document.getElementById('overMenuBtn').textContent = t.menu;
  document.getElementById('retryBtn').textContent = t.retry;
  document.getElementById('shopOpenBtn').textContent = t.shop;
  document.getElementById('settingsOpenBtn').textContent = t.settings;
  document.getElementById('installBtn').textContent = t.install;
  document.getElementById('shopTitle').textContent = t.shop;
  document.getElementById('shopCloseBtn').textContent = t.close;
  document.getElementById('skinsLabel').textContent = t.skins;
  document.getElementById('perksLabel').textContent = t.perks;
  document.getElementById('settingsTitle').textContent = t.settings;
  document.getElementById('settingsCloseBtn').textContent = t.close;
  document.getElementById('setLangLabel').textContent = t.setLang;
  document.getElementById('setSoundLabel').textContent = t.setSound;
  document.getElementById('setVibeLabel').textContent = t.setVibe;
  document.getElementById('soundOnBtn').textContent = t.on;
  document.getElementById('soundOffBtn').textContent = t.off;
  document.getElementById('vibeOnBtn').textContent = t.on;
  document.getElementById('vibeOffBtn').textContent = t.off;
  document.getElementById('hintTurn').textContent = t.hintTurn;
  document.getElementById('hintPhase').textContent = t.hintPhase;
  renderSettingsButtons();
  renderMenu();
  renderShop();
}

function showBanner(text, dur = 1.9) {
  eventBanner.textContent = text;
  eventBanner.classList.add('show');
  game.bannerTimer = dur;
}

function openMenu() {
  game.mode = 'menu';
  game.chromaAmt = 0;
  game.singularity.orbitFactor = 0;
  game.player.orbitR = BASE_ORBIT_R;
  game.player.faceRot = 0;
  applyTheme(game.curLvl);
  clearInput();
  timerBox.style.display = 'none';
  hudTopLeft.style.display = 'none';
  overOverlay.classList.add('hidden');
  shopModal.classList.add('hidden');
  settingsModal.classList.add('hidden');
  menuOverlay.classList.remove('hidden');
  eventBanner.classList.remove('show');
  renderMenu();
}

let lastTimerText = '';
let lastBestText = '';

function startRun(lvlIdx) {
  const lvl = LEVELS[lvlIdx] || LEVELS[0];
  game.curLvl = lvl;
  applyTheme(lvl);
  game.mode = 'play';
  game.runTime = 0;
  game.runCoins = 0;
  game.worldRot = 0;
  game.worldSpin = lvl.baseSpin;
  game.shake = 0;
  game.hitStop = 0;
  game.deathTimer = 0;
  game.lastSpeedTier = 0;
  game.scrapeCooldown = 0;
  game.depth3D = 0;
  game.chromaAmt = 0;
  game.chromaPhase = 0;
  game.camTiltX = 0;
  game.camTiltY = 0;
  game.camZoom = 1;
  game.camSway = 0;
  game.beatAccum = 0;
  game.stepIdx = 0;
  game.beatPulse = 0;

  const p = game.player;
  p.ang = -Math.PI / 2;
  p.angVel = 0;
  p.orbitR = BASE_ORBIT_R;
  p.faceRot = 0;
  p.radialBounce = 0;
  p.radialVel = 0;
  p.scale = 1.0;
  p.phaseMax = save.perks.phasePlus ? 4.0 : 3.0;
  p.phaseFuel = p.phaseMax;
  p.phasing = false;
  p.nearMissCd = 0;
  p.grace = 0.65;

  game.duality.active = false;
  game.duality.splitBlend = 0;
  game.duality.respawnTimer = 5.0;

  game.singularity.phase = 'inward';
  game.singularity.timer = 9.5;
  game.singularity.orbitFactor = 0;
  game.singularity.coreFlare = 0;
  game.singularity.crystalHintShown = false;

  game.walls.length = 0;
  game.coins.length = 0;
  game.lasers.length = 0;
  clearPools();
  game.laserTimer = 4.6;
  game.patternCount = 0;
  game.lastSafeGapAng = p.ang;
  game.nextRequiredClearance = 0;

  clearInput();
  menuOverlay.classList.add('hidden');
  shopModal.classList.add('hidden');
  settingsModal.classList.add('hidden');
  overOverlay.classList.add('hidden');
  timerBox.style.display = 'block';
  hudTopLeft.style.display = 'flex';
  lastTimerText = '0:00';
  timerBox.textContent = lastTimerText;
  lastBestText = `${tr().best}: ${formatTime(save.best[lvl.id] || 0)}`;
  bestHud.textContent = lastBestText;
  coinHud.textContent = `◈ ${save.coins}`;
  showBanner(`${lvl.num} · ${lvl.name[save.lang]}`, 1.6);
}

// ===== SIMULATION UI HOOKS =====
const simHooks = {
  onBanner: (text, dur) => showBanner(text, dur),
  onHideBanner: () => eventBanner.classList.remove('show'),
  onCoins: () => { coinHud.textContent = `◈ ${save.coins}`; },
  onAccentUpdate: (col) => setAccentCss(col),
  onGameOver: () => {
    const t = tr();
    const lvl = game.curLvl;
    document.getElementById('overLevel').textContent = `${lvl.num} · ${lvl.name[save.lang]}`;
    document.getElementById('overTime').textContent = formatTime(game.runTime);
    document.getElementById('overBest').textContent = `${t.best} ${formatTime(save.best[lvl.id] || 0)}`;
    document.getElementById('overRunCoins').textContent = `+${game.runCoins} ◈`;
    overOverlay.classList.remove('hidden');
  }
};

// ===== BUTTONS & VIEWPORT EVENTS =====
document.getElementById('playBtn').onclick = () => { ensureAudio(); startRun(save.selectedLevel); };
document.getElementById('retryBtn').onclick = () => { ensureAudio(); startRun(game.curLvl.id); };
document.getElementById('overMenuBtn').onclick = () => openMenu();
document.getElementById('pauseBackBtn').onclick = () => openMenu();
document.getElementById('shopOpenBtn').onclick = () => { ensureAudio(); renderShop(); shopModal.classList.remove('hidden'); };
document.getElementById('shopCloseBtn').onclick = () => shopModal.classList.add('hidden');
document.getElementById('settingsOpenBtn').onclick = () => { ensureAudio(); renderSettingsButtons(); settingsModal.classList.remove('hidden'); };
document.getElementById('settingsCloseBtn').onclick = () => settingsModal.classList.add('hidden');

document.getElementById('langRuBtn').onclick = () => { save.lang = 'ru'; persist(); applyLanguageUI(); };
document.getElementById('langEnBtn').onclick = () => { save.lang = 'en'; persist(); applyLanguageUI(); };
document.getElementById('soundOnBtn').onclick = () => { save.sound = true; ensureAudio(); persist(); renderSettingsButtons(); };
document.getElementById('soundOffBtn').onclick = () => { save.sound = false; persist(); renderSettingsButtons(); };
document.getElementById('vibeOnBtn').onclick = () => { save.vibe = true; vibe(15); persist(); renderSettingsButtons(); };
document.getElementById('vibeOffBtn').onclick = () => { save.vibe = false; persist(); renderSettingsButtons(); };

window.addEventListener('resize', resizeViewport);
window.addEventListener('orientationchange', () => setTimeout(resizeViewport, 80));

// ===== BOOTSTRAP & FIXED TIMESTEP 120 Hz LOOP =====
initRenderer(canvas, uiLayer);
initInput(canvas, {
  onRetry: () => { ensureAudio(); startRun(game.curLvl.id); },
  onEscape: () => openMenu()
});
applyTheme(game.curLvl);
applyLanguageUI();

const FIXED_DT = 1 / 120;
let accumulator = 0;
let lastTs = performance.now();

function frame(ts) {
  const frameDt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000));
  lastTs = ts;
  accumulator += frameDt;

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 6) {
    stepSimulation(FIXED_DT, simHooks);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === 6) accumulator = 0;

  // Update DOM HUD only when formatted string changes (Zero redundant DOM writes!)
  if (game.mode === 'play') {
    const tStr = formatTime(game.runTime);
    if (tStr !== lastTimerText) {
      lastTimerText = tStr;
      timerBox.textContent = tStr;
    }
    if (game.runTime > (save.best[game.curLvl.id] || 0)) {
      const bStr = `${tr().best}: ${tStr}`;
      if (bStr !== lastBestText) {
        lastBestText = bStr;
        bestHud.textContent = bStr;
      }
    }
  }

  drawFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
