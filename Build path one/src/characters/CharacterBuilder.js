import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyCurvedWorld } from '../engine/CurvedWorldShader.js';

export class CharacterBuilder {
  static shadowTexture = null;
  static loader = new GLTFLoader();

  static getShadowTexture() {
    if (!CharacterBuilder.shadowTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(10, 15, 25, 0.85)');
      grad.addColorStop(0.35, 'rgba(10, 15, 25, 0.6)');
      grad.addColorStop(0.7, 'rgba(10, 15, 25, 0.2)');
      grad.addColorStop(1, 'rgba(10, 15, 25, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      CharacterBuilder.shadowTexture = new THREE.CanvasTexture(canvas);
    }
    return CharacterBuilder.shadowTexture;
  }

  static createShadowDisc() {
    const shadowMat = new THREE.MeshBasicMaterial({
      map: CharacterBuilder.getShadowTexture(),
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });
    applyCurvedWorld(shadowMat);

    const shadowDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 1.25),
      shadowMat
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.02;
    shadowDisc.renderOrder = 2;
    return shadowDisc;
  }

  static createCharacter(type = 'boy', skinTheme = 'default') {
    const root = new THREE.Group();
    root.name = `character_${type}_${skinTheme}`;

    // 1. Soft feathered contact shadow disc
    const shadowDisc = CharacterBuilder.createShadowDisc();
    root.add(shadowDisc);

    // 2. Procedural Placeholder Rig (Displayed seamlessly while GLTF loads)
    const placeholderGroup = new THREE.Group();
    placeholderGroup.name = 'placeholder_rig';
    root.add(placeholderGroup);

    const isBoy = (type === 'boy');
    let skinMat, clothesMat, secondaryMat, neonMat, shoeMat;

    if (skinTheme === 'cyber_stealth') {
      skinMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 });
      clothesMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.25, metalness: 0.85 });
      secondaryMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.3, metalness: 0.5 });
      neonMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 1.6,
        roughness: 0.1
      });
      shoeMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 0.8 });
    } else if (skinTheme === 'hyper_gold') {
      skinMat = new THREE.MeshStandardMaterial({ color: 0xffedd5, roughness: 0.3 });
      clothesMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.18, metalness: 0.95 });
      secondaryMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.2, metalness: 0.8 });
      neonMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xffd700,
        emissiveIntensity: 1.8,
        roughness: 0.1
      });
      shoeMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2 });
    } else if (skinTheme === 'solar_flare') {
      skinMat = new THREE.MeshStandardMaterial({ color: 0xfed7aa, roughness: 0.5 });
      clothesMat = new THREE.MeshStandardMaterial({ color: 0x450a0a, roughness: 0.3, metalness: 0.6 });
      secondaryMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.25, metalness: 0.4 });
      neonMat = new THREE.MeshStandardMaterial({
        color: 0xff3b30,
        emissive: 0xff5722,
        emissiveIntensity: 2.2,
        roughness: 0.1
      });
      shoeMat = new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff3b30, emissiveIntensity: 0.9 });
    } else {
      // Default signature look
      skinMat = new THREE.MeshStandardMaterial({ color: isBoy ? 0xffdbac : 0xf1c27d, roughness: 0.6 });
      clothesMat = new THREE.MeshStandardMaterial({ color: isBoy ? 0x1e293b : 0x0f172a, roughness: 0.4 });
      secondaryMat = new THREE.MeshStandardMaterial({ color: isBoy ? 0x3b82f6 : 0xd946ef, roughness: 0.3 });
      neonMat = new THREE.MeshStandardMaterial({
        color: isBoy ? 0x00f0ff : 0xff2a85,
        emissive: isBoy ? 0x00f0ff : 0xff2a85,
        emissiveIntensity: 0.9,
        roughness: 0.2
      });
      shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    }

    [skinMat, clothesMat, secondaryMat, neonMat, shoeMat].forEach(m => applyCurvedWorld(m));

    const hips = new THREE.Group();
    hips.position.y = 0.95;
    placeholderGroup.add(hips);

    const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.28), clothesMat);
    hips.add(pelvisMesh);

    const torso = new THREE.Group();
    torso.position.y = 0.12;
    hips.add(torso);

    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.52, 0.32), secondaryMat);
    chestMesh.position.y = 0.26;
    torso.add(chestMesh);

    const stripeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.08, 0.34), neonMat);
    stripeMesh.position.y = 0.26;
    torso.add(stripeMesh);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.6;
    torso.add(headGroup);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.28), skinMat);
    headMesh.position.y = 0.16;
    headGroup.add(headMesh);

    const leftArm = CharacterBuilder.createArm(isBoy, -1, skinMat, clothesMat, neonMat);
    const rightArm = CharacterBuilder.createArm(isBoy, 1, skinMat, clothesMat, neonMat);
    torso.add(leftArm, rightArm);

    const leftLeg = CharacterBuilder.createLeg(isBoy, -1, clothesMat, shoeMat, neonMat);
    const rightLeg = CharacterBuilder.createLeg(isBoy, 1, clothesMat, shoeMat, neonMat);
    hips.add(leftLeg, rightLeg);

    root.userData.rig = {
      hips,
      torso,
      headGroup,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      shadowDisc
    };

    // 3. Load AAA Rigged 3D Character Model
    CharacterBuilder.loader.load(
      './assets/models/robot.glb',
      (gltf) => {
        // Model loaded successfully!
        const model = gltf.scene;
        model.name = 'gltf_character';

        // Scale to 0.48: ~1.2m tall runner proportion (Subway Surfers scale)
        model.scale.set(0.48, 0.48, 0.48);
        model.rotation.y = Math.PI; // Face forward along track (-Z)
        model.position.set(0, 0, 0);

        // Customize materials for Apple / Cyberpunk aesthetic per character persona
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material) {
              const oldMat = child.material;
              const matName = oldMat.name || '';

              let newMat;
              if (isBoy) {
                // LEO: High-tech cobalt titanium cyber-runner with neon cyan accents
                if (matName === 'Main') {
                  newMat = new THREE.MeshStandardMaterial({
                    color: 0x1d4ed8,
                    emissive: 0x00d2ff,
                    emissiveIntensity: 0.35,
                    metalness: 0.85,
                    roughness: 0.25
                  });
                } else if (matName === 'Grey') {
                  newMat = new THREE.MeshStandardMaterial({
                    color: 0x64748b,
                    metalness: 0.8,
                    roughness: 0.25
                  });
                } else {
                  newMat = new THREE.MeshStandardMaterial({
                    color: 0x0f172a,
                    metalness: 0.95,
                    roughness: 0.15
                  });
                }
              } else {
                // NOVA: Sleek Apple ceramic pearl with electric neon magenta trim
                if (matName === 'Main') {
                  newMat = new THREE.MeshStandardMaterial({
                    color: 0xbe185d,
                    emissive: 0xff2a85,
                    emissiveIntensity: 0.4,
                    metalness: 0.8,
                    roughness: 0.25
                  });
                } else if (matName === 'Grey') {
                  newMat = new THREE.MeshStandardMaterial({
                    color: 0xf8fafc,
                    metalness: 0.4,
                    roughness: 0.2
                  });
                } else {
                  newMat = new THREE.MeshStandardMaterial({
                    color: 0x1e1b4b,
                    metalness: 0.9,
                    roughness: 0.15
                  });
                }
              }

              applyCurvedWorld(newMat);
              child.material = newMat;
            }
          }
        });

        // Set up skeletal AnimationMixer
        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        for (const clip of gltf.animations) {
          actions[clip.name] = mixer.clipAction(clip);
        }

        // Hide procedural placeholder and activate rigged 3D character
        placeholderGroup.visible = false;
        root.add(model);

        root.userData.gltfScene = model;
        root.userData.mixer = mixer;
        root.userData.actions = actions;
        root.userData.isGltfReady = true;

        // Default to idle stance
        if (actions['Idle']) {
          actions['Idle'].play();
        }
      },
      undefined,
      (error) => {
        console.warn('Could not load GLTF model, using procedural rig fallback:', error);
      }
    );

    return root;
  }

  static createArm(isBoy, side, skinMat, clothesMat, neonMat) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.32, 0.45, 0);

    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.32, 6), clothesMat);
    upperArm.position.y = -0.16;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.28, 6), skinMat);
    forearm.position.y = -0.14;
    elbow.add(forearm);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.08, 6), neonMat);
    band.position.y = -0.1;
    elbow.add(band);

    shoulder.userData = { elbow };
    return shoulder;
  }

  static createLeg(isBoy, side, clothesMat, shoeMat, neonMat) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.16, -0.05, 0);

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.44, 6), clothesMat);
    thigh.position.y = -0.22;
    hipJoint.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hipJoint.add(knee);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.42, 6), clothesMat);
    shin.position.y = -0.21;
    knee.add(shin);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.28), shoeMat);
    shoe.position.set(0, -0.44, 0.05);
    knee.add(shoe);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.30), neonMat);
    sole.position.set(0, -0.48, 0.05);
    knee.add(sole);

    hipJoint.userData = { knee };
    return hipJoint;
  }
}
