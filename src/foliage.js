import * as THREE from 'three';

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
  { z: [-3.0, -1.7], count: 46, pick: ['bushFlower', 'bushBerry', 'bushFern', 'bushBlue', 'fernBig', 'seedTall', 'grassTall'] },
  { z: [-1.6, -0.6], count: 52, pick: ['tuft', 'seedShort', 'grassLeafy', 'fern', 'fernSmall', 'leaf', 'clover', 'mossA', 'mossB'] },
  { z: [-0.55, -0.42], count: 18, pick: ['tuftLow', 'clover', 'mossC', 'fernSmall'] },
  { z: [1.25, 1.75], count: 30, pick: ['grassTall', 'fernBig', 'leafBig', 'tuft', 'fern', 'seedShort'] },
];

export const foliagePieces = Object.values(sheets).map(sheet => sheet.piece);

export function addFoliage(model, textures) {
  const terrain = model.getObjectByName('Terrain_Export');
  if (!terrain) return () => {};
  model.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const raycaster = new THREE.Raycaster();
  const random = seeded(17);
  const time = { value: 0 };
  const sprites = cutSheets(textures);
  const placed = Object.fromEntries(Object.keys(plants).map(name => [name, []]));

  function cast(from, direction) {
    raycaster.set(from.clone().applyMatrix4(model.matrixWorld), direction.clone().transformDirection(model.matrixWorld));
    const hit = raycaster.intersectObject(terrain, false)[0];
    return hit && hit.point.applyMatrix4(toLocal);
  }
  const groundAt = (x, z) => cast(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0))?.y ?? null;

  function plant(name, x, z, sizeScale = 1) {
    const y = groundAt(x, z);
    if (y === null) return;
    const [min, max] = plants[name][2];
    const height = THREE.MathUtils.lerp(min, max, random()) * sizeScale;
    placed[name].push({ x, y: y - 0.05 * height, z, height, turn: (random() - 0.5) * 0.5, flip: random() < 0.5 });
  }

  for (const band of bands) {
    for (let i = 0; i < band.count; i++) {
      const x = THREE.MathUtils.lerp(-11.8, 11.8, random());
      const z = THREE.MathUtils.lerp(band.z[0], band.z[1], random());
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
  for (let i = 0; i < 16; i++) {
    const x = THREE.MathUtils.lerp(-11.5, 11.5, (i + random() * 0.8) / 16);
    const top = groundAt(x, 1.75);
    if (top === null) continue;
    const face = cast(new THREE.Vector3(x, top - 0.12, 6), new THREE.Vector3(0, 0, -1));
    if (!face) continue;
    const name = ['hangA', 'hangB', 'hangC'][Math.floor(random() * 3)];
    const [min, max] = plants[name][2];
    placed[name].push({ x, y: top + 0.04, z: face.z + 0.03, height: THREE.MathUtils.lerp(min, max, random()), turn: 0, flip: random() < 0.5 });
  }

  const materials = {};
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [name, cards] of Object.entries(placed)) {
    if (!cards.length) continue;
    const [sheetName, cell] = plants[name];
    const sprite = sprites[sheetName][cell];
    materials[sheetName] ??= windMaterial(textures[sheets[sheetName].piece], sheets[sheetName].tint, time);
    const mesh = new THREE.InstancedMesh(cardGeometry(sprite, hanging.has(name)), materials[sheetName], cards.length);
    cards.forEach(({ x, y, z, height, turn, flip }, index) => {
      rotation.setFromAxisAngle(up, turn);
      matrix.compose(new THREE.Vector3(x, y, z), rotation, new THREE.Vector3(flip ? -height : height, height, height));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.receiveShadow = true;
    mesh.renderOrder = terrain.renderOrder;
    mesh.frustumCulled = false; // instances span the whole path
    model.add(mesh);
  }

  return animationTime => { time.value = animationTime ?? 0; };
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

function windMaterial(map, tint, time) {
  const material = new THREE.MeshStandardMaterial({
    map, color: tint, alphaTest: 0.4, transparent: true, side: THREE.DoubleSide, roughness: 1,
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
