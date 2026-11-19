// Staging for the screenshots, ?shot=title|onfoot|drive|chase. Nothing here fakes a
// picture: each scene arranges the live game — the real city, traffic, the mission state
// and the police — and lets the page's own loop run it for a few frames before the capture
// is taken, so every shot is a true render of play. Scenes are composed defensively: the
// pursuit is staged from behind and alongside at matched speeds, and stray traffic is
// moved out of the frame, so a staged scene cannot end the run before it is photographed.

import { placeCar } from './cars.js';

/** The mission context in miniature, enough for the staging calls below. */
function miniContext(api) {
  return {
    // Marco's effective position: the car he sits in, not his hidden body.
    pos: api.player.car ? api.player.car.mesh.position : api.player.mesh.position,
    playerCar: api.player.car,
    inCar: api.player.mode === 'car',
    stars: api.police.stars,
    setStars: (n) => api.police.setStars(n),
    crime: (n) => api.police.commitCrime(n),
    addMoney: () => {},
    toast: () => {},
    banner: () => {},
    sound: api.audio,
    saveProgress: () => {},
  };
}

/** Find Lupe's Comet in the fleet and put Marco in the driver's seat, rolling. */
function seatMarcoInComet(api, x, z, heading, speed) {
  const comet = api.fleet.cars.find((car) => car.id === 'lupe-comet');
  if (!comet) return null;
  placeCar(comet, x, z, heading);
  comet.mode = 'player';
  comet.vel = { x: Math.sin(heading) * speed, z: Math.cos(heading) * speed };
  comet.speed = speed;
  api.player.mode = 'car';
  api.player.car = comet;
  api.player.setVisible(false);
  return comet;
}

/** Move ambient traffic out of a staged frame to the far west avenue, still driving. */
function clearTrafficNear(api, cx, cz, radius, keep = null) {
  for (const car of api.fleet.cars) {
    if (car.mode !== 'traffic' || car === keep) continue;
    const d = Math.hypot(car.mesh.position.x - cx, car.mesh.position.z - cz);
    if (d >= radius) continue;
    placeCar(car, -215 - Math.random() * 8, 3.6, Math.PI / 2);
    car.axis = 'x';
    car.dir = 1;
    car.cross = 3.6;
    car.turning = false;
    car.vel = { x: car.cruise, z: 0 };
  }
}

export function stageShot(name, api) {
  const { state, player, police, missions } = api;
  api.setMoney(2450);

  if (name === 'drive') {
    // Mid-job on the avenue: Marco in the Comet, the garage beacon ahead, a hatchback
    // rolling in front of him and the whole bay around.
    missions.startNext(); // FIRST WHEELS: spawns the Comet and points at it
    const comet = seatMarcoInComet(api, -60, 3.6, Math.PI / 2, 15);
    // Three updates: the first notices Marco is in the car (stage 1), the second writes
    // the delivery objective, and the third moves the beacon onto the garage — each
    // update only sees the previous one's stage writes.
    if (comet) {
      missions.update(0.016, miniContext(api));
      missions.update(0.016, miniContext(api));
      missions.update(0.016, miniContext(api));
    }
    const ahead = api.fleet.cars.find((car) => car.mode === 'traffic');
    if (ahead) {
      placeCar(ahead, -26, 3.6, Math.PI / 2);
      ahead.axis = 'x';
      ahead.dir = 1;
      ahead.cross = 3.6;
      ahead.turning = false;
      ahead.vel = { x: ahead.cruise, z: 0 };
    }
    clearTrafficNear(api, -45, 0, 55, ahead);
    api.setCamera(Math.PI / 2, 0.3, 10.5);
    api.snapCamera();
    return;
  }

  if (name === 'chase') {
    // Three stars, boxed in: the Comet stopped mid-avenue with the shift closing around
    // it — one cruiser alongside, two stacked behind. The scene is staged as a felony
    // stop and the simulation is paused (the game's own pause: traffic, water and
    // lightbars keep animating, the police hold position), because a live pursuit
    // composition wrecks itself within seconds and a cover shot must be deterministic.
    missions.startNext();
    const comet = seatMarcoInComet(api, 30, 3.6, Math.PI / 2 - 0.15, 0);
    if (comet) {
      missions.update(0.016, miniContext(api));
      missions.update(0.016, miniContext(api));
      missions.update(0.016, miniContext(api));
    }
    clearTrafficNear(api, 25, 0, 60);
    police.setStars(3); // mid-band heat: the spawn updates below cannot shave it to 2
    const target = { x: 30, z: 3.6, velX: 0, velZ: 0, speed: 0, inCar: true };
    for (let i = 0; i < 4; i += 1) police.update(0.016, target, {});
    const spots = [
      { x: 36, z: -3.8, h: Math.PI / 2 }, // alongside, front-right of frame
      { x: 25, z: -3.4, h: Math.PI / 2 + 0.15 }, // angled in behind, right of frame
      { x: 22, z: 3.4, h: Math.PI / 2 - 0.1 }, // on the tail, left of frame
    ];
    police.cops.forEach((cop, i) => {
      const spot = spots[i % spots.length];
      placeCar(cop, spot.x, spot.z, spot.h);
      cop.vel = { x: 0, z: 0 };
    });
    player.health = 100;
    state.paused = true;
    api.setCamera(Math.PI / 2 + 0.55, 0.38, 16);
    api.snapCamera();
    return;
  }

  if (name === 'onfoot') {
    // On the sidewalk with the first job on the phone and the bay all around.
    missions.startNext();
    player.place(-8, 62, Math.PI * 0.9);
    api.setCamera(Math.PI * 0.9, 0.3, 7.5);
    api.snapCamera();
    return;
  }

  // Anything else is the title: the menu over the drifting aerial view.
  state.screen = 'title';
  document.getElementById('titleScreen').style.display = 'flex';
}
