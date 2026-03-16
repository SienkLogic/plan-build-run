import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../theme/ThemeProvider.jsx';
import { FONTS } from '../lib/constants.js';
import { SectionTitle, ErrorBoundary, ErrorBox } from '../components/ui/index.js';
import { SkeletonCard } from '../components/ui/LoadingSkeleton.jsx';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import useDocumentTitle from '../hooks/useDocumentTitle.js';
import useToast from '../hooks/useToast.jsx';
import { apiPost } from '../lib/api.js';
import MilestonesTab from './planning/MilestonesTab.jsx';
import PhasesTab from './planning/PhasesTab.jsx';
import TodosTab from './planning/TodosTab.jsx';
import QuickTab from './planning/QuickTab.jsx';
import NotesTab from './planning/NotesTab.jsx';
import ResearchTab from './planning/ResearchTab.jsx';
import DecisionsTab from './planning/DecisionsTab.jsx';
import FilesTab from './planning/FilesTab.jsx';

const TABS = [
  { key: 'milestones', label: 'milestones' },
  { key: 'phases', label: 'phases' },
  { key: 'todos', label: 'todos' },
  { key: 'notes', label: 'notes' },
  { key: 'quick', label: 'quick' },
  { key: 'research', label: 'research' },
  { key: 'decisions', label: 'decisions' },
  { key: 'files', label: 'files' },
];

function PlanningPageContent() {
  const { tokens: t } = useTheme();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('milestones');

  const phases = useFetch('/api/planning/phases');
  const milestones = useFetch('/api/planning/milestones');
  const todos = useFetch('/api/planning/todos');
  const notes = useFetch('/api/planning/notes');
  const quick = useFetch('/api/planning/quick');
  const research = useFetch('/api/planning/research');
  const decisions = useFetch('/api/planning/decisions');

  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const ws = useWebSocket(wsUrl);
  useDocumentTitle({ wsEvents: ws.events });

  const refetchAll = useCallback(() => {
    phases.refetch();
    milestones.refetch();
    todos.refetch();
    notes.refetch();
    quick.refetch();
    research.refetch();
    decisions.refetch();
  }, [phases.refetch, milestones.refetch, todos.refetch, notes.refetch, quick.refetch, research.refetch, decisions.refetch]);

  useEffect(() => {
    if (ws.events.length > 0) {
      refetchAll();
    }
  }, [ws.events.length, refetchAll]);

  useEffect(() => {
    if (phases.error && addToast) addToast('error', phases.error.message);
  }, [phases.error, addToast]);

  const isLoading = phases.loading;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SkeletonCard height={40} />
        <SkeletonCard height={300} />
      </div>
    );
  }

  const handleCreateDecision = async (phase, text) => {
    try {
      await apiPost('/api/planning/decisions', { phase, text });
      decisions.refetch();
      addToast('success', 'Decision recorded');
    } catch (err) {
      addToast('error', 'Failed to create decision: ' + err.message);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'milestones':
        return (
          <MilestonesTab
            milestones={Array.isArray(milestones.data) ? milestones.data : []}
            phases={Array.isArray(phases.data) ? phases.data : []}
            todos={Array.isArray(todos.data) ? todos.data : []}
          />
        );
      case 'phases':
        return (
          <PhasesTab
            phases={Array.isArray(phases.data) ? phases.data : []}
            todos={Array.isArray(todos.data) ? todos.data : []}
          />
        );
      case 'todos':
        return (
          <TodosTab
            todos={Array.isArray(todos.data) ? todos.data : []}
            onRefresh={todos.refetch}
          />
        );
      case 'notes':
        return (
          <NotesTab
            notes={Array.isArray(notes.data) ? notes.data : []}
            onRefresh={notes.refetch}
          />
        );
      case 'quick':
        return <QuickTab quick={Array.isArray(quick.data) ? quick.data : []} />;
      case 'research':
        return <ResearchTab research={Array.isArray(research.data) ? research.data : []} />;
      case 'decisions':
        return (
          <DecisionsTab
            decisions={Array.isArray(decisions.data) ? decisions.data : []}
            onCreateDecision={handleCreateDecision}
          />
        );
      case 'files':
        return <FilesTab onRefresh={refetchAll} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle>Planning</SectionTitle>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${t.border}`, paddingBottom: 8 }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px 6px 0 0',
              borderTop: activeTab === tab.key ? `1px solid ${t.accent}` : `1px solid transparent`,
              borderLeft: activeTab === tab.key ? `1px solid ${t.accent}` : `1px solid transparent`,
              borderRight: activeTab === tab.key ? `1px solid ${t.accent}` : `1px solid transparent`,
              borderBottom: 'none',
              background: activeTab === tab.key ? `${t.accent}18` : 'transparent',
              color: activeTab === tab.key ? t.accent : t.textMuted,
              fontFamily: FONTS.mono,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'lowercase',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {renderTab()}
    </div>
  );
}

export default function PlanningPage() {
  return (
    <ErrorBoundary>
      <PlanningPageContent />
    </ErrorBoundary>
  );
}
