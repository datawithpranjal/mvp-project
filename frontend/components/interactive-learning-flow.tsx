"use client";

import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";

import type { LearningFlowStage } from "../lib/learning-flow";

interface InteractiveLearningFlowProps {
  title: string;
  stages: LearningFlowStage[];
  caption: string;
  focusStageId?: string;
}

type LearningNode = Node<{ label: string }>;

export function InteractiveLearningFlow({
  title,
  stages,
  caption,
  focusStageId
}: InteractiveLearningFlowProps) {
  const stageSignature = stages.map((stage) => stage.id).join("|");
  const firstStageId = stages[0]?.id ?? "";
  const [selectedStageId, setSelectedStageId] = useState(focusStageId ?? firstStageId);

  useEffect(() => {
    setSelectedStageId(focusStageId ?? firstStageId);
  }, [firstStageId, focusStageId, stageSignature]);

  const nodes = useMemo<LearningNode[]>(
    () =>
      stages.map((stage, index) => ({
        id: stage.id,
        position: { x: index * 230, y: index % 2 === 0 ? 36 : 126 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { label: stage.label },
        ariaLabel: `${stage.label}: ${stage.detail}`,
        className: [
          "learning-flow-node",
          `learning-flow-node--${stage.kind ?? "process"}`,
          focusStageId === stage.id ? "learning-flow-node--focus" : ""
        ]
          .filter(Boolean)
          .join(" ")
      })),
    [focusStageId, stages]
  );

  const edges = useMemo<Edge[]>(
    () =>
      stages.slice(0, -1).map((stage, index) => ({
        id: `${stage.id}-${stages[index + 1].id}`,
        source: stage.id,
        target: stages[index + 1].id,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        className: "learning-flow-edge"
      })),
    [stages]
  );

  const selectedStage =
    stages.find((stage) => stage.id === selectedStageId) ?? stages[0] ?? null;

  return (
    <section className="panel learning-flow rounded-[2rem] p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
            Interactive system map
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-50">{title}</h3>
        </div>
        <p className="max-w-xl text-xs leading-5 text-slate-400">{caption}</p>
      </div>

      <div
        className="mt-5 h-[350px] overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/45"
        aria-label={`${title}. Select a stage to inspect its role.`}
      >
        <ReactFlow<LearningNode, Edge>
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.35}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => setSelectedStageId(node.id)}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {selectedStage ? (
        <div className="mt-4 flex gap-4 rounded-3xl border border-slate-800 bg-slate-950/35 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-300/15 text-sm font-bold text-teal-100">
            {stages.findIndex((stage) => stage.id === selectedStage.id) + 1}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-100">{selectedStage.label}</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">{selectedStage.detail}</p>
            {focusStageId === selectedStage.id ? (
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">
                Likely incident boundary
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
