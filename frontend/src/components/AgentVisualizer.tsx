import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, Line, Text } from '@react-three/drei';
import * as THREE from 'three';

interface AgentVisualizerProps {
  status: string | null;
}

const STAGES = [
  { id: 'PENDING', label: 'Upload & Queue', color: '#6366f1' },       // Indigo
  { id: 'EXTRACTING', label: 'Text Extraction', color: '#8b5cf6' },    // Violet
  { id: 'ANALYZING', label: 'Agent LLM Parse', color: '#ec4899' },     // Pink
  { id: 'PROCESSED', label: 'Vector Store & Done', color: '#10b981' }  // Green
];

// Helper to determine index
const getStageIndex = (status: string | null) => {
  if (!status) return -1;
  const i = STAGES.findIndex(s => s.id === status);
  // If PROCESSED, show all as complete
  if (status === 'PROCESSED') return STAGES.length;
  // If FAILED, we might just color everything red, but let's just return the current
  return i >= 0 ? i : 0;
};

const Node = ({ position, label, isActive, isCompleted, isFailed }: any) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      if (isActive && !isFailed) {
        // Pulsate
        const scale = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.1;
        meshRef.current.scale.set(scale, scale, scale);
      } else {
        meshRef.current.scale.set(1, 1, 1);
      }
    }
  });

  let color = '#475569'; // Slate 600 (inactive)
  if (isFailed) color = '#ef4444'; // Red
  else if (isCompleted) color = '#10b981'; // Green
  else if (isActive) color = '#3b82f6'; // Blue pulse

  return (
    <group position={position}>
      <Sphere ref={meshRef} args={[0.3, 32, 32]}>
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={isActive ? 0.8 : 0.2} 
          roughness={0.2} 
          metalness={0.8}
        />
      </Sphere>
      <Text position={[0, -0.6, 0]} fontSize={0.2} color="white" anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  );
};

export const AgentVisualizer: React.FC<AgentVisualizerProps> = ({ status }) => {
  const currentIndex = getStageIndex(status);
  const isFailed = status === 'FAILED';

  // Positions for 4 nodes
  const nodes = useMemo(() => {
    return STAGES.map((stage, i) => {
      // Line them up horizontally
      const x = (i - (STAGES.length - 1) / 2) * 2;
      return { ...stage, position: [x, 0, 0] as [number, number, number] };
    });
  }, []);

  return (
    <div className="w-full h-48 bg-slate-900 rounded-xl overflow-hidden relative shadow-inner mb-6 border border-slate-700">
      <div className="absolute top-2 left-3 z-10">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status === 'PROCESSED' ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`}></div>
          LangGraph Agent Workflow Tracker
        </h3>
      </div>
      
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        
        {/* Draw connecting lines */}
        {nodes.map((node, i) => {
          if (i === nodes.length - 1) return null;
          const nextNode = nodes[i + 1];
          const isLineActive = currentIndex > i && !isFailed;
          return (
            <Line
              key={`line-${i}`}
              points={[node.position, nextNode.position]}
              color={isLineActive ? '#10b981' : '#475569'}
              lineWidth={isLineActive ? 3 : 1}
              dashed={!isLineActive}
            />
          );
        })}

        {/* Draw Nodes */}
        {nodes.map((node, i) => (
          <Node
            key={node.id}
            position={node.position}
            label={node.label}
            isActive={currentIndex === i}
            isCompleted={currentIndex > i || status === 'PROCESSED'}
            isFailed={isFailed && currentIndex === i}
          />
        ))}
      </Canvas>
    </div>
  );
};
