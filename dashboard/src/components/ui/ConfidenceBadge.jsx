import { useTheme } from '../../theme/ThemeProvider.jsx';
import Badge from './Badge.jsx';

const LEVEL_COLORS = {
  high: 'success',
  medium: 'warning',
  low: 'error',
};

export default function ConfidenceBadge({ level }) {
  const { tokens: t } = useTheme();
  const colorKey = LEVEL_COLORS[level] || 'textDim';
  const label = level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Unknown';

  return (
    <Badge color={t[colorKey]}>
      {label}
    </Badge>
  );
}
