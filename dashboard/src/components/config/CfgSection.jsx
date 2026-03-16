import { useTheme } from '../../theme/ThemeProvider.jsx';
import { FONTS } from '../../lib/constants.js';
import { Card, SectionTitle, Toggle, SelectInput, NumberInput, TextInput } from '../ui';

export default function CfgSection({ title, sub, section, fields, config, onChange, errors = {} }) {
  const { tokens } = useTheme();

  const renderField = (field) => {
    const raw = section === '_root' ? config[field.key] : config[section]?.[field.key];
    const value = raw !== undefined ? raw : (field.type === 'toggle' ? false : field.type === 'number' ? 0 : '');
    const errorKey = `${section}.${field.key}`;
    const error = errors[errorKey];

    let input = null;
    switch (field.type) {
      case 'toggle':
        input = (
          <Toggle
            checked={value}
            onChange={(v) => onChange(section, field.key, v)}
            label={field.label}
          />
        );
        break;
      case 'select':
        input = (
          <SelectInput
            value={value}
            options={field.options}
            onChange={(v) => onChange(section, field.key, v)}
            label={field.label}
          />
        );
        break;
      case 'number':
        input = (
          <NumberInput
            value={value}
            onChange={(v) => onChange(section, field.key, v)}
            label={field.label}
            min={field.min}
            max={field.max}
            step={field.step}
          />
        );
        break;
      case 'text':
        input = (
          <TextInput
            value={value}
            onChange={(v) => onChange(section, field.key, v)}
            label={field.label}
            placeholder={field.placeholder}
          />
        );
        break;
      default:
        break;
    }

    return (
      <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {input}
        {error && (
          <span style={{
            fontFamily: FONTS.mono,
            fontSize: 10,
            color: tokens.error,
            paddingLeft: 4,
          }}>
            {error}
          </span>
        )}
      </div>
    );
  };

  return (
    <Card>
      <SectionTitle title={title} sub={sub} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 14,
          fontFamily: FONTS.sans,
        }}
      >
        {fields.map(renderField)}
      </div>
    </Card>
  );
}
