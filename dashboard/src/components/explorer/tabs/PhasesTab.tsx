interface Phase {
  id: number | string;
  name: string;
  status: string;
  planCount?: number;
}

interface Plan {
  planId: string;
  planTitle?: string | null;
  taskCount?: number;
  summary?: Record<string, unknown> | null;
  content?: string | null;
  commits?: unknown[];
}

interface PhaseDetail {
  phaseId: string;
  phaseName: string;
  plans: Plan[];
  verification?: Record<string, unknown> | null;
}

interface PhaseDoc {
  phaseId: string;
  planId: string;
  docType: string;
  phaseName?: string;
  frontmatter?: Record<string, unknown> | null;
  html?: string | null;
}

// ---- Badge helper ----

function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase().replace(/[^a-z-]/g, '-');
  return `explorer-badge explorer-badge--${s}`;
}

// ---- Phase list (Phases tab root) ----

export function PhasesTab({ phases }: { phases: Phase[] }) {
  if (!phases || phases.length === 0) {
    return (
      <div class="explorer__loading">No phases found in roadmap.</div>
    );
  }

  return (
    <div class="explorer-list">
      {phases.map((phase) => (
        <PhaseItem key={String(phase.id)} phase={phase} />
      ))}
    </div>
  );
}

// ---- Single expandable phase row ----

function PhaseItem({ phase }: { phase: Phase }) {
  const phaseId = String(phase.id).padStart(2, '0');

  return (
    <div class="explorer-item" x-data="{ open: false }">
      <div class="explorer-item__header" x-on:click="open = !open">
        <span
          class="explorer-item__toggle"
          x-bind:class="open ? 'explorer-item__toggle--open' : ''"
        >
          &#9654;
        </span>
        <span class="explorer-item__title">
          Phase {phaseId}: {phase.name}
        </span>
        <span class={statusBadgeClass(phase.status)}>{phase.status}</span>
        <span class="explorer-item__meta">
          {phase.planCount != null ? `${phase.planCount} plan${phase.planCount !== 1 ? 's' : ''}` : ''}
        </span>
      </div>

      {/* Body is only shown when open. The inner div fires hx-get on load (once the body is visible). */}
      <div class="explorer-item__body" x-show="open" x-cloak>
        <div
          hx-get={`/api/explorer/phases/${phaseId}`}
          hx-trigger="load"
          hx-swap="innerHTML"
        >
          <span class="explorer__loading">Loading plans...</span>
        </div>
      </div>
    </div>
  );
}

// ---- Phase detail fragment (plan list) — rendered by API route ----

export function PhaseDetailFragment({ phase, phaseId }: { phase: PhaseDetail; phaseId: string }) {
  if (!phase.plans || phase.plans.length === 0) {
    return <p class="explorer-item__meta">No plans found for this phase.</p>;
  }

  const verResult = phase.verification
    ? (phase.verification as any).result || 'unknown'
    : null;

  return (
    <div>
      {verResult && (
        <div style="margin-bottom: var(--space-sm); display: flex; align-items: center; gap: var(--space-xs);">
          <span style="font-size: 0.8rem; color: var(--color-text-dim);">Verification:</span>
          <span class={statusBadgeClass(verResult)}>{verResult}</span>
        </div>
      )}

      <div class="explorer-item__plans">
        {phase.plans.map((plan) => (
          <PlanItem key={plan.planId} plan={plan} phaseId={phaseId} />
        ))}
      </div>
    </div>
  );
}

// ---- Single plan row with doc viewer ----

function PlanItem({ plan, phaseId }: { plan: Plan; phaseId: string }) {
  const docTypes = ['plan', 'summary', 'verification'] as const;

  return (
    <div x-data="{ open: false, doc: 'plan' }" class="explorer-plan-item">
      <div class="explorer-plan-link" x-on:click="open = !open">
        <span
          class="explorer-item__toggle"
          x-bind:class="open ? 'explorer-item__toggle--open' : ''"
        >
          &#9654;
        </span>
        <span style="font-weight: 500; font-size: 0.875rem;">{plan.planId}</span>
        <span style="flex: 1; font-size: 0.9rem; color: var(--color-text);">
          {plan.planTitle || plan.planId}
        </span>
        {plan.taskCount != null && (
          <span class="explorer-item__meta">
            {plan.taskCount} task{plan.taskCount !== 1 ? 's' : ''}
          </span>
        )}
        {plan.summary && (plan.summary as any).status && (
          <span class={statusBadgeClass(String((plan.summary as any).status))}>
            {(plan.summary as any).status}
          </span>
        )}
      </div>

      <div class="explorer-doc-viewer" x-show="open" x-cloak>
        <div class="explorer-doc-viewer__tabs">
          {docTypes.map((dt) => (
            <button
              key={dt}
              class="explorer__tab-btn explorer-doc-viewer__tab"
              x-on:click={`doc = '${dt}'`}
              x-bind:aria-selected={`doc === '${dt}'`}
            >
              {dt}
            </button>
          ))}
        </div>

        {docTypes.map((dt) => (
          <div
            key={dt}
            x-show={`doc === '${dt}'`}
            x-cloak
            hx-get={`/api/explorer/phases/${phaseId}/${plan.planId}/${dt}`}
            hx-trigger="intersect once"
            hx-swap="innerHTML"
            class="explorer-doc-content"
          >
            <span class="explorer__loading">Loading {dt}...</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Document fragment — rendered by API route ----

export function PhaseDocFragment({ doc }: { doc: PhaseDoc }) {
  if (!doc.html) {
    return (
      <p style="color: var(--color-text-dim); padding: var(--space-sm);">
        Document is empty or not yet available.
      </p>
    );
  }

  return (
    <div
      class="explorer-doc-content"
      // eslint-disable-next-line react/no-danger -- intentional server-rendered HTML
      dangerouslySetInnerHTML={{ __html: doc.html }}
    />
  );
}
