import { useTheme } from '../../theme/ThemeProvider.jsx';

const SKELETON_KEYFRAMES_ID = 'pbr-skeleton-pulse';

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SKELETON_KEYFRAMES_ID)) return;

  const style = document.createElement('style');
  style.id = SKELETON_KEYFRAMES_ID;
  style.textContent = `
    @keyframes pbr-skeleton-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

const WIDTH_PATTERN = ['100%', '80%', '60%'];

/**
 * Animated loading placeholder with configurable line count and height.
 *
 * @param {{ lines?: number, height?: number, style?: object }} props
 */
export default function LoadingSkeleton({ lines = 3, height = 16, style }) {
  const { tokens } = useTheme();
  ensureKeyframes();

  return (
    <div style={style}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          style={{
            background: tokens.border,
            height,
            borderRadius: 4,
            width: WIDTH_PATTERN[i % WIDTH_PATTERN.length],
            marginBottom: i < lines - 1 ? 8 : 0,
            animation: 'pbr-skeleton-pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Card-shaped skeleton with a title bar and body lines.
 */
export function SkeletonCard({ height, style }) {
  const { tokens } = useTheme();
  ensureKeyframes();

  return (
    <div
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: 8,
        padding: 20,
        ...(height != null ? { height, overflow: 'hidden' } : {}),
        ...style,
      }}
    >
      {/* Title line */}
      <div
        style={{
          background: tokens.border,
          height: 20,
          width: '50%',
          borderRadius: 4,
          marginBottom: 16,
          animation: 'pbr-skeleton-pulse 1.5s ease-in-out infinite',
        }}
      />
      {/* Body lines */}
      <LoadingSkeleton lines={3} height={14} />
    </div>
  );
}
