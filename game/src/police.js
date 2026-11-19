// The Solara Bay Police Department. Behind the stars sits a heat meter: crimes pour heat
// in, hiding lets it drain. Patrol cars roll in from a few blocks away, hunt with the same
// arcade physics Marco drives with, aim where he is going rather than where he is, and
// make the arrest by holding him nearly still with an officer close by.

import { AXES, CITY_EDGE } from './config.js';
import { forwardOf, headingOf, laneCoordinate, makeExternalCar, placeCar, stepVehicle } from './cars.js';

/** Heat points per star; five stars is the whole bay looking for Marco. */
const HEAT_PER_STAR = 100;
/** How close an officer must be to count as having eyes on the player. */
const SIGHT_RANGE = 58;

export function createPolice(scene, fleet, colliders) {
  const cops = [];
  let heat = 0;
  let unseenFor = 99;
  let bustTimer = 0;
  let flashClock = 0;

  const starCount = () => (heat <= 0 ? 0 : Math.min(5, Math.ceil(heat / HEAT_PER_STAR)));

  /** A lane point a few blocks from the player, for a patrol car to roll in from. */
  function spawnPoint(focus) {
    for (let tries = 0; tries < 24; tries += 1) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const cross = AXES[Math.floor(Math.random() * AXES.length)];
      const along = -CITY_EDGE + Math.random() * CITY_EDGE * 2;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const lane = laneCoordinate(axis, cross, dir);
      const x = axis === 'x' ? along : lane;
      const z = axis === 'x' ? lane : along;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d > 95 && d < 170) return { x, z, heading: headingOf(axis, dir) };
    }
    return { x: focus.x + 120, z: focus.z, heading: -Math.PI / 2 };
  }

  function addCop(focus) {
    const spot = spawnPoint(focus);
    const car = makeExternalCar('police', 0xf2f2f2);
    car.mode = 'police';
    placeCar(car, spot.x, spot.z, spot.heading);
    scene.add(car.mesh);
    fleet.adopt(car);
    cops.push(car);
    return car;
  }

  function removeCop(car) {
    scene.remove(car.mesh);
    const inFleet = fleet.cars.indexOf(car);
    if (inFleet >= 0) fleet.cars.splice(inFleet, 1);
    const inForce = cops.indexOf(car);
    if (inForce >= 0) cops.splice(inForce, 1);
  }

  return {
    cops,
    get heat() { return heat; },
    get stars() { return starCount(); },
    /** True while any officer has had eyes on Marco in the last moment. */
    get seen() { return unseenFor < 0.4; },
    /** Report a crime: heat goes in, scaled by how serious it was. */
    commitCrime(points) {
      heat = Math.min(HEAT_PER_STAR * 5, heat + points);
    },
    /** Set the wanted level directly (missions that begin hot). Mid-band, so a moment
     *  of cooling does not shave the star off again. */
    setStars(count) {
      heat = count <= 0 ? 0 : (count - 1) * HEAT_PER_STAR + HEAT_PER_STAR / 2;
    },
    /** A clean slate: every patrol car goes home. */
    clear() {
      heat = 0;
      bustTimer = 0;
      unseenFor = 99;
      while (cops.length) removeCop(cops[0]);
    },
    /** Distance to the nearest officer, for sirens and nerves. */
    nearestDistance(pos) {
      let best = Infinity;
      for (const cop of cops) {
        best = Math.min(best, Math.hypot(cop.mesh.position.x - pos.x, cop.mesh.position.z - pos.z));
      }
      return best;
    },
    /**
     * One step of the hunt. target = { x, z, velX, velZ, speed, inCar }.
     * hooks.onBusted fires when the arrest completes. Returns the bust progress 0..1
     * and whether the player is currently seen.
     */
    update(dt, target, hooks) {
      const level = starCount();

      // Line of sight, by simple range: any close officer keeps the heat from cooling.
      let anySeen = false;
      for (const cop of cops) {
        if (Math.hypot(cop.mesh.position.x - target.x, cop.mesh.position.z - target.z) < SIGHT_RANGE) {
          anySeen = true;
        }
      }
      unseenFor = anySeen ? 0 : unseenFor + dt;
      if (unseenFor > 5 && heat > 0) heat = Math.max(0, heat - 16 * dt);

      // Roll call: one car per star, plus the first.
      const wanted = level === 0 ? 0 : Math.min(6, 1 + level);
      if (cops.length < wanted) addCop(target);
      for (let i = cops.length - 1; i >= 0; i -= 1) {
        const cop = cops[i];
        const d = Math.hypot(cop.mesh.position.x - target.x, cop.mesh.position.z - target.z);
        if ((level === 0 && d > 60) || d > 300) removeCop(cop);
      }

      // Lightbars strobe: red and blue trade places twice a second.
      flashClock += dt;
      const redHigh = Math.floor(flashClock * 2.6) % 2 === 0;
      for (const cop of cops) {
        if (!cop.lightbar) continue;
        cop.lightbar.red.color.setHex(redHigh ? 0xff2a2a : 0x571111);
        cop.lightbar.blue.color.setHex(redHigh ? 0x1c3f8f : 0x2a6bff);
      }

      // The pursuit itself.
      let closeEnough = false;
      for (const cop of cops) {
        const pos = cop.mesh.position;
        // Aim at where the target will be; hotter chases aim further ahead to cut off.
        const lead = target.inCar ? 0.4 + level * 0.05 : 0.15;
        const aimX = target.x + target.velX * lead;
        const aimZ = target.z + target.velZ * lead;
        const dist = Math.hypot(aimX - pos.x, aimZ - pos.z);
        const want = Math.atan2(aimX - pos.x, aimZ - pos.z);
        let diff = want - cop.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, diff * 1.7));
        let throttle = Math.abs(diff) > 1.9 ? -0.6 : 1;
        // On foot, an officer pulls up and makes the arrest instead of running Marco down.
        if (!target.inCar && dist < 8) throttle = dist < 5.5 ? -0.4 : 0.08;
        // And nobody piles into the patrol car ahead.
        const fwd = forwardOf(cop.heading);
        for (const other of cops) {
          if (other === cop) continue;
          const dx = other.mesh.position.x - pos.x;
          const dz = other.mesh.position.z - pos.z;
          const aheadDist = dx * fwd.x + dz * fwd.z;
          const sideDist = Math.abs(dx * fwd.z - dz * fwd.x);
          if (aheadDist > 0 && aheadDist < 7 && sideDist < 2.2) throttle = Math.min(throttle, 0);
        }
        cop.topSpeed = 40 + level * 1.6;
        stepVehicle(cop, dt, { throttle, steer, handbrake: false }, colliders, null);
        if (dist < (target.inCar ? 9.5 : 8.5)) closeEnough = true;
      }

      // The arrest: pinned nearly still with an officer alongside for a few seconds.
      const pinned = target.inCar ? Math.abs(target.speed) < 1.6 : target.speed < 2.6;
      if (level > 0 && closeEnough && pinned) {
        bustTimer += dt;
        if (bustTimer > 2.2 && hooks && hooks.onBusted) {
          bustTimer = 0;
          hooks.onBusted();
        }
      } else {
        bustTimer = Math.max(0, bustTimer - dt * 1.6);
      }
      return { bustProgress: Math.min(1, bustTimer / 2.2), seen: anySeen };
    },
  };
}
