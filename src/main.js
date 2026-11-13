import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './style.css';
import { buildScene, makePlane, cameraDistance } from './scene-builder.js';
import { loadLayouts } from './scene-layouts.js';
import { foliagePieces } from './foliage.js';
import { loadKit } from './megakit.js';
import { createCameraRig } from './camera-shots.js';

const host = document.querySelector('#scene');
const status = document.querySelector('#status');
const levelPicker = document.querySelector('#level-picker');
const viewButtons = document.querySelectorAll('[data-view]');
const panControls = document.querySelector('#pan-controls');
const movementHelp = document.querySelector('#movement-help');
const finish = document.querySelector('#finish');
const replay = document.querySelector('#replay');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#111b18');
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 2;
// A long lens from far back (like a film camera on a crane): the world stays put and only
// the camera moves, with little perspective stretch on the ground.
const depotCamera = new THREE.PerspectiveCamera(35, 1, 0.2, 160);
depotCamera.position.z = cameraDistance;
const frameAspect = 1672 / 941;
const frameScale = 1.065;

async function start() {
  const { layouts, errors } = loadLayouts();
  const requestedLayout = new URLSearchParams(location.search).get('level') ?? 'crashwood';
  const levelId = layouts.has(requestedLayout) ? requestedLayout : layouts.keys().next().value;
  const layout = layouts.get(levelId);
  // ?x=1.5 starts the player at that spot (handy for checking one part of a long level).
  const startParam = new URLSearchParams(location.search).get('x');
  const startX = startParam === null ? NaN : Number(startParam);
  if (layout && Number.isFinite(startX) && layout.platforms?.some(({ left, right }) => startX >= left && startX <= right)) {
    layout.spawnX = startX;
  }
  if (!layout) throw new Error(errors.join(' ') || 'Add a layout in src/layouts.');
  const crashwood = levelId === 'crashwood';
  for (const [id, level] of layouts) levelPicker.add(new Option(level.name, id));
  levelPicker.value = levelId;
  levelPicker.disabled = layouts.size < 2;
  levelPicker.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('level', levelPicker.value);
    location.assign(url);
  });
  document.title = layout.name;
  host.setAttribute('aria-label', `${layout.name} scene preview`);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const loader = new THREE.TextureLoader();
  const backgroundPiece = layout.placements.find(placement => placement.layer === 'background')?.piece
    ?? 'background-clear';
  const referencePiece = crashwood
    ? layout.placements.find(placement => placement.layer === 'crash-basin')?.piece ?? backgroundPiece
    : 'concept';
  const names = new Set([backgroundPiece, referencePiece]);
  for (const { piece } of layout.placements) names.add(piece);
  if (layout.model) for (const piece of foliagePieces) names.add(piece);
  const textures = Object.fromEntries(await Promise.all(Array.from(names, async name => {
    const texture = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/${name}.png`)
      .catch(() => { throw new Error(`Could not load artwork "${name}.png".`); });
    texture.colorSpace = THREE.SRGBColorSpace;
    return [name, texture];
  })));

  function artwork(name) {
    const map = textures[name];
    const { width, height } = map.image;
    return makePlane(map, 2 * width / height, 2, 0);
  }

  const depot = new THREE.Group();
  const pollen = createPollen();
  depot.add(pollen);

  let model = null;
  let followSun = () => {};
  if (layout.model) {
    // Every file shares one transform: they were exported from the same Blender scene.
    const gltfLoader = new GLTFLoader();
    model = new THREE.Group();
    for (const file of layout.model.files) {
      const gltf = await gltfLoader.loadAsync(`${import.meta.env.BASE_URL}assets/${file}`)
        .catch(() => { throw new Error(`Could not load model "${file}".`); });
      model.add(gltf.scene);
    }
    // Warm sun from the right, a little in front, matching the Blender scene.
    const sun = new THREE.DirectionalLight('#ffe2b8', 3.0);
    sun.position.set(2.4, 2.0, 0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: 0.1, far: 20 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.01;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target, new THREE.HemisphereLight('#bcd3dc', '#56503a', 1.0));
    followSun = cameraX => {
      // Keep the shadow area centred on the camera so the whole long path gets shadows.
      sun.position.set(cameraX + 2.4, 2.0, 0.5);
      sun.target.position.set(cameraX, 0, 0);
    };
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Blue haze with distance: the crater wall and rim trees fade toward the sky and hills.
    scene.fog = new THREE.Fog('#9fb7c4', cameraDistance + 1, cameraDistance + 24);
  }

  const kit = layout.model ? await loadKit(import.meta.env.BASE_URL) : null;
  const activeLayout = buildScene(layout, textures, model, kit);
  depot.add(activeLayout.root);
  const descent = layout.platforms?.find(platform => platform.endY < platform.y);
  const controls = 'A/D move · Space jump';
  const objective = layout.finishX === undefined ? controls : `${controls} · Follow the trail right`;
  movementHelp.textContent = objective;
  let viewWidth = 2 * frameAspect / frameScale;

  const views = { depot, background: artwork(backgroundPiece), concept: artwork(referencePiece) };
  scene.add(...Object.values(views));
  let activeView = 'depot';
  const heldKeys = new Set();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pan = 0;
  let lift = crashwood ? activeLayout.player.terrainY + 0.53 : 0;
  let completed = false;
  const rig = createCameraRig(layout.camera);
  rig.snap(activeLayout.player.x);

  let time = 0;
  let jumpRequested = false;

  function clampPan(value) {
    const { bounds } = activeLayout;
    // The visible width grows when a shot pulls the camera back.
    const half = Math.min(viewWidth * rig.current.zoom, bounds ? bounds.right - bounds.left : Infinity) / 2;
    return bounds ? THREE.MathUtils.clamp(value, bounds.left + half, bounds.right - half) : value;
  }

  function panTarget() {
    const { player, bounds } = activeLayout;
    // Crashwood keeps the robot on the left third, with the view leading ahead to the right.
    const offset = crashwood ? -viewWidth * rig.current.zoom * rig.current.lead
      : bounds ? THREE.MathUtils.clamp(player.spawnX, -viewWidth * 0.30, viewWidth * 0.30) : player.spawnX;
    return clampPan(player.x - offset);
  }

  function render() {
    if (activeView !== 'depot') {
      renderer.render(scene, camera);
      return;
    }
    const cameraX = clampPan(pan);
    const { zoom, rise, tilt } = rig.current;
    const sway = motion.matches ? { x: 0, y: 0, roll: 0 } : rig.drift(time);
    depotCamera.position.set(cameraX + sway.x, lift + rise + sway.y, cameraDistance * zoom);
    depotCamera.rotation.set(THREE.MathUtils.degToRad(tilt), 0, sway.roll);
    pollen.position.x = cameraX;
    followSun(cameraX);
    activeLayout.draw(cameraX, lift, motion.matches ? null : time);
    pollen.visible = !motion.matches;
    pollen.material.uniforms.time.value = time;
    pollen.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    renderer.render(scene, depotCamera);
  }

  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    // Cover the viewport with the reference art, preserving its aspect ratio.
    const artHalfHeight = Math.min(1, frameAspect / aspect);
    camera.left = -aspect * artHalfHeight;
    camera.right = aspect * artHalfHeight;
    camera.top = artHalfHeight;
    camera.bottom = -artHalfHeight;
    camera.updateProjectionMatrix();
    depotCamera.aspect = aspect;
    viewWidth = 2 * aspect / frameScale;
    const { bounds } = activeLayout;
    if (bounds) viewWidth = Math.min(viewWidth, bounds.right - bounds.left);
    // viewWidth is the visible width at the walking plane (z = 0).
    depotCamera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(viewWidth / (2 * aspect * cameraDistance)));
    depotCamera.updateProjectionMatrix();
    // Size tiling layers for the widest shot so their edges never show.
    activeLayout.setViewWidth(viewWidth * rig.maxZoom);
    renderer.setSize(width, height);
    render();
  }

  function selectView(name) {
    activeView = name;
    clearInput();
    for (const [key, view] of Object.entries(views)) view.visible = key === activeView;
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === activeView));
    panControls.hidden = activeView !== 'depot';
    finish.hidden = activeView !== 'depot' || !completed;
    render();
  }

  for (const button of viewButtons) {
    button.disabled = false;
    button.addEventListener('click', () => {
      selectView(button.dataset.view);
      if (activeView === 'depot') host.focus();
    });
  }
  function restartLayout() {
    activeLayout.player.reset();
    completed = false;
    finish.hidden = true;
    movementHelp.textContent = objective;
    rig.snap(activeLayout.player.x);
    pan = panTarget();
    lift = crashwood ? activeLayout.player.terrainY + 0.53 : 0;
    clearInput();
    host.focus();
    render();
  }

  document.querySelector('#restart').addEventListener('click', restartLayout);
  replay.addEventListener('click', restartLayout);

  const movementKeys = ['KeyA', 'KeyD', 'Space'];
  window.addEventListener('keydown', event => {
    if (activeView !== 'depot' || !movementKeys.includes(event.code) ||
        event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target === levelPicker || (event.code === 'Space' && event.target.closest?.('button'))) return;
    event.preventDefault();
    if (event.code === 'Space' && !event.repeat) jumpRequested = true;
    heldKeys.add(event.code);
  });
  window.addEventListener('keyup', event => heldKeys.delete(event.code));
  function clearInput() {
    heldKeys.clear();
    jumpRequested = false;
  }
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', clearInput);

  let previousTime;
  renderer.setAnimationLoop(now => {
    const delta = previousTime === undefined ? 0 : Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    if (activeView !== 'depot') return;
    const horizontal = Number(heldKeys.has('KeyD')) - Number(heldKeys.has('KeyA'));
    const { player } = activeLayout;
    if (!completed) player.step(delta, horizontal, jumpRequested);
    jumpRequested = false;
    const hint = player.hanging ? 'Space to climb onto the ledge' : objective;
    if (movementHelp.textContent !== hint) movementHelp.textContent = hint;
    if (!completed && player.grounded && player.x >= layout.finishX) {
      completed = true;
      finish.hidden = false;
      clearInput();
      replay.focus({ preventScroll: true });
    }
    rig.update(player.x, delta);
    pan = THREE.MathUtils.damp(pan, panTarget(), 2.2, delta); // soft, film-like follow
    // Follow the descent without tracking each jump on the bounded trail.
    const cameraY = crashwood ? player.terrainY + 0.53 : descent && player.x >= descent.left
      ? Math.min(0, player.terrainY + 0.44)
      : activeLayout.bounds ? 0 : player.jumpHeight * 0.5;
    lift = THREE.MathUtils.damp(lift, cameraY, 1.8, delta);
    if (!motion.matches) time += delta;
    render();
  });
  new ResizeObserver(resize).observe(host);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    status.textContent = 'Graphics connection lost. Reload to restore the preview.';
    status.hidden = false;
  });
  pan = panTarget();
  selectView(activeView);
  resize();
  status.textContent = errors.join(' ');
  status.hidden = errors.length === 0;
}

function createPollen() {
  const positions = [];
  // Plenty of slow-drifting pollen across the whole frame height.
  for (let i = 0; i < 160; i++) {
    positions.push(Math.random() * 4.4 - 2.2, Math.random() * 1.7 - 0.9, Math.random());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
    vertexShader: `
      uniform float time;
      uniform float pixelRatio;
      varying float opacity;
      void main() {
        float phase = position.z * 6.283;
        float x = mod(position.x + 2.2 + time * (0.035 + position.z * 0.05), 4.4) - 2.2;
        float y = position.y + 0.055 * sin(time * 0.9 + phase);
        opacity = 0.2 + 0.35 * pow(0.5 + 0.5 * sin(time * 1.2 + phase), 2.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, 0.0, 1.0);
        gl_PointSize = (2.5 + 2.5 * position.z) * pixelRatio;
      }
    `,
    fragmentShader: `
      varying float opacity;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        gl_FragColor = vec4(1.0, 0.89, 0.58, opacity * (1.0 - smoothstep(0.08, 0.5, radius)));
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 20;
  points.frustumCulled = false;
  return points;
}

document.querySelector('#fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    status.textContent = 'Fullscreen is unavailable in this browser.';
    status.hidden = false;
  }
});

start().catch(error => {
  console.error(error);
  status.textContent = `Unable to load the scene. ${error.message}`;
  status.hidden = false;
});
