import * as THREE from 'three';

// A meadow of real 3D grass blades and flowers on the Blender ground, drawn with GPU instancing.
// Each blade is a tiny bent strip; the vertex shader leans it with rolling wind gusts and pushes
// it aside where the robot walks. Everything is in the model's own units (meters, glTF axes).

// The path gets fewer, wider blades; the saved budget goes to the crater, where distant blades
// are cheap 2-triangle shapes (nobody can see their bend from that far).
const pathDensity = 120; // blades per square meter beside the path
const craterDensity = 420; // just behind the path; thins out with distance
const cameraReach = 12; // meters from the camera to the walking line
const chunk = 8; // meters of path per batch, so off-screen grass is skipped

// The green painted on the ground under the grass (see carpet()); far blades fade to it.
const carpetColors = { carpetDeep: '#3d6e2b', carpetLush: '#7fae3e', carpetSun: '#b9c95a' };

const palette = {
  deep: '#2b5a2c', // shaded blade roots
  lush: '#3f7d2c',
  tipCool: '#7fb84a',
  tipWarm: '#c3d45a',
  straw: '#e0cf86', // dry seed stalks
};
// Flower kinds grow in their own drifts: [petal colour, head size in meters].
const flowers = [
  ['#ffffff', 0.075], ['#ffd640', 0.06], ['#f29ac0', 0.07], ['#9d8cf0', 0.055], ['#ff7a4d', 0.06],
];

export function addGrass(model, { terrain, craterFloor, craterWall, half, wreck, time, player, obstacles = [] }) {
  // The ground under the grass turns into a living green carpet that ripples with the same wind.
  for (const [mesh, amount] of [[terrain, 0.7], [craterFloor, 0.9], [craterWall, 0.9]]) if (mesh) carpet(mesh.material, time, amount);
  // Measured now, not reused from earlier: the model has been moved into place since it loaded.
  model.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const uniforms = {
    windTime: time,
    grassPlayer: player,
    ...Object.fromEntries(Object.entries(carpetColors).map(([name, hex]) => [name, { value: new THREE.Color(hex) }])),
    ...Object.fromEntries(Object.entries(palette).map(([name, hex]) => [`g${name[0].toUpperCase()}${name.slice(1)}`, { value: new THREE.Color(hex) }])),
  };
  const bladeMaterial = grassMaterial(uniforms, false);
  const headMaterial = grassMaterial(uniforms, true);
  const nearBlade = stripGeometry(3);
  const farBlade = stripGeometry(2);
  const distantBlade = stripGeometry(1);
  const headQuad = new THREE.PlaneGeometry(1, 1);
  const petals = flowers.map(([hex]) => new THREE.Color(hex));
  const ground = surfaceSampler(terrain, toLocal);
  const floorSampler = craterFloor && surfaceSampler(craterFloor, toLocal);
  const wallSampler = craterWall && surfaceSampler(craterWall, toLocal);
  const wallHit = { y: 0, up: 0, green: 0 };
  // The crater's surface: its floor and the slopes and terraces of its wall, whichever is on top.
  const floor = (floorSampler || wallSampler) && ((x, z, out) => {
    const onFloor = floorSampler?.(x, z, out);
    if (!wallSampler?.(x, z, wallHit) || (onFloor && out.y >= wallHit.y)) return onFloor;
    Object.assign(out, wallHit);
    return true;
  });
  const hit = { y: 0, up: 0, green: 0 };

  function emit(blades, heads, x, y, z, height, width, random, scale, flowerChance, stalks = true, droop = false) {
    const patch = noise(x * 0.23 + 11, z * 0.23 + 5);
    const lean = droop ? 0.6 + random() * 0.5 : (random() - 0.5) * 0.5;
    const facing = droop ? (random() - 0.5) * 0.7 : random() * Math.PI; // facing 0 leans toward the camera
    const dry = stalks && random() < 0.035 + 0.1 * smooth(0.6, 0.85, noise(x * 0.17 + 40, z * 0.17 + 9));
    blades.push(
      x, y, z,
      dry ? height * 1.55 : height, dry ? width * 0.55 : width, facing, lean,
      patch, dry ? 1 : 0, noise(x * 0.4 + 70, z * 0.4 + 31), random(),
    );
    // Flowers: a thin stem (another blade) with a head riding on its tip.
    for (const [kind, [, size]] of flowers.entries()) {
      const drift = smooth(0.62, 0.8, noise(x * 0.21 + kind * 37, z * 0.33 + kind * 91));
      if (random() >= flowerChance * (0.002 + 0.09 * drift)) continue;
      const stem = [x + (random() - 0.5) * 0.1, y, z + (random() - 0.5) * 0.1, height * (1.15 + random() * 0.5), 0.012 * scale, random() * Math.PI, lean * 0.6];
      const seed = random();
      blades.push(...stem, 0.3, 0, 0.2, seed);
      heads.push(...stem.slice(0, 3), stem[3], size * scale * (0.8 + random() * 0.4), stem[5], stem[6], petals[kind].r, petals[kind].g, petals[kind].b, seed);
      break;
    }
  }

  // One stretch of the path verge: the strip the robot walks on plus both banks.
  function pathChunk(left, right) {
    const random = seeded(Math.round(left * 31 + 7));
    const back = { blades: [], heads: [] };
    const front = { blades: [], heads: [] }; // in front of the robot: drawn over its feet
    const near = obstacles.filter(o => o.x > left - o.r && o.x < right + o.r);
    const depth = [-3.9, 2.6];
    for (let i = Math.round((right - left) * (depth[1] - depth[0]) * pathDensity); i > 0; i--) {
      const x = THREE.MathUtils.lerp(left, right, random());
      const z = THREE.MathUtils.lerp(depth[0], depth[1], random());
      // Short, soft grass on the footpath itself; taller on the banks, and low in front of the
      // walking line so the robot stays readable.
      const verge = smooth(0.35, 1.1, Math.abs(z)) * (z > 0 ? 0.55 : 1);
      const onPath = Math.abs(z) < 0.5;
      if (near.some(o => Math.hypot(x - o.x, z - o.z) < o.r)) continue;
      const lip = z > 1.5; // the front edge and the top of the cliff below it
      if (!ground(x, z, hit) || hit.up < (lip ? 0.2 : 0.88)) continue;
      if (!lip && random() > (onPath ? 0.7 : 0.12) + (onPath ? 0.3 : 0.88) * hit.green) continue; // bare dirt beside the path stays mostly bare
      const tall = 0.65 + 0.7 * noise(x * 0.31, z * 0.31);
      const height = THREE.MathUtils.lerp(0.16, 0.36, random()) * tall * THREE.MathUtils.lerp(0.55, 1, verge) * (0.6 + 0.4 * hit.green);
      const target = z > 0.22 ? front : back;
      if (lip) {
        // Grass spilling over the edge, hanging toward the camera.
        emit(front.blades, front.heads, x, hit.y - 0.02, z, THREE.MathUtils.lerp(0.25, 0.5, random()), THREE.MathUtils.lerp(0.03, 0.045, random()), random, 1, 0.15, false, true);
        continue;
      }
      emit(target.blades, target.heads, x, hit.y - 0.02, z, height, THREE.MathUtils.lerp(0.028, 0.044, random()), random, 1, 0.3 + 0.7 * verge);
    }
    const bounds = new THREE.Box3(new THREE.Vector3(left, -8, depth[0]), new THREE.Vector3(right, 12, depth[1]));
    build(back, nearBlade, bounds, terrain.renderOrder);
    build(front, nearBlade, bounds, 12.2); // the robot sprite draws at order 12
  }

  // The crater floor and wall: a short, soft blanket. Far blades get wider (so they still cover
  // the ground) but never taller, or they read as needles against the slopes and sky.
  function craterChunk(left, right) {
    const random = seeded(Math.round(left * 17 + 1009));
    const back = { blades: [], heads: [] };
    const distant = { blades: [], heads: [] }; // past 14 m: the cheap blade shape
    const near = obstacles.filter(o => o.x > left - o.r && o.x < right + o.r);
    // Far blades fade into the carpet colour, so they add motion and texture, not specks.
    const depth = [-46, -3.4];
    for (let i = Math.round((right - left) * (depth[1] - depth[0]) * craterDensity * 0.42); i > 0; i--) {
      const x = THREE.MathUtils.lerp(left, right, random());
      const z = THREE.MathUtils.lerp(depth[0], depth[1], random());
      const far = cameraReach / (cameraReach - z); // 1 at the walking line, smaller further back
      if (random() > far / 0.7) continue; // a little thinner far away, where each blade is wider
      if (Math.abs(x) > half + 4 - z * 0.75) continue; // outside anything the camera can see
      if (Math.hypot((x - wreck.x) / 1.6, z - wreck.z) < 2.8) continue; // a little scorched ground at the wreck
      if (near.some(o => Math.hypot(x - o.x, z - o.z) < o.r)) continue;
      if (z > -4.4 && ground(x, z, hit)) continue; // the path mesh covers this spot
      if (!floor(x, z, hit) || hit.up < 0.45) continue; // grass on slopes and terraces, not on sheer faces
      if (random() > 0.85 + 0.15 * hit.green) continue; // everywhere, a touch thicker on the mossy parts
      const scale = Math.pow(1 / far, 0.8);
      const height = THREE.MathUtils.lerp(0.13, 0.26, random()) * (0.75 + 0.5 * noise(x * 0.2, z * 0.2)) * (0.75 + 0.25 * hit.green);
      const flowerChance = 1.1 * smooth(0.6, 0.8, hit.up); // flower drifts all over the crater, not on steep slopes
      const target = z < -14 ? distant : back;
      emit(target.blades, target.heads, x, hit.y - 0.03, z, height, THREE.MathUtils.lerp(0.04, 0.06, random()) * scale, random, 1, flowerChance, false);
    }
    const bounds = new THREE.Box3(new THREE.Vector3(left, -8, depth[0]), new THREE.Vector3(right, 12, depth[1]));
    build(back, farBlade, bounds, terrain.renderOrder);
    build(distant, distantBlade, bounds, terrain.renderOrder, false);
  }

  function build({ blades, heads }, strip, bounds, renderOrder, shadows = true) {
    for (const [data, base, material] of [[blades, strip, bladeMaterial], [heads, headQuad, headMaterial]]) {
      if (!data.length) continue;
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.index = base.index;
      geometry.setAttribute('position', base.getAttribute('position'));
      geometry.setAttribute('normal', base.getAttribute('normal'));
      const buffer = new THREE.InstancedInterleavedBuffer(new Float32Array(data), 11);
      geometry.setAttribute('aRoot', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
      geometry.setAttribute('aShape', new THREE.InterleavedBufferAttribute(buffer, 4, 3)); // height, width, facing, lean
      geometry.setAttribute('aTint', new THREE.InterleavedBufferAttribute(buffer, 4, 7)); // blades: patch, dry, warm, seed; heads: colour, seed
      geometry.instanceCount = data.length / 11;
      geometry.boundingBox = bounds;
      geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = shadows; // the far crater is outside the shadow area anyway
      mesh.renderOrder = renderOrder;
      model.add(mesh);
    }
  }

  // Grow the meadow a stretch per frame, starting where the robot is, so loading never stalls.
  const jobs = [];
  for (let left = -half - 2; left < half + 2; left += chunk) jobs.push([pathChunk, left]);
  if (floor) for (let left = -half - 40; left < half + 40; left += chunk) jobs.push([craterChunk, left]);
  jobs.sort((a, b) => (a[0] === craterChunk) - (b[0] === craterChunk) || Math.abs(a[1] + chunk / 2 - player.value.x) - Math.abs(b[1] + chunk / 2 - player.value.x));
  (function next() {
    const job = jobs.shift();
    if (!job) return;
    job[0](job[1], job[1] + chunk);
    requestAnimationFrame(next);
  })();
}

// A unit blade: x across (-0.5..0.5), y up the blade (0..1). The shader gives it shape.
function stripGeometry(segments) {
  const geometry = new THREE.PlaneGeometry(1, 1, 1, segments);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

function grassMaterial(uniforms, head) {
  const material = new THREE.MeshLambertMaterial({
    // One pass for both faces: blades are opaque, so there is nothing to blend in order.
    side: THREE.DoubleSide, transparent: true, depthWrite: true, forceSinglePass: true,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      uniform float windTime;
      uniform vec4 grassPlayer; // x, z of the robot, push strength
      uniform vec3 gDeep, gLush, gTipCool, gTipWarm, gStraw;
      uniform vec3 carpetDeep, carpetLush, carpetSun;
      attribute vec3 aRoot;
      attribute vec4 aShape;
      attribute vec4 aTint;
      varying vec3 vGrassColor;
      varying vec2 vGrassUv;

      // Wind rolls across the field in broad gusts, with a small flutter on every blade.
      vec2 grassWind(vec2 p, float seed, out float gust) {
        float wave = 0.55 * sin(p.x * 0.32 + p.y * 0.18 - windTime * 0.7)
          + 0.35 * sin(p.x * 0.13 - p.y * 0.24 - windTime * 0.38 + 1.7)
          + 0.10 * sin(p.x * 1.1 + p.y * 0.8 - windTime * 1.2);
        gust = smoothstep(0.15, 0.95, 0.5 + 0.5 * wave);
        vec2 flutter = vec2(sin(windTime * (1.6 + seed * 1.0) + seed * 40.0), cos(windTime * 1.3 + seed * 30.0));
        return normalize(vec2(1.0, 0.25)) * (0.1 + 0.32 * gust) + flutter * 0.04 * (0.4 + gust);
      }

      // A point on the blade: t up its length, side across its width.
      vec3 grassPoint(float t, float side, out float gust) {
        vec2 face = vec2(cos(aShape.z), sin(aShape.z));
        vec2 lean = vec2(-face.y, face.x) * aShape.w + grassWind(aRoot.xz, aTint.w, gust);
        vec2 away = aRoot.xz - grassPlayer.xy;
        float reach = length(away);
        lean += away / max(reach, 0.001) * grassPlayer.z * (1.0 - smoothstep(0.1, 0.8, reach));
        float amount = min(length(lean), 1.2);
        vec2 ground = aRoot.xz + face * side + lean * aShape.x * t * t;
        return vec3(ground.x, aRoot.y + aShape.x * t * (1.0 - 0.3 * amount * amount * t), ground.y);
      }
    ` + shader.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', head ? `
        float gust;
        vec3 tip = grassPoint(1.0, 0.0, gust);
        float depth = -(modelViewMatrix * vec4(aRoot, 1.0)).z;
        float size = max(aShape.y, depth * 0.005);
        // Face the camera.
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 upward = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 transformed = tip + (right * position.x + upward * position.y) * size;
        vGrassUv = position.xy * 2.0;
        vGrassColor = aTint.rgb;
      ` : `
        float gust;
        float t = position.y;
        float depth = -(modelViewMatrix * vec4(aRoot, 1.0)).z;
        // Far blades never get thinner than about a pixel, or the field would shimmer.
        float width = max(aShape.y, depth * 0.0028);
        vec3 transformed = grassPoint(t, position.x * width * (1.0 - pow(t, 1.8)), gust);
        vec3 tint = mix(mix(gDeep, gLush, aTint.x), mix(gTipCool, gTipWarm, aTint.z), smoothstep(0.0, 0.9, t));
        tint = mix(tint, gStraw, aTint.y * smoothstep(0.15, 0.7, t));
        tint *= mix(0.72, 1.0, smoothstep(0.0, 0.45, t)) * (0.88 + 0.24 * aTint.w);
        // Gusts catch the light as they pass, and the sun shines through the tips.
        tint = mix(tint, tint * 1.35 + vec3(0.03, 0.035, 0.0), gust * t * 0.7);
        vGrassColor = tint + vec3(0.06, 0.05, 0.0) * smoothstep(0.6, 1.0, t);
        // Far away, blades soften into the carpet colour: texture, not a field of bright specks.
        vec2 cp = aRoot.xz;
        float patches = 0.5 + 0.25 * sin(cp.x * 0.23 + sin(cp.y * 0.19) * 2.0) + 0.25 * sin(cp.y * 0.31 + cp.x * 0.07);
        vec3 carpetTone = mix(mix(carpetDeep, carpetLush, patches), carpetSun, 0.35 * gust) * mix(0.85, 1.12, t);
        vGrassColor = mix(vGrassColor, carpetTone, smoothstep(4.5, 10.0, depth) * 0.85);
        // A little extra air in front of the far slopes, so the crater keeps its depth.
        vGrassColor = mix(vGrassColor, vec3(0.42, 0.52, 0.5), smoothstep(8.0, 16.0, depth) * 0.3);
        vGrassUv = vec2(0.0);
      `);
    shader.fragmentShader = 'varying vec3 vGrassColor;\nvarying vec2 vGrassUv;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', head ? `
        float radius = length(vGrassUv);
        float petals = 0.62 + 0.38 * abs(cos(atan(vGrassUv.y, vGrassUv.x) * 2.5 + vGrassColor.g * 9.0));
        if (radius > petals) discard;
        diffuseColor.rgb = radius < 0.3 ? vec3(1.0, 0.5, 0.03) : vGrassColor * (0.8 + 0.2 * radius);
      ` : 'diffuseColor.rgb *= vGrassColor;')
      // Light both faces of a blade the same, as if lit from above.
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  material.customProgramCacheKey = () => `grass-${head}`;
  return material;
}

// Paint the ground itself as a grass carpet: flat and gently sloped parts turn meadow green in soft
// patches, with the same rolling wind brightening it in bands, so the blades on top read as one
// continuous blanket instead of needles on bare dirt. Cliff faces keep their rock.
function carpet(material, time, amount) {
  if (!material || material.userData.carpet) return;
  material.userData.carpet = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.windTime = time;
    shader.uniforms.carpetAmount = { value: amount };
    for (const [name, hex] of Object.entries(carpetColors)) shader.uniforms[name] = { value: new THREE.Color(hex) };
    shader.vertexShader = 'varying vec3 vCarpetPos;\nvarying float vCarpetUp;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vCarpetPos = position;
      vCarpetUp = normal.y;
    `);
    shader.fragmentShader = `
      uniform float windTime, carpetAmount;
      uniform vec3 carpetDeep, carpetLush, carpetSun;
      varying vec3 vCarpetPos;
      varying float vCarpetUp;
    ` + shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      vec2 p = vCarpetPos.xz;
      float wave = 0.55 * sin(p.x * 0.32 + p.y * 0.18 - windTime * 0.7)
        + 0.35 * sin(p.x * 0.13 - p.y * 0.24 - windTime * 0.38 + 1.7)
        + 0.10 * sin(p.x * 1.1 + p.y * 0.8 - windTime * 1.2);
      float gust = smoothstep(0.15, 0.95, 0.5 + 0.5 * wave);
      float patches = 0.5 + 0.25 * sin(p.x * 0.23 + sin(p.y * 0.19) * 2.0) + 0.25 * sin(p.y * 0.31 + p.x * 0.07);
      vec3 meadow = mix(carpetDeep, carpetLush, patches);
      meadow = mix(meadow, carpetSun, 0.35 * gust);
      // Blade-sized streaks so the carpet never looks like flat paint up close.
      meadow *= 0.9 + 0.1 * sin(p.x * 41.0 + sin(p.y * 37.0) * 3.0);
      float grassy = smoothstep(0.25, 0.55, vCarpetUp) * carpetAmount;
      diffuseColor.rgb = mix(diffuseColor.rgb, meadow, grassy);
    `);
  };
  material.customProgramCacheKey = () => `carpet-${amount}`;
}

// Height, steepness and "how green is the ground here" of a mesh at (x, z), in the model's
// local space. Triangles are bucketed into a fine grid once, so each lookup tests only a few.
function surfaceSampler(mesh, toLocal) {
  mesh.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
  const position = mesh.geometry.getAttribute('position');
  const uv = mesh.geometry.getAttribute('uv');
  const index = mesh.geometry.index;
  const count = position.count;
  const xs = new Float32Array(count), ys = new Float32Array(count), zs = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(toModel);
    xs[i] = v.x; ys[i] = v.y; zs[i] = v.z;
  }
  const cell = 0.5;
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
  const paint = groundPaint(mesh.material.map);
  return (x, z, out) => {
    const list = cells.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell));
    if (!list) return false;
    let found = false;
    for (let i = 0; i < list.length; i += 3) {
      const a = list[i], b = list[i + 1], c = list[i + 2];
      // Barycentric test in the XZ plane, then interpolate.
      const d = (zs[b] - zs[c]) * (xs[a] - xs[c]) + (xs[c] - xs[b]) * (zs[a] - zs[c]);
      if (Math.abs(d) < 1e-9) continue;
      const w1 = ((zs[b] - zs[c]) * (x - xs[c]) + (xs[c] - xs[b]) * (z - zs[c])) / d;
      const w2 = ((zs[c] - zs[a]) * (x - xs[c]) + (xs[a] - xs[c]) * (z - zs[c])) / d;
      const w3 = 1 - w1 - w2;
      if (w1 < -1e-4 || w2 < -1e-4 || w3 < -1e-4) continue;
      const y = w1 * ys[a] + w2 * ys[b] + w3 * ys[c];
      if (found && y <= out.y) continue;
      found = true;
      out.y = y;
      // How flat the triangle is: 1 = level ground, 0 = a vertical face.
      const ux = xs[b] - xs[a], uy = ys[b] - ys[a], uz = zs[b] - zs[a];
      const vx = xs[c] - xs[a], vy = ys[c] - ys[a], vz = zs[c] - zs[a];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      out.up = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
      out.green = paint && uv
        ? paint(w1 * uv.getX(a) + w2 * uv.getX(b) + w3 * uv.getX(c), w1 * uv.getY(a) + w2 * uv.getY(b) + w3 * uv.getY(c))
        : 1;
    }
    return found;
  };
}

// Reads the ground's baked texture so grass grows on the mossy parts and thins on dirt and rock.
function groundPaint(map) {
  if (!map?.image) return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(map.image, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);
  return (u, v) => {
    const px = Math.floor((u - Math.floor(u)) * size) % size;
    const row = map.flipY ? 1 - v : v;
    const py = Math.floor((row - Math.floor(row)) * size) % size;
    const i = (py * size + px) * 4;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    return smooth(0.02, 0.14, (g - r) + 0.5 * (g - b));
  };
}

const smooth = (low, high, value) => THREE.MathUtils.smoothstep(value, low, high);

// Smooth value noise in 0..1, for patches of colour, height and flowers.
function noise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const top = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * sx;
  const bottom = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
