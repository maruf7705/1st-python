import * as THREE from 'three';
import { applyCurvedWorld } from '../engine/CurvedWorldShader.js';

export class BiomeMountain {
  constructor() {
    this.name = 'Crag Mountain';

    // Materials with Curved World Horizon Shader
    this.roadMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x4a3b32, // Rugged canyon trail
      roughness: 0.82,
      metalness: 0.12
    }));
    this.canyonBedMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x241d19, // Deep dark canyon floor
      roughness: 0.95
    }));
    this.rockMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x3d352e,
      roughness: 0.95
    }));
    this.boulderMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0x5a4a3e,
      roughness: 0.78
    }));
    this.spikeMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xf1f5f9, // Sharp gleaming steel spikes
      metalness: 0.9,
      roughness: 0.18
    }));
    this.spikeWarningMat = applyCurvedWorld(new THREE.MeshBasicMaterial({
      color: 0xff3b30, // Apple Red warning hazard plate
      transparent: true,
      opacity: 0.9
    }));
    this.lanternMat = applyCurvedWorld(new THREE.MeshStandardMaterial({
      color: 0xff9f0a, // Apple Orange canyon glow lanterns
      emissive: 0xff9f0a,
      emissiveIntensity: 1.2
    }));
    this.trailMarkerMat = applyCurvedWorld(new THREE.MeshBasicMaterial({
      color: 0xffb340,
      transparent: true,
      opacity: 0.6
    }));
  }

  createChunk(chunkLength = 50) {
    const chunk = new THREE.Group();
    chunk.userData.obstacles = [];
    chunk.userData.rollingBoulders = [];
    chunk.userData.spikeTraps = [];

    // 1. Full-width Canyon Bed (Extends 70 meters wide, zero blank sky gaps)
    const canyonBed = new THREE.Mesh(
      new THREE.PlaneGeometry(70, chunkLength),
      this.canyonBedMat
    );
    canyonBed.rotation.x = -Math.PI / 2;
    canyonBed.position.set(0, -0.05, -chunkLength / 2);
    chunk.add(canyonBed);

    // 2. Rocky Dirt Track (9.6 meters wide, continuous with city track)
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(9.6, chunkLength),
      this.roadMat
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -chunkLength / 2;
    road.receiveShadow = true;
    chunk.add(road);

    // Subtle amber track edge markers
    [-4.7, 4.7].forEach(x => {
      for (let s = 0; s < 5; s++) {
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 0.6, 6),
          this.lanternMat
        );
        marker.position.set(x, 0.3, -s * 10 - 5);
        chunk.add(marker);
      }
    });

    // 3. Crag Mountain Cliffs on sides with glowing amber lanterns
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 5; i++) {
        const rockHeight = 16 + Math.random() * 18;
        const rockRadius = 4.5 + Math.random() * 3.5;
        const cliff = new THREE.Mesh(
          new THREE.DodecahedronGeometry(rockRadius, 1),
          this.rockMat
        );
        cliff.scale.set(1.2, 2.6, 1.2);
        cliff.position.set(
          side * (7.5 + rockRadius),
          rockHeight * 0.4,
          -i * 10 - 5
        );
        cliff.castShadow = true;
        chunk.add(cliff);

        // Amber crystal lanterns embedded in cliff
        if (i % 2 === 0) {
          const crystal = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.55, 0),
            this.lanternMat
          );
          crystal.position.set(
            side * 6.8,
            2.2 + Math.random() * 2.0,
            -i * 10 - 5
          );
          chunk.add(crystal);
        }
      }
    }

    return chunk;
  }

  spawnObstacle(chunk, lane, zOffset, type) {
    const laneX = lane * 2.8;

    if (type === 'BOULDER') {
      // Rolling Mountain Boulder ("পাথর আসবে")
      const boulder = new THREE.Group();
      boulder.position.set(laneX, 1.1, zOffset);

      const rockMesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.1, 2),
        this.boulderMat
      );
      rockMesh.castShadow = true;
      boulder.add(rockMesh);

      // Warning ground marker ahead of boulder
      const warningMarker = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 1.0),
        new THREE.MeshBasicMaterial({ color: 0xff9f0a, transparent: true, opacity: 0.6 })
      );
      warningMarker.rotation.x = -Math.PI / 2;
      warningMarker.position.set(0, -1.08, 6.0);
      boulder.add(warningMarker);

      chunk.add(boulder);

      const box = new THREE.Box3();
      box.setFromObject(boulder);

      const obstacleData = {
        mesh: boulder,
        rockMesh,
        box,
        type: 'BOULDER',
        lane,
        z: zOffset,
        requiresJump: true,
        rollSpeed: 6.5
      };

      chunk.userData.obstacles.push(obstacleData);
      chunk.userData.rollingBoulders.push(obstacleData);
    } else if (type === 'SPIKES') {
      // Sudden Retractable Ground Spikes ("হঠাৎ কাটা চলে আসবে")
      const trap = new THREE.Group();
      trap.position.set(laneX, 0, zOffset);

      // Warning Hazard Plate on floor (pulses)
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 1.8),
        this.spikeWarningMat
      );
      plate.rotation.x = -Math.PI / 2;
      plate.position.y = 0.02;
      trap.add(plate);

      // Cluster of 5 lethal metal spikes
      const spikeGroup = new THREE.Group();
      spikeGroup.position.y = -0.3; // Starts recessed in floor, springs up violently!

      const spikeGeo = new THREE.ConeGeometry(0.2, 1.05, 5);
      const positions = [
        [-0.7, 0.52, -0.4],
        [0.7, 0.52, -0.4],
        [0, 0.52, 0],
        [-0.6, 0.52, 0.4],
        [0.6, 0.52, 0.4]
      ];

      positions.forEach(pos => {
        const spike = new THREE.Mesh(spikeGeo, this.spikeMat);
        spike.position.set(pos[0], pos[1], pos[2]);
        spike.castShadow = true;
        spikeGroup.add(spike);
      });

      trap.add(spikeGroup);
      chunk.add(trap);

      const box = new THREE.Box3(
        new THREE.Vector3(laneX - 1.1, 0, zOffset - 0.8),
        new THREE.Vector3(laneX + 1.1, 1.05, zOffset + 0.8)
      );

      const spikeData = {
        mesh: trap,
        spikeGroup,
        plate,
        box,
        type: 'SPIKES',
        lane,
        z: zOffset,
        requiresJump: true,
        isTriggered: false,
        timer: 0
      };

      chunk.userData.obstacles.push(spikeData);
      chunk.userData.spikeTraps.push(spikeData);
    } else {
      // Rock Wall Block (Must switch lanes)
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 3.0, 1.2),
        this.rockMat
      );
      wall.position.set(laneX, 1.5, zOffset);
      wall.castShadow = true;
      chunk.add(wall);

      const box = new THREE.Box3();
      box.setFromObject(wall);
      chunk.userData.obstacles.push({
        mesh: wall,
        box,
        type: 'ROCK_WALL',
        lane,
        z: zOffset,
        requiresSwitch: true
      });
    }
  }

  // Animate dynamic elements (rolling boulders & sudden spikes)
  updateChunk(chunk, deltaTime, playerZ) {
    // 1. Roll Boulders towards player
    if (chunk.userData.rollingBoulders) {
      chunk.userData.rollingBoulders.forEach(b => {
        b.rockMesh.rotation.x -= deltaTime * b.rollSpeed;
        b.box.setFromObject(b.mesh);
      });
    }

    // 2. Sudden Spikes spring up when player nears
    if (chunk.userData.spikeTraps) {
      chunk.userData.spikeTraps.forEach(s => {
        const distanceToPlayer = Math.abs((chunk.position.z + s.z) - playerZ);

        // Springs up suddenly when player gets within 32 meters!
        if (distanceToPlayer < 34 && !s.isTriggered) {
          s.isTriggered = true;
        }

        if (s.isTriggered && s.spikeGroup.position.y < 0.45) {
          s.spikeGroup.position.y += deltaTime * 16.0;
        }
      });
    }
  }
}
