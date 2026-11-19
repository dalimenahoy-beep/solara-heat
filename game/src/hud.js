// Everything flat laid over the 3D world: Lupe's phone with the current objective, the
// money and the wanted stars, health and arrest bars, the speedometer, centre prompts and
// toasts, and the round minimap — a street plan painted once, with live blips for Marco,
// the law and the job drawn over it each frame.

import { AXES, CITY_EDGE, SHORE_X } from './config.js';

const MAP_SIZE = 392;
const MAP_SCALE = MAP_SIZE / 640;
const MAP_CENTRE = { x: 10, z: 0 };

function worldToMap(x, z) {
  return {
    x: MAP_SIZE / 2 + (x - MAP_CENTRE.x) * MAP_SCALE,
    y: MAP_SIZE / 2 + (z - MAP_CENTRE.z) * MAP_SCALE,
  };
}

function clampToMap(p) {
  return {
    x: Math.max(10, Math.min(MAP_SIZE - 10, p.x)),
    y: Math.max(10, Math.min(MAP_SIZE - 10, p.y)),
  };
}

/** The unchanging street plan: grass, beach, sea, avenues and their dashed hearts. */
function paintBaseMap() {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const g = canvas.getContext('2d');
  g.fillStyle = '#5d7350';
  g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  const shore = worldToMap(SHORE_X, 0).x;
  g.fillStyle = '#14708e';
  g.fillRect(shore, 0, MAP_SIZE - shore, MAP_SIZE);
  g.fillStyle = '#eed9a4';
  const beachStart = worldToMap(CITY_EDGE, 0).x;
  g.fillRect(beachStart, 0, shore - beachStart, MAP_SIZE);
  for (const pass of [{ style: '#3a3a42', width: 15 * MAP_SCALE + 3, dash: [] }, { style: '#e8e4d2', width: 1, dash: [5, 5] }]) {
    g.strokeStyle = pass.style;
    g.lineWidth = pass.width;
    g.setLineDash(pass.dash);
    for (const a of AXES) {
      const h1 = worldToMap(-CITY_EDGE - 20, a);
      const h2 = worldToMap(CITY_EDGE + 20, a);
      g.beginPath(); g.moveTo(h1.x, h1.y); g.lineTo(h2.x, h2.y); g.stroke();
      const v1 = worldToMap(a, -CITY_EDGE - 20);
      const v2 = worldToMap(a, CITY_EDGE + 20);
      g.beginPath(); g.moveTo(v1.x, v1.y); g.lineTo(v2.x, v2.y); g.stroke();
    }
  }
  g.setLineDash([]);
  return canvas;
}

export function createHud() {
  const el = (id) => document.getElementById(id);
  const phoneFrom = el('phoneFrom');
  const objective = el('objective');
  const objectiveMeta = el('objectiveMeta');
  const moneyEl = el('money');
  const starsEl = el('stars');
  const healthBar = el('healthBar');
  const bustWrap = el('bustWrap');
  const bustBar = el('bustBar');
  const speedo = el('speedo');
  const prompt = el('prompt');
  const toastEl = el('toast');
  const bannerEl = el('banner');
  const bannerTitle = el('bannerTitle');
  const bannerSub = el('bannerSub');
  const vignette = el('vignette');
  const sirenwash = el('sirenwash');
  const mapCtx = el('minimap').getContext('2d');
  const baseMap = paintBaseMap();

  let clock = 0;
  let toastUntil = 0;
  let bannerUntil = 0;
  let shownObjective = '';
  let shownMeta = '';

  return {
    /** The phone: who is talking, what they want, and the numbers under it. */
    setObjective(from, text, meta) {
      phoneFrom.textContent = from;
      if (text !== shownObjective) { objective.textContent = text; shownObjective = text; }
      if (meta !== shownMeta) { objectiveMeta.textContent = meta; shownMeta = meta; }
    },
    setMoney(amount) {
      moneyEl.textContent = `$${Math.round(amount).toLocaleString('en-US')}`;
    },
    setStars(count) {
      let html = '';
      for (let i = 0; i < 5; i += 1) html += i < count ? '★' : '<span class="off">★</span>';
      starsEl.innerHTML = html;
    },
    setHealth(frac) {
      healthBar.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    },
    /** The arrest meter: shown only while the cuffs are actually coming out, 0..1. */
    setBust(frac) {
      if (frac > 0.01) {
        bustWrap.style.display = 'block';
        bustBar.style.width = `${Math.min(1, frac) * 100}%`;
      } else {
        bustWrap.style.display = 'none';
      }
    },
    /** Speedometer while driving; pass null on foot to hide it. */
    setSpeed(kmh) {
      speedo.innerHTML = kmh === null ? '' : `${Math.round(kmh)} <small>KM/H</small>`;
    },
    showPrompt(html) {
      if (html) {
        prompt.innerHTML = html;
        prompt.style.display = 'block';
      } else {
        prompt.style.display = 'none';
      }
    },
    toast(text) {
      toastEl.textContent = text;
      toastEl.style.opacity = '1';
      toastUntil = clock + 2.6;
    },
    banner(title, sub) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      bannerEl.style.display = 'block';
      bannerUntil = clock + 3.4;
    },
    /** Red edge glow while Marco is freshly hurt, 0..1. */
    setDamageGlow(amount) { vignette.style.opacity = String(Math.max(0, Math.min(1, amount))); },
    /** Blue edge wash while the law is close, 0..1. */
    setSirenGlow(amount) { sirenwash.style.opacity = String(Math.max(0, Math.min(1, amount))); },
    /** Toast and banner lifetimes. */
    update(dt) {
      clock += dt;
      if (toastUntil && clock > toastUntil) { toastEl.style.opacity = '0'; toastUntil = 0; }
      if (bannerUntil && clock > bannerUntil) { bannerEl.style.display = 'none'; bannerUntil = 0; }
    },
    /**
     * The minimap: street plan first, then the job's pulsing marker (clamped to the rim
     * when it is off the chart), flashing police blips, and Marco's arrow.
     * view = { x, z, heading, cops: [{x, z}], target: {x, z} | null }
     */
    drawMinimap(view) {
      const g = mapCtx;
      g.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
      g.drawImage(baseMap, 0, 0);
      if (view.target) {
        const p = clampToMap(worldToMap(view.target.x, view.target.z));
        const pulse = 7 + Math.sin(clock * 5) * 2;
        g.fillStyle = '#ffd23e';
        g.beginPath(); g.arc(p.x, p.y, pulse, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#7a5b00';
        g.lineWidth = 2;
        g.stroke();
      }
      const redPhase = Math.floor(clock * 2.4) % 2 === 0;
      for (const cop of view.cops) {
        const p = clampToMap(worldToMap(cop.x, cop.z));
        g.fillStyle = redPhase ? '#ff2a2a' : '#2a6bff';
        g.beginPath(); g.arc(p.x, p.y, 5, 0, Math.PI * 2); g.fill();
      }
      const p = worldToMap(view.x, view.z);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(Math.PI - view.heading);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#14202e';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(6, 7);
      g.lineTo(0, 3.4);
      g.lineTo(-6, 7);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    },
  };
}
