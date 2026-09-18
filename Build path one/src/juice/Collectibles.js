import * as THREE from 'three';
import { applyCurvedWorld } from '../engine/CurvedWorldShader.js';

export class CollectiblesManager {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.animTime = 0;

    // Shared Geometries & Materials with Curved World Horizon Shader
    this.coinGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.08, 16);
    this.coinGeo.rotateX(Math.PI / 2);

    this.goldMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xffc400,
      metalness: 0.9,
      roughness: 0.18,
      emissive: 0xff9900,
      emissiveIntensity: 0.5
    }));

    this.platMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      metalness: 0.95,
      roughness: 0.12,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.55
    }));

    this.diamondGeo = new THREE.OctahedronGeometry(0.38, 0);
    this.diamondMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xe056fd,
      metalness: 0.4,
      roughness: 0.1,
      emissive: 0xc0392b,
      emissiveIntensity: 0.7
    }));

    this.ringGeo = new THREE.TorusGeometry(0.36, 0.09, 12, 24);
    this.ringMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xffe600,
      emissive: 0xff9900,
      emissiveIntensity: 0.9
    }));

    this.brakeGeo = new THREE.DodecahedronGeometry(0.36, 0);
    this.brakeMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xff7b00,
      emissive: 0xff4500,
      emissiveIntensity: 0.85
    }));

    // Magnet power-up state
    this.isMagnetActive = false;
    this.magnetDuration = 0;
  }

  activateMagnet(duration = 7.0) {
    this.isMagnetActive = true;
    this.magnetDuration = duration;
  }

  // Spawn pattern on a track chunk
  spawnPattern(chunk, lane, startZ) {
    const laneX = lane * 2.8;
    const roll = Math.random();

    if (roll < 0.16) {
      // Spawn Power-up: Magnet Ring or Chrono Brake
      const isRing = Math.random() > 0.5;
      const type = isRing ? 'RING' : 'BRAKE';
      const mesh = new THREE.Mesh(
        isRing ? this.ringGeo : this.brakeGeo,
        isRing ? this.ringMat : this.brakeMat
      );
      const baseY = 1.25;
      mesh.position.set(laneX, baseY, startZ - 10);
      mesh.castShadow = true;
      chunk.add(mesh);

      this.items.push({
        chunk,
        mesh,
        type,
        value: 0,
        lane,
        baseY,
        phase: Math.random() * Math.PI * 2,
        collected: false
      });
    } else {
      // Spawn Coin Run (Gold, Platinum, or Diamond)
      const count = 4;
      const spacing = 3.6;

      let coinType = 'GOLD';
      let value = 1;
      let mat = this.goldMat;
      let geo = this.coinGeo;

      if (roll > 0.85) {
        coinType = 'DIAMOND';
        value = 5;
        mat = this.diamondMat;
        geo = this.diamondGeo;
      } else if (roll > 0.60) {
        coinType = 'PLATINUM';
        value = 2;
        mat = this.platMat;
        geo = this.coinGeo;
      }

      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        const baseY = 0.85;
        mesh.position.set(laneX, baseY, startZ - i * spacing);
        mesh.castShadow = true;
        chunk.add(mesh);

        this.items.push({
          chunk,
          mesh,
          type: coinType,
          value,
          lane,
          baseY,
          phase: (i * 0.4) + Math.random() * 0.2,
          collected: false
        });
      }
    }
  }

  update(deltaTime, playerPos, onCollect) {
    this.animTime += deltaTime;

    // Update Magnet duration
    if (this.isMagnetActive) {
      this.magnetDuration -= deltaTime;
      if (this.magnetDuration <= 0) {
        this.isMagnetActive = false;
      }
    }

    const playerWorldX = playerPos.x;
    const playerWorldY = playerPos.y + 0.9;
    const playerWorldZ = playerPos.z;

    // Emissive glow pulse oscillation
    const glowPulse = 0.5 + Math.sin(this.animTime * 5.0) * 0.25;
    this.goldMat.emissiveIntensity = glowPulse;
    this.platMat.emissiveIntensity = glowPulse + 0.1;
    this.diamondMat.emissiveIntensity = glowPulse + 0.25;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      // Skip collected or orphan items
      if (item.collected || !item.chunk.parent) {
        if (!item.chunk.parent) {
          this.items.splice(i, 1);
        }
        continue;
      }

      // 1. Sin-wave Vertical Bobbing Animation
      item.mesh.position.y = item.baseY + Math.sin(this.animTime * 3.8 + item.phase) * 0.14;

      // 2. High-speed Spin & Subtle Nutation Tilt
      item.mesh.rotation.y += deltaTime * 3.8;
      item.mesh.rotation.z = Math.sin(this.animTime * 2.5 + item.phase) * 0.12;

      // World coordinates
      const worldZ = item.chunk.position.z + item.mesh.position.z;
      const worldX = item.mesh.position.x;
      const worldY = item.mesh.position.y;

      const dx = playerWorldX - worldX;
      const dy = playerWorldY - worldY;
      const dz = playerWorldZ - worldZ;
      const distSq = dx * dx + dy * dy + dz * dz;

      // 3. Magnetic Attraction (Dynamic curved pull)
      if (this.isMagnetActive && ['GOLD', 'PLATINUM', 'DIAMOND'].includes(item.type)) {
        if (distSq < 225) { // 15 meters radius
          const pullForce = deltaTime * 14.0;
          item.mesh.position.x += dx * pullForce;
          item.mesh.position.y += dy * pullForce;
          item.mesh.position.z += dz * pullForce;
        }
      }

      // 4. Collection Hitbox (approx 1.45 meters)
      if (distSq < 2.1) {
        item.collected = true;
        item.chunk.remove(item.mesh);

        if (onCollect) {
          onCollect(item, { x: worldX, y: worldY, z: worldZ });
        }
        this.items.splice(i, 1);
      } else if (worldZ > playerWorldZ + 12) {
        // Clean up items safely past the player
        item.chunk.remove(item.mesh);
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    this.items.forEach(item => {
      if (item.chunk) item.chunk.remove(item.mesh);
    });
    this.items = [];
    this.isMagnetActive = false;
  }
}
