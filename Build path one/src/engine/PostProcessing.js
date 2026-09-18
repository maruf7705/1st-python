import * as THREE from 'three';

/**
 * High-Performance Custom Post-Processing Pipeline for 144Hz WebGL.
 * Features:
 * - HDR Multi-tap Bloom (Neon Glow)
 * - Radial Chromatic Aberration (Speed Dispersion)
 * - Dynamic High-Speed Lens Vignette & Radial Blur
 * - ACES Filmic Contrast & Tone Curve Enhancer
 */
export class PostProcessingManager {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);

    // 1. Scene Color Target (RGBA16F or RGBA8)
    this.sceneTarget = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false
    });

    // 2. Downscaled Bloom Target for high performance (half resolution)
    this.bloomTarget = new THREE.WebGLRenderTarget(
      Math.floor((width * pixelRatio) / 2),
      Math.floor((height * pixelRatio) / 2),
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType
      }
    );

    // Orthographic Camera & Fullscreen Quad for multi-pass shaders
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeometry = new THREE.PlaneGeometry(2, 2);

    // Shader 1: Brightness High-Pass Extract & Bloom Blur
    this.bloomMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 0.65 },
        uIntensity: { value: 1.4 },
        uResolution: { value: new THREE.Vector2(width * pixelRatio, height * pixelRatio) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uThreshold;
        uniform float uIntensity;
        uniform vec2 uResolution;
        varying vec2 vUv;

        void main() {
          vec2 texel = 1.5 / uResolution;
          vec4 color = texture2D(tDiffuse, vUv);

          // 9-tap separable Gaussian approximation
          vec4 sum = vec4(0.0);
          sum += texture2D(tDiffuse, vUv + vec2(-2.0, -2.0) * texel) * 0.06;
          sum += texture2D(tDiffuse, vUv + vec2( 0.0, -2.0) * texel) * 0.09;
          sum += texture2D(tDiffuse, vUv + vec2( 2.0, -2.0) * texel) * 0.06;

          sum += texture2D(tDiffuse, vUv + vec2(-2.0,  0.0) * texel) * 0.09;
          sum += color * 0.40;
          sum += texture2D(tDiffuse, vUv + vec2( 2.0,  0.0) * texel) * 0.09;

          sum += texture2D(tDiffuse, vUv + vec2(-2.0,  2.0) * texel) * 0.06;
          sum += texture2D(tDiffuse, vUv + vec2( 0.0,  2.0) * texel) * 0.09;
          sum += texture2D(tDiffuse, vUv + vec2( 2.0,  2.0) * texel) * 0.06;

          // Luminance extraction
          float lum = dot(sum.rgb, vec3(0.2126, 0.7152, 0.0722));
          float factor = clamp((lum - uThreshold) / (1.0 - uThreshold + 0.001), 0.0, 1.0);

          gl_FragColor = vec4(sum.rgb * factor * uIntensity, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });
    this.bloomMesh = new THREE.Mesh(this.quadGeometry, this.bloomMaterial);
    this.bloomScene = new THREE.Scene();
    this.bloomScene.add(this.bloomMesh);

    // Shader 2: Composite Pass with Chromatic Aberration, Speed Radial Blur & Tone Contrast
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uSpeedRatio: { value: 1.0 },
        uAberration: { value: 0.003 },
        uRadialWarp: { value: 0.0 },
        uTime: { value: 0.0 },
        uVignetteIntensity: { value: 0.28 },
        uHitFlash: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(width * pixelRatio, height * pixelRatio) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tScene;
        uniform sampler2D tBloom;
        uniform float uSpeedRatio;
        uniform float uAberration;
        uniform float uRadialWarp;
        uniform float uTime;
        uniform float uVignetteIntensity;
        uniform float uHitFlash;
        uniform vec2 uResolution;
        varying vec2 vUv;

        void main() {
          vec2 center = vec2(0.5, 0.52);
          vec2 toCenter = vUv - center;
          float dist = length(toCenter);

          // Dynamic chromatic aberration scaling with speed
          float speedFactor = max(0.0, uSpeedRatio - 1.0);
          float caOffset = (uAberration + speedFactor * 0.007) * (dist * dist);

          // Radial UV sample for RGB split
          vec2 uvR = vUv - toCenter * caOffset;
          vec2 uvG = vUv;
          vec2 uvB = vUv + toCenter * caOffset;

          // Dynamic radial speed streak blending
          vec4 sceneCol = vec4(0.0);
          if (speedFactor > 0.15) {
            float blurSamples = 4.0;
            float blurWeight = 1.0 / blurSamples;
            for (float i = 0.0; i < 4.0; i++) {
              float stepDist = (i / 4.0) * speedFactor * 0.022;
              vec2 sampleUv = vUv - toCenter * stepDist;
              sceneCol += texture2D(tScene, sampleUv) * blurWeight;
            }
          } else {
            float r = texture2D(tScene, uvR).r;
            float g = texture2D(tScene, uvG).g;
            float b = texture2D(tScene, uvB).b;
            sceneCol = vec4(r, g, b, 1.0);
          }

          // Sample Bloom glowing radiance
          vec4 bloomCol = texture2D(tBloom, vUv);

          // Screen Blend mode for glowing neon bloom
          vec3 finalRgb = 1.0 - (1.0 - sceneCol.rgb) * (1.0 - bloomCol.rgb * 0.85);

          // Smooth Cinematic Vignette
          float vignette = 1.0 - smoothstep(0.4, 0.98, dist) * uVignetteIntensity;
          finalRgb *= vignette;

          // Dynamic Hit/Near-Miss Flash
          if (uHitFlash > 0.0) {
            finalRgb = mix(finalRgb, vec3(1.0, 0.95, 0.8), uHitFlash * 0.45);
          }

          // Subtle film grain
          float grain = (fract(sin(dot(vUv * uResolution, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.022;
          finalRgb += grain;

          gl_FragColor = vec4(finalRgb, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });
    this.compositeMesh = new THREE.Mesh(this.quadGeometry, this.compositeMaterial);
    this.compositeScene = new THREE.Scene();
    this.compositeScene.add(this.compositeMesh);

    this.hitFlashTimer = 0;
    this.totalTime = 0;
  }

  setSize(width, height) {
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    const rw = width * pixelRatio;
    const rh = height * pixelRatio;

    this.sceneTarget.setSize(rw, rh);
    this.bloomTarget.setSize(Math.floor(rw / 2), Math.floor(rh / 2));

    this.bloomMaterial.uniforms.uResolution.value.set(rw, rh);
    this.compositeMaterial.uniforms.uResolution.value.set(rw, rh);
  }

  triggerFlash(intensity = 1.0) {
    this.hitFlashTimer = intensity;
  }

  setSpeedRatio(ratio) {
    this.compositeMaterial.uniforms.uSpeedRatio.value = ratio;
  }

  render(deltaTime) {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.totalTime += deltaTime;
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - deltaTime * 4.5);
    }
    this.compositeMaterial.uniforms.uHitFlash.value = this.hitFlashTimer;
    this.compositeMaterial.uniforms.uTime.value = this.totalTime;

    // PASS 1: Render full 3D scene into sceneTarget
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // PASS 2: Downsample & Extract bright regions for HDR Bloom
    this.bloomMaterial.uniforms.tDiffuse.value = this.sceneTarget.texture;
    this.renderer.setRenderTarget(this.bloomTarget);
    this.renderer.clear();
    this.renderer.render(this.bloomScene, this.postCamera);

    // PASS 3: Composite to Screen with Chromatic Aberration, Radial Streak Blur & Tone Curve
    this.compositeMaterial.uniforms.tScene.value = this.sceneTarget.texture;
    this.compositeMaterial.uniforms.tBloom.value = this.bloomTarget.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.compositeScene, this.postCamera);
  }

  dispose() {
    this.sceneTarget.dispose();
    this.bloomTarget.dispose();
    this.quadGeometry.dispose();
    this.bloomMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
