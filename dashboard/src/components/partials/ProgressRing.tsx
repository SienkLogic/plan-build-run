import type { FC } from 'hono/jsx';

interface ProgressRingProps {
  percent: number;
  size?: number;
}

export const ProgressRing: FC<ProgressRingProps> = ({ percent, size = 120 }) => {
  const r = (size / 2) - 8;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - percent / 100);
  const center = size / 2;

  return (
    <div class="progress-ring-wrapper" aria-label={`${percent}% complete`}>
      <svg
        class="progress-ring__svg"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-hidden="true"
      >
        <circle
          class="progress-ring__bg"
          cx={center}
          cy={center}
          r={r}
          stroke-width="8"
        />
        <circle
          class="progress-ring__fg"
          cx={center}
          cy={center}
          r={r}
          stroke-width="8"
          stroke-dasharray={`${circumference}`}
          stroke-dashoffset={`${offset}`}
        />
        <text
          class="progress-ring__text"
          x={center}
          y={center}
          transform={`rotate(90, ${center}, ${center})`}
        >
          {percent}%
        </text>
      </svg>
    </div>
  );
};
