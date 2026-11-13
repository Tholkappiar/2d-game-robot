import * as THREE from 'three';

// Painted plant cards scattered in 3D on the Blender terrain. Everything here is in
// the model's own units (meters, glTF axes): x right, y up, z toward the camera.
// Blender's "behind the path" (+Y) is glTF -z.

const kinds = {
  grass: { piece: 'grass', width: [1.1, 2.0], tint: '#d9dcb4' },
  grass2: { piece: 'grass2', width: [1.0, 1.8], tint: '#dfe0bc' },
  ferns: { piece: 'ferns', width: [0.8, 1.4], tint: '#c9d2b0' },
  ferns2: { piece: 'spillway-ferns', width: [0.9, 1.6], tint: '#cfd6b4' },
};

// Bands across the path depth: [zMin, zMax] in glTF z, how many, which plants, size factor.
const bands = [
  { z: [-3.0, -1.6], count: 70, kinds: ['grass', 'grass2', 'ferns', 'ferns2'], size: 1.25 },
  { z: [-1.5, -0.7], count: 38, kinds: ['grass', 'grass2', 'ferns2'], size: 0.8 },
  { z: [1.3, 1.75], count: 26, kinds: ['grass', 'grass2', 'ferns', 'ferns2'], size: 0.9 },
];

export const foliagePieces = [...new Set(Object.values(kinds).map(kind => kind.piece))];

export function addFoliage(model, textures) {
  const terrain = model.getObjectByName('Terrain_Export');
  if (!terrain) return () => {};
  model.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const random = seeded(17);
  const time = { value: 0 };
  const materials = {};

  function material(name) {
    if (materials[name]) return materials[name];
    const { piece, tint } = kinds[name];
    const map = textures[piece];
    const mat = new THREE.MeshStandardMaterial({
      map, color: tint, alphaTest: 0.45, transparent: true, side: THREE.DoubleSide, roughness: 1,
    });
    mat.onBeforeCompile = shader => {
      shader.uniforms.windTime = time;
      shader.vertexShader = 'uniform float windTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Sway the top of the card; the base stays planted.
        float phase = modelMatrix[3].x * 3.1 + modelMatrix[3].z * 1.7;
        float bend = uv.y * uv.y;
        transformed.x += bend * (0.06 * sin(windTime * 1.4 + phase) + 0.025 * sin(windTime * 3.3 + phase * 2.0));`,
      );
    };
    mat.customProgramCacheKey = () => 'foliage-wind';
    return (materials[name] = mat);
  }

  function groundAt(x, z) {
    const origin = new THREE.Vector3(x, 50, z).applyMatrix4(model.matrixWorld);
    raycaster.set(origin, down.clone().transformDirection(model.matrixWorld));
    const hit = raycaster.intersectObject(terrain, false)[0];
    return hit ? hit.point.applyMatrix4(toLocal).y : null;
  }

  function plant(name, x, z, scale) {
    const y = groundAt(x, z);
    if (y === null) return;
    const { width: [min, max] } = kinds[name];
    const map = textures[kinds[name].piece];
    const width = THREE.MathUtils.lerp(min, max, random()) * scale;
    const height = width * map.image.height / map.image.width;
    const geometry = new THREE.PlaneGeometry(width, height);
    geometry.translate(0, height / 2, 0);
    const card = new THREE.Mesh(geometry, material(name));
    card.position.set(x, y - 0.06 * height, z);
    card.rotation.y = (random() - 0.5) * 0.5;
    if (random() < 0.5) card.scale.x = -1;
    card.receiveShadow = true;
    card.renderOrder = terrain.renderOrder;
    model.add(card);
  }

  for (const band of bands) {
    for (let i = 0; i < band.count; i++) {
      const x = THREE.MathUtils.lerp(-11.8, 11.8, random());
      const z = THREE.MathUtils.lerp(band.z[0], band.z[1], random());
      plant(band.kinds[Math.floor(random() * band.kinds.length)], x, z, band.size);
    }
  }

  // Tuck a couple of plants around each rock's base so it sits in the ground.
  model.traverse(node => {
    if (!node.isMesh || node === terrain || !node.name.startsWith('Rock_')) return;
    const box = new THREE.Box3().setFromObject(node).applyMatrix4(toLocal);
    const size = box.getSize(new THREE.Vector3());
    if (size.x < 0.5) return;
    for (const side of [-1, 1]) {
      const x = (box.min.x + box.max.x) / 2 + side * size.x * (0.35 + random() * 0.2);
      const z = box.max.z - size.z * 0.1;
      if (Math.abs(z) < 0.45) continue; // keep the walking line clear
      plant(random() < 0.5 ? 'ferns2' : 'grass2', x, z, 0.55 + size.x * 0.2);
    }
  });

  return animationTime => { time.value = animationTime ?? 0; };
}

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
