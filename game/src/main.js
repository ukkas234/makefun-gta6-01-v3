// game/src/main.js — Solmara (gta6-01), builder E: main glue.
// Boot + fixed 1/60 s loop + screens + car enter/exit/steal + wanted +
// busted/wasted + missions glue + save/load + HUD + game clock + shots mode.
// Exports nothing. Plain ES modules, no build step, no network requests.
//
// MODULE CONTRACTS — as the modules actually export them (integration):
//   config.js: named constants (CITY, ROAD_LINES, COAST, COLORS, BALANCE).
//     No CONFIG object; cfg() below falls back to its defaults.
//   random.js: mulberry32(seed) -> rng() returning [0, 1).
//   textures.js: individual canvas-texture factories; city.js builds its
//     own set, so main passes no textures around (createTextures: none).
//   city.js: createCity(scene, rng) -> city { colliders, roadGraph,
//     spawnPoints, isOnRoad, nearestRoadPoint, collideCircle, buildings }.
//     Spawns come from city.spawnPoints (no playerSpawn/policeStation).
//   render.js: createWorld3D(canvas) -> world { scene, camera, renderer,
//     setTimeOfDay(t) with t a 0..1 day fraction, update(dt) renders }.
//     No render()/resize()/addCar(); meshes are added to world.scene.
//   input.js: createInput(canvas) -> input { keys:Set, pressed(code),
//     consumeClick(), mouseDX/DY, update() }.
//   player.js: createPlayer(scene, city) -> player { mesh, x, z, heading,
//     speed, health, onFoot, car, update(dt, input, city), setPosition }.
//     Main drives movement itself (see updatePlayer) and only uses the
//     player's mesh/fields; player.update() is NOT called (it would
//     double-move the player and fight main's E handling).
//   vehicles.js: createVehicles({scene, city, rng}) -> vehicles
//     { spawnCar(opts), spawnParked(n), update(), cars[] }.
//     car: {mesh, x, z, heading, speed, type, color, isPlayer, isPolice}.
//   traffic.js: createTraffic(scene, city, count) -> traffic
//     { cars[] (live getter), update(dt, playerPos), nearestCar(x,z,d),
//       removeCar(car), spawn(n) }. AI cars have hasDriver = true.
//   police.js: createPolice(scene, city) -> police
//     { wanted (getter), cars[] (live getter), addWanted(n), setWanted(n),
//       update(dt, player, cars) -> {busted}, reset(), clear(), spawn(x,z,h),
//       removeCar(car), nearestCopDist(x,z) }.
//   missions.js: createMissionManager(game) -> missions
//     { active, list(), isComplete(), completedCount, completedIds,
//       foundPackageIds, available(), start(index), update(dt) }.
//     game: { player, city, traffic, police, hud, audio, save,
//       setObjective, addMoney, showMessage, spawnMarker, clearMarker }.
//     update() returns nothing; completion is detected in tick() by
//     watching active/completedCount. Rewards arrive via game.addMoney.
//   hud.js: createHUD() builds its OWN overlay duplicating index.html's
//     HUD, so main does NOT instantiate it; the DOM HUD in index.html is
//     driven by refreshHUD()/flashMessage() below.
//   audio.js: createAudio() -> audio { setMuted(b), play(name), resume(),
//     siren(on), setEngineSpeed(r), engine(), shot(), pickup(), sting() }.
//   save.js: loadSave() / saveSave(data) — no arguments; SAVE_KEY is fixed.
//   stageShot(name, game) (shots.js) — see game context built below.

import * as configMod from './config.js';
import * as randomMod from './random.js';
import * as texturesMod from './textures.js';
import * as cityMod from './city.js';
import * as renderMod from './render.js';
import * as inputMod from './input.js';
import * as playerMod from './player.js';
import * as vehiclesMod from './vehicles.js';
import * as trafficMod from './traffic.js';
import * as policeMod from './police.js';
import * as missionsMod from './missions.js';
import * as hudMod from './hud.js';
import * as audioMod from './audio.js';
import * as saveMod from './save.js';
import { stageShot } from './shots.js';

function pick(mod, names) {
  for (const n of names) {
    if (typeof mod[n] === 'function') return mod[n];
  }
  if (typeof mod.default === 'function') return mod.default;
  return null;
}
function need(fn, label) {
  if (typeof fn !== 'function') throw new Error('Solmara: missing factory ' + label);
  return fn;
}

const CONFIG = (configMod.CONFIG && typeof configMod.CONFIG === 'object')
  ? configMod.CONFIG
  : (configMod.default && typeof configMod.default === 'object' ? configMod.default : {});
const cfg = (key, fallback) => (CONFIG[key] !== undefined ? CONFIG[key] : fallback);

const createWorld3D = need(pick(renderMod, ['createWorld3D']), 'render.createWorld3D');
const createInput = need(pick(inputMod, ['createInput']), 'input.createInput');
const createPlayer = need(pick(playerMod, ['createPlayer']), 'player.createPlayer');
const createVehicles = need(pick(vehiclesMod, ['createVehicles', 'createVehicleManager']), 'vehicles.createVehicles');
const createTraffic = need(pick(trafficMod, ['createTraffic']), 'traffic.createTraffic');
const createPolice = need(pick(policeMod, ['createPolice']), 'police.createPolice');
const createMissionManager = need(pick(missionsMod, ['createMissionManager']), 'missions.createMissionManager');
const createCity = need(pick(cityMod, ['createCity', 'buildCity']), 'city.createCity');
const createTextures = pick(texturesMod, ['createTextures', 'loadTextures']);
const createRng = pick(randomMod, ['createRng', 'createRandom', 'mulberry32', 'seededRandom']);
const createHUD = pick(hudMod, ['createHUD']);
const createAudio = pick(audioMod, ['createAudio']);
const loadSaveFn = pick(saveMod, ['loadSave']);
const saveSaveFn = pick(saveMod, ['saveSave']);

// ---------- Constants ----------
const STEP = 1 / 60;
const SAVE_KEY = 'solmara-save-v1';
const DAY_SECONDS = cfg('DAY_SECONDS', 720); // one full in-game day = 12 real minutes
const START_MONEY = cfg('START_MONEY', 200);
const BUSTED_FINE = cfg('BUSTED_FINE', 100);
const WASTED_FINE = cfg('WASTED_FINE', 50);
const ARREST_RANGE = cfg('ARREST_RANGE', 2);
const ARREST_TIME = cfg('ARREST_TIME', 2);
const INTERACT_RANGE = cfg('INTERACT_RANGE', 3.5);
const WORLD_HALF = cfg('WORLD_HALF', 450);
const WANTED_DECAY_SECONDS = cfg('WANTED_DECAY_SECONDS', 25);
const AUTOSAVE_SECONDS = 15;

// ---------- URL params / RNG ----------
const urlParams = new URLSearchParams(location.search);
const shotName = urlParams.get('shot') || null;
const seedParam = Number.parseInt(urlParams.get('seed') || '', 10);
const seed = Number.isFinite(seedParam) ? seedParam : ((Date.now() % 2147483647) || 1);
let rngFn = createRng ? createRng(seed) : Math.random;
if (typeof rngFn !== 'function') rngFn = Math.random;
const randInt = (n) => Math.floor(rngFn() * n);

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
function on(id, fn) {
  const el = $(id);
  if (el) el.addEventListener('click', fn);
}

// ---------- State ----------
const state = {
  screen: 'title',
  money: START_MONEY,
  missionsDone: [],
  packages: [],
  muted: false,
  wanted: 0,
  timeOfDay: 12,
  elapsed: 0,
  lastDamageAt: -100,
  bustedTimer: 0,
  wantedQuietTimer: 0,
  collisionCooldown: 0,
  autosaveTimer: 0,
  storyDone: false,
  lastObjective: '',
  parkedCars: [],
  marker: null, // {x, z, label} mission marker, set by missions via game
};

// Module instances (built in init).
let canvas = null;
let textures = null;
let city = null;
let world = null;
let input = null;
let player = null;
let vehicles = null;
let traffic = null;
let police = null;
let missions = null;
let hud = null;
let audio = null;
let gameCtx = null;

// ---------- Save / load ----------
function readSave() {
  try {
    if (loadSaveFn) {
      const s = loadSaveFn.length >= 1 ? loadSaveFn(SAVE_KEY) : loadSaveFn();
      if (s) return s;
    }
  } catch (err) { /* fall through to localStorage */ }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}
function writeSave() {
  const data = {
    money: state.money,
    missionsDone: [...state.missionsDone],
    packages: [...state.packages],
    muted: state.muted,
  };
  try {
    if (saveSaveFn) {
      if (saveSaveFn.length >= 2) saveSaveFn(SAVE_KEY, data);
      else saveSaveFn(data);
      return;
    }
  } catch (err) { /* fall through to localStorage */ }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) { /* storage unavailable; game continues unsaved */ }
}
function applySave(save) {
  state.money = save.money ?? START_MONEY;
  state.missionsDone = Array.isArray(save.missionsDone) ? [...save.missionsDone] : [];
  state.packages = Array.isArray(save.packages) ? [...save.packages] : [];
  state.muted = !!save.muted;
  if (audio && typeof audio.setMuted === 'function') audio.setMuted(state.muted);
  updateMuteButtons();
}

// ---------- Small utilities ----------
const arr = (x) => (Array.isArray(x) ? x : []);
function clampToWorld(o) {
  const lim = WORLD_HALF - 4;
  o.x = Math.max(-lim, Math.min(lim, o.x));
  o.z = Math.max(-lim, Math.min(lim, o.z));
}
// city.js exposes spawnPoints, not named spawns: [0] player start,
// [1] police station area, [2] hospital area.
function spawnPoint(i, fallback) {
  if (city && Array.isArray(city.spawnPoints) && city.spawnPoints[i]) return city.spawnPoints[i];
  return fallback;
}
const playerSpawn = () => (city && city.playerSpawn) || spawnPoint(0, { x: 0, z: 8, heading: 0 });
const policeSpawn = () => (city && city.policeStation) || spawnPoint(1, { x: 0, z: -52, heading: 0 });
const hospitalSpawn = () => (city && city.hospital) || spawnPoint(2, { x: 52, z: 0, heading: 0 });
function fmtClock(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
function allCars() {
  const list = [...state.parkedCars];
  for (const c of arr(traffic.cars)) list.push(c);
  for (const c of arr(police.cars)) list.push(c);
  if (player && player.car && !list.includes(player.car)) list.push(player.car);
  return list;
}
function snapshot() {
  return {
    state,
    player,
    cars: allCars(),
    trafficCars: arr(traffic.cars),
    policeCars: arr(police.cars),
    parkedCars: state.parkedCars,
    timeOfDay: state.timeOfDay,
    wanted: state.wanted,
    mission: activeMission(),
    screen: state.screen,
  };
}
function activeMission() {
  if (missions && missions.active) return missions.active;
  if (missions && typeof missions.getActive === 'function') {
    try { return missions.getActive() || null; } catch (err) { return null; }
  }
  return null;
}

// ---------- Keyboard (UI keys + fallback gameplay keys) ----------
const keysDown = new Set();
let ePressed = false;
function isDown(code) {
  if (input && typeof input.isDown === 'function') {
    const v = input.isDown(code);
    if (v !== undefined) return !!v;
  }
  return keysDown.has(code);
}
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keysDown.add(e.code);
  if (e.code === 'KeyE') ePressed = true;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state.screen === 'playing' || state.screen === 'paused') togglePause();
  }
  if (e.code === 'KeyM') toggleMute();
  if ((e.code === 'Enter' || e.code === 'Space')
    && ['busted', 'wasted', 'mission-complete', 'story-complete'].includes(state.screen)) {
    dismissOverlay();
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keysDown.delete(e.code));
window.addEventListener('blur', () => keysDown.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === 'playing') showScreen('paused');
});
window.addEventListener('resize', () => {
  if (world && typeof world.resize === 'function') world.resize();
});

// ---------- HUD ----------
const hudCache = { cash: null, health: null, stars: null, clock: null, objective: null };
function currentObjective() {
  const m = activeMission();
  if (m && (m.objective || m.title)) return m.objective || m.title;
  if (missions && typeof missions.getObjective === 'function') {
    try {
      const o = missions.getObjective();
      if (o) return o;
    } catch (err) { /* ignore */ }
  }
  return state.lastObjective || 'Jelajahi Solmara. Tekan E di dekat mobil untuk masuk.';
}
function refreshHUD() {
  if (!player) return;
  const cashEl = $('cash');
  if (cashEl && hudCache.cash !== state.money) {
    hudCache.cash = state.money;
    cashEl.textContent = '$' + state.money;
  }
  const hp = Math.max(0, Math.min(100, Math.round(player.health)));
  const fill = $('health-fill');
  if (fill && hudCache.health !== hp) {
    hudCache.health = hp;
    fill.style.width = hp + '%';
    fill.classList.toggle('low', hp <= 25);
  }
  const ht = $('health-text');
  if (ht) ht.textContent = String(hp);
  const starsEl = $('stars');
  if (starsEl && hudCache.stars !== state.wanted) {
    hudCache.stars = state.wanted;
    starsEl.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    starsEl.classList.toggle('hot', state.wanted > 0);
  }
  const clockEl = $('clock');
  const clockStr = fmtClock(state.timeOfDay);
  if (clockEl && hudCache.clock !== clockStr) {
    hudCache.clock = clockStr;
    clockEl.textContent = clockStr;
  }
  const speedEl = $('speed');
  if (speedEl) {
    const v = player.onFoot ? player.speed : (player.car ? player.car.speed : 0);
    speedEl.textContent = Math.round(Math.abs(v) * 3.6) + ' km/h';
  }
  const obj = currentObjective();
  const objEl = $('objective');
  if (objEl && hudCache.objective !== obj) {
    hudCache.objective = obj;
    objEl.textContent = obj;
  }
  if (hud && typeof hud.update === 'function') {
    try { hud.update(snapshot()); } catch (err) { /* HUD is optional */ }
  }
}
function flashMessage(text) {
  if (!text) return;
  if (hud && typeof hud.message === 'function') {
    try { hud.message(text); } catch (err) { /* ignore */ }
  }
  const feed = $('feed');
  if (!feed) return;
  const div = document.createElement('div');
  div.className = 'feed-item';
  div.textContent = text;
  feed.prepend(div);
  while (feed.children.length > 5) feed.removeChild(feed.lastChild);
}
function setObjective(text) {
  if (!text) return;
  state.lastObjective = text;
  refreshHUD();
}

// ---------- Screens ----------
const SCREENS = {
  title: 'screen-title',
  playing: null,
  paused: 'screen-pause',
  busted: 'screen-busted',
  wasted: 'screen-wasted',
  'mission-complete': 'screen-mission',
  'story-complete': 'screen-story',
  controls: 'screen-controls',
  missions: 'screen-missions',
};
function showScreen(name) {
  state.screen = name;
  ePressed = false;
  for (const [key, id] of Object.entries(SCREENS)) {
    if (!id) continue;
    const el = $(id);
    if (el) el.classList.toggle('active', key === name);
  }
  const hudEl = $('hud');
  if (hudEl) hudEl.classList.toggle('hidden', name !== 'playing');
  if (hud && typeof hud.show === 'function') {
    try { hud.show(name); } catch (err) { /* ignore */ }
  }
  if (name === 'playing' && audio && typeof audio.resume === 'function') {
    try { audio.resume(); } catch (err) { /* ignore */ }
  }
  refreshHUD();
}
function dismissOverlay() {
  if (['busted', 'wasted', 'mission-complete', 'story-complete'].includes(state.screen)) {
    showScreen('playing');
  }
}
function showMissionComplete(title, reward) {
  const t = $('mission-title');
  if (t) t.textContent = title || 'Misi selesai!';
  const r = $('mission-reward');
  if (r) r.textContent = reward > 0 ? 'Hadiah: +$' + reward : '';
  showScreen('mission-complete');
}
function togglePause() {
  if (state.screen === 'playing') {
    showScreen('paused');
    if (audio && typeof audio.play === 'function') audio.play('pause');
  } else if (state.screen === 'paused') {
    showScreen('playing');
  }
}
function updateMuteButtons() {
  const label = state.muted ? 'Suara: Mati' : 'Suara: Hidup';
  for (const id of ['btn-mute', 'btn-mute-pause']) {
    const el = $(id);
    if (el) el.textContent = label;
  }
}
function toggleMute() {
  state.muted = !state.muted;
  if (audio && typeof audio.setMuted === 'function') audio.setMuted(state.muted);
  updateMuteButtons();
  writeSave();
}
function refreshTitle() {
  const save = readSave();
  const cont = $('btn-continue');
  const info = $('save-info');
  if (save) {
    if (cont) cont.disabled = false;
    if (info) {
      info.textContent = 'Save: $' + (save.money ?? 0)
        + ' • Misi selesai: ' + (Array.isArray(save.missionsDone) ? save.missionsDone.length : 0);
    }
  } else {
    if (cont) cont.disabled = true;
    if (info) info.textContent = 'Belum ada save. Mulai permainan baru.';
  }
}
function openMissionsList() {
  const list = (missions && typeof missions.list === 'function') ? missions.list() : [];
  const el = $('missions-list');
  if (el) {
    el.innerHTML = '';
    if (!Array.isArray(list) || list.length === 0) {
      el.textContent = 'Belum ada data misi.';
    } else {
      for (const m of list) {
        const id = m.id ?? m;
        const done = state.missionsDone.includes(id);
        const div = document.createElement('div');
        div.className = 'mission-row' + (done ? ' done' : '');
        div.textContent = (done ? '✓ ' : '○ ') + (m.title ?? m.name ?? String(id))
          + (m.reward ? ' — $' + m.reward : '');
        el.appendChild(div);
      }
    }
  }
  showScreen('missions');
}

// ---------- Wanted / busted / wasted ----------
function addWanted(n) {
  const before = state.wanted;
  state.wanted = Math.max(0, Math.min(5, state.wanted + n));
  if (state.wanted > before) {
    state.wantedQuietTimer = 0;
    flashMessage(state.wanted >= 3
      ? 'Polisi mengejarmu! (' + state.wanted + ' bintang)'
      : 'Wanted naik: ' + state.wanted + ' bintang');
    if (police && typeof police.setWanted === 'function') police.setWanted(state.wanted);
    if (state.wanted >= 1 && audio && typeof audio.siren === 'function') audio.siren(true);
    refreshHUD();
  }
}
function setWanted(n) {
  state.wanted = Math.max(0, Math.min(5, n));
  state.wantedQuietTimer = 0;
  if (police && typeof police.setWanted === 'function') police.setWanted(state.wanted);
  if (audio && typeof audio.siren === 'function') audio.siren(state.wanted > 0);
  refreshHUD();
}
function syncWanted(dt) {
  // Police owns the wanted state (decay + bust logic live there); main
  // only mirrors it into state and drives the siren/HUD on change.
  if (police && typeof police.wanted === 'number' && police.wanted !== state.wanted) {
    state.wanted = Math.max(0, Math.min(5, police.wanted));
    if (audio && typeof audio.siren === 'function') audio.siren(state.wanted > 0);
    refreshHUD();
  }
}
function nearestCopDist() {
  let best = Infinity;
  for (const c of arr(police.cars)) {
    best = Math.min(best, Math.hypot(c.x - player.x, c.z - player.z));
  }
  return best;
}
function checkBusted(dt) {
  if (!player.onFoot || state.wanted <= 0) {
    state.bustedTimer = 0;
    return;
  }
  if (nearestCopDist() < ARREST_RANGE) {
    const before = state.bustedTimer;
    state.bustedTimer += dt;
    if (before < 1 && state.bustedTimer >= 1) flashMessage('Polisi menangkapmu... jangan bergerak!');
    if (state.bustedTimer >= ARREST_TIME) doBusted();
  } else {
    state.bustedTimer = Math.max(0, state.bustedTimer - dt * 2);
  }
}
function respawn(spot) {
  if (player.car) {
    player.car.isPlayer = false;
    player.car.speed = 0;
    parkCar(player.car);
    player.car = null;
  }
  player.onFoot = true;
  player.speed = 0;
  player.x = (spot && spot.x) ?? 0;
  player.z = (spot && spot.z) ?? 0;
  player.heading = (spot && spot.heading) ?? 0;
  if (player.health <= 0) player.health = 100;
  state.bustedTimer = 0;
  state.wantedQuietTimer = 0;
  state.collisionCooldown = 0;
}
function doBusted() {
  state.bustedTimer = 0;
  const fine = Math.min(state.money, BUSTED_FINE);
  state.money -= fine;
  state.wanted = 0;
  if (police && typeof police.setWanted === 'function') police.setWanted(0);
  if (police && typeof police.clear === 'function') police.clear();
  if (audio && typeof audio.siren === 'function') audio.siren(false);
  respawn(policeSpawn());
  const el = $('busted-fine');
  if (el) el.textContent = '$' + fine;
  showScreen('busted');
  if (audio && typeof audio.play === 'function') audio.play('busted');
  writeSave();
}
function doWasted() {
  const fine = Math.min(state.money, WASTED_FINE);
  state.money -= fine;
  state.wanted = 0;
  if (police && typeof police.setWanted === 'function') police.setWanted(0);
  if (police && typeof police.clear === 'function') police.clear();
  if (audio && typeof audio.siren === 'function') audio.siren(false);
  player.health = 100;
  respawn(hospitalSpawn());
  const el = $('wasted-fine');
  if (el) el.textContent = '$' + fine;
  showScreen('wasted');
  if (audio && typeof audio.play === 'function') audio.play('wasted');
  writeSave();
}
function damagePlayer(amount) {
  if (amount <= 0 || state.screen !== 'playing') return;
  player.health = Math.max(0, player.health - amount);
  state.lastDamageAt = state.elapsed;
  if (player.health <= 0) doWasted();
}

// ---------- Cars: enter / exit / steal / drive ----------
function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of allCars()) {
    if (car.isPlayer) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
function removeFromParked(car) {
  const i = state.parkedCars.indexOf(car);
  if (i >= 0) state.parkedCars.splice(i, 1);
}
// A car the player leaves behind must stay in the world: return it to the
// parked list unless a module (traffic / police) still owns it. Without
// this, an exited car vanished from allCars() — invisible and un-enterable.
function parkCar(car) {
  if (!car) return;
  const inTraffic = arr(traffic.cars).includes(car);
  const inPolice = arr(police.cars).includes(car);
  if (!inTraffic && !inPolice && !state.parkedCars.includes(car)) {
    state.parkedCars.push(car);
  }
}
function enterCar(car) {
  if (car.isPolice) {
    addWanted(2);
    flashMessage('Kamu mencuri mobil polisi!');
    if (police && typeof police.removeCar === 'function') police.removeCar(car);
  } else if (car.hasDriver) {
    addWanted(1);
    flashMessage('Mobil dibajak! Saksi melihatmu.');
    car.hasDriver = false;
    car.stolen = true;
    if (traffic && typeof traffic.removeCar === 'function') traffic.removeCar(car);
  } else {
    flashMessage('Masuk ke ' + (car.type || 'mobil') + '.');
  }
  removeFromParked(car);
  car.isPlayer = true;
  player.car = car;
  player.onFoot = false;
  player.x = car.x;
  player.z = car.z;
  player.heading = car.heading;
  player.speed = car.speed || 0;
  if (player.mesh) player.mesh.visible = false;
  if (audio && typeof audio.play === 'function') audio.play('door');
}
function exitCar() {
  const car = player.car;
  if (!car) return;
  car.isPlayer = false;
  car.speed = 0;
  parkCar(car);
  player.car = null;
  player.onFoot = true;
  player.speed = 0;
  player.x = car.x + Math.cos(car.heading) * 1.6;
  player.z = car.z - Math.sin(car.heading) * 1.6;
  clampToWorld(player);
  if (player.mesh) player.mesh.visible = true;
  if (audio && typeof audio.play === 'function') audio.play('door');
}
function tryEnterExitCar() {
  if (!player.onFoot) {
    exitCar();
    return;
  }
  const car = nearestCar(INTERACT_RANGE);
  if (!car) {
    flashMessage('Tidak ada mobil di dekatmu.');
    return;
  }
  enterCar(car);
}
function driveCar(car, dt) {
  const accel = isDown('KeyW') || isDown('ArrowUp');
  const brake = isDown('KeyS') || isDown('ArrowDown');
  const steerL = isDown('KeyA') || isDown('ArrowLeft');
  const steerR = isDown('KeyD') || isDown('ArrowRight');
  const handbrake = isDown('Space');
  const maxSpeed = car.isPolice ? 34 : 30;
  const maxReverse = 10;
  if (accel) car.speed += 22 * dt;
  else if (brake) car.speed -= car.speed > 0.5 ? 30 * dt : 12 * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 40 * dt);
  car.speed = Math.max(-maxReverse, Math.min(maxSpeed, car.speed));
  if (Math.abs(car.speed) > 0.1) {
    const steer = (steerL ? 1 : 0) - (steerR ? 1 : 0);
    car.heading += steer * 1.9 * dt * Math.min(1, Math.abs(car.speed) / 8) * Math.sign(car.speed);
  }
  // Heading 0 faces -z (north), same convention as vehicles.js:
  // forward is (-sin heading, -cos heading), so the mesh (rotation.y =
  // heading, nose at local -z) moves where it points.
  car.x += -Math.sin(car.heading) * car.speed * dt;
  car.z += -Math.cos(car.heading) * car.speed * dt;
  clampToWorld(car);
  if (Math.abs(car.speed) < 0.05) car.speed = 0;
  if (audio && typeof audio.setEngineSpeed === 'function') {
    audio.setEngineSpeed(Math.abs(car.speed) / maxSpeed);
  }
}
function updatePlayer(dt) {
  const p = player;
  if (p.onFoot) {
    const fwd = (isDown('KeyW') || isDown('ArrowUp') ? 1 : 0)
      - (isDown('KeyS') || isDown('ArrowDown') ? 1 : 0);
    const turn = (isDown('KeyA') || isDown('ArrowLeft') ? 1 : 0)
      - (isDown('KeyD') || isDown('ArrowRight') ? 1 : 0);
    const run = isDown('ShiftLeft') || isDown('ShiftRight');
    p.heading += turn * 2.4 * dt;
    p.speed = fwd * (run ? 7 : 4);
    p.x += -Math.sin(p.heading) * p.speed * dt;
    p.z += -Math.cos(p.heading) * p.speed * dt;
    clampToWorld(p);
  } else if (p.car) {
    driveCar(p.car, dt);
    p.x = p.car.x;
    p.z = p.car.z;
    p.heading = p.car.heading;
    p.speed = p.car.speed;
  }
  if (ePressed) {
    ePressed = false;
    tryEnterExitCar();
  }
}
function checkCollisions(dt) {
  state.collisionCooldown = Math.max(0, state.collisionCooldown - dt);
  if (state.collisionCooldown > 0) return;
  const myCar = player.onFoot ? null : player.car;
  const mx = myCar ? myCar.x : player.x;
  const mz = myCar ? myCar.z : player.z;
  const mySpeed = Math.abs(myCar ? myCar.speed : (player.speed || 0));
  for (const car of allCars()) {
    if (car === myCar || car.isPlayer) continue;
    const d = Math.hypot(car.x - mx, car.z - mz);
    if (d < 2.2) {
      const rel = Math.abs(mySpeed - Math.abs(car.speed || 0));
      if (rel > 12) {
        const dmg = Math.round((rel - 12) * 0.6);
        damagePlayer(dmg);
        if (myCar) myCar.speed *= 0.4;
        state.collisionCooldown = 1;
        flashMessage('Tabrakan! -' + dmg + ' HP');
        return;
      }
    }
  }
}
function policePressure(dt) {
  if (state.wanted >= 3) {
    const d = nearestCopDist();
    if (d < 12) damagePlayer(6 * dt);
  }
}
function regenHealth(dt) {
  if (state.wanted === 0 && player.health > 0 && player.health < 100
    && state.elapsed - state.lastDamageAt > 5) {
    player.health = Math.min(100, player.health + 2 * dt);
  }
}

// ---------- Missions glue ----------
function missionsComplete() {
  if (missions && typeof missions.isComplete === 'function') {
    try { return missions.isComplete(); } catch (err) { return false; }
  }
  const list = (missions && typeof missions.list === 'function') ? missions.list() : null;
  if (Array.isArray(list) && list.length > 0) {
    return list.every((m) => state.missionsDone.includes(m.id ?? m));
  }
  return false;
}
// Start the first mission not yet completed (sequential unlock).
function startNextMission() {
  if (!missions || typeof missions.start !== 'function') return;
  const done = Array.isArray(missions.completedIds) ? missions.completedIds : state.missionsDone;
  const all = (missionsMod.MISSIONS || []);
  const idx = all.findIndex((m) => !done.includes(m.id));
  if (idx >= 0) missions.start(idx);
}

// ---------- Game flow ----------
function spawnStarterCar() {
  const spawn = playerSpawn();
  const near = state.parkedCars.some(
    (c) => Math.hypot(c.x - spawn.x, c.z - spawn.z) < 12,
  );
  if (near) return;
  if (typeof vehicles.spawnCar !== 'function') return;
  const car = vehicles.spawnCar({
    type: 'sedan', x: spawn.x + 4, z: spawn.z + 2, heading: 0, color: '#c0392b',
  });
  if (car) {
    state.parkedCars.push(car);
    if (typeof world.addCar === 'function') world.addCar(car);
  }
}
function resetRunState() {
  state.wanted = 0;
  state.bustedTimer = 0;
  state.wantedQuietTimer = 0;
  state.collisionCooldown = 0;
  state.autosaveTimer = 0;
  state.timeOfDay = 9;
  state.storyDone = false;
  state.lastObjective = '';
  if (player.car) {
    player.car.isPlayer = false;
    player.car.speed = 0;
    parkCar(player.car);
  }
  player.health = 100;
  player.onFoot = true;
  player.car = null;
  player.speed = 0;
  const spawn = playerSpawn();
  player.x = spawn.x;
  player.z = spawn.z;
  player.heading = spawn.heading ?? 0;
  if (police && typeof police.setWanted === 'function') police.setWanted(0);
  if (police && typeof police.clear === 'function') police.clear();
  spawnStarterCar();
  if (typeof world.setTimeOfDay === 'function') world.setTimeOfDay(state.timeOfDay / 24);
}
function startNewGame() {
  state.money = START_MONEY;
  state.missionsDone = [];
  state.packages = [];
  resetRunState();
  startNextMission();
  writeSave();
  flashMessage('Selamat datang di Solmara, Danny.');
  setObjective('Ikuti penanda misi di minimap.');
  showScreen('playing');
  if (audio && typeof audio.play === 'function') audio.play('start');
}
function startContinue() {
  const save = readSave();
  if (!save) {
    startNewGame();
    return;
  }
  applySave(save);
  resetRunState();
  startNextMission();
  writeSave();
  flashMessage('Lanjutkan petualangan Danny di Solmara.');
  showScreen('playing');
  if (audio && typeof audio.play === 'function') audio.play('start');
}

// Keep the 3D scene in step with the logical state: main owns movement,
// so it also owns the player mesh transform, the player car mesh, and the
// third-person camera (player.update() is not called, so nothing else
// does this — without it Danny never visibly moves and the camera never
// follows).
function syncVisuals() {
  if (!player || !world || !world.camera) return;
  if (player.mesh) {
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.heading;
    player.mesh.visible = player.onFoot;
  }
  if (player.car && player.car.mesh) {
    player.car.mesh.position.set(player.car.x, 0, player.car.z);
    player.car.mesh.rotation.y = player.car.heading;
  }
  const cam = world.camera;
  const d = 8;
  cam.position.set(
    player.x + Math.sin(player.heading) * d,
    3.4,
    player.z + Math.cos(player.heading) * d,
  );
  cam.lookAt(player.x, 1.5, player.z);
}

// ---------- Fixed-step loop ----------
function paint(stepWorld) {
  const snap = snapshot();
  syncVisuals();
  if (stepWorld && typeof world.update === 'function') world.update(STEP, snap);
  if (typeof world.render === 'function') world.render(snap);
  refreshHUD();
}
function tick(dt) {
  state.elapsed += dt;
  state.timeOfDay = (state.timeOfDay + (dt / DAY_SECONDS) * 24) % 24;
  // render.js takes a 0..1 day fraction, main's clock is 0..24 hours.
  if (typeof world.setTimeOfDay === 'function') world.setTimeOfDay(state.timeOfDay / 24);
  if (input && typeof input.update === 'function') {
    try { input.update(); } catch (err) { /* ignore */ }
  }
  updatePlayer(dt);
  if (player.onFoot && audio && typeof audio.setEngineSpeed === 'function') {
    audio.setEngineSpeed(0);
  }
  if (vehicles && typeof vehicles.update === 'function') vehicles.update(dt, snapshot());
  if (traffic && typeof traffic.update === 'function') traffic.update(dt, player);
  if (police && typeof police.update === 'function') {
    let res = null;
    try { res = police.update(dt, player, allCars()); } catch (err) { /* ignore */ }
    if (res && res.busted && state.screen === 'playing') doBusted();
  }
  syncWanted(dt);
  checkBusted(dt);
  if (state.screen !== 'playing') return;
  checkCollisions(dt);
  if (state.screen !== 'playing') return;
  policePressure(dt);
  if (state.screen !== 'playing') return;
  regenHealth(dt);
  if (missions && typeof missions.update === 'function') {
    // missions.update() returns nothing; a mission completes when the
    // active mission clears AND completedCount grows. The reward was
    // already added via game.addMoney — here only the overlay shows.
    const activeBefore = activeMission();
    const doneBefore = typeof missions.completedCount === 'number' ? missions.completedCount : 0;
    try { missions.update(dt); } catch (err) { /* missions never crash the game */ }
    if (Array.isArray(missions.completedIds)) state.missionsDone = [...missions.completedIds];
    if (Array.isArray(missions.foundPackageIds)) state.packages = [...missions.foundPackageIds];
    const doneAfter = typeof missions.completedCount === 'number' ? missions.completedCount : doneBefore;
    if (activeBefore && !activeMission() && doneAfter > doneBefore) {
      if (missionsComplete()) {
        state.storyDone = true;
        const stats = $('story-stats');
        if (stats) {
          stats.textContent = 'Misi selesai: ' + state.missionsDone.length
            + ' • Uang: $' + state.money;
        }
        showScreen('story-complete');
        if (audio && typeof audio.play === 'function') audio.play('story');
        writeSave();
      } else {
        showMissionComplete(activeBefore.title, activeBefore.reward || 0);
        writeSave();
      }
    }
  }
  if (state.screen !== 'playing') return;
  state.autosaveTimer += dt;
  if (state.autosaveTimer >= AUTOSAVE_SECONDS) {
    state.autosaveTimer = 0;
    writeSave();
  }
  refreshHUD();
}
let lastFrameAt = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastFrameAt) / 1000;
  lastFrameAt = now;
  if (dt > 0.25) dt = 0.25;
  if (dt < 0) dt = 0;
  if (state.screen === 'playing') {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 8) {
      tick(STEP);
      acc -= STEP;
      guard += 1;
      if (state.screen !== 'playing') {
        acc = 0;
        break;
      }
    }
    if (guard >= 8) acc = 0;
  }
  paint(state.screen === 'playing' || state.screen === 'title');
}

// ---------- Shots mode ----------
function makeGameCtx() {
  return {
    state,
    player,
    world,
    city,
    vehicles,
    traffic,
    police,
    missions,
    hud,
    audio,
    input,
    rng: rngFn,
    seed,
    cars: allCars,
    parkCar,
    setTimeOfDay(h) {
      state.timeOfDay = ((h % 24) + 24) % 24;
      if (typeof world.setTimeOfDay === 'function') world.setTimeOfDay(state.timeOfDay / 24);
      refreshHUD();
    },
    setWanted,
    placePlayer(x, z, heading) {
      player.x = x;
      player.z = z;
      player.heading = heading || 0;
      player.speed = 0;
    },
    placePlayerInCar(car) {
      if (!car) return;
      if (player.car) player.car.isPlayer = false;
      removeFromParked(car);
      car.isPlayer = true;
      player.car = car;
      player.onFoot = false;
      player.x = car.x;
      player.z = car.z;
      player.heading = car.heading;
      player.speed = car.speed || 0;
    },
    spawnCar(opts) {
      if (opts && opts.isPolice && police && typeof police.spawn === 'function') {
        return police.spawn(opts.x || 0, opts.z || 0, opts.heading || 0);
      }
      if (typeof vehicles.spawnCar !== 'function') return null;
      const car = vehicles.spawnCar(opts);
      if (!car) return null;
      state.parkedCars.push(car);
      return car;
    },
    spawnPoliceCar(x, z, heading) {
      if (police && typeof police.spawn === 'function') return police.spawn(x, z, heading);
      return this.spawnCar({ type: 'police', x, z, heading, color: '#1c2733', isPolice: true });
    },
    showScreen,
    showMissionComplete,
    paint: () => paint(true),
    flashMessage,
    setObjective,
    startMission(id) {
      if (!missions || typeof missions.start !== 'function') return;
      // missions.start takes an index; accept an 'M1' id or an index.
      if (typeof id === 'string') {
        const idx = (missionsMod.MISSIONS || []).findIndex((m) => m.id === id);
        if (idx >= 0) missions.start(idx);
      } else if (typeof id === 'number') {
        missions.start(id);
      } else {
        startNextMission();
      }
    },
  };
}
function runShot(name) {
  resetRunState();
  state.money = START_MONEY;
  state.missionsDone = [];
  state.packages = [];
  stageShot(name, gameCtx);
  // Keep re-painting: without a running loop the WebGL drawing buffer is
  // cleared after its first composite and a later screenshot captures a
  // black canvas. The staged frame stays identical (tick never runs here).
  const shotLoop = () => {
    paint(true);
    requestAnimationFrame(shotLoop);
  };
  requestAnimationFrame(shotLoop);
}

// ---------- Init ----------
function init() {
  canvas = $('game-canvas');
  textures = null; // textures.js has no createTextures; city.js builds its own
  world = createWorld3D(canvas);
  city = createCity(world.scene, rngFn);
  input = createInput(canvas);
  const spawn = playerSpawn();
  player = createPlayer(world.scene, city);
  player.setPosition(spawn.x, spawn.z);
  player.heading = spawn.heading ?? 0;
  player.health = 100;
  player.onFoot = true;
  player.car = null;
  player.speed = 0;
  vehicles = createVehicles({ scene: world.scene, city, rng: rngFn });
  traffic = createTraffic(world.scene, city, 10);
  police = createPolice(world.scene, city);
  const save = readSave();
  const missionGame = {
    player,
    city,
    traffic,
    police,
    hud: null,
    audio: null, // wired below once audio exists; missions guard a null audio
    save: save ? {
      completedMissions: save.missionsDone || [],
      foundPackages: save.packages || [],
    } : null,
    setObjective,
    addMoney(amount) {
      state.money += amount;
      refreshHUD();
    },
    showMessage: flashMessage,
    spawnMarker(x, z, label) { state.marker = { x, z, label }; },
    clearMarker() { state.marker = null; },
  };
  missions = createMissionManager(missionGame);
  // hud.js builds its own overlay duplicating the index.html HUD, so it is
  // not instantiated; the DOM HUD is driven by refreshHUD()/flashMessage().
  hud = null;
  audio = createAudio ? createAudio() : null;
  missionGame.audio = audio;

  if (save) applySave(save);
  updateMuteButtons();

  // Populate the city only if the modules did not do it themselves.
  if (Array.isArray(traffic.cars) && traffic.cars.length === 0
    && typeof traffic.spawn === 'function') {
    traffic.spawn(10);
  }
  if (state.parkedCars.length === 0 && typeof vehicles.spawnParked === 'function') {
    const list = vehicles.spawnParked(8) || [];
    for (const c of list) {
      state.parkedCars.push(c);
      if (typeof world.addCar === 'function') world.addCar(c);
    }
  }
  spawnStarterCar();
  if (typeof world.setTimeOfDay === 'function') world.setTimeOfDay(state.timeOfDay / 24);

  on('btn-new', startNewGame);
  on('btn-continue', startContinue);
  on('btn-missions', openMissionsList);
  on('btn-controls', () => showScreen('controls'));
  on('btn-mute', toggleMute);
  on('btn-mute-pause', toggleMute);
  on('btn-resume', () => showScreen('playing'));
  on('btn-restart', startNewGame);
  on('btn-quit', () => { refreshTitle(); showScreen('title'); });
  on('btn-busted-ok', () => showScreen('playing'));
  on('btn-wasted-ok', () => showScreen('playing'));
  on('btn-mission-ok', () => showScreen('playing'));
  on('btn-story-roam', () => showScreen('playing'));
  on('btn-story-title', () => { refreshTitle(); showScreen('title'); });
  on('btn-controls-back', () => showScreen('title'));
  on('btn-missions-back', () => showScreen('title'));

  gameCtx = makeGameCtx();
  window.__solmara = gameCtx;

  refreshTitle();
  refreshHUD();

  if (shotName) {
    runShot(shotName);
  } else {
    showScreen('title');
    requestAnimationFrame(frame);
  }
}

init();
