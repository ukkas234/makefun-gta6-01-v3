// police.js — Solmara (gta6-01)
// Wanted system + police pursuit. Plain ES module, no build step.
//
// Wanted 0–5 stars. The caller calls addWanted(n) on steal-in-sight,
// hitting a pedestrian, shooting, or ramming a cop. Wanted decays by 1
// every 20 s while hidden (no cop within 60 m). Police cars chase and ram
// the player; on-foot cops chase on foot. If an on-foot cop stays within
// 2 m of an on-foot player for 2 s the player is busted — update() returns
// { busted: true } and the caller handles the $100 loss, respawn at the
// police station and resetting wanted to 0. Health 0 (WASTED) is handled
// by the caller, not here.

import * as THREE from '../vendor/three.module.js';
import { createCar, driveCar } from './vehicles.js';

const HIDE_RADIUS = 60; // decay only when no cop is this close
const DECAY_SECONDS = 20; // -1 wanted per this long while hidden
const BUST_DIST = 2; // cop this close to an on-foot player...
const BUST_SECONDS = 2; // ...for this long -> busted
const COP_CAR_SPEED = 36; // police cars are fast, but not unbeatable
const FOOT_COP_SPEED = 5.2; // on-foot cops jog after the player
const DESPAWN_DIST = 260; // cops further than this are recycled

// How many police cars / on-foot cops each wanted level fields.
function copsForLevel(wanted) {
  if (wanted <= 0) return { cars: 0, foot: 0 };
  return {
    cars: Math.min(1 + Math.floor((wanted - 1) / 1), 4), // 1,2,3,4,4
    foot: wanted >= 2 ? Math.min(wanted, 4) : 0, // 0,2,3,4,4
  };
}

function randomRoadPointNear(city, cx, cz, minDist, maxDist) {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = minDist + Math.random() * (maxDist - minDist);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    if (typeof city.nearestRoadPoint === 'function') {
      const p = city.nearestRoadPoint(x, z);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return p;
    } else if (city.isOnRoad(x, z)) {
      return { x, z };
    }
  }
  return { x: cx + minDist, z: cz };
}

// Simple on-foot cop: dark-blue box body, head, cap, legs. Origin at the
// feet (y = 0); forward is -z when heading is 0, same as cars.
function createFootCopMesh() {
  const group = new THREE.Group();
  group.name = 'cop-foot';
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1c2f57 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x101418 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 0.2), dark);
  legs.position.y = 0.4;
  group.add(legs);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), uniform);
  torso.position.y = 1.11;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.28), skin);
  head.position.y = 1.58;
  group.add(head);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.32), dark);
  cap.position.y = 1.76;
  group.add(cap);

  // Badge dot so cops read as police up close.
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffd34d }),
  );
  badge.position.set(-0.12, 1.22, -0.15);
  group.add(badge);

  // Blob shadow, same treatment as cars.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  return group;
}

// ---------------------------------------------------------------------------
// createPolice(scene, city) -> { wanted, addWanted(n), update(dt, player,
//                                cars), reset(), nearestCopDist(x, z) }
// player: { x, z, speed?, onFoot? } — onFoot defaults to true unless the
// player is flagged in a car (player.inCar). cars: traffic car objects the
// police cars should avoid ramming through (may be omitted).
// update() returns { busted: boolean }.
// ---------------------------------------------------------------------------
export function createPolice(scene, city) {
  let wanted = 0;
  let hiddenTimer = 0;
  let bustTimer = 0;
  let flashTimer = 0;
  let flashOn = false;
  const copCars = []; // { car, lightL, lightR }
  const footCops = []; // { mesh, x, z, heading, speed, legSwing }

  function removeCopCar(entry) {
    scene.remove(entry.car.mesh);
    const i = copCars.indexOf(entry);
    if (i >= 0) copCars.splice(i, 1);
  }

  function removeFootCop(entry) {
    scene.remove(entry.mesh);
    const i = footCops.indexOf(entry);
    if (i >= 0) footCops.splice(i, 1);
  }

  function spawnCopCar(player, at) {
    const p = at || randomRoadPointNear(city, player.x, player.z, 45, 85);
    const heading = at && typeof at.heading === 'number'
      ? at.heading
      : Math.atan2(-(player.x - p.x), -(player.z - p.z));
    const car = createCar('sedan', p.x, p.z, heading);
    car.isPolice = true;
    car.color = 0x14161c;

    // Repaint the body panels near-black.
    car.mesh.traverse((obj) => {
      if (obj.isMesh && obj.material && obj.material.color) {
        if (obj.material.color.getHex() === 0x3a6fd8) {
          obj.material = new THREE.MeshLambertMaterial({ color: 0x14161c });
        }
      }
    });

    // White doors band + red/blue light bar on the roof.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(car.width * 0.9, 0.3, car.length * 0.42),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    );
    band.position.set(0, 0.62, 0.1);
    car.mesh.add(band);
    const lightL = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.12, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    lightL.position.set(-0.22, 1.5, 0.1);
    car.mesh.add(lightL);
    const lightR = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.12, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    lightR.position.set(0.22, 1.5, 0.1);
    car.mesh.add(lightR);

    scene.add(car.mesh);
    copCars.push({ car, lightL, lightR });
  }

  function spawnFootCop(player) {
    const a = Math.random() * Math.PI * 2;
    const d = 14 + Math.random() * 16;
    const mesh = createFootCopMesh();
    mesh.position.set(player.x + Math.cos(a) * d, 0, player.z + Math.sin(a) * d);
    scene.add(mesh);
    footCops.push({
      mesh,
      x: mesh.position.x,
      z: mesh.position.z,
      heading: 0,
      legSwing: Math.random() * Math.PI * 2,
    });
  }

  // Bring the spawned force in line with the current wanted level.
  function syncForce(player) {
    const want = copsForLevel(wanted);
    while (copCars.length < want.cars) spawnCopCar(player);
    while (copCars.length > want.cars) removeCopCar(copCars[copCars.length - 1]);
    while (footCops.length < want.foot) spawnFootCop(player);
    while (footCops.length > want.foot) removeFootCop(footCops[footCops.length - 1]);
  }

  function addWanted(n) {
    const before = wanted;
    wanted = Math.max(0, Math.min(5, wanted + (n | 0)));
    if (wanted > before) hiddenTimer = 0; // fresh heat resets the decay clock
  }

  // Set the level outright (main glue mirrors its own wanted state here).
  // The force itself is re-synced on the next update().
  function setWanted(n) {
    wanted = Math.max(0, Math.min(5, n | 0));
    hiddenTimer = 0;
  }

  // Spawn one patrol car at an exact spot (screenshot staging, missions).
  function spawn(x, z, heading) {
    const before = copCars.length;
    spawnCopCar({ x, z }, { x, z, heading: heading || 0 });
    return copCars.length > before ? copCars[copCars.length - 1].car : null;
  }

  // Release a cop car from the force (e.g. the player just stole it):
  // the mesh stays in the scene, the AI stops driving it.
  function removeCar(car) {
    const entry = copCars.find((e) => e.car === car);
    if (entry) {
      const i = copCars.indexOf(entry);
      if (i >= 0) copCars.splice(i, 1);
      return true;
    }
    return false;
  }

  function reset() {
    while (copCars.length > 0) removeCopCar(copCars[0]);
    while (footCops.length > 0) removeFootCop(footCops[0]);
    wanted = 0;
    hiddenTimer = 0;
    bustTimer = 0;
  }

  function nearestCopDist(x, z) {
    let best = Infinity;
    for (const e of copCars) {
      best = Math.min(best, Math.hypot(e.car.x - x, e.car.z - z));
    }
    for (const f of footCops) {
      best = Math.min(best, Math.hypot(f.x - x, f.z - z));
    }
    return best;
  }

  function update(dt, player, cars) {
    dt = Math.min(dt, 0.05);
    if (!player) return { busted: false };

    // Flash the light bars on a steady beat.
    flashTimer += dt;
    if (flashTimer > 0.35) {
      flashTimer = 0;
      flashOn = !flashOn;
      for (const e of copCars) {
        e.lightL.material.color.setHex(flashOn ? 0xff2222 : 0x550000);
        e.lightR.material.color.setHex(flashOn ? 0x111188 : 0x2244ff);
      }
    }

    if (wanted <= 0) {
      // No heat: clear any leftover cops and idle.
      if (copCars.length > 0 || footCops.length > 0) reset();
      return { busted: false };
    }

    syncForce(player);

    // --- wanted decay: -1 per 20 s while no cop is within 60 m ---
    const nearest = nearestCopDist(player.x, player.z);
    if (nearest > HIDE_RADIUS) {
      hiddenTimer += dt;
      if (hiddenTimer >= DECAY_SECONDS) {
        hiddenTimer = 0;
        wanted = Math.max(0, wanted - 1);
        syncForce(player);
      }
    } else {
      hiddenTimer = 0;
    }

    const onFoot = player.onFoot === undefined ? !player.inCar : !!player.onFoot;

    // --- police cars: chase the player and ram ---
    for (const entry of copCars) {
      const car = entry.car;
      // Recycle a cop that fell far behind back onto a road near the player.
      if (Math.hypot(car.x - player.x, car.z - player.z) > DESPAWN_DIST) {
        const p = randomRoadPointNear(city, player.x, player.z, 45, 80);
        car.x = p.x;
        car.z = p.z;
        car.speed = 0;
      }

      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const wantHeading = Math.atan2(-dx, -dz);
      let headingErr = wantHeading - car.heading;
      while (headingErr > Math.PI) headingErr -= Math.PI * 2;
      while (headingErr < -Math.PI) headingErr += Math.PI * 2;

      // Don't plough through a traffic car sitting between us and the player.
      let blocked = false;
      if (cars) {
        for (const other of cars) {
          if (other === car) continue;
          const odx = other.x - car.x;
          const odz = other.z - car.z;
          const od = Math.hypot(odx, odz);
          if (od < 7 && od < dist && (odx * dx + odz * dz) / (od * dist) > 0.85) {
            blocked = true;
            break;
          }
        }
      }

      const controls = {
        throttle: blocked ? 0 : 1,
        steer: Math.max(-1, Math.min(1, headingErr * 1.8)),
        brake: blocked,
        handbrake: false,
      };
      driveCar(car, dt, controls, city);
      // Police cars run a hotter top speed than their sedan base.
      if (car.speed > COP_CAR_SPEED) car.speed = COP_CAR_SPEED;

      // Ram: shove the player a touch when we make contact.
      if (dist < car.length / 2 + 1.6) {
        const push = 2.2 * dt;
        player.x += (dx / dist) * push;
        player.z += (dz / dist) * push;
      }
    }

    // --- on-foot cops: jog after the player ---
    let copClose = false;
    for (const f of footCops) {
      const dx = player.x - f.x;
      const dz = player.z - f.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      if (dist > 0.4) {
        f.heading = Math.atan2(-dx, -dz);
        const step = Math.min(FOOT_COP_SPEED * dt, dist);
        let nx = f.x - Math.sin(f.heading) * step;
        let nz = f.z - Math.cos(f.heading) * step;
        if (city && typeof city.collideCircle === 'function') {
          if (city.collideCircle(nx, f.z, 0.5)) nx = f.x;
          if (city.collideCircle(f.x, nz, 0.5)) nz = f.z;
        }
        f.x = nx;
        f.z = nz;
        f.legSwing += dt * 9;
      }
      f.mesh.position.set(f.x, Math.abs(Math.sin(f.legSwing)) * 0.04, f.z);
      f.mesh.rotation.y = f.heading;
      if (dist < BUST_DIST) copClose = true;
    }

    // --- busted: a foot cop within 2 m of an on-foot player for 2 s ---
    if (copClose && onFoot) {
      bustTimer += dt;
      if (bustTimer >= BUST_SECONDS) {
        reset(); // wanted drops to 0; caller handles $100 loss + respawn
        return { busted: true };
      }
    } else {
      bustTimer = Math.max(0, bustTimer - dt * 2);
    }

    return { busted: false };
  }

  return {
    get wanted() {
      return wanted;
    },
    get cars() {
      return copCars.map((e) => e.car);
    },
    addWanted,
    setWanted,
    spawn,
    removeCar,
    update,
    reset,
    clear: reset,
    nearestCopDist,
  };
}
