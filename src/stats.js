// Performance overlay, shown with ?stats in the URL.
// Top: frame rate, frame time, draw calls and triangles for the whole frame (shadows included).
// Below: what each part of the scene costs, with a checkbox to hide it. Untick a row and watch
// the frame rate: the rows that change it most are the ones worth optimising.

const categories = [
  ['Grass blades', node => node.geometry?.attributes?.aRoot && node.material.customProgramCacheKey?.() === 'grass-false'],
  ['Grass flowers', node => node.geometry?.attributes?.aRoot],
  ['Ground', node => /^(Terrain|Crater|OuterLand)/.test(node.name)],
  ['Kit trees', node => /^(Leaves|Bark)/.test(materialName(node))],
  ['Kit grass + flowers', node => /^(Grass|Flower|Clover)/.test(materialName(node))],
  ['Kit rocks', node => /Rock|Pebble/i.test(materialName(node)) || node.name.startsWith('Rock')],
  ['Painted plant cards', node => node.material?.customProgramCacheKey?.() === 'foliage-wind'],
  ['Painted backdrop', node => node.material?.isMeshBasicMaterial],
  ['Pollen', node => node.isPoints],
];

function materialName(node) {
  return (Array.isArray(node.material) ? node.material[0] : node.material)?.name ?? '';
}

export function attachStats(renderer, scene) {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:8px;left:8px;z-index:50;padding:8px 10px;border-radius:6px;'
    + 'background:rgba(10,16,14,.82);color:#dfe8d8;font:12px/1.45 ui-monospace,monospace;min-width:300px;';
  document.body.appendChild(panel);
  const head = document.createElement('div');
  const table = document.createElement('div');
  panel.append(head, table);
  const hidden = new Set();
  const hiddenByUs = new Set(); // only these get shown again: the scene hides some things on purpose
  const rows = new Map();

  // Group every mesh into a category and add up its triangles (instances included).
  function measure() {
    const totals = new Map(categories.map(([name]) => [name, { triangles: 0, objects: 0, nodes: [] }]));
    totals.set('Other', { triangles: 0, objects: 0, nodes: [] });
    scene.traverse(node => {
      if (!node.isMesh && !node.isPoints) return;
      const name = categories.find(([, test]) => test(node))?.[0] ?? 'Other';
      const geometry = node.geometry;
      const count = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
      const instances = node.isInstancedMesh ? node.count : geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1;
      const entry = totals.get(name);
      entry.triangles += node.isPoints ? 0 : Math.round(count / 3) * instances;
      entry.objects += instances;
      entry.nodes.push(node);
    });
    return totals;
  }

  function row(name) {
    if (rows.has(name)) return rows.get(name);
    const line = document.createElement('label');
    line.style.cssText = 'display:flex;gap:6px;align-items:center;cursor:pointer;';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = true;
    const text = document.createElement('span');
    text.style.whiteSpace = 'pre';
    line.append(box, text);
    table.appendChild(line);
    box.addEventListener('change', () => {
      if (box.checked) {
        hidden.delete(name);
        for (const node of totals.get(name)?.nodes ?? []) if (hiddenByUs.delete(node)) node.visible = true;
      } else hidden.add(name);
    });
    const entry = { text, box };
    rows.set(name, entry);
    return entry;
  }

  let frames = 0;
  let last = performance.now();
  let worst = 0;
  let previous = last;
  let totals = measure();
  (function tick(now) {
    frames++;
    worst = Math.max(worst, now - previous);
    previous = now;
    // Hidden categories stay hidden even as new grass streams in.
    for (const name of hidden) {
      for (const node of totals.get(name)?.nodes ?? []) {
        if (!node.visible) continue;
        node.visible = false;
        hiddenByUs.add(node);
      }
    }
    if (now - last > 500) {
      totals = measure();
      const fps = frames * 1000 / (now - last);
      const { calls, triangles } = renderer.info.render;
      const memory = renderer.info.memory;
      head.innerHTML = `<b>${fps.toFixed(0)} fps</b> · ${(1000 / fps).toFixed(1)} ms avg · ${worst.toFixed(0)} ms worst<br>`
        + `pixel ratio ${renderer.getPixelRatio().toFixed(2)} (screen ${devicePixelRatio}) · ${calls} draw calls · ${(triangles / 1e6).toFixed(2)} M triangles drawn<br>`
        + `${memory.geometries} geometries · ${memory.textures} textures · ${renderer.info.programs.length} shaders<br>`
        + '<span style="opacity:.6">scene contents (untick to hide):</span>';
      const sorted = [...totals].filter(([, entry]) => entry.objects).sort((a, b) => b[1].triangles - a[1].triangles);
      for (const [name, entry] of sorted) {
        row(name).text.textContent = `${name.padEnd(20)} ${(entry.triangles / 1e3).toFixed(0).padStart(6)}k tris  ${String(entry.objects).padStart(7)} items`;
      }
      frames = 0;
      worst = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  })(last);
}
