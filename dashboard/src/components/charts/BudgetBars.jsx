import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import ChartTooltip from '../ui/ChartTooltip.jsx';

export default function BudgetBars({ data, height = 220 }) {
  const { tokens: t } = useTheme();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
      >
        <XAxis
          type="number"
          tick={{ fill: t.textMuted, fontSize: 10, fontFamily: FONTS.mono }}
          axisLine={{ stroke: t.border }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: t.textMuted, fontSize: 10, fontFamily: FONTS.mono }}
          axisLine={false}
          tickLine={false}
          width={80}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar
          dataKey="value"
          fill={t.accent}
          radius={[0, 4, 4, 0]}
          name="Budget"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
