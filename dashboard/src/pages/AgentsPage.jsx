import { useState, useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, MetricCard, SectionTitle, Badge, TabBar, ErrorBoundary, ErrorBox } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import useToast from '../hooks/useToast.jsx';

const TABS = ['Agents', 'Skills', 'Commands'];

function AgentsPageContent() {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('Agents');

  const { data, loading, error, refetch } = useFetch('/api/agents');

  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const ws = useWebSocket(wsUrl);
  useDocumentTitle({ wsEvents: ws.events });

  useEffect(() => {
    if (ws.events.length > 0) {
      refetch();
    }
  }, [ws.events.length, refetch]);

  useEffect(() => {
    if (error && addToast) addToast('error', error.message);
  }, [error, addToast]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} height={90} />
          ))}
        </div>
        <SkeletonCard height={300} />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox
        title="Error loading agents"
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  const items = Array.isArray(data) ? data : [];
  const agents = items.filter((i) => i.type === 'agent');
  const skills = items.filter((i) => i.type === 'skill');
  const commands = items.filter((i) => i.type === 'command');

  const TYPE_COLORS = { agent: t.accent, skill: t.build, command: t.plan };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle>Agents</SectionTitle>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <MetricCard label="Agents" value={String(agents.length)} sub="definitions" color={t.accent} />
        <MetricCard label="Skills" value={String(skills.length)} sub="available" color={t.build} />
        <MetricCard label="Commands" value={String(commands.length)} sub="slash commands" color={t.plan} />
      </div>

      {/* Tab bar */}
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* Agents tab */}
      {activeTab === 'Agents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {agents.length === 0 ? (
            <Card>
              <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
                No agent definitions found
              </div>
            </Card>
          ) : (
            agents.map((agent) => (
              <Card key={agent.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.accent }}>{agent.name}</div>
                    {agent.role && (
                      <div style={{ fontFamily: FONTS.sans, fontSize: 12, color: t.textMuted, marginTop: 2 }}>{agent.role}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Badge color={TYPE_COLORS.agent}>agent</Badge>
                    {agent.model && <Badge color={t.info}>{agent.model}</Badge>}
                  </div>
                </div>
                {agent.tools && agent.tools.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {agent.tools.map((tool, i) => (
                      <span
                        key={i}
                        style={{
                          padding: '2px 6px',
                          borderRadius: 3,
                          fontFamily: FONTS.mono,
                          fontSize: 10,
                          background: `${t.textMuted}11`,
                          color: t.textMuted,
                          border: `1px solid ${t.border}`,
                        }}
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Skills tab */}
      {activeTab === 'Skills' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {skills.length === 0 ? (
            <Card>
              <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
                No skills found
              </div>
            </Card>
          ) : (
            skills.map((skill) => (
              <Card key={skill.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.build }}>{skill.name}</div>
                    {skill.role && (
                      <div style={{ fontFamily: FONTS.sans, fontSize: 12, color: t.textMuted, marginTop: 2 }}>{skill.role}</div>
                    )}
                  </div>
                  <Badge color={TYPE_COLORS.skill}>skill</Badge>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Commands tab */}
      {activeTab === 'Commands' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {commands.length === 0 ? (
            <Card>
              <div style={{ padding: 24, textAlign: 'center', color: t.textMuted, fontFamily: FONTS.mono, fontSize: 12 }}>
                No commands found
              </div>
            </Card>
          ) : (
            commands.map((cmd) => (
              <Card key={cmd.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: t.plan }}>/{cmd.name}</div>
                    {cmd.role && (
                      <div style={{ fontFamily: FONTS.sans, fontSize: 12, color: t.textMuted, marginTop: 2 }}>{cmd.role}</div>
                    )}
                  </div>
                  <Badge color={TYPE_COLORS.command}>command</Badge>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <ErrorBoundary>
      <AgentsPageContent />
    </ErrorBoundary>
  );
}
