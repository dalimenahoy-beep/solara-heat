// SOLARA HEAT — boot, wiring and the one loop. Builds the city and every system, then runs
// the simulation in fixed steps: Marco on foot or behind a wheel, traffic, the crowd, the
// SBPD, Lupe's jobs, the camera and the HUD. Screens: title, play, and the busted/wasted
// card. ?shot=<name> stages a screenshot scene instead of the title (see shots.js).

import { PLACES, STEP } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { readSave, writeSave, clearSave } from './save.js';
import { buildCity } from './world.js';
import { createCarFleet, stepVehicle } from './cars.js';
import { createPlayer, createCrowd } from './people.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const shotName = new URLSearchParams(window.location.search).get('shot');

// --- Renderer, scene, camera ---------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2600);
camera.position.set(-160, 60, 260);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// --- Systems ---------------------------------------------------------------------
const input = createInput(canvas);
const audio = createAudio();
const world = buildCity(scene);
const fleet = createCarFleet(scene, world.colliders);
const crowd = createCrowd(scene, world.colliders);
const player = createPlayer(scene);
const police = createPolice(scene, fleet, world.colliders);
const missions = createMissions(scene, fleet);
const hud = createHud();

for (let i = 0; i < 16; i += 1) fleet.spawnTrafficCar({ x: 0, z: 0 });
for (let i = 0; i < 26; i += 1) fleet.spawnParkedCar();
player.place(PLACES.start.x, PLACES.start.z, Math.PI * 0.75);

// --- Run state ---------------------------------------------------------------------
const state = {
  screen: shotName ? 'play' : 'title', // title | play | end
  paused: false,
  money: 120,
  endKind: null,
  shake: 0,
  hurtAt: -99,
  saveAt: 0,
  bust: 0,
  time: 0,
  nearMissAt: new Map(),
  nearMissToastAt: -99,
};
hud.setMoney(state.money);
let camYaw = Math.PI * 0.75;
let camPitch = 0.34;
let camDist = 7;
let mouseIdleFor = 0;

const focusPos = () => (player.mode === 'car' && player.car ? player.car.mesh.position : player.mesh.position);

function addMoney(amount) {
  state.money = Math.max(0, state.money + amount);
  hud.setMoney(state.money);
}

function saveProgress() {
  const p = focusPos();
  writeSave({
    money: state.money,
    missionIndex: missions.storyIndex,
    storyDone: missions.storyDone,
    position: { x: p.x, z: p.z },
  });
}

// --- Crime and consequence -----------------------------------------------------------
/** Heat counts in full when an officer is near enough to see it, a whisper otherwise. */
function witnessedCrime(points, pos) {
  police.commitCrime(police.nearestDistance(pos) < 58 ? points : Math.round(points * 0.25));
}

const fleetHooks = {
  onCrash(car, impact) {
    if (car !== player.car) return;
    audio.crash(Math.min(1, impact / 22));
    state.shake = Math.min(1, impact / 16);
    if (impact > 6) hurtPlayer((impact - 5) * 0.9);
    witnessedCrime(9, car.mesh.position);
  },
  onCarCrash(a, b, rel) {
    if (a !== player.car && b !== player.car) return;
    const other = a === player.car ? b : a;
    audio.crash(Math.min(1, rel / 18));
    state.shake = Math.min(1, rel / 13);
    hurtPlayer(rel * 0.55);
    witnessedCrime(other.mode === 'police' ? 42 : 14, focusPos());
    crowd.scareArea(focusPos(), 13);
  },
};

const crowdHooks = {
  onPedHit(ped, car) {
    if (car !== player.car && car.mode !== 'player') return;
    audio.punch();
    witnessedCrime(55, ped.mesh.position);
    hud.toast('You ran someone down — the bay saw that.');
  },
};

function hurtPlayer(amount) {
  if (state.screen !== 'play') return;
  player.health -= amount;
  state.hurtAt = state.time;
  if (player.health <= 0) {
    player.health = 0;
    endRun('wasted');
  }
}

function endRun(kind) {
  state.screen = 'end';
  state.endKind = kind;
  const title = document.getElementById('endTitle');
  const sub = document.getElementById('endSub');
  if (kind === 'busted') {
    const fine = Math.min(300, state.money);
    addMoney(-fine);
    title.textContent = 'BUSTED';
    title.style.color = '#7db4ff';
    sub.textContent = `The SBPD walks you out of the precinct $${fine} lighter. The bay forgets, for now.`;
  } else {
    const fine = Math.min(200, state.money);
    addMoney(-fine);
    title.textContent = 'WASTED';
    title.style.color = '#ff6b6b';
    sub.textContent = `St. Palmera patches Marco up and bills him $${fine}. The sun is still shining.`;
  }
  document.getElementById('endScreen').style.display = 'flex';
  audio.fail();
  audio.setEngine(0, false);
  audio.setSiren(0);
  if (document.exitPointerLock) document.exitPointerLock();
}

function respawn() {
  police.clear();
  player.health = 100;
  if (player.mode === 'car') exitCar(true);
  const spot = state.endKind === 'busted' ? PLACES.precinct : PLACES.hospital;
  player.place(spot.x + 14, spot.z + 10, Math.PI / 2);
  document.getElementById('endScreen').style.display = 'none';
  state.screen = 'play';
  saveProgress();
}

// --- In and out of cars ------------------------------------------------------------------
function enterCar(car) {
  const wasTraffic = car.mode === 'traffic';
  const wasParked = car.mode === 'parked';
  car.mode = 'player';
  car.vel = { x: 0, z: 0 };
  player.mode = 'car';
  player.car = car;
  player.setVisible(false);
  audio.door();
  if (wasTraffic) {
    crowd.spawnFleeingDriver(car.mesh.position.x + 1.5, car.mesh.position.z);
    witnessedCrime(38, car.mesh.position);
    hud.toast('Carjacked — the driver will tell that story all week.');
  } else if (wasParked) {
    witnessedCrime(14, car.mesh.position);
  }
}

function exitCar(silent = false) {
  const car = player.car;
  if (!car) return;
  car.mode = 'free';
  player.place(
    car.mesh.position.x + Math.cos(car.heading) * 2.2,
    car.mesh.position.z - Math.sin(car.heading) * 2.2,
    car.heading,
  );
  player.mode = 'foot';
  player.car = null;
  player.setVisible(true);
  if (!silent) audio.door();
}

// --- One simulation step ---------------------------------------------------------------------
function step(dt) {
  state.time += dt;
  const focus = focusPos();
  const mouse = input.takeMouse();
  mouseIdleFor = (mouse.dx !== 0 || mouse.dy !== 0) ? 0 : mouseIdleFor + dt;
  camYaw -= mouse.dx * 0.0031;
  camPitch = Math.max(0.05, Math.min(1.05, camPitch + mouse.dy * 0.0026));

  if (state.screen === 'play' && !state.paused) {
    // Lupe's phone: M takes the next story job, or a fare when the story is done.
    if (input.tapped('KeyM') && !missions.active && !missions.fare) {
      const def = missions.startNext();
      if (def) {
        audio.phone();
        hud.banner(def.title, 'New job from Lupe — check the phone');
      } else {
        missions.startFare();
        audio.phone();
        hud.toast('Dispatch has a fare for you.');
      }
    }
    if (input.tapped('KeyN')) {
      hud.toast(audio.toggleMusic() ? 'Radio on — Solara Sounds' : 'Radio off');
    }

    if (player.mode === 'foot') stepOnFoot(dt, mouse);
    else if (player.car) stepDriving(dt);

    // A quiet street lets Marco catch his breath.
    if (police.stars === 0 && state.time - state.hurtAt > 3.5 && player.health > 0) {
      player.health = Math.min(100, player.health + 2.4 * dt);
    }

    const target = player.mode === 'car' && player.car
      ? {
        x: player.car.mesh.position.x, z: player.car.mesh.position.z,
        velX: player.car.vel.x, velZ: player.car.vel.z,
        speed: player.car.speed, inCar: true,
      }
      : {
        x: player.mesh.position.x, z: player.mesh.position.z,
        velX: 0, velZ: 0, speed: player.speedNow, inCar: false,
      };
    const outcome = police.update(dt, target, { onBusted: () => endRun('busted') });
    state.bust = outcome.bustProgress;

    missions.update(dt, {
      pos: focus,
      playerCar: player.car,
      inCar: player.mode === 'car',
      stars: police.stars,
      setStars: (n) => police.setStars(n),
      crime: (n) => police.commitCrime(n),
      addMoney,
      toast: (t) => hud.toast(t),
      banner: (t, s) => hud.banner(t, s),
      sound: audio,
      saveProgress,
    });

    if (state.time - state.saveAt > 15) {
      state.saveAt = state.time;
      saveProgress();
    }
  }

  // The world keeps living behind every screen.
  fleet.update(dt, focus, fleetHooks);
  crowd.update(dt, fleet.cars, crowdHooks);
  world.update(dt, focus);

  updateCamera(dt);

  // HUD, every step.
  const brief = missions.currentBrief(focus);
  hud.setObjective(brief.from, brief.objective, brief.meta);
  hud.setStars(police.stars);
  hud.setHealth(player.health / 100);
  hud.setBust(state.screen === 'play' ? state.bust : 0);
  hud.setSpeed(player.mode === 'car' && player.car ? Math.abs(player.car.speed) * 3.6 : null);
  hud.setDamageGlow(state.hurtAt > 0 ? Math.max(0, 0.75 - (state.time - state.hurtAt) * 0.5) : 0);
  const copDist = police.nearestDistance(focus);
  hud.setSirenGlow(police.stars > 0 ? Math.max(0, 0.65 - copDist / 90) : 0);
  audio.setSiren(police.stars > 0 ? Math.max(0, 1 - copDist / 65) : 0);
  hud.drawMinimap({
    x: focus.x, z: focus.z,
    heading: player.mode === 'car' && player.car ? player.car.heading : player.heading,
    cops: police.cops.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
    target: brief.target,
  });
  hud.update(dt);
  input.finishFrame();
}

function stepOnFoot(dt, mouse) {
  const axes = input.axes();
  const running = input.held('ShiftLeft') || input.held('ShiftRight');
  player.stepOnFoot(dt, axes, camYaw, running, world.colliders);
  audio.setEngine(0, false);
  hud.setBust(state.bust);

  if (input.tapped('KeyF') || (mouse.clicked && input.pointerLocked)) {
    player.punch();
    audio.wake();
  }
  if (player.punching) {
    const victim = crowd.nearestInFront(player.mesh.position, player.heading, 2.0);
    if (victim) {
      crowd.downPed(victim);
      audio.punch();
      witnessedCrime(30, player.mesh.position);
      crowd.scareArea(player.mesh.position, 11);
    }
  }

  const car = fleet.nearestEnterable(player.mesh.position, 3.8);
  hud.showPrompt(car ? `<b>E</b> — Enter the ${car.style}` : null);
  if (car && input.tapped('KeyE')) {
    enterCar(car);
    return;
  }

  // Traffic is a hazard to a man on foot, too.
  for (const other of fleet.cars) {
    if (other.mode === 'parked') continue;
    const speed = Math.abs(other.speed) || Math.hypot(other.vel.x, other.vel.z);
    if (speed < 3.5) continue;
    const d = Math.hypot(other.mesh.position.x - player.mesh.position.x, other.mesh.position.z - player.mesh.position.z);
    if (d < 2.0) {
      hurtPlayer(speed * 1.1);
      const away = Math.atan2(player.mesh.position.x - other.mesh.position.x, player.mesh.position.z - other.mesh.position.z);
      player.mesh.position.x += Math.sin(away) * 2.4;
      player.mesh.position.z += Math.cos(away) * 2.4;
      audio.crash(0.4);
    }
  }
}

function stepDriving(dt) {
  const axes = input.axes();
  const car = player.car;
  const control = { throttle: -axes.z, steer: -axes.x, handbrake: input.held('Space') };
  stepVehicle(car, dt, control, world.colliders, fleetHooks);
  const speed = Math.abs(car.speed);
  audio.setEngine(Math.min(1, speed / 34) + (control.throttle !== 0 ? 0.14 : 0), !car.dead);
  if (input.tapped('KeyH')) {
    audio.horn();
    crowd.scareArea(car.mesh.position, 9);
  }
  hud.showPrompt(car.dead
    ? '<b>E</b> — Get out · this car is wrecked'
    : '<b>E</b> — Exit · <b>SPACE</b> — Handbrake · <b>H</b> — Horn');
  if (input.tapped('KeyE') && speed < 3) exitCar();

  // Threading past traffic at speed pays a little and feels great.
  if (speed > 16) {
    for (const other of fleet.cars) {
      if (other.mode !== 'traffic') continue;
      const d = Math.hypot(other.mesh.position.x - car.mesh.position.x, other.mesh.position.z - car.mesh.position.z);
      const last = state.nearMissAt.get(other.id) || -99;
      if (d > 3.6 && d < 5.4 && state.time - last > 4) {
        state.nearMissAt.set(other.id, state.time);
        addMoney(12);
        if (state.time - state.nearMissToastAt > 3) {
          state.nearMissToastAt = state.time;
          hud.toast('Near miss — +$12');
          audio.blip();
        }
      }
    }
  }
}

// --- Camera --------------------------------------------------------------------------------------
function updateCamera(dt) {
  const focus = focusPos();
  const driving = player.mode === 'car' && player.car;
  if (state.screen === 'title') {
    // A slow aerial drift over the bay behind the title card.
    const t = state.time * 0.05;
    camera.position.set(Math.sin(t) * 190, 74, Math.cos(t) * 190);
    camera.lookAt(0, 6, 0);
    if (camera.fov !== 58) {
      camera.fov = 58;
      camera.updateProjectionMatrix();
    }
    return;
  }
  if (driving && mouseIdleFor > 1.1) {
    let diff = player.car.heading - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * Math.min(1, dt * 2.4);
  }
  const speed = driving ? Math.abs(player.car.speed) : 0;
  const wantDist = driving ? 9 + speed * 0.1 : 6.4;
  camDist += (wantDist - camDist) * Math.min(1, dt * 3);
  const back = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
  const tx = focus.x - back.x * camDist * Math.cos(camPitch);
  const tz = focus.z - back.z * camDist * Math.cos(camPitch);
  const ty = (driving ? 1.2 : 1.5) + Math.sin(camPitch) * camDist;
  const k = 1 - Math.exp(-dt * 7);
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (ty - camera.position.y) * k;
  camera.position.z += (tz - camera.position.z) * k;
  if (camera.position.y < 1.1) camera.position.y = 1.1;
  state.shake = Math.max(0, state.shake - dt * 2.2);
  if (state.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * state.shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * state.shake * 0.35;
  }
  camera.lookAt(focus.x + back.x * 3.2, driving ? 1.3 : 1.55, focus.z + back.z * 3.2);
  const wantFov = 62 + Math.min(13, speed * 0.3);
  if (Math.abs(camera.fov - wantFov) > 0.1) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
}

// --- Screens and buttons ----------------------------------------------------------------------------
const titleScreen = document.getElementById('titleScreen');
const continueBtn = document.getElementById('continueBtn');
const existingSave = readSave();
if (!existingSave) continueBtn.style.display = 'none';

function beginPlay(fromSave) {
  titleScreen.style.display = 'none';
  state.screen = 'play';
  audio.wake();
  audio.startMusic();
  if (fromSave && existingSave) {
    state.money = existingSave.money;
    missions.restore(existingSave.missionIndex, existingSave.storyDone);
    player.place(existingSave.x || PLACES.start.x, existingSave.z || PLACES.start.z, Math.PI * 0.75);
  } else {
    clearSave();
    state.money = 120;
    missions.restore(0, false);
    player.place(PLACES.start.x, PLACES.start.z, Math.PI * 0.75);
  }
  hud.setMoney(state.money);
  saveProgress();
}
document.getElementById('startBtn').addEventListener('click', () => beginPlay(false));
continueBtn.addEventListener('click', () => beginPlay(true));
document.getElementById('respawnBtn').addEventListener('click', respawn);
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyP' && state.screen === 'play') {
    state.paused = !state.paused;
    hud.toast(state.paused ? 'Paused — P to keep driving the day' : 'Back to it');
  }
});

// --- Screenshot staging ----------------------------------------------------------------------------------
if (shotName) {
  titleScreen.style.display = 'none';
  stageShot(shotName, {
    state, player, fleet, police, missions, hud, audio,
    setMoney: (n) => { state.money = n; hud.setMoney(n); },
    setCamera(yaw, pitch, dist) { camYaw = yaw; camPitch = pitch; camDist = dist; },
    snapCamera() {
      // Jump the camera straight to its composed spot (no easing) for a still frame.
      const focus = focusPos();
      const back = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
      camera.position.set(
        focus.x - back.x * camDist * Math.cos(camPitch),
        (player.mode === 'car' ? 1.2 : 1.5) + Math.sin(camPitch) * camDist,
        focus.z - back.z * camDist * Math.cos(camPitch),
      );
      camera.lookAt(focus.x + back.x * 3.2, 1.5, focus.z + back.z * 3.2);
    },
  });
}

// --- The loop ------------------------------------------------------------------------------------------------
let last = performance.now();
let accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.25) elapsed = 0.25;
  accumulator += elapsed;
  while (accumulator >= STEP) {
    step(STEP);
    accumulator -= STEP;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
if (shotName) {
  // Give the staged scene a few real frames to settle, then tell the camera outside.
  // Few on purpose: a staged chase is a live simulation and drifts if left running —
  // but enough for the HUD layers to reach the captured surface.
  let frames = 0;
  const waiter = () => {
    frames += 1;
    if (frames > 8) {
      window.__shotReady = true;
      return;
    }
    requestAnimationFrame(waiter);
  };
  requestAnimationFrame(waiter);
}
