import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { Card, SectionTitle, CodeBlock, ErrorBoundary, LoadingSkeleton, TabBar } from '../components/ui/index.js';
import CfgSection from '../components/config/CfgSection.jsx';
import { CONFIG_SECTIONS, DEFAULT_CONFIG, QUICK_START_FIELDS } from '../lib/configSchema.js';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useToast from '../hooks/useToast.jsx';
import { apiPut } from '../lib/api.js';

const VIEW_TABS = ['Quick Start', 'Advanced'];

function ConfigPageInner() {
  const { tokens } = useTheme();
  const { data: fetchedConfig, loading, error, refetch } = useFetch('/api/config');
  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const { events: wsEvents } = useWebSocket(wsUrl);
  const { addToast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('Quick Start');
  const [errors, setErrors] = useState({});
  const serverCfgRef = useRef(null);

  // Initialize config: merge fetched data over defaults so all sections exist
  useEffect(() => {
    if (fetchedConfig && cfg === null) {
      const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      for (const [key, val] of Object.entries(fetchedConfig)) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val) && merged[key]) {
          merged[key] = { ...merged[key], ...val };
        } else {
          merged[key] = val;
        }
      }
      setCfg(merged);
      serverCfgRef.current = JSON.parse(JSON.stringify(merged));
    }
  }, [fetchedConfig, cfg]);

  useEffect(() => {
    if (wsEvents.length > 0) refetch();
  }, [wsEvents.length, refetch]);

  const updateConfig = (section, key, value) => {
    if (section === '_root') {
      setCfg((prev) => ({ ...prev, [key]: value }));
    } else {
      setCfg((prev) => ({
        ...prev,
        [section]: { ...prev[section], [key]: value },
      }));
    }
    setDirty(true);
    const errorKey = `${section}.${key}`;
    if (errors[errorKey]) {
      setErrors((prev) => { const next = { ...prev }; delete next[errorKey]; return next; });
    }
  };

  const validateConfig = (config) => {
    const errs = {};
    for (const sectionDef of CONFIG_SECTIONS) {
      for (const field of sectionDef.fields) {
        const val = sectionDef.key === '_root' ? config[field.key] : config[sectionDef.key]?.[field.key];
        if (field.type === 'number') {
          if (typeof val !== 'number' || isNaN(val)) {
            errs[`${sectionDef.key}.${field.key}`] = 'Must be a number';
          } else if (field.min !== undefined && val < field.min) {
            errs[`${sectionDef.key}.${field.key}`] = `Min: ${field.min}`;
          } else if (field.max !== undefined && val > field.max) {
            errs[`${sectionDef.key}.${field.key}`] = `Max: ${field.max}`;
          }
        }
        if (field.type === 'select' && field.options && !field.options.includes(val)) {
          errs[`${sectionDef.key}.${field.key}`] = `Must be one of: ${field.options.join(', ')}`;
        }
        if (field.type === 'text' && val !== undefined && typeof val !== 'string') {
          errs[`${sectionDef.key}.${field.key}`] = 'Must be a string';
        }
      }
    }
    return errs;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const validated = validateConfig(cfg);
      if (Object.keys(validated).length > 0) {
        setErrors(validated);
        addToast('error', 'Fix validation errors before saving');
        setSaving(false);
        return;
      }
      await apiPut('/api/config', cfg);
      serverCfgRef.current = JSON.parse(JSON.stringify(cfg));
      setErrors({});
      addToast('success', 'Configuration saved');
      setDirty(false);
    } catch (err) {
      addToast('error', 'Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (serverCfgRef.current) {
      setCfg(JSON.parse(JSON.stringify(serverCfgRef.current)));
    }
    setErrors({});
    setDirty(false);
    addToast('info', 'Changes reverted');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Array.from({ length: 7 }, (_, i) => (
          <Card key={i}>
            <LoadingSkeleton lines={3} height={18} />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ color: tokens.error, fontFamily: FONTS.mono, fontSize: 12 }}>
          Failed to load configuration: {error.message}
        </div>
        <button
          onClick={refetch}
          style={{
            marginTop: 12,
            background: tokens.accent,
            border: 'none',
            borderRadius: 6,
            padding: '6px 16px',
            fontFamily: FONTS.mono,
            fontSize: 11,
            color: tokens.bg,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </Card>
    );
  }

  if (!cfg) return null;

  // Build Quick Start sections: group QUICK_START_FIELDS by section, find field defs from CONFIG_SECTIONS
  const quickStartSections = [];
  for (const qf of QUICK_START_FIELDS) {
    const sectionDef = CONFIG_SECTIONS.find((s) => s.key === qf.section);
    if (!sectionDef) continue;
    const fieldDef = sectionDef.fields.find((f) => f.key === qf.key);
    if (!fieldDef) continue;

    let existing = quickStartSections.find((s) => s.key === qf.section);
    if (!existing) {
      existing = { key: qf.section, title: sectionDef.title, sub: sectionDef.sub, fields: [] };
      quickStartSections.push(existing);
    }
    existing.fields.push({ ...fieldDef, label: qf.label });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TabBar tabs={VIEW_TABS} active={viewMode} onChange={setViewMode} />

      {dirty && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: `${tokens.warning}18`,
            border: `1px solid ${tokens.warning}44`,
            borderRadius: 8,
            fontFamily: FONTS.sans,
            fontSize: 13,
            color: tokens.warning,
          }}
        >
          <span>Unsaved changes</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleReset}
              disabled={saving}
              style={{
                background: 'transparent',
                border: `1px solid ${tokens.border}`,
                borderRadius: 6,
                padding: '4px 12px',
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: tokens.textMuted,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: tokens.accent,
                border: 'none',
                borderRadius: 6,
                padding: '4px 12px',
                fontFamily: FONTS.mono,
                fontSize: 11,
                color: tokens.bg,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <Card>
        <div
          style={{
            padding: '10px 14px',
            background: `${tokens.info}12`,
            borderRadius: 6,
            fontFamily: FONTS.sans,
            fontSize: 12,
            color: tokens.textMuted,
            lineHeight: 1.5,
          }}
        >
          Configuration applies to the current project scope. Values are written
          to <code style={{ fontFamily: FONTS.mono, color: tokens.accent }}>.planning/config.json</code> and
          read by the orchestrator at session start.
        </div>
      </Card>

      {viewMode === 'Quick Start' ? (
        <>
          {quickStartSections.map((s) => (
            <CfgSection
              key={s.key}
              title={s.title}
              sub={`${s.sub} (essentials)`}
              section={s.key}
              fields={s.fields}
              config={cfg}
              onChange={updateConfig}
              errors={errors}
            />
          ))}
        </>
      ) : (
        CONFIG_SECTIONS.map((s) => (
          <CfgSection
            key={s.key}
            title={s.title}
            sub={s.sub}
            section={s.key}
            fields={s.fields}
            config={cfg}
            onChange={updateConfig}
            errors={errors}
          />
        ))
      )}

      <Card>
        <SectionTitle sub=".planning/config.json">Preview</SectionTitle>
        <div style={{ maxHeight: 250, overflowY: 'auto' }}>
          <CodeBlock>{JSON.stringify(cfg, null, 2)}</CodeBlock>
        </div>
      </Card>
    </div>
  );
}

export default function ConfigPage() {
  return (
    <ErrorBoundary>
      <ConfigPageInner />
    </ErrorBoundary>
  );
}
