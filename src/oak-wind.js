import { PlaneGeometry } from 'three';

export const oakWindPeriod = 2;

export function attachOakWind(mesh, phaseOffset = 0) {
  const { width, height } = mesh.geometry.parameters;
  mesh.geometry.dispose();
  mesh.geometry = new PlaneGeometry(width, height, 40, 32);
  mesh.geometry.computeBoundingSphere();
  mesh.geometry.boundingSphere.radius += width * 0.02;

  const phase = { value: 0 };
  const strength = { value: 0 };
  mesh.material.onBeforeCompile = shader => {
    shader.uniforms.oakWindPhase = phase;
    shader.uniforms.oakWindStrength = strength;
    shader.uniforms.oakWidth = { value: width };
    shader.vertexShader = `
      uniform float oakWindPhase;
      uniform float oakWindStrength;
      uniform float oakWidth;
    ` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      // Keep the roots and lower trunk fixed. The canopy bends and the tips flutter.
      float crown = smoothstep(0.30, 0.86, uv.y);
      float gust = sin(oakWindPhase - 1.7 * uv.y + 1.5 * uv.x);
      float flutter = sin(3.0 * oakWindPhase + 14.0 * uv.x - 9.0 * uv.y);
      float motion = oakWidth * oakWindStrength * crown;
      transformed.x += motion * (0.0095 * gust + 0.0020 * crown * flutter);
      transformed.y += motion * 0.0026 * sin(oakWindPhase + 3.5 * uv.x - uv.y);
    `);
  };

  return time => {
    strength.value = time === null ? 0 : 1;
    phase.value = time === null ? 0 : 2 * Math.PI * ((time + phaseOffset) % oakWindPeriod) / oakWindPeriod;
  };
}
