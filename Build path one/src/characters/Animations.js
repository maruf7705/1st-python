import * as THREE from 'three';

export class CharacterAnimator {
  constructor(characterGroup) {
    this.character = characterGroup;
    this.rig = characterGroup.userData.rig;
    this.runCycleTime = 0;
    this.idleTime = 0;
    this.currentActionName = null;
  }

  playAction(name, fadeDuration = 0.15) {
    const actions = this.character.userData.actions;
    if (!actions || !actions[name]) return;
    if (this.currentActionName === name) return;

    const prevAction = this.currentActionName ? actions[this.currentActionName] : null;
    const nextAction = actions[name];

    nextAction.reset();
    if (prevAction) {
      nextAction.crossFadeFrom(prevAction, fadeDuration, true);
    }
    nextAction.play();
    this.currentActionName = name;
  }

  update(deltaTime, physicsState, speedRatio = 1.0) {
    const shadowDisc = this.rig?.shadowDisc;

    // Ground Shadow Dynamics
    if (shadowDisc) {
      if (physicsState.isGrounded) {
        shadowDisc.position.y = 0.02;
        if (physicsState.isSliding) {
          shadowDisc.scale.set(1.15, 1.5, 1);
          shadowDisc.material.opacity = 0.72;
        } else {
          shadowDisc.scale.set(1.0, 1.0, 1);
          shadowDisc.material.opacity = 0.65;
        }
      } else {
        shadowDisc.position.y = -physicsState.y + 0.02;
        const jumpScale = Math.max(0.35, 1.0 - physicsState.y * 0.28);
        shadowDisc.scale.set(jumpScale, jumpScale, 1);
        shadowDisc.material.opacity = Math.max(0.15, 0.65 - physicsState.y * 0.22);
      }
    }

    // 1. Skinned Rigged 3D Character (GLTF / AnimationMixer)
    if (this.character.userData.mixer && this.character.userData.actions) {
      const gltfScene = this.character.userData.gltfScene;
      const actions = this.character.userData.actions;

      if (physicsState.isWallRunning) {
        if (gltfScene) {
          gltfScene.rotation.z = -physicsState.wallRunSide * 0.35;
        }
        this.playAction('Running', 0.1);
      } else if (physicsState.isAirDashing) {
        if (gltfScene) {
          gltfScene.rotation.x = 0.85;
          gltfScene.position.y = 0.15;
        }
        this.playAction('Jump', 0.08);
      } else if (physicsState.isSliding) {
        if (gltfScene) {
          gltfScene.rotation.x = 0.65;
          gltfScene.position.y = -0.18;
          gltfScene.scale.set(0.48, 0.28, 0.48);
        }
        this.playAction('Jump', 0.1);
      } else if (!physicsState.isGrounded) {
        if (gltfScene) {
          gltfScene.rotation.x = 0;
          gltfScene.position.y = 0;
          gltfScene.scale.set(0.48, 0.48, 0.48);
        }
        this.playAction('Jump', 0.1);
      } else {
        if (gltfScene) {
          gltfScene.rotation.x = 0;
          gltfScene.position.y = 0;
          gltfScene.scale.set(0.48, 0.48, 0.48);
        }
        this.playAction('Running', 0.15);

        if (actions['Running']) {
          actions['Running'].timeScale = Math.max(0.9, speedRatio * 1.25);
        }
      }

      this.character.userData.mixer.update(deltaTime);
    } else if (this.rig) {
      // 2. Procedural Rig Fallback
      const { hips, torso, headGroup, leftArm, rightArm, leftLeg, rightLeg, ponytail } = this.rig;

      if (physicsState.isWallRunning) {
        // Dynamic parkour wall run stride
        this.runCycleTime += deltaTime * 14.0;
        const cycle = this.runCycleTime;
        const side = physicsState.wallRunSide;

        hips.position.y = 0.95;
        hips.rotation.x = 0.25;
        hips.rotation.z = -side * 0.45;
        torso.rotation.x = 0.1;

        if (side === -1) {
          // Left wall: left arm touches wall, left leg strides higher
          leftLeg.rotation.x = Math.sin(cycle) * 1.2;
          rightLeg.rotation.x = -Math.sin(cycle) * 0.9;
          leftArm.rotation.set(0.5, 0, -0.6);
          rightArm.rotation.set(-0.8, 0, 0.3);
        } else {
          // Right wall
          rightLeg.rotation.x = Math.sin(cycle) * 1.2;
          leftLeg.rotation.x = -Math.sin(cycle) * 0.9;
          rightArm.rotation.set(0.5, 0, 0.6);
          leftArm.rotation.set(-0.8, 0, -0.3);
        }
      } else if (physicsState.isAirDashing) {
        // Supersonic spear projectile pose
        hips.position.y = 0.95;
        hips.rotation.x = 1.05;
        hips.rotation.z = 0;
        torso.rotation.x = 0.2;
        headGroup.rotation.x = -0.9;

        leftLeg.rotation.set(0.2, 0, -0.05);
        rightLeg.rotation.set(0.2, 0, 0.05);
        leftLeg.userData.knee.rotation.x = 0.1;
        rightLeg.userData.knee.rotation.x = 0.1;

        leftArm.rotation.set(-1.6, 0, -0.2);
        rightArm.rotation.set(-1.6, 0, 0.2);

        if (ponytail) ponytail.rotation.x = 1.3;
      } else if (physicsState.isSliding) {
        hips.position.y = 0.32;
        hips.rotation.x = 0.95;
        hips.rotation.z = 0;
        torso.rotation.x = 0.25;
        headGroup.rotation.x = -0.75;

        leftLeg.rotation.x = -1.25;
        leftLeg.userData.knee.rotation.x = 0.35;
        rightLeg.rotation.x = 0.95;
        rightLeg.userData.knee.rotation.x = 1.45;

        leftArm.rotation.x = -0.55;
        leftArm.rotation.z = -0.45;
        rightArm.rotation.x = -0.85;
        rightArm.rotation.z = 0.45;

        if (ponytail) ponytail.rotation.x = 0.85;
      } else if (!physicsState.isGrounded) {
        hips.position.y = 0.95;
        hips.rotation.x = -0.15;
        hips.rotation.z = 0;
        torso.rotation.x = 0.12;
        headGroup.rotation.x = -0.05;

        leftLeg.rotation.x = -0.75;
        leftLeg.userData.knee.rotation.x = 1.15;
        rightLeg.rotation.x = -0.55;
        rightLeg.userData.knee.rotation.x = 0.95;

        leftArm.rotation.x = 1.65;
        leftArm.rotation.z = -0.55;
        rightArm.rotation.x = 1.65;
        rightArm.rotation.z = 0.55;

        if (ponytail) ponytail.rotation.x = -0.45;
      } else {
        const sprintSpeed = Math.max(0.7, speedRatio);
        this.runCycleTime += deltaTime * (13.5 + sprintSpeed * 2.5);
        const cycle = this.runCycleTime;

        const forwardLean = 0.18 + Math.min(0.24, (speedRatio - 1.0) * 0.28);
        hips.rotation.x = forwardLean;
        hips.rotation.z = 0;
        hips.position.y = 0.95 + Math.abs(Math.sin(cycle)) * (0.07 + (speedRatio - 1.0) * 0.03);
        hips.rotation.y = Math.sin(cycle) * 0.09;

        torso.rotation.x = 0.08;
        torso.rotation.y = -Math.sin(cycle) * 0.12;

        headGroup.rotation.x = -forwardLean * 0.6;
        headGroup.rotation.y = Math.sin(cycle) * 0.04;

        const legStride = 0.95 + Math.min(0.35, (speedRatio - 1.0) * 0.32);
        leftLeg.rotation.x = Math.sin(cycle) * legStride;
        rightLeg.rotation.x = -Math.sin(cycle) * legStride;

        leftLeg.userData.knee.rotation.x = Math.max(0, -Math.sin(cycle) * 1.35);
        rightLeg.userData.knee.rotation.x = Math.max(0, Math.sin(cycle) * 1.35);

        const armSwing = 0.85 + Math.min(0.38, (speedRatio - 1.0) * 0.35);
        leftArm.rotation.x = -Math.sin(cycle) * armSwing;
        rightArm.rotation.x = Math.sin(cycle) * armSwing;
        leftArm.rotation.z = -0.18;
        rightArm.rotation.z = 0.18;

        leftArm.userData.elbow.rotation.x = -0.55 + Math.sin(cycle) * 0.35;
        rightArm.userData.elbow.rotation.x = -0.55 - Math.sin(cycle) * 0.35;

        if (ponytail) {
          ponytail.rotation.x = -0.5 - (speedRatio - 1.0) * 0.3 + Math.sin(cycle * 2) * 0.3;
          ponytail.rotation.y = Math.sin(cycle) * 0.18;
        }
      }
    }

    // Dynamic bank lean into lane switching and wall running
    const targetBank = -physicsState.laneVelocityX * 0.045 + (physicsState.isWallRunning ? -physicsState.wallRunSide * 0.35 : 0);
    this.character.rotation.z += (targetBank - this.character.rotation.z) * deltaTime * 14;
    this.character.rotation.y = physicsState.laneVelocityX * 0.025;
  }

  updateIdle(deltaTime) {
    const shadowDisc = this.rig?.shadowDisc;
    if (shadowDisc) {
      shadowDisc.position.y = 0.02;
      shadowDisc.scale.set(1, 1, 1);
      shadowDisc.material.opacity = 0.45;
    }

    if (this.character.userData.mixer && this.character.userData.actions) {
      if (this.character.userData.actions['Wave']) {
        this.playAction('Wave', 0.2);
      } else if (this.character.userData.actions['Idle']) {
        this.playAction('Idle', 0.2);
      }
      this.character.userData.mixer.update(deltaTime);
      return;
    }

    if (!this.rig) return;
    this.idleTime += deltaTime * 2.0;
    const { hips, torso, headGroup, leftArm, rightArm, leftLeg, rightLeg, ponytail } = this.rig;

    hips.position.y = 0.95 + Math.sin(this.idleTime) * 0.025;
    hips.rotation.set(0, 0, 0);
    torso.rotation.x = Math.sin(this.idleTime) * 0.03;
    headGroup.rotation.set(0, 0, 0);

    leftLeg.rotation.set(0, 0, -0.05);
    leftLeg.userData.knee.rotation.set(0, 0, 0);
    rightLeg.rotation.set(0, 0, 0.05);
    rightLeg.userData.knee.rotation.set(0, 0, 0);

    leftArm.rotation.set(0.1, 0, -0.1 + Math.sin(this.idleTime) * 0.03);
    rightArm.rotation.set(0.1, 0, 0.1 - Math.sin(this.idleTime) * 0.03);

    if (ponytail) {
      ponytail.rotation.x = -0.3 + Math.sin(this.idleTime * 1.5) * 0.08;
    }
  }

  updateCrash(deltaTime) {
    const shadowDisc = this.rig?.shadowDisc;
    if (shadowDisc) {
      shadowDisc.position.y = 0.02;
      shadowDisc.scale.set(1.2, 1.2, 1);
      shadowDisc.material.opacity = 0.35;
    }

    if (this.character.userData.mixer && this.character.userData.actions) {
      const deathAction = this.character.userData.actions['Death'];
      if (deathAction && this.currentActionName !== 'Death') {
        deathAction.reset();
        deathAction.setLoop(THREE.LoopOnce, 1);
        deathAction.clampWhenFinished = true;
        this.playAction('Death', 0.05);
      }
      this.character.userData.mixer.update(deltaTime);
      return;
    }

    if (!this.rig) return;
    const { hips, torso, headGroup, leftArm, rightArm, leftLeg, rightLeg, ponytail } = this.rig;

    hips.position.y = 0.22;
    hips.rotation.x = -1.35;
    torso.rotation.x = -0.2;
    headGroup.rotation.x = 0.4;

    leftLeg.rotation.set(-0.2, 0, -0.3);
    leftLeg.userData.knee.rotation.set(0.6, 0, 0);
    rightLeg.rotation.set(-0.4, 0, 0.3);
    rightLeg.userData.knee.rotation.set(0.4, 0, 0);

    leftArm.rotation.set(-1.2, 0, -0.8);
    rightArm.rotation.set(-1.2, 0, 0.8);

    if (ponytail) {
      ponytail.rotation.x = -1.2;
    }
  }
}
