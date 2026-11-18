// vehicles.js — Solmara (gta6-01)
// Low-poly cars + arcade driving physics. Plain ES module, no build step.
// Ground plane y = 0, x east, z south. Heading is rotation around Y:
// heading 0 faces -z (north), heading grows clockwise viewed from above.

import * as THREE from '../vendor/three.module.js';

// ---------------------------------------------------------------------------
// Car types: distinct top speed / acceleration / colour per type.
// topSpeed and accel are in m/s and m/s^2.
// ---------------------------------------------------------------------------
export const CAR_TYPES = {
  sedan:  { topSpeed: 30, accel: 13, color: 0x3a6fd8, length: 4.2, width: 1.9 },
  taxi:   { topSpeed: 28, accel: 12, color: 0xf7c948, length: 4.2, width: 1.9 },
  muscle: { topSpeed: 42, accel: 19, color: 0xc0392b, length: 4.5, width: 2.0 },
  van:    { topSpeed: 22, accel: 8,  color: 0x8a97a5, length: 5.2, width: 2.1 },
};

const WHEEL_R = 0.34;
const WHEEL_W = 0.24;

// ---------------------------------------------------------------------------
// createCarMesh(type, color) -> THREE.Group
// Low-poly car: body + cabin + 4 wheels + headlights, blob shadow underneath.
// `color` overrides the type default. The group origin is at ground level
// (y = 0) at the car's centre; forward is -z when heading is 0.
// ---------------------------------------------------------------------------
export function createCarMesh(type, color) {
  const def = CAR_TYPES[type] || CAR_TYPES.sedan;
  const paint = color !== undefined ? color : def.color;
  const L = def.length;
  const W = def.width;

  const group = new THREE.Group();
  group.name = `car-${type}`;

  const paintMat = new THREE.MeshLambertMaterial({ color: paint });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1b2a3a });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb8bec6 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f2b });

  // Body: lower slab.
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.62, L), paintMat);
  body.position.y = 0.55;
  group.add(body);

  // Cabin: smaller box on top, slightly towards the rear.
  const cabinLen = type === 'van' ? L * 0.72 : L * 0.48;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.86, 0.55, cabinLen),
    glassMat,
  );
  cabin.position.set(0, 1.12, type === 'van' ? -L * 0.04 : L * 0.06);
  group.add(cabin);

  // Roof panel in body colour so the cabin reads as windows + roof.
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.8, 0.08, cabinLen * 0.55),
    paintMat,
  );
  roof.position.set(0, 1.42, type === 'van' ? -L * 0.04 : L * 0.06);
  group.add(roof);

  // Wheels: cylinders rotated so their axis is across the car (x axis).
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, WHEEL_W + 0.02, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const wheelZ = L / 2 - 0.85;
  const wheelX = W / 2 - 0.05;
  const wheels = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Group();
      const tyre = new THREE.Mesh(wheelGeo, tyreMat);
      const hub = new THREE.Mesh(hubGeo, hubMat);
      wheel.add(tyre);
      wheel.add(hub);
      wheel.position.set(sx * wheelX, WHEEL_R, sz * wheelZ);
      group.add(wheel);
      wheels.push(wheel);
    }
  }
  group.userData.wheels = wheels;

  // Headlights (front, -z) and tail lights (rear, +z).
  const lampGeo = new THREE.BoxGeometry(0.34, 0.14, 0.06);
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(lampGeo, lightMat);
    head.position.set(sx * (W / 2 - 0.35), 0.62, -L / 2 - 0.01);
    group.add(head);
    const tail = new THREE.Mesh(lampGeo, tailMat);
    tail.position.set(sx * (W / 2 - 0.35), 0.62, L / 2 + 0.01);
    group.add(tail);
  }

  // Taxi roof sign.
  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.16, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffe14d }),
    );
    sign.position.set(0, 1.52, L * 0.06);
    group.add(sign);
  }

  // Blob shadow: dark translucent circle hugging the ground.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(W / 2 + 0.45, L / 2 + 0.45, 1);
  shadow.position.y = 0.02;
  group.add(shadow);

  return group;
}

// ---------------------------------------------------------------------------
// createCar(type, x, z, heading, color?) -> car object
// { mesh, x, z, heading, speed, type, color, isPlayer, isPolice, length,
//   width, radius }
// heading in radians, 0 = facing -z (north). speed in m/s (signed: negative
// means reversing). `color` (CSS string or hex) overrides the type default.
// ---------------------------------------------------------------------------
export function createCar(type, x, z, heading, color) {
  const def = CAR_TYPES[type] || CAR_TYPES.sedan;
  const mesh = createCarMesh(type, color !== undefined ? color : def.color);
  const car = {
    mesh,
    x,
    z,
    heading: heading || 0,
    speed: 0,
    type,
    color: color !== undefined ? color : def.color,
    isPlayer: false,
    isPolice: false,
    length: def.length,
    width: def.width,
    radius: Math.max(def.length, def.width) / 2,
  };
  syncMesh(car);
  return car;
}

// Keep the mesh transform in step with the logical state.
export function syncMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

// ---------------------------------------------------------------------------
// driveCar(car, dt, controls, city) — arcade physics.
// controls: { throttle: 0..1, steer: -1..1, brake: bool, handbrake: bool }
// - throttle accelerates forward; brake slows, then reverses once stopped.
// - steering scales with speed and fades at very high speed; handbrake
//   cuts grip for sharper turns at the cost of speed.
// - off-road (not on a road) adds drag; static obstacles use
//   city.collideCircle with axis-separated sliding.
// - R flip / reset is handled by the caller.
// ---------------------------------------------------------------------------
export function driveCar(car, dt, controls, city) {
  const def = CAR_TYPES[car.type] || CAR_TYPES.sedan;
  const c = controls || {};
  const throttle = Math.max(0, Math.min(1, c.throttle || 0));
  const steer = Math.max(-1, Math.min(1, c.steer || 0));
  const braking = !!c.brake;
  const handbrake = !!c.handbrake;

  dt = Math.min(dt, 0.05); // clamp huge steps (tab switch etc.)

  const REVERSE_MAX = 10;
  const moving = Math.abs(car.speed) > 0.05;

  // --- longitudinal ---
  if (handbrake) {
    // Strong decel, keeps a little slide.
    car.speed -= Math.sign(car.speed) * 22 * dt;
    if (Math.abs(car.speed) < 0.3) car.speed = 0;
  } else if (throttle > 0) {
    car.speed += def.accel * throttle * dt;
  } else if (braking) {
    if (car.speed > 0.5) {
      car.speed -= 26 * dt; // brake while moving forward
      if (car.speed < 0) car.speed = 0;
    } else {
      car.speed -= def.accel * 0.55 * dt; // reverse
      if (car.speed < -REVERSE_MAX) car.speed = -REVERSE_MAX;
    }
  } else {
    // Rolling drag + engine braking.
    const drag = 2.2 + Math.abs(car.speed) * 0.045;
    car.speed -= Math.sign(car.speed) * drag * dt;
    if (Math.abs(car.speed) < 0.15) car.speed = 0;
  }

  // Off-road drag: grass / pavement slows the car down.
  if (city && typeof city.isOnRoad === 'function' && !city.isOnRoad(car.x, car.z)) {
    car.speed -= Math.sign(car.speed) * 6 * dt;
    if (Math.abs(car.speed) < 0.2) car.speed = 0;
  }

  // Clamp forward speed to the type's top speed.
  if (car.speed > def.topSpeed) car.speed = def.topSpeed;
  if (car.speed < -REVERSE_MAX) car.speed = -REVERSE_MAX;

  // --- steering ---
  // Turn rate peaks at moderate speed, fades near standstill and at top
  // speed; handbrake roughly doubles the turn rate.
  const speedRatio = Math.min(Math.abs(car.speed) / def.topSpeed, 1);
  const steerAuthority = moving
    ? (0.35 + 0.65 * Math.min(Math.abs(car.speed) / 8, 1)) *
      (1 - 0.35 * speedRatio)
    : 0;
  const turnRate = 2.1 * steerAuthority * (handbrake ? 1.9 : 1);
  car.heading += steer * turnRate * Math.sign(car.speed) * dt;

  // --- translation, axis-separated so the car slides along walls ---
  const fx = -Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  const nx = car.x + fx * car.speed * dt;
  const nz = car.z + fz * car.speed * dt;
  const r = Math.max(car.width / 2, 0.9);

  if (city && typeof city.collideCircle === 'function') {
    if (!city.collideCircle(nx, car.z, r)) car.x = nx;
    else car.speed *= 0.55; // scrub speed on a wall hit
    if (!city.collideCircle(car.x, nz, r)) car.z = nz;
    else car.speed *= 0.55;
  } else {
    car.x = nx;
    car.z = nz;
  }

  // --- visuals: spin the wheels, lean the body slightly into turns ---
  const wheels = car.mesh.userData.wheels;
  if (wheels) {
    const spin = (car.speed * dt) / WHEEL_R;
    for (const w of wheels) w.rotation.x += spin;
  }
  car.mesh.rotation.z = -steer * Math.min(Math.abs(car.speed) / def.topSpeed, 1) * 0.05;

  syncMesh(car);
}

// ---------------------------------------------------------------------------
// createVehicles({ scene, city, rng }) -> { spawnCar, spawnParked, update }
// Manager the main glue uses: spawnCar adds the mesh to the scene, so the
// caller never has to. spawnParked puts n driverless cars on roads.
// 'sports' is not a CAR_TYPES entry; it maps to the muscle car.
// ---------------------------------------------------------------------------
export function createVehicles(opts) {
  const scene = opts ? opts.scene : null;
  const city = opts ? opts.city : null;
  const rng = (opts && typeof opts.rng === 'function') ? opts.rng : Math.random;
  const parked = [];

  function spawnCar(o) {
    const src = o || {};
    const type = src.type === 'sports' ? 'muscle' : (src.type || 'sedan');
    const car = createCar(type, src.x || 0, src.z || 0, src.heading || 0, src.color);
    car.isPolice = !!src.isPolice;
    if (scene) scene.add(car.mesh);
    return car;
  }

  function spawnParked(n) {
    const out = [];
    const count = Math.max(0, n | 0);
    for (let i = 0; i < count; i++) {
      let x = (rng() * 2 - 1) * 200;
      let z = (rng() * 2 - 1) * 200;
      if (city && typeof city.nearestRoadPoint === 'function') {
        const p = city.nearestRoadPoint(x, z);
        if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
          x = p.x;
          z = p.z;
        }
      }
      const types = Object.keys(CAR_TYPES);
      const type = types[Math.floor(rng() * types.length)];
      const car = spawnCar({ type, x, z, heading: rng() * Math.PI * 2 });
      parked.push(car);
      out.push(car);
    }
    return out;
  }

  // Parked cars do not move; keep their meshes in step in case a caller
  // moved one (player exit parks a car through the main glue, not here).
  function update() {
    for (const car of parked) syncMesh(car);
  }

  return { spawnCar, spawnParked, update, cars: parked };
}
