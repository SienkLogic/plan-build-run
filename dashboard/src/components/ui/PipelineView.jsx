import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

const DEFAULT_STAGES = [
  { id: 'questioning', label: 'Question', status: 'pending' },
  { id: 'research', label: 'Research', status: 'pending' },
  { id: 'requirements', label: 'Requirements', status: 'pending' },
  { id: 'roadmap', label: 'Roadmap', status: 'pending' },
  { id: 'plan', label: 'Plan', status: 'pending' },
  { id: 'build', label: 'Build', status: 'pending' },
  { id: 'review', label: 'Review', status: 'pending' },
];

const SYMBOLS = {
  done: '\u2713',      // checkmark
  active: '\u25C6',    // filled diamond
  pending: '\u25CB',   // empty circle
};

function stageSymbol(status) {
  return SYMBOLS[status] || SYMBOLS.pending;
}

export default function PipelineView({ stages, currentStage }) {
  const { tokens: t } = useTheme();
  const stageList = stages && stages.length > 0 ? stages : DEFAULT_STAGES;

  // If currentStage is provided, override statuses based on position
  const resolved = currentStage
    ? stageList.map((s, i) => {
        const currentIdx = stageList.findIndex((st) => st.id === currentStage);
        if (currentIdx < 0) return s;
        if (i < currentIdx) return { ...s, status: 'done' };
        if (i === currentIdx) return { ...s, status: 'active' };
        return { ...s, status: 'pending' };
      })
    : stageList;

  function stageColor(status) {
    if (status === 'done') return t.success;
    if (status === 'active') return t.accent;
    return t.textDim;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0,
      }}
    >
      {resolved.map((stage, i) => {
        const color = stageColor(stage.status);
        const isActive = stage.status === 'active';
        const lineDone = i < resolved.length - 1 && resolved[i].status === 'done';

        return (
          <div
            key={stage.id}
            style={{
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* Stage node */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 56,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: `2px solid ${color}`,
                  background: isActive ? `${color}22` : 'transparent',
                  boxShadow: isActive ? `0 0 10px ${color}44` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: color,
                  fontFamily: FONTS.sans,
                  transition: 'all 0.3s',
                }}
              >
                {stageSymbol(stage.status)}
              </div>
              <span
                style={{
                  marginTop: 4,
                  fontFamily: FONTS.mono,
                  fontSize: 9,
                  color: isActive ? t.accent : t.textMuted,
                  fontWeight: isActive ? 700 : 400,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  whiteSpace: 'nowrap',
                }}
              >
                {stage.label}
              </span>
            </div>

            {/* Connecting line */}
            {i < resolved.length - 1 && (
              <div
                style={{
                  width: 24,
                  height: 2,
                  background: lineDone ? t.success : t.textDim,
                  borderStyle: lineDone ? 'solid' : 'dashed',
                  opacity: lineDone ? 1 : 0.4,
                  marginBottom: 16,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
