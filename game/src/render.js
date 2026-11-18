// render.js — Solmara (gta6-01)
// 3D world bootstrap: renderer, sky, sun/moon + hemisphere lighting,
// fog, resize handling and the day/night cycle.
// Plain ES module, no build step, no network requests.
// Shadows are OFF in the renderer; blob shadows are separate dark
// circle planes owned by the modules that create meshes.

// Vendored three.js (relative import so no import map is needed).
import * as THREE from '../vendor/three.module.js';

// One full day lasts 8 minutes of play.
const DAY_LENGTH_S = 480;

// Sky / light keyframes across t in [0, 1): 0 = midnight, 0.25 = sunrise,
// 0.5 = noon, 0.75 = sunset. Each stop: sky colour, fog colour, sun colour,
// sun intensity, hemisphere intensity.
const STOPS = [
  { t: 0.0, sky: 0x0a0e24, fog: 0x0a0e24, sun: 0x8fa8ff, sunI: 0.0, hemiI: 0.25 },
  { t: 0.22, sky: 0x0a0e24, fog: 0x0a0e24, sun: 0x8fa8ff, sunI: 0.0, hemiI: 0.25 },
  { t: 0.27, sky: 0xff9a5c, fog: 0xe88a6a, sun: 0xffb37a, sunI: 1.1, hemiI: 0.55 },
  { t: 0.35, sky: 0x87bfe8, fog: 0x9fc3dd, sun: 0xfff2d8, sunI: 1.9, hemiI: 0.8 },
  { t: 0.5, sky: 0x6fb3e8, fog: 0xa8c8e0, sun: 0xffffff, sunI: 2.4, hemiI: 0.9 },
  { t: 0.65, sky: 0x87bfe8, fog: 0x9fc3dd, sun: 0xfff2d8, sunI: 1.9, hemiI: 0.8 },
  { t: 0.73, sky: 0xff7e4d, fog: 0xe07a5a, sun: 0xff9a5c, sunI: 1.0, hemiI: 0.5 },
  { t: 0.78, sky: 0x1a2350, fog: 0x1a2350, sun: 0x8fa8ff, sunI: 0.0, hemiI: 0.3 },
  { t: 1.0, sky: 0x0a0e24, fog: 0x0a0e24, sun: 0x8fa8ff, sunI: 0.0, hemiI: 0.25 },
];

const _cA = new THREE.Color();
const _cB = new THREE.Color();

function lerpStops(t, field) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      if (typeof a[field] === 'number' && a[field] > 0xff) {
        _cA.setHex(a[field]);
        _cB.setHex(b[field]);
        return _cA.clone().lerp(_cB, f);
      }
      return a[field] + (b[field] - a[field]) * f;
    }
  }
  return STOPS[STOPS.length - 1][field];
}

function smooth01(x) {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

// createWorld3D(canvas) -> { scene, camera, renderer, setTimeOfDay, update }
// The camera is also published as scene.userData.camera so the player
// module can drive the third-person orbit without a new interface.
export function createWorld3D(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6fb3e8);
  scene.fog = new THREE.Fog(0xa8c8e0, 90, 520);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1200);
  camera.position.set(0, 9, 16);
  camera.lookAt(0, 1, 0);
  scene.userData.camera = camera;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = false; // blob shadows only, see header
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Lighting rig.
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3230, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(80, 120, 40);
  scene.add(sun);
  scene.add(sun.target);
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0.0);
  moon.position.set(-60, 100, -40);
  scene.add(moon);
  scene.add(moon.target);

  let timeOfDay = 0.32; // late morning start
  let lastAppliedT = -1;

  // Night factor 0 (day) .. 1 (deep night), from sun elevation.
  function nightFactor(t) {
    // Sun is up between t=0.25 (sunrise) and t=0.75 (sunset).
    const elev = Math.sin((t - 0.25) * Math.PI * 2);
    return smooth01(0.12 - elev);
  }

  // Apply one time-of-day to sky, fog, sun/moon and glow materials.
  // Glow registry (filled by other modules, no import needed):
  //   scene.userData.glowMats: materials with userData.baseEmissive
  //   scene.userData.streetLights: lights with userData.baseIntensity
  function applyTime(t) {
    const sky = lerpStops(t, 'sky');
    const fog = lerpStops(t, 'fog');
    const sunCol = lerpStops(t, 'sun');
    const sunI = lerpStops(t, 'sunI');
    const hemiI = lerpStops(t, 'hemiI');
    const night = nightFactor(t);

    scene.background.copy(sky);
    scene.fog.color.copy(fog);
    sun.color.copy(sunCol);
    sun.intensity = sunI;
    hemi.intensity = hemiI;

    // Sun path: rises east (+x), sets west (-x); moon opposite.
    const ang = (t - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    const azim = Math.cos(ang);
    const sunDir = new THREE.Vector3(azim, Math.max(elev, 0.03), 0.35).normalize();
    sun.position.copy(sunDir).multiplyScalar(160);
    sun.target.position.set(0, 0, 0);
    moon.intensity = night * 0.55;
    const moonDir = new THREE.Vector3(-azim, Math.max(-elev, 0.05), -0.35).normalize();
    moon.position.copy(moonDir).multiplyScalar(160);
    moon.target.position.set(0, 0, 0);

    // Streetlights / neon: bright at night, faint by day.
    const glow = scene.userData.glowMats;
    if (Array.isArray(glow)) {
      for (const mat of glow) {
        if (!mat || !mat.emissive) continue;
        const base = mat.userData.baseEmissive !== undefined ? mat.userData.baseEmissive : 1;
        mat.emissiveIntensity = base * (0.12 + 0.88 * night);
      }
    }
    const lamps = scene.userData.streetLights;
    if (Array.isArray(lamps)) {
      for (const light of lamps) {
        if (!light || !light.isLight) continue;
        const base = light.userData.baseIntensity !== undefined ? light.userData.baseIntensity : 1;
        light.intensity = base * night;
        light.visible = night > 0.05;
      }
    }
  }

  function setTimeOfDay(t) {
    timeOfDay = ((t % 1) + 1) % 1;
    applyTime(timeOfDay);
    lastAppliedT = timeOfDay;
  }

  function resize() {
    const w = canvas.clientWidth || canvas.width || 1;
    const h = canvas.clientHeight || canvas.height || 1;
    const bw = canvas.width;
    const bh = canvas.height;
    if (bw !== Math.floor(w * renderer.getPixelRatio()) || bh !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
    }
    if (camera.aspect !== w / h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  window.addEventListener('resize', resize);
  resize();
  setTimeOfDay(timeOfDay);

  function update(dt) {
    const step = Math.max(0, Math.min(dt || 0, 0.1));
    timeOfDay = (timeOfDay + step / DAY_LENGTH_S) % 1;
    // Re-apply only when the time has visibly moved (cheap per frame).
    if (Math.abs(timeOfDay - lastAppliedT) > 0.0004) {
      applyTime(timeOfDay);
      lastAppliedT = timeOfDay;
    }
    resize();
    renderer.render(scene, camera);
  }

  return { scene, camera, renderer, setTimeOfDay, update };
}
