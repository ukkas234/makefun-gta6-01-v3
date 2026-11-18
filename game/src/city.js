// Solmara — procedural coastal city: 10x10 block grid, beach + water on the
// south edge, low-poly hills backdrop. Plain ES module, no external assets.
// Ground plane y=0, x east, z south.
import * as THREE from '../vendor/three.module.js';
import { CITY, ROAD_LINES, COAST, COLORS } from './config.js';
import { range, rangeInt, pick, chance } from './random.js';
import {
  asphaltTexture,
  sidewalkTexture,
  facadeTexture,
  grassTexture,
  sandTexture,
  waterTexture,
  neonTexture,
} from './textures.js';

const HALF = CITY.half;
const ROAD_HALF = CITY.road / 2;

// Block centres: -234 .. 234 step 52 (10 per axis).
function blockCenters() {
  return Array.from({ length: CITY.blocks }, (_, i) => -HALF + CITY.road + CITY.block / 2 + i * CITY.pitch);
}

function nearestLine(v) {
  let best = ROAD_LINES[0];
  for (const line of ROAD_LINES) {
    if (Math.abs(line - v) < Math.abs(best - v)) best = line;
  }
  return best;
}

export function createCity(scene, rng) {
  const colliders = []; // {x, z, hx, hz} axis-aligned boxes
  const buildings = []; // {x, z, w, d, h, mesh}
  const group = new THREE.Group();
  group.name = 'solmara-city';
  scene.add(group);

  const asphalt = asphaltTexture();
  const sidewalk = sidewalkTexture();
  const grass = grassTexture();
  const sand = sandTexture();
  const water = waterTexture();

  const groundMat = new THREE.MeshLambertMaterial({ map: grass });
  const asphaltMat = new THREE.MeshLambertMaterial({ map: asphalt });
  const sidewalkMat = new THREE.MeshLambertMaterial({ map: sidewalk });
  const sandMat = new THREE.MeshLambertMaterial({ map: sand });
  const waterMat = new THREE.MeshLambertMaterial({ map: water });
  const roofMat = new THREE.MeshLambertMaterial({ color: COLORS.buildingRoof });
  const hillMat = new THREE.MeshLambertMaterial({ color: COLORS.hill, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32, flatShading: true });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: COLORS.headlight });

  function addBox(w, h, d, x, y, z, mat, parent = group) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  // --- Ground: grass base, asphalt road strips, sidewalk block slabs ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CITY.size + 80, CITY.size + 80), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // Road strips (both axes) sit just above the ground plane.
  for (const line of ROAD_LINES) {
    const alongX = new THREE.Mesh(new THREE.PlaneGeometry(CITY.size, CITY.road), asphaltMat);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0, line);
    group.add(alongX);
    const alongZ = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, CITY.size), asphaltMat);
    alongZ.rotation.x = -Math.PI / 2;
    alongZ.position.set(line, 0, 0);
    group.add(alongZ);
  }

  // Sidewalk slabs fill each block between the roads.
  const slabGeo = new THREE.BoxGeometry(CITY.block, 0.12, CITY.block);
  for (const bx of blockCenters()) {
    for (const bz of blockCenters()) {
      const slab = new THREE.Mesh(slabGeo, sidewalkMat);
      slab.position.set(bx, 0.06, bz);
      group.add(slab);
    }
  }

  // --- Coast: sand beach + water on the south edge ---
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size + 80, COAST.beachWidth),
    sandMat,
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.01, HALF + COAST.beachWidth / 2);
  group.add(beach);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size + 400, COAST.waterDepth),
    waterMat,
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.2, COAST.waterStart + COAST.waterDepth / 2);
  group.add(sea);

  // --- Hills backdrop: low-poly cones ringing north, west, east ---
  const hillGeo = new THREE.ConeGeometry(1, 1, 5);
  const hillSpots = [];
  for (let x = -420; x <= 420; x += 60) hillSpots.push([x, -HALF - 70 - (Math.abs(x) % 3) * 12]);
  for (let z = -260; z <= 260; z += 70) {
    hillSpots.push([-HALF - 70, z]);
    hillSpots.push([HALF + 70, z]);
  }
  for (const [hx, hz] of hillSpots) {
    const h = range(rng, 55, 130);
    const r = range(rng, 55, 110);
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.scale.set(r, h, r);
    hill.position.set(hx + range(rng, -15, 15), h / 2 - 2, hz + range(rng, -15, 15));
    hill.rotation.y = range(rng, 0, Math.PI);
    group.add(hill);
  }

  // --- Buildings: 1-4 per block, heights 8-60 m, lit canvas facades ---
  const facadeMats = Array.from({ length: 10 }, (_, v) => {
    const tex = facadeTexture(v, true);
    return new THREE.MeshLambertMaterial({ map: tex });
  });
  const neonSigns = ['HOTEL', 'BAR', '24H', 'CLUB', 'PIZZA', 'TATTOO', 'MOTEL', 'CASINO'];
  const neonColors = [COLORS.neonPink, COLORS.neonCyan, COLORS.neonAmber];

  for (const bx of blockCenters()) {
    for (const bz of blockCenters()) {
      const count = rangeInt(rng, 1, 4);
      // Split the 40 m block into a grid of plots and fill `count` of them.
      const plots = count === 1
        ? [{ dx: 0, dz: 0, w: 30, d: 30 }]
        : count === 2
          ? [
            { dx: -8, dz: 0, w: 16, d: 28 },
            { dx: 9, dz: 0, w: 16, d: 28 },
          ]
          : count === 3
            ? [
              { dx: -9, dz: -8, w: 16, d: 14 },
              { dx: 9, dz: -8, w: 16, d: 14 },
              { dx: 0, dz: 9, w: 30, d: 14 },
            ]
            : [
              { dx: -9, dz: -9, w: 16, d: 16 },
              { dx: 9, dz: -9, w: 16, d: 16 },
              { dx: -9, dz: 9, w: 16, d: 16 },
              { dx: 9, dz: 9, w: 16, d: 16 },
            ];
      for (const plot of plots) {
        const w = plot.w * range(rng, 0.85, 1);
        const d = plot.d * range(rng, 0.85, 1);
        const h = pick(rng, [8, 12, 16, 20, 26, 32, 40, 48, 60]) * range(rng, 0.9, 1.1);
        const x = bx + plot.dx;
        const z = bz + plot.dz;
        const variant = rangeInt(rng, 0, 9);
        const side = facadeMats[variant];
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          [side, side, roofMat, roofMat, side, side],
        );
        mesh.position.set(x, h / 2 + 0.12, z);
        group.add(mesh);
        buildings.push({ x, z, w, d, h, mesh });
        colliders.push({ x, z, hx: w / 2, hz: d / 2 });
        // Rooftop box on taller towers.
        if (h > 30 && chance(rng, 0.5)) {
          addBox(w * 0.3, 3, d * 0.3, x, h + 1.6, z, roofMat);
          colliders.push({ x, z, hx: w * 0.15, hz: d * 0.15 });
        }
        // Neon shop sign on some low buildings, facing a road.
        if (h <= 20 && chance(rng, 0.35)) {
          const label = pick(rng, neonSigns);
          const color = pick(rng, neonColors);
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(14, w * 0.8), 2.2),
            new THREE.MeshBasicMaterial({
              map: neonTexture(label, `#${color.toString(16).padStart(6, '0')}`),
              transparent: true,
            }),
          );
          sign.position.set(x, Math.min(h - 1.5, 6), z - d / 2 - 0.15);
          sign.rotation.y = Math.PI;
          group.add(sign);
        }
      }
    }
  }

  // --- Corner planters: concrete boxes with shrubs at each block corner,
  // so sidewalks are not just flat slabs — and cars cannot cut corners ---
  const planterMat = new THREE.MeshLambertMaterial({ color: 0x4a4d55 });
  const shrubMat = new THREE.MeshLambertMaterial({ color: 0x2f6b34, flatShading: true });
  const planterGeo = new THREE.BoxGeometry(2, 0.9, 2);
  const shrubGeo = new THREE.BoxGeometry(1.6, 0.9, 1.6);
  for (const bx of blockCenters()) {
    for (const bz of blockCenters()) {
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = bx + cx * (CITY.block / 2 - 2);
        const pz = bz + cz * (CITY.block / 2 - 2);
        const planter = new THREE.Mesh(planterGeo, planterMat);
        planter.position.set(px, 0.57, pz);
        group.add(planter);
        const shrub = new THREE.Mesh(shrubGeo, shrubMat);
        shrub.position.set(px, 1.4, pz);
        group.add(shrub);
        colliders.push({ x: px, z: pz, hx: 1, hz: 1 });
      }
    }
  }

  // --- Street props: palms along the beach + lamps along roads ---
  const palmTrunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const palmTopGeo = new THREE.ConeGeometry(2.2, 3.5, 6);
  for (let x = -HALF + 20; x <= HALF - 20; x += 26) {
    const z = HALF + 12 + range(rng, -4, 4);
    const trunk = new THREE.Mesh(palmTrunkGeo, trunkMat);
    trunk.position.set(x, 3, z);
    trunk.rotation.z = range(rng, -0.08, 0.08);
    group.add(trunk);
    const top = new THREE.Mesh(palmTopGeo, palmMat);
    top.position.set(x, 7.2, z);
    group.add(top);
    colliders.push({ x, z, hx: 0.6, hz: 0.6 });
  }

  const lampPoleGeo = new THREE.CylinderGeometry(0.12, 0.12, 7, 6);
  const lampBulbGeo = new THREE.SphereGeometry(0.35, 8, 6);
  for (const line of ROAD_LINES) {
    for (let t = -HALF + 26; t <= HALF - 26; t += 104) {
      for (const [lx, lz] of [[line + ROAD_HALF + 1.2, t], [t, line + ROAD_HALF + 1.2]]) {
        // Keep lamps off intersections and off the beach road's south side.
        if (Math.abs(nearestLine(lx) - lx) < 1 || Math.abs(nearestLine(lz) - lz) < 1) continue;
        if (lz > HALF + 2 || lx > HALF + 2) continue;
        const pole = new THREE.Mesh(lampPoleGeo, lampMat);
        pole.position.set(lx, 3.5, lz);
        group.add(pole);
        const bulb = new THREE.Mesh(lampBulbGeo, lampGlowMat);
        bulb.position.set(lx, 7.1, lz);
        group.add(bulb);
        colliders.push({ x: lx, z: lz, hx: 0.35, hz: 0.35 });
      }
    }
  }

  // --- Road graph: nodes at every intersection, edges to 4 neighbours ---
  const roadGraph = { nodes: [], edges: [] };
  const nodeIndex = new Map();
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      nodeIndex.set(`${x},${z}`, roadGraph.nodes.length);
      roadGraph.nodes.push({ x, z });
    }
  }
  for (const { x, z } of roadGraph.nodes) {
    const i = nodeIndex.get(`${x},${z}`);
    for (const [dx, dz] of [[CITY.pitch, 0], [-CITY.pitch, 0], [0, CITY.pitch], [0, -CITY.pitch]]) {
      const j = nodeIndex.get(`${x + dx},${z + dz}`);
      if (j !== undefined && j > i) roadGraph.edges.push([i, j]);
    }
  }

  // --- Spawn points on roads near the centre ---
  const spawnPoints = [
    { x: 0, z: 0, heading: 0 },
    { x: 0, z: -52, heading: Math.PI / 2 },
    { x: 52, z: 0, heading: -Math.PI / 2 },
    { x: -52, z: 52, heading: Math.PI },
    { x: 0, z: HALF - 6, heading: 0 }, // beachfront promenade
  ];

  function isOnRoad(x, z) {
    if (x < -HALF - ROAD_HALF || x > HALF + ROAD_HALF) return false;
    if (z < -HALF - ROAD_HALF || z > HALF + ROAD_HALF) return false;
    return Math.abs(nearestLine(x) - x) <= ROAD_HALF + 0.5
      || Math.abs(nearestLine(z) - z) <= ROAD_HALF + 0.5;
  }

  function nearestRoadPoint(x, z) {
    const cx = nearestLine(x);
    const cz = nearestLine(z);
    // Closest point on the nearest x-line road vs the nearest z-line road.
    const dX = Math.abs(cx - x);
    const dZ = Math.abs(cz - z);
    if (dX <= dZ) return { x: cx, z: Math.max(-HALF, Math.min(HALF, z)) };
    return { x: Math.max(-HALF, Math.min(HALF, x)), z: cz };
  }

  function collideCircle(x, z, r) {
    for (const c of colliders) {
      const qx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
      const qz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
      const dx = x - qx;
      const dz = z - qz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  return { colliders, roadGraph, spawnPoints, isOnRoad, nearestRoadPoint, collideCircle, buildings };
}
