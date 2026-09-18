import * as THREE from 'three';

// Global uniforms shared across all materials for synchronized horizon curvature
export const curvedWorldUniforms = {
  curvature: { value: 0.0012 }, // Vertical drop curvature
  lateralBend: { value: 0.0003 }, // Lateral S-curve bend
  waveAmp: { value: 0.8 }, // Undulation hills
  waveFreq: { value: 0.025 },
  cameraZ: { value: 0.0 },
  time: { value: 0.0 }
};

export function updateCurvedWorld(cameraZ, deltaTime = 0.016) {
  curvedWorldUniforms.cameraZ.value = -cameraZ;
  curvedWorldUniforms.time.value += deltaTime;
}

export function applyCurvedWorld(material) {
  if (!material) return;

  const previousCompile = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    if (previousCompile) {
      previousCompile(shader, renderer);
    }

    shader.uniforms.uCurvature = curvedWorldUniforms.curvature;
    shader.uniforms.uLateralBend = curvedWorldUniforms.lateralBend;
    shader.uniforms.uWaveAmp = curvedWorldUniforms.waveAmp;
    shader.uniforms.uWaveFreq = curvedWorldUniforms.waveFreq;
    shader.uniforms.uCameraZ = curvedWorldUniforms.cameraZ;
    shader.uniforms.uTime = curvedWorldUniforms.time;

    // Inject uniforms at top of vertex shader
    shader.vertexShader = `
      uniform float uCurvature;
      uniform float uLateralBend;
      uniform float uWaveAmp;
      uniform float uWaveFreq;
      uniform float uCameraZ;
      uniform float uTime;
    \n` + shader.vertexShader;

    // Replace project_vertex with advanced curved world calculation
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 worldPos = modelMatrix * vec4( transformed, 1.0 );
      
      // Calculate distance ahead of camera along track (-Z is forward)
      float distZ = max( 0.0, -worldPos.z - uCameraZ );
      
      // 1. Dynamic downward vertical horizon curvature (Subway Surfers effect)
      worldPos.y -= distZ * distZ * uCurvature;
      
      // 2. Subtle organic lateral banking (subtle S-turns in the distance)
      worldPos.x += sin(distZ * uWaveFreq * 0.7 + uTime * 0.2) * (distZ * distZ * uLateralBend * 0.35);

      // 3. Gentle roller-coaster undulating crests for deep horizon depth
      worldPos.y += sin(distZ * uWaveFreq) * (distZ * 0.025) * uWaveAmp;
      
      vec4 mvPosition = viewMatrix * worldPos;
      gl_Position = projectionMatrix * mvPosition;
      `
    );
  };

  material.needsUpdate = true;
  return material;
}
