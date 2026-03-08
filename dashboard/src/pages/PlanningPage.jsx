import { useState, useEffect } from 'react';
import { TabBar, ErrorBoundary, LoadingSkeleton } from '../components/ui/index.js';
import useFetch from '../hooks/useFetch.js';
import useWebSocket from '../hooks/useWebSocket.js';
import MilestonesTab from './planning/MilestonesTab.jsx';
import PhasesTab from './planning/PhasesTab.jsx';
import TodosTab from './planning/TodosTab.jsx';
import QuickTab from './planning/QuickTab.jsx';
import NotesTab from './planning/NotesTab.jsx';
import ResearchTab from './planning/ResearchTab.jsx';
import DecisionsTab from './planning/DecisionsTab.jsx';
import FilesTab from './planning/FilesTab.jsx';

const TABS = ['milestones', 'phases', 'todos', 'notes', 'quick', 'research', 'decisions', 'files'];

export default function PlanningPage() {
  const [tab, setTab] = useState('milestones');

  const milestonesData = useFetch('/api/planning/milestones');
  const phasesData = useFetch('/api/planning/phases');
  const todosData = useFetch('/api/planning/todos');
  const notesData = useFetch('/api/planning/notes');
  const quickData = useFetch('/api/planning/quick');
  const researchData = useFetch('/api/planning/research');
  const decisionsData = useFetch('/api/planning/decisions');

  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const { events: wsEvents } = useWebSocket(wsUrl);

  useEffect(() => {
    if (wsEvents.length > 0) {
      milestonesData.refetch();
      phasesData.refetch();
      todosData.refetch();
      notesData.refetch();
      quickData.refetch();
      researchData.refetch();
      decisionsData.refetch();
    }
  }, [wsEvents.length, milestonesData, phasesData, todosData, notesData, quickData, researchData, decisionsData]);

  // FilesTab manages its own data fetching; placeholder avoids undefined access
  const filesData = { data: null, loading: false, refetch: () => {} };

  const tabDataMap = {
    milestones: milestonesData,
    phases: phasesData,
    todos: todosData,
    notes: notesData,
    quick: quickData,
    research: researchData,
    decisions: decisionsData,
    files: filesData,
  };

  const currentData = tabDataMap[tab];

  const renderTab = () => {
    if (currentData.loading) {
      return <LoadingSkeleton count={4} />;
    }

    switch (tab) {
      case 'milestones':
        return (
          <MilestonesTab
            milestones={milestonesData.data || []}
            phases={phasesData.data || []}
            todos={todosData.data || []}
          />
        );
      case 'phases':
        return (
          <PhasesTab
            phases={phasesData.data || []}
            todos={todosData.data || []}
          />
        );
      case 'todos':
        return <TodosTab todos={todosData.data || []} onRefresh={todosData.refetch} />;
      case 'notes':
        return <NotesTab notes={notesData.data || []} onRefresh={notesData.refetch} />;
      case 'quick':
        return <QuickTab quick={quickData.data || []} />;
      case 'research':
        return <ResearchTab research={researchData.data || []} />;
      case 'decisions':
        return <DecisionsTab decisions={decisionsData.data || []} onCreateDecision={decisionsData.refetch} />;
      case 'files':
        return <FilesTab />;
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
        {renderTab()}
      </div>
    </ErrorBoundary>
  );
}
