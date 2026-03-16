import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import useFetch from '../../hooks/useFetch.js';

function deriveStage(str) {
  if (!str) return null;
  const s = str.toLowerCase();
  if (s.includes('build')) return 'Build';
  if (s.includes('plan')) return 'Plan';
  if (s.includes('review')) return 'Review';
  if (s.includes('roadmap')) return 'Roadmap';
  if (s.includes('research')) return 'Research';
  if (s.includes('requirement')) return 'Requirements';
  if (s.includes('question')) return 'Questioning';
  return 'Build';
}

export default function PBRBanner() {
  const { tokens: t } = useTheme();
  const { data } = useFetch('/api/status');

  if (!data) return null;

  const stoppedAt = data.stopped_at || data.status || '';
  const stage = deriveStage(stoppedAt);

  if (!stage) return null;

  return (
    <div
      style={{
        background: t.surface,
        borderBottom: `1px solid ${t.border}`,
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: FONTS.mono,
        fontSize: 12,
      }}
    >
      <span style={{ color: t.accent, fontWeight: 700 }}>PBR</span>
      <span style={{ color: t.textDim }}>&gt;</span>
      <span style={{ color: t.text, fontWeight: 700 }}>{stage}</span>
    </div>
  );
}
