import { AnalyticsPanel } from './AnalyticsPanel';
import { DependencyGraph } from './DependencyGraph';

export function TimelinePage() {
  return (
    <div class="timeline" x-data="{ activeSection: 'events' }">
      <h1 class="page-title">Timeline</h1>
      <div class="timeline__section-tabs" role="tablist">
        <button
          role="tab"
          x-bind:aria-selected="activeSection === 'events'"
          x-on:click="activeSection = 'events'"
          class="timeline__section-tab"
        >
          Event Stream
        </button>
        <button
          role="tab"
          x-bind:aria-selected="activeSection === 'analytics'"
          x-on:click="activeSection = 'analytics'"
          class="timeline__section-tab"
        >
          Analytics
        </button>
        <button
          role="tab"
          x-bind:aria-selected="activeSection === 'graph'"
          x-on:click="activeSection = 'graph'"
          class="timeline__section-tab"
        >
          Dependency Graph
        </button>
      </div>

      <div x-show="activeSection === 'events'">
        <div class="timeline__filters">
          <label>
            <input type="checkbox" name="types" value="commit" />
            Commits
          </label>
          <label>
            <input type="checkbox" name="types" value="phase-transition" />
            Phase Transitions
          </label>
          <label>
            <input type="checkbox" name="types" value="todo-completion" />
            Todo Completions
          </label>

          <select name="phase">
            <option value="">All phases</option>
          </select>

          <input type="date" name="dateFrom" aria-label="From date" />
          <input type="date" name="dateTo" aria-label="To date" />

          <button
            type="button"
            hx-get="/api/timeline/events"
            hx-include="closest .timeline__filters"
            hx-target="#timeline-stream"
            hx-swap="innerHTML"
            hx-indicator="#timeline-loading"
          >
            Apply Filters
          </button>
        </div>

        <div id="timeline-loading" class="timeline__loading htmx-indicator">Refreshing...</div>

        <div
          id="timeline-stream"
          class="timeline__stream"
          hx-get="/api/timeline/events"
          hx-trigger="load"
          hx-swap="innerHTML"
        >
          <div class="timeline__loading">Loading events...</div>
        </div>
      </div>

      <div x-show="activeSection === 'analytics'">
        <AnalyticsPanel />
      </div>

      <div x-show="activeSection === 'graph'">
        <DependencyGraph />
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

export function EventStreamFragment({ events }: { events: any[] }) {
  if (events.length === 0) {
    return <p class="timeline__empty">No events match the current filters.</p>;
  }

  return (
    <ol class="timeline__list">
      {events.map((event) => (
        <li key={event.id} class={`timeline__event timeline__event--${event.type}`}>
          <span class="timeline__event-dot" aria-hidden="true"></span>
          <time class="timeline__event-time" datetime={event.date.toISOString()}>
            {formatDate(event.date)}
          </time>
          <span class="timeline__event-type">{event.type}</span>
          <span class="timeline__event-title">{event.title}</span>
          {event.author && (
            <span class="timeline__event-author">{event.author}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
