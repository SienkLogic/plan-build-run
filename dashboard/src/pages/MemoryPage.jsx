import { useState, useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import {
  Card,
  Badge,
  CodeBlock,
  SectionTitle,
  BackButton,
  KeyValue,
  TabBar,
  ErrorBoundary,
} from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useToast from '../hooks/useToast.jsx';

const TYPE_META = {
  episodic: { emoji: '\uD83D\uDCD3', desc: 'Session journals' },
  semantic: { emoji: '\uD83E\uDDE0', desc: 'Project knowledge' },
  procedural: { emoji: '\uD83D\uDCCB', desc: 'Task playbooks' },
};

function MemoryContent() {
  const { tokens } = useTheme();
  const { addToast } = useToast();
  const { data, loading, error, refetch } = useFetch('/api/memory');
  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const { events: wsEvents } = useWebSocket(wsUrl);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const typeColors = {
    episodic: tokens.plan,
    semantic: tokens.accent,
    procedural: tokens.success,
  };

  useEffect(() => {
    if (wsEvents.length > 0) refetch();
  }, [wsEvents.length, refetch]);

  useEffect(() => {
    if (error) addToast('error', error.message);
  }, [error, addToast]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SkeletonCard height={40} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} height={70} />
          ))}
        </div>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} height={60} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card style={{ border: `1px solid ${tokens.error}`, color: tokens.error }}>
        <SectionTitle>Error loading memory</SectionTitle>
        <div style={{ fontFamily: FONTS.mono, fontSize: 12 }}>{error.message}</div>
      </Card>
    );
  }

  const memoryEntries = data || [];

  const filtered = filter === 'all'
    ? memoryEntries
    : memoryEntries.filter((m) => m.type === filter);

  const entry = selected ? memoryEntries.find((m) => m.key === selected) : null;

  // --- Detail view ---
  if (entry) {
    const tc = typeColors[entry.type];
    const c = entry.content || {};

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BackButton onClick={() => setSelected(null)} />

        {/* Header card */}
        <Card style={{ borderTop: `3px solid ${tc}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Badge color={tc}>{entry.type}</Badge>
            <span style={{ fontFamily: FONTS.mono, fontSize: 14, fontWeight: 700, color: tokens.accent }}>
              {entry.key}
            </span>
          </div>
          <div style={{ fontSize: 12, color: tokens.textMuted, fontFamily: FONTS.sans, marginBottom: 12 }}>
            {entry.summary}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <KeyValue label="Age" value={entry.age} />
            <KeyValue label="Size" value={entry.size} />
          </div>
        </Card>

        {/* Episodic detail */}
        {entry.type === 'episodic' && (
          <>
            <Card>
              <SectionTitle>Session Details</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <KeyValue label="Session ID" value={c.sessionId} />
                <KeyValue label="Duration" value={c.duration} />
                <KeyValue label="Phase" value={c.phase} />
              </div>
            </Card>

            <Card>
              <SectionTitle>Subagents</SectionTitle>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONTS.sans, fontSize: 11 }}>
                  <thead>
                    <tr>
                      {['Name', 'Task', 'Status', 'Tokens'].map((h) => (
                        <th key={h} style={{
                          textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${tokens.border}`,
                          fontFamily: FONTS.mono, fontSize: 10, color: tokens.textMuted, textTransform: 'uppercase',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(c.subagents || []).map((sa) => (
                      <tr key={sa.name}>
                        <td style={{ padding: '6px 8px', fontFamily: FONTS.mono, color: tokens.accent, fontWeight: 600 }}>
                          {sa.name}
                        </td>
                        <td style={{ padding: '6px 8px', color: tokens.text }}>{sa.task}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <Badge color={sa.status === 'complete' ? tokens.success : tokens.warning}>{sa.status}</Badge>
                        </td>
                        <td style={{ padding: '6px 8px', fontFamily: FONTS.mono, color: tokens.textMuted }}>
                          {(sa.tokens || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <SectionTitle>Decisions</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(c.decisions || []).map((d, i) => (
                  <div key={i} style={{ fontSize: 12, color: tokens.text, fontFamily: FONTS.sans }}>
                    <span style={{ color: tokens.accent, marginRight: 6 }}>{'\u2192'}</span>{d}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <SectionTitle>Artifacts</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(c.artifacts || []).map((a) => (
                  <div key={a} style={{ fontFamily: FONTS.mono, fontSize: 11, color: tokens.accent }}>
                    {a}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <SectionTitle>Lessons</SectionTitle>
              <CodeBlock>{c.lessons}</CodeBlock>
            </Card>
          </>
        )}

        {/* Semantic detail */}
        {entry.type === 'semantic' && (
          <>
            {c.stack && (
              <Card>
                <SectionTitle>Tech Stack</SectionTitle>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.stack.map((item) => (
                    <Badge key={item} color={tokens.accent}>{item}</Badge>
                  ))}
                </div>
              </Card>
            )}

            {c.architecture && (
              <Card>
                <SectionTitle>Architecture</SectionTitle>
                <CodeBlock>{c.architecture}</CodeBlock>
              </Card>
            )}

            {c.modules && (
              <Card>
                <SectionTitle>Module Map</SectionTitle>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONTS.sans, fontSize: 11 }}>
                    <thead>
                      <tr>
                        {['Module', 'Files', 'Dependencies'].map((h) => (
                          <th key={h} style={{
                            textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${tokens.border}`,
                            fontFamily: FONTS.mono, fontSize: 10, color: tokens.textMuted, textTransform: 'uppercase',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.modules.map((mod) => (
                        <tr key={mod.name}>
                          <td style={{ padding: '6px 8px', fontFamily: FONTS.mono, color: tokens.accent, fontWeight: 600 }}>
                            {mod.name}
                          </td>
                          <td style={{ padding: '6px 8px', color: tokens.text }}>{mod.files}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {mod.deps.map((d) => (
                                <Badge key={d} color={tokens.textMuted}>{d}</Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {c.circularDeps && c.circularDeps.length > 0 && (
              <Card>
                <SectionTitle>Circular Dependencies</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.circularDeps.map((d, i) => (
                    <div key={i} style={{ fontFamily: FONTS.mono, fontSize: 11, color: tokens.error }}>
                      {d}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {c.knownIssues && c.knownIssues.length > 0 && (
              <Card>
                <SectionTitle>Known Issues</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.knownIssues.map((issue, i) => (
                    <div key={i} style={{ fontSize: 12, color: tokens.warning, fontFamily: FONTS.sans }}>
                      {'\u26A0'} {issue}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {/* Procedural detail */}
        {entry.type === 'procedural' && (
          <>
            <Card>
              <SectionTitle>Template Info</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <KeyValue label="Template" value={c.templateName} />
                <KeyValue label="Confidence" value={`${Math.round(c.confidence * 100)}%`} />
                <KeyValue label="Times Used" value={c.timesUsed} />
                <KeyValue label="Avg Success" value={`${Math.round(c.avgSuccess * 100)}%`} />
              </div>
            </Card>

            <Card>
              <SectionTitle>Steps</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(c.steps || []).map((step) => (
                  <div key={step.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', background: `${tokens.success}22`,
                      color: tokens.success, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>
                      {step.n}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: tokens.text, fontFamily: FONTS.sans }}>
                        {step.action}
                      </div>
                      <div style={{ fontSize: 11, color: tokens.textMuted, fontFamily: FONTS.sans }}>
                        {step.context}
                      </div>
                    </div>
                    <Badge color={tokens.accent}>{(step.tokens || 0).toLocaleString()}</Badge>
                  </div>
                ))}
              </div>
            </Card>

            {c.contextRequired && (
              <Card>
                <SectionTitle>Required Context</SectionTitle>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.contextRequired.map((ctx) => (
                    <Badge key={ctx} color={tokens.plan}>{ctx}</Badge>
                  ))}
                </div>
              </Card>
            )}

            {c.notes && (
              <Card>
                <SectionTitle>Notes</SectionTitle>
                <CodeBlock>{c.notes}</CodeBlock>
              </Card>
            )}
          </>
        )}
      </div>
    );
  }

  // --- List view ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <TabBar
          tabs={['all', 'episodic', 'semantic', 'procedural']}
          active={filter}
          onChange={setFilter}
        />
        <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: tokens.textMuted }}>
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Type explainer cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {['episodic', 'semantic', 'procedural'].map((type) => (
          <Card key={type} style={{ borderLeft: `3px solid ${typeColors[type]}`, borderRadius: '4px 10px 10px 4px', padding: 12 }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{TYPE_META[type].emoji}</div>
            <div style={{
              fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700,
              color: typeColors[type], textTransform: 'uppercase', marginBottom: 2,
            }}>
              {type}
            </div>
            <div style={{ fontSize: 10, color: tokens.textMuted, fontFamily: FONTS.sans }}>
              {TYPE_META[type].desc}
            </div>
          </Card>
        ))}
      </div>

      {/* Entry list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((m) => {
          const tc = typeColors[m.type];
          return (
            <Card
              key={m.key}
              onClick={() => setSelected(m.key)}
              style={{
                borderLeft: `3px solid ${tc}`,
                borderRadius: '4px 10px 10px 4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Badge color={tc}>{m.type}</Badge>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, color: tokens.accent }}>
                    {m.key}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: tokens.textMuted, fontFamily: FONTS.sans }}>
                  {m.summary}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: tokens.textMuted }}>{m.age}</div>
                  <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: tokens.textDim }}>{m.size}</div>
                </div>
                <span style={{ fontSize: 12, color: tokens.accent, fontFamily: FONTS.mono }}>{'\u2192'} view</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function MemoryPage() {
  return (
    <ErrorBoundary>
      <MemoryContent />
    </ErrorBoundary>
  );
}
