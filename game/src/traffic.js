// traffic.js — Solmara (gta6-01)
// Ambient AI traffic. Cars follow the road network, turn at intersections,
// and stop when another car is close ahead. Plain ES module, no build step.
//
// The city only exposes: collideCircle(x, z, r), isOnRoad(x, z) and
// nearestRoadPoint(x, z) -> { x, z } | null. Roads are assumed to run along
// the cardinal axes (a city grid), so each AI car travels in one of the
// four cardinal directions and re-picks its direction whenever the road
// ahead ends or at an intersection.

import { createCar, driveCar, CAR_TYPES } from './vehicles.js';

const CARDINAL = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // N, E, S, W headings
const STOP_DIST = 9; // stop if a car is closer than this ahead
const LOOK_AHEAD = 7; // how far ahead to probe the road
const DESPAWN_DIST = 230; // recycle cars further than this from the player
const RESPAWN_DIST = 95; // respawn distance band around the player

function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function randomType() {
  const types = Object.keys(CAR_TYPES);
  // Vans are rarer than the rest.
  const pick = types[Math.floor(Math.random() * types.length)];
  return pick === 'van' && Math.random() < 0.5 ? 'sedan' : pick;
}

// Pick a random road point inside a square around (cx, cz). Retries a few
// times; returns null when the city cannot supply a road point.
function randomRoadPoint(city, cx, cz, halfSize) {
  for (let i = 0; i < 12; i++) {
    const x = cx + (Math.random() * 2 - 1) * halfSize;
    const z = cz + (Math.random() * 2 - 1) * halfSize;
    if (typeof city.nearestRoadPoint === 'function') {
      const p = city.nearestRoadPoint(x, z);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return p;
    } else if (city.isOnRoad(x, z)) {
      return { x, z };
    }
  }
  return null;
}

// Is there driveable road from (x, z) in compass direction `heading`?
function roadInDirection(city, x, z, heading) {
  const px = x - Math.sin(heading) * LOOK_AHEAD;
  const pz = z - Math.cos(heading) * LOOK_AHEAD;
  return city.isOnRoad(px, pz);
}

// Choose a new cardinal direction at the car's current spot: keep going
// straight if possible, else turn left / right, else U-turn. At an
// intersection (several open directions) occasionally turn anyway so the
// traffic does not all stream one way.
function pickDirection(city, ai, forceTurn) {
  const open = CARDINAL.filter((h) => roadInDirection(city, ai.car.x, ai.car.z, h));
  if (open.length === 0) return ai.dir; // nowhere to go; keep heading
  const straight = open.find((h) => Math.abs(clampAngle(h - ai.dir)) < 0.01);
  if (!forceTurn && straight !== undefined && Math.random() > 0.12) return straight;
  const turns = open.filter((h) => h !== straight);
  if (turns.length > 0 && (forceTurn || Math.random() < 0.3)) {
    return turns[Math.floor(Math.random() * turns.length)];
  }
  return straight !== undefined ? straight : open[0];
}

function makeAiCar(scene, city, x, z) {
  const type = randomType();
  const def = CAR_TYPES[type];
  const dir = CARDINAL[Math.floor(Math.random() * CARDINAL.length)];
  const car = createCar(type, x, z, dir);
  scene.add(car.mesh);
  return {
    car,
    dir,
    // Cruise at 55–80% of the type's top speed so traffic feels varied.
    cruise: def.topSpeed * (0.55 + Math.random() * 0.25),
    retargetTimer: 1 + Math.random() * 2,
    resnapCooldown: 0,
    stopped: false,
  };
}

// ---------------------------------------------------------------------------
// createTraffic(scene, city, count) -> { cars[], update(dt, playerPos),
//                                        nearestCar(x, z, maxDist) }
// cars[] holds the raw car objects from vehicles.js (mesh, x, z, heading,
// speed, type, ...). playerPos is { x, z } and may be omitted.
// ---------------------------------------------------------------------------
export function createTraffic(scene, city, count) {
  const list = [];
  const target = Math.max(0, count | 0);

  for (let i = 0; i < target; i++) {
    const p = randomRoadPoint(city, 0, 0, 160);
    if (!p) break;
    list.push(makeAiCar(scene, city, p.x, p.z));
  }

  // Is there a car close ahead of `ai` (in its direction of travel)?
  function carAhead(ai, allCars, playerPos) {
    const fx = -Math.sin(ai.dir);
    const fz = -Math.cos(ai.dir);
    let nearest = Infinity;
    const check = (ox, oz) => {
      const dx = ox - ai.car.x;
      const dz = oz - ai.car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1 || dist > STOP_DIST) return;
      // Only cars roughly in front of us count.
      if ((dx * fx + dz * fz) / dist > 0.6 && dist < nearest) nearest = dist;
    };
    for (const other of allCars) {
      if (other !== ai) check(other.car.x, other.car.z);
    }
    if (playerPos) check(playerPos.x, playerPos.z);
    return nearest;
  }

  function update(dt, playerPos) {
    dt = Math.min(dt, 0.05);
    const px = playerPos ? playerPos.x : 0;
    const pz = playerPos ? playerPos.z : 0;

    for (const ai of list) {
      const car = ai.car;

      // Recycle cars that drifted far from the player back onto a road
      // near the player, so the streets around the player stay alive.
      if (playerPos && Math.hypot(car.x - px, car.z - pz) > DESPAWN_DIST) {
        const p = randomRoadPoint(city, px, pz, RESPAWN_DIST);
        if (p) {
          car.x = p.x;
          car.z = p.z;
          car.speed = 0;
          ai.dir = CARDINAL[Math.floor(Math.random() * CARDINAL.length)];
          car.heading = ai.dir;
        }
        continue;
      }

      // If we somehow ended up off the road, snap back to the nearest
      // road point — but only when that point is genuinely on a road, and
      // at most once a second. Blindly re-snapping every frame to a bad
      // point would pin the car in place forever.
      ai.resnapCooldown -= dt;
      if (!city.isOnRoad(car.x, car.z)) {
        const p = city.nearestRoadPoint
          ? city.nearestRoadPoint(car.x, car.z)
          : null;
        if (p && ai.resnapCooldown <= 0 && city.isOnRoad(p.x, p.z)) {
          car.x = p.x;
          car.z = p.z;
          car.speed = Math.min(car.speed, 4);
          ai.dir = pickDirection(city, ai, true);
          ai.resnapCooldown = 1;
        } else if (p) {
          // No valid snap (yet): steer towards the nearest road point
          // instead of standing still.
          const want = Math.atan2(-(p.x - car.x), -(p.z - car.z));
          const snapped = CARDINAL.reduce((best, h) =>
            Math.abs(clampAngle(h - want)) < Math.abs(clampAngle(best - want)) ? h : best,
          CARDINAL[0]);
          ai.dir = snapped;
        } else {
          ai.dir = pickDirection(city, ai, true);
        }
      }

      // Road ahead ending? Turn now.
      if (!roadInDirection(city, car.x, car.z, ai.dir)) {
        ai.dir = pickDirection(city, ai, true);
      }

      // Random re-decision at intersections (road open in several dirs).
      ai.retargetTimer -= dt;
      if (ai.retargetTimer <= 0) {
        ai.retargetTimer = 2 + Math.random() * 3;
        ai.dir = pickDirection(city, ai, false);
      }

      // Stop for the car ahead; ease back up to cruise speed otherwise.
      const ahead = carAhead(ai, list, playerPos);
      const wantStop = ahead < STOP_DIST;
      const targetSpeed = wantStop ? 0 : ai.cruise;

      const headingErr = clampAngle(ai.dir - car.heading);
      const steer = Math.max(-1, Math.min(1, headingErr * 1.6));
      const controls = { throttle: 0, steer, brake: false, handbrake: false };
      if (car.speed < targetSpeed - 0.5) controls.throttle = 0.7;
      else if (car.speed > targetSpeed + 0.5) controls.brake = true;

      driveCar(car, dt, controls, city);
    }
  }

  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestDist = maxDist === undefined ? Infinity : maxDist;
    for (const ai of list) {
      const d = Math.hypot(ai.car.x - x, ai.car.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = ai.car;
      }
    }
    return best;
  }

  return {
    cars: list.map((ai) => ai.car),
    update,
    nearestCar,
  };
}
