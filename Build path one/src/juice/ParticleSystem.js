import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.maxParticles = 2400;
    this.particles = [];

    // Shared BufferGeometry for zero-allocation 144 FPS rendering
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxParticles * 3);
    const colors = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Custom circular glowing particle texture generated via procedural canvas
    const particleTexture = this.createGlowTexture();

    const mat = new THREE.PointsMaterial({
      size: 0.48,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);

    // Selected custom trail color (can be customized via Shop)
    this.trailColor = 0x00f0ff;

    // Initialize particle pool
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0, y: -9999, z: 0,
        vx: 0, vy: 0, vz: 0,
        r: 1, g: 1, b: 1,
        life: 0,
        maxLife: 1,
        gravity: -9.8,
        drag: 0.98,
        size: 1.0,
        type: 'standard'
      });
    }

    this.ambientTimer = 0;
  }

  setTrailColor(hex) {
    this.trailColor = hex;
  }

  createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  // Dramatic burst for coin collection & explosions
  emit(x, y, z, count = 20, colorHex = 0xffc400, speed = 5.0) {
    const col = new THREE.Color(colorHex);

    for (let i = 0; i < count; i++) {
      const p = this.particles.find(part => !part.active);
      if (!p) break;

      p.active = true;
      p.x = x + (Math.random() - 0.5) * 0.2;
      p.y = y + (Math.random() - 0.5) * 0.2;
      p.z = z + (Math.random() - 0.5) * 0.2;

      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.5) * Math.PI;
      const vel = (0.6 + Math.random() * 0.8) * speed;

      p.vx = Math.cos(angle) * Math.cos(elevation) * vel;
      p.vy = Math.sin(elevation) * vel + 2.0;
      p.vz = Math.sin(angle) * Math.cos(elevation) * vel;

      p.r = Math.min(1.0, col.r + (Math.random() - 0.5) * 0.15);
      p.g = Math.min(1.0, col.g + (Math.random() - 0.5) * 0.15);
      p.b = Math.min(1.0, col.b + (Math.random() - 0.5) * 0.15);

      p.life = 0;
      p.maxLife = 0.45 + Math.random() * 0.35;
      p.gravity = -11.0;
      p.drag = 0.94;
      p.type = 'burst';
    }
  }

  // Shockwave ring for jump landing and ground slams
  emitShockwave(x, y, z, colorHex = 0x00f0ff, count = 30, radiusSpeed = 7.0) {
    const col = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const p = this.particles.find(part => !part.active);
      if (!p) break;

      p.active = true;
      p.x = x;
      p.y = y + 0.05;
      p.z = z;

      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      p.vx = Math.cos(angle) * radiusSpeed;
      p.vy = 0.4 + Math.random() * 0.6;
      p.vz = Math.sin(angle) * radiusSpeed;

      p.r = col.r;
      p.g = col.g;
      p.b = col.b;

      p.life = 0;
      p.maxLife = 0.35 + Math.random() * 0.15;
      p.gravity = -2.0;
      p.drag = 0.91;
      p.type = 'shockwave';
    }
  }

  // Intense supersonic air dash thrust cone
  emitAirDashThrust(x, y, z, colorHex = 0x60a5fa) {
    const col = new THREE.Color(colorHex);
    for (let i = 0; i < 40; i++) {
      const p = this.particles.find(part => !part.active);
      if (!p) break;

      p.active = true;
      p.x = x + (Math.random() - 0.5) * 0.4;
      p.y = y + 0.8 + (Math.random() - 0.5) * 0.4;
      p.z = z + 0.3;

      const spread = (Math.random() - 0.5) * 1.5;
      p.vx = spread * 1.8;
      p.vy = (Math.random() - 0.5) * 1.5;
      p.vz = 14.0 + Math.random() * 8.0; // blast backwards

      p.r = col.r;
      p.g = col.g;
      p.b = col.b;

      p.life = 0;
      p.maxLife = 0.3 + Math.random() * 0.2;
      p.gravity = 0;
      p.drag = 0.95;
      p.type = 'dash';
    }
  }

  // Wall-running electric grind sparks
  emitWallRunSparks(x, y, z, side = -1) {
    for (let i = 0; i < 5; i++) {
      const p = this.particles.find(part => !part.active);
      if (!p) break;

      p.active = true;
      p.x = x + side * 0.45;
      p.y = y + 0.4 + Math.random() * 0.6;
      p.z = z + (Math.random() - 0.5) * 0.2;

      p.vx = -side * (2.0 + Math.random() * 3.0);
      p.vy = 2.0 + Math.random() * 3.5;
      p.vz = 8.0 + Math.random() * 6.0;

      // High voltage blue/cyan and white sparks
      if (Math.random() > 0.3) {
        p.r = 0.0; p.g = 0.95; p.b = 1.0;
      } else {
        p.r = 1.0; p.g = 1.0; p.b = 1.0;
      }

      p.life = 0;
      p.maxLife = 0.25 + Math.random() * 0.2;
      p.gravity = -18.0;
      p.drag = 0.93;
      p.type = 'spark';
    }
  }

  // Persistent wind & light trails behind player at speed
  emitSpeedTrail(playerX, playerY, playerZ, speedRatio = 1.0) {
    if (speedRatio < 1.05) return;
    const count = Math.floor(2 + (speedRatio - 1.0) * 4);
    const col = new THREE.Color(this.trailColor);

    for (let i = 0; i < count; i++) {
      const p = this.particles.find(part => !part.active);
      if (!p) break;

      p.active = true;
      p.x = playerX + (Math.random() - 0.5) * 0.6;
      p.y = playerY + 0.2 + Math.random() * 0.9;
      p.z = playerZ + 0.4 + Math.random() * 0.3;

      p.vx = (Math.random() - 0.5) * 0.6;
      p.vy = (Math.random() - 0.5) * 0.4;
      p.vz = 4.0 + speedRatio * 4.0;

      p.r = col.r;
      p.g = col.g;
      p.b = col.b;

      p.life = 0;
      p.maxLife = 0.28 + Math.random() * 0.16;
      p.gravity = 0;
      p.drag = 0.98;
      p.type = 'trail';
    }
  }

  // Slide sparks
  emitSlideSparks(x, y, z) {
    for (let i = 0; i < 5; i++) {
      const p = this.particles.find(part => !part.active);
      if (!p) break;

      p.active = true;
      p.x = x + (Math.random() - 0.5) * 0.4;
      p.y = y + 0.05;
      p.z = z + (Math.random() - 0.5) * 0.2;

      p.vx = (Math.random() - 0.5) * 4.0;
      p.vy = 1.8 + Math.random() * 3.0;
      p.vz = 6.5 + Math.random() * 4.5;

      if (Math.random() > 0.4) {
        p.r = 0.1; p.g = 0.95; p.b = 1.0;
      } else {
        p.r = 1.0; p.g = 0.85; p.b = 0.2;
      }

      p.life = 0;
      p.maxLife = 0.26 + Math.random() * 0.2;
      p.gravity = -16.0;
      p.drag = 0.92;
      p.type = 'spark';
    }
  }

  // Ambient world particles drifting through the scene based on biome
  updateAmbient(deltaTime, playerZ, biomeName) {
    this.ambientTimer += deltaTime;
    if (this.ambientTimer < 0.06) return;
    this.ambientTimer = 0;

    for (let i = 0; i < 3; i++) {
      const p = this.particles.find(part => !part.active);
      if (!p) break;

      p.active = true;
      p.x = (Math.random() - 0.5) * 16.0;
      p.y = 0.5 + Math.random() * 6.0;
      p.z = playerZ - 20 - Math.random() * 35;

      p.life = 0;
      p.maxLife = 2.5 + Math.random() * 2.0;
      p.gravity = 0;
      p.drag = 1.0;
      p.type = 'ambient';

      if (biomeName.includes('City')) {
        p.vx = (Math.random() - 0.5) * 0.4;
        p.vy = 0.2 + Math.random() * 0.3;
        p.vz = (Math.random() - 0.5) * 0.4;
        p.r = 0.2; p.g = 0.9; p.b = 1.0;
      } else if (biomeName.includes('Mountain')) {
        p.vx = (Math.random() - 0.5) * 0.6;
        p.vy = -0.3 - Math.random() * 0.4;
        p.vz = (Math.random() - 0.5) * 0.6;
        p.r = 1.0; p.g = 0.65; p.b = 0.25;
      } else {
        p.vx = (Math.random() - 0.5) * 0.8;
        p.vy = (Math.random() - 0.5) * 0.3;
        p.vz = (Math.random() - 0.5) * 0.8;
        p.r = 0.7; p.g = 0.9; p.b = 1.0;
      }
    }
  }

  update(deltaTime) {
    const posAttr = this.points.geometry.attributes.position;
    const colAttr = this.points.geometry.attributes.color;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];

      if (p.active) {
        p.life += deltaTime;
        if (p.life >= p.maxLife) {
          p.active = false;
          posAttr.setXYZ(i, 0, -9999, 0);
          continue;
        }

        p.vx *= p.drag;
        p.vz *= p.drag;
        p.vy += p.gravity * deltaTime;

        p.x += p.vx * deltaTime;
        p.y += p.vy * deltaTime;
        p.z += p.vz * deltaTime;

        const progress = p.life / p.maxLife;
        let alpha = 1.0 - progress;
        if (p.type === 'ambient') {
          alpha = Math.sin(progress * Math.PI);
        }

        posAttr.setXYZ(i, p.x, p.y, p.z);
        colAttr.setXYZ(i, p.r * alpha, p.g * alpha, p.b * alpha);
      } else {
        posAttr.setXYZ(i, 0, -9999, 0);
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}
