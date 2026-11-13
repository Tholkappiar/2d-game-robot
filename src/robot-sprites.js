import * as THREE from 'three';

export const robotFrames = {
  idle: [0, 1, 0, 2],
  run: [3, 4, 5, 6, 7, 8, 9, 10],
  rise: 11,
  fall: 12,
  pull: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  mantle: 24,
};

const pixelSize = 0.30 / 80;
export const ledgeGrip = { x: (66 - 40) * pixelSize, y: (77 - 13) * pixelSize };

export function createRobotSprite() {
  const cellWidth = 80;
  const cellHeight = 96;
  const columns = 5;
  const rows = 5;
  const sheet = document.createElement('canvas');
  sheet.width = cellWidth * columns;
  sheet.height = cellHeight * rows;
  const ctx = sheet.getContext('2d');

  // Each pose specifies both feet, both knees, and the torso offset.
  const poses = [
    [34, 45, 44, 46, 40, 67, 73, 67, 73, 0],
    [34, 45, 44, 46, 40, 67, 73, 67, 73, 0],
    [34, 45, 44, 46, 40, 67, 73, 67, 73, 1],
    [21, 58, 25, 52, 57, 65, 72, 70, 73, 2],
    [27, 49, 39, 57, 51, 64, 67, 67, 73, 0],
    [39, 40, 52, 57, 51, 64, 60, 65, 73, -2],
    [53, 28, 58, 45, 59, 67, 66, 57, 72, 0],
    [57, 22, 57, 53, 25, 70, 73, 65, 72, 2],
    [49, 27, 51, 67, 39, 67, 73, 64, 67, 0],
    [40, 39, 51, 65, 52, 65, 73, 64, 60, -2],
    [28, 53, 59, 57, 58, 57, 72, 67, 66, 0],
    [27, 51, 55, 55, 59, 54, 69, 57, 64, -3],
    [33, 46, 53, 65, 51, 64, 73, 61, 70, 1],
  ];
  for (let index = 0; index < robotFrames.pull.length; index++) {
    const tuck = Math.min(index, 7);
    poses.push([40 + tuck, 50 + tuck, 43, 46 + tuck, 52 + tuck,
      63, 73 - tuck, 58, 69 - tuck, 2 + tuck]);
  }
  poses.push([26, 48, 46, 42, 53, 68, 73, 64, 73, 15]);

  function limb(color, width, points) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.stroke();
  }

  function panel(x, y, width, height, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  }

  poses.forEach(([backX, frontX, headX, backKneeX, frontKneeX, backKneeY, backY, frontKneeY, frontY, bob], index) => {
    ctx.save();
    ctx.translate(index % columns * cellWidth, Math.floor(index / columns) * cellHeight);
    const running = index >= 3 && index <= 10;
    const pulling = index >= robotFrames.pull[0] && index < robotFrames.mantle;
    const armSwing = running ? (frontX - backX) * -0.35 : index >= 11 ? 11 : 0;
    const gripY = 13 + (index - robotFrames.pull[0]) * 6.4;
    if (pulling) {
      limb('#344944', 6, [[40, 40 + bob], [53, (40 + bob + gripY) / 2], [64, gripY]]);
      panel(62, gripY - 3, 7, 5, 2, '#263833');
    }
    limb('#344944', 7, [[36, 51 + bob], [backKneeX, backKneeY], [backX, backY]]);
    panel(backX - 5, backY - 2, 15, 6, 2, '#263833');
    limb('#55736a', 7, [[44, 52 + bob], [frontKneeX, frontKneeY], [frontX, frontY]]);
    panel(frontX - 4, frontY - 2, 17, 6, 2, '#263833');
    panel(25, 32 + bob, 11, 22, 4, '#8b5738');
    panel(32, 31 + bob, 24, 25, 6, '#243735');
    panel(35, 33 + bob, 18, 20, 4, '#e1a44f');
    if (pulling) {
      limb('#55736a', 6, [[47, 40 + bob], [58, (40 + bob + gripY) / 2], [67, gripY]]);
      panel(65, gripY - 2, 8, 6, 2, '#334946');
    } else {
      limb('#334946', 6, [[47, 40 + bob], [45 + armSwing, 48 + bob], [50 + armSwing, 52 + bob]]);
    }
    limb('#314643', 3, [[headX, 15 + bob], [headX - 4, 7 + bob]]);
    panel(headX - 7, 5 + bob, 6, 6, 3, '#edb86a');
    panel(headX - 15, 14 + bob, 31, 22, 6, '#223737');
    panel(headX - 12, 16 + bob, 26, 17, 4, '#6f9488');
    panel(headX, 20 + bob, 13, 9, 3, '#233a3b');
    if (index !== 1) panel(headX + 6, 22 + bob, 4, 4, 1, '#b6ede0');
    ctx.restore();
  });

  const texture = new THREE.CanvasTexture(sheet);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(1 / columns, 1 / rows);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const width = cellWidth * pixelSize;
  const height = width * cellHeight / cellWidth;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.y = (77 / cellHeight - 0.5) * height;
  mesh.renderOrder = 12;

  return {
    mesh,
    show(frame) {
      texture.offset.set(frame % columns / columns, 1 - (Math.floor(frame / columns) + 1) / rows);
    },
  };
}
