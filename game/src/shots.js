// game/src/shots.js — deterministic screenshot scenes for Solmara.
// stageShot(name, game) positions the world for one named shot, paints
// twice through the main.js runShot path (game.paint), then flags readiness
// with window.__shotReady so the screenshot runner knows the frame is set.
// Shot names: start | drive | chase | night. Unknown names fall back to start.
export function stageShot(name, game) {
  const g = game;
  const spawn = (g.city && g.city.playerSpawn) || { x: 0, z: 8, heading: 0 };
  const sx = spawn.x || 0;
  const sz = spawn.z || 0;
  const heading = spawn.heading || 0;

  // Clear any leftover player car / wanted state so every shot is identical
  // for the same seed, whatever ran before it.
  if (g.player && g.player.car) {
    g.player.car.isPlayer = false;
    g.player.car.speed = 0;
    if (typeof g.parkCar === 'function') g.parkCar(g.player.car);
    g.player.car = null;
  }
  if (g.player) {
    g.player.onFoot = true;
    g.player.health = 100;
    g.player.speed = 0;
  }
  g.setWanted(0);

  if (name === 'drive') {
    // Daytime driving through the city: Danny in a red sedan, traffic ahead.
    g.setTimeOfDay(13);
    const car = g.spawnCar({ type: 'sedan', x: sx, z: sz, heading, color: '#c0392b' });
    if (car) {
      car.speed = 14;
      g.placePlayerInCar(car);
    } else {
      g.placePlayer(sx, sz, heading);
    }
    g.spawnCar({ type: 'taxi', x: sx + 3, z: sz + 26, heading, color: '#f2c200' });
    g.spawnCar({ type: 'sedan', x: sx - 3, z: sz + 44, heading, color: '#3a6fd8' });
    g.spawnCar({ type: 'van', x: sx + 3, z: sz - 18, heading: heading + Math.PI, color: '#e8e8e8' });
    g.setObjective('Berkendara keliling Solmara.');
    g.showScreen('playing');
    g.flashMessage('Solmara siang hari — lalu lintas ramai.');
  } else if (name === 'chase') {
    // Police chase at dusk: 3 stars, two patrol cars closing in from behind.
    g.setTimeOfDay(18.5);
    const car = g.spawnCar({ type: 'sports', x: sx, z: sz, heading, color: '#222831' });
    if (car) {
      car.speed = 20;
      g.placePlayerInCar(car);
    } else {
      g.placePlayer(sx, sz, heading);
    }
    g.spawnPoliceCar(sx + 2, sz - 12, heading);
    g.spawnPoliceCar(sx - 3, sz - 22, heading);
    g.setWanted(3);
    g.setObjective('Lepaskan kejaran polisi!');
    g.showScreen('playing');
    g.flashMessage('Polisi mengejarmu! (3 bintang)');
  } else if (name === 'night') {
    // Night neon + mission complete overlay.
    g.setTimeOfDay(22);
    g.placePlayer(sx, sz, heading);
    g.spawnCar({ type: 'sedan', x: sx + 5, z: sz + 4, heading, color: '#8e44ad' });
    g.spawnCar({ type: 'taxi', x: sx - 4, z: sz + 20, heading, color: '#f2c200' });
    g.showMissionComplete('Paket Tengah Malam selesai', 500);
    g.flashMessage('Neon Solmara menyala.');
  } else {
    // 'start' (and any unknown name): title screen at noon.
    g.setTimeOfDay(12);
    g.placePlayer(sx, sz, heading);
    g.spawnCar({ type: 'sedan', x: sx + 5, z: sz + 3, heading, color: '#c0392b' });
    g.showScreen('title');
  }

  // Paint twice through the main.js runShot path so the frame is fully
  // settled before the screenshot is taken.
  g.paint();
  g.paint();
  window.__shotReady = true;
}
