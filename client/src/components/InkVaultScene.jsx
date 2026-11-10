import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import styles from './InkVaultScene.module.css';

const FALLBACK = ['#1F6F6B', '#E8845B', '#F2E8DC', '#12232E'];

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function detectMode() {
  if (typeof window === 'undefined') return 'static';
  if (prefersReducedMotion()) return 'static';
  if (!hasWebGL()) return 'static';
  if (window.innerWidth < 720) return 'static';
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return 'static';
  if (navigator.connection?.saveData) return 'static';
  return 'animated';
}

function useMode() {
  const [mode, setMode] = useState(detectMode);
  useEffect(() => {
    const onChange = () => setMode(detectMode());
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    media?.addEventListener?.('change', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      media?.removeEventListener?.('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, []);
  return mode;
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}

function Ribbon({ color, opacity, points, radius = 0.045 }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    return new THREE.TubeGeometry(curve, 80, radius, 5, false);
  }, [points, radius]);
  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

const SHAPES = [
  { kind: 'icosahedron', position: [-3.4, 1.2, -1], scale: 0.85, color: 0, opacity: 0.24 },
  { kind: 'torus', position: [2.8, 1.9, -2], scale: 0.9, color: 1, opacity: 0.22 },
  { kind: 'octahedron', position: [3.9, -1.3, 0.4], scale: 0.65, color: 2, opacity: 0.16 },
  { kind: 'dodecahedron', position: [-2.4, -2, 0.8], scale: 0.55, color: 3, opacity: 0.3 },
  { kind: 'icosahedron', position: [0.4, 2.6, -3], scale: 0.4, color: 1, opacity: 0.2 },
  { kind: 'torus', position: [-4.4, -0.6, -2.4], scale: 1.15, color: 2, opacity: 0.14 },
  { kind: 'box', position: [4.7, 2.7, -3.4], scale: 0.6, color: 0, opacity: 0.12 },
  { kind: 'octahedron', position: [0.8, -2.7, -1.5], scale: 0.42, color: 2, opacity: 0.2 },
  { kind: 'dodecahedron', position: [-0.8, 0.8, -4.2], scale: 0.7, color: 1, opacity: 0.14 },
  { kind: 'icosahedron', position: [5.4, -0.2, -2.6], scale: 0.35, color: 3, opacity: 0.24 },
  { kind: 'torus', position: [1.6, 3.2, -5], scale: 0.8, color: 0, opacity: 0.1 },
  { kind: 'box', position: [-5.2, 2.8, -4], scale: 0.75, color: 1, opacity: 0.1 },
];

function Geometry({ kind }) {
  switch (kind) {
    case 'torus':
      return <torusGeometry args={[0.6, 0.18, 20, 60]} />;
    case 'octahedron':
      return <octahedronGeometry args={[0.75, 0]} />;
    case 'dodecahedron':
      return <dodecahedronGeometry args={[0.7, 0]} />;
    case 'box':
      return <boxGeometry args={[0.8, 0.8, 0.8]} />;
    case 'icosahedron':
    default:
      return <icosahedronGeometry args={[0.78, 0]} />;
  }
}

function Shape({ shape, color }) {
  const mesh = useRef();
  useFrame((_state, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.x += delta * 0.035;
    mesh.current.rotation.y += delta * 0.05;
  });
  return (
    <Float speed={0.6} rotationIntensity={0.25} floatIntensity={0.7}>
      <mesh ref={mesh} position={shape.position} scale={shape.scale} frustumCulled={false}>
        <Geometry kind={shape.kind} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={shape.opacity}
          roughness={0.3}
          metalness={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </Float>
  );
}

function InkGroup({ palette }) {
  const group = useRef();

  useFrame((state) => {
    if (!group.current) return;
    const scroll = typeof window !== 'undefined' ? window.scrollY : 0;
    group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, state.pointer.x * 0.18, 0.035);
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -state.pointer.y * 0.12, 0.035);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, scroll * -0.0006, 0.05);
  });

  const colours = palette.length >= 4 ? palette : FALLBACK;
  const ribbons = useMemo(
    () => [
      {
        color: colours[0],
        opacity: 0.34,
        points: [
          [-6, -1.8, -2],
          [-3.2, 0.4, -1.4],
          [-0.6, -0.6, -2.2],
          [2.2, 1.1, -1.8],
          [5.6, -0.4, -2.6],
        ],
      },
      {
        color: colours[1],
        opacity: 0.26,
        points: [
          [-5.4, 2.2, -4],
          [-2.4, 1.4, -3.4],
          [0.4, 2.6, -4.2],
          [3.4, 1.2, -3.6],
          [5.8, 2.4, -4.6],
        ],
      },
      {
        color: colours[2],
        opacity: 0.16,
        points: [
          [-4.8, -3, -3],
          [-1.6, -2.2, -2.6],
          [1.2, -3.1, -3.2],
          [4.4, -2, -2.8],
        ],
      },
    ],
    [colours[0], colours[1], colours[2]]
  );

  return (
    <group ref={group}>
      {ribbons.map((ribbon, index) => (
        <Ribbon key={index} {...ribbon} />
      ))}
      {SHAPES.map((shape, index) => (
        <Shape key={index} shape={shape} color={colours[shape.color % colours.length]} />
      ))}
    </group>
  );
}

class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Decorative only: fall back quietly to the static gradient.
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export default function InkVaultScene({ palette = FALLBACK }) {
  const mode = useMode();
  const visible = usePageVisible();
  const colours = palette.length >= 4 ? palette : FALLBACK;

  return (
    <div className={styles.scene} aria-hidden="true">
      <div
        className={styles.static}
        style={{
          '--palette-a': colours[0],
          '--palette-b': colours[1],
          '--palette-c': colours[2],
          '--palette-d': colours[3],
        }}
      />
      {mode === 'animated' && (
        <SceneErrorBoundary fallback={null}>
          <div className={styles.canvas}>
            <Canvas
              frameloop={visible ? 'always' : 'never'}
              dpr={[1, 1.5]}
              camera={{ position: [0, 0, 8], fov: 42 }}
              gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
            >
              <fog attach="fog" args={['#071018', 9, 18]} />
              <ambientLight intensity={0.9} />
              <directionalLight position={[4, 6, 5]} intensity={1.2} color="#ffd9c2" />
              <directionalLight position={[-6, -3, 2]} intensity={0.6} color="#7fd9cf" />
              <InkGroup palette={colours} />
            </Canvas>
          </div>
        </SceneErrorBoundary>
      )}
      <div className={styles.vignette} />
    </div>
  );
}
