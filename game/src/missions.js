// Lupe Ferrer's work, and the bay's small change. A five-job story chain — steal a car,
// run a package, lose the law, sell the car against the clock, rob the bank — and then
// endless cab fares once Marco owns the town. This module owns the objective beacon, the
// stage logic and timers for every job, and the street cash scattered over the sidewalks.

import { AXES, CITY_EDGE, PLACES } from './config.js';
import { buildCarMesh, placeCar } from './cars.js';

const STORY = [
  {
    id: 'first-wheels',
    title: 'FIRST WHEELS',
    from: 'LUPE · FIXER',
    intro: 'A collector wants the turquoise Comet at Palmera Beach Lot. Take it, bring it to my garage. Quietly.',
    reward: 750,
  },
  {
    id: 'hot-package',
    title: 'HOT PACKAGE',
    from: 'LUPE · FIXER',
    intro: 'A package waits at Marina del Sol. Pick it up and get it to Casino Azul — fast, and do not stop for anyone.',
    reward: 1200,
  },
  {
    id: 'lose-the-heat',
    title: 'LOSE THE HEAT',
    from: 'LUPE · FIXER',
    intro: 'The SBPD has your plates now. Draw them out, then disappear. No stars, no deal.',
    reward: 1500,
  },
  {
    id: 'sunset-run',
    title: 'SUNSET RUN',
    from: 'LUPE · FIXER',
    intro: 'The collector is done waiting: he is at Solara Airstrip with cash in hand. The Comet, at the airstrip, before his plane leaves — and its plates are hot now.',
    reward: 2200,
  },
  {
    id: 'marina-vault',
    title: 'THE MARINA VAULT',
    from: 'LUPE · FIXER',
    intro: 'Banco Solara keeps the marina money in its back vault. Walk in, fill a bag, and be at the airstrip before they close the sky.',
    reward: 4000,
  },
];

/** The objective marker: a column of light you can see across town, and a ring to stand in. */
function buildBeacon(colour = 0xffd23e) {
  const group = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 46, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  column.position.y = 23;
  group.add(column);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.1, 32),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  group.add(ring);
  group.visible = false;
  return { group, column };
}

export function createMissions(scene, fleet) {
  const beacon = buildBeacon();
  scene.add(beacon.group);

  // --- Street cash -------------------------------------------------------------
  const cashMat = new THREE.MeshBasicMaterial({ color: 0x39ff6a });
  const cashGeom = new THREE.BoxGeometry(0.7, 0.35, 0.5);
  const cashSpots = [];
  for (let i = 0; i < 16; i += 1) {
    const mesh = new THREE.Mesh(cashGeom, cashMat);
    scene.add(mesh);
    cashSpots.push({ mesh, x: 0, z: 0, timer: Math.random() * 8 });
  }
  function scatterCash(spot) {
    const haunts = [
      [PLACES.marina.x - 18, PLACES.marina.z + 16], [PLACES.beachLot.x - 12, PLACES.beachLot.z - 18],
      [PLACES.casino.x + 24, PLACES.casino.z + 10], [PLACES.bank.x - 22, PLACES.bank.z - 14],
      [-38, -38], [38, 38], [-114, 114], [114, -114], [-190, -38], [190, 190],
      [0, -190], [-38, 190], [266, -190], [252, 190], [-190, 38], [76, -236],
    ];
    const pick = haunts[Math.floor(Math.random() * haunts.length)];
    spot.x = pick[0] + (Math.random() * 8 - 4);
    spot.z = pick[1] + (Math.random() * 8 - 4);
    spot.mesh.position.set(spot.x, 0.6, spot.z);
    spot.mesh.visible = true;
  }
  for (const spot of cashSpots) scatterCash(spot);

  // --- Job state -----------------------------------------------------------------
  let storyIndex = 0;
  let storyDone = false;
  let active = null; // { def, stage, timer, holdT, armed, objectiveText, metaText, targetPos }
  let fare = null; // { stage, pickup, drop, pay }
  let beaconClock = 0;

  // The turquoise Comet the first and fourth jobs revolve around, built once.
  let comet = null;
  function ensureComet() {
    if (comet) return comet;
    const built = buildCarMesh('sport', 0x12c2b8);
    comet = {
      mesh: built.group,
      wheels: built.wheels,
      lightbar: null,
      tailMat: built.tailMat,
      paintMat: built.paintMat,
      style: 'sport',
      mode: 'parked',
      heading: 0,
      vel: { x: 0, z: 0 },
      speed: 0,
      axis: 'x', dir: 1, cross: 0, turning: null, lastCrossing: '',
      cruise: 10, topSpeed: 46, accel: 17,
      damage: 0, dead: false, braking: false, steerVis: 0,
      id: 'lupe-comet',
    };
    placeCar(comet, PLACES.beachLot.x, PLACES.beachLot.z, Math.PI);
    scene.add(comet.mesh);
    fleet.adopt(comet);
    return comet;
  }

  function randomStreetPoint() {
    const a = AXES[Math.floor(Math.random() * AXES.length)];
    const t = -CITY_EDGE + 20 + Math.random() * (CITY_EDGE * 2 - 40);
    return Math.random() < 0.5 ? { x: t, z: a + 9.5 } : { x: a + 9.5, z: t };
  }

  function metresText(from, to) {
    return `${Math.round(Math.hypot(to.x - from.x, to.z - from.z) / 10) * 10} m`;
  }

  function finishMission(ctx) {
    const def = active.def;
    ctx.addMoney(def.reward);
    ctx.sound.missionDone();
    ctx.banner('JOB DONE', `${def.title} — $${def.reward} paid by Lupe`);
    active = null;
    storyIndex += 1;
    if (storyIndex >= STORY.length) {
      storyDone = true;
      ctx.banner('SOLARA HEAT', 'Story complete — the bay is yours. Fares pay whenever you want them.');
    }
    ctx.saveProgress();
  }

  function failMission(ctx, why) {
    active = null;
    ctx.sound.fail();
    ctx.toast(why);
  }

  function updateFare(ctx) {
    if (fare.stage === 0) {
      if (ctx.inCar && Math.hypot(ctx.pos.x - fare.pickup.x, ctx.pos.z - fare.pickup.z) < 8) {
        fare.stage = 1;
        fare.drop = randomStreetPoint();
        fare.pay = 60 + Math.round(Math.hypot(fare.drop.x - fare.pickup.x, fare.drop.z - fare.pickup.z) * 0.4);
        ctx.toast('Passenger in. Drive smooth, tip like a local.');
        ctx.sound.blip();
      }
    } else if (Math.hypot(ctx.pos.x - fare.drop.x, ctx.pos.z - fare.drop.z) < 9) {
      ctx.addMoney(fare.pay);
      ctx.sound.cash();
      ctx.toast(`Fare paid — $${fare.pay}. Press M for another.`);
      fare = null;
    }
  }

  return {
    STORY,
    get storyIndex() { return storyIndex; },
    get storyDone() { return storyDone; },
    get active() { return active; },
    get fare() { return fare; },
    /** Put story progress back where a save left it. */
    restore(index, done) {
      storyIndex = index;
      storyDone = done === true;
      if (!storyDone && storyIndex === 0) ensureComet();
    },
    /** Start the next story job; returns its definition, or null when the story is told. */
    startNext() {
      if (storyDone || storyIndex >= STORY.length) return null;
      const def = STORY[storyIndex];
      active = { def, stage: 0, timer: 0, holdT: 0, armed: false, objectiveText: null, metaText: null, targetPos: null };
      if (def.id === 'first-wheels' || def.id === 'sunset-run') ensureComet();
      return def;
    },
    /** Dispatch a cab fare. */
    startFare() {
      fare = { stage: 0, pickup: randomStreetPoint(), drop: null, pay: 0 };
      return fare;
    },
    /** What the phone shows right now: { from, objective, meta, target }. */
    currentBrief(pos) {
      if (active) {
        const target = active.targetPos ? active.targetPos() : null;
        return {
          from: active.def.from,
          objective: active.objectiveText || active.def.intro,
          meta: active.metaText || (target ? metresText(pos, target) : ''),
          target,
        };
      }
      if (fare) {
        const target = fare.stage === 0 ? fare.pickup : fare.drop;
        return {
          from: 'FARE · DISPATCH',
          objective: fare.stage === 0 ? 'Pick up the passenger at the marker.' : 'Take your passenger to the drop-off.',
          meta: metresText(pos, target),
          target,
        };
      }
      if (storyDone) {
        return {
          from: 'LUPE · FIXER',
          objective: 'Solara Bay is yours, Marco. Press M for a fare, or just enjoy the sun.',
          meta: '',
          target: null,
        };
      }
      const next = STORY[storyIndex];
      return {
        from: 'LUPE · FIXER',
        objective: `Press M — new job: ${next.title}.`,
        meta: `$${next.reward} on the table`,
        target: null,
      };
    },
    /**
     * One step of jobs and street cash. ctx carries the world as the director needs it:
     * { pos, playerCar, inCar, stars, setStars, crime, addMoney, toast, banner, sound,
     *   saveProgress }.
     */
    update(dt, ctx) {
      beaconClock += dt;

      // Street cash spins and glitters; walking or driving over it pockets it.
      for (const spot of cashSpots) {
        if (!spot.mesh.visible) {
          spot.timer -= dt;
          if (spot.timer <= 0) scatterCash(spot);
          continue;
        }
        spot.mesh.rotation.y += dt * 2.4;
        spot.mesh.position.y = 0.6 + Math.sin(beaconClock * 3 + spot.x) * 0.15;
        if (Math.hypot(ctx.pos.x - spot.x, ctx.pos.z - spot.z) < 2.6) {
          spot.mesh.visible = false;
          spot.timer = 25;
          const amount = 20 + Math.floor(Math.random() * 40);
          ctx.addMoney(amount);
          ctx.sound.cash();
          ctx.toast(`+$${amount} — street cash`);
        }
      }

      // The beacon stands over whatever the current job points at.
      const brief = this.currentBrief(ctx.pos);
      if (brief.target) {
        beacon.group.visible = true;
        beacon.group.position.set(brief.target.x, 0, brief.target.z);
        beacon.column.material.opacity = 0.24 + Math.sin(beaconClock * 4) * 0.08;
      } else {
        beacon.group.visible = false;
      }

      if (fare && !active) updateFare(ctx);
      if (!active) return;
      const a = active;
      const def = a.def;

      if (def.id === 'first-wheels') {
        const car = ensureComet();
        if (a.stage === 0) {
          a.objectiveText = 'Steal the turquoise Comet at Palmera Beach Lot.';
          a.targetPos = () => ({ x: car.mesh.position.x, z: car.mesh.position.z });
          a.metaText = metresText(ctx.pos, car.mesh.position);
          if (ctx.playerCar === car) {
            a.stage = 1;
            ctx.toast("That's the car. Now the garage.");
            ctx.sound.phone();
          }
        } else {
          a.objectiveText = "Deliver the Comet to Lupe's Garage.";
          a.targetPos = () => PLACES.garage;
          a.metaText = metresText(ctx.pos, PLACES.garage);
          if (ctx.playerCar === car && Math.hypot(ctx.pos.x - PLACES.garage.x, ctx.pos.z - PLACES.garage.z) < 11) {
            finishMission(ctx);
          }
        }
      }

      if (def.id === 'hot-package') {
        if (a.stage === 0) {
          a.objectiveText = 'Pick up the package at Marina del Sol.';
          a.targetPos = () => PLACES.marina;
          a.metaText = metresText(ctx.pos, PLACES.marina);
          if (Math.hypot(ctx.pos.x - PLACES.marina.x, ctx.pos.z - PLACES.marina.z) < 10) {
            a.stage = 1;
            a.timer = 150;
            ctx.crime(120);
            ctx.toast('Package on board. The bay just got interested.');
            ctx.sound.phone();
          }
        } else {
          a.timer -= dt;
          a.objectiveText = 'Get the package to Casino Azul — do not stop.';
          a.targetPos = () => PLACES.casino;
          a.metaText = `${Math.max(0, Math.ceil(a.timer))}s · ${metresText(ctx.pos, PLACES.casino)}`;
          if (Math.hypot(ctx.pos.x - PLACES.casino.x, ctx.pos.z - PLACES.casino.z) < 11) {
            finishMission(ctx);
          } else if (a.timer <= 0) {
            failMission(ctx, 'The buyer walked away. Lupe will call again — press M to retry.');
          }
        }
      }

      if (def.id === 'lose-the-heat') {
        a.objectiveText = 'Lose the SBPD: break their line of sight until the stars are gone.';
        a.targetPos = null;
        if (ctx.stars > 0) a.armed = true;
        if (!a.armed) {
          // The job opens by making sure Marco is wanted.
          ctx.setStars(2);
          a.armed = true;
        }
        a.metaText = `${ctx.stars} star${ctx.stars === 1 ? '' : 's'} — hide, outrun, vanish`;
        if (a.armed && ctx.stars === 0) finishMission(ctx);
      }

      if (def.id === 'sunset-run') {
        const car = ensureComet();
        if (a.stage === 0) {
          a.objectiveText = 'Get the Comet — wherever it ended up.';
          a.targetPos = () => ({ x: car.mesh.position.x, z: car.mesh.position.z });
          a.metaText = metresText(ctx.pos, car.mesh.position);
          if (ctx.playerCar === car) {
            a.stage = 1;
            a.timer = 110;
            ctx.setStars(2);
            ctx.toast('Plates are hot and the clock is running. Go.');
            ctx.sound.phone();
          }
        } else {
          a.timer -= dt;
          a.objectiveText = 'Deliver the Comet to Solara Airstrip before the plane leaves.';
          a.targetPos = () => PLACES.airport;
          a.metaText = `${Math.max(0, Math.ceil(a.timer))}s · ${metresText(ctx.pos, PLACES.airport)}`;
          if (ctx.playerCar === car && Math.hypot(ctx.pos.x - PLACES.airport.x, ctx.pos.z - PLACES.airport.z) < 15) {
            finishMission(ctx);
          } else if (a.timer <= 0) {
            failMission(ctx, 'The plane left without its car. Press M when Lupe calls again.');
          }
        }
      }

      if (def.id === 'marina-vault') {
        if (a.stage === 0) {
          a.objectiveText = 'Go to Banco Solara — on foot, through the front.';
          a.targetPos = () => PLACES.bank;
          a.metaText = metresText(ctx.pos, PLACES.bank);
          if (!ctx.inCar && Math.hypot(ctx.pos.x - PLACES.bank.x, ctx.pos.z - PLACES.bank.z) < 10) a.stage = 1;
        } else if (a.stage === 1) {
          a.objectiveText = 'Stay at the vault and fill the bag.';
          a.targetPos = () => PLACES.bank;
          if (!ctx.inCar && Math.hypot(ctx.pos.x - PLACES.bank.x, ctx.pos.z - PLACES.bank.z) < 10) {
            a.holdT += dt;
            a.metaText = `Filling the bag… ${Math.min(100, Math.round((a.holdT / 5) * 100))}%`;
            if (a.holdT >= 5) {
              a.stage = 2;
              ctx.setStars(4);
              ctx.toast("Bag's full. Every cop in the bay just woke up.");
              ctx.sound.phone();
            }
          } else {
            a.holdT = Math.max(0, a.holdT - dt * 2);
            a.metaText = 'Get back to the vault door.';
          }
        } else {
          a.objectiveText = 'Escape to Solara Airstrip with the money.';
          a.targetPos = () => PLACES.airport;
          a.metaText = metresText(ctx.pos, PLACES.airport);
          if (Math.hypot(ctx.pos.x - PLACES.airport.x, ctx.pos.z - PLACES.airport.z) < 15) {
            finishMission(ctx);
          }
        }
      }
    },
  };
}
