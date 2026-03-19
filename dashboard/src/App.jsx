import { useState, useEffect, lazy, Suspense } from 'react';
import { useTheme } from './theme/ThemeProvider.jsx';
import { FONTS, NAV } from './lib/constants.js';
import { ErrorBoundary, PBRBanner, SkeletonCard } from './components/ui/index.js';
import ConnectionBanner from './components/ui/ConnectionBanner.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import Header from './components/layout/Header.jsx';

// Core pages (Phase 26)
const Overview = lazy(() => import('./pages/Overview.jsx'));
const LiveFeed = lazy(() => import('./pages/LiveFeed.jsx'));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage.jsx'));

// Extended pages (Phase 27)
const HooksPage = lazy(() => import('./pages/HooksPage.jsx'));
const ConfigPage = lazy(() => import('./pages/ConfigPage.jsx'));
const PhaseDetailView = lazy(() => import('./pages/PhaseDetailView.jsx'));
const Telemetry = lazy(() => import('./pages/Telemetry.jsx'));
const AgentsPage = lazy(() => import('./pages/AgentsPage.jsx'));
const MemoryPage = lazy(() => import('./pages/MemoryPage.jsx'));
const PlanningPage = lazy(() => import('./pages/PlanningPage.jsx'));

// Phase 15 DX pages
const ProgressPage = lazy(() => import('./pages/ProgressPage.jsx'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.jsx'));

// Phase 52 pages
const ResearchPage = lazy(() => import('./pages/ResearchPage.jsx'));
const IntelPage = lazy(() => import('./pages/IntelPage.jsx'));
const IncidentsPage = lazy(() => import('./pages/IncidentsPage.jsx'));
const SessionsPage = lazy(() => import('./pages/SessionsPage.jsx'));

import useFetch from './hooks/useFetch.js';
import useWebSocket from './hooks/useWebSocket.js';

export default function App() {
  const { tokens } = useTheme();
  const [nav, setNav] = useState('roadmap');
  const [collapsed, setCollapsed] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const wsUrl = 'ws://' + window.location.hostname + ':' + (window.location.port || '3141') + '/ws';
  const { status: wsStatus } = useWebSocket(wsUrl, {
    onReconnect: () => setRefreshKey((k) => k + 1),
  });

  // Reset selectedPhase when nav changes
  useEffect(() => {
    setSelectedPhase(null);
  }, [nav]);

  const { data: projectsData, loading: projectsLoading } = useFetch('/api/projects');

  const projects = projectsData || [];

  // Auto-select first project if none selected
  const effectiveActiveProject = activeProject || (projects.length > 0 ? projects[0].id : null);

  const currentProject = projects.find((p) => p.id === effectiveActiveProject) || projects[0] || null;
  const currentNavItem = NAV.find((n) => n.id === nav);
  const pageTitle = currentNavItem ? currentNavItem.label : 'Overview';

  const sidebarProjects = projectsLoading
    ? [{ id: '_loading', name: 'Loading...', repo: '', branch: '', status: 'running', sessions: 0 }]
    : projects;

  const PAGES = {
    overview: Overview,
    live: LiveFeed,
    roadmap: RoadmapPage,
    // Phase 27 extended pages
    telemetry: Telemetry,
    planning: PlanningPage,
    agents: AgentsPage,
    memory: MemoryPage,
    hooks: HooksPage,
    config: ConfigPage,
    // Phase 15 DX pages
    progress: ProgressPage,
    onboarding: OnboardingPage,
    // Phase 52 pages
    research: ResearchPage,
    intel: IntelPage,
    incidents: IncidentsPage,
    sessions: SessionsPage,
  };
  const PageComponent = PAGES[nav];

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: tokens.bg,
        color: tokens.text,
        fontFamily: FONTS.sans,
      }}
    >
      <ConnectionBanner status={wsStatus} />

      {/* Sidebar */}
      <Sidebar
        nav={nav}
        navItems={NAV}
        onNav={setNav}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        activeProject={projectsLoading ? '_loading' : effectiveActiveProject}
        projects={sidebarProjects}
        onSwitchProject={setActiveProject}
      />

      {/* Main area */}
      <div
        role="main"
        style={{
          flex: 1,
          marginLeft: collapsed ? 52 : 190,
          transition: 'margin-left 0.2s',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <Header title={pageTitle} activeProject={currentProject} />
        <PBRBanner />

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 20,
          }}
        >
          <ErrorBoundary>
            <Suspense fallback={<SkeletonCard />}>
              {nav === 'roadmap' && selectedPhase ? (
                <PhaseDetailView
                  key={refreshKey}
                  phase={selectedPhase}
                  onBack={() => setSelectedPhase(null)}
                />
              ) : PageComponent ? (
                <PageComponent
                  key={refreshKey}
                  project={currentProject}
                  {...(nav === 'roadmap' ? { onSelectPhase: setSelectedPhase } : {})}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 }}>
                  <div style={{ fontSize: 40, opacity: 0.3 }}>{currentNavItem?.icon || '\u25C8'}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: tokens.text }}>{pageTitle}</div>
                  <div style={{ fontSize: 12, color: tokens.textMuted, fontFamily: FONTS.mono }}>Coming soon</div>
                </div>
              )}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
