interface Milestone {
  version: string;
  name?: string;
  goal?: string;
  startPhase?: string | number;
  endPhase?: string | number;
  completed?: boolean;
  date?: string;
  duration?: string;
}

interface MilestoneDetail {
  version: string;
  sections: Array<{ type: string; html: string }>;
}

interface MilestonesTabProps {
  active: Milestone[];
  archived: Milestone[];
}

interface MilestoneItemProps {
  milestone: Milestone;
}

export function MilestonesTab({ active, archived }: MilestonesTabProps) {
  return (
    <div>
      {/* Active milestones section */}
      <h3 class="explorer-section-title">Active</h3>
      {active.length === 0 && <p class="explorer__loading">No active milestones.</p>}
      <div class="explorer-list">
        {active.map((ms) => (
          <div class="explorer-item" key={ms.name || ms.version}>
            <div class="explorer-item__header">
              <span class="explorer-item__title">
                {ms.name || `v${ms.version}`}
              </span>
              {ms.startPhase != null && ms.endPhase != null && (
                <span class="explorer-item__meta">
                  Phase {ms.startPhase}–{ms.endPhase}
                </span>
              )}
              {ms.goal && (
                <span class="explorer-item__meta" style="flex:1; text-align:right; white-space:normal;">
                  {ms.goal}
                </span>
              )}
              <span class="explorer-badge explorer-badge--building">active</span>
            </div>
          </div>
        ))}
      </div>

      {/* Archived milestones section */}
      <h3 class="explorer-section-title" style="margin-top: var(--space-lg)">
        Archived
      </h3>
      {archived.length === 0 && <p class="explorer__loading">No archived milestones.</p>}
      <div class="explorer-list">
        {archived.map((ms) => (
          <MilestoneItem key={ms.version} milestone={ms} />
        ))}
      </div>
    </div>
  );
}

export function MilestoneItem({ milestone }: MilestoneItemProps) {
  return (
    <div class="explorer-item" x-data="{ open: false }">
      <div class="explorer-item__header" x-on:click="open = !open">
        <span
          class="explorer-item__toggle"
          x-bind:class="open ? 'explorer-item__toggle--open' : ''"
        >
          ▶
        </span>
        <span class="explorer-item__title">v{milestone.version}</span>
        <span class="explorer-badge explorer-badge--complete">archived</span>
      </div>
      <div class="explorer-item__body" x-show="open" x-cloak>
        <div
          hx-get={`/api/explorer/milestones/${milestone.version}`}
          hx-trigger="load"
          hx-swap="innerHTML"
        >
          <span class="explorer__loading">Loading...</span>
        </div>
      </div>
    </div>
  );
}

export function milestoneDetailHtml(detail: MilestoneDetail | null): string {
  if (!detail) return '<p class="explorer__loading">Not found.</p>';
  return detail.sections
    .map((s) => `<div class="explorer-doc-content">${s.html}</div>`)
    .join('');
}
