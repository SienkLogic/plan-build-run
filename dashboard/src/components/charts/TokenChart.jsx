import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import ChartTooltip from '../ui/ChartTooltip.jsx';

export default function TokenChart({ data, height = 220 }) {
  const { tokens: t } = useTheme();

  const gradientId = 'tokenInputGrad';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.accent} stopOpacity={0.3} />
            <stop offset="100%" stopColor={t.accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="name"
          tick={{ fill: t.textMuted, fontSize: 10, fontFamily: FONTS.mono }}
          axisLine={{ stroke: t.border }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: t.textMuted, fontSize: 10, fontFamily: FONTS.mono }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="input"
          stroke={t.accent}
          fill={`url(#${gradientId})`}
          strokeWidth={2}
          name="Input"
        />
        <Area
          type="monotone"
          dataKey="output"
          stroke={t.info}
          fill="none"
          strokeWidth={2}
          strokeDasharray="6 3"
          name="Output"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
