interface AnalyticsProps {
  analytics: any;
  llmMetrics: any | null;
}

export function AnalyticsPanelFragment({ analytics, llmMetrics }: AnalyticsProps) {
  const summary = analytics?.summary ?? {};
  const phases: any[] = analytics?.phases ?? [];

  return (
    <div class="analytics-panel">
      {/* Git & Phase stats */}
      <section class="analytics-panel__section">
        <h2>Git &amp; Phase Stats</h2>
        <div class="analytics-panel__stats">
          <div class="analytics-panel__stat">
            <span class="analytics-panel__stat-value">{summary.totalCommits ?? 0}</span>
            <span class="analytics-panel__stat-label">Total Commits</span>
          </div>
          <div class="analytics-panel__stat">
            <span class="analytics-panel__stat-value">{summary.totalLinesChanged ?? 0}</span>
            <span class="analytics-panel__stat-label">Lines Changed</span>
          </div>
          <div class="analytics-panel__stat">
            <span class="analytics-panel__stat-value">{summary.avgDuration ?? 'N/A'}</span>
            <span class="analytics-panel__stat-label">Avg Phase Duration</span>
          </div>
          <div class="analytics-panel__stat">
            <span class="analytics-panel__stat-value">{summary.totalPhases ?? 0}</span>
            <span class="analytics-panel__stat-label">Phases</span>
          </div>
        </div>
        {phases.length > 0 ? (
          <table class="analytics-panel__table">
            <thead>
              <tr>
                <th>Phase</th>
                <th>Name</th>
                <th>Commits</th>
                <th>Lines Changed</th>
                <th>Duration</th>
                <th>Plans</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((p: any) => (
                <tr key={p.phaseId}>
                  <td>{p.phaseId}</td>
                  <td>{p.phaseName}</td>
                  <td>{p.commitCount}</td>
                  <td>{p.linesChanged}</td>
                  <td>{p.duration ?? '—'}</td>
                  <td>{p.planCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p class="analytics-panel__empty">No phase data available.</p>
        )}
      </section>

      {/* LLM Offload stats */}
      <section class="analytics-panel__section">
        <h2>LLM Offload Metrics</h2>
        {llmMetrics === null ? (
          <p class="analytics-panel__empty">No LLM metrics data — run local model integrations to populate.</p>
        ) : (
          <div class="analytics-panel__stats">
            <div class="analytics-panel__stat">
              <span class="analytics-panel__stat-value">{llmMetrics.summary.total_calls}</span>
              <span class="analytics-panel__stat-label">Total Calls</span>
            </div>
            <div class="analytics-panel__stat">
              <span class="analytics-panel__stat-value">{llmMetrics.summary.fallback_rate_pct}%</span>
              <span class="analytics-panel__stat-label">Fallback Rate</span>
            </div>
            <div class="analytics-panel__stat">
              <span class="analytics-panel__stat-value">{llmMetrics.summary.tokens_saved}</span>
              <span class="analytics-panel__stat-label">Tokens Saved</span>
            </div>
            <div class="analytics-panel__stat">
              <span class="analytics-panel__stat-value">${llmMetrics.summary.cost_saved_usd}</span>
              <span class="analytics-panel__stat-label">Cost Saved</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function AnalyticsPanel() {
  return (
    <div id="analytics-panel" hx-get="/api/timeline/analytics" hx-trigger="intersect once" hx-swap="innerHTML">
      <div class="analytics-panel__loading">Loading analytics...</div>
    </div>
  );
}
