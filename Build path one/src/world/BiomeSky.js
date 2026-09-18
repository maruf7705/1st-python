import * as THREE from 'three';
import { applyCurvedWorld } from '../engine/CurvedWorldShader.js';

export class BiomeSky {
  constructor() {
    this.name = 'Stratosphere Sky';

    // Materials with Curved World Horizon Shader
    this.skyRoadMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xf0f9ff, // Crisp white crystal skyway
      roughness: 0.12,
      metalness: 0.75,
      transparent: true,
      opacity: 0.94
    }));
    this.cloudBedMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      transparent: true,
      opacity: 0.6
    }));
    this.cloudMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      transparent: true,
      opacity: 0.78
    }));
    this.railMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x0071e3, // Apple Action Blue guide rails
      emissive: 0x0071e3,
      emissiveIntensity: 0.95
    }));
    this.railGlowMat = applyCurvedWorld(new THREE.MeshBasicMaterial({
      color: 0x64d2ff,
      transparent: true,
      opacity: 0.45
    }));
    this.lightningMat = applyCurvedWorld(new THREE.MeshBasicMaterial({
      color: 0x64d2ff, // Apple Sky Cyan electric bolt
      transparent: true,
      opacity: 0.98
    }));
    this.warningMat = applyCurvedWorld(new THREE.MeshBasicMaterial({
      color: 0xff3b30, // Apple Red warning ring
      transparent: true,
      opacity: 0.9
    }));
  }

  createChunk(chunkLength = 50) {
    const chunk = new THREE.Group();
    chunk.userData.obstacles = [];
    chunk.userData.lightningHazards = [];

    // 1. Cloud Stratum Bed Floor (Extends 140 meters wide beneath track)
    const cloudFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(140, chunkLength),
      this.cloudBedMat
    );
    cloudFloor.rotation.x = -Math.PI / 2;
    cloudFloor.position.set(0, -6.5, -chunkLength / 2);
    chunk.add(cloudFloor);

    // 2. Suspended Crystal Track (9.6m wide)
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, chunkLength),
      this.skyRoadMat
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -chunkLength / 2;
    road.receiveShadow = true;
    chunk.add(road);

    // 3. Apple Action Blue Guide Rails with Glowing Aura
    const leftRail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, chunkLength, 8),
      this.railMat
    );
    leftRail.rotation.x = Math.PI / 2;
    leftRail.position.set(-4.8, 0.45, -chunkLength / 2);
    chunk.add(leftRail);

    const rightRail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, chunkLength, 8),
      this.railMat
    );
    rightRail.rotation.x = Math.PI / 2;
    rightRail.position.set(4.8, 0.45, -chunkLength / 2);
    chunk.add(rightRail);

    // 4. Volumetric Cloud Clusters floating beneath and around the track
    for (let i = 0; i < 7; i++) {
      const cloudGroup = new THREE.Group();
      const cloudSize = 5 + Math.random() * 4.5;
      const xSide = (Math.random() > 0.5 ? 1 : -1) * (7 + Math.random() * 9);

      for (let puff = 0; puff < 4; puff++) {
        const p = new THREE.Mesh(
          new THREE.SphereGeometry(cloudSize * (0.6 + Math.random() * 0.4), 8, 8),
          this.cloudMat
        );
        p.position.set(
          (Math.random() - 0.5) * 4.5,
          (Math.random() - 0.5) * 1.8,
          (Math.random() - 0.5) * 4.5
        );
        cloudGroup.add(p);
      }

      cloudGroup.position.set(xSide, -3.5 - Math.random() * 3, -i * 7.5 - 4);
      chunk.add(cloudGroup);
    }

    return chunk;
  }

  spawnObstacle(chunk, lane, zOffset, type) {
    const laneX = lane * 2.8;

    if (type === 'LIGHTNING') {
      // Sky Lightning Strike Hazard ("আকাশ থেকে বিজলি পড়বে")
      const lightningHazard = new THREE.Group();
      lightningHazard.position.set(laneX, 0, zOffset);

      // 1. Ground Telegraph Warning Ring (Apple Red)
      const warningRing = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 1.4, 24),
        this.warningMat
      );
      warningRing.rotation.x = -Math.PI / 2;
      warningRing.position.y = 0.05;
      lightningHazard.add(warningRing);

      // 2. Vertical Lightning Bolt (hidden until strike)
      const boltGroup = new THREE.Group();
      boltGroup.visible = false;

      const boltCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.28, 28, 6),
        this.lightningMat
      );
      boltCore.position.y = 14;
      boltGroup.add(boltCore);

      const boltAura = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.95, 28, 6),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.4
        })
      );
      boltAura.position.y = 14;
      boltGroup.add(boltAura);

      // Ground scorch ring
      const scorch = new THREE.Mesh(
        new THREE.CircleGeometry(1.2, 16),
        new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.7 })
      );
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.y = 0.03;
      boltGroup.add(scorch);

      lightningHazard.add(boltGroup);
      chunk.add(lightningHazard);

      const box = new THREE.Box3();
      box.setFromObject(boltCore);

      const hazardData = {
        mesh: lightningHazard,
        warningRing,
        boltGroup,
        box,
        type: 'LIGHTNING',
        lane,
        z: zOffset,
        phase: 'TELEGRAPH',
        timer: 0,
        strikeDuration: 0.65,
        hasDamaged: false
      };

      chunk.userData.obstacles.push(hazardData);
      chunk.userData.lightningHazards.push(hazardData);
    } else if (type === 'CLOUD_HURDLE') {
      // Floating Plasma Hurdle (Jump over)
      const barrier = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.8, 0.3),
        new THREE.MeshStandardMaterial({
          color: 0x0071e3,
          emissive: 0x0071e3,
          emissiveIntensity: 0.9
        })
      );
      barrier.position.set(laneX, 0.4, zOffset);
      barrier.castShadow = true;
      chunk.add(barrier);

      const box = new THREE.Box3();
      box.setFromObject(barrier);
      chunk.userData.obstacles.push({
        mesh: barrier,
        box,
        type: 'HURDLE',
        lane,
        z: zOffset,
        requiresJump: true
      });
    } else {
      // High Voltage Cloud Grid (Slide under)
      const slideArch = new THREE.Group();
      slideArch.position.set(laneX, 0, zOffset);

      const topBar = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.8, 0.3),
        new THREE.MeshStandardMaterial({
          color: 0xbf5af2, // Apple Purple
          emissive: 0xaf52de,
          emissiveIntensity: 0.9
        })
      );
      topBar.position.y = 1.6;
      slideArch.add(topBar);

      chunk.add(slideArch);

      const box = new THREE.Box3(
        new THREE.Vector3(laneX - 1.2, 1.1, zOffset - 0.2),
        new THREE.Vector3(laneX + 1.2, 2.2, zOffset + 0.2)
      );
      chunk.userData.obstacles.push({
        mesh: slideArch,
        box,
        type: 'SLIDE',
        lane,
        z: zOffset,
        requiresSlide: true
      });
    }
  }

  updateChunk(chunk, deltaTime, playerZ, audioSynth) {
    if (!chunk.userData.lightningHazards) return;

    chunk.userData.lightningHazards.forEach(h => {
      const distanceToPlayer = Math.abs((chunk.position.z + h.z) - playerZ);

      if (distanceToPlayer < 40 && h.phase === 'TELEGRAPH') {
        h.timer += deltaTime;
        const scale = 1 + Math.sin(h.timer * 20) * 0.3;
        h.warningRing.scale.set(scale, scale, 1);

        if (distanceToPlayer < 22 || h.timer > 1.1) {
          h.phase = 'STRIKE';
          h.boltGroup.visible = true;
          h.warningRing.visible = false;
          if (audioSynth) {
            audioSynth.playThunder();
          }
        }
      } else if (h.phase === 'STRIKE') {
        h.timer += deltaTime;
        h.boltGroup.scale.x = 1 + (Math.random() - 0.5) * 0.4;
        h.box.setFromObject(h.boltGroup);

        if (h.timer > h.strikeDuration) {
          h.phase = 'DISCHARGE';
          h.boltGroup.visible = false;
        }
      }
    });
  }
}
