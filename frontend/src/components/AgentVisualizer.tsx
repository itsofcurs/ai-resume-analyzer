import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, Html, OrbitControls, Float, Sparkles, Box, Sphere, Dodecahedron, Icosahedron, Torus } from '@react-three/drei';
import * as THREE from 'three';

interface AgentVisualizerProps {
  status: string | null;
}

const STAGES = [
  { id: 'PENDING', label: 'Upload', color: '#6366f1', shape: 'box' },           
  { id: 'EXTRACTING', label: 'Extract', color: '#8b5cf6', shape: 'dodecahedron' },        
  { id: 'ANALYZING', label: 'Parse', color: '#ec4899', shape: 'dodecahedron' },           
  { id: 'EMBEDDING', label: 'Embed', color: '#f59e0b', shape: 'icosahedron' },           
  { id: 'SCORING', label: 'ATS Score', color: '#3b82f6', shape: 'icosahedron' },         
  { id: 'RANKING', label: 'Rank', color: '#06b6d4', shape: 'icosahedron' },              
  { id: 'PROCESSED', label: 'Complete', color: '#10b981', shape: 'torus' }         
];

const getStageIndex = (status: string | null) => {
  if (!status) return -1;
  const i = STAGES.findIndex(s => s.id === status);
  if (status === 'PROCESSED') return STAGES.length;
  return i >= 0 ? i : 0;
};

// A small glowing particle that travels along the lines
const DataPacket = ({ start, end, active }: { start: THREE.Vector3, end: THREE.Vector3, active: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current && active) {
      const time = (state.clock.elapsedTime * 0.5) % 1;
      meshRef.current.position.lerpVectors(start, end, time);
      meshRef.current.visible = true;
    } else if (meshRef.current) {
      meshRef.current.visible = false;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.08, 16, 16]} />
      <meshBasicMaterial color="#38bdf8" />
    </mesh>
  );
};

const NodeShape = ({ shape, color, isActive, isCompleted, isFailed }: any) => {
  const meshRef = useRef<any>(null);
  const materialProps = {
    color: isFailed ? '#ef4444' : isCompleted ? '#10b981' : isActive ? color : '#334155',
    emissive: isFailed ? '#ef4444' : isActive ? color : '#000000',
    emissiveIntensity: isActive ? 0.8 : 0,
    roughness: 0.1,
    metalness: 0.8,
    wireframe: !isCompleted && !isActive && !isFailed
  };

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.5;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
      if (isActive && !isFailed) {
        const scale = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.15;
        meshRef.current.scale.set(scale, scale, scale);
      } else {
        meshRef.current.scale.set(1, 1, 1);
      }
    }
  });

  const size = 0.3;
  if (shape === 'box') return <Box ref={meshRef} args={[size, size, size]}><meshStandardMaterial {...materialProps} /></Box>;
  if (shape === 'dodecahedron') return <Dodecahedron ref={meshRef} args={[size*1.2]}><meshStandardMaterial {...materialProps} /></Dodecahedron>;
  if (shape === 'icosahedron') return <Icosahedron ref={meshRef} args={[size*1.2]}><meshStandardMaterial {...materialProps} /></Icosahedron>;
  if (shape === 'torus') return <Torus ref={meshRef} args={[size, size*0.3, 16, 32]}><meshStandardMaterial {...materialProps} /></Torus>;
  
  return <Sphere ref={meshRef} args={[size, 32, 32]}><meshStandardMaterial {...materialProps} /></Sphere>;
};

const Node = ({ position, label, shape, color, isActive, isCompleted, isFailed, isEven }: any) => {
  return (
    <group position={position}>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1} floatingRange={[-0.1, 0.1]}>
        <NodeShape shape={shape} color={color} isActive={isActive} isCompleted={isCompleted} isFailed={isFailed} />
        {isActive && !isFailed && (
          <Sparkles count={20} scale={1.5} size={2} speed={0.4} opacity={0.8} color={color} />
        )}
      </Float>
      
      <Html position={[0, isEven ? -0.7 : 0.7, 0]} center className="pointer-events-none">
        <div className={`px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap backdrop-blur-md border shadow-lg transition-all ${
          isActive ? 'bg-white/10 border-white/30 text-white scale-110' :
          isCompleted ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
          isFailed ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' :
          'bg-slate-800/50 border-slate-700/50 text-slate-400'
        }`}>
          {label}
        </div>
      </Html>
    </group>
  );
};

export const AgentVisualizer: React.FC<AgentVisualizerProps> = ({ status }) => {
  const currentIndex = getStageIndex(status);
  const isFailed = status === 'FAILED';

  // Create a wider curved layout
  const nodes = useMemo(() => {
    return STAGES.map((stage, i) => {
      // Space them out significantly along the X axis
      const spacing = 1.8; 
      const x = (i - (STAGES.length - 1) / 2) * spacing;
      
      // Gentle curve in Z so it feels 3D, but not so tight it clumps them
      const z = Math.abs(x) * -0.2; 
      
      // Slight wave in height
      const y = Math.sin(i * Math.PI * 0.5) * 0.2;

      return { 
        ...stage, 
        position: new THREE.Vector3(x, y, z)
      };
    });
  }, []);

  return (
    <div className="w-full h-64 bg-gradient-to-b from-slate-900 to-slate-950 rounded-xl overflow-hidden relative shadow-inner mb-6 border border-slate-700/50">
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 bg-slate-900/60 backdrop-blur-sm py-1 px-3 rounded-full border border-slate-700/50 shadow-lg">
          <div className={`w-2 h-2 rounded-full ${status === 'PROCESSED' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : isFailed ? 'bg-rose-500' : 'bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]'}`}></div>
          LangGraph Intelligence Pipeline
        </h3>
      </div>
      
      <Canvas camera={{ position: [0, 2, 7], fov: 45 }}>
        <color attach="background" args={['#020617']} />
        <ambientLight intensity={0.4} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} color="#ffffff" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#3b82f6" />
        
        <OrbitControls 
          enablePan={false} 
          enableZoom={true} 
          minDistance={3} 
          maxDistance={12}
          maxPolarAngle={Math.PI / 2} // don't go below ground
          autoRotate={!isFailed && status !== 'PROCESSED'}
          autoRotateSpeed={0.5}
        />

        {/* Draw connecting lines and data packets */}
        {nodes.map((node, i) => {
          if (i === nodes.length - 1) return null;
          const nextNode = nodes[i + 1];
          const isLineActive = currentIndex > i && !isFailed;
          const isCurrentlyProcessing = currentIndex === i && !isFailed && status !== 'PROCESSED';
          
          return (
            <group key={`connection-${i}`}>
              <Line
                points={[node.position, nextNode.position]}
                color={isLineActive ? '#10b981' : '#334155'}
                lineWidth={isLineActive ? 2 : 1}
                opacity={0.6}
                transparent
              />
              <DataPacket 
                start={node.position} 
                end={nextNode.position} 
                active={isCurrentlyProcessing} 
              />
            </group>
          );
        })}

        {/* Draw Nodes */}
        {nodes.map((node, i) => (
          <Node
            key={node.id}
            position={node.position}
            label={node.label}
            shape={node.shape}
            color={node.color}
            isActive={currentIndex === i}
            isCompleted={currentIndex > i || status === 'PROCESSED'}
            isFailed={isFailed && currentIndex === i}
            isEven={i % 2 === 0}
          />
        ))}
      </Canvas>
    </div>
  );
};

