import * as THREE from 'three';
import { applyCurvedWorld } from '../engine/CurvedWorldShader.js';

export class BiomeCity {
  constructor() {
    this.name = 'NEO-APEX CITY';

    // Premium Cyber-Luminescent Aesthetics with Curved World Shader
    this.roadMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xf8fafc, // Clean pearlescent white track
      roughness: 0.22,
      metalness: 0.18
    }));
    this.laneStripeMat = applyCurvedWorld(new THREE.MeshBasicMaterial({
      color: 0x00f0ff // Glowing cyan lane marker stripes
    }));
    this.curbMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.95
    }));
    this.groundMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x090d18,
      roughness: 0.85
    }));
    this.barrierMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xff3b30,
      metalness: 0.4,
      roughness: 0.3
    }));
    this.energyBeamMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.3,
      transparent: true,
      opacity: 0.88
    }));
    this.buildingMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x182032,
      roughness: 0.7
    }));
    this.windowMatCyan = applyCurvedWorld(new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    this.windowMatGold = applyCurvedWorld(new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    this.windowMatPink = applyCurvedWorld(new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
    this.hologramMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.75
    }));
    this.hazardWarningMat = applyCurvedWorld(new THREE.MeshBasicMaterial({
      color: 0xffb300,
      transparent: true,
      opacity: 0.4
    }));

    // Oncoming Cyber Train Materials
    this.trainBodyMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.2
    }));
    this.trainHeadlightMat = applyCurvedWorld(new THREE.MeshBasicMaterial({
      color: 0xffffff
    }));
    this.trainAccentMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 1.2
    }));
  }

  createChunk(chunkLength = 50) {
    const chunk = new THREE.Group();
    chunk.userData.obstacles = [];
    chunk.userData.movingTrains = [];

    // Outer Ground (Dark abyss to contrast the luminous white track)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, chunkLength),
      this.groundMat
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -chunkLength / 2);
    chunk.add(ground);

    // Pearlescent White Road Track (3 lanes)
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, chunkLength),
      this.roadMat
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -chunkLength / 2;
    road.receiveShadow = true;
    chunk.add(road);

    // Glowing Cyan Lane Stripes (2 divider lines: x = -1.4, x = +1.4)
    [-1.4, 1.4].forEach(x => {
      for (let s = 0; s < 5; s++) {
        const stripe = new THREE.Mesh(
          new THREE.PlaneGeometry(0.12, 4.2),
          this.laneStripeMat
        );
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(x, 0.02, -s * 10 - 5);
        chunk.add(stripe);
      }
    });

    // Glowing Neon Edge Curbs
    const leftCurb = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.22, chunkLength),
      this.curbMat
    );
    leftCurb.position.set(-4.8, 0.11, -chunkLength / 2);
    chunk.add(leftCurb);

    const rightCurb = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.22, chunkLength),
      this.curbMat
    );
    rightCurb.position.set(4.8, 0.11, -chunkLength / 2);
    chunk.add(rightCurb);

    // Cyber Skyscraper Silhouettes with Glowing Windows
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const bWidth = 8 + Math.random() * 6;
        const bHeight = 30 + Math.random() * 32;
        const buildingGroup = new THREE.Group();
        buildingGroup.position.set(
          side * (10 + bWidth / 2),
          0,
          -i * 12 - 6
        );

        const building = new THREE.Mesh(
          new THREE.BoxGeometry(bWidth, bHeight, 10),
          this.buildingMat
        );
        building.position.y = bHeight / 2;
        building.castShadow = true;
        buildingGroup.add(building);

        // Glowing Window Clusters on building face
        const windowMats = [this.windowMatCyan, this.windowMatGold, this.windowMatPink];
        for (let row = 0; row < 5; row++) {
          const wMat = windowMats[Math.floor(Math.random() * windowMats.length)];
          const win = new THREE.Mesh(
            new THREE.PlaneGeometry(bWidth * 0.75, 0.5),
            wMat
          );
          win.position.set(0, 6 + row * 5.5, -side * 5.01);
          if (side === 1) win.rotation.y = Math.PI;
          buildingGroup.add(win);
        }

        chunk.add(buildingGroup);
      }
    }

    // Overhead Cyber Speed Arch with Dynamic Glow Ring
    const arch = new THREE.Group();
    arch.position.set(0, 0, -chunkLength / 2);

    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.5, 0.4), this.buildingMat);
    postL.position.set(-5.0, 2.75, 0);
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.5, 0.4), this.buildingMat);
    postR.position.set(5.0, 2.75, 0);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.5, 0.4), this.curbMat);
    crossbar.position.set(0, 5.5, 0);

    // Holographic Cyber Sign on Crossbar
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 1.2),
      this.hologramMat
    );
    sign.position.set(0, 4.4, 0);
    arch.add(postL, postR, crossbar, sign);
    chunk.add(arch);

    return chunk;
  }

  spawnObstacle(chunk, lane, zOffset, type) {
    const laneX = lane * 2.8;

    // Crisp hazard warning indicator line for static barriers
    if (type === 'HURDLE') {
      const warningStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 0.22),
        this.hazardWarningMat
      );
      warningStrip.rotation.x = -Math.PI / 2;
      warningStrip.position.set(laneX, 0.02, zOffset + 2.5);
      chunk.add(warningStrip);
    }

    if (type === 'TRAIN') {
      // Oncoming Cyber-Train Hazard (Moving toward runner)
      const train = new THREE.Group();
      train.position.set(laneX, 1.35, zOffset);

      // Main aerodynamic train carriage (11m long)
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 2.4, 11),
        this.trainBodyMat
      );
      body.castShadow = true;
      train.add(body);

      // Glowing Neon Side Streaks
      const stripeL = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.16, 11.1),
        this.trainAccentMat
      );
      stripeL.position.set(-1.16, 0.2, 0);
      const stripeR = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.16, 11.1),
        this.trainAccentMat
      );
      stripeR.position.set(1.16, 0.2, 0);
      train.add(stripeL, stripeR);

      // High-Beam Front Headlights (facing toward the player: +Z)
      const headlightL = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.25, 0.1),
        this.trainHeadlightMat
      );
      headlightL.position.set(-0.65, -0.4, 5.55);

      const headlightR = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.25, 0.1),
        this.trainHeadlightMat
      );
      headlightR.position.set(0.65, -0.4, 5.55);

      train.add(headlightL, headlightR);
      chunk.add(train);

      const box = new THREE.Box3();
      box.setFromObject(body);

      const trainData = {
        mesh: train,
        box,
        body,
        type: 'TRAIN',
        lane,
        z: zOffset,
        speed: 5.5, // 5.5 m/s oncoming velocity
        requiresSwitch: true
      };

      chunk.userData.obstacles.push(trainData);
      chunk.userData.movingTrains.push(trainData);
    } else if (type === 'HURDLE') {
      // Jump Hurdle (Low Barrier, Jump over)
      const hurdle = new THREE.Group();
      hurdle.position.set(laneX, 0, zOffset);

      const barrierMesh = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.75, 0.28),
        this.barrierMat
      );
      barrierMesh.position.y = 0.38;
      barrierMesh.castShadow = true;
      hurdle.add(barrierMesh);

      // Warning Chevron Strip
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(2.45, 0.14, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffcc00 })
      );
      stripe.position.y = 0.58;
      hurdle.add(stripe);

      chunk.add(hurdle);

      const box = new THREE.Box3();
      box.setFromObject(barrierMesh);
      chunk.userData.obstacles.push({
        mesh: hurdle,
        box,
        type: 'HURDLE',
        lane,
        z: zOffset,
        requiresJump: true
      });
    } else if (type === 'SLIDE') {
      // Energy Slide Gate (Suspended overhead beam, slide under)
      const slideGate = new THREE.Group();
      slideGate.position.set(laneX, 0, zOffset);

      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), this.buildingMat);
      postL.position.set(-1.2, 1.3, 0);
      const postR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), this.buildingMat);
      postR.position.set(1.2, 1.3, 0);

      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.75, 0.28),
        this.energyBeamMat
      );
      beam.position.set(0, 1.65, 0);

      slideGate.add(postL, postR, beam);
      chunk.add(slideGate);

      const box = new THREE.Box3(
        new THREE.Vector3(laneX - 1.2, 1.1, zOffset - 0.2),
        new THREE.Vector3(laneX + 1.2, 2.2, zOffset + 0.2)
      );
      chunk.userData.obstacles.push({
        mesh: slideGate,
        box,
        type: 'SLIDE',
        lane,
        z: zOffset,
        requiresSlide: true
      });
    } else {
      // Cyber Monolith Block (Must switch lanes)
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 3.2, 0.6),
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          metalness: 0.6,
          roughness: 0.25,
          emissive: 0x991b1b,
          emissiveIntensity: 0.4
        })
      );
      applyCurvedWorld(pillar.material);
      pillar.position.set(laneX, 1.6, zOffset);
      pillar.castShadow = true;
      chunk.add(pillar);

      const box = new THREE.Box3();
      box.setFromObject(pillar);
      chunk.userData.obstacles.push({
        mesh: pillar,
        box,
        type: 'PILLAR',
        lane,
        z: zOffset,
        requiresSwitch: true
      });
    }
  }

  updateChunk(chunk, deltaTime, playerZ) {
    // Animate oncoming moving trains
    if (chunk.userData.movingTrains) {
      chunk.userData.movingTrains.forEach(t => {
        // Move train toward the oncoming player (+Z direction)
        t.mesh.position.z += deltaTime * t.speed;
        t.z = t.mesh.position.z;
        t.box.setFromObject(t.mesh);
      });
    }
  }
}
