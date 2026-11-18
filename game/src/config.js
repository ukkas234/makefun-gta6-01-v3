// Solmara — shared tuning constants.
// Plain ES module, no build step, no network requests.

export const CITY = {
  blocks: 10, // 10x10 block grid
  block: 40, // block side in metres
  road: 12, // road width in metres
  pitch: 52, // block + road
  size: 520, // city side in metres
  half: 260, // city half-extent
};

export const BLOCK = CITY.block;
export const ROAD = CITY.road;
export const PITCH = CITY.pitch;
export const CITY_HALF = CITY.half;
export const CITY_SIZE = CITY.size;

// Deterministic world seed so every run builds the same Solmara.
export const SEED = 1337;

// Road centre-line coordinates: -260 .. 260 step 52 (11 roads per axis).
export const ROAD_LINES = Object.freeze(
  Array.from({ length: CITY.blocks + 1 }, (_, i) => -CITY.half + i * PITCH),
);

// Coast: beach strip and open water on the south edge (z > half).
export const COAST = {
  beachStart: CITY.half, // sand begins here
  beachWidth: 34, // sand strip depth
  waterStart: CITY.half + 34, // water begins here
  waterDepth: 260, // water extends this far south
};

export const keys = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  brake: ['Space'],
  interact: ['KeyE'],
  horn: ['KeyH'],
  headlights: ['KeyL'],
  camera: ['KeyC'],
  reset: ['KeyR'],
  pause: ['KeyP', 'Escape'],
};

export const COLORS = {
  sky: 0x0b1026, // night sky
  fog: 0x0b1026,
  asphalt: 0x23242a,
  sidewalk: 0x8a8d94,
  grass: 0x2e5d33,
  sand: 0xd9c08a,
  water: 0x0e4d6b,
  hill: 0x1d3a24,
  buildingRoof: 0x3a3d46,
  neonPink: 0xff2e88,
  neonCyan: 0x19e3ff,
  neonAmber: 0xffb020,
  headlight: 0xfff2c0,
  brakeLight: 0xff2222,
};

// Economy / wanted tuning. All money values are in-game $.
export const BALANCE = {
  rewards: {
    missionComplete: 500,
    missionStep: 100,
    pickup: 50,
    nearMiss: 10,
    stuntAir: 25,
    driftPerSecond: 5,
  },
  fines: {
    collision: 25, // hitting a prop / building scrape
    pedestrian: 150, // hitting a pedestrian
    copRam: 75, // ramming a police car
  },
  decay: {
    wantedPerSecond: 0.35, // wanted heat cools off while unseen
    wantedGainPerCrime: 1, // stars gained per crime
    maxWanted: 5,
    healthRegenPerSecond: 2, // slow regen out of combat
    carRepairPerSecond: 1,
  },
  car: {
    accel: 22,
    brake: 34,
    maxSpeed: 42, // ~150 km/h
    maxReverseSpeed: 12,
    steer: 1.9,
    grip: 6.5,
  },
};
