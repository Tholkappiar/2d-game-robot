import * as THREE from 'three';
import { createPlayer } from './player.js';
import { layers, pieces } from './scene-catalog.js';
import { attachOakWind } from './oak-wind.js';
import { surfaceHeight } from './platforms.js';
import { addFoliage } from './foliage.js';

export function makePlane(map, width, height, order, transparent = false) {
  // fog: false — scene fog is only for the 3D ground; painted layers carry their own haze.
  const material = new THREE.MeshBasicMaterial({
    map, transparent, toneMapped: false, depthTest: false, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.renderOrder = order;
  return mesh;
}

// A 3D model (exported from Blender) on the walking layer. It is drawn in the
// transparent pass at the ground layer's order so the flat parallax art keeps
// its painter's order around it, while the model depth-tests against itself.
function addModel(root, model, placement) {
  model.scale.setScalar(placement.scale);
  model.traverse(node => {
    if (!node.isMesh) return;
    node.renderOrder = layers.ground.order;
    node.castShadow = true;
    node.receiveShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      material.transparent = true;
      material.depthTest = true;
      material.depthWrite = true;
      // Warm the neutral Blender greys toward the painted forest palette.
      material.color.set(node.name.startsWith('Terrain') ? '#f2ead2' : '#e8e2cf');
    }
  });
  root.add(model);
  return model;
}

export function buildScene(layout, textures, model = null) {
  const root = new THREE.Group();
  const model3d = model && addModel(root, model, layout.model);
  const animateFoliage = model3d ? addFoliage(model3d, textures) : null;
  const strips = [];
  const props = [];
  const animateOaks = [];
  let floorY;

  for (const [index, placement] of layout.placements.entries()) {
    const { piece, layer, x = 0, width, bottom, spacing, variation = 0, span, surface, fadeIn, flip } = placement;
    const {
      strip, opaque, trimBottom = 0, heightScale = 1, walkingLine, surfaceLine, softenCanopyEdges, featherBase, featherSides,
    } = pieces[piece];
    const { speed, order } = layers[layer];
    const map = textures[piece];
    const height = width * (map.image.height - trimBottom) / map.image.width * heightScale;
    const y = surface ? 0 : bottom + height / 2;
    const renderOrder = order + index / layout.placements.length;

    function makeSprite() {
      const mesh = makePlane(map, width, height, renderOrder, !opaque);
      if (surface) {
        mesh.geometry.dispose();
        mesh.geometry = terrainGeometry(layout.platforms, x, width, height, surfaceLine);
      }
      if (trimBottom) {
        const uv = mesh.geometry.getAttribute('uv');
        const lowerEdge = trimBottom / map.image.height;
        for (let vertex = 0; vertex < uv.count; vertex++) {
          uv.setY(vertex, THREE.MathUtils.lerp(lowerEdge, 1, uv.getY(vertex)));
        }
      }
      if (piece === 'oak') animateOaks.push(attachOakWind(mesh, index * 0.13));
      if (fadeIn) {
        mesh.material.onBeforeCompile = shader => {
          shader.uniforms.edgeFade = { value: fadeIn };
          const edgeMask = surface
            ? `float edge = edgeFade * (0.35 + 0.24 * sin(vMapUv.y * 13.0) + 0.11 * sin(vMapUv.y * 46.0));
               diffuseColor.a *= smoothstep(edge, edge + edgeFade * 0.24, vMapUv.x);`
            : 'diffuseColor.a *= smoothstep(0.0, edgeFade, vMapUv.x);';
          shader.fragmentShader = 'uniform float edgeFade;\n' + shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>\n${edgeMask}`,
          );
        };
        mesh.material.customProgramCacheKey = () => surface ? 'terrain-edge' : 'sprite-edge';
      }
      if (softenCanopyEdges) {
        mesh.material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
            #include <map_fragment>
            float side = min(vMapUv.x, 1.0 - vMapUv.x);
            diffuseColor.a *= mix(1.0, smoothstep(0.0, 0.045, side), smoothstep(0.2, 0.43, vMapUv.y));
          `);
        };
      }
      if (featherSides) {
        // Fade both side edges so a non-tiling painting blends into the layers behind.
        mesh.material.onBeforeCompile = shader => {
          shader.uniforms.sideFade = { value: featherSides };
          shader.fragmentShader = 'uniform float sideFade;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
            #include <map_fragment>
            diffuseColor.a *= smoothstep(0.0, sideFade, min(vMapUv.x, 1.0 - vMapUv.x));
          `);
        };
        mesh.material.customProgramCacheKey = () => 'feather-sides';
      }
      if (featherBase) {
        mesh.material.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
            #include <map_fragment>
            // Taper the painted bank where it overlaps the scree, below the trunks.
            float ripple = 0.012 * sin(vMapUv.x * 101.0) + 0.009 * sin(vMapUv.x * 239.0);
            float side = min(vMapUv.x, 1.0 - vMapUv.x);
            float base = vMapUv.y + ripple;
            diffuseColor.a *= smoothstep(0.018, 0.135, base);
            diffuseColor.a *= mix(smoothstep(0.0, 0.12, side), 1.0, smoothstep(0.10, 0.32, base));
          `);
        };
      }
      // Keep the same apparent size at each parallax depth.
      mesh.scale.setScalar(1 / speed);
      if (flip) mesh.scale.x *= -1;
      mesh.position.z = 2 * (1 - 1 / speed);
      root.add(mesh);
      return mesh;
    }

    if (strip) {
      const mesh = makeSprite();
      const tiled = map.clone();
      tiled.wrapS = THREE.MirroredRepeatWrapping;
      tiled.needsUpdate = true;
      mesh.material.map = tiled;
      if (span) {
        const [left, right] = span;
        const tiles = (right - left) / width;
        mesh.scale.x = tiles / speed;
        tiled.repeat.x = tiles;
        tiled.offset.x = THREE.MathUtils.euclideanModulo(0.5 + (left - x) / width, 2);
        props.push({ copies: [mesh], width: right - left, x: (left + right) / 2, y, speed, variation: 0 });
      } else {
        strips.push({ mesh, x, y, speed, width });
      }
      if (walkingLine !== undefined) floorY = bottom + height * walkingLine;
      continue;
    }

    props.push({ copies: [makeSprite()], makeSprite, width, x, y, speed, spacing, variation });
  }

  const { platforms, spawnX, jumpSpeed } = layout;
  const bounds = platforms && {
    left: Math.min(...platforms.map(platform => platform.left)),
    right: Math.max(...platforms.map(platform => platform.right)),
  };
  const player = createPlayer({ floorY, spawnX, platforms, bounds, jumpSpeed });
  root.add(player.root);
  if (layout.finishX !== undefined && layout.finishMarker !== false) {
    const sign = makeTrailSign();
    const platform = platforms.find(({ left, right }) => layout.finishX >= left && layout.finishX <= right);
    root.add(sign);
    props.push({ copies: [sign], x: layout.finishX, y: surfaceHeight(platform, layout.finishX) + 0.26,
      speed: 1, variation: 0 });
  }

  return {
    root,
    player,
    bounds,
    setViewWidth(viewWidth) {
      for (const { mesh, speed, width } of strips) {
        const tiles = Math.max(1, viewWidth / width);
        mesh.scale.x = tiles / speed;
        mesh.material.map.repeat.x = tiles;
      }
      for (const { copies, makeSprite, width, speed, spacing, variation } of props) {
        if (spacing === undefined) continue;
        const reach = (viewWidth * speed + width) / 2 + variation;
        const count = 2 * Math.ceil(reach / spacing) + 1;
        while (copies.length < count) copies.push(makeSprite());
      }
    },
    draw(pan, lift, animationTime = null) {
      player.draw(pan);
      if (model3d) model3d.position.set(layout.model.x - pan, layout.model.y, 0);
      animateFoliage?.(animationTime);
      for (const animate of animateOaks) animate(animationTime);
      for (const { mesh, x, y, speed, width } of strips) {
        mesh.position.y = lift + (y - lift) / speed;
        const map = mesh.material.map;
        // Add tiles around the center so resizing keeps the pattern in place.
        const leftShift = (1 - map.repeat.x) / 2;
        map.offset.x = THREE.MathUtils.euclideanModulo((pan * speed - x) / width + leftShift, 2);
      }
      for (const { copies, x, y, speed, spacing, variation } of props) {
        const radius = (copies.length - 1) / 2;
        const travel = pan * speed;
        const nearest = spacing === undefined ? 0 : Math.round((travel - x) / spacing);
        for (const [slot, mesh] of copies.entries()) {
          const index = nearest + slot - radius;
          const offset = index === 0 ? 0 : Math.sin(index * 12.9898) * variation;
          mesh.position.x = (x + index * (spacing ?? 0) + offset - travel) / speed;
          mesh.position.y = lift + (y - lift) / speed;
        }
      }
    },
  };
}

function makeTrailSign() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const paint = canvas.getContext('2d');
  paint.fillStyle = '#332e26';
  paint.fillRect(72, 45, 14, 112);
  paint.fillStyle = '#5f5941';
  paint.fillRect(74, 45, 4, 108);
  paint.beginPath();
  paint.moveTo(20, 24);
  paint.lineTo(116, 20);
  paint.lineTo(148, 53);
  paint.lineTo(117, 86);
  paint.lineTo(20, 82);
  paint.closePath();
  paint.fillStyle = '#bda56b';
  paint.fill();
  paint.lineWidth = 5;
  paint.strokeStyle = '#494430';
  paint.stroke();
  paint.font = 'bold 21px sans-serif';
  paint.fillStyle = '#313d32';
  paint.textAlign = 'center';
  paint.fillText('TRAIL', 74, 61);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return makePlane(texture, 0.43, 0.53, 9, true);
}

function terrainGeometry(platforms, center, width, height, surfaceLine) {
  const left = center - width / 2;
  const right = center + width / 2;
  const joints = platforms.map(platform => platform.left).filter(x => x > left && x < right);
  const columns = [left, ...joints.sort((a, b) => a - b), right];
  const positions = [];
  const uvs = [];
  const indices = [];
  for (const [index, x] of columns.entries()) {
    const platform = platforms.find(({ left, right }) => x >= left - 0.000001 && x <= right + 0.000001);
    const y = surfaceHeight(platform, x) - surfaceLine * height;
    const u = (x - left) / width;
    positions.push(x - center, y, 0, x - center, y + height, 0);
    uvs.push(u, 0, u, 1);
    const v = index * 2;
    if (index > 0) indices.push(v - 2, v, v - 1, v - 1, v, v + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
