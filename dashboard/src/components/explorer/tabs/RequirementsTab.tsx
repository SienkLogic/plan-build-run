export function RequirementsTab({ data }: { data: any }) {
  const { sections = [], totalCount = 0, coveredCount = 0 } = data || {};
  const pct = totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 0;

  return (
    <div>
      <div class="explorer-toolbar">
        <span class="explorer-item__meta">{coveredCount}/{totalCount} covered</span>
        <span class={`explorer-badge explorer-badge--${pct >= 80 ? 'complete' : pct >= 50 ? 'building' : 'pending'}`}>
          {pct}%
        </span>
      </div>
      {sections.map((section: any) => (
        <div key={section.sectionTitle} class="explorer-req-section">
          <h3 class="explorer-section-title">{section.sectionTitle}</h3>
          <table class="explorer-req-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Requirement</th>
                <th>Status</th>
                <th>Plans</th>
              </tr>
            </thead>
            <tbody>
              {section.requirements.map((req: any) => (
                <tr key={req.id}>
                  <td class="explorer-req-id">{req.id}</td>
                  <td>{req.text}</td>
                  <td>
                    <span class={`explorer-badge explorer-badge--${req.covered ? 'covered' : 'uncovered'}`}>
                      {req.covered ? 'covered' : 'uncovered'}
                    </span>
                  </td>
                  <td class="explorer-item__meta">{(req.planRefs || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {sections.length === 0 && <p class="explorer__loading">No requirements data.</p>}
    </div>
  );
}
