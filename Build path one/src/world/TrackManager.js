import * as THREE from 'three';
import { BiomeCity } from './BiomeCity.js';
import { BiomeMountain } from './BiomeMountain.js';
import { BiomeSky } from './BiomeSky.js';

export class TrackManager {
  constructor(scene, collectiblesManager) {
    this.scene = scene;
    this.collectiblesManager = collectiblesManager;

    // Biomes
    this.biomeCity = new BiomeCity();
    this.biomeMountain = new BiomeMountain();
    this.biomeSky = new BiomeSky();
    this.currentBiome = this.biomeCity;
    this.currentBiomeName = 'Neo-Apex City';

    // Chunk Pooling
    this.chunkLength = 50.0;
    this.activeChunks = [];
    this.visibleChunkCount = 8;
    this.lastChunkZ = 0;

    // Biome Cycle Distance (Transitions every 350 meters)
    this.biomeDistanceStep = 350.0;
    this.onBiomeChangeCallback = null;
  }

  getBiomeForZ(z) {
    const dist = Math.abs(z);
    const biomeIndex = Math.floor(dist / this.biomeDistanceStep) % 3;
    if (biomeIndex === 0) return this.biomeCity;
    if (biomeIndex === 1) return this.biomeMountain;
    return this.biomeSky;
  }

  init() {
    this.clear();
    // Spawn 2 buffer chunks behind starting line for seamless camera view
    this.lastChunkZ = this.chunkLength * 2; // +100
    this.spawnNextChunk(true); // Chunk at +100
    this.spawnNextChunk(true); // Chunk at +50

    // Spawn initial chunks ahead
    for (let i = 0; i < this.visibleChunkCount; i++) {
      this.spawnNextChunk(i < 2); // First 2 chunks ahead are safe runway
    }
  }

  clear() {
    this.activeChunks.forEach(chunk => {
      this.scene.remove(chunk);
    });
    this.activeChunks = [];
    this.lastChunkZ = 0;
    this.currentBiome = this.biomeCity;
  }

  spawnNextChunk(isSafe = false) {
    const chunkZ = this.lastChunkZ;
    // Determine biome strictly from chunk world coordinate Z!
    const chunkBiome = this.getBiomeForZ(chunkZ);
    const chunk = chunkBiome.createChunk(this.chunkLength);
    chunk.position.z = chunkZ;
    chunk.userData.biome = chunkBiome;
    chunk.userData.worldZ = chunkZ;

    // Spawn obstacles & collectibles if not safe start
    if (!isSafe) {
      this.populateChunk(chunk, chunkBiome);
    }

    this.scene.add(chunk);
    this.activeChunks.push(chunk);

    this.lastChunkZ -= this.chunkLength;
  }

  populateChunk(chunk, chunkBiome) {
    // 1. Determine obstacle count & layout
    const laneChoices = [-1, 0, 1];
    const obstacleCount = Math.random() > 0.4 ? 2 : 1;
    const shuffledLanes = [...laneChoices].sort(() => Math.random() - 0.5);

    for (let i = 0; i < obstacleCount; i++) {
      const lane = shuffledLanes[i];
      const zOffset = -15 - Math.random() * 20;

      if (chunkBiome === this.biomeCity) {
        const types = ['HURDLE', 'SLIDE', 'PILLAR', 'TRAIN'];
        const type = types[Math.floor(Math.random() * types.length)];
        chunkBiome.spawnObstacle(chunk, lane, zOffset, type);
      } else if (chunkBiome === this.biomeMountain) {
        const types = ['BOULDER', 'SPIKES', 'ROCK_WALL'];
        const type = types[Math.floor(Math.random() * types.length)];
        chunkBiome.spawnObstacle(chunk, lane, zOffset, type);
      } else if (chunkBiome === this.biomeSky) {
        const types = ['LIGHTNING', 'CLOUD_HURDLE', 'SKY_SLIDE'];
        const type = types[Math.floor(Math.random() * types.length)];
        chunkBiome.spawnObstacle(chunk, lane, zOffset, type);
      }
    }

    // 2. Spawn Collectible Clusters in free lanes
    if (this.collectiblesManager) {
      const freeLane = shuffledLanes[obstacleCount % shuffledLanes.length];
      this.collectiblesManager.spawnPattern(chunk, freeLane, -5);
    }
  }

  update(playerZ, distance, deltaTime, audioSynth) {
    // 1. Biome Transition Check based on Player position
    const playerBiome = this.getBiomeForZ(playerZ);

    if (playerBiome !== this.currentBiome) {
      this.currentBiome = playerBiome;
      this.currentBiomeName = playerBiome.name;
      if (this.onBiomeChangeCallback) {
        this.onBiomeChangeCallback(this.currentBiomeName);
      }
    }

    // 2. Update dynamic chunks (boulders, spikes, lightning)
    this.activeChunks.forEach(chunk => {
      if (chunk.userData.biome && chunk.userData.biome.updateChunk) {
        chunk.userData.biome.updateChunk(chunk, deltaTime, playerZ, audioSynth);
      }
    });

    // 3. Recycle old chunks behind player & spawn new ahead
    // Keep at least 2 full chunks (100+ meters) behind the player so the track never clips behind camera
    const firstChunk = this.activeChunks[0];
    if (firstChunk && (firstChunk.position.z - playerZ) > (this.chunkLength * 2 + 30.0)) {
      this.scene.remove(firstChunk);
      this.activeChunks.shift();
      this.spawnNextChunk(false);
    }
  }

  // Get active obstacle hitboxes currently near player
  getNearbyObstacles(playerZ) {
    const nearby = [];
    this.activeChunks.forEach(chunk => {
      const chunkZ = chunk.position.z;
      // If within 40 meters of player
      if (Math.abs(chunkZ - playerZ) < 50) {
        if (chunk.userData.obstacles) {
          chunk.userData.obstacles.forEach(obs => {
            if (obs.type === 'LIGHTNING') {
              if (obs.phase === 'STRIKE') {
                nearby.push(obs);
              }
            } else {
              nearby.push(obs);
            }
          });
        }
      }
    });
    return nearby;
  }
}
