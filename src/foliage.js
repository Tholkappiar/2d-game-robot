import * as THREE from 'three';
import { dressWithKit } from './megakit.js';

// Painted plant cards scattered in 3D on the Blender terrain, drawn as instanced
// meshes (one draw call per plant sprite). Everything here is in the model's own
// units (meters, glTF axes): x right, y up, z toward the camera. Blender's
// "behind the path" (+Y) is glTF -z; the front cliff lip is around z = +1.8.

// Sprite sheets: plants sit in a grid, one plant per cell (see docs/art-prompts.md).
const sheets = {
  grass: { piece: 'plants-grass', columns: 3, rows: 2, tint: '#e4e6cc' },
  ferns: { piece: 'plants-ferns', columns: 3, rows: 2, tint: '#dfe4cc' },
  bushes: { piece: 'plants-bushes', columns: 2, rows: 2, tint: '#d8decb' },
  moss: { piece: 'plants-moss-hanging', columns: 3, rows: 2, tint: '#dfe4c8' },
};

// Named plants: [sheet, cell index (row-major), height range in meters].
const plants = {
  tuft: ['grass', 0, [0.35, 0.5]],
  seedTall: ['grass', 1, [0.6, 0.9]],
  seedShort: ['grass', 2, [0.3, 0.45]],
  grassTall: ['grass', 3, [0.55, 0.8]],
  tuftLow: ['grass', 4, [0.25, 0.35]],
  grassLeafy: ['grass', 5, [0.5, 0.7]],
  fernBig: ['ferns', 0, [0.55, 0.8]],
  fern: ['ferns', 1, [0.4, 0.55]],
  fernSmall: ['ferns', 2, [0.25, 0.35]],
  leafBig: ['ferns', 3, [0.45, 0.6]],
  leaf: ['ferns', 4, [0.35, 0.45]],
  clover: ['ferns', 5, [0.15, 0.22]],
  bushFlower: ['bushes', 0, [0.7, 1.0]],
  bushBerry: ['bushes', 1, [0.8, 1.1]],
  bushFern: ['bushes', 2, [0.7, 0.95]],
  bushBlue: ['bushes', 3, [0.7, 0.95]],
  hangA: ['moss', 0, [0.6, 0.9]],
  hangB: ['moss', 1, [0.7, 1.0]],
  hangC: ['moss', 2, [0.6, 0.85]],
  mossA: ['moss', 3, [0.12, 0.18]],
  mossB: ['moss', 4, [0.12, 0.18]],
  mossC: ['moss', 5, [0.1, 0.15]],
};
const hanging = new Set(['hangA', 'hangB', 'hangC']);

// Bands across the path depth: glTF z range, count, and the plants to pick from.
const bands = [
  { z: [-3.0, -1.7], count: 24, pick: ['bushFlower', 'bushBerry', 'bushFern', 'bushBlue', 'fernBig', 'seedTall', 'grassTall'], clearWreck: true },
  { z: [-1.6, -0.6], count: 30, pick: ['tuft', 'seedShort', 'grassLeafy', 'fern', 'fernSmall', 'leaf', 'clover', 'mossA', 'mossB'] },
  { z: [-0.55, -0.42], count: 12, pick: ['tuftLow', 'clover', 'mossC', 'fernSmall'] },
  { z: [1.25, 1.75], count: 20, pick: ['grassTall', 'fernBig', 'leafBig', 'tuft', 'fern', 'seedShort'] },
];

// Crater floor plants and the dark band of plants right in front of the camera.
const craterPick = ['tuft', 'grassLeafy', 'seedShort', 'fern', 'fernSmall', 'leaf', 'clover', 'mossA', 'mossB'];
const frontPick = ['fernBig', 'grassTall', 'leafBig', 'bushFern', 'seedTall', 'bushFlower', 'fern'];

// The crater bowl's ellipse in Blender (x, y) — matches the Blender scene.
const crater = { x: 0, y: 22, rx: 44, ry: 18 };
// The wreck's spot in glTF (x, z); plants keep a window open toward it.
const wreck = { x: 0, z: -20 }; // the Tripo wreck, near the crater centre

// Painted crater props (transparent PNGs) stood up as hazy cards on the crater floor.
const craterProps = [
  { piece: 'crashwood/props/scorched-cliff-slab', x: -17, z: -20, height: 6.5 },
  { piece: 'crashwood/props/scorched-cliff-slab', x: 21, z: -22, height: 7.5, flip: true },
  { piece: 'crashwood/props/rock-rubble', x: -5.5, z: -12.5, height: 2.4 },
  { piece: 'crashwood/props/rock-rubble', x: 8.5, z: -13.5, height: 2.0, flip: true },
  { piece: 'crashwood/props/burnt-log', x: -2.5, z: -8.5, height: 1.6 },
  { piece: 'crashwood/props/burnt-log', x: 11, z: -16, height: 1.8, flip: true },
  { piece: 'crashwood/props/charred-dead-tree', x: -11, z: -15, height: 8 },
  { piece: 'crashwood/props/charred-dead-tree', x: 15, z: -10, height: 6.5, flip: true },
];

export const foliagePieces = [
  ...Object.values(sheets).map(sheet => sheet.piece), ...new Set(craterProps.map(prop => prop.piece)),
];

export function addFoliage(model, textures, kitComing = true) {
  const terrain = model.getObjectByName('Terrain_Export');
  if (!terrain) return { front: null, animate: () => {}, dress: () => {} };
  const craterWall = model.getObjectByName('CraterWall_Export');
  const craterFloor = model.getObjectByName('CraterFloor_Export');
  const outerLand = model.getObjectByName('OuterLand_Export');
  model.updateMatrixWorld(true);
  // Half the path length in meters, read from the terrain so a longer Blender path just works.
  // The mesh runs past the walkable part (to hide its edges); dress only what the camera can reach.
  terrain.geometry.computeBoundingBox();
  const half = Math.min(terrain.geometry.boundingBox.max.x, 34);
  const stretch = half / 12; // plant counts were tuned on a 24 m path
  const toLocal = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const raycaster = new THREE.Raycaster();
  const random = seeded(17);
  const time = { value: 0 };
  const sprites = cutSheets(textures);
  // Instanced groups keyed by plant name and look ('ground' = lit, 'front' = dark foreground).
  const placed = {};
  const push = (name, look, card) => (placed[`${name}|${look}`] ??= []).push(card);

  function cast(from, direction, target = terrain) {
    raycaster.set(from.clone().applyMatrix4(model.matrixWorld), direction.clone().transformDirection(model.matrixWorld));
    const hit = raycaster.intersectObject(target, false)[0];
    return hit && hit.point.applyMatrix4(toLocal);
  }
  // Ground height lookups go through a triangle grid: thousands of plants each need one, and a
  // full raycast against a 70k-triangle mesh per plant froze the page.
  const samplers = new Map();
  const groundAt = (x, z, target = terrain) => {
    if (!samplers.has(target)) samplers.set(target, heightSampler(target, toLocal));
    return samplers.get(target)(x, z);
  };

  function plant(name, x, z, sizeScale = 1, target = terrain) {
    const y = groundAt(x, z, target);
    if (y === null) return;
    const [min, max] = plants[name][2];
    const height = THREE.MathUtils.lerp(min, max, random()) * sizeScale;
    push(name, 'ground', { x, y: y - 0.05 * height, z, height, turn: (random() - 0.5) * 0.5, flip: random() < 0.5 });
  }

  // Dark, out-of-the-light plants close to the camera, in a few clumps with open gaps
  // between them. Bases sit just under the walking line so only their tops show along
  // the bottom edge, and they pass in front of the player.
  const frontGroup = new THREE.Group();
  const clumps = Math.round(8 * stretch);
  for (let clump = 0; clump < clumps; clump++) {
    const centre = THREE.MathUtils.lerp(-half + 1, half - 1, (clump + 0.2 + random() * 0.6) / clumps);
    const base = groundAt(centre, 0);
    if (base === null) continue;
    for (let i = 0, count = 2 + Math.floor(random() * 3); i < count; i++) {
      const name = frontPick[Math.floor(random() * frontPick.length)];
      push(name, 'front', {
        x: centre + (random() - 0.5) * 2.2, y: base - 1.3 - random() * 0.3, z: THREE.MathUtils.lerp(5, 7, random()) /* halfway to the camera (cameraDistance 3 / scale 0.25 = 12) */,
        height: THREE.MathUtils.lerp(1.2, 2.3, random()), turn: (random() - 0.5) * 0.4, flip: random() < 0.5,
      });
    }
  }

  if (craterFloor) {
    for (let i = 0; i < 60; i++) {
      const x = THREE.MathUtils.lerp(-34, 34, random());
      const z = -THREE.MathUtils.lerp(6, 32, random());
      if (Math.hypot((x - wreck.x) / 1.6, z - wreck.z) < 6) continue; // keep the wreck readable
      plant(craterPick[Math.floor(random() * craterPick.length)], x, z, 1.4, craterFloor);
    }
  }
  if (craterFloor) addCraterProps(model, craterFloor, textures, groundAt);

  for (const band of bands) {
    // With 3D MegaKit plants in the scene, the painted cards only fill the gaps.
    for (let i = 0; i < band.count * stretch * (kitComing ? 0.45 : 1); i++) {
      const x = THREE.MathUtils.lerp(-half + 0.2, half - 0.2, random());
      const z = THREE.MathUtils.lerp(band.z[0], band.z[1], random());
      if (band.clearWreck && Math.abs(x - wreck.x) < 5) continue; // no bushes in the sightline
      plant(band.pick[Math.floor(random() * band.pick.length)], x, z);
    }
  }

  // Tuck plants around each rock's base so it sits in the ground.
  model.traverse(node => {
    if (!node.isMesh || !node.name.startsWith('Rock_')) return;
    const box = new THREE.Box3().setFromObject(node).applyMatrix4(toLocal);
    const size = box.getSize(new THREE.Vector3());
    if (size.x < 0.4) return;
    for (const side of [-1, 1]) {
      const x = (box.min.x + box.max.x) / 2 + side * size.x * (0.35 + random() * 0.2);
      const z = box.max.z - size.z * 0.15;
      if (Math.abs(z) < 0.45) continue; // keep the walking line clear
      plant(['fern', 'grassLeafy', 'leaf', 'tuft'][Math.floor(random() * 4)], x, z, 0.8 + size.x * 0.15);
    }
  });

  // Hanging moss draped over the front cliff lip: find the lip, hang from it.
  const strands = Math.round(16 * stretch);
  for (let i = 0; i < strands; i++) {
    const x = THREE.MathUtils.lerp(-half + 0.5, half - 0.5, (i + random() * 0.8) / strands);
    const top = groundAt(x, 1.75);
    if (top === null) continue;
    const face = cast(new THREE.Vector3(x, top - 0.12, 6), new THREE.Vector3(0, 0, -1));
    if (!face) continue;
    const name = ['hangA', 'hangB', 'hangC'][Math.floor(random() * 3)];
    const [min, max] = plants[name][2];
    push(name, 'ground', { x, y: top + 0.04, z: face.z + 0.03, height: THREE.MathUtils.lerp(min, max, random()), turn: 0, flip: random() < 0.5 });
  }


  const materials = {};
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [key, cards] of Object.entries(placed)) {
    const [name, look] = key.split('|');
    const [sheetName, cell] = plants[name];
    const sprite = sprites[sheetName][cell];
    const front = look === 'front';
    materials[key.replace(name, sheetName)] ??= windMaterial(
      textures[sheets[sheetName].piece], front ? '#3a4a40' : sheets[sheetName].tint, time, front,
    );
    const mesh = new THREE.InstancedMesh(
      cardGeometry(sprite, hanging.has(name)), materials[key.replace(name, sheetName)], cards.length,
    );
    cards.forEach(({ x, y, z, height, turn, flip }, index) => {
      rotation.setFromAxisAngle(up, turn);
      matrix.compose(new THREE.Vector3(x, y, z), rotation, new THREE.Vector3(flip ? -height : height, height, height));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.receiveShadow = !front;
    // Foreground plants draw after the player sprite (order 12) so they pass in front of it.
    mesh.renderOrder = front ? 13 : terrain.renderOrder;
    mesh.frustumCulled = false; // instances span the whole path
    (front ? frontGroup : model).add(mesh);
  }

  return {
    front: frontGroup,
    animate: animationTime => { time.value = animationTime ?? 0; },
    // MegaKit arrives after the first frame; its own seed keeps placement the same every load.
    dress: kit => dressWithKit(model, kit, { terrain, craterWall, craterFloor, outerLand, groundAt, toLocal, random: seeded(29), half, wreck, crater, time }),
  };
}


// Find each plant's tight bounds inside its grid cell from the alpha channel.
function cutSheets(textures) {
  const result = {};
  for (const [name, { piece, columns, rows }] of Object.entries(sheets)) {
    const image = textures[piece].image;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const cellWidth = image.width / columns;
    const cellHeight = image.height / rows;
    result[name] = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        let left = Infinity, right = -1, top = Infinity, bottom = -1;
        for (let y = Math.floor(row * cellHeight); y < Math.floor((row + 1) * cellHeight); y++) {
          for (let x = Math.floor(column * cellWidth); x < Math.floor((column + 1) * cellWidth); x++) {
            if (data[(y * image.width + x) * 4 + 3] > 24) {
              if (x < left) left = x;
              if (x > right) right = x;
              if (y < top) top = y;
              if (y > bottom) bottom = y;
            }
          }
        }
        result[name].push({
          u0: left / image.width, u1: (right + 1) / image.width,
          v0: 1 - (bottom + 1) / image.height, v1: 1 - top / image.height,
          aspect: (right + 1 - left) / (bottom + 1 - top),
        });
      }
    }
  }
  return result;
}

// Unit-height card; base at y = 0 (or top at y = 0 for hanging plants).
function cardGeometry({ u0, u1, v0, v1, aspect }, hangs) {
  const geometry = new THREE.PlaneGeometry(aspect, 1);
  geometry.translate(0, hangs ? -0.5 : 0.5, 0);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, THREE.MathUtils.lerp(u0, u1, uv.getX(i)), THREE.MathUtils.lerp(v0, v1, uv.getY(i)));
  }
  return geometry;
}

function windMaterial(map, tint, time, foreground = false) {
  const material = new THREE.MeshStandardMaterial({
    map, color: tint, alphaTest: 0.4, transparent: true, side: THREE.DoubleSide, roughness: 1, fog: !foreground,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.windTime = time;
    shader.vertexShader = 'uniform float windTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      // Sway away from the anchor (base, or top for hanging moss).
      float phase = instanceMatrix[3].x * 2.3 + instanceMatrix[3].z * 1.7;
      float bend = position.y * position.y;
      transformed.x += bend * (0.07 * sin(windTime * 1.4 + phase) + 0.03 * sin(windTime * 3.3 + phase * 2.0));`,
    );
  };
  material.customProgramCacheKey = () => 'foliage-wind';
  return material;
}

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function addCraterProps(model, craterFloor, textures, groundAt) {
  for (const { piece, x, z, height, flip } of craterProps) {
    const map = textures[piece];
    const y = groundAt(x, z, craterFloor);
    if (!map || y === null) continue;
    const width = height * map.image.width / map.image.height;
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.translate(0, height / 2, 0);
    const card = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      map, alphaTest: 0.35, transparent: true, side: THREE.DoubleSide, roughness: 1,
    }));
    card.position.set(x, y - 0.12 * height, z);
    if (flip) card.scale.x = -1;
    card.renderOrder = craterFloor.renderOrder;
    card.receiveShadow = true;
    model.add(card);
  }
}

// Top surface height of a mesh at (x, z), in the model's local space. Triangles are bucketed
// into a 1 m grid once, so each lookup only tests the handful of triangles under that point.
function heightSampler(mesh, toLocal) {
  mesh.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index;
  const count = position.count;
  const xs = new Float32Array(count), ys = new Float32Array(count), zs = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(toModel);
    xs[i] = v.x; ys[i] = v.y; zs[i] = v.z;
  }
  const cell = 1;
  const cells = new Map();
  const triangles = index ? index.count / 3 : count / 3;
  const corner = (t, k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
  for (let t = 0; t < triangles; t++) {
    const a = corner(t, 0), b = corner(t, 1), c = corner(t, 2);
    const x0 = Math.floor(Math.min(xs[a], xs[b], xs[c]) / cell), x1 = Math.floor(Math.max(xs[a], xs[b], xs[c]) / cell);
    const z0 = Math.floor(Math.min(zs[a], zs[b], zs[c]) / cell), z1 = Math.floor(Math.max(zs[a], zs[b], zs[c]) / cell);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const key = gx * 100003 + gz;
        let list = cells.get(key);
        if (!list) cells.set(key, list = []);
        list.push(a, b, c);
      }
    }
  }
  return (x, z) => {
    const list = cells.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell));
    if (!list) return null;
    let best = null;
    for (let i = 0; i < list.length; i += 3) {
      const a = list[i], b = list[i + 1], c = list[i + 2];
      // Barycentric test in the XZ plane, then interpolate the height.
      const d = (zs[b] - zs[c]) * (xs[a] - xs[c]) + (xs[c] - xs[b]) * (zs[a] - zs[c]);
      if (Math.abs(d) < 1e-9) continue;
      const w1 = ((zs[b] - zs[c]) * (x - xs[c]) + (xs[c] - xs[b]) * (z - zs[c])) / d;
      const w2 = ((zs[c] - zs[a]) * (x - xs[c]) + (xs[a] - xs[c]) * (z - zs[c])) / d;
      const w3 = 1 - w1 - w2;
      if (w1 < -1e-4 || w2 < -1e-4 || w3 < -1e-4) continue;
      const y = w1 * ys[a] + w2 * ys[b] + w3 * ys[c];
      if (best === null || y > best) best = y;
    }
    return best;
  };
}
