import * as THREE from 'three';

export class PhysicsEngine {
  constructor() {
    // 3 Lanes: -2.8, 0, +2.8
    this.laneWidth = 2.8;
    this.currentLane = 0; // -1 (Left), 0 (Center), 1 (Right)
    this.targetX = 0;
    this.currentX = 0;
    this.laneVelocityX = 0;

    // Vertical Kinematics
    this.y = 0;
    this.velocityY = 0;
    this.gravity = 52.0;
    this.jumpForce = 15.5;
    this.isGrounded = true;

    // Parkour: Wall Run
    this.isWallRunning = false;
    this.wallRunSide = 0; // -1 (Left Wall), +1 (Right Wall)
    this.wallRunTimer = 0;
    this.wallRunMaxDuration = 1.35; // seconds

    // Parkour: Supersonic Air Dash
    this.canAirDash = true;
    this.isAirDashing = false;
    this.airDashTimer = 0;
    this.airDashDuration = 0.32;
    this.airDashCooldown = 0;

    // Slide state
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideDuration = 0.75;

    // Dynamic Camera roll banking target (degrees/radians)
    this.bankAngle = 0;

    // Character Bounding Box (AABB)
    this.standingBox = new THREE.Box3(
      new THREE.Vector3(-0.45, 0, -0.45),
      new THREE.Vector3(0.45, 1.8, 0.45)
    );
    this.slidingBox = new THREE.Box3(
      new THREE.Vector3(-0.45, 0, -0.7),
      new THREE.Vector3(0.45, 0.7, 0.7)
    );
    this.currentHitbox = new THREE.Box3();

    // Game Progression Speed
    this.baseSpeed = 22.0;
    this.speed = this.baseSpeed;
    this.maxSpeed = 54.0;
    this.distance = 0;

    // Chrono Brake / Slow-Mo status
    this.timeDilation = 1.0;
    this.brakeDuration = 0;

    // Skill Tree Multipliers (Upgradable in Shop)
    this.magnetDurationMultiplier = 1.0;
    this.brakeEfficiencyMultiplier = 1.0;
    this.scoreMultiplierBonus = 1.0;
    this.airDashPowerMultiplier = 1.0;
  }

  reset() {
    this.currentLane = 0;
    this.targetX = 0;
    this.currentX = 0;
    this.laneVelocityX = 0;
    this.y = 0;
    this.velocityY = 0;
    this.isGrounded = true;

    this.isWallRunning = false;
    this.wallRunSide = 0;
    this.wallRunTimer = 0;

    this.canAirDash = true;
    this.isAirDashing = false;
    this.airDashTimer = 0;
    this.airDashCooldown = 0;

    this.isSliding = false;
    this.slideTimer = 0;
    this.speed = this.baseSpeed;
    this.distance = 0;
    this.timeDilation = 1.0;
    this.brakeDuration = 0;
    this.bankAngle = 0;
  }

  applySkillUpgrades(upgrades = {}) {
    if (upgrades.magnetTier) {
      this.magnetDurationMultiplier = 1.0 + upgrades.magnetTier * 0.35;
    }
    if (upgrades.brakeTier) {
      this.brakeEfficiencyMultiplier = 1.0 + upgrades.brakeTier * 0.30;
    }
    if (upgrades.scoreTier) {
      this.scoreMultiplierBonus = 1.0 + upgrades.scoreTier * 0.25;
    }
    if (upgrades.dashTier) {
      this.airDashPowerMultiplier = 1.0 + upgrades.dashTier * 0.30;
    }
  }

  moveLeft() {
    if (this.isWallRunning && this.wallRunSide === 1) {
      // Wall kick off right wall toward center/left
      this.endWallRun();
      this.currentLane = 0;
      this.targetX = 0;
      this.velocityY = 10.0;
      return 'WALL_KICK';
    }

    if (this.currentLane > -1) {
      this.currentLane--;
      this.targetX = this.currentLane * this.laneWidth;
      return true;
    } else if (this.currentLane === -1 && (!this.isGrounded || this.y > 0.3)) {
      // Attempt wall run on left barrier
      return this.tryWallRun(-1);
    }
    return false;
  }

  moveRight() {
    if (this.isWallRunning && this.wallRunSide === -1) {
      // Wall kick off left wall toward center/right
      this.endWallRun();
      this.currentLane = 0;
      this.targetX = 0;
      this.velocityY = 10.0;
      return 'WALL_KICK';
    }

    if (this.currentLane < 1) {
      this.currentLane++;
      this.targetX = this.currentLane * this.laneWidth;
      return true;
    } else if (this.currentLane === 1 && (!this.isGrounded || this.y > 0.3)) {
      // Attempt wall run on right barrier
      return this.tryWallRun(1);
    }
    return false;
  }

  tryWallRun(side) {
    if (this.isWallRunning) return false;
    this.isWallRunning = true;
    this.wallRunSide = side;
    this.wallRunTimer = this.wallRunMaxDuration;
    this.isGrounded = false;
    this.velocityY = 2.5; // slight buoyant rise
    this.targetX = side * (this.laneWidth + 0.35); // stick to outer barrier
    return 'WALL_RUN';
  }

  endWallRun() {
    if (!this.isWallRunning) return;
    this.isWallRunning = false;
    this.wallRunSide = 0;
    this.targetX = Math.sign(this.currentX) * this.laneWidth;
  }

  jump() {
    if (this.isWallRunning) {
      // Wall Kick into opposite direction with high altitude
      const kickSide = -this.wallRunSide;
      this.endWallRun();
      this.currentLane = 0;
      this.targetX = 0;
      this.velocityY = this.jumpForce * 1.05;
      this.canAirDash = true;
      return 'WALL_KICK';
    }

    if (this.isGrounded) {
      this.isGrounded = false;
      this.velocityY = this.jumpForce;
      this.isSliding = false;
      this.canAirDash = true;
      return 'JUMP';
    } else if (this.canAirDash && this.airDashCooldown <= 0) {
      // Supersonic Mid-Air Dash!
      return this.triggerAirDash();
    }
    return false;
  }

  triggerAirDash() {
    this.canAirDash = false;
    this.isAirDashing = true;
    this.airDashTimer = this.airDashDuration;
    this.airDashCooldown = 0.8;
    this.velocityY = 4.5; // Mid-air hang lift
    this.isSliding = false;
    return 'AIR_DASH';
  }

  slide() {
    if (this.isWallRunning) {
      this.endWallRun();
    }
    if (!this.isGrounded) {
      // Fast downward dive if in air
      this.velocityY = -26.0;
    }
    this.isSliding = true;
    this.slideTimer = this.slideDuration;
    return true;
  }

  activateBrake(duration = 5.0) {
    this.brakeDuration = duration * this.brakeEfficiencyMultiplier;
    this.timeDilation = 0.45; // 55% slow-mo with upgrade
  }

  update(rawDeltaTime) {
    if (this.airDashCooldown > 0) {
      this.airDashCooldown -= rawDeltaTime;
    }

    // Chrono Brake countdown
    if (this.brakeDuration > 0) {
      this.brakeDuration -= rawDeltaTime;
      if (this.brakeDuration <= 0) {
        this.timeDilation = 1.0;
      }
    }

    const effectiveDt = rawDeltaTime * this.timeDilation;

    // Air Dash acceleration
    let currentSpeed = this.speed;
    if (this.isAirDashing) {
      this.airDashTimer -= rawDeltaTime;
      if (this.airDashTimer <= 0) {
        this.isAirDashing = false;
      } else {
        currentSpeed += 14.0 * this.airDashPowerMultiplier;
      }
    }

    // Speed progression over distance
    this.speed = Math.min(this.maxSpeed, this.baseSpeed + (this.distance / 140) * 1.65);
    this.distance += currentSpeed * effectiveDt;

    // Damped Spring-Damper Lane Switching Physics (144Hz stability)
    const springK = 420.0;
    const damping = 34.0;
    const displacement = this.targetX - this.currentX;
    const springForce = displacement * springK;
    const dampingForce = -this.laneVelocityX * damping;
    const accelX = springForce + dampingForce;

    this.laneVelocityX += accelX * rawDeltaTime;
    this.currentX += this.laneVelocityX * rawDeltaTime;

    if (Math.abs(displacement) < 0.005 && Math.abs(this.laneVelocityX) < 0.05) {
      this.currentX = this.targetX;
      this.laneVelocityX = 0;
    }

    // Wall Run Dynamics
    if (this.isWallRunning) {
      this.wallRunTimer -= rawDeltaTime;
      // Gentle floating descent along the wall
      this.velocityY = Math.sin(this.wallRunTimer * 3.0) * 0.8;
      this.y = Math.max(0.8, this.y + this.velocityY * rawDeltaTime);

      // Bank camera roll into wall
      this.bankAngle = -this.wallRunSide * 0.16;

      if (this.wallRunTimer <= 0) {
        this.endWallRun();
      }
    } else {
      // Normal lane banking
      const targetRoll = -Math.max(-0.10, Math.min(0.10, this.laneVelocityX * 0.014));
      this.bankAngle = targetRoll;

      // Vertical Jump & Gravity Physics
      if (!this.isGrounded) {
        this.velocityY -= this.gravity * rawDeltaTime;
        this.y += this.velocityY * rawDeltaTime;

        if (this.y <= 0) {
          this.y = 0;
          this.velocityY = 0;
          this.isGrounded = true;
          this.canAirDash = true;
        }
      }
    }

    // Slide state timer
    if (this.isSliding) {
      this.slideTimer -= rawDeltaTime;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }

    // Update Global Hitbox Position
    const baseBox = this.isSliding ? this.slidingBox : this.standingBox;
    this.currentHitbox.min.set(
      this.currentX + baseBox.min.x,
      this.y + baseBox.min.y,
      baseBox.min.z
    );
    this.currentHitbox.max.set(
      this.currentX + baseBox.max.x,
      this.y + baseBox.max.y,
      baseBox.max.z
    );
  }

  checkCollision(obstacleBox) {
    return this.currentHitbox.intersectsBox(obstacleBox);
  }

  checkNearMiss(obstacleBox) {
    const expandedBox = this.currentHitbox.clone().expandByScalar(0.75);
    return expandedBox.intersectsBox(obstacleBox) && !this.checkCollision(obstacleBox);
  }
}
