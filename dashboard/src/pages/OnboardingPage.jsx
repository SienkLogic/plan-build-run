import { useState } from 'react';
import useFetch from '../hooks/useFetch.js';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';

function SectionCard({ section }) {
  const { tokens } = useTheme();
  return (
    <div
      style={{
        padding: 16,
        background: tokens.surface || 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        border: `1px solid ${tokens.border || '#2d3748'}`,
        marginBottom: 16,
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 600, color: tokens.text, marginBottom: 10 }}>
        {section.title}
      </h3>
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.6,
          color: tokens.text,
          fontFamily: FONTS.sans,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {section.content}
      </pre>
      {section.source && (
        <div style={{ marginTop: 8, fontSize: 10, color: tokens.textMuted, fontFamily: FONTS.mono }}>
          Source: {section.source}
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  const { tokens } = useTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error } = useFetch(`/api/progress/onboarding?r=${refreshKey}`);

  if (loading) {
    return (
      <div style={{ padding: 24, color: tokens.textMuted, fontSize: 13 }}>
        Generating onboarding guide…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 24, color: '#ef4444', fontSize: 13 }}>
        Failed to load onboarding guide: {error?.message || 'Unknown error'}
      </div>
    );
  }

  if (data.enabled === false) {
    return (
      <div style={{ padding: 24, color: tokens.textMuted, fontSize: 13 }}>
        Team onboarding is disabled. Enable <code>features.team_onboarding</code> in config.
      </div>
    );
  }

  const { sections = [], generatedAt } = data;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: tokens.text, margin: 0 }}>
            Getting Started Guide
          </h2>
          {generatedAt && (
            <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 4, fontFamily: FONTS.mono }}>
              Generated: {new Date(generatedAt).toLocaleString()}
            </div>
          )}
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          style={{
            padding: '6px 14px',
            background: tokens.accent || '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: FONTS.sans,
          }}
        >
          Regenerate
        </button>
      </div>

      {/* Sections */}
      {sections.length > 0 ? (
        sections.map((section, i) => (
          <SectionCard key={i} section={section} />
        ))
      ) : (
        <p style={{ color: tokens.textMuted, fontSize: 12 }}>
          No .planning/ files found to generate the guide from. Create PROJECT.md, ROADMAP.md, or CONTEXT.md first.
        </p>
      )}
    </div>
  );
}
