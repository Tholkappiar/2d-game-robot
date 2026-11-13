import * as THREE from 'three';

// Cinematic camera keyframes along the level, set in the layout JSON:
//
//   "camera": { "shots": [ { "x": -7, "zoom": 0.9, "rise": 0, "tilt": 0, "lead": 0.24 }, ... ] }
//
//   x     where along the path this shot applies (game units, same as platforms)
//   zoom  camera distance multiplier: 1 = normal, 1.3 = wide vista, 0.85 = close and intimate
//   rise  extra camera height (game units); pair with a small negative tilt to look down
//   tilt  pitch in degrees (negative looks down)
//   lead  how far left of centre the player sits, as a fraction of the view width
//
// Between two shots the values blend with an ease curve; the camera then eases toward
// them slowly, so changes feel like a crane move rather than a cut.

const defaults = { zoom: 1, rise: 0, tilt: 0, lead: 0.22 };
const keys = Object.keys(defaults);

export function validateCamera(camera) {
  if (camera === undefined) return;
  if (!Array.isArray(camera?.shots) || !camera.shots.length) throw new Error('camera.shots must be a nonempty list.');
  for (const [index, shot] of camera.shots.entries()) {
    if (!Number.isFinite(shot?.x)) throw new Error(`camera shot ${index + 1}: x must be a number.`);
    for (const key of keys) {
      if (shot[key] !== undefined && !Number.isFinite(shot[key])) throw new Error(`camera shot ${index + 1}: ${key} must be a number.`);
    }
    if (shot.zoom !== undefined && (shot.zoom < 0.5 || shot.zoom > 2)) throw new Error(`camera shot ${index + 1}: keep zoom between 0.5 and 2.`);
  }
}

export function createCameraRig(camera) {
  const shots = (camera?.shots ?? []).map(shot => ({ ...defaults, ...shot })).sort((a, b) => a.x - b.x);
  const current = { ...(shots[0] ?? defaults) };
  const maxZoom = Math.max(1, ...shots.map(shot => shot.zoom));

  function target(x) {
    if (!shots.length) return defaults;
    if (x <= shots[0].x) return shots[0];
    if (x >= shots.at(-1).x) return shots.at(-1);
    const next = shots.findIndex(shot => shot.x > x);
    const a = shots[next - 1];
    const b = shots[next];
    const t = THREE.MathUtils.smootherstep((x - a.x) / (b.x - a.x), 0, 1);
    return Object.fromEntries(keys.map(key => [key, THREE.MathUtils.lerp(a[key], b[key], t)]));
  }

  return {
    maxZoom,
    current,
    snap(x) { Object.assign(current, target(x)); },
    update(x, delta) {
      const goal = target(x);
      for (const key of keys) current[key] = THREE.MathUtils.damp(current[key], goal[key], 0.9, delta);
    },
    // A slow, faint handheld sway so the frame never feels locked off.
    drift(time) {
      return {
        x: 0.012 * Math.sin(time * 0.31) + 0.006 * Math.sin(time * 0.77 + 1.3),
        y: 0.009 * Math.sin(time * 0.23 + 0.7) + 0.004 * Math.sin(time * 0.61),
        roll: 0.0025 * Math.sin(time * 0.19 + 2.1),
      };
    },
  };
}
