"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DotLoader } from "./dot-loader";

// Provided animations from prompt
const importing = [
    [0, 2, 4, 6, 20, 34, 48, 46, 44, 42, 28, 14, 8, 22, 36, 38, 40, 26, 12, 10, 16, 30, 24, 18, 32],
    [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47],
    [8, 22, 36, 38, 40, 26, 12, 10, 16, 30, 24, 18, 32],
    [9, 11, 15, 17, 19, 23, 25, 29, 31, 33, 37, 39],
    [16, 30, 24, 18, 32],
    [17, 23, 31, 25],
    [24],
    [17, 23, 31, 25],
    [16, 30, 24, 18, 32],
    [9, 11, 15, 17, 19, 23, 25, 29, 31, 33, 37, 39],
    [8, 22, 36, 38, 40, 26, 12, 10, 16, 30, 24, 18, 32],
    [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47],
    [0, 2, 4, 6, 20, 34, 48, 46, 44, 42, 28, 14, 8, 22, 36, 38, 40, 26, 12, 10, 16, 30, 24, 18, 32],
];

const extracting = [
    [45, 38, 31, 24, 17, 23, 25],
    [38, 31, 24, 17, 10, 16, 18],
    [31, 24, 17, 10, 3, 9, 11],
    [24, 17, 10, 3, 2, 4],
    [17, 10, 3],
    [10, 3],
    [3],
    [],
    [45],
    [45, 38, 44, 46],
    [45, 38, 31, 37, 39],
    [45, 38, 31, 24, 30, 32],
];

const analyzing = [
    [9, 16, 17, 15, 23],
    [10, 17, 18, 16, 24],
    [11, 18, 19, 17, 25],
    [18, 25, 26, 24, 32],
    [25, 32, 33, 31, 39],
    [32, 39, 40, 38, 46],
    [31, 38, 39, 37, 45],
    [30, 37, 38, 36, 44],
    [23, 30, 31, 29, 37],
    [31, 29, 37, 22, 24, 23, 38, 36],
    [16, 23, 24, 22, 30],
];

const embedding = [
    [],
    [24],
    [16, 17, 18, 23, 25, 30, 31, 32],
    [8, 9, 10, 11, 12, 15, 19, 22, 26, 29, 33, 36, 37, 38, 39, 40],
    [0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 20, 21, 27, 28, 34, 35, 41, 42, 43, 44, 45, 46, 47, 48],
    [8, 9, 10, 11, 12, 15, 19, 22, 26, 29, 33, 36, 37, 38, 39, 40],
    [16, 17, 18, 23, 25, 30, 31, 32],
    [24],
];

const scoring = [
    [24],
    [24, 16, 17, 18, 23, 25, 30, 31, 32],
    [24, 8, 9, 10, 11, 12, 15, 19, 22, 26, 29, 33, 36, 37, 38, 39, 40],
    [24, 16, 17, 18, 23, 25, 30, 31, 32, 0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 20, 21, 27, 28, 34, 35, 41, 42, 43, 44, 45, 46, 47, 48],
    [24, 8, 9, 10, 11, 12, 15, 19, 22, 26, 29, 33, 36, 37, 38, 39, 40],
];

const ranking = [
    [42, 43, 44, 45, 46, 47, 48],
    [42, 43, 44, 45, 46, 47, 48, 36],
    [42, 43, 44, 45, 46, 47, 48, 36, 35],
    [42, 43, 44, 45, 46, 47, 48, 36, 35, 38],
    [42, 43, 44, 45, 46, 47, 48, 36, 35, 38, 31],
    [42, 43, 44, 45, 46, 47, 48, 36, 35, 38, 31, 24],
    [42, 43, 44, 45, 46, 47, 48, 36, 35, 38, 31, 24, 40],
    [42, 43, 44, 45, 46, 47, 48, 36, 35, 38, 31, 24, 40, 33],
    [42, 43, 44, 45, 46, 47, 48, 36, 35, 38, 31, 24, 40, 33, 26],
    [42, 43, 44, 45, 46, 47, 48, 36, 35, 38, 31, 24, 40, 33, 26, 19],
    [42, 43, 44, 45, 46, 47, 48, 36, 35, 38, 31, 24, 40, 33, 26, 19, 12],
    [42, 43, 44, 45, 46, 47, 48, 36, 35, 38, 31, 24, 40, 33, 26, 19, 12, 5],
];

const completed = [
    [],
    [22],
    [22, 30],
    [22, 30, 38],
    [22, 30, 38, 31],
    [22, 30, 38, 31, 24],
    [22, 30, 38, 31, 24, 17],
    [22, 30, 38, 31, 24, 17, 10],
    [22, 30, 38, 31, 24, 17, 10, 3],
    [22, 30, 38, 31, 24, 17, 10, 3],
    [22, 30, 38, 31, 24, 17, 10, 3],
];

const PIPELINE_STAGES = [
    { id: 'PENDING', title: 'Uploading Document...', frames: importing, duration: 150 },
    { id: 'EXTRACTING', title: 'Extracting Text...', frames: extracting, duration: 100 },
    { id: 'ANALYZING', title: 'Analyzing Content...', frames: analyzing, duration: 150 },
    { id: 'EMBEDDING', title: 'Generating Embeddings...', frames: embedding, duration: 120 },
    { id: 'SCORING', title: 'Calculating ATS Score...', frames: scoring, duration: 120 },
    { id: 'RANKING', title: 'Ranking Candidate...', frames: ranking, duration: 100 },
    { id: 'PROCESSED', title: 'Processing Complete', frames: completed, duration: 200 }
];

export type DotFlowProps = {
    status: string | null;
};

export const DotFlow = ({ status }: DotFlowProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    
    // Find current stage index based on status
    const stageIndex = useMemo(() => {
        if (!status) return 0;
        const index = PIPELINE_STAGES.findIndex(s => s.id === status);
        if (status === 'PROCESSED') return PIPELINE_STAGES.length - 1;
        return index >= 0 ? index : 0;
    }, [status]);

    const [renderIndex, setRenderIndex] = useState(stageIndex);
    const { contextSafe } = useGSAP();

    // Trigger animation when stage changes
    useEffect(() => {
        if (renderIndex === stageIndex) return;

        const transition = contextSafe(() => {
            const el = containerRef.current;
            if (!el) {
                setRenderIndex(stageIndex);
                return;
            }
            
            gsap.to(el, {
                y: 20,
                opacity: 0,
                filter: "blur(8px)",
                duration: 0.4,
                ease: "power2.in",
                onComplete: () => {
                    setRenderIndex(stageIndex);
                    gsap.fromTo(
                        el,
                        { y: -20, opacity: 0, filter: "blur(4px)" },
                        {
                            y: 0,
                            opacity: 1,
                            filter: "blur(0px)",
                            duration: 0.6,
                            ease: "power2.out",
                        },
                    );
                },
            });
        });

        transition();
    }, [stageIndex, renderIndex, contextSafe]);

    // Animate width of container to fit text
    useEffect(() => {
        if (!containerRef.current || !textRef.current) return;
        const newWidth = textRef.current.offsetWidth + 1;
        gsap.to(containerRef.current, {
            width: newWidth,
            duration: 0.5,
            ease: "power2.out",
        });
    }, [renderIndex]);

    const currentStage = PIPELINE_STAGES[renderIndex] || PIPELINE_STAGES[0];
    const isError = status === 'FAILED';

    return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-black rounded-xl border border-slate-800 shadow-2xl p-8 relative overflow-hidden">
            {/* Background ambient glow based on status */}
            <div className={`absolute inset-0 opacity-20 blur-3xl transition-colors duration-1000 ${isError ? 'bg-red-500' : currentStage.id === 'PROCESSED' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
            
            <div className="relative z-10 flex items-center gap-6 bg-slate-900/50 backdrop-blur-md p-6 rounded-2xl border border-slate-700/50 shadow-inner">
                <DotLoader
                    frames={currentStage.frames}
                    className="gap-1 scale-125 origin-left"
                    repeatCount={-1} // Loop indefinitely
                    duration={currentStage.duration}
                    dotClassName={`bg-slate-700 [&.active]:bg-white size-1.5 rounded-sm transition-colors duration-200 ${isError ? '[&.active]:bg-red-500' : currentStage.id === 'PROCESSED' ? '[&.active]:bg-emerald-500' : '[&.active]:bg-blue-400 [&.active]:shadow-[0_0_8px_rgba(96,165,250,0.8)]'}`}
                />
                <div ref={containerRef} className="relative overflow-hidden h-8 flex items-center">
                    <div ref={textRef} className={`inline-block text-xl font-medium whitespace-nowrap tracking-wide ${isError ? 'text-red-400' : currentStage.id === 'PROCESSED' ? 'text-emerald-400' : 'text-slate-100'}`}>
                        {isError ? "Processing Failed" : currentStage.title}
                    </div>
                </div>
            </div>
            
            {/* Pipeline Progress Indicator */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 z-10">
                {PIPELINE_STAGES.map((s, i) => (
                    <div 
                        key={s.id} 
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                            isError ? 'bg-red-500/20' : 
                            i < stageIndex || status === 'PROCESSED' ? 'w-8 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                            i === stageIndex ? 'w-12 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 
                            'w-4 bg-slate-800'
                        }`}
                    />
                ))}
            </div>
        </div>
    );
};
