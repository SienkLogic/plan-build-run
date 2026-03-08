import { useState, useEffect } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useToast from '../hooks/useToast.jsx';
import {
  Card,
  Badge,
  TabBar,
  MetricCard,
  StatusDot,
  SectionTitle,
  Toggle,
  NumberInput,
  TextInput,
  CodeBlock,
  ErrorBoundary,
  LoadingSkeleton,
} from '../components/ui/index.js';

const HOOK_COLOR_KEYS = {
  onSessionStart: 'info',
  onPlanComplete: 'plan',
  onPhaseTransition: 'plan',
  onSubagentSpawn: 'build',
  onSubagentComplete: 'success',
  onSubagentError: 'error',
  onRetry: 'warning',
  onCheckpoint: 'accent',
};

const SEVERITY_COLOR_KEYS = {
  error: 'error',
  warning: 'warning',
  info: 'info',
};

function HooksPageInner() {
  const { tokens } = useTheme();
  const { addToast } = useToast();
  const [tab, setTab] = useState('hooks');
  const [expandedError, setExpandedError] = useState(null);
  const [hookConfig, setHookConfig] = useState(null);

  const { data: hooksData, loading: hooksLoading, error: hooksError, refetch: refetchHooks } = useFetch('/api/hooks');
  const { data: errorsData, loading: errorsLoading, error: errorsError, refetch: refetchErrors } = useFetch('/api/errors');
  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const { events: wsEvents } = useWebSocket(wsUrl);

  useEffect(() => {
    if (wsEvents.length > 0) {
      refetchHooks();
      refetchErrors();
    }
  }, [wsEvents.length, refetchHooks, refetchErrors]);

  useEffect(() => {
    if (hooksError) addToast('error', hooksError.message);
  }, [hooksError, addToast]);

  useEffect(() => {
    if (errorsError) addToast('error', errorsError.message);
  }, [errorsError, addToast]);

  const hookEvents = (hooksData && hooksData.events) || [];
  const errors = (errorsData && errorsData.errors) || (Array.isArray(errorsData) ? errorsData : []);
  const fetchedConfig = (hooksData && hooksData.config) || null;

  // Initialize hookConfig from fetched data
  useEffect(() => {
    if (hookConfig === null && fetchedConfig) {
      setHookConfig({ ...fetchedConfig }); // eslint-disable-line react-hooks/set-state-in-effect -- one-time initialization from fetched data
    }
  }, [hookConfig, fetchedConfig]);

  const hookColorMap = {};
  for (const [k, v] of Object.entries(HOOK_COLOR_KEYS)) {
    hookColorMap[k] = tokens[v];
  }

  const updateConfig = (key, value) => {
    setHookConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const totalEvents = hookEvents.length;
  const successCount = hookEvents.filter((e) => e.status === 'success').length;
  const errorCount = hookEvents.filter((e) => e.status === 'error').length;

  return (
    <div>
      <TabBar tabs={['hooks', 'errors', 'hook-config']} active={tab} onChange={setTab} />

      <div style={{ marginTop: 16 }}>
        {tab === 'hooks' && (
          <div>
            {hooksLoading ? (
              <LoadingSkeleton lines={7} height={20} />
            ) : hooksError ? (
              <Card>
                <div style={{ color: tokens.error, fontFamily: FONTS.mono, fontSize: 12 }}>
                  Failed to load hooks: {hooksError.message}
                </div>
              </Card>
            ) : (
              <div>
                {/* Metric cards */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  <MetricCard label="Fired" value={totalEvents} color={tokens.accent} />
                  <MetricCard label="Success" value={successCount} color={tokens.success} />
                  <MetricCard label="Errors" value={errorCount} color={tokens.error} />
                </div>

                {/* Events table */}
                <Card>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontFamily: FONTS.mono,
                      fontSize: 11,
                    }}
                  >
                    <thead>
                      <tr>
                        {['Time', 'Hook', 'Status', 'Duration', 'Payload'].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: 'left',
                              fontSize: 9,
                              textTransform: 'uppercase',
                              color: tokens.textMuted,
                              padding: '6px 8px',
                              borderBottom: `1px solid ${tokens.border}`,
                              letterSpacing: 1,
                              fontWeight: 600,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hookEvents.map((evt, idx) => (
                        <tr
                          key={evt.id || idx}
                          style={{ cursor: 'default' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = tokens.surfaceAlt;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <td style={{ padding: '6px 8px', color: tokens.textMuted }}>{evt.time || evt.fired}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <Badge color={hookColorMap[evt.hook]}>{evt.hook}</Badge>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <StatusDot status={evt.status} />
                          </td>
                          <td style={{ padding: '6px 8px', color: tokens.textMuted }}>{evt.duration}</td>
                          <td
                            style={{
                              padding: '6px 8px',
                              fontFamily: FONTS.mono,
                              fontSize: 10,
                              color: tokens.textDim,
                              maxWidth: 200,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {evt.payload}
                          </td>
                        </tr>
                      ))}
                      {hookEvents.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            style={{
                              padding: 24,
                              textAlign: 'center',
                              color: tokens.textMuted,
                              fontFamily: FONTS.mono,
                              fontSize: 12,
                            }}
                          >
                            No hook events recorded
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}
          </div>
        )}

        {tab === 'errors' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {errorsLoading ? (
              <LoadingSkeleton lines={5} height={24} />
            ) : errorsError ? (
              <Card>
                <div style={{ color: tokens.error, fontFamily: FONTS.mono, fontSize: 12 }}>
                  Failed to load errors: {errorsError.message}
                </div>
              </Card>
            ) : errors.length === 0 ? (
              <Card>
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 12,
                    color: tokens.textMuted,
                    textAlign: 'center',
                    padding: 24,
                  }}
                >
                  No errors recorded
                </div>
              </Card>
            ) : (
              errors.map((err) => {
                const severityColor = tokens[SEVERITY_COLOR_KEYS[err.severity]] || tokens.textMuted;
                const isExpanded = expandedError === err.id;

                return (
                  <Card
                    key={err.id}
                    onClick={() => setExpandedError(isExpanded ? null : err.id)}
                    style={{
                      borderLeft: `3px solid ${severityColor}`,
                      cursor: 'pointer',
                      borderRadius: '4px 10px 10px 4px',
                    }}
                  >
                    {/* Top row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Badge color={severityColor}>{err.severity}</Badge>
                        <Badge color={tokens.textMuted}>{err.category}</Badge>
                        <span
                          style={{
                            fontFamily: FONTS.mono,
                            fontSize: 11,
                            color: tokens.textDim,
                          }}
                        >
                          {err.agent}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 10,
                            color: tokens.textMuted,
                            fontFamily: FONTS.mono,
                          }}
                        >
                          {err.ts}
                        </span>
                        <Badge color={err.resolved ? tokens.success : tokens.warning}>
                          {err.resolved ? 'resolved' : 'open'}
                        </Badge>
                      </div>
                    </div>

                    {/* Message */}
                    <div
                      style={{
                        fontSize: 12,
                        color: tokens.text,
                        fontFamily: FONTS.sans,
                      }}
                    >
                      {err.message}
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div style={{ marginTop: 12 }}>
                        <CodeBlock>{err.stack}</CodeBlock>
                        {err.resolution && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: '8px 10px',
                              borderRadius: 6,
                              background: `${tokens.success}12`,
                              color: tokens.success,
                              fontSize: 11,
                              fontFamily: FONTS.sans,
                            }}
                          >
                            {err.resolution}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        )}

        {tab === 'hook-config' && (
          <Card>
            <SectionTitle>Hook Settings</SectionTitle>
            {hooksLoading ? (
              <LoadingSkeleton lines={5} height={18} />
            ) : (
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 14,
                    marginBottom: 16,
                  }}
                >
                  {hookConfig &&
                    Object.keys(hookConfig)
                      .filter((k) => k.startsWith('on'))
                      .map((k) => (
                        <Toggle
                          key={k}
                          label={k}
                          checked={hookConfig[k]}
                          onChange={(val) => updateConfig(k, val)}
                        />
                      ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {hookConfig && (
                    <>
                      <NumberInput
                        label="Timeout (ms)"
                        value={hookConfig.hookTimeoutMs || 5000}
                        onChange={(val) => updateConfig('hookTimeoutMs', val)}
                        min={1000}
                        max={30000}
                        step={1000}
                      />

                      <Toggle
                        label="Enable Webhooks"
                        checked={hookConfig.enableWebhooks || false}
                        onChange={(val) => updateConfig('enableWebhooks', val)}
                      />

                      {hookConfig.enableWebhooks && (
                        <TextInput
                          label="Webhook URL"
                          value={hookConfig.webhookUrl || ''}
                          onChange={(val) => updateConfig('webhookUrl', val)}
                          placeholder="https://example.com/webhook"
                        />
                      )}
                    </>
                  )}
                  {!hookConfig && !hooksLoading && (
                    <div
                      style={{
                        fontFamily: FONTS.mono,
                        fontSize: 12,
                        color: tokens.textMuted,
                        padding: 16,
                      }}
                    >
                      Hook config is managed via project config. See the Config page.
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

export default function HooksPage() {
  return (
    <ErrorBoundary>
      <HooksPageInner />
    </ErrorBoundary>
  );
}
