import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import { Card } from '../../components/ui/index.js';

export default function QuickTab({ quick = [] }) {
  const { tokens: t } = useTheme();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {quick.map((item) => (
        <Card key={item.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontSize: 16,
                flexShrink: 0,
                width: 22,
                textAlign: 'center',
              }}
            >
              {item.done ? '\u2705' : '\u23F3'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 13,
                  color: item.done ? t.textMuted : t.text,
                  textDecoration: item.done ? 'line-through' : 'none',
                }}
              >
                {item.content}
              </div>
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10,
                  color: t.textMuted,
                  marginTop: 4,
                }}
              >
                {item.created}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
