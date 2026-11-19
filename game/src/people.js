// The people of Solara Bay. One blocky figure factory builds Marco and every pedestrian —
// torso, head, swinging limb pivots, and a hat when the mood takes it. The player
// controller walks and runs Marco on foot and throws his punch; the crowd strolls the
// sidewalks, turns at crossings, flees from trouble, and goes down when trouble arrives.

import { AXES, CITY_EDGE, ROAD_HALF } from './config.js';
import { pushOutOfColliders } from './world.js';

const SKINS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0x6b4423];
const SHIRTS = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da, 0xfcbad3, 0x2ec1ac, 0xff9f1c, 0x5f6caf];
const PANTS = [0x2b2d42, 0x3d405b, 0x606c38, 0x8a817c, 0x1d3557, 0xbc6c25];
const HATS = [0xffd23e, 0xff6b6b, 0x4ecdc4, 0xf5f0e8];

/**
 * A low-poly person, about 1.8 m tall. Limbs hang from pivots at the shoulder and hip so
 * the walk cycle is just rotations. hat: 'cap' | 'sun' | null.
 */
export function buildPerson(shirt, pants, skin, hat = null) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.28), shirtMat);
  torso.position.y = 1.06;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), skinMat);
  head.position.y = 1.56;
  group.add(head);
  if (hat === 'sun') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.05, 10), new THREE.MeshLambertMaterial({ color: 0xf2e3b3 }));
    brim.position.y = 1.7;
    group.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.14, 10), brim.material);
    crown.position.y = 1.78;
    group.add(crown);
  } else if (hat === 'cap') {
    const capMat = new THREE.MeshLambertMaterial({ color: HATS[Math.floor(Math.random() * HATS.length)] });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.32), capMat);
    top.position.y = 1.74;
    group.add(top);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), capMat);
    peak.position.set(0, 1.71, 0.24);
    group.add(peak);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), new THREE.MeshLambertMaterial({ color: 0x241a12 }));
    hair.position.y = 1.74;
    group.add(hair);
  }

  function limb(mat, w, len, x, y) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    mesh.position.y = -len / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  const armL = limb(skinMat, 0.13, 0.58, 0.34, 1.32);
  const armR = limb(skinMat, 0.13, 0.58, -0.34, 1.32);
  const legL = limb(pantsMat, 0.17, 0.78, 0.14, 0.78);
  const legR = limb(pantsMat, 0.17, 0.78, -0.14, 0.78);
  torso.castShadow = true;
  head.castShadow = true;
  return { group, armL, armR, legL, legR };
}

/** The walk cycle: opposite limbs swing together, with a little bounce. */
function swingLimbs(person, phase, amount) {
  const swing = Math.sin(phase) * 0.6 * amount;
  person.legL.rotation.x = swing;
  person.legR.rotation.x = -swing;
  person.armL.rotation.x = -swing * 0.8;
  person.armR.rotation.x = swing * 0.8;
  person.group.position.y = Math.abs(Math.sin(phase)) * 0.05 * amount;
}

/** Marco Reyes: the player on foot. Health, the punch and the car he's in live here. */
export function createPlayer(scene) {
  const body = buildPerson(0xff8c42, 0x2b2d42, 0xe0ac69, 'cap');
  scene.add(body.group);
  const player = {
    body,
    mesh: body.group,
    heading: Math.PI,
    health: 100,
    mode: 'foot', // foot | car
    car: null,
    walkPhase: 0,
    punchT: 0,
    speedNow: 0,
    /** Throw a punch; the connect window is the swing's first half. */
    punch() { if (player.punchT <= 0) player.punchT = 0.28; },
    get punching() { return player.punchT > 0.14; },
    /**
     * One step on foot. `axes` is the input pair, interpreted against the camera's yaw.
     * Returns the speed actually travelled.
     */
    stepOnFoot(dt, axes, cameraYaw, running, colliders) {
      const pos = player.mesh.position;
      // Camera-relative ground vectors: forward is where the camera looks, right its side.
      const fwd = { x: Math.sin(cameraYaw), z: Math.cos(cameraYaw) };
      const right = { x: -Math.cos(cameraYaw), z: Math.sin(cameraYaw) };
      let mx = right.x * axes.x - fwd.x * axes.z;
      let mz = right.z * axes.x - fwd.z * axes.z;
      const len = Math.hypot(mx, mz);
      const speed = running ? 7.6 : 4.2;
      if (len > 0.01) {
        mx /= len;
        mz /= len;
        const want = Math.atan2(mx, mz);
        let diff = want - player.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        player.heading += Math.max(-11 * dt, Math.min(11 * dt, diff));
        pos.x += mx * speed * dt;
        pos.z += mz * speed * dt;
        player.walkPhase += dt * speed * 1.9;
        player.speedNow = speed;
      } else {
        player.speedNow = 0;
      }
      const freed = pushOutOfColliders(colliders, pos.x, pos.z, 0.55);
      pos.x = Math.max(-CITY_EDGE, Math.min(290, freed.x));
      pos.z = Math.max(-CITY_EDGE, Math.min(CITY_EDGE, freed.z));
      player.mesh.rotation.y = player.heading;
      if (player.punchT > 0) {
        player.punchT -= dt;
        const swing = Math.sin(Math.min(1, (0.28 - player.punchT) / 0.28) * Math.PI);
        body.armR.rotation.x = -2.1 * swing;
        body.armL.rotation.x = 0;
        body.legL.rotation.x = 0;
        body.legR.rotation.x = 0;
      } else {
        swingLimbs(body, player.walkPhase, Math.min(1, player.speedNow / 4));
      }
      return player.speedNow;
    },
    /** Marco hides inside his car while he drives it. */
    setVisible(visible) { player.mesh.visible = visible; },
    /** Stand Marco at a spot, on foot, facing `heading`. */
    place(x, z, heading = 0) {
      player.mesh.position.set(x, 0, z);
      player.heading = heading;
      player.mesh.rotation.set(0, heading, 0);
      player.mesh.visible = player.mode === 'foot';
    },
  };
  return player;
}

/** How far from an avenue's centre line a sidewalk runs. */
function sidewalkLine(side) {
  return side * (ROAD_HALF + 2.3);
}

/**
 * The crowd: two dozen pedestrians on the sidewalks. They stroll, sometimes turn at a
 * crossing, flee anything frightening, and fall when a car or a fist reaches them; a while
 * later they are back on their feet across town. Cars hitting them is reported through
 * hooks.onPedHit(ped, car).
 */
export function createCrowd(scene, colliders) {
  const peds = [];

  function spawnPed(x, z) {
    const hatRoll = Math.random();
    const body = buildPerson(
      SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
      PANTS[Math.floor(Math.random() * PANTS.length)],
      SKINS[Math.floor(Math.random() * SKINS.length)],
      hatRoll < 0.3 ? 'cap' : hatRoll < 0.45 ? 'sun' : null,
    );
    scene.add(body.group);
    const ped = {
      body,
      mesh: body.group,
      axis: Math.random() < 0.5 ? 'x' : 'z',
      cross: AXES[Math.floor(Math.random() * AXES.length)],
      side: Math.random() < 0.5 ? 1 : -1,
      dir: Math.random() < 0.5 ? 1 : -1,
      state: 'walk', // walk | flee | down
      timer: 0,
      walkPhase: Math.random() * 6,
      heading: 0,
      threat: null,
      lastCrossing: '',
    };
    if (x !== undefined) {
      ped.mesh.position.set(x, 0, z);
    } else {
      placeOnSidewalk(ped);
    }
    peds.push(ped);
    return ped;
  }

  function placeOnSidewalk(ped) {
    const along = -CITY_EDGE + Math.random() * CITY_EDGE * 2;
    const off = sidewalkLine(ped.side);
    ped.mesh.position.set(
      ped.axis === 'x' ? along : ped.cross + off,
      0,
      ped.axis === 'x' ? ped.cross + off : along,
    );
  }

  function scarePed(ped, from) {
    if (ped.state === 'down') return;
    ped.state = 'flee';
    ped.timer = 2.5 + Math.random() * 2;
    ped.threat = { x: from.x, z: from.z };
  }

  function downPed(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.timer = 5 + Math.random() * 3;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.18;
  }

  for (let i = 0; i < 24; i += 1) spawnPed();

  return {
    peds,
    scarePed,
    downPed,
    /** The driver of a car Marco just took, bursting out and running for it. */
    spawnFleeingDriver(x, z) {
      const ped = spawnPed(x, z);
      scarePed(ped, { x, z });
      return ped;
    },
    /** Frighten everyone within earshot. */
    scareArea(pos, radius) {
      for (const ped of peds) {
        if (Math.hypot(ped.mesh.position.x - pos.x, ped.mesh.position.z - pos.z) < radius) {
          scarePed(ped, pos);
        }
      }
    },
    /** The nearest standing pedestrian in front of a fist, or null. */
    nearestInFront(pos, heading, range) {
      let best = null;
      let bestD = range;
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        const dx = ped.mesh.position.x - pos.x;
        const dz = ped.mesh.position.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d > range) continue;
        const dot = (dx * Math.sin(heading) + dz * Math.cos(heading)) / (d || 1);
        if (dot > 0.45 && d < bestD) { bestD = d; best = ped; }
      }
      return best;
    },
    /** One step for the whole crowd. `cars` is the fleet list, watched for danger. */
    update(dt, cars, hooks) {
      for (const ped of peds) {
        const pos = ped.mesh.position;
        if (ped.state === 'down') {
          ped.timer -= dt;
          if (ped.timer <= 0) {
            ped.axis = Math.random() < 0.5 ? 'x' : 'z';
            ped.cross = AXES[Math.floor(Math.random() * AXES.length)];
            ped.side = Math.random() < 0.5 ? 1 : -1;
            placeOnSidewalk(ped);
            ped.mesh.rotation.x = 0;
            ped.state = 'walk';
          }
          continue;
        }

        // Cars are what a pedestrian fears: close and fast means run; contact means down.
        for (const car of cars) {
          if (car.mode === 'parked') continue;
          const carSpeed = Math.abs(car.speed) || Math.hypot(car.vel.x, car.vel.z);
          if (carSpeed < 2.5) continue;
          const d = Math.hypot(car.mesh.position.x - pos.x, car.mesh.position.z - pos.z);
          if (d < 2.0) {
            downPed(ped);
            if (hooks && hooks.onPedHit) hooks.onPedHit(ped, car);
            break;
          }
          if (d < 7 && carSpeed > 12 && ped.state === 'walk') scarePed(ped, car.mesh.position);
        }
        if (ped.state === 'down') continue;

        if (ped.state === 'flee') {
          ped.timer -= dt;
          const away = Math.atan2(pos.x - ped.threat.x, pos.z - ped.threat.z);
          ped.heading = away;
          pos.x += Math.sin(away) * 6.2 * dt;
          pos.z += Math.cos(away) * 6.2 * dt;
          ped.walkPhase += dt * 11;
          swingLimbs(ped.body, ped.walkPhase, 1);
          if (ped.timer <= 0) ped.state = 'walk';
        } else {
          // Stroll the sidewalk line; near a crossing, sometimes turn the corner.
          const along = ped.axis === 'x' ? pos.x : pos.z;
          const next = AXES.find((a) => (a - along) * ped.dir > 2 && (a - along) * ped.dir < 16);
          if (next !== undefined) {
            const key = `${ped.axis}:${next}:${ped.cross}`;
            if (ped.lastCrossing !== key) {
              ped.lastCrossing = key;
              if (Math.random() < 0.3) {
                ped.axis = ped.axis === 'x' ? 'z' : 'x';
                ped.cross = next;
                ped.dir = Math.random() < 0.5 ? 1 : -1;
                ped.side = Math.random() < 0.5 ? 1 : -1;
              }
            }
          }
          const off = sidewalkLine(ped.side);
          const target = ped.axis === 'x'
            ? { x: pos.x + ped.dir * 6, z: ped.cross + off }
            : { x: ped.cross + off, z: pos.z + ped.dir * 6 };
          const want = Math.atan2(target.x - pos.x, target.z - pos.z);
          let diff = want - ped.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          ped.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));
          pos.x += Math.sin(ped.heading) * 1.5 * dt;
          pos.z += Math.cos(ped.heading) * 1.5 * dt;
          ped.walkPhase += dt * 5.4;
          swingLimbs(ped.body, ped.walkPhase, 0.7);
          if (pos.x < -CITY_EDGE || pos.x > CITY_EDGE + 24 || pos.z < -CITY_EDGE || pos.z > CITY_EDGE) {
            ped.dir *= -1;
          }
        }

        const freed = pushOutOfColliders(colliders, pos.x, pos.z, 0.45);
        pos.x = freed.x;
        pos.z = freed.z;
        ped.mesh.rotation.y = ped.heading;
      }
    },
  };
}
