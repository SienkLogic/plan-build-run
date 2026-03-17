import { useState, useEffect } from 'react';
import useFetch from '../hooks/useFetch.js';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';

const STATUS_COLORS = {
  completed: '#22c55e',
  'in-progress': '#3b82f6',
  planned: '#6b7280',
  unknown: '#9ca3af',
};

function PhaseNode({ phase, x, y, width, height }) {
  const color = STATUS_COLORS[phase.status] || STATUS_COLORS.unknown;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill={color}
        opacity={0.15}
        stroke={color}
        strokeWidth={1.5}
      />
      <text
        x={x + width / 2}
        y={y + height / 2 - 6}
        textAnchor="middle"
        fontSize={11}
        fontFamily={FONTS.mono}
        fill={color}
      >
        {`Phase ${phase.id}`}
      </text>
      <text
        x={x + width / 2}
        y={y + height / 2 + 10}
        textAnchor="middle"
        fontSize={10}
        fontFamily={FONTS.sans}
        fill={color}
        opacity={0.85}
      >
        {phase.name.length > 18 ? phase.name.slice(0, 16) + '…' : phase.name}
      </text>
    </g>
  );
}

function DependencyGraph({ phases, dependencies }) {
  const { tokens } = useTheme();
  const nodeWidth = 130;
  const nodeHeight = 52;
  const colGap = 170;
  const rowGap = 80;
  const cols = Math.min(4, phases.length);
  const svgWidth = cols * colGap + 40;
  const rows = Math.ceil(phases.length / cols);
  const svgHeight = rows * rowGap + 40;

  // Build position map
  const posMap = {};
  phases.forEach((phase, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    posMap[phase.id] = {
      x: col * colGap + 20,
      y: row * rowGap + 20,
    };
  });

  return (
    <svg width={svgWidth} height={svgHeight} style={{ overflow: 'visible' }}>
      {/* Draw dependency edges */}
      {dependencies.map((edge, i) => {
        const from = posMap[edge.from];
        const to = posMap[edge.to];
        if (!from || !to) return null;
        const x1 = from.x + nodeWidth / 2;
        const y1 = from.y + nodeHeight;
        const x2 = to.x + nodeWidth / 2;
        const y2 = to.y;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={tokens.border || '#4b5563'}
            strokeWidth={1.5}
            strokeDasharray="4,3"
            opacity={0.6}
          />
        );
      })}
      {/* Draw phase nodes */}
      {phases.map(phase => {
        const pos = posMap[phase.id];
        if (!pos) return null;
        return (
          <PhaseNode
            key={phase.id}
            phase={phase}
            x={pos.x}
            y={pos.y}
            width={nodeWidth}
            height={nodeHeight}
          />
        );
      })}
    </svg>
  );
}

function AgentActivityList({ agents }) {
  const { tokens } = useTheme();
  if (!agents || agents.length === 0) {
    return <p style={{ color: tokens.textMuted, fontSize: 12 }}>No recent agent sessions.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {agents.slice(0, 15).map((session, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 10px',
            background: tokens.surface || 'rgba(255,255,255,0.04)',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: FONTS.mono,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: session.status === 'success' ? '#22c55e' : session.status === 'failed' ? '#ef4444' : '#f59e0b',
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, color: tokens.text }}>{session.agent}</span>
          {session.duration != null && (
            <span style={{ color: tokens.textMuted }}>{session.duration}s</span>
          )}
          <span
            style={{
              color: session.status === 'success' ? '#22c55e' : session.status === 'failed' ? '#ef4444' : '#f59e0b',
            }}
          >
            {session.status}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ProgressPage() {
  const { tokens } = useTheme();
  const { data, loading, error } = useFetch('/api/progress');

  if (loading) {
    return (
      <div style={{ padding: 24, color: tokens.textMuted, fontSize: 13 }}>
        Loading progress data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 24, color: '#ef4444', fontSize: 13 }}>
        Failed to load progress data: {error?.message || 'Unknown error'}
      </div>
    );
  }

  if (data.enabled === false) {
    return (
      <div style={{ padding: 24, color: tokens.textMuted, fontSize: 13 }}>
        Progress visualization is disabled. Enable <code>features.progress_visualization</code> in config.
      </div>
    );
  }

  const { phases = [], dependencies = [], agentActivity = [], summary = {} } = data;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Phases', value: summary.total ?? phases.length },
          { label: 'Completed', value: summary.completed ?? 0 },
          { label: 'In Progress', value: summary.inProgress ?? 0 },
          { label: '% Complete', value: `${summary.percentComplete ?? 0}%` },
        ].map(stat => (
          <div
            key={stat.label}
            style={{
              padding: '12px 20px',
              background: tokens.surface || 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              border: `1px solid ${tokens.border || '#2d3748'}`,
              minWidth: 120,
            }}
          >
            <div style={{ fontSize: 11, color: tokens.textMuted, marginBottom: 4, fontFamily: FONTS.mono }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: tokens.text }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Phase dependency graph */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, marginBottom: 12 }}>
          Phase Dependency Graph
        </h3>
        {phases.length > 0 ? (
          <div style={{ overflowX: 'auto', padding: 8 }}>
            <DependencyGraph phases={phases} dependencies={dependencies} />
          </div>
        ) : (
          <p style={{ color: tokens.textMuted, fontSize: 12 }}>No phases found in ROADMAP.md.</p>
        )}
      </div>

      {/* Agent activity */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, marginBottom: 12 }}>
          Recent Agent Activity
        </h3>
        <AgentActivityList agents={agentActivity} />
      </div>
    </div>
  );
}
