import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import ChartTooltip from '../ui/ChartTooltip.jsx';

function pctFormatter(v) {
  return `${v}%`;
}

export default function SuccessTrend({ data, height = 220 }) {
  const { tokens: t } = useTheme();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fill: t.textMuted, fontSize: 10, fontFamily: FONTS.mono }}
          axisLine={{ stroke: t.border }}
          tickLine={false}
        />
        <YAxis
          domain={[60, 100]}
          tickFormatter={pctFormatter}
          tick={{ fill: t.textMuted, fontSize: 10, fontFamily: FONTS.mono }}
          axisLine={false}
          tickLine={false}
          width={42}
        />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="rate"
          stroke={t.success}
          strokeWidth={2}
          dot={{ r: 3, fill: t.success }}
          activeDot={{ r: 5 }}
          name="Success"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
