import * as THREE from 'three';

export class DayNightCycle {
  constructor(scene, rendererEngine) {
    this.scene = scene;
    this.rendererEngine = rendererEngine;

    // Time of day: 0.0 = Noon (Day), 0.5 = Sunset, 1.0 = Midnight (Night)
    this.timeOfDay = 0.0;
    this.isDynamic = true;
    this.cycleDuration = 60.0; // 60s for full Day-Night cycle
    this.targetMode = 'cycle'; // 'day', 'night', 'cycle'

    // Biome Ambient Tint
    this.biomeAmbientColor = new THREE.Color(0xffffff);

    // Lighting Setup
    this.ambientLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.95);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.6);
    this.sunLight.position.set(15, 30, 20);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 120;
    this.sunLight.shadow.camera.left = -20;
    this.sunLight.shadow.camera.right = 20;
    this.sunLight.shadow.camera.top = 20;
    this.sunLight.shadow.camera.bottom = -20;
    this.scene.add(this.sunLight);

    // Celestial Bodies (Sun & Moon)
    this.celestialPivot = new THREE.Group();
    this.scene.add(this.celestialPivot);

    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff2a8 })
    );
    sunMesh.position.set(0, 45, -60);
    this.celestialPivot.add(sunMesh);

    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xcfe2fe })
    );
    moonMesh.position.set(0, -45, 60);
    this.celestialPivot.add(moonMesh);

    // Starfield Points (Twinkling night sky)
    const starCount = 600;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 350;
      starPositions[i * 3 + 1] = 20 + Math.random() * 150;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 350;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    this.starField = new THREE.Points(starGeo, this.starMaterial);
    this.scene.add(this.starField);

    // Color definitions for day/night interpolation
    this.daySky = new THREE.Color(0xdbeafe);
    this.dayFog = new THREE.Color(0xdbeafe);
    this.nightSky = new THREE.Color(0x060814);
    this.nightFog = new THREE.Color(0x060814);

    this.setMode('day');
  }

  setMode(mode) {
    this.targetMode = mode;
    if (mode === 'day') {
      this.isDynamic = false;
      this.timeOfDay = 0.0;
    } else if (mode === 'night') {
      this.isDynamic = false;
      this.timeOfDay = 1.0;
    } else {
      this.isDynamic = true;
    }
  }

  setBiome(biomeName) {
    if (biomeName.includes('City')) {
      this.biomeAmbientColor.setHex(0xa5f3fc); // Cyan tint
    } else if (biomeName.includes('Mountain')) {
      this.biomeAmbientColor.setHex(0xfde68a); // Warm amber tint
    } else {
      this.biomeAmbientColor.setHex(0xc4b5fd); // Cool ethereal violet
    }
  }

  toggleDayNight() {
    if (this.timeOfDay < 0.5) {
      this.setMode('night');
      return 'night';
    } else {
      this.setMode('day');
      return 'day';
    }
  }

  update(deltaTime, playerZ = 0) {
    if (this.isDynamic) {
      this.timeOfDay = (this.timeOfDay + deltaTime / this.cycleDuration) % 1.0;
    }

    // Blend Factor (0 = Pure Day, 1 = Pure Night)
    const nightBlend = (Math.cos(this.timeOfDay * Math.PI * 2) * -0.5) + 0.5;

    // Celestial Orbit Rotation
    this.celestialPivot.rotation.x = this.timeOfDay * Math.PI * 2;
    this.celestialPivot.position.z = playerZ;

    // Starfield tracks player & fades with nightBlend
    if (this.starField) {
      this.starField.position.z = playerZ;
      this.starMaterial.opacity = Math.max(0, (nightBlend - 0.2) * 1.25);
    }

    // Interpolate Background & Fog
    const currentSkyColor = new THREE.Color().copy(this.daySky).lerp(this.nightSky, nightBlend);
    this.scene.background = currentSkyColor;
    this.scene.fog.color.copy(currentSkyColor);

    // Adjust Ambient Lighting with Biome Tint Blend
    const baseAmbient = new THREE.Color(0xffffff).lerp(new THREE.Color(0x223366), nightBlend);
    this.ambientLight.color.copy(baseAmbient).lerp(this.biomeAmbientColor, 0.25);
    this.ambientLight.groundColor.setHex(0x444455).lerp(new THREE.Color(0x050711), nightBlend);
    this.ambientLight.intensity = THREE.MathUtils.lerp(0.95, 0.45, nightBlend);

    this.sunLight.intensity = THREE.MathUtils.lerp(1.6, 0.4, nightBlend);
    this.sunLight.color.setHex(0xfffaed).lerp(new THREE.Color(0x7dd3fc), nightBlend);
    this.sunLight.position.z = playerZ + 20;
  }
}
