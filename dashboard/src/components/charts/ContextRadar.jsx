import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function ContextRadar({ data, height = 220 }) {
  const { tokens: t } = useTheme();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke={t.border} />
        <PolarAngleAxis
          dataKey="name"
          tick={{ fill: t.textMuted, fontSize: 10, fontFamily: FONTS.mono }}
        />
        <PolarRadiusAxis
          tick={{ fill: t.textDim, fontSize: 9, fontFamily: FONTS.mono }}
          axisLine={false}
        />
        <Radar
          dataKey="value"
          stroke={t.accent}
          fill={t.accent}
          fillOpacity={0.2}
          strokeWidth={2}
          name="Context"
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
