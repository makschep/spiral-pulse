export const I18N = {
  ru: {
    play: 'ИГРАТЬ',
    menu: 'МЕНЮ',
    retry: 'ЗАНОВО',
    shop: 'МАГАЗИН',
    settings: 'НАСТРОЙКИ',
    close: 'ЗАКРЫТЬ',
    install: 'УСТАНОВИТЬ',
    best: 'РЕКОРД',
    newTag: 'НОВЫЙ',
    skins: 'СКИНЫ',
    perks: 'УЛУЧШЕНИЯ',
    equipped: 'ВЫБРАН',
    equip: 'ВЫБРАТЬ',
    active: 'АКТИВНО',
    on: 'ВКЛ',
    off: 'ВЫКЛ',
    hintTurn: 'УДЕРЖ. Л / П: ПОВОРОТ',
    hintPhase: 'Л + П: ФАЗОВЫЙ ЩИТ',
    setLang: 'ЯЗЫК / LANGUAGE',
    setSound: 'ЗВУК И МУЗЫКА',
    setVibe: 'ВИБРАЦИЯ',
    banner3D: '3D-РЕЖИМ · УСКОРЕНИЕ',
    bannerChroma: 'ГРАДИЕНТ-ПОТОК',
    bannerOverdrive: 'ФОРСАЖ',
    bannerSpeed: (p) => `СКОРОСТЬ +${p}%`,
    bannerDual: 'ДВОЙНОЙ КЛОН',
    bannerCloneLost: 'КЛОН РАЗБИТ · 9 СЕК',
    bannerOutward: 'ОБРАТНАЯ ОРБИТА · ВЫБРОС ЯДРА',
    bannerInward: 'ВОЗВРАТ В ЯДРО',
    bannerCrystalHint: 'ТАРАНЬ ЯНТАРНЫЕ КРИСТАЛЛЫ!',
    perksMeta: {
      magnet: { name: 'МАГНИТ', sub: 'ПРИТЯГИВАЕТ МОНЕТЫ' },
      phasePlus: { name: 'ФАЗА+', sub: 'ЩИТ НА 4.0 СЕК' },
      stabilizer: { name: 'СТАБИЛИЗАТОР', sub: 'РОСТ ДО 1.55X' }
    }
  },
  en: {
    play: 'PLAY',
    menu: 'MENU',
    retry: 'RETRY',
    shop: 'SHOP',
    settings: 'SETTINGS',
    close: 'CLOSE',
    install: 'INSTALL',
    best: 'BEST',
    newTag: 'NEW',
    skins: 'SKINS',
    perks: 'PERKS',
    equipped: 'EQUIPPED',
    equip: 'EQUIP',
    active: 'ACTIVE',
    on: 'ON',
    off: 'OFF',
    hintTurn: 'HOLD L / R: TURN',
    hintPhase: 'HOLD L + R: PHASE SHIELD',
    setLang: 'LANGUAGE / ЯЗЫК',
    setSound: 'SOUND & MUSIC',
    setVibe: 'VIBRATION',
    banner3D: '3D PHASE · SPEED UP',
    bannerChroma: 'CHROMA FLOW',
    bannerOverdrive: 'OVERDRIVE',
    bannerSpeed: (p) => `SPEED +${p}%`,
    bannerDual: 'DUAL CLONE ACTIVE',
    bannerCloneLost: 'CLONE LOST · 9S',
    bannerOutward: 'ANTI-GRAVITY ORBIT · CORE ERUPTION',
    bannerInward: 'CORE DIVE',
    bannerCrystalHint: 'SMASH AMBER CRYSTALS!',
    perksMeta: {
      magnet: { name: 'MAGNET', sub: 'PULLS COINS' },
      phasePlus: { name: 'PHASE+', sub: '4.0S SHIELD' },
      stabilizer: { name: 'STABILIZER', sub: 'MAX 1.55X SIZE' }
    }
  }
};

export function formatTime(t) {
  const secs = Math.floor(t);
  const cs = Math.floor((t - secs) * 100);
  return `${secs}:${cs < 10 ? '0' : ''}${cs}`;
}

export function getMedal(t) {
  if (t >= 45) return 'gold';
  if (t >= 30) return 'silver';
  if (t >= 15) return 'bronze';
  return '';
}
