// hud.js — Solmara HUD: health, wanted stars, cash, clock, speed, objective,
// message feed, crosshair, and a live canvas minimap.
// Plain ES module. DOM + canvas only, no assets, no network.
// createHUD() -> { update(state), showMessage(text), setObjective(text),
//                  setMission(title), flash(text) }
// state = { health, wanted, money, speed, clock,
//           minimap: { player, cars, police, peds, marker, north },
//           screen: { armed } }
// speed is null/undefined when on foot (speedometer hides). clock is a
// "HH:MM" string or { h, m }. minimap entries are { x, z } world coords,
// player may also carry heading (radians).

const MAP_SIZE = 180;
const WORLD_MIN = -400;
const WORLD_MAX = 400;

const CSS = [
  '#solmara-hud{position:fixed;inset:0;pointer-events:none;z-index:50;',
  'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;',
  'text-shadow:0 1px 3px rgba(0,0,0,.8);user-select:none}',
  '#solmara-hud .hud-top-left{position:absolute;top:14px;left:16px;display:flex;flex-direction:column;gap:6px}',
  '#solmara-hud .hud-health{display:flex;align-items:center;gap:8px}',
  '#solmara-hud .hud-label{font-size:11px;font-weight:700;letter-spacing:1px;opacity:.85}',
  '#solmara-hud .hud-bar{width:170px;height:12px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.35);border-radius:6px;overflow:hidden}',
  '#solmara-hud .hud-bar-fill{height:100%;width:100%;background:#4ade80;border-radius:6px;transition:width .15s linear,background .3s}',
  '#solmara-hud .hud-stars{font-size:22px;letter-spacing:3px;line-height:1}',
  '#solmara-hud .hud-stars .on{color:#facc15}',
  '#solmara-hud .hud-stars .off{color:rgba(255,255,255,.35)}',
  '#solmara-hud .hud-top-right{position:absolute;top:14px;right:16px;text-align:right;display:flex;flex-direction:column;gap:2px}',
  '#solmara-hud .hud-money{font-size:26px;font-weight:800;color:#4ade80}',
  '#solmara-hud .hud-clock{font-size:15px;font-weight:600;opacity:.9}',
  '#solmara-hud .hud-objective-wrap{position:absolute;top:14px;left:50%;transform:translateX(-50%);text-align:center;max-width:46vw}',
  '#solmara-hud .hud-mission{font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#facc15}',
  '#solmara-hud .hud-objective{font-size:15px;font-weight:600;background:rgba(0,0,0,.45);border-radius:6px;padding:4px 12px;margin-top:4px;display:inline-block}',
  '#solmara-hud .hud-objective:empty{display:none}',
  '#solmara-hud .hud-speed{position:absolute;right:18px;bottom:18px;text-align:right}',
  '#solmara-hud .hud-speed-num{font-size:42px;font-weight:800;line-height:1}',
  '#solmara-hud .hud-speed-unit{font-size:12px;font-weight:700;letter-spacing:1px;opacity:.8}',
  '#solmara-hud .hud-minimap{position:absolute;left:16px;bottom:16px;width:180px;height:180px}',
  '#solmara-hud .hud-minimap canvas{width:180px;height:180px;border-radius:50%;border:2px solid rgba(255,255,255,.45);background:rgba(8,12,20,.78);display:block}',
  '#solmara-hud .hud-north{position:absolute;top:2px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:800;color:#facc15}',
  '#solmara-hud .hud-feed{position:absolute;left:210px;bottom:20px;max-width:38vw;display:flex;flex-direction:column-reverse;gap:4px}',
  '#solmara-hud .hud-msg{background:rgba(0,0,0,.55);border-left:3px solid #facc15;border-radius:4px;padding:5px 10px;font-size:14px;font-weight:600;animation:hudMsgIn .18s ease-out}',
  '#solmara-hud .hud-msg.fading{opacity:0;transition:opacity .6s}',
  '@keyframes hudMsgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
  '#solmara-hud .hud-crosshair{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:22px;font-weight:400;opacity:.9;display:none}',
  '#solmara-hud .hud-flash{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);font-size:44px;font-weight:900;letter-spacing:4px;color:#facc15;text-align:center;opacity:0;white-space:nowrap}',
  '#solmara-hud .hud-flash.show{animation:hudFlash 1.8s ease-out forwards}',
  '@keyframes hudFlash{0%{opacity:0;transform:translate(-50%,-50%) scale(.85)}15%{opacity:1;transform:translate(-50%,-50%) scale(1)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.05)}}',
].join('\n');

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

function formatClock(clock) {
  if (typeof clock === 'string') return clock;
  if (clock && typeof clock === 'object') {
    const h = typeof clock.h === 'number' ? clock.h : (typeof clock.hour === 'number' ? clock.hour : 0);
    const m = typeof clock.m === 'number' ? clock.m : (typeof clock.minute === 'number' ? clock.minute : 0);
    return String(((h % 24) + 24) % 24).padStart(2, '0') + ':' + String(((m % 60) + 60) % 60).padStart(2, '0');
  }
  return '';
}

function formatMoney(money) {
  const n = typeof money === 'number' && isFinite(money) ? Math.floor(money) : 0;
  return '$' + n.toLocaleString('en-US');
}

export function createHUD() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el('div', null, document.body);
  root.id = 'solmara-hud';

  // Top-left: health bar + wanted stars.
  const topLeft = el('div', 'hud-top-left', root);
  const healthRow = el('div', 'hud-health', topLeft);
  el('span', 'hud-label', healthRow).textContent = 'HEALTH';
  const bar = el('div', 'hud-bar', healthRow);
  const barFill = el('div', 'hud-bar-fill', bar);
  const stars = el('div', 'hud-stars', topLeft);

  // Top-right: cash + clock.
  const topRight = el('div', 'hud-top-right', root);
  const moneyEl = el('div', 'hud-money', topRight);
  const clockEl = el('div', 'hud-clock', topRight);

  // Top-center: mission title + objective.
  const objWrap = el('div', 'hud-objective-wrap', root);
  const missionEl = el('div', 'hud-mission', objWrap);
  const objectiveEl = el('div', 'hud-objective', objWrap);

  // Bottom-right: speedometer (hidden on foot).
  const speedEl = el('div', 'hud-speed', root);
  const speedNum = el('div', 'hud-speed-num', speedEl);
  const speedUnit = el('div', 'hud-speed-unit', speedEl);
  speedUnit.textContent = 'KM/H';
  speedEl.style.display = 'none';

  // Bottom-left: minimap.
  const mapWrap = el('div', 'hud-minimap', root);
  const canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  mapWrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const northEl = el('div', 'hud-north', mapWrap);
  northEl.textContent = 'N';

  // Message feed.
  const feed = el('div', 'hud-feed', root);

  // Crosshair + flash text.
  const crosshair = el('div', 'hud-crosshair', root);
  crosshair.textContent = '+';
  const flashEl = el('div', 'hud-flash', root);

  // Cached values so update() only touches the DOM on change.
  let lastHealth = -1;
  let lastWanted = -1;
  let lastMoney = '';
  let lastClock = '';
  let lastSpeed = -2;
  let lastObjective = null;
  let lastArmed = null;

  function drawMinimap(map) {
    if (!ctx || !map) return;
    const w = MAP_SIZE;
    const h = MAP_SIZE;
    const range = WORLD_MAX - WORLD_MIN;
    const toMapX = (x) => ((x - WORLD_MIN) / range) * w;
    const toMapY = (z) => ((z - WORLD_MIN) / range) * h;

    ctx.clearRect(0, 0, w, h);

    // City blocks: faint street grid every 100 world units.
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 5;
    for (let g = -300; g <= 300; g += 100) {
      ctx.beginPath(); ctx.moveTo(toMapX(g), 0); ctx.lineTo(toMapX(g), h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, toMapY(g)); ctx.lineTo(w, toMapY(g)); ctx.stroke();
    }
    // Ring road.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, (300 / range) * w, 0, Math.PI * 2);
    ctx.stroke();

    function dot(x, z, r, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toMapX(x), toMapY(z), r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (Array.isArray(map.peds)) {
      for (const p of map.peds) {
        if (p && typeof p.x === 'number') dot(p.x, p.z || 0, 1.5, 'rgba(180,180,180,0.8)');
      }
    }
    if (Array.isArray(map.cars)) {
      for (const c of map.cars) {
        if (c && typeof c.x === 'number') dot(c.x, c.z || 0, 2.5, '#ffffff');
      }
    }
    if (Array.isArray(map.police)) {
      for (const c of map.police) {
        if (c && typeof c.x === 'number') dot(c.x, c.z || 0, 3, '#f43f5e');
      }
    }
    if (map.marker && typeof map.marker.x === 'number') {
      const mx = toMapX(map.marker.x);
      const my = toMapY(map.marker.z || 0);
      const pulse = 6 + 2 * Math.sin(performance.now() / 240);
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse);
      ctx.lineTo(mx + pulse, my);
      ctx.lineTo(mx, my + pulse);
      ctx.lineTo(mx - pulse, my);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (map.player && typeof map.player.x === 'number') {
      const px = toMapX(map.player.x);
      const py = toMapY(map.player.z || 0);
      const heading = typeof map.player.heading === 'number' ? map.player.heading : 0;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(heading);
      ctx.fillStyle = '#4ade80';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  return {
    update(state) {
      if (!state) return;

      if (typeof state.health === 'number') {
        const hp = Math.max(0, Math.min(100, Math.round(state.health)));
        if (hp !== lastHealth) {
          lastHealth = hp;
          barFill.style.width = hp + '%';
          barFill.style.background = hp > 50 ? '#4ade80' : hp > 25 ? '#facc15' : '#ef4444';
        }
      }

      if (typeof state.wanted === 'number') {
        const w = Math.max(0, Math.min(5, Math.round(state.wanted)));
        if (w !== lastWanted) {
          lastWanted = w;
          let html = '';
          for (let i = 0; i < 5; i++) {
            html += i < w
              ? '<span class="on">&#9733;</span>'
              : '<span class="off">&#9734;</span>';
          }
          stars.innerHTML = html;
        }
      }

      if (typeof state.money === 'number') {
        const m = formatMoney(state.money);
        if (m !== lastMoney) { lastMoney = m; moneyEl.textContent = m; }
      }

      if (state.clock !== undefined) {
        const c = formatClock(state.clock);
        if (c !== lastClock) { lastClock = c; clockEl.textContent = c; }
      }

      if (state.speed === null || state.speed === undefined) {
        if (lastSpeed !== -2) { lastSpeed = -2; speedEl.style.display = 'none'; }
      } else {
        const s = Math.max(0, Math.round(state.speed));
        if (s !== lastSpeed) {
          lastSpeed = s;
          speedEl.style.display = 'block';
          speedNum.textContent = String(s);
        }
      }

      const armed = !!(state.armed || (state.screen && state.screen.armed));
      if (armed !== lastArmed) {
        lastArmed = armed;
        crosshair.style.display = armed ? 'block' : 'none';
      }

      if (state.minimap) drawMinimap(state.minimap);
    },

    showMessage(text) {
      if (!text) return;
      const msg = el('div', 'hud-msg', feed);
      msg.textContent = String(text);
      // Prune oldest first, clearing their pending timers so no timer ever
      // fires on a detached node.
      while (feed.children.length > 5) {
        const old = feed.firstChild;
        if (old._hudTimers) old._hudTimers.forEach((t) => clearTimeout(t));
        feed.removeChild(old);
      }
      const t1 = setTimeout(() => {
        msg.classList.add('fading');
        const t2 = setTimeout(() => { if (msg.parentNode) msg.parentNode.removeChild(msg); }, 650);
        msg._hudTimers = [t2];
      }, 6000);
      msg._hudTimers = [t1];
    },

    setObjective(text) {
      const t = text == null ? '' : String(text);
      if (t === lastObjective) return;
      lastObjective = t;
      objectiveEl.textContent = t;
    },

    setMission(title) {
      missionEl.textContent = title == null ? '' : String(title);
      if (title) this.flash(String(title));
    },

    flash(text) {
      if (!text) return;
      flashEl.textContent = String(text);
      flashEl.classList.remove('show');
      void flashEl.offsetWidth; // restart the animation
      flashEl.classList.add('show');
    },
  };
}
