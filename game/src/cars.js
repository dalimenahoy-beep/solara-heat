// Every car in Solara Bay. One factory stamps out the meshes (sedan, sport, SUV, hatch,
// pickup, taxi, police interceptor); stepVehicle is the arcade physics anything with a
// driver uses; and the fleet at the bottom spawns the traffic and parked cars, drives the
// traffic around the avenue grid, settles bumps between cars, and recycles whatever gets
// stranded far from the player back into circulation.

import { AXES, CITY_EDGE, LANE, ROAD_HALF } from './config.js';
import { pushOutOfColliders } from './world.js';

const PAINTS = [0xd64541, 0x2a9d8f, 0xe9c46a, 0x457b9d, 0xf4a261, 0x9b5de5, 0x00bbf9, 0xf15bb5, 0x8ecae6, 0xe0e1dd, 0x1d3557, 0x606c38];
const CIVIL_STYLES = ['sedan', 'sedan', 'sport', 'suv', 'hatch', 'pickup'];

/** The lane centre for a car travelling `dir` along `axis` on the avenue at `cross`. */
export function laneCoordinate(axis, cross, dir) {
  // Keeping right: eastbound and southbound traffic ride one side, the rest the other.
  if (axis === 'x') return cross + (dir > 0 ? LANE : -LANE);
  return cross + (dir > 0 ? -LANE : LANE);
}

/** Unit forward vector for a heading (0 faces +z, growing clockwise seen from above). */
export function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

/** The heading that travels along `dir` on `axis`. */
export function headingOf(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

let paintCursor = 0;
function nextPaint() {
  const paint = PAINTS[paintCursor % PAINTS.length];
  paintCursor += 1;
  return paint;
}

/**
 * Build one car's meshes for `style` in `paint`.
 * Returns the group, its wheels, the police lightbar materials (or null) and the tail
 * light material, whose colour the brake flare drives.
 */
export function buildCarMesh(style, paint) {
  const group = new THREE.Group();
  const sport = style === 'sport';
  const suv = style === 'suv';
  const pickup = style === 'pickup';
  const length = sport ? 4.6 : 4.3;
  const bodyH = suv || pickup ? 0.74 : 0.56;
  const paintMat = new THREE.MeshPhongMaterial({ color: paint, shininess: 70 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x18242f, shininess: 120 });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x17181c });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.86, bodyH, length), paintMat);
  body.position.y = 0.42 + bodyH / 2;
  group.add(body);

  if (pickup) {
    // A cab up front and an open bed behind: three low walls around a dark floor.
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.58, 1.5), glassMat);
    cab.position.set(0, 0.42 + bodyH + 0.29, length / 2 - 1.15);
    group.add(cab);
    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 2.1), trimMat);
    bedFloor.position.set(0, 0.42 + bodyH - 0.05, -length / 2 + 1.25);
    group.add(bedFloor);
    for (const sideX of [-0.85, 0.85]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 2.1), paintMat);
      wall.position.set(sideX, 0.42 + bodyH + 0.16, -length / 2 + 1.25);
      group.add(wall);
    }
    const tailgate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.42, 0.1), paintMat);
    tailgate.position.set(0, 0.42 + bodyH + 0.16, -length / 2 + 0.15);
    group.add(tailgate);
  } else {
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.66, suv ? 0.62 : 0.5, length * (sport ? 0.44 : 0.5)),
      style === 'police' ? paintMat : glassMat,
    );
    cabin.position.set(0, 0.42 + bodyH + (suv ? 0.31 : 0.25), sport ? -0.35 : -0.15);
    group.add(cabin);
    if (style === 'police') {
      const glassBand = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, length * 0.46), glassMat);
      glassBand.position.set(0, 0.42 + bodyH + 0.28, -0.15);
      group.add(glassBand);
    }
    if (sport) {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.4), trimMat);
      spoiler.position.set(0, 1.14, -length / 2 + 0.25);
      group.add(spoiler);
    }
  }

  for (const end of [1, -1]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.3), trimMat);
    bumper.position.set(0, 0.42, end * (length / 2));
    group.add(bumper);
  }

  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xa11212 });
  for (const sideX of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat);
    head.position.set(sideX, 0.72, length / 2 + 0.16);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), tailMat);
    tail.position.set(sideX, 0.74, -length / 2 - 0.16);
    group.add(tail);
  }

  const wheelGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 12);
  wheelGeom.rotateZ(Math.PI / 2);
  const wheels = {};
  const wheelSpots = {
    fl: [0.86, length / 2 - 0.85], fr: [-0.86, length / 2 - 0.85],
    rl: [0.86, -length / 2 + 0.85], rr: [-0.86, -length / 2 + 0.85],
  };
  for (const [name, [wx, wz]] of Object.entries(wheelSpots)) {
    const wheel = new THREE.Mesh(wheelGeom, trimMat);
    wheel.position.set(wx, 0.35, wz);
    group.add(wheel);
    wheels[name] = wheel;
  }

  let lightbar = null;
  if (style === 'police') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.4), trimMat);
    base.position.set(0, 1.62, -0.15);
    group.add(base);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2266ff });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.34), redMat);
    red.position.set(0.28, 1.72, -0.15);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.34), blueMat);
    blue.position.set(-0.28, 1.72, -0.15);
    group.add(blue);
    lightbar = { red: redMat, blue: blueMat };
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.2, length * 0.7), new THREE.MeshLambertMaterial({ color: 0x14202e }));
    stripe.position.y = 0.62;
    group.add(stripe);
  }
  if (style === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: 0xffe45e }));
    sign.position.set(0, 1.34, -0.15);
    group.add(sign);
  }

  group.traverse((node) => { if (node.isMesh) node.castShadow = true; });
  return { group, wheels, lightbar, tailMat, paintMat };
}

/** A car record with everything the systems need, at rest and unplaced. */
function makeCar(style, paint) {
  const built = buildCarMesh(style, paint);
  return {
    mesh: built.group,
    wheels: built.wheels,
    lightbar: built.lightbar,
    tailMat: built.tailMat,
    paintMat: built.paintMat,
    style,
    mode: 'parked', // traffic | parked | free | player | police
    heading: 0,
    vel: { x: 0, z: 0 },
    speed: 0,
    axis: 'x',
    dir: 1,
    cross: 0,
    turning: null,
    lastCrossing: '',
    cruise: 9 + Math.random() * 4,
    topSpeed: style === 'sport' ? 46 : style === 'police' ? 44 : 36,
    accel: style === 'sport' ? 17 : 13,
    damage: 0,
    dead: false,
    braking: false,
    steerVis: 0,
    id: Math.random().toString(36).slice(2),
  };
}

/** A car for a driver outside the fleet's own spawns (the police build theirs). */
export function makeExternalCar(style, paint) {
  return makeCar(style, paint);
}

/** Put a car on the ground at (x, z), facing `heading`. */
export function placeCar(car, x, z, heading) {
  car.mesh.position.set(x, 0, z);
  car.heading = heading;
  car.mesh.rotation.y = heading;
}

/**
 * One step of the arcade driving model. control is { throttle, steer, handbrake } with
 * throttle and steer in -1..1. Building hits are reported via hooks.onCrash(car, speed).
 */
export function stepVehicle(car, dt, control, colliders, hooks) {
  const fwd = forwardOf(car.heading);
  const alongBefore = car.vel.x * fwd.x + car.vel.z * fwd.z;
  const throttle = car.dead ? 0 : control.throttle;
  car.vel.x += fwd.x * throttle * car.accel * dt;
  car.vel.z += fwd.z * throttle * car.accel * dt;
  car.braking = (throttle < -0.05 && alongBefore > 1) || (control.handbrake && Math.abs(alongBefore) > 2);
  car.steerVis = control.steer * 0.45;

  // The wheel bites harder the faster the car rolls, and reverses its sense in reverse.
  const authority = Math.max(-1, Math.min(1, alongBefore / 7));
  car.heading += control.steer * 1.85 * authority * dt * (control.handbrake ? 1.3 : 1);

  // Grip drags the velocity back in line with the nose; a handbrake lets the tail swing.
  const nf = forwardOf(car.heading);
  const along = car.vel.x * nf.x + car.vel.z * nf.z;
  const grip = Math.exp(-(control.handbrake ? 2.0 : 9.0) * dt);
  const latX = (car.vel.x - nf.x * along) * grip;
  const latZ = (car.vel.z - nf.z * along) * grip;
  car.vel.x = nf.x * along + latX;
  car.vel.z = nf.z * along + latZ;

  // Rolling drag, the top-speed cap, and a real brake when reversing against motion.
  const drag = Math.exp(-0.35 * dt);
  car.vel.x *= drag;
  car.vel.z *= drag;
  let v = Math.hypot(car.vel.x, car.vel.z);
  const cap = car.dead ? 4 : car.topSpeed;
  if (v > cap) {
    car.vel.x *= cap / v;
    car.vel.z *= cap / v;
    v = cap;
  }
  if (throttle < 0 && along > 0.2 && v > 11) {
    car.vel.x *= 1 - 2.4 * dt;
    car.vel.z *= 1 - 2.4 * dt;
  }

  // Move, and let the buildings have their say.
  const impactSpeed = Math.hypot(car.vel.x, car.vel.z);
  let x = car.mesh.position.x + car.vel.x * dt;
  let z = car.mesh.position.z + car.vel.z * dt;
  const freed = pushOutOfColliders(colliders, x, z, 2.1);
  if (freed.x !== x || freed.z !== z) {
    if (impactSpeed > 4 && hooks && hooks.onCrash) hooks.onCrash(car, impactSpeed);
    car.vel.x *= -0.18;
    car.vel.z *= -0.18;
    car.damage = Math.min(100, car.damage + impactSpeed * 1.1);
    if (car.damage >= 100) car.dead = true;
    x = freed.x;
    z = freed.z;
  }
  car.mesh.position.x = Math.max(-CITY_EDGE + 2, Math.min(288, x));
  car.mesh.position.z = Math.max(-CITY_EDGE + 2, Math.min(CITY_EDGE - 2, z));
  car.speed = car.vel.x * nf.x + car.vel.z * nf.z;
  syncCarVisual(car, dt);
}

/** Wheels roll with travel, the front pair follows the wheel, brake lights flare. */
export function syncCarVisual(car, dt) {
  car.mesh.rotation.y = car.heading;
  const spin = (car.speed * dt) / 0.35;
  for (const wheel of Object.values(car.wheels)) wheel.rotation.x += spin;
  car.wheels.fl.rotation.y = car.steerVis || 0;
  car.wheels.fr.rotation.y = car.steerVis || 0;
  if (car.tailMat) car.tailMat.color.setHex(car.braking ? 0xff4040 : 0xa11212);
}

/**
 * The fleet: traffic and parked cars for the whole city, their driving, their collisions,
 * and the recycling that keeps the show near the player.
 */
export function createCarFleet(scene, colliders) {
  const cars = [];
  const randomAxis = () => AXES[Math.floor(Math.random() * AXES.length)];

  /** A random point on a random lane, in a ring around `focus`. */
  function randomRoadPoint(minDist, focus) {
    for (let tries = 0; tries < 24; tries += 1) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const cross = randomAxis();
      const along = -CITY_EDGE + Math.random() * CITY_EDGE * 2;
      const lane = laneCoordinate(axis, cross, Math.random() < 0.5 ? 1 : -1);
      const x = axis === 'x' ? along : lane;
      const z = axis === 'x' ? lane : along;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d >= minDist && d <= minDist + 160) return { axis, cross, x, z };
    }
    return { axis: 'x', cross: 0, x: focus.x + 140, z: laneCoordinate('x', 0, 1) };
  }

  /** Direction of travel implied by which side of the avenue a lane sits on. */
  function dirForSpot(spot) {
    return spot.axis === 'x'
      ? (spot.z > spot.cross ? 1 : -1)
      : (spot.x < spot.cross ? 1 : -1);
  }

  function addCar(car) {
    scene.add(car.mesh);
    cars.push(car);
    return car;
  }

  function spawnTrafficCar(focus) {
    const spot = randomRoadPoint(60, focus);
    const car = makeCar(CIVIL_STYLES[Math.floor(Math.random() * CIVIL_STYLES.length)], nextPaint());
    car.mode = 'traffic';
    car.axis = spot.axis;
    car.cross = spot.cross;
    car.dir = dirForSpot(spot);
    car.turning = null;
    placeCar(car, spot.x, spot.z, headingOf(spot.axis, car.dir));
    return addCar(car);
  }

  function spawnParkedCar() {
    for (let tries = 0; tries < 30; tries += 1) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const cross = randomAxis();
      const along = -CITY_EDGE + 16 + Math.random() * (CITY_EDGE * 2 - 32);
      if (AXES.some((a) => Math.abs(a - along) < 13)) continue; // not across a crossing
      const side = Math.random() < 0.5 ? 1 : -1;
      const off = side * (ROAD_HALF - 1.6);
      const x = axis === 'x' ? along : cross + off;
      const z = axis === 'x' ? cross + off : along;
      const taxi = Math.random() < 0.14;
      const style = taxi ? 'taxi' : CIVIL_STYLES[Math.floor(Math.random() * CIVIL_STYLES.length)];
      const car = makeCar(style, taxi ? 0xffc93e : nextPaint());
      car.mode = 'parked';
      placeCar(car, x, z, headingOf(axis, side > 0 ? 1 : -1));
      return addCar(car);
    }
    return null;
  }

  /** Teleport a car onto a fresh lane near the focus, as traffic. */
  function recycleAsTraffic(car, focus) {
    const spot = randomRoadPoint(120, focus);
    car.mode = 'traffic';
    car.damage = 0;
    car.dead = false;
    car.vel = { x: 0, z: 0 };
    car.axis = spot.axis;
    car.cross = spot.cross;
    car.dir = dirForSpot(spot);
    car.turning = null;
    placeCar(car, spot.x, spot.z, headingOf(spot.axis, car.dir));
  }

  /** Drive one traffic car along its lane; it turns at some crossings and queues politely. */
  function driveTraffic(car, dt, focus) {
    const pos = car.mesh.position;
    const alongCoord = car.axis === 'x' ? pos.x : pos.z;
    if (!car.turning) {
      const ahead = AXES.find((a) => (a - alongCoord) * car.dir > 4 && (a - alongCoord) * car.dir < 30);
      if (ahead !== undefined) {
        const key = `${car.axis}:${ahead}:${car.cross}`;
        if (car.lastCrossing !== key) {
          car.lastCrossing = key;
          if (Math.random() < 0.4) {
            car.turning = {
              axis: car.axis === 'x' ? 'z' : 'x',
              dir: Math.random() < 0.5 ? 1 : -1,
              cross: ahead,
            };
          }
        }
      }
    }
    let goal;
    if (car.turning) {
      const t = car.turning;
      const tLane = laneCoordinate(t.axis, t.cross, t.dir);
      goal = t.axis === 'z'
        ? { x: tLane, z: t.cross + t.dir * 16 }
        : { x: t.cross + t.dir * 16, z: tLane };
      const past = t.axis === 'z' ? (pos.z - t.cross) * t.dir : (pos.x - t.cross) * t.dir;
      if (past > 6) {
        car.axis = t.axis;
        car.dir = t.dir;
        car.cross = t.cross;
        car.turning = null;
      }
    } else {
      const lane = laneCoordinate(car.axis, car.cross, car.dir);
      goal = car.axis === 'x'
        ? { x: pos.x + car.dir * 14, z: lane }
        : { x: lane, z: pos.z + car.dir * 14 };
    }

    // Slow for whoever is ahead in this lane.
    let targetSpeed = car.cruise;
    const fwd = forwardOf(car.heading);
    for (const other of cars) {
      if (other === car || other.mode === 'parked') continue;
      const dx = other.mesh.position.x - pos.x;
      const dz = other.mesh.position.z - pos.z;
      const aheadDist = dx * fwd.x + dz * fwd.z;
      const sideDist = Math.abs(dx * fwd.z - dz * fwd.x);
      if (aheadDist > 0 && aheadDist < 12 && sideDist < 2.4) {
        targetSpeed = Math.min(targetSpeed, aheadDist < 6 ? 0 : car.cruise * 0.4);
      }
    }
    car.braking = targetSpeed < car.speed - 0.5;
    car.speed += Math.max(-14 * dt, Math.min(6 * dt, targetSpeed - car.speed));
    if (car.speed < 0) car.speed = 0;

    const want = Math.atan2(goal.x - pos.x, goal.z - pos.z);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-2.0 * dt, Math.min(2.0 * dt, diff));
    car.steerVis = Math.max(-0.5, Math.min(0.5, diff));
    pos.x += Math.sin(car.heading) * car.speed * dt;
    pos.z += Math.cos(car.heading) * car.speed * dt;
    syncCarVisual(car, dt);

    if (Math.hypot(pos.x - focus.x, pos.z - focus.z) > 320) recycleAsTraffic(car, focus);
  }

  /** Circle-versus-circle bumps between every pair of cars, with momentum shared out. */
  function collideCars(hooks) {
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.mesh.position.x - a.mesh.position.x;
        const dz = b.mesh.position.z - a.mesh.position.z;
        const min = 3.4;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const push = (min - d) / 2;
        if (a.mode !== 'parked') { a.mesh.position.x -= nx * push; a.mesh.position.z -= nz * push; }
        if (b.mode !== 'parked') { b.mesh.position.x += nx * push; b.mesh.position.z += nz * push; }
        const velOf = (car) => (car.mode === 'traffic'
          ? { x: Math.sin(car.heading) * car.speed, z: Math.cos(car.heading) * car.speed }
          : car.vel);
        const aVel = velOf(a);
        const bVel = velOf(b);
        const rel = (bVel.x - aVel.x) * nx + (bVel.z - aVel.z) * nz;
        if (rel >= -1.5) continue;
        if (hooks && hooks.onCarCrash) hooks.onCarCrash(a, b, -rel);
        for (const [car, other, sign] of [[a, b, -1], [b, a, 1]]) {
          if (car.mode === 'traffic') {
            // Knocked out of its lane discipline: it becomes a loose, rolling car.
            car.mode = 'free';
            car.vel = {
              x: other.vel.x * 0.4 - nx * sign * rel * 0.4,
              z: other.vel.z * 0.4 - nz * sign * rel * 0.4,
            };
            car.speed = 0;
          } else if (car.mode !== 'parked') {
            car.vel.x += nx * sign * rel * 0.55;
            car.vel.z += nz * sign * rel * 0.55;
            car.damage = Math.min(100, car.damage + (-rel) * 1.6);
            if (car.damage >= 100) car.dead = true;
          }
        }
      }
    }
  }

  return {
    cars,
    spawnTrafficCar,
    spawnParkedCar,
    /** Register a car built elsewhere (police cars, the mission Comet). */
    adopt(car) { return addCar(car); },
    /** The closest car Marco could climb into, or null. */
    nearestEnterable(pos, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const car of cars) {
        if (car.mode === 'police' || car.mode === 'player') continue;
        const d = Math.hypot(car.mesh.position.x - pos.x, car.mesh.position.z - pos.z);
        if (d < bestD) { bestD = d; best = car; }
      }
      return best;
    },
    /** One step for the whole fleet. */
    update(dt, focus, hooks) {
      for (const car of cars) {
        if (car.mode === 'traffic') {
          driveTraffic(car, dt, focus);
        } else if (car.mode === 'free') {
          car.vel.x *= Math.exp(-1.4 * dt);
          car.vel.z *= Math.exp(-1.4 * dt);
          car.mesh.position.x += car.vel.x * dt;
          car.mesh.position.z += car.vel.z * dt;
          const freed = pushOutOfColliders(colliders, car.mesh.position.x, car.mesh.position.z, 2.1);
          car.mesh.position.x = freed.x;
          car.mesh.position.z = freed.z;
          car.speed = Math.hypot(car.vel.x, car.vel.z);
          car.braking = car.speed > 3;
          syncCarVisual(car, dt);
          const farAway = Math.hypot(car.mesh.position.x - focus.x, car.mesh.position.z - focus.z) > 170;
          if (car.speed < 0.4 && farAway) recycleAsTraffic(car, focus);
        }
      }
      collideCars(hooks);
    },
  };
}
