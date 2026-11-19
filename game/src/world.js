// Solara Bay, built once at boot from the grid in config.js: golden-hour sky, avenues with
// crosswalks, pastel towers with rooftop clutter, signed landmarks, palms and lamps, the
// beach with its umbrellas, a pier and bobbing boats, and the sea. Everything solid leaves
// an AABB in the collider list, and the two helpers at the bottom answer every "can I be
// here" question the rest of the game asks.

import { AXES, BLOCK_EDGE, CITY_EDGE, PITCH, PLACES, ROAD_HALF, SHORE_X } from './config.js';

const FACADE_TINTS = [0xf6d8b0, 0xf2b8c6, 0xa8d8ea, 0xfdfd96, 0xc3f0ca, 0xffc48f, 0xe6e6fa, 0xf5f0e8, 0xffb7a5, 0x9fd8c9];

/** A tiny deterministic random: the city must be the same city on every visit. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Stucco facade texture: a grid of windows on plaster, a few windows lit warm. */
function facadeTexture(rand) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f2ead9';
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const r = rand();
      g.fillStyle = r < 0.15 ? '#ffd98a' : (r < 0.58 ? '#33566b' : '#406e87');
      g.fillRect(8 + col * 20, 10 + row * 20, 12, 13);
    }
  }
  g.fillStyle = 'rgba(60,40,20,0.18)';
  g.fillRect(0, 246, 128, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A bold painted sign for a named place. */
function signTexture(text, background, foreground) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = background;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = foreground;
  g.font = '900 50px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Asphalt that tiles along an avenue, with one dashed centre line per tile. */
function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#33333c';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 240; i += 1) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.fillStyle = '#e8e4d2';
  g.fillRect(6, 60, 46, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Merge coloured box parts into a single BufferGeometry with vertex colours.
 * Each part: { x, y, z, sx, sy, sz, rx?, ry?, rz?, color }.
 */
function mergeBoxes(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const pos = unit.getAttribute('position');
  const nor = unit.getAttribute('normal');
  const idx = unit.getIndex().array;
  const matrix = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (const part of parts) {
    matrix.makeRotationFromEuler(new THREE.Euler(part.rx || 0, part.ry || 0, part.rz || 0));
    matrix.scale(new THREE.Vector3(part.sx, part.sy, part.sz));
    matrix.setPosition(part.x, part.y, part.z);
    const colour = new THREE.Color(part.color);
    const base = positions.length / 3;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      positions.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).transformDirection(matrix);
      normals.push(v.x, v.y, v.z);
      colors.push(colour.r, colour.g, colour.b);
    }
    for (let i = 0; i < idx.length; i += 1) indices.push(base + idx[i]);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  return geom;
}

/** A leaning palm: stacked trunk segments and a crown of drooping fronds. */
function palmGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i += 1) {
    parts.push({ x: i * 0.15, y: 1 + i * 1.05, z: 0, sx: 0.34, sy: 1.25, sz: 0.34, rz: -0.13, color: 0x8a6b48 });
  }
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    parts.push({
      x: 0.75 + Math.cos(a) * 1.2, y: 6.15, z: Math.sin(a) * 1.2,
      sx: 2.7, sy: 0.09, sz: 0.5, ry: -a, rz: Math.cos(a) * 0.48, rx: -Math.sin(a) * 0.48, color: 0x2e9e4f,
    });
  }
  return mergeBoxes(parts);
}

/** A street light with its lamp head hanging over the road. */
function lampGeometry() {
  return mergeBoxes([
    { x: 0, y: 3, z: 0, sx: 0.18, sy: 6, sz: 0.18, color: 0x3a3f4a },
    { x: 0.85, y: 5.92, z: 0, sx: 1.9, sy: 0.14, sz: 0.14, color: 0x3a3f4a },
    { x: 1.75, y: 5.8, z: 0, sx: 0.55, sy: 0.16, sz: 0.3, color: 0xffca7a },
  ]);
}

/** A beach umbrella and its towel, ready to be planted in the sand. */
function umbrellaGeometry() {
  return mergeBoxes([
    { x: 0, y: 0.85, z: 0, sx: 0.09, sy: 1.7, sz: 0.09, color: 0xe8e2d0 },
    { x: 0, y: 1.78, z: 0, sx: 2.5, sy: 0.16, sz: 2.5, ry: Math.PI / 4, color: 0xff6b6b },
    { x: 1.3, y: 0.05, z: 0.5, sx: 1.9, sy: 0.05, sz: 0.95, ry: 0.4, color: 0x4ecdc4 },
  ]);
}

/**
 * Build the entire city into `scene`.
 * Returns { colliders, sun, update(dt, focus) }.
 */
export function buildCity(scene) {
  const rand = lcg(20261117);
  const colliders = [];
  const addCollider = (cx, cz, halfW, halfD) => {
    colliders.push({ minX: cx - halfW, maxX: cx + halfW, minZ: cz - halfD, maxZ: cz + halfD });
  };
  const dummy = new THREE.Object3D();

  // --- Sky, light and haze -------------------------------------------------
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 256;
  const sg = skyCanvas.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2d6cb5');
  grad.addColorStop(0.45, '#7fb2dd');
  grad.addColorStop(0.72, '#ffc98a');
  grad.addColorStop(1, '#ff9d6f');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  ));
  scene.fog = new THREE.Fog(0xf2a56b, 230, 1150);
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x54455e, 0.95));
  const sun = new THREE.DirectionalLight(0xffbe78, 1.9);
  sun.position.set(-420, 300, -260);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  sun.shadow.camera.far = 1500;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // --- Land and water --------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3200, 3200),
    new THREE.MeshLambertMaterial({ color: 0x7d8461 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 660),
    new THREE.MeshLambertMaterial({ color: 0xeed9a4 }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(283, 0.0, 0);
  beach.receiveShadow = true;
  scene.add(beach);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 2400),
    new THREE.MeshPhongMaterial({ color: 0x14708e, shininess: 130, transparent: true, opacity: 0.94 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SHORE_X + 720, 0.12, 0);
  scene.add(sea);

  // --- Avenues, crossings and zebra stripes ----------------------------------
  const asphalt = asphaltTexture();
  const plainAsphalt = new THREE.MeshLambertMaterial({ color: 0x33333c });
  const span = CITY_EDGE + 46;
  for (const z of AXES) {
    const tex = asphalt.clone();
    tex.needsUpdate = true;
    tex.repeat.set(span / 9, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, ROAD_HALF * 2), new THREE.MeshLambertMaterial({ map: tex }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, z);
    road.receiveShadow = true;
    scene.add(road);
  }
  for (const x of AXES) {
    const tex = asphalt.clone();
    tex.needsUpdate = true;
    tex.repeat.set(span / 9, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, ROAD_HALF * 2), new THREE.MeshLambertMaterial({ map: tex }));
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = Math.PI / 2;
    road.position.set(x, 0.02, 0);
    road.receiveShadow = true;
    scene.add(road);
  }
  for (const x of AXES) {
    for (const z of AXES) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, ROAD_HALF * 2), plainAsphalt);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(x, 0.035, z);
      pad.receiveShadow = true;
      scene.add(pad);
    }
  }
  // Zebra stripes on all four arms of every crossing, as one instanced mesh.
  const stripeGeom = new THREE.BoxGeometry(0.5, 0.03, 3.6);
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xf2efe4 });
  const stripeSpots = [];
  for (const x of AXES) {
    for (const z of AXES) {
      for (const sideSign of [-1, 1]) {
        // Across the north-south avenue, north and south of the crossing.
        for (let i = 0; i < 6; i += 1) {
          stripeSpots.push({ x: x - 4.6 + i * 1.85, z: z + sideSign * (ROAD_HALF + 2.1), ry: Math.PI / 2 });
        }
        // Across the east-west avenue, east and west of the crossing.
        for (let i = 0; i < 6; i += 1) {
          stripeSpots.push({ x: x + sideSign * (ROAD_HALF + 2.1), z: z - 4.6 + i * 1.85, ry: 0 });
        }
      }
    }
  }
  const stripes = new THREE.InstancedMesh(stripeGeom, stripeMat, stripeSpots.length);
  stripeSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0.05, spot.z);
    dummy.rotation.set(0, spot.ry, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    stripes.setMatrixAt(i, dummy.matrix);
  });
  scene.add(stripes);

  // --- Blocks and towers -------------------------------------------------------
  const apronMat = new THREE.MeshLambertMaterial({ color: 0xb9b0a0 });
  const blockSize = PITCH - BLOCK_EDGE * 2;
  const towerGeom = new THREE.BoxGeometry(1, 1, 1);
  towerGeom.translate(0, 0.5, 0);
  const towerMat = new THREE.MeshLambertMaterial({ map: facadeTexture(rand) });
  const towerSpots = [];
  const roofSpots = [];
  // Blocks (by grid index) reserved for the signed landmarks below.
  const landmarkBlocks = new Set(['3,5', '5,1', '1,1', '4,3', '0,4', '2,0', '5,5']);
  for (let ix = 0; ix < AXES.length - 1; ix += 1) {
    for (let iz = 0; iz < AXES.length - 1; iz += 1) {
      const cx = (AXES[ix] + AXES[ix + 1]) / 2;
      const cz = (AXES[iz] + AXES[iz + 1]) / 2;
      const apron = new THREE.Mesh(new THREE.BoxGeometry(blockSize, 0.24, blockSize), apronMat);
      apron.position.set(cx, 0.12, cz);
      apron.receiveShadow = true;
      scene.add(apron);
      if (landmarkBlocks.has(`${ix},${iz}`)) continue;
      if (rand() < 0.42) {
        const w = 26 + rand() * 12;
        const h = 22 + rand() * 48;
        towerSpots.push({ x: cx, z: cz, w, d: w, h });
        addCollider(cx, cz, w / 2, w / 2);
        if (h > 30) roofSpots.push({ x: cx + (rand() * 10 - 5), z: cz + (rand() * 10 - 5), y: 0.24 + h, s: 2.4 + rand() * 2.4 });
      } else {
        for (const [ox, oz] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) {
          if (rand() < 0.18) continue;
          const w = 16 + rand() * 9;
          const h = 9 + rand() * 30;
          towerSpots.push({ x: cx + ox, z: cz + oz, w, d: w, h });
          addCollider(cx + ox, cz + oz, w / 2, w / 2);
          if (h > 26) roofSpots.push({ x: cx + ox, z: cz + oz, y: 0.24 + h, s: 1.8 + rand() * 1.6 });
        }
      }
    }
  }
  const towers = new THREE.InstancedMesh(towerGeom, towerMat, towerSpots.length);
  towerSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0.24, spot.z);
    dummy.scale.set(spot.w, spot.h, spot.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    towers.setMatrixAt(i, dummy.matrix);
    towers.setColorAt(i, new THREE.Color(FACADE_TINTS[i % FACADE_TINTS.length]));
  });
  towers.castShadow = true;
  towers.receiveShadow = true;
  scene.add(towers);
  // Rooftop clutter: grey plant boxes on the taller roofs.
  const roofMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }),
    roofSpots.length,
  );
  roofSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, spot.y + 0.6, spot.z);
    dummy.scale.set(spot.s, 1.2, spot.s * 0.7);
    dummy.rotation.set(0, rand() * 1.5, 0);
    dummy.updateMatrix();
    roofMesh.setMatrixAt(i, dummy.matrix);
  });
  roofMesh.castShadow = true;
  scene.add(roofMesh);

  // --- Landmarks -----------------------------------------------------------------
  function landmark(place, w, d, h, colour, sign, fg = '#ffffff', bg = '#22303c') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: colour }));
    mesh.position.set(place.x, h / 2 + 0.24, place.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    addCollider(place.x, place.z, w / 2, d / 2);
    if (sign) {
      const tex = signTexture(sign, bg, fg);
      for (const sideSign of [-1, 1]) {
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.min(w * 0.92, 34), 4.6),
          new THREE.MeshBasicMaterial({ map: tex }),
        );
        board.position.set(place.x, h - 1.2, place.z + sideSign * (d / 2 + 0.06));
        board.rotation.y = sideSign > 0 ? 0 : Math.PI;
        scene.add(board);
      }
    }
    return mesh;
  }
  landmark(PLACES.garage, 34, 24, 8, 0xd96f32, "LUPE'S GARAGE", '#ffd23e', '#33231a');
  landmark(PLACES.casino, 44, 30, 16, 0x5b2a86, 'CASINO AZUL', '#7df9ff', '#1c0f30');
  landmark(PLACES.bank, 36, 26, 13, 0xd8d3c3, 'BANCO SOLARA', '#22303c', '#e8e2d0');
  landmark(PLACES.hospital, 40, 28, 18, 0xf2f2f2, 'ST. PALMERA', '#d43a2f', '#f2f2f2');
  landmark(PLACES.precinct, 36, 26, 11, 0x5a6672, 'SBPD PRECINCT', '#ffffff', '#243447');
  landmark(PLACES.marina, 30, 20, 7, 0x2a7f9e, 'MARINA DEL SOL', '#ffffff', '#14586e');
  landmark(PLACES.start, 38, 18, 7, 0xf2c14e, 'PALM COURT MOTEL', '#8a3324', '#fdf3d8');
  // The airstrip: a runway strip south of town and its hangar.
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(300, 20), plainAsphalt);
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(20, 0.03, 252);
  runway.receiveShadow = true;
  scene.add(runway);
  landmark({ x: -140, z: 238 }, 30, 22, 9, 0x8b93a0, 'SOLARA AIR', '#ffffff', '#3c4654');

  // --- Palms, lamps, umbrellas -----------------------------------------------------
  const palmMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const palmSpots = [];
  for (const a of AXES) {
    for (let t = -CITY_EDGE + 18; t < CITY_EDGE; t += 34) {
      if (Math.abs(t % PITCH) < 12) continue;
      palmSpots.push({ x: a + (rand() < 0.5 ? -9.4 : 9.4), z: t + rand() * 6 - 3, s: 0.85 + rand() * 0.4, r: rand() * 6.28 });
      if (rand() < 0.6) palmSpots.push({ x: t + rand() * 6 - 3, z: a + (rand() < 0.5 ? -9.4 : 9.4), s: 0.85 + rand() * 0.4, r: rand() * 6.28 });
    }
  }
  for (let z = -250; z < 260; z += 22) {
    palmSpots.push({ x: SHORE_X - 14 + rand() * 8, z, s: 0.9 + rand() * 0.5, r: rand() * 6.28 });
  }
  const palms = new THREE.InstancedMesh(palmGeometry(), palmMat, palmSpots.length);
  palmSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0, spot.z);
    dummy.scale.setScalar(spot.s);
    dummy.rotation.set(0, spot.r, 0);
    dummy.updateMatrix();
    palms.setMatrixAt(i, dummy.matrix);
  });
  palms.castShadow = true;
  scene.add(palms);

  const lampSpots = [];
  for (const a of AXES) {
    for (let t = -CITY_EDGE + 30; t < CITY_EDGE; t += 76) {
      lampSpots.push({ x: a - 8.2, z: t, r: Math.PI / 2 });
      lampSpots.push({ x: t, z: a + 8.2, r: Math.PI });
    }
  }
  const lamps = new THREE.InstancedMesh(lampGeometry(), palmMat, lampSpots.length);
  lampSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0, spot.z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, spot.r, 0);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
  });
  scene.add(lamps);

  const umbrellaSpots = [];
  for (let z = -230; z < 245; z += 34) {
    if (rand() < 0.25) continue;
    umbrellaSpots.push({ x: 274 + rand() * 10, z: z + rand() * 10, r: rand() * 6.28 });
  }
  const umbrellas = new THREE.InstancedMesh(umbrellaGeometry(), palmMat, umbrellaSpots.length);
  umbrellaSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0.02, spot.z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, spot.r, 0);
    dummy.updateMatrix();
    umbrellas.setMatrixAt(i, dummy.matrix);
  });
  umbrellas.castShadow = true;
  scene.add(umbrellas);

  // --- The pier and its boats --------------------------------------------------------
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(48, 0.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6b48 }),
  );
  pier.position.set(SHORE_X + 14, 0.42, PLACES.marina.z);
  pier.castShadow = true;
  scene.add(pier);
  const boats = [];
  const hullColours = [0xf2f2f2, 0xd64541, 0x2a7f9e, 0xf2c14e, 0xe6e6fa, 0x2a9d8f];
  for (let i = 0; i < 6; i += 1) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 6.4), new THREE.MeshPhongMaterial({ color: hullColours[i], shininess: 60 }));
    hull.position.y = 0.45;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 2.2), new THREE.MeshLambertMaterial({ color: 0xf5f0e8 }));
    cabin.position.set(0, 1.25, -0.4);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.4, 6), new THREE.MeshLambertMaterial({ color: 0x8a817c }));
    mast.position.set(0, 3.4, 0.9);
    boat.add(mast);
    boat.position.set(SHORE_X + 22 + (i % 2) * 9, 0.1, PLACES.marina.z - 26 + i * 11);
    boat.rotation.y = (i % 2 ? -1 : 1) * 0.12;
    scene.add(boat);
    boats.push(boat);
  }

  // --- Clouds --------------------------------------------------------------------------
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, fog: false });
  const clouds = [];
  for (let i = 0; i < 9; i += 1) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(30 + rand() * 40, 10, 6), cloudMat);
    cloud.scale.y = 0.22;
    cloud.position.set(rand() * 1200 - 600, 150 + rand() * 60, rand() * 1200 - 600);
    scene.add(cloud);
    clouds.push(cloud);
  }

  let elapsed = 0;
  return {
    colliders,
    sun,
    /** Drift the sea, boats and clouds; keep the shadow camera centred on the action. */
    update(dt, focus) {
      elapsed += dt;
      sea.position.y = 0.12 + Math.sin(elapsed * 0.7) * 0.08;
      boats.forEach((boat, i) => {
        boat.position.y = 0.1 + Math.sin(elapsed * 0.9 + i * 1.7) * 0.09;
        boat.rotation.z = Math.sin(elapsed * 0.6 + i) * 0.03;
      });
      for (const cloud of clouds) {
        cloud.position.x += dt * 2.2;
        if (cloud.position.x > 700) cloud.position.x = -700;
      }
      if (focus) {
        sun.position.set(focus.x - 420, 300, focus.z - 260);
        sun.target.position.set(focus.x, 0, focus.z);
      }
    },
  };
}

/** Push a circle at (x, z) out of every collider it intersects; returns the freed point. */
export function pushOutOfColliders(colliders, x, z, radius) {
  for (const c of colliders) {
    const nearX = Math.max(c.minX, Math.min(x, c.maxX));
    const nearZ = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nearX;
    const dz = z - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nearX + (dx / d) * radius;
      z = nearZ + (dz / d) * radius;
    } else {
      // The centre is inside the box: leave through whichever face is nearest.
      const toLeft = x - c.minX;
      const toRight = c.maxX - x;
      const toTop = z - c.minZ;
      const toBottom = c.maxZ - z;
      const nearest = Math.min(toLeft, toRight, toTop, toBottom);
      if (nearest === toLeft) x = c.minX - radius;
      else if (nearest === toRight) x = c.maxX + radius;
      else if (nearest === toTop) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return { x, z };
}

/** True when a circle at (x, z) overlaps any collider. */
export function hitsCollider(colliders, x, z, radius) {
  for (const c of colliders) {
    const nearX = Math.max(c.minX, Math.min(x, c.maxX));
    const nearZ = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nearX;
    const dz = z - nearZ;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}
