import { useTheme } from '../../theme/ThemeProvider.jsx';
import Badge from './Badge.jsx';

export default function QualityGateBadge({ passed }) {
  const { tokens: t } = useTheme();
  const color = passed ? t.success : t.error;
  const symbol = passed ? '\u2713' : '\u2717';
  const label = passed ? 'Passed' : 'Failed';

  return (
    <Badge color={color}>
      {symbol} {label}
    </Badge>
  );
}
