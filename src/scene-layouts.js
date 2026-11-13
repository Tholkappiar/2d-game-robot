import { layers, pieces } from './scene-catalog.js';

const files = import.meta.glob('./layouts/*.json', { eager: true, import: 'default' });
const fields = ['piece', 'layer', 'x', 'width', 'bottom', 'spacing', 'variation', 'span', 'surface', 'fadeIn', 'flip'];

export function loadLayouts() {
  const layouts = new Map();
  const errors = [];

  for (const [file, layout] of Object.entries(files)) {
    const id = file.split('/').at(-1).slice(0, -5);
    try {
      validate(layout);
      layouts.set(id, layout);
    } catch (error) {
      errors.push(`${id}.json: ${error.message}`);
    }
  }

  return { layouts, errors };
}

function validate(layout) {
  if (typeof layout?.name !== 'string' || !layout.name.trim()) {
    throw new Error('Give the layout a name.');
  }
  if (!Number.isFinite(layout.spawnX)) throw new Error('spawnX must be a number.');
  if (!Array.isArray(layout.placements)) throw new Error('placements must be a list.');
  if (layout.jumpSpeed !== undefined && (!Number.isFinite(layout.jumpSpeed) || layout.jumpSpeed <= 0)) {
    throw new Error('jumpSpeed must be a positive number.');
  }
  if (layout.platforms !== undefined) validatePlatforms(layout);
  if (layout.finishX !== undefined && (!Number.isFinite(layout.finishX) ||
      !layout.platforms?.some(({ left, right }) => layout.finishX > left && layout.finishX <= right))) {
    throw new Error('Place finishX on a platform.');
  }
  if (layout.finishMarker !== undefined && typeof layout.finishMarker !== 'boolean') {
    throw new Error('finishMarker must be true or false.');
  }

  let groundCount = 0;
  for (const [index, placement] of layout.placements.entries()) {
    const fail = message => { throw new Error(`Placement ${index + 1}: ${message}`); };
    if (!placement || typeof placement !== 'object' || Array.isArray(placement)) {
      fail('Use an object with a piece, layer, width and bottom.');
    }
    for (const field of Object.keys(placement)) {
      if (!fields.includes(field)) fail(`Unknown field "${field}".`);
    }
    const { piece, layer, x = 0, width, bottom, spacing, variation = 0, span, surface, fadeIn, flip } = placement;
    if (typeof piece !== 'string' || !Object.hasOwn(pieces, piece)) fail(`Unknown piece "${piece}".`);
    if (typeof layer !== 'string' || !Object.hasOwn(layers, layer)) fail(`Unknown layer "${layer}".`);
    if (!Number.isFinite(width) || width <= 0) fail('width must be a positive number.');
    if (!Number.isFinite(x) || !Number.isFinite(bottom)) fail('x and bottom must be numbers.');
    if (fadeIn !== undefined && (!Number.isFinite(fadeIn) || fadeIn <= 0 || fadeIn > 1)) {
      fail('fadeIn must be a fraction of the width, above zero and at most one.');
    }
    if (flip !== undefined && typeof flip !== 'boolean') fail('flip must be true or false.');
    if (surface !== undefined && typeof surface !== 'boolean') fail('surface must be true or false.');
    if (surface && (layer !== 'ground' || !pieces[piece].surfaceLine || spacing !== undefined || flip ||
        !hasContinuousSurface(layout.platforms, x - width / 2, x + width / 2))) {
      fail('Terrain that follows a surface must cover a continuous run of platforms on the ground layer.');
    }
    if (spacing !== undefined && (!Number.isFinite(spacing) || spacing < 0.1)) {
      fail('spacing must be at least 0.1.');
    }
    if (!Number.isFinite(variation) || variation < 0 || variation >= (spacing ?? 1) / 2) {
      fail('variation must be zero or less than half the spacing.');
    }
    if (Object.hasOwn(placement, 'variation') && spacing === undefined) {
      fail('Set spacing before using variation.');
    }
    if (pieces[piece].strip && spacing !== undefined) fail('This piece already repeats as a strip.');
    if (span !== undefined) {
      if (!Array.isArray(span) || span.length !== 2 ||
          !span.every(Number.isFinite) || span[0] >= span[1]) {
        fail('span needs two horizontal positions in increasing order.');
      }
      if (!pieces[piece].strip) fail('Use span on a repeating strip.');
    }
    if (piece === 'terrain') {
      if (layer !== 'ground') fail('Put terrain on the ground layer.');
      groundCount++;
    }
  }

  if (layout.platforms === undefined && groundCount !== 1) {
    throw new Error('Place one terrain piece for the robot to walk on.');
  }
}

function hasContinuousSurface(platforms, left, right) {
  const sections = platforms?.filter(platform => platform.right > left + 0.000001 && platform.left < right - 0.000001)
    .sort((a, b) => a.left - b.left) ?? [];
  if (!sections.length || sections[0].left > left + 0.000001 || sections.at(-1).right < right - 0.000001) return false;
  return sections.slice(1).every((section, index) => {
    const previous = sections[index];
    return previous.right === section.left && (previous.endY ?? previous.y) === section.y;
  });
}

function validatePlatforms({ platforms, spawnX }) {
  if (!Array.isArray(platforms) || platforms.length === 0) {
    throw new Error('platforms must be a nonempty list.');
  }
  for (const [index, platform] of platforms.entries()) {
    const { left, right, y, endY = y, grabLeft } = platform ?? {};
    if (![left, right, y, endY].every(Number.isFinite) || left >= right) {
      throw new Error(`Platform ${index + 1}: give numeric left, right and y, with left below right.`);
    }
    if (grabLeft !== undefined && typeof grabLeft !== 'boolean') {
      throw new Error(`Platform ${index + 1}: grabLeft must be true or false.`);
    }
  }
  const ordered = [...platforms].sort((a, b) => a.left - b.left);
  if (ordered.some((platform, index) => index > 0 && platform.left < ordered[index - 1].right)) {
    throw new Error('Platforms cannot overlap horizontally.');
  }
  if (!platforms.some(({ left, right }) => spawnX >= left && spawnX <= right)) {
    throw new Error('Place spawnX on a platform.');
  }
}
