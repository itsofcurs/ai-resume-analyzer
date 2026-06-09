import React, { useEffect, useRef, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

interface GraphVisualizationProps {
  knowledgeGraph: any;
  candidateName: string;
}

export const GraphVisualization: React.FC<GraphVisualizationProps> = ({ knowledgeGraph, candidateName }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight || 400
      });
    }
  }, []);

  if (!knowledgeGraph) return <div className="text-sm text-slate-500">No Knowledge Graph Data Available</div>;

  const nodes: any[] = [];
  const links: any[] = [];

  // Center node: Candidate
  nodes.push({ id: 'candidate', name: candidateName, group: 1, val: 20 });

  // Connected Skills
  knowledgeGraph.connectedSkills?.forEach((s: any) => {
    nodes.push({ id: `skill_${s.skill}`, name: s.skill, group: 2, val: s.weight / 10 });
    links.push({ source: 'candidate', target: `skill_${s.skill}`, value: s.weight / 20 });
  });

  // Hidden Talents
  knowledgeGraph.hiddenTalents?.forEach((ht: string) => {
    nodes.push({ id: `ht_${ht}`, name: ht, group: 3, val: 8 });
    links.push({ source: 'candidate', target: `ht_${ht}`, value: 3 });
  });

  // Projects
  knowledgeGraph.relatedProjects?.forEach((p: any) => {
    nodes.push({ id: `proj_${p.project}`, name: p.project, group: 4, val: p.relevance / 10 });
    links.push({ source: 'candidate', target: `proj_${p.project}`, value: p.relevance / 20 });
  });

  // Similar Candidates
  knowledgeGraph.similarCandidates?.forEach((c: any) => {
    nodes.push({ id: `cand_${c.resumeId}`, name: c.candidateName || 'Similar Candidate', group: 5, val: c.similarityScore / 10 });
    links.push({ source: 'candidate', target: `cand_${c.resumeId}`, value: c.similarityScore / 20 });
  });

  const graphData = { nodes, links };

  const handleNodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const fontSize = 12 / globalScale;
    ctx.font = `${fontSize}px Sans-Serif`;
    const textWidth = ctx.measureText(label).width;
    const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Colors by group
    if (node.group === 1) ctx.fillStyle = '#4f46e5'; // Candidate - Indigo
    else if (node.group === 2) ctx.fillStyle = '#0ea5e9'; // Skills - Sky
    else if (node.group === 3) ctx.fillStyle = '#f59e0b'; // Hidden Talents - Amber
    else if (node.group === 4) ctx.fillStyle = '#10b981'; // Projects - Emerald
    else ctx.fillStyle = '#8b5cf6'; // Similar Cands - Violet

    ctx.fillText(label, node.x, node.y);
    
    node.__bckgDimensions = bckgDimensions; // to re-use in nodePointerAreaPaint
  }, []);

  return (
    <div ref={containerRef} className="w-full h-[400px] border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
      {dimensions.width > 0 && (
        <ForceGraph2D
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeAutoColorBy="group"
          nodeCanvasObject={handleNodeCanvasObject}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={d => (d as any).value * 0.001}
          cooldownTicks={100}
        />
      )}
    </div>
  );
};
