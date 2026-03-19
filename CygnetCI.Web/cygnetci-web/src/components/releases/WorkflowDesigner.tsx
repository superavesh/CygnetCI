'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, GitBranch, Info, ArrowRight, Equal } from 'lucide-react';
import type { Pipeline } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WFNode {
  id: string;
  pipeline_id: number;
  pipeline_name: string;
  x: number;
  y: number;
}

export interface WFEdge {
  id: string;
  from: string;
  to: string;
  type: 'sequential' | 'parallel';
}

export interface WorkflowGraph {
  nodes: WFNode[];
  edges: WFEdge[];
}

export interface ReleasePipelineForm {
  pipeline_id: number;
  order_index: number;
  execution_mode: 'sequential' | 'parallel';
  depends_on?: number;
  position_x: number;
  position_y: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NODE_W = 172;
const NODE_H = 78;

function getCenter(node: WFNode) {
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 };
}

/** Depth through sequential edges only (determines order_index) */
function seqDepth(nodeId: string, edges: WFEdge[], visited = new Set<string>()): number {
  if (visited.has(nodeId)) return 0;
  visited.add(nodeId);
  const inSeq = edges.find(e => e.type === 'sequential' && e.to === nodeId);
  if (!inSeq) return 0;
  return 1 + seqDepth(inSeq.from, edges, new Set(visited));
}

/** Build parallel groups: connected components linked by ∥ edges */
function buildParallelGroups(nodes: WFNode[], edges: WFEdge[]): Map<string, string[]> {
  // nodeId → list of all nodeIds in its parallel group (including itself)
  const groupOf = new Map<string, string[]>();
  const visited = new Set<string>();
  const parEdges = edges.filter(e => e.type === 'parallel');

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const group: string[] = [];
    const queue = [node.id];
    while (queue.length) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      group.push(curr);
      parEdges
        .filter(e => e.from === curr || e.to === curr)
        .forEach(e => {
          const other = e.from === curr ? e.to : e.from;
          if (!visited.has(other)) queue.push(other);
        });
    }
    group.forEach(id => groupOf.set(id, group));
  }
  return groupOf;
}

/**
 * Convert the visual graph into ReleasePipelineForm[] for the API.
 *
 * Rules:
 * - Nodes with NO edges at all → manual, excluded from workflow
 * - Sequential edge (→): target depends on source
 * - Parallel edge (∥): nodes run together (same group, same depends_on)
 * - depends_on for a parallel group = sequential predecessor of any group member
 */
export function workflowToReleasePipelines(graph: WorkflowGraph): ReleasePipelineForm[] {
  const { nodes, edges } = graph;

  // Only include nodes that are connected to at least one edge
  const connectedIds = new Set<string>();
  edges.forEach(e => { connectedIds.add(e.from); connectedIds.add(e.to); });
  const workflowNodes = nodes.filter(n => connectedIds.has(n.id));

  const parallelGroups = buildParallelGroups(workflowNodes, edges);
  const seqEdges = edges.filter(e => e.type === 'sequential');

  return workflowNodes.map(node => {
    const group = parallelGroups.get(node.id) ?? [node.id];
    const isParallel = group.length > 1;

    // Sequential predecessor = incoming → edge to any member of this node's parallel group
    const incomingSeq = seqEdges.find(e => group.includes(e.to));
    const parentNode = incomingSeq ? nodes.find(n => n.id === incomingSeq.from) : undefined;

    return {
      pipeline_id: node.pipeline_id,
      order_index: seqDepth(node.id, edges),
      execution_mode: isParallel ? 'parallel' : 'sequential',
      depends_on: parentNode?.pipeline_id,
      position_x: Math.round(node.x),
      position_y: Math.round(node.y),
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ConnectingState {
  nodeId: string;
  edgeType: 'sequential' | 'parallel';
}

interface Props {
  pipelines: Pipeline[];
  value: WorkflowGraph;
  onChange: (graph: WorkflowGraph) => void;
}

export const WorkflowDesigner: React.FC<Props> = ({ pipelines, value, onChange }) => {
  const { nodes, edges } = value;
  const canvasRef = useRef<HTMLDivElement>(null);

  const [dragging, setDragging] = useState<{ nodeId: string; ox: number; oy: number } | null>(null);
  const [connecting, setConnecting] = useState<ConnectingState | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // ESC cancels connecting
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setConnecting(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Global mouse tracking while dragging
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left - dragging.ox, rect.width - NODE_W));
      const y = Math.max(0, Math.min(e.clientY - rect.top - dragging.oy, rect.height - NODE_H));
      onChange({ nodes: nodes.map(n => n.id === dragging.nodeId ? { ...n, x, y } : n), edges });
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, nodes, edges, onChange]);

  const getCanvasPos = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const addNode = (pipeline: Pipeline) => {
    const col = nodes.length % 3;
    const row = Math.floor(nodes.length / 3);
    onChange({
      nodes: [...nodes, {
        id: `n-${Date.now()}`,
        pipeline_id: pipeline.id,
        pipeline_name: pipeline.name,
        x: 32 + col * 196,
        y: 32 + row * 116,
      }],
      edges,
    });
  };

  const removeNode = (nodeId: string) => {
    onChange({
      nodes: nodes.filter(n => n.id !== nodeId),
      edges: edges.filter(e => e.from !== nodeId && e.to !== nodeId),
    });
  };

  const removeEdge = (edgeId: string) => onChange({ nodes, edges: edges.filter(e => e.id !== edgeId) });

  const finishConnect = (targetId: string) => {
    if (!connecting || connecting.nodeId === targetId) { setConnecting(null); return; }
    // Prevent exact duplicate
    const exists = edges.some(e => e.from === connecting.nodeId && e.to === targetId && e.type === connecting.edgeType);
    if (!exists) {
      onChange({
        nodes,
        edges: [...edges, { id: `e-${Date.now()}`, from: connecting.nodeId, to: targetId, type: connecting.edgeType }],
      });
    }
    setConnecting(null);
  };

  // ── Interaction ───────────────────────────────────────────────────────────────

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (connecting) { finishConnect(nodeId); return; }
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = nodes.find(n => n.id === nodeId)!;
    setDragging({ nodeId, ox: e.clientX - rect.left - node.x, oy: e.clientY - rect.top - node.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (connecting) setMousePos(getCanvasPos(e.clientX, e.clientY));
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const connectedIds = new Set<string>();
  edges.forEach(e => { connectedIds.add(e.from); connectedIds.add(e.to); });

  const usedCount = nodes.reduce<Record<number, number>>((acc, n) => {
    acc[n.pipeline_id] = (acc[n.pipeline_id] || 0) + 1;
    return acc;
  }, {});

  const isConnectingSeq = connecting?.edgeType === 'sequential';
  const isConnectingPar = connecting?.edgeType === 'parallel';

  // Canvas accent colours
  const canvasBorder = isConnectingSeq ? 'border-indigo-400' : isConnectingPar ? 'border-purple-400' : 'border-gray-200';
  const canvasBg = isConnectingSeq ? '#f5f3ff' : isConnectingPar ? '#faf5ff' : '#f9fafb';
  const canvasDot = isConnectingSeq ? '#c7d2fe' : isConnectingPar ? '#d8b4fe' : '#e5e7eb';

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2">

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <Info className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        <span className="text-gray-500">Click pipeline → add to canvas &nbsp;|&nbsp; Drag → move</span>
        <span className="flex items-center gap-1 text-indigo-700 font-medium">
          <ArrowRight className="h-3 w-3" /> Sequential: runs after previous completes
        </span>
        <span className="flex items-center gap-1 text-purple-700 font-medium">
          <Equal className="h-3 w-3" /> Parallel: runs at the same time
        </span>
        <span className="text-gray-400">No connection = manual trigger only &nbsp;|&nbsp; Esc to cancel</span>
      </div>

      <div className="flex gap-3" style={{ height: 420 }}>

        {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
        <div className="w-44 flex-shrink-0 flex flex-col border border-gray-200 rounded-xl bg-white shadow-sm">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Pipelines</p>
            <p className="text-xs text-gray-400 mt-0.5">Click to add to canvas</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {pipelines.map(p => {
              const count = usedCount[p.id] || 0;
              return (
                <button key={p.id} type="button" onClick={() => addNode(p)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between gap-1 group ${
                    count > 0
                      ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100'
                      : 'bg-gray-50 text-gray-700 border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {count > 0 && (
                      <span className="bg-indigo-200 text-indigo-800 rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold">
                        {count}
                      </span>
                    )}
                    <Plus className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                  </div>
                </button>
              );
            })}
            {pipelines.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">No pipelines available</p>
            )}
          </div>
        </div>

        {/* ── Canvas ───────────────────────────────────────────────────────────── */}
        <div
          ref={canvasRef}
          className={`relative flex-1 rounded-xl overflow-hidden transition-all border-2 ${canvasBorder} ${connecting ? 'cursor-crosshair shadow-inner' : 'cursor-default shadow-sm'}`}
          style={{ backgroundColor: canvasBg, backgroundImage: `radial-gradient(circle, ${canvasDot} 1px, transparent 1px)`, backgroundSize: '24px 24px' }}
          onMouseMove={handleCanvasMouseMove}
          onClick={() => { if (connecting) setConnecting(null); }}
        >
          {/* Connecting hint banner */}
          {connecting && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <span className={`text-white text-xs px-4 py-1.5 rounded-full shadow-lg font-medium ${
                isConnectingSeq ? 'bg-indigo-600' : 'bg-purple-600'
              }`}>
                {isConnectingSeq ? '→ Sequential' : '∥ Parallel'} — click target node &nbsp;·&nbsp; Esc to cancel
              </span>
            </div>
          )}

          {/* ── SVG layer ──────────────────────────────────────────────────────── */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            <defs>
              <marker id="wf-seq-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
              </marker>
              <marker id="wf-par-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#9333ea" />
              </marker>
              <marker id="wf-preview-seq" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#a5b4fc" />
              </marker>
              <marker id="wf-preview-par" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#d8b4fe" />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map(edge => {
              const fn = nodes.find(n => n.id === edge.from);
              const tn = nodes.find(n => n.id === edge.to);
              if (!fn || !tn) return null;
              const fc = getCenter(fn); const tc = getCenter(tn);
              const dx = tc.x - fc.x; const dy = tc.y - fc.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len; const uy = dy / len;
              const x1 = fc.x + ux * (NODE_W / 2 + 4);
              const y1 = fc.y + uy * (NODE_H / 2 + 4);
              const x2 = tc.x - ux * (NODE_W / 2 + 14);
              const y2 = tc.y - uy * (NODE_H / 2 + 14);
              const isSeq = edge.type === 'sequential';
              return (
                <line key={edge.id}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={isSeq ? '#6366f1' : '#9333ea'}
                  strokeWidth={2}
                  strokeDasharray={isSeq ? undefined : '6 3'}
                  markerEnd={isSeq ? 'url(#wf-seq-arrow)' : 'url(#wf-par-arrow)'}
                />
              );
            })}

            {/* Preview line */}
            {connecting && (() => {
              const src = nodes.find(n => n.id === connecting.nodeId);
              if (!src) return null;
              const fc = getCenter(src);
              const isSeq = connecting.edgeType === 'sequential';
              return (
                <line
                  x1={fc.x} y1={fc.y} x2={mousePos.x} y2={mousePos.y}
                  stroke={isSeq ? '#a5b4fc' : '#d8b4fe'}
                  strokeWidth={2}
                  strokeDasharray="7 4"
                  markerEnd={isSeq ? 'url(#wf-preview-seq)' : 'url(#wf-preview-par)'}
                />
              );
            })()}
          </svg>

          {/* ── Edge labels + delete buttons ──────────────────────────────────── */}
          {edges.map(edge => {
            const fn = nodes.find(n => n.id === edge.from);
            const tn = nodes.find(n => n.id === edge.to);
            if (!fn || !tn) return null;
            const fc = getCenter(fn); const tc = getCenter(tn);
            const mx = (fc.x + tc.x) / 2;
            const my = (fc.y + tc.y) / 2;
            const isSeq = edge.type === 'sequential';
            return (
              <React.Fragment key={`lbl-${edge.id}`}>
                {/* Type badge */}
                <div
                  className={`absolute z-10 px-1.5 py-0.5 rounded text-xs font-bold pointer-events-none select-none ${
                    isSeq ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'
                  }`}
                  style={{ left: mx - 12, top: my - 20 }}
                >
                  {isSeq ? '→' : '∥'}
                </div>
                {/* Delete button */}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); removeEdge(edge.id); }}
                  className="absolute z-10 w-5 h-5 bg-white border border-red-300 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 shadow-sm transition-colors"
                  style={{ left: mx - 10, top: my + 2 }}
                  title="Remove connection"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </React.Fragment>
            );
          })}

          {/* ── Nodes ────────────────────────────────────────────────────────────── */}
          {nodes.map(node => {
            const isSource = connecting?.nodeId === node.id;
            const isInConnect = !!connecting;
            const isConnected = connectedIds.has(node.id);

            return (
              <div
                key={node.id}
                className={`absolute rounded-xl border-2 shadow-md select-none transition-shadow ${
                  isSource
                    ? connecting?.edgeType === 'sequential'
                      ? 'border-indigo-500 bg-indigo-50 shadow-indigo-200'
                      : 'border-purple-500 bg-purple-50 shadow-purple-200'
                    : isInConnect
                    ? 'border-gray-300 bg-white hover:border-indigo-400 cursor-pointer'
                    : isConnected
                    ? 'border-gray-300 bg-white hover:border-indigo-400 hover:shadow-md cursor-move'
                    : 'border-dashed border-gray-300 bg-white hover:border-gray-400 hover:shadow-md cursor-move'
                }`}
                style={{
                  left: node.x, top: node.y,
                  width: NODE_W, height: NODE_H,
                  zIndex: dragging?.nodeId === node.id ? 10 : 2,
                }}
                onMouseDown={e => handleNodeMouseDown(e, node.id)}
              >
                {/* Name row */}
                <div className="flex items-center justify-between px-2.5 pt-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-indigo-500' : 'bg-gray-400'}`} />
                    <span className="text-xs font-semibold text-gray-800 truncate" title={node.pipeline_name}>
                      {node.pipeline_name}
                    </span>
                  </div>
                  <button type="button" onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); removeNode(node.id); }}
                    className="flex-shrink-0 p-0.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                {/* Manual badge (no connections) */}
                {!isConnected && (
                  <div className="flex justify-center mt-0.5">
                    <span className="text-xs text-gray-400 italic">manual trigger</span>
                  </div>
                )}

                {/* Connect buttons */}
                <div className="flex justify-center gap-1.5 mt-1.5">
                  {/* Sequential */}
                  <button
                    type="button"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation();
                      setConnecting(isSource && connecting?.edgeType === 'sequential' ? null : { nodeId: node.id, edgeType: 'sequential' });
                    }}
                    title="Draw sequential connection (→ runs after)"
                    className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      isSource && connecting?.edgeType === 'sequential'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                    }`}
                  >
                    <ArrowRight className="h-3 w-3" />
                    Seq
                  </button>
                  {/* Parallel */}
                  <button
                    type="button"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation();
                      setConnecting(isSource && connecting?.edgeType === 'parallel' ? null : { nodeId: node.id, edgeType: 'parallel' });
                    }}
                    title="Draw parallel connection (∥ runs together)"
                    className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      isSource && connecting?.edgeType === 'parallel'
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                    }`}
                  >
                    <Equal className="h-3 w-3" />
                    Par
                  </button>
                </div>
              </div>
            );
          })}

          {/* ── Empty state ───────────────────────────────────────────────────── */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <GitBranch className="h-14 w-14 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-400">Click pipelines on the left to add them</p>
              <p className="text-xs text-gray-300 mt-1">
                Use <span className="font-semibold text-indigo-400">Seq →</span> for sequential &nbsp;or&nbsp; <span className="font-semibold text-purple-400">Par ∥</span> for parallel
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary strip */}
      {nodes.length > 0 && <WorkflowSummary nodes={nodes} edges={edges} />}
    </div>
  );
};

// ─── Workflow summary ─────────────────────────────────────────────────────────

function WorkflowSummary({ nodes, edges }: { nodes: WFNode[]; edges: WFEdge[] }) {
  const connectedIds = new Set<string>();
  edges.forEach(e => { connectedIds.add(e.from); connectedIds.add(e.to); });

  const workflowNodes = nodes.filter(n => connectedIds.has(n.id));
  const manualNodes = nodes.filter(n => !connectedIds.has(n.id));

  // Build execution stages using parallel groups + sequential ordering
  const parallelGroups = buildParallelGroups(workflowNodes, edges);
  const seqEdges = edges.filter(e => e.type === 'sequential');

  // Topological sort of groups
  // Each unique group (by first member) is a "stage"
  const stageMap = new Map<string, Set<string>>(); // groupLeader → memberIds
  workflowNodes.forEach(n => {
    const group = parallelGroups.get(n.id)!;
    const leader = group[0];
    if (!stageMap.has(leader)) stageMap.set(leader, new Set(group));
  });

  // BFS stages by sequential edges between groups
  const stages: string[][] = [];
  const stagedGroups = new Set<string>();

  // Root stages: no incoming sequential edge to any member
  for (const [leader, members] of stageMap) {
    const hasSeqIn = seqEdges.some(e => members.has(e.to));
    if (!hasSeqIn) {
      stages.push([...members].map(id => workflowNodes.find(n => n.id === id)!.pipeline_name));
      stagedGroups.add(leader);
    }
  }

  // BFS remaining
  let changed = true;
  while (changed) {
    changed = false;
    for (const [leader, members] of stageMap) {
      if (stagedGroups.has(leader)) continue;
      // All sequential predecessors staged?
      const preds = seqEdges.filter(e => members.has(e.to)).map(e => e.from);
      const allPredStaged = preds.every(pid => {
        const predGroup = parallelGroups.get(pid);
        return predGroup && stagedGroups.has(predGroup[0]);
      });
      if (allPredStaged) {
        stages.push([...members].map(id => workflowNodes.find(n => n.id === id)!.pipeline_name));
        stagedGroups.add(leader);
        changed = true;
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs">
      {stages.length > 0 && (
        <>
          <span className="text-gray-500 font-medium mr-1">Workflow:</span>
          {stages.map((stage, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-indigo-500 font-bold mx-1">→</span>}
              {stage.length === 1 ? (
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md font-medium">{stage[0]}</span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="text-gray-400">(</span>
                  {stage.map((name, j) => (
                    <React.Fragment key={j}>
                      {j > 0 && <span className="text-purple-500 font-bold">∥</span>}
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md font-medium">{name}</span>
                    </React.Fragment>
                  ))}
                  <span className="text-gray-400">)</span>
                </span>
              )}
            </React.Fragment>
          ))}
        </>
      )}
      {manualNodes.length > 0 && (
        <span className="ml-2 text-gray-400 italic">
          Manual: {manualNodes.map(n => n.pipeline_name).join(', ')}
        </span>
      )}
    </div>
  );
}
