import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Quaternius Stylized Nature MegaKit (CC0) — see public/assets/megakit/LICENSE.txt.
// Models are in meters, like our Blender scene, so they drop straight into the model group.

// (Twisted trees left out: heavy geometry and red leaves that don't fit the palette.)
const trees = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'];
const deadTrees = ['DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5'];
const rocks = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];
const pebbles = ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Round_4', 'Pebble_Round_5',
  'Pebble_Square_1', 'Pebble_Square_2', 'Pebble_Square_3', 'Pebble_Square_4', 'Pebble_Square_5', 'Pebble_Square_6'];
// (The kit's Plant_* models are purple alien plants — left out to keep the palette.)
const shrubs = ['Bush_Common', 'Bush_Common_Flowers', 'Fern_1'];
const grasses = ['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall',
  'Clover_1', 'Clover_2', 'Flower_3_Group', 'Flower_4_Group'];

export const kitModels = [...trees, ...deadTrees, ...rocks, ...pebbles, ...shrubs, ...grasses, 'Mushroom_Common'];

export async function loadKit(baseUrl) {
  const loader = new GLTFLoader();
  const entries = await Promise.all(kitModels.map(async name => {
    const gltf = await loader.loadAsync(`${baseUrl}assets/megakit/${name}.gltf`)
      .catch(() => { throw new Error(`Could not load MegaKit model "${name}".`); });
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    return [name, { scene, box, size: box.getSize(new THREE.Vector3()) }];
  }));
  return Object.fromEntries(entries);
}

// Sway leaves and grass with the wind; trunks and rocks stay still. `recolor` turns the
// kit's red "twisted tree" leaves into forest greens by keeping only their brightness.
function windify(material, time, amount, recolor = false) {
  if (material.userData.wind) return;
  material.userData.wind = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.windTime = time;
    if (recolor) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        float leafLight = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
        diffuseColor.rgb = mix(vec3(0.10, 0.22, 0.14), vec3(0.45, 0.62, 0.30), smoothstep(0.15, 0.75, leafLight));
      `);
    }
    shader.vertexShader = 'uniform float windTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 origin = (modelMatrix * instanceMatrix[3]).xyz;
      #else
        vec3 origin = modelMatrix[3].xyz;
      #endif
      float phase = origin.x * 1.7 + origin.z * 1.3;
      float bend = max(position.y, 0.0) * max(position.y, 0.0) * ${amount.toFixed(4)};
      transformed.x += bend * (sin(windTime * 1.3 + phase) + 0.4 * sin(windTime * 3.1 + phase * 2.0));
      transformed.z += bend * 0.35 * sin(windTime * 1.7 + phase);
    `);
  };
  material.customProgramCacheKey = () => `megakit-wind-${amount}-${recolor}`;
}

function prepare(kit, renderOrder, time) {
  for (const { scene } of Object.values(kit)) {
    scene.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.renderOrder = renderOrder;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        // Same pass as the rest of the 3D ground (see scene-builder addModel).
        material.transparent = true;
        material.depthWrite = true;
        const name = material.name ?? '';
        if (name.startsWith('Grass') || name.startsWith('Flower')) windify(material, time, 0.05);
        else if (name.startsWith('Leaves') || name.startsWith('Leaf')) windify(material, time, 0.0025, name.includes('Twisted'));
      }
    });
  }
}

// Collect placements per model, then build one InstancedMesh per sub-mesh.
function makeBatcher(kit, parent, renderOrder) {
  const lists = {};
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  return {
    add(name, position, scale, turn = 0, tilt = null) {
      quaternion.setFromEuler(new THREE.Euler(tilt?.x ?? 0, turn, tilt?.z ?? 0, 'YXZ'));
      (lists[name] ??= []).push(new THREE.Matrix4().compose(position, quaternion.clone(), new THREE.Vector3(scale, scale, scale)));
    },
    build() {
      for (const [name, placements] of Object.entries(lists)) {
        kit[name].scene.traverse(node => {
          if (!node.isMesh) return;
          const mesh = new THREE.InstancedMesh(node.geometry, node.material, placements.length);
          placements.forEach((placement, index) => mesh.setMatrixAt(index, matrix.multiplyMatrices(placement, node.matrixWorld)));
          mesh.castShadow = node.castShadow;
          mesh.receiveShadow = true;
          mesh.renderOrder = renderOrder;
          mesh.frustumCulled = false;
          parent.add(mesh);
        });
      }
    },
  };
}

export function dressWithKit(model, kit, { terrain, craterWall, craterFloor, groundAt, toLocal, random, half, wreck, crater, time }) {
  const order = terrain.renderOrder;
  prepare(kit, order, time);
  const batch = makeBatcher(kit, model, order);
  const pick = list => list[Math.floor(random() * list.length)];
  const nearWreck = (x, z, radius) => Math.hypot((x - wreck.x) / 1.6, z - wreck.z) < radius;
  const at = (x, z, target) => {
    const y = groundAt(x, z, target);
    return y === null ? null : new THREE.Vector3(x, y, z);
  };

  // 1. Swap every procedural Blender rock for a MegaKit rock of the same footprint.
  const blenderRocks = [];
  model.traverse(node => { if (node.isMesh && node.name.startsWith('Rock_')) blenderRocks.push(node); });
  for (const node of blenderRocks) {
    const box = new THREE.Box3().setFromObject(node).applyMatrix4(toLocal);
    const size = box.getSize(new THREE.Vector3());
    node.visible = false;
    const footprint = Math.max(size.x, size.z);
    const name = footprint < 0.6 ? pick(pebbles) : pick(rocks);
    // Big rocks never sit on the walking line, or the robot looks like it stands on them.
    if (footprint >= 0.6 && Math.abs(box.getCenter(new THREE.Vector3()).z) < 2.2) {
      const shift = (box.getCenter(new THREE.Vector3()).z < 0 ? -2.4 : 2.0) - box.getCenter(new THREE.Vector3()).z;
      box.translate(new THREE.Vector3(0, 0, shift));
      const y = groundAt(box.getCenter(new THREE.Vector3()).x, box.getCenter(new THREE.Vector3()).z, terrain);
      if (y !== null) box.translate(new THREE.Vector3(0, y - box.min.y, 0));
    }
    const template = kit[name];
    const scale = footprint / Math.max(template.size.x, template.size.z) * 1.1;
    const centre = box.getCenter(new THREE.Vector3());
    batch.add(name, new THREE.Vector3(centre.x, box.min.y - template.box.min.y * scale - 0.04 * size.y, centre.z), scale, random() * Math.PI * 2);
  }

  // 2. Living trees: groups at both ends of the path and along the crater rim, never in
  //    front of the wreck. Trees are cloned (few of them) so each keeps its own shadow.
  const addTree = (name, position, height, tint) => {
    const template = kit[name];
    const tree = template.scene.clone(true);
    const scale = height / template.size.y;
    tree.scale.setScalar(scale);
    tree.position.copy(position).y -= 0.15 * scale;
    tree.rotation.y = random() * Math.PI * 2;
    if (tint) tree.traverse(node => { if (node.isMesh) { node.material = node.material.clone(); node.material.color.set(tint); } });
    model.add(tree);
  };
  for (let x = -half + 2; x < half - 1; x += 5 + random() * 5) {
    if (Math.abs(x - wreck.x) < 13) continue; // keep the crater view open
    const position = at(x + random() * 2, -(3.4 + random() * 3.0), craterFloor ?? terrain);
    if (position) addTree(pick(trees), position, 6 + random() * 3);
  }
  if (craterWall) {
    // Low rim trees so the sky and the planet stay open above the crater.
    for (let i = 0; i < 22; i++) {
      const angle = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-10, 190, (i + random() * 0.8) / 30));
      if (Math.abs(THREE.MathUtils.radToDeg(angle) - 90) < 40) continue; // keep the saddle and Saturn clear
      const reach = 5 + random() * 7;
      const x = crater.x + (crater.rx + reach) * Math.cos(angle);
      const z = -(crater.y + (crater.ry + reach) * Math.sin(angle));
      const position = at(x, z, craterWall);
      if (position) addTree(pick(trees), position, 4.5 + random() * 2.5);
    }
  }
  // Burnt dead trees standing in the crater.
  if (craterFloor) {
    for (let i = 0; i < 7; i++) {
      const x = THREE.MathUtils.lerp(-26, 26, (i + random() * 0.7) / 7);
      const z = -(9 + random() * 14);
      if (nearWreck(x, z, 10)) continue; // keep the wreck silhouette clean
      const position = at(x, z, craterFloor);
      if (position) addTree(pick(deadTrees), position, 5 + random() * 3, '#6a5c52');
    }
  }

  // 3. Bushes, ferns and plants behind the walking line; grass, clover and flowers on both verges.
  const stretch = half / 12;
  for (let i = 0; i < 40 * stretch; i++) {
    const x = THREE.MathUtils.lerp(-half, half, random());
    const z = -THREE.MathUtils.lerp(1.4, 3.0, random());
    if (Math.abs(x - wreck.x) < 4 && z < -2.2) continue;
    const position = at(x, z, terrain);
    const name = pick(shrubs);
    if (position) batch.add(name, position, (0.8 + random() * 0.3) / kit[name].size.y, random() * Math.PI * 2);
  }
  for (let i = 0; i < 380 * stretch; i++) {
    const x = THREE.MathUtils.lerp(-half, half, random());
    const z = random() < 0.65 ? -THREE.MathUtils.lerp(0.5, 1.6, random()) : THREE.MathUtils.lerp(0.9, 1.6, random());
    const position = at(x, z, terrain);
    const name = pick(grasses);
    if (position) batch.add(name, position, (0.25 + random() * 0.3) / kit[name].size.y, random() * Math.PI * 2);
  }
  // Pebbles scattered on the verges and crater floor.
  for (let i = 0; i < 90 * stretch; i++) {
    const onFloor = craterFloor && random() < 0.4;
    const x = THREE.MathUtils.lerp(onFloor ? -30 : -half, onFloor ? 30 : half, random());
    const z = onFloor ? -THREE.MathUtils.lerp(6, 24, random()) : (random() < 0.5 ? -1 : 1) * THREE.MathUtils.lerp(0.45, 1.6, random());
    const position = at(x, z, onFloor ? craterFloor : terrain);
    const name = pick(pebbles);
    if (position) batch.add(name, position, (0.08 + random() * 0.18) / kit[name].size.x, random() * Math.PI * 2);
  }
  batch.build();
}
