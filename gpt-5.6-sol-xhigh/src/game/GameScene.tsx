import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { RefObject } from "react";
import type { GameState } from "./types";
import {
  BOOST_PADS,
  CHECKPOINTS,
  COURSE_LENGTH,
  ENEMIES,
  OBSTACLES,
  RAILS,
  RAMPS,
  RINGS,
  enemyLateral,
  pathFrame,
  pathPoint,
  zoneAt,
} from "./world";

interface SceneProps {
  stateRef: RefObject<GameState>;
}

const trackColor = new THREE.Color();
const matrix = new THREE.Matrix4();

function applyFrame(object: THREE.Object3D, distance: number, x = 0, y = 0) {
  const frame = pathFrame(distance);
  object.position
    .copy(frame.position)
    .addScaledVector(frame.right, x)
    .addScaledVector(frame.up, y);
  object.quaternion.setFromRotationMatrix(matrix.makeBasis(frame.right, frame.up, frame.tangent));
  return frame;
}

function Track() {
  const surface = useRef<THREE.InstancedMesh>(null);
  const edges = useRef<THREE.InstancedMesh>(null);
  const laneMarks = useRef<THREE.InstancedMesh>(null);
  const step = 5;
  const count = Math.ceil(COURSE_LENGTH / step);

  useLayoutEffect(() => {
    if (!surface.current || !edges.current || !laneMarks.current) return;
    const dummy = new THREE.Object3D();
    let edgeIndex = 0;
    let laneIndex = 0;

    for (let index = 0; index < count; index += 1) {
      const distance = index * step + step * 0.5;
      const zone = zoneAt(distance);
      const frame = applyFrame(dummy, distance, 0, -0.18);
      dummy.scale.set(13.7, 0.34, step + 0.28);
      dummy.updateMatrix();
      surface.current.setMatrixAt(index, dummy.matrix);

      if (zone === "Tidal Expanse") trackColor.set(index % 2 ? "#155766" : "#124b5a");
      else if (zone === "Neon Foundry") trackColor.set(index % 2 ? "#1d1936" : "#17142c");
      else trackColor.set(index % 2 ? "#29465a" : "#233b51");
      surface.current.setColorAt(index, trackColor);

      for (const side of [-1, 1]) {
        dummy.position
          .copy(frame.position)
          .addScaledVector(frame.right, side * 6.72)
          .addScaledVector(frame.up, 0.12);
        dummy.quaternion.setFromRotationMatrix(matrix.makeBasis(frame.right, frame.up, frame.tangent));
        dummy.scale.set(0.22, 0.2, step + 0.35);
        dummy.updateMatrix();
        edges.current.setMatrixAt(edgeIndex, dummy.matrix);
        edgeIndex += 1;
      }

      if (index % 2 === 0) {
        for (const lane of [-2.28, 2.28]) {
          dummy.position
            .copy(frame.position)
            .addScaledVector(frame.right, lane)
            .addScaledVector(frame.up, 0.015);
          dummy.scale.set(0.055, 0.025, 2.3);
          dummy.updateMatrix();
          laneMarks.current.setMatrixAt(laneIndex, dummy.matrix);
          laneIndex += 1;
        }
      }
    }

    surface.current.instanceMatrix.needsUpdate = true;
    if (surface.current.instanceColor) surface.current.instanceColor.needsUpdate = true;
    edges.current.instanceMatrix.needsUpdate = true;
    laneMarks.current.instanceMatrix.needsUpdate = true;
  }, [count]);

  return (
    <group>
      <instancedMesh ref={surface} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={0.66} metalness={0.32} />
      </instancedMesh>
      <instancedMesh ref={edges} args={[undefined, undefined, count * 2]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#55f6e8" emissive="#16a8ac" emissiveIntensity={2.2} metalness={0.75} />
      </instancedMesh>
      <instancedMesh ref={laneMarks} args={[undefined, undefined, Math.ceil(count / 2) * 2]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#8fe8e2" transparent opacity={0.34} />
      </instancedMesh>
    </group>
  );
}

function CollectibleRings({ stateRef }: SceneProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const lastCollected = useRef(-1);

  const updateMatrices = () => {
    const state = stateRef.current;
    if (!mesh.current || !state) return;
    const dummy = new THREE.Object3D();
    for (let index = 0; index < RINGS.length; index += 1) {
      const ring = RINGS[index];
      applyFrame(dummy, ring.d, ring.x, ring.y);
      const scale = state.collected.has(ring.id) ? 0 : 1;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    lastCollected.current = state.collected.size;
  };

  useLayoutEffect(updateMatrices, [stateRef]);

  useFrame(() => {
    const state = stateRef.current;
    if (!mesh.current || !state) return;
    if (lastCollected.current !== state.collected.size) updateMatrices();
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, RINGS.length]} frustumCulled={false}>
      <torusGeometry args={[0.34, 0.095, 8, 16]} />
      <meshStandardMaterial
        color="#ffe36c"
        emissive="#ff9f1a"
        emissiveIntensity={1.8}
        metalness={0.8}
        roughness={0.2}
      />
    </instancedMesh>
  );
}

function RampMeshes() {
  return (
    <group>
      {RAMPS.map((ramp) => {
        const frame = pathFrame(ramp.d + 2.7);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tangent),
        );
        return (
          <group key={ramp.id} position={frame.position} quaternion={quaternion}>
            <mesh position={[ramp.x, 0.2, 0]} rotation={[-0.17, 0, 0]}>
              <boxGeometry args={[ramp.width, 0.3, 6.6]} />
              <meshStandardMaterial color="#ecf8ea" emissive="#22d3a6" emissiveIntensity={0.7} metalness={0.55} />
            </mesh>
            <mesh position={[ramp.x, 0.43, 0]} rotation={[-0.17, 0, 0]}>
              <boxGeometry args={[ramp.width * 0.72, 0.03, 5.2]} />
              <meshBasicMaterial color="#71ffe0" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function BoostPads() {
  return (
    <group>
      {BOOST_PADS.map((pad) => {
        const frame = pathFrame(pad.d);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tangent),
        );
        return (
          <group key={pad.id} position={frame.position} quaternion={quaternion}>
            <mesh position={[pad.x, 0.035, 0]}>
              <boxGeometry args={[2.15, 0.07, 4.5]} />
              <meshStandardMaterial color="#123d4b" emissive="#00f5d4" emissiveIntensity={1.6} />
            </mesh>
            {[-0.55, 0, 0.55].map((x) => (
              <mesh key={x} position={[pad.x + x, 0.08, 0.45]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.2, 1.3, 3]} />
                <meshBasicMaterial color="#d4fff8" />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function RailMeshes() {
  const segments = useMemo(
    () =>
      RAILS.flatMap((rail) => {
        const output: Array<{ key: string; d: number; x: number; height: number }> = [];
        for (let d = rail.start; d < rail.end; d += 4) {
          output.push({ key: `${rail.id}-${d}`, d: d + 2, x: rail.x, height: rail.height });
        }
        return output;
      }),
    [],
  );

  const railMesh = useRef<THREE.InstancedMesh>(null);
  const supports = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!railMesh.current || !supports.current) return;
    const dummy = new THREE.Object3D();
    segments.forEach((segment, index) => {
      const frame = applyFrame(dummy, segment.d, segment.x, segment.height);
      dummy.scale.set(0.12, 0.12, 4.2);
      dummy.updateMatrix();
      railMesh.current?.setMatrixAt(index, dummy.matrix);

      dummy.position
        .copy(frame.position)
        .addScaledVector(frame.right, segment.x)
        .addScaledVector(frame.up, segment.height * 0.5);
      dummy.scale.set(0.08, segment.height, 0.08);
      dummy.updateMatrix();
      supports.current?.setMatrixAt(index, dummy.matrix);
    });
    railMesh.current.instanceMatrix.needsUpdate = true;
    supports.current.instanceMatrix.needsUpdate = true;
  }, [segments]);

  return (
    <group>
      <instancedMesh ref={railMesh} args={[undefined, undefined, segments.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#fff09d" emissive="#ffb000" emissiveIntensity={2.1} metalness={0.9} />
      </instancedMesh>
      <instancedMesh ref={supports} args={[undefined, undefined, segments.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#52616e" metalness={0.8} roughness={0.35} />
      </instancedMesh>
    </group>
  );
}

function Obstacle({ index }: { index: number }) {
  const obstacle = OBSTACLES[index];
  const frame = pathFrame(obstacle.d);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tangent),
  );
  return (
    <group position={frame.position} quaternion={quaternion}>
      <mesh position={[obstacle.x, 0.72, 0]}>
        <boxGeometry args={[obstacle.width, 1.35, 0.75]} />
        <meshStandardMaterial color="#ff4d6d" emissive="#8f102d" emissiveIntensity={0.85} metalness={0.5} />
      </mesh>
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[obstacle.x + x * obstacle.width * 0.7, 0.75, -0.39]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.1, 0.55, 0.04]} />
          <meshBasicMaterial color="#ffe6a7" />
        </mesh>
      ))}
    </group>
  );
}

function EnemyDrone({ index, stateRef }: { index: number; stateRef: RefObject<GameState> }) {
  const enemy = ENEMIES[index];
  const root = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const frame = useMemo(() => pathFrame(enemy.d), [enemy]);
  const orientation = useMemo(
    () => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tangent)),
    [frame],
  );

  useFrame(({ clock }) => {
    const state = stateRef.current;
    if (!root.current || !state) return;
    const lateral = enemyLateral(enemy, state.elapsed);
    root.current.position
      .copy(frame.position)
      .addScaledVector(frame.right, lateral)
      .addScaledVector(frame.up, 1.02 + Math.sin(clock.elapsedTime * 3 + enemy.phase) * 0.12);
    root.current.quaternion.copy(orientation);
    root.current.visible = !state.destroyed.has(enemy.id);
    if (rotor.current) rotor.current.rotation.y += 0.22;
  });

  return (
    <group ref={root}>
      <mesh>
        <octahedronGeometry args={[0.62, 0]} />
        <meshStandardMaterial color="#901b53" emissive="#ff2b7f" emissiveIntensity={0.6} metalness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.47]}>
        <sphereGeometry args={[0.18, 10, 8]} />
        <meshBasicMaterial color="#ffdf5d" />
      </mesh>
      <group ref={rotor}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[2.1, 0.06, 0.13]} />
          <meshBasicMaterial color="#ff6ba6" />
        </mesh>
        <mesh>
          <boxGeometry args={[0.13, 0.06, 2.1]} />
          <meshBasicMaterial color="#ff6ba6" />
        </mesh>
      </group>
    </group>
  );
}

function Checkpoints() {
  const gates = [...CHECKPOINTS, COURSE_LENGTH - 12];
  return (
    <group>
      {gates.map((distance, index) => {
        const frame = pathFrame(distance);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tangent),
        );
        return (
          <group key={distance} position={frame.position} quaternion={quaternion}>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 6.1, 3, 0]}>
                <boxGeometry args={[0.28, 6, 0.35]} />
                <meshStandardMaterial color="#95fff0" emissive="#21d4c5" emissiveIntensity={2} />
              </mesh>
            ))}
            <mesh position={[0, 5.8, 0]}>
              <boxGeometry args={[12.5, 0.28, 0.35]} />
              <meshStandardMaterial
                color={index === gates.length - 1 ? "#fff0a8" : "#95fff0"}
                emissive={index === gates.length - 1 ? "#ffac33" : "#21d4c5"}
                emissiveIntensity={2}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

interface Decoration {
  distance: number;
  side: number;
  offset: number;
  height: number;
  scale: number;
  twist: number;
}

function seeded(seed: number) {
  return Math.abs(Math.sin(seed * 91.713) * 43758.5453) % 1;
}

function Decorations() {
  const coast = useRef<THREE.InstancedMesh>(null);
  const towers = useRef<THREE.InstancedMesh>(null);
  const islands = useRef<THREE.InstancedMesh>(null);
  const coastData = useMemo<Decoration[]>(() => {
    const output: Decoration[] = [];
    for (let d = 20; d < 875; d += 24) {
      for (const side of [-1, 1]) {
        output.push({
          distance: d,
          side,
          offset: 18 + seeded(d + side) * 34,
          height: -3 - seeded(d * 2) * 5,
          scale: 3 + seeded(d * 3) * 8,
          twist: seeded(d * 4) * Math.PI,
        });
      }
    }
    return output;
  }, []);
  const towerData = useMemo<Decoration[]>(() => {
    const output: Decoration[] = [];
    for (let d = 890; d < 1740; d += 31) {
      for (const side of [-1, 1]) {
        output.push({
          distance: d,
          side,
          offset: 20 + seeded(d + side) * 27,
          height: 5 + seeded(d * 2) * 15,
          scale: 2.5 + seeded(d * 3) * 4,
          twist: seeded(d * 4) * 0.3,
        });
      }
    }
    return output;
  }, []);
  const islandData = useMemo<Decoration[]>(() => {
    const output: Decoration[] = [];
    for (let d = 1760; d < COURSE_LENGTH; d += 28) {
      for (const side of [-1, 1]) {
        output.push({
          distance: d,
          side,
          offset: 19 + seeded(d + side) * 42,
          height: -6 + seeded(d * 2) * 12,
          scale: 3 + seeded(d * 3) * 8,
          twist: seeded(d * 4) * Math.PI,
        });
      }
    }
    return output;
  }, []);

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    coastData.forEach((item, index) => {
      const frame = applyFrame(dummy, item.distance, item.side * item.offset, item.height);
      dummy.quaternion.setFromAxisAngle(frame.up, item.twist);
      dummy.scale.set(item.scale * 0.8, item.scale, item.scale * 0.8);
      dummy.updateMatrix();
      coast.current?.setMatrixAt(index, dummy.matrix);
    });
    towerData.forEach((item, index) => {
      applyFrame(dummy, item.distance, item.side * item.offset, item.height * 0.5 - 2);
      dummy.scale.set(item.scale, item.height, item.scale);
      dummy.updateMatrix();
      towers.current?.setMatrixAt(index, dummy.matrix);
    });
    islandData.forEach((item, index) => {
      const frame = applyFrame(dummy, item.distance, item.side * item.offset, item.height);
      dummy.quaternion.setFromAxisAngle(frame.up, item.twist);
      dummy.scale.set(item.scale, item.scale * 0.55, item.scale);
      dummy.updateMatrix();
      islands.current?.setMatrixAt(index, dummy.matrix);
    });
    for (const mesh of [coast.current, towers.current, islands.current]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  }, [coastData, islandData, towerData]);

  return (
    <group>
      <mesh position={[0, -8, 350]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[650, 1150]} />
        <meshStandardMaterial color="#087f9c" emissive="#024f69" emissiveIntensity={0.35} roughness={0.25} />
      </mesh>
      <instancedMesh ref={coast} args={[undefined, undefined, coastData.length]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#244f57" roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={towers} args={[undefined, undefined, towerData.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#221b3e" emissive="#461b67" emissiveIntensity={0.5} metalness={0.72} />
      </instancedMesh>
      <instancedMesh ref={islands} args={[undefined, undefined, islandData.length]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#47677a" roughness={0.78} />
      </instancedMesh>
    </group>
  );
}

function Runner({ stateRef }: SceneProps) {
  const root = useRef<THREE.Group>(null);
  const model = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const trails = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    const state = stateRef.current;
    if (!state || !root.current) return;
    const frame = pathFrame(state.renderDistance);
    root.current.position
      .copy(frame.position)
      .addScaledVector(frame.right, state.renderX)
      .addScaledVector(frame.up, 0.9 + state.renderY);
    root.current.quaternion.setFromRotationMatrix(matrix.makeBasis(frame.right, frame.up, frame.tangent));
    root.current.visible = state.invulnerable <= 0 || Math.floor(clock.elapsedTime * 18) % 2 === 0;

    if (model.current) {
      model.current.rotation.z = THREE.MathUtils.damp(model.current.rotation.z, -state.vx * 0.035, 10, delta);
      model.current.rotation.x = THREE.MathUtils.damp(
        model.current.rotation.x,
        state.boosting ? -0.27 : state.onRail ? -0.14 : 0,
        8,
        delta,
      );
    }

    const stride = state.grounded ? Math.sin(state.elapsed * Math.min(26, state.speed * 0.42)) * 0.75 : -0.35;
    if (leftLeg.current) leftLeg.current.rotation.x = THREE.MathUtils.damp(leftLeg.current.rotation.x, stride, 16, delta);
    if (rightLeg.current) rightLeg.current.rotation.x = THREE.MathUtils.damp(rightLeg.current.rotation.x, -stride, 16, delta);
    if (leftArm.current) leftArm.current.rotation.x = -stride * 0.72;
    if (rightArm.current) rightArm.current.rotation.x = stride * 0.72;
    if (trails.current) trails.current.visible = state.boosting;
    if (sparks.current) {
      sparks.current.visible = state.onRail;
      sparks.current.rotation.z += delta * 12;
    }

    if (shadow.current) {
      shadow.current.position
        .copy(frame.position)
        .addScaledVector(frame.right, state.renderX)
        .addScaledVector(frame.up, 0.025);
      shadow.current.quaternion.copy(root.current.quaternion);
      const size = Math.max(0.35, 1 - state.renderY * 0.12);
      shadow.current.scale.setScalar(size);
    }
  });

  return (
    <>
      <group ref={shadow}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.72, 20]} />
          <meshBasicMaterial color="#061013" transparent opacity={0.34} depthWrite={false} />
        </mesh>
      </group>
      <group ref={root}>
        <group ref={model}>
          <mesh position={[0, 0.54, 0]}>
            <capsuleGeometry args={[0.36, 0.56, 6, 12]} />
            <meshStandardMaterial color="#d9fff8" metalness={0.52} roughness={0.28} />
          </mesh>
          <mesh position={[0, 1.25, 0.03]}>
            <sphereGeometry args={[0.38, 16, 12]} />
            <meshStandardMaterial color="#112534" metalness={0.72} roughness={0.22} />
          </mesh>
          <mesh position={[0, 1.28, 0.335]} scale={[1.25, 0.42, 0.15]}>
            <sphereGeometry args={[0.25, 14, 8]} />
            <meshBasicMaterial color="#54ffe1" />
          </mesh>
          <mesh position={[0, 0.57, 0.34]}>
            <boxGeometry args={[0.34, 0.45, 0.08]} />
            <meshStandardMaterial color="#ffcc4d" emissive="#d07900" emissiveIntensity={1.15} />
          </mesh>
          <group ref={leftArm} position={[-0.46, 0.84, 0]}>
            <mesh position={[0, -0.32, 0]}>
              <capsuleGeometry args={[0.11, 0.48, 4, 8]} />
              <meshStandardMaterial color="#143849" metalness={0.6} />
            </mesh>
          </group>
          <group ref={rightArm} position={[0.46, 0.84, 0]}>
            <mesh position={[0, -0.32, 0]}>
              <capsuleGeometry args={[0.11, 0.48, 4, 8]} />
              <meshStandardMaterial color="#143849" metalness={0.6} />
            </mesh>
          </group>
          <group ref={leftLeg} position={[-0.2, 0.12, 0]}>
            <mesh position={[0, -0.38, 0]}>
              <capsuleGeometry args={[0.14, 0.52, 4, 8]} />
              <meshStandardMaterial color="#102c3a" metalness={0.65} />
            </mesh>
            <mesh position={[0, -0.68, 0.16]} scale={[1, 0.55, 1.5]}>
              <sphereGeometry args={[0.2, 10, 8]} />
              <meshStandardMaterial color="#ffcc4d" emissive="#7c4300" emissiveIntensity={0.7} />
            </mesh>
          </group>
          <group ref={rightLeg} position={[0.2, 0.12, 0]}>
            <mesh position={[0, -0.38, 0]}>
              <capsuleGeometry args={[0.14, 0.52, 4, 8]} />
              <meshStandardMaterial color="#102c3a" metalness={0.65} />
            </mesh>
            <mesh position={[0, -0.68, 0.16]} scale={[1, 0.55, 1.5]}>
              <sphereGeometry args={[0.2, 10, 8]} />
              <meshStandardMaterial color="#ffcc4d" emissive="#7c4300" emissiveIntensity={0.7} />
            </mesh>
          </group>
          <group ref={trails}>
            {[-0.2, 0.2].map((x) => (
              <mesh key={x} position={[x, -0.58, -0.75]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.13, 1.45, 8]} />
                <meshBasicMaterial color="#65ffe3" transparent opacity={0.7} />
              </mesh>
            ))}
          </group>
          <group ref={sparks} position={[0, -0.87, 0]}>
            {[0, 1, 2, 3].map((index) => (
              <mesh key={index} position={[Math.cos(index * 1.57) * 0.35, 0, Math.sin(index * 1.57) * 0.35]}>
                <sphereGeometry args={[0.055, 5, 4]} />
                <meshBasicMaterial color="#fff6a1" />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </>
  );
}

function SpeedLines({ stateRef }: SceneProps) {
  const root = useRef<THREE.LineSegments>(null);
  const material = useRef<THREE.LineBasicMaterial>(null);
  const count = 44;
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        x: (seeded(index + 2) - 0.5) * 18,
        y: seeded(index + 12) * 9 - 2,
        z: seeded(index + 22) * 36 - 10,
      })),
    [],
  );
  const positions = useMemo(() => new Float32Array(count * 2 * 3), []);

  useFrame((_, delta) => {
    const state = stateRef.current;
    if (!root.current || !material.current || !state) return;
    const frame = pathFrame(state.renderDistance);
    root.current.position.copy(frame.position).addScaledVector(frame.up, 1.5);
    root.current.quaternion.setFromRotationMatrix(matrix.makeBasis(frame.right, frame.up, frame.tangent));
    const speedFactor = THREE.MathUtils.clamp((state.speed - 55) / 65, 0, 1);
    material.current.opacity = THREE.MathUtils.damp(material.current.opacity, speedFactor * 0.52, 8, delta);

    const attribute = root.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < count; index += 1) {
      const seed = seeds[index];
      const z = ((seed.z - state.elapsed * state.speed * 0.7 + 80) % 36) - 12;
      attribute.setXYZ(index * 2, seed.x, seed.y, z);
      attribute.setXYZ(index * 2 + 1, seed.x, seed.y, z - 1.2 - speedFactor * 3.2);
    }
    attribute.needsUpdate = true;
  });

  return (
    <lineSegments ref={root}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial ref={material} color="#cafff6" transparent opacity={0} depthWrite={false} />
    </lineSegments>
  );
}

const skyVertex = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform vec3 glowColor;
  varying vec3 vWorldPosition;
  void main() {
    vec3 direction = normalize(vWorldPosition - cameraPosition);
    float horizon = smoothstep(-0.45, 0.7, direction.y);
    float glow = pow(max(dot(direction, normalize(vec3(-0.35, 0.38, 0.85))), 0.0), 34.0);
    vec3 color = mix(bottomColor, topColor, horizon) + glowColor * glow * 1.3;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function Atmosphere({ stateRef }: SceneProps) {
  const sky = useRef<THREE.Mesh>(null);
  const { camera, scene } = useThree();
  const uniforms = useMemo(
    () => ({
      topColor: { value: new THREE.Color("#07405a") },
      bottomColor: { value: new THREE.Color("#5ad9d2") },
      glowColor: { value: new THREE.Color("#ffe49b") },
    }),
    [],
  );
  const targetTop = useMemo(() => new THREE.Color(), []);
  const targetBottom = useMemo(() => new THREE.Color(), []);
  const targetFog = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    scene.fog = new THREE.FogExp2("#2a8c98", 0.0042);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useFrame((_, delta) => {
    const state = stateRef.current;
    if (!state) return;
    if (sky.current) sky.current.position.copy(camera.position);
    const zone = zoneAt(state.renderDistance);
    if (zone === "Tidal Expanse") {
      targetTop.set("#063c58");
      targetBottom.set("#62d6cf");
      targetFog.set("#258d99");
    } else if (zone === "Neon Foundry") {
      targetTop.set("#080616");
      targetBottom.set("#451a63");
      targetFog.set("#171127");
    } else {
      targetTop.set("#246b9c");
      targetBottom.set("#e4b5a4");
      targetFog.set("#7193a4");
    }
    const blend = 1 - Math.exp(-delta * 1.2);
    uniforms.topColor.value.lerp(targetTop, blend);
    uniforms.bottomColor.value.lerp(targetBottom, blend);
    if (scene.fog instanceof THREE.FogExp2) scene.fog.color.lerp(targetFog, blend);
  });

  return (
    <mesh ref={sky} scale={260} renderOrder={-10}>
      <sphereGeometry args={[1, 24, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={skyVertex}
        fragmentShader={skyFragment}
      />
    </mesh>
  );
}

function CameraRig({ stateRef }: SceneProps) {
  const { camera } = useThree();
  const initialized = useRef(false);
  const lastDistance = useRef(0);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const cameraUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((_, delta) => {
    const state = stateRef.current;
    if (!state) return;
    const frame = pathFrame(state.renderDistance);
    const prediction = 11 + state.speed * 0.13;
    pathPoint(Math.min(COURSE_LENGTH, state.renderDistance + prediction), look);
    look.addScaledVector(frame.right, state.renderX * 0.3).addScaledVector(frame.up, 1.15);
    const back = 7.7 + state.speed * 0.052;
    const height = 3.45 + state.speed * 0.012;
    desired
      .copy(frame.position)
      .addScaledVector(frame.right, state.renderX * 0.5)
      .addScaledVector(frame.tangent, -back)
      .addScaledVector(frame.up, height);

    if (state.shake > 0) {
      desired.addScaledVector(frame.right, (Math.random() - 0.5) * state.shake);
      desired.addScaledVector(frame.up, (Math.random() - 0.5) * state.shake);
    }

    const teleported = Math.abs(state.renderDistance - lastDistance.current) > 100;
    if (!initialized.current || teleported) {
      camera.position.copy(desired);
      cameraUp.copy(frame.up);
      initialized.current = true;
    } else {
      const damping = 1 - Math.exp(-delta * (state.onRail ? 8 : 6.5));
      camera.position.lerp(desired, damping);
      cameraUp.lerp(frame.up, 1 - Math.exp(-delta * 7)).normalize();
    }
    camera.up.copy(cameraUp);
    camera.lookAt(look);

    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = 65 + THREE.MathUtils.clamp((state.speed - 45) * 0.17, 0, 13) + (state.boosting ? 5 : 0);
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5, delta);
      camera.updateProjectionMatrix();
    }
    lastDistance.current = state.renderDistance;
  });
  return null;
}

export function GameScene({ stateRef }: SceneProps) {
  return (
    <>
      <Atmosphere stateRef={stateRef} />
      <hemisphereLight args={["#bbfff5", "#102131", 1.45]} />
      <directionalLight position={[-18, 34, -12]} color="#fff0cf" intensity={2.4} />
      <Track />
      <Decorations />
      <RampMeshes />
      <BoostPads />
      <RailMeshes />
      <CollectibleRings stateRef={stateRef} />
      {OBSTACLES.map((_, index) => (
        <Obstacle key={index} index={index} />
      ))}
      {ENEMIES.map((_, index) => (
        <EnemyDrone key={index} index={index} stateRef={stateRef} />
      ))}
      <Checkpoints />
      <Runner stateRef={stateRef} />
      <SpeedLines stateRef={stateRef} />
      <CameraRig stateRef={stateRef} />
    </>
  );
}