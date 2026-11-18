// missions.js — Solmara story missions + hidden packages.
// Plain ES module. No build step, no network, no external assets.
// The `game` object passed in provides:
//   { player, city, traffic, police, hud, audio, save,
//     setObjective, addMoney, showMessage, spawnMarker(x, z, label), clearMarker() }
// Every game call is guarded, so a missing optional hook never crashes a mission.

const GARAGE = { x: 120, z: -80, label: 'Garage' };
const SAFEHOUSE = { x: -140, z: 160, label: 'Safehouse' };
const BANK = { x: 40, z: 200, label: 'Bank' };
const BRIEFCASE = { x: -60, z: -160, label: 'Briefcase' };
const DELIVERIES = [
  { x: 180, z: 120, label: 'Drop-off 1' },
  { x: -180, z: -40, label: 'Drop-off 2' },
  { x: 60, z: -200, label: 'Drop-off 3' },
];

// 10 hidden packages scattered across the city. $50 each, any time, any mission.
export const HIDDEN_PACKAGES = [
  { x: 200, z: -180 },
  { x: -220, z: 90 },
  { x: 90, z: 240 },
  { x: -90, z: -240 },
  { x: 250, z: 60 },
  { x: -260, z: -120 },
  { x: 30, z: -60 },
  { x: -30, z: 260 },
  { x: 170, z: -260 },
  { x: -180, z: 220 },
];

const PACKAGE_REWARD = 50;
const PACKAGE_RADIUS = 5;
const MARKER_RADIUS = 8;

// ---------------------------------------------------------------- helpers

function dist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function playerPos(game) {
  const p = game.player || {};
  if (typeof p.x === 'number' && typeof p.z === 'number') return { x: p.x, z: p.z };
  if (p.position && typeof p.position.x === 'number') return { x: p.position.x, z: p.position.z || 0 };
  if (p.car && typeof p.car.x === 'number') return { x: p.car.x, z: p.car.z };
  return { x: 0, z: 0 };
}

function isInCar(game) {
  const p = game.player || {};
  if (typeof p.inCar === 'boolean') return p.inCar;
  if (typeof p.inVehicle === 'boolean') return p.inVehicle;
  if (typeof p.driving === 'boolean') return p.driving;
  return !!(p.vehicle || p.car);
}

function getWanted(game) {
  const pol = game.police || {};
  if (typeof pol.getWanted === 'function') return pol.getWanted();
  if (typeof pol.wanted === 'number') return pol.wanted;
  if (typeof pol.stars === 'number') return pol.stars;
  if (typeof pol.level === 'number') return pol.level;
  if (typeof game.getWanted === 'function') return game.getWanted();
  if (typeof game.wanted === 'number') return game.wanted;
  return 0;
}

function setWanted(game, n) {
  const pol = game.police || {};
  try {
    if (typeof pol.setWanted === 'function') { pol.setWanted(n); return; }
    if (typeof pol.setStars === 'function') { pol.setStars(n); return; }
    if (typeof pol.setLevel === 'function') { pol.setLevel(n); return; }
    if (typeof game.setWanted === 'function') { game.setWanted(n); return; }
    if (typeof pol.wanted === 'number') { pol.wanted = n; return; }
    if (typeof pol.stars === 'number') { pol.stars = n; return; }
  } catch (e) { /* police module owns its own state; never crash a mission */ }
}

// True while the player is holding the interact key (E). If the game exposes
// no interact input at all, standing in the marker counts as holding it.
function interactHeld(game) {
  const sources = [
    game.input && game.input.interact,
    game.input && game.input.keys && game.input.keys.KeyE,
    game.input && game.input.keys && game.input.keys.e,
    game.keys && game.keys.KeyE,
    game.keys && game.keys.e,
    game.player && game.player.interact,
    game.player && game.player.holdingE,
  ];
  let seen = false;
  for (const s of sources) {
    if (typeof s === 'boolean') {
      seen = true;
      if (s) return true;
    }
  }
  return !seen; // no input source wired up: proximity alone is enough
}

function say(game, text) {
  try {
    if (typeof game.showMessage === 'function') game.showMessage(text);
    else if (game.hud && typeof game.hud.showMessage === 'function') game.hud.showMessage(text);
  } catch (e) { /* HUD is cosmetic */ }
}

function setObjective(game, text) {
  try {
    if (typeof game.setObjective === 'function') game.setObjective(text);
    else if (game.hud && typeof game.hud.setObjective === 'function') game.hud.setObjective(text);
  } catch (e) { /* HUD is cosmetic */ }
}

function mark(game, x, z, label) {
  try {
    if (typeof game.spawnMarker === 'function') game.spawnMarker(x, z, label);
  } catch (e) { /* marker is cosmetic */ }
}

function unmark(game) {
  try {
    if (typeof game.clearMarker === 'function') game.clearMarker();
  } catch (e) { /* marker is cosmetic */ }
}

function sting(game) {
  try {
    if (game.audio && typeof game.audio.sting === 'function') game.audio.sting();
  } catch (e) { /* audio is cosmetic */ }
}

function finishMission(game, mission, state) {
  state.done = true;
  unmark(game);
  sting(game);
}

// ---------------------------------------------------------------- M1

let s1 = null;
const M1 = {
  id: 'M1',
  title: 'First Wheels',
  briefing: 'You need wheels. Steal any car, then bring it to the garage.',
  reward: 200,
  start(game) {
    s1 = { stolen: isInCar(game), done: false };
    setObjective(game, s1.stolen ? 'Drive to the garage' : 'Steal a car');
    if (game.hud && typeof game.hud.setMission === 'function') game.hud.setMission('First Wheels');
    if (s1.stolen) mark(game, GARAGE.x, GARAGE.z, GARAGE.label);
    say(game, 'First Wheels: steal a car, then drive it to the garage.');
  },
  update(dt, game) {
    if (!s1 || s1.done) return;
    const pos = playerPos(game);
    if (!s1.stolen && isInCar(game)) {
      s1.stolen = true;
      say(game, 'Car stolen! Get it to the garage.');
      setObjective(game, 'Drive to the garage');
      mark(game, GARAGE.x, GARAGE.z, GARAGE.label);
      try { if (game.audio && typeof game.audio.pickup === 'function') game.audio.pickup(); } catch (e) {}
    }
    if (s1.stolen && isInCar(game) && dist(pos.x, pos.z, GARAGE.x, GARAGE.z) < MARKER_RADIUS) {
      finishMission(game, M1, s1);
      say(game, 'First Wheels complete! +$200');
    }
  },
  isDone() { return !!(s1 && s1.done); },
};

// ---------------------------------------------------------------- M2

let s2 = null;
const M2 = {
  id: 'M2',
  title: 'Hot Deliveries',
  briefing: 'Three packages, three drop-offs, 150 seconds. Drive fast, drive clean.',
  reward: 350,
  start(game) {
    s2 = { index: 0, delivered: 0, timeLeft: 150, done: false, lastShown: -1 };
    setObjective(game, 'Deliver package 1 of 3 — 150s');
    if (game.hud && typeof game.hud.setMission === 'function') game.hud.setMission('Hot Deliveries');
    mark(game, DELIVERIES[0].x, DELIVERIES[0].z, DELIVERIES[0].label);
    say(game, 'Hot Deliveries: 3 drop-offs in 150 seconds. Go!');
  },
  update(dt, game) {
    if (!s2 || s2.done) return 'active';
    s2.timeLeft -= dt;
    const shown = Math.ceil(Math.max(0, s2.timeLeft));
    if (shown !== s2.lastShown) {
      s2.lastShown = shown;
      setObjective(game, 'Deliver package ' + (s2.index + 1) + ' of 3 — ' + shown + 's');
    }
    if (s2.timeLeft <= 0) {
      unmark(game);
      say(game, 'Too slow! The deliveries went cold. Try again.');
      return 'failed';
    }
    const pos = playerPos(game);
    const target = DELIVERIES[s2.index];
    if (dist(pos.x, pos.z, target.x, target.z) < MARKER_RADIUS) {
      s2.delivered += 1;
      s2.index += 1;
      try { if (game.audio && typeof game.audio.pickup === 'function') game.audio.pickup(); } catch (e) {}
      if (s2.index >= DELIVERIES.length) {
        finishMission(game, M2, s2);
        say(game, 'All deliveries made! +$350');
      } else {
        const next = DELIVERIES[s2.index];
        mark(game, next.x, next.z, next.label);
        say(game, 'Package ' + s2.delivered + ' of 3 delivered.');
      }
    }
    return 'active';
  },
  isDone() { return !!(s2 && s2.done); },
};

// ---------------------------------------------------------------- M3

let s3 = null;
const M3 = {
  id: 'M3',
  title: 'Lose the Heat',
  briefing: 'The cops are on you — 2 stars. Break line of sight and get clean.',
  reward: 400,
  start(game) {
    s3 = { done: false, elapsed: 0, sawHeat: false };
    setWanted(game, 2);
    setObjective(game, 'Lose the cops — get to 0 stars');
    if (game.hud && typeof game.hud.setMission === 'function') game.hud.setMission('Lose the Heat');
    say(game, 'Lose the Heat: 2 stars on you. Lose them!');
  },
  update(dt, game) {
    if (!s3 || s3.done) return;
    s3.elapsed += dt;
    // Only count down once the heat has actually registered. Without this,
    // a police module that never applies wanted would let the mission
    // complete on its own a few seconds after starting.
    if (getWanted(game) >= 2) s3.sawHeat = true;
    if (s3.sawHeat && s3.elapsed > 1 && getWanted(game) <= 0) {
      finishMission(game, M3, s3);
      say(game, 'Clean! You lost the heat. +$400');
    }
  },
  isDone() { return !!(s3 && s3.done); },
};

// ---------------------------------------------------------------- M4

let s4 = null;
const M4 = {
  id: 'M4',
  title: 'The Pickup',
  briefing: 'A briefcase is waiting across town. Grab it on foot, then lose the tail.',
  reward: 500,
  start(game) {
    s4 = { stage: 0, done: false };
    setObjective(game, 'Drive to the briefcase');
    if (game.hud && typeof game.hud.setMission === 'function') game.hud.setMission('The Pickup');
    mark(game, BRIEFCASE.x, BRIEFCASE.z, BRIEFCASE.label);
    say(game, 'The Pickup: drive to the briefcase marker.');
  },
  update(dt, game) {
    if (!s4 || s4.done) return;
    const pos = playerPos(game);
    if (s4.stage === 0) {
      if (dist(pos.x, pos.z, BRIEFCASE.x, BRIEFCASE.z) < MARKER_RADIUS) {
        s4.stage = 1;
        setObjective(game, 'Get out and grab the briefcase on foot');
        say(game, 'You are here. Get out of the car and grab it.');
      }
    } else if (s4.stage === 1) {
      if (!isInCar(game) && dist(pos.x, pos.z, BRIEFCASE.x, BRIEFCASE.z) < 5) {
        s4.stage = 2;
        setWanted(game, 2);
        setObjective(game, 'Escape to the safehouse — 2 stars');
        mark(game, SAFEHOUSE.x, SAFEHOUSE.z, SAFEHOUSE.label);
        say(game, 'Briefcase grabbed! Cops on you — run to the safehouse.');
        try { if (game.audio && typeof game.audio.pickup === 'function') game.audio.pickup(); } catch (e) {}
      } else if (isInCar(game) && dist(pos.x, pos.z, BRIEFCASE.x, BRIEFCASE.z) < MARKER_RADIUS) {
        setObjective(game, 'Get OUT of the car to grab the briefcase');
      }
    } else if (s4.stage === 2) {
      if (dist(pos.x, pos.z, SAFEHOUSE.x, SAFEHOUSE.z) < MARKER_RADIUS) {
        setWanted(game, 0);
        finishMission(game, M4, s4);
        say(game, 'The Pickup complete! +$500');
      }
    }
  },
  isDone() { return !!(s4 && s4.done); },
};

// ---------------------------------------------------------------- M5

let s5 = null;
const M5 = {
  id: 'M5',
  title: 'The Big One',
  briefing: 'The bank. Get inside on foot, hold E for 3 seconds to grab the cash, then outrun a 3-star chase to the safehouse.',
  reward: 1500,
  start(game) {
    s5 = { stage: 0, hold: 0, done: false, lastShown: -1 };
    setObjective(game, 'Drive to the bank');
    if (game.hud && typeof game.hud.setMission === 'function') game.hud.setMission('The Big One');
    mark(game, BANK.x, BANK.z, BANK.label);
    say(game, 'The Big One: hit the bank, then vanish.');
  },
  update(dt, game) {
    if (!s5 || s5.done) return;
    const pos = playerPos(game);
    if (s5.stage === 0) {
      if (dist(pos.x, pos.z, BANK.x, BANK.z) < MARKER_RADIUS) {
        s5.stage = 1;
        setObjective(game, 'Enter the bank on foot');
        say(game, 'At the bank. Go in on foot.');
      }
    } else if (s5.stage === 1) {
      if (!isInCar(game) && dist(pos.x, pos.z, BANK.x, BANK.z) < 6) {
        s5.stage = 2;
        s5.hold = 0;
        setObjective(game, 'Hold E — grabbing the cash… 3s');
        say(game, 'Inside! Hold E to grab the cash.');
      } else if (isInCar(game) && dist(pos.x, pos.z, BANK.x, BANK.z) < MARKER_RADIUS) {
        setObjective(game, 'Get OUT of the car and enter the bank');
      }
    } else if (s5.stage === 2) {
      const inside = !isInCar(game) && dist(pos.x, pos.z, BANK.x, BANK.z) < 6;
      if (inside && interactHeld(game)) {
        s5.hold += dt;
        const left = Math.ceil(Math.max(0, 3 - s5.hold));
        if (left !== s5.lastShown) {
          s5.lastShown = left;
          setObjective(game, 'Hold E — grabbing the cash… ' + left + 's');
        }
        if (s5.hold >= 3) {
          s5.stage = 3;
          setWanted(game, 3);
          setObjective(game, 'Escape to the safehouse — 3 stars!');
          mark(game, SAFEHOUSE.x, SAFEHOUSE.z, SAFEHOUSE.label);
          say(game, 'Cash grabbed! 3 stars — get to the safehouse!');
          try { if (game.audio && typeof game.audio.sting === 'function') game.audio.sting(); } catch (e) {}
        }
      } else if (inside) {
        // Player is in place but not holding E: hold progress decays.
        s5.hold = Math.max(0, s5.hold - dt * 2);
      } else {
        s5.hold = 0;
      }
    } else if (s5.stage === 3) {
      if (dist(pos.x, pos.z, SAFEHOUSE.x, SAFEHOUSE.z) < MARKER_RADIUS) {
        setWanted(game, 0);
        finishMission(game, M5, s5);
        say(game, 'THE BIG ONE complete! +$1,500 — Story Complete!');
      }
    }
  },
  isDone() { return !!(s5 && s5.done); },
};

export const MISSIONS = [M1, M2, M3, M4, M5];

// ---------------------------------------------------------------- manager

export function createMissionManager(game) {
  const completed = new Set();
  const foundPackages = new Set();
  let active = null;
  let activeIndex = -1;

  // Restore progress if the save hook exposes it.
  try {
    const saved = game.save && game.save.completedMissions;
    if (Array.isArray(saved)) saved.forEach((id) => completed.add(id));
    const pkgs = game.save && game.save.foundPackages;
    if (Array.isArray(pkgs)) pkgs.forEach((i) => foundPackages.add(i));
  } catch (e) { /* save is optional */ }

  function persist() {
    try {
      if (game.save && typeof game.save === 'function') game.save();
      else if (game.save && typeof game.save.save === 'function') game.save.save();
    } catch (e) { /* save is optional */ }
  }

  function checkPackages() {
    const pos = playerPos(game);
    for (let i = 0; i < HIDDEN_PACKAGES.length; i++) {
      if (foundPackages.has(i)) continue;
      const p = HIDDEN_PACKAGES[i];
      if (dist(pos.x, pos.z, p.x, p.z) < PACKAGE_RADIUS) {
        foundPackages.add(i);
        try { if (typeof game.addMoney === 'function') game.addMoney(PACKAGE_REWARD); } catch (e) {}
        try { if (game.audio && typeof game.audio.pickup === 'function') game.audio.pickup(); } catch (e) {}
        say(game, 'Hidden package found! +$50 (' + foundPackages.size + '/10)');
        persist();
      }
    }
  }

  return {
    get active() { return active; },
    get packagesFound() { return foundPackages.size; },
    get completedCount() { return completed.size; },
    get completedIds() { return [...completed]; },
    get foundPackageIds() { return [...foundPackages]; },

    // All missions with their done state, for the menu list.
    list() {
      return MISSIONS.map((m) => ({
        id: m.id, title: m.title, reward: m.reward, done: completed.has(m.id),
      }));
    },

    isComplete() { return completed.size === MISSIONS.length; },

    // Indices of missions the player may start: sequential unlock, and every
    // completed mission stays replayable.
    available() {
      const out = [];
      for (let i = 0; i < MISSIONS.length; i++) {
        let unlocked = true;
        for (let j = 0; j < i; j++) {
          if (!completed.has(MISSIONS[j].id)) { unlocked = false; break; }
        }
        if (unlocked) out.push(i);
      }
      return out;
    },

    start(i) {
      if (typeof i !== 'number' || i < 0 || i >= MISSIONS.length) return false;
      if (active) {
        say(game, 'Finish the current job first.');
        return false;
      }
      if (!this.available().includes(i)) {
        say(game, 'Locked — finish the previous job first.');
        return false;
      }
      active = MISSIONS[i];
      activeIndex = i;
      try { active.start(game); } catch (e) { active = null; activeIndex = -1; return false; }
      return true;
    },

    update(dt) {
      checkPackages();
      if (!active) return;
      let status = 'active';
      try { status = active.update(dt, game) || 'active'; } catch (e) { status = 'failed'; }
      if (status === 'failed') {
        unmark(game);
        active = null;
        activeIndex = -1;
        return;
      }
      let done = false;
      try { done = active.isDone(); } catch (e) { done = false; }
      if (done) {
        const mission = active;
        const reward = mission.reward || 0;
        completed.add(mission.id);
        active = null;
        activeIndex = -1;
        try { if (typeof game.addMoney === 'function') game.addMoney(reward); } catch (e) {}
        if (mission.id === 'M5') {
          say(game, 'STORY COMPLETE — you pulled off The Big One!');
          try {
            if (game.hud && typeof game.hud.flash === 'function') game.hud.flash('STORY COMPLETE');
          } catch (e) {}
        }
        setObjective(game, 'Free roam — pick your next job');
        persist();
      }
    },
  };
}
