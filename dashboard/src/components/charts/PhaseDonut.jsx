import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';

export default function PhaseDonut({ data, height = 220 }) {
  const { tokens: t } = useTheme();

  const fills = [t.plan, t.build, t.run];

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            stroke="none"
          >
            {(data || []).map((_entry, i) => (
              <Cell key={i} fill={fills[i % fills.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          marginTop: 4,
        }}
      >
        {(data || []).map((entry, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: FONTS.mono,
              fontSize: 11,
              color: t.textMuted,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: fills[i % fills.length],
                display: 'inline-block',
              }}
            />
            {entry.name}
          </div>
        ))}
      </div>
    </div>
  );
}
