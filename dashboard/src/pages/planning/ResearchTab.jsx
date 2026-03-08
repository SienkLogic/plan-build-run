import { useState } from 'react';
import { Card, Badge, ConfidenceBadge, QualityGateBadge } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function ResearchTab({ research = [] }) {
  const { tokens } = useTheme();
  const [expandedId, setExpandedId] = useState(null);

  const statusBadgeColor = (status) => {
    if (status === 'integrated' || status === 'applied') return tokens.success;
    if (status === 'reviewed') return tokens.info;
    if (status === 'planned') return tokens.warning;
    return tokens.textDim;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {research.map((item) => {
        const isExpanded = expandedId === item.id;
        return (
          <Card
            key={item.id}
            onClick={() => setExpandedId(isExpanded ? null : item.id)}
            style={{ padding: 12 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>{'\uD83D\uDCC4'}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, fontFamily: FONTS.sans, color: tokens.text }}>
                {item.title}
              </span>
              <Badge color={statusBadgeColor(item.status)}>{item.status}</Badge>
              {item.confidence && <ConfidenceBadge level={item.confidence} />}
              {item.qualityGate !== undefined && <QualityGateBadge passed={item.qualityGate} />}
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 10,
                color: tokens.textMuted,
                marginTop: 4,
              }}
            >
              {item.source} &middot; {item.date} &middot; {item.relevance} relevance
            </div>

            {isExpanded && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div
                  style={{
                    background: tokens.codeBlock,
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 11,
                    color: tokens.textMuted,
                    fontFamily: FONTS.sans,
                    lineHeight: 1.5,
                  }}
                >
                  {item.summary}
                </div>

                {item.keyTakeaways && item.keyTakeaways.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        fontFamily: FONTS.mono,
                        color: tokens.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      Key Takeaways
                    </div>
                    {item.keyTakeaways.map((takeaway, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 6,
                          padding: '3px 0',
                          fontSize: 11,
                          fontFamily: FONTS.sans,
                          color: tokens.text,
                        }}
                      >
                        <span style={{ color: tokens.accent, fontWeight: 700, flexShrink: 0 }}>{'\u2192'}</span>
                        <span>{takeaway}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
