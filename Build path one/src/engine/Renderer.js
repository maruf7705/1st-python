import * as THREE from 'three';
import { PostProcessingManager } from './PostProcessing.js';

export class EngineRenderer {
  constructor(canvas) {
    this.canvas = canvas;

    // Create Three.js Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c16);
    this.scene.fog = new THREE.FogExp2(0x0a0c16, 0.012);

    // Camera: Behind-the-back 3D runner view
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 1000);
    this.camera.position.set(0, 4.2, 7.5);
    this.camera.lookAt(0, 1.6, -10);

    // Dynamic Camera Parameters
    this.targetCameraFov = 65;
    this.cameraShakeIntensity = 0;
    this.cameraShakeDuration = 0;
    this.speedMicroShake = 0;
    this.currentSpeedRatio = 1.0;
    this.targetRollAngle = 0;
    this.currentRollAngle = 0;

    // WebGL Renderer tuned for 144 FPS
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // High-DPI crispness
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35; // Rich neon HDR pop

    // Next-Gen Post Processing Pipeline (Bloom, Aberration, Radial Streaks, Film Grain)
    this.postProcessing = new PostProcessingManager(this.renderer, this.scene, this.camera);

    // Speed Lines 2D Overlay Canvas
    this.speedLinesCanvas = document.getElementById('speed-lines-canvas');
    this.speedLinesCtx = this.speedLinesCanvas ? this.speedLinesCanvas.getContext('2d') : null;
    this.speedLines = [];
    this.initSpeedLines();

    // Framerate Profiling (144 FPS Target)
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.fps = 144;
    this.fpsUpdateTimer = 0;

    window.addEventListener('resize', () => this.onWindowResize());
  }

  initSpeedLines() {
    if (!this.speedLinesCanvas) return;
    this.speedLinesCanvas.width = window.innerWidth;
    this.speedLinesCanvas.height = window.innerHeight;

    // Pool of radial speed streaks
    this.speedLines = [];
    const count = 35;
    for (let i = 0; i < count; i++) {
      this.speedLines.push({
        angle: Math.random() * Math.PI * 2,
        distance: 0.25 + Math.random() * 0.75, // from center (0 to 1)
        length: 0.08 + Math.random() * 0.18,
        speed: 1.2 + Math.random() * 2.0,
        alpha: 0.3 + Math.random() * 0.5,
        width: 1.5 + Math.random() * 2.5,
        isCyan: Math.random() > 0.4
      });
    }
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.postProcessing.setSize(width, height);

    if (this.speedLinesCanvas) {
      this.speedLinesCanvas.width = width;
      this.speedLinesCanvas.height = height;
    }
  }

  triggerShake(intensity = 0.25, duration = 0.3) {
    this.cameraShakeIntensity = intensity;
    this.cameraShakeDuration = duration;
  }

  triggerFlash(intensity = 1.0) {
    this.postProcessing.triggerFlash(intensity);
  }

  setRollAngle(targetAngle) {
    this.targetRollAngle = targetAngle;
  }

  setSpeedRatio(ratio = 1.0) {
    this.currentSpeedRatio = ratio;
    this.postProcessing.setSpeedRatio(ratio);
    // Micro-shake activates when speed exceeds base speed
    if (ratio > 1.1) {
      this.speedMicroShake = (ratio - 1.0) * 0.025;
    } else {
      this.speedMicroShake = 0;
    }
  }

  update(deltaTime) {
    // FPS Measurement
    this.frameCount++;
    this.fpsUpdateTimer += deltaTime;
    if (this.fpsUpdateTimer >= 0.5) {
      this.fps = Math.round((this.frameCount / this.fpsUpdateTimer));
      this.frameCount = 0;
      this.fpsUpdateTimer = 0;
    }

    // Dynamic FOV interpolation
    if (Math.abs(this.camera.fov - this.targetCameraFov) > 0.1) {
      this.camera.fov += (this.targetCameraFov - this.camera.fov) * deltaTime * 5;
      this.camera.updateProjectionMatrix();
    }

    // Dynamic Camera Roll (Dutch Angle banking in turns and wall runs)
    this.currentRollAngle += (this.targetRollAngle - this.currentRollAngle) * deltaTime * 8.0;
    this.camera.rotation.z = this.currentRollAngle;

    // Camera Shake Decay
    if (this.cameraShakeDuration > 0) {
      this.cameraShakeDuration -= deltaTime;
      const shakeX = (Math.random() - 0.5) * this.cameraShakeIntensity;
      const shakeY = (Math.random() - 0.5) * this.cameraShakeIntensity;
      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;
    }

    // Continuous Speed Micro-Vibration at high speeds
    if (this.speedMicroShake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.speedMicroShake;
      this.camera.position.y += (Math.random() - 0.5) * this.speedMicroShake;
    }

    // Render Speed Lines Overlay
    this.renderSpeedLines(deltaTime);
  }

  renderSpeedLines(deltaTime) {
    if (!this.speedLinesCtx || !this.speedLinesCanvas) return;

    const ctx = this.speedLinesCtx;
    const w = this.speedLinesCanvas.width;
    const h = this.speedLinesCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Only render when moving fast (speed ratio > 1.1)
    if (this.currentSpeedRatio < 1.1) return;

    const centerX = w * 0.5;
    const centerY = h * 0.55;
    const maxRadius = Math.sqrt(w * w + h * h) * 0.5;
    const intensity = Math.min(1.0, (this.currentSpeedRatio - 1.1) / 0.6);

    ctx.save();
    for (const line of this.speedLines) {
      line.distance += line.speed * deltaTime * this.currentSpeedRatio;
      if (line.distance > 1.0) {
        line.distance = 0.2 + Math.random() * 0.2;
        line.angle = Math.random() * Math.PI * 2;
      }

      const r1 = line.distance * maxRadius;
      const r2 = (line.distance + line.length) * maxRadius;

      const cos = Math.cos(line.angle);
      const sin = Math.sin(line.angle);

      const x1 = centerX + cos * r1;
      const y1 = centerY + sin * r1;
      const x2 = centerX + cos * r2;
      const y2 = centerY + sin * r2;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);

      const alpha = line.alpha * intensity * (line.distance > 0.8 ? (1.0 - line.distance) * 5 : 1.0);
      ctx.strokeStyle = line.isCyan
        ? `rgba(100, 210, 255, ${alpha})`
        : `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = line.width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  render(deltaTime = 0.016) {
    this.postProcessing.render(deltaTime);
  }
}
