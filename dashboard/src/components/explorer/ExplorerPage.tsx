const TABS = [
  { id: 'phases',       label: 'Phases',        api: '/api/explorer/phases' },
  { id: 'todos',        label: 'Todos',          api: '/api/explorer/todos' },
  { id: 'milestones',   label: 'Milestones',     api: '/api/explorer/milestones' },
  { id: 'research',     label: 'Research',       api: '/api/explorer/research' },
  { id: 'requirements', label: 'Requirements',   api: '/api/explorer/requirements' },
  { id: 'notes',        label: 'Notes',          api: '/api/explorer/notes' },
  { id: 'audits',       label: 'Audits',         api: '/api/explorer/audits' },
  { id: 'quick',        label: 'Quick Tasks',    api: '/api/explorer/quick' },
];

export function ExplorerPage() {
  return (
    <div
      class="explorer"
      x-data={`{
        activeTab: 'phases',
        loaded: {},
        switchTab(id) {
          this.activeTab = id;
        }
      }`}
    >
      <div class="explorer__tabs" role="tablist" aria-label="Explorer tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            class="explorer__tab-btn"
            x-bind:aria-selected={`activeTab === '${tab.id}'`}
            x-on:click={`switchTab('${tab.id}')`}
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {TABS.map(tab => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          class="explorer__tab-content"
          x-show={`activeTab === '${tab.id}'`}
          hx-get={tab.api}
          hx-trigger="intersect once"
          hx-swap="innerHTML"
        >
          <div class="explorer__loading">Loading...</div>
        </div>
      ))}
    </div>
  );
}
