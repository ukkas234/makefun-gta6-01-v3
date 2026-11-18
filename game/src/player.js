// player.js — Solmara (gta6-01)
// Danny Reyes on foot: third-person movement, mouse-drag orbit camera,
// jump, punch, pistol draw / shoot, car enter/exit, health.
// Plain ES module, no build step, no network requests.
//
// Contract: createPlayer(scene, city) -> { mesh, x, z, heading, speed,
// health, onFoot, car, update(dt, input, city), takeDamage(n),
// setPosition(x, z), getState() }.
// - Ground plane y = 0, x east, z south. Heading 0 faces -z (north),
//   grows clockwise viewed from above (same convention as vehicles.js).
// - city.collideCircle(x, z, r) blocks building AABBs; city.nearestCar
//   (x, z, maxDist) finds a car to enter with E.
// - The camera comes from scene.userData.camera (published by render.js);
//   when it is absent the player still moves, just without camera control.

import * as THREE from '../vendor/three.module.js';

const WALK_SPEED = 4.2;
const RUN_SPEED = 8.5;
const ACCEL = 28;
const JUMP_VELOCITY = 7.5;
const GRAVITY = 20;
const RADIUS = 0.45;
const PUNCH_RANGE = 1.9;
const PUNCH_TIME = 0.35;
const SHOT_COOLDOWN = 0.28;
const ENTER_CAR_DIST = 3.2;
const CAM_DIST = 7.5;
const CAM_HEIGHT = 2.6;

function makeBox(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  return mesh;
}

// Low-poly humanoid (box-based, original design): Danny Reyes —
// teal shirt, dark trousers, dark hair, tan skin.
function buildMesh() {
  const group = new THREE.Group();
  group.name = 'player-danny-reyes';

  const skin = 0xc68e5f;
  const shirt = 0x1f8a70;
  const pants = 0x232a33;
  const hair = 0x1a1210;
  const shoe = 0x111111;

  // Legs (pivot at the hip so they can swing).
  const legL = new THREE.Group();
  legL.position.set(-0.14, 0.55, 0);
  const legLMesh = makeBox(0.22, 0.55, 0.24, pants);
  legLMesh.position.y = -0.27;
  legL.add(legLMesh);
  const shoeL = makeBox(0.24, 0.1, 0.34, shoe);
  shoeL.position.set(0, -0.52, 0.04);
  legL.add(shoeL);

  const legR = new THREE.Group();
  legR.position.set(0.14, 0.55, 0);
  const legRMesh = makeBox(0.22, 0.55, 0.24, pants);
  legRMesh.position.y = -0.27;
  legR.add(legRMesh);
  const shoeR = makeBox(0.24, 0.1, 0.34, shoe);
  shoeR.position.set(0, -0.52, 0.04);
  legR.add(shoeR);

  // Torso.
  const torso = makeBox(0.62, 0.68, 0.32, shirt);
  torso.position.y = 0.9;

  // Head + hair.
  const head = makeBox(0.32, 0.32, 0.3, skin);
  head.position.y = 1.42;
  const hairTop = makeBox(0.34, 0.12, 0.32, hair);
  hairTop.position.y = 1.6;

  // Arms (pivot at the shoulder so they can swing / punch).
  const armL = new THREE.Group();
  armL.position.set(-0.4, 1.2, 0);
  const armLMesh = makeBox(0.17, 0.55, 0.19, shirt);
  armLMesh.position.y = -0.26;
  armL.add(armLMesh);
  const handL = makeBox(0.15, 0.14, 0.16, skin);
  handL.position.y = -0.56;
  armL.add(handL);

  const armR = new THREE.Group();
  armR.position.set(0.4, 1.2, 0);
  const armRMesh = makeBox(0.17, 0.55, 0.19, shirt);
  armRMesh.position.y = -0.26;
  armR.add(armRMesh);
  const handR = makeBox(0.15, 0.14, 0.16, skin);
  handR.position.y = -0.56;
  armR.add(handR);

  // Pistol, held in the right hand; hidden while holstered.
  const pistol = new THREE.Group();
  pistol.position.set(0, -0.62, 0.08);
  const grip = makeBox(0.06, 0.16, 0.07, 0x1a1a1a);
  const barrel = makeBox(0.05, 0.06, 0.26, 0x2a2a2a);
  barrel.position.set(0, 0.06, -0.1);
  pistol.add(grip);
  pistol.add(barrel);
  pistol.visible = false;
  armR.add(pistol);

  // Blob shadow: separate dark circle plane (renderer shadows are OFF).
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;

  group.add(legL, legR, torso, head, hairTop, armL, armR, shadow);
  group.traverse((o) => { o.userData.isPlayerPart = true; });

  return { group, legL, legR, armL, armR, pistol, shadow };
}

export function createPlayer(scene, city) {
  const parts = buildMesh();
  const mesh = parts.group;
  scene.add(mesh);

  const camera = scene.userData.camera || null;
  const raycaster = new THREE.Raycaster();
  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _camDir = new THREE.Vector3();
  const _rayOrigin = new THREE.Vector3();

  const player = {
    mesh,
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    health: 100,
    onFoot: true,
    car: null,
    armed: false,
  };

  let y = 0; // jump height above ground
  let vy = 0;
  let grounded = true;
  let velX = 0;
  let velZ = 0;
  let camYaw = 0; // orbit yaw: camera sits behind the player
  let camPitch = 0.32;
  let walkPhase = 0;
  let punchTimer = 0;
  let shotTimer = 0;
  let hurtTimer = 0;

  function setPosition(x, z) {
    player.x = x;
    player.z = z;
    y = 0;
    vy = 0;
    grounded = true;
    velX = 0;
    velZ = 0;
    mesh.position.set(x, 0, z);
  }

  function takeDamage(n) {
    if (player.health <= 0) return;
    player.health = Math.max(0, player.health - n);
    hurtTimer = 0.3;
  }

  function getState() {
    return {
      x: player.x,
      z: player.z,
      y,
      heading: player.heading,
      speed: player.speed,
      health: player.health,
      onFoot: player.onFoot,
      armed: player.armed,
      car: player.car,
      grounded,
    };
  }

  // Raycast shot from the camera through its centre. Hits are tested
  // against city.shootTargets when provided, else the whole scene
  // (player parts excluded). An object with userData.onShot(point,
  // player) is notified; city.onShoot(point, object) is notified too.
  function shoot() {
    if (!camera) return;
    camera.getWorldDirection(_camDir);
    _rayOrigin.copy(camera.position);
    raycaster.set(_rayOrigin, _camDir);
    raycaster.far = 120;
    let targets = null;
    if (city && Array.isArray(city.shootTargets)) targets = city.shootTargets;
    else targets = scene.children;
    const hits = raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
      let o = hit.object;
      let isPlayer = false;
      while (o) {
        if (o.userData && o.userData.isPlayerPart) { isPlayer = true; break; }
        o = o.parent;
      }
      if (isPlayer) continue;
      if (hit.object.userData && typeof hit.object.userData.onShot === 'function') {
        hit.object.userData.onShot(hit.point, player);
      }
      if (city && typeof city.onShoot === 'function') city.onShoot(hit.point, hit.object);
      return;
    }
    if (city && typeof city.onShoot === 'function') city.onShoot(null, null);
  }

  function punch() {
    punchTimer = PUNCH_TIME;
    // Optional hook for the world (enemies / props): punch point ahead.
    if (city && typeof city.onPunch === 'function') {
      const px = player.x - Math.sin(player.heading) * PUNCH_RANGE;
      const pz = player.z - Math.cos(player.heading) * PUNCH_RANGE;
      city.onPunch(px, pz, player);
    }
  }

  function enterCar(car) {
    player.car = car;
    player.onFoot = false;
    if (car) car.isPlayer = true;
    mesh.visible = false;
    velX = 0;
    velZ = 0;
    player.speed = 0;
  }

  function exitCar() {
    const car = player.car;
    player.car = null;
    player.onFoot = true;
    if (car) {
      car.isPlayer = false;
      // Step out to the driver's side (left of the car, heading -z = north).
      const sx = -Math.cos(car.heading);
      const sz = Math.sin(car.heading);
      setPosition(car.x + sx * 2.2, car.z + sz * 2.2);
      player.heading = car.heading;
    }
    mesh.visible = true;
  }

  function update(dt, input, cityArg) {
    const c = cityArg || city;
    const step = Math.max(0, Math.min(dt || 0, 0.1));
    if (step === 0) return;
    if (shotTimer > 0) shotTimer -= step;
    if (hurtTimer > 0) hurtTimer -= step;

    // --- camera orbit (drag) — on foot only; driving owns the camera.
    if (player.onFoot && camera && input) {
      camYaw -= (input.mouseDX || 0) * 0.005;
      camPitch += (input.mouseDY || 0) * 0.004;
      camPitch = Math.max(-0.15, Math.min(1.05, camPitch));
    }

    // --- car enter / exit.
    if (input && input.pressed('KeyE')) {
      if (player.onFoot && c && typeof c.nearestCar === 'function') {
        const car = c.nearestCar(player.x, player.z, ENTER_CAR_DIST);
        if (car) enterCar(car);
      } else if (!player.onFoot) {
        exitCar();
      }
    }

    // --- riding in a car: follow the car, mesh hidden.
    if (!player.onFoot && player.car) {
      player.x = player.car.x;
      player.z = player.car.z;
      player.heading = player.car.heading;
      player.speed = Math.abs(player.car.speed || 0);
      mesh.position.set(player.x, 0, player.z);
      mesh.rotation.y = player.heading;
      return;
    }
    if (!player.onFoot && !player.car) {
      // Car vanished (despawned): drop back on foot where we stand.
      player.onFoot = true;
      mesh.visible = true;
    }

    if (player.health <= 0) {
      // Down: no movement, slumped pose.
      velX = 0;
      velZ = 0;
      player.speed = 0;
      mesh.rotation.x = -Math.PI / 2 + 0.15;
      mesh.position.set(player.x, 0.3, player.z);
      return;
    }
    mesh.rotation.x = 0;

    // --- weapon state.
    if (input && input.pressed('KeyQ')) {
      player.armed = !player.armed;
      parts.pistol.visible = player.armed;
    }

    // --- movement input, camera-relative (WASD + arrows).
    let ix = 0;
    let iz = 0;
    if (input) {
      if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) iz -= 1;
      if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) iz += 1;
      if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) ix -= 1;
      if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) ix += 1;
    }
    const moving = ix !== 0 || iz !== 0;
    const running = input && (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight'));
    const targetSpeed = moving ? (running ? RUN_SPEED : WALK_SPEED) : 0;

    // Camera forward on the ground plane (camera sits behind player).
    _fwd.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    _right.crossVectors(_fwd, _up).negate();
    // cross(fwd, up) points left for fwd=-z; negate -> right = +x. Verify:
    // fwd=(0,0,-1), up=(0,1,0): cross = (0*0-(-1)*1, ...) = (1,0,0) is
    // already +x, so negate would be wrong — recompute directly instead.
    _right.set(-_fwd.z, 0, _fwd.x);

    let mx = 0;
    let mz = 0;
    if (moving) {
      mx = _fwd.x * -iz + _right.x * ix;
      mz = _fwd.z * -iz + _right.z * ix;
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
    }

    // Accelerate / decelerate toward the target velocity.
    const rate = ACCEL * step;
    velX += Math.max(-rate, Math.min(rate, mx * targetSpeed - velX));
    velZ += Math.max(-rate, Math.min(rate, mz * targetSpeed - velZ));
    player.speed = Math.hypot(velX, velZ);

    // Axis-separated collision against buildings (city.collideCircle).
    const r = RADIUS;
    if (c && typeof c.collideCircle === 'function') {
      const nx = player.x + velX * step;
      if (!c.collideCircle(nx, player.z, r)) player.x = nx;
      else velX = 0;
      const nz = player.z + velZ * step;
      if (!c.collideCircle(player.x, nz, r)) player.z = nz;
      else velZ = 0;
    } else {
      player.x += velX * step;
      player.z += velZ * step;
    }

    // Face the movement direction.
    if (player.speed > 0.5) {
      const targetHeading = Math.atan2(mx, mz);
      let diff = targetHeading - player.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.heading += Math.max(-12 * step, Math.min(12 * step, diff));
    }

    // --- jump (Space).
    if (input && input.pressed('Space') && grounded) {
      vy = JUMP_VELOCITY;
      grounded = false;
    }
    if (!grounded) {
      vy -= GRAVITY * step;
      y += vy * step;
      if (y <= 0) {
        y = 0;
        vy = 0;
        grounded = true;
      }
    }

    // --- punch (F) / shoot (LMB) — punch when unarmed, shoot when armed.
    if (input && input.pressed('KeyF') && punchTimer <= 0) punch();
    if (input && player.armed && shotTimer <= 0 && input.consumeClick()) {
      shotTimer = SHOT_COOLDOWN;
      shoot();
    }
    if (punchTimer > 0) punchTimer -= step;

    // --- mesh transform + walk / punch / aim animation.
    mesh.position.set(player.x, y, player.z);
    mesh.rotation.y = player.heading;

    const speedFactor = Math.min(1, player.speed / RUN_SPEED);
    if (player.speed > 0.3 && grounded) {
      walkPhase += step * player.speed * 1.9;
    }
    const swing = Math.sin(walkPhase) * 0.65 * speedFactor;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    if (punchTimer > 0) {
      // Right arm punches forward; left arm keeps a guard swing.
      const p = 1 - punchTimer / PUNCH_TIME;
      parts.armR.rotation.x = -Math.PI / 2 * Math.sin(p * Math.PI);
      parts.armL.rotation.x = -swing * 0.5;
    } else if (player.armed) {
      // Pistol raised, both arms forward.
      parts.armR.rotation.x = -Math.PI / 2 + 0.15;
      parts.armL.rotation.x = -Math.PI / 2 + 0.35;
    } else {
      parts.armR.rotation.x = -swing;
      parts.armL.rotation.x = swing;
    }
    // Blob shadow stays on the ground and shrinks with jump height.
    parts.shadow.position.y = 0.02 - y;
    const shadowScale = Math.max(0.55, 1 - y * 0.09);
    parts.shadow.scale.setScalar(shadowScale);
    // Hurt flash: torso tint is skipped (Lambert shared mats) — the
    // mesh dips briefly instead.
    mesh.position.y = y - (hurtTimer > 0 ? 0.06 : 0);

    // --- third-person camera follow.
    if (camera) {
      const cp = Math.cos(camPitch);
      const sp = Math.sin(camPitch);
      const cx = player.x + Math.sin(camYaw) * cp * CAM_DIST;
      const cz = player.z + Math.cos(camYaw) * cp * CAM_DIST;
      const cy = CAM_HEIGHT + sp * CAM_DIST;
      camera.position.set(cx, Math.max(cy, 0.6), cz);
      camera.lookAt(player.x, 1.5 + y * 0.5, player.z);
    }
  }

  player.update = update;
  player.takeDamage = takeDamage;
  player.setPosition = setPosition;
  player.getState = getState;
  player.enterCar = enterCar;
  player.exitCar = exitCar;

  setPosition(0, 0);
  return player;
}
