import { useState, useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, Badge, ProgressBar, ErrorBoundary } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useToast from '../hooks/useToast.jsx';

/**
 * Map a phase status string to a color token and display label.
 */
function statusStyle(status, tokens) {
  const s = (status || '').toLowerCase();
  if (s === 'done' || s === 'built' || s === 'verified') {
    return { color: tokens.success, label: status };
  }
  if (s === 'in-progress' || s === 'building' || s === 'planned') {
    return { color: tokens.plan, label: status };
  }
  return { color: tokens.textDim, label: status || 'Not Started' };
}

function MilestoneHeader({ milestone, phases, tokens }) {
  if (!milestone) return null;
  const doneCount = phases.filter(p => {
    const s = (p.status || '').toLowerCase();
    return s === 'done' || s === 'built' || s === 'verified';
  }).length;
  const total = phases.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONTS.sans, fontSize: 18, fontWeight: 700, color: tokens.text }}>
            {milestone.name}
          </span>
          <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: tokens.textMuted }}>
            {doneCount}/{total} phases
          </span>
        </div>
        {milestone.goal && (
          <span style={{ fontFamily: FONTS.sans, fontSize: 13, color: tokens.textMuted, lineHeight: 1.4 }}>
            {milestone.goal}
          </span>
        )}
        <ProgressBar pct={pct} color={tokens.success} />
      </div>
    </Card>
  );
}

function PhaseCard({ phase, tokens, onClick, hovered }) {
  const { color, label } = statusStyle(phase.status, tokens);

  return (
    <Card style={{
      padding: '14px 16px',
      cursor: 'pointer',
      borderColor: hovered ? tokens.accent : undefined,
      transition: 'border-color 0.15s',
    }} onClick={onClick}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Header: number + name + badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontFamily: FONTS.mono,
            fontSize: 12,
            fontWeight: 700,
            color: tokens.textDim,
            minWidth: 28,
          }}>
            {String(phase.number).padStart(2, '0')}
          </span>
          <span style={{
            fontFamily: FONTS.sans,
            fontSize: 14,
            fontWeight: 600,
            color: tokens.text,
            flex: 1,
          }}>
            {phase.name}
          </span>
          <Badge color={color}>{label}</Badge>
        </div>

        {/* Goal (truncated to 2 lines) */}
        {phase.goal && (
          <span style={{
            fontFamily: FONTS.sans,
            fontSize: 12,
            color: tokens.textMuted,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            marginLeft: 38,
          }}>
            {phase.goal}
          </span>
        )}

        {/* Dependency info */}
        {phase.dependsOn && phase.dependsOn !== 'None (starting phase)' && (
          <span style={{
            fontFamily: FONTS.sans,
            fontSize: 11,
            color: tokens.textDim,
            marginLeft: 38,
          }}>
            Depends on: {phase.dependsOn}
          </span>
        )}

        {/* Implements */}
        {phase.implements && (
          <span style={{
            fontFamily: FONTS.mono,
            fontSize: 11,
            color: tokens.textDim,
            marginLeft: 38,
          }}>
            {phase.implements}
          </span>
        )}
      </div>
    </Card>
  );
}

/**
 * Parse dependency relationships from phases and render text-based arrows.
 */
function DependencyMap({ phases, tokens }) {
  const deps = [];
  for (const phase of phases) {
    if (!phase.dependsOn || phase.dependsOn === 'None (starting phase)') continue;
    // Extract phase numbers from dependsOn string (e.g., "Phase 01, Phase 02" or "01-slug")
    const matches = phase.dependsOn.match(/(\d{2})/g);
    if (matches) {
      for (const depNum of matches) {
        deps.push({ from: depNum, to: String(phase.number).padStart(2, '0') });
      }
    }
  }

  if (deps.length === 0) return null;

  return (
    <Card style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{
          fontFamily: FONTS.mono,
          fontSize: 11,
          fontWeight: 600,
          color: tokens.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 4,
        }}>
          Dependencies
        </span>
        {deps.map((dep, idx) => (
          <div key={idx} style={{ padding: '2px 0', fontFamily: FONTS.mono, fontSize: 12 }}>
            <span style={{ color: tokens.textMuted }}>Phase {dep.from}</span>
            <span style={{ color: tokens.textDim }}>{' --> '}</span>
            <span style={{ color: tokens.textMuted }}>Phase {dep.to}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RoadmapContent({ onSelectPhase }) {
  const { tokens } = useTheme();
  const { addToast } = useToast();
  const [hoveredPhase, setHoveredPhase] = useState(null);
  const { data, loading, error, refetch } = useFetch('/api/roadmap');
  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const { events: wsEvents } = useWebSocket(wsUrl);

  useEffect(() => {
    if (wsEvents.length > 0) refetch();
  }, [wsEvents.length, refetch]);

  useEffect(() => {
    if (error) addToast('error', error.message);
  }, [error, addToast]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SkeletonCard height={80} />
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} height={90} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card style={{ border: `1px solid ${tokens.error}`, color: tokens.error }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 12 }}>Error loading roadmap: {error.message}</div>
      </Card>
    );
  }

  const milestone = data && data.milestone;
  const phases = (data && data.phases) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <MilestoneHeader milestone={milestone} phases={phases} tokens={tokens} />
      <DependencyMap phases={phases} tokens={tokens} />
      {phases.map((phase) => (
        <div
          key={phase.number}
          onMouseEnter={() => setHoveredPhase(phase.number)}
          onMouseLeave={() => setHoveredPhase(null)}
        >
          <PhaseCard
            phase={phase}
            tokens={tokens}
            hovered={hoveredPhase === phase.number}
            onClick={() => onSelectPhase && onSelectPhase({ slug: phase.slug, name: phase.name })}
          />
        </div>
      ))}
      {phases.length === 0 && (
        <Card>
          <div style={{ fontFamily: FONTS.sans, fontSize: 13, color: tokens.textMuted, textAlign: 'center', padding: 20 }}>
            No phases found in ROADMAP.md
          </div>
        </Card>
      )}
    </div>
  );
}

export default function RoadmapPage({ onSelectPhase }) {
  return (
    <ErrorBoundary>
      <RoadmapContent onSelectPhase={onSelectPhase} />
    </ErrorBoundary>
  );
}
