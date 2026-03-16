import { useState } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, TabBar, Badge, ErrorBoundary } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useWebSocket from '../hooks/useWebSocket.js';

const FILTER_TABS = ['all', 'phase', 'spawn', 'complete', 'error', 'retry', 'checkpoint', 'context'];

function LiveFeedInner() {
  const { tokens: t } = useTheme();
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  const wsUrl = typeof window !== 'undefined'
    ? window.location.origin.replace(/^http/, 'ws') + '/ws'
    : null;

  const { status, events, clearEvents } = useWebSocket(wsUrl);

  const isConnecting = status === 'connecting' || status === 'reconnecting';
  const isDisconnected = status === 'disconnected' || isConnecting;

  // Show skeleton loading during initial connection
  if (status === 'connecting' && events.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: FONTS.sans, fontSize: 13, color: t.textMuted, textAlign: 'center', padding: 8 }}>
          Connecting to live feed...
        </div>
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} height={60} />
        ))}
      </div>
    );
  }

  const typeColors = {
    event: t.textMuted,
    phase: t.plan,
    spawn: t.accent,
    complete: t.success,
    error: t.error,
    retry: t.warning,
    checkpoint: t.info,
    context: t.build,
  };

  const statusColors = {
    connected: t.success,
    connecting: t.warning,
    disconnected: t.error,
  };

  const statusLabels = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected',
  };

  const filtered = filter === 'all'
    ? events
    : events.filter(function (e) { return e.type === filter; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Disconnection banner */}
      {isDisconnected && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            background: `${t.warning}26`,
            borderLeft: `3px solid ${t.warning}`,
            borderRadius: '0 8px 8px 0',
            fontFamily: FONTS.sans,
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 16 }}>&#9888;</span>
          <span style={{ color: t.warning, fontWeight: 600 }}>
            {status === 'connecting'
              ? 'Connecting to WebSocket server...'
              : 'WebSocket disconnected \u2014 attempting to reconnect...'}
          </span>
        </div>
      )}

      {/* Connection status indicator */}
      <Card
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: `${statusColors[status] || t.textMuted}08`,
          borderColor: `${statusColors[status] || t.textMuted}30`,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColors[status] || t.textMuted,
            boxShadow: status === 'connected' ? `0 0 8px ${t.success}` : 'none',
            animation: status === 'connected' ? 'pulse 2s infinite' : 'none',
          }}
        />
        <span
          style={{
            fontFamily: FONTS.sans,
            fontSize: 13,
            fontWeight: 600,
            color: statusColors[status] || t.textMuted,
          }}
        >
          {statusLabels[status] || status}
        </span>
        <span
          style={{
            fontFamily: FONTS.mono,
            fontSize: 10,
            color: t.textMuted,
            marginLeft: 'auto',
          }}
        >
          {wsUrl || 'no URL'}
        </span>
        {events.length > 0 && (
          <button
            onClick={function (e) { e.stopPropagation(); clearEvents(); }}
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              padding: '2px 10px',
              fontFamily: FONTS.mono,
              fontSize: 10,
              color: t.textMuted,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </Card>

      {/* Filter tabs */}
      <TabBar tabs={FILTER_TABS} active={filter} onChange={setFilter} />

      {/* Event list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {filtered.map(function (ev, i) {
          const isExpanded = expanded === i;
          const dotColor = typeColors[ev.type] || t.textMuted;

          return (
            <Card
              key={i}
              onClick={function () { setExpanded(isExpanded ? null : i); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderColor: isExpanded ? t.accent + '44' : t.border,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {/* Timestamp */}
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 10,
                    color: t.textDim,
                    width: 72,
                    flexShrink: 0,
                  }}
                >
                  {ev.ts}
                </span>

                {/* Colored dot */}
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                  }}
                />

                {/* Message */}
                <span
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    color: t.text,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ev.msg}
                </span>

                {/* Type badge */}
                <Badge color={dotColor}>{ev.type}</Badge>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div
                  style={{
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: `1px solid ${t.border}`,
                    display: 'flex',
                    gap: 24,
                    fontFamily: FONTS.mono,
                    fontSize: 10,
                  }}
                >
                  <div>
                    <span style={{ color: t.textDim }}>Source: </span>
                    <span style={{ color: t.accent }}>{ev.source}</span>
                  </div>
                  <div>
                    <span style={{ color: t.textDim }}>Level: </span>
                    <span style={{ color: t.text }}>{ev.level}</span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <Card>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 12,
                color: t.textMuted,
                textAlign: 'center',
                padding: 24,
              }}
            >
              {events.length === 0
                ? 'Waiting for events...'
                : `No events matching filter "${filter}"`}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function LiveFeed() {
  return (
    <ErrorBoundary>
      <LiveFeedInner />
    </ErrorBoundary>
  );
}
