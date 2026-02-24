export function DependencyGraphFragment({ mermaidDef }: { mermaidDef: string }) {
  return (
    <div class="dep-graph">
      <div
        class="dep-graph__container"
        id="dep-graph-render"
        x-data="{ rendered: false }"
        x-init={`$nextTick(() => { mermaid.render('dep-graph-svg', $el.dataset.def).then(r => { $el.innerHTML = r.svg; rendered = true; }) })`}
        data-def={mermaidDef}
      >
        <div class="dep-graph__loading" x-show="!rendered">Rendering graph...</div>
      </div>
    </div>
  );
}

export function DependencyGraph() {
  return (
    <div id="dep-graph-panel" hx-get="/api/timeline/dependency-graph" hx-trigger="intersect once" hx-swap="innerHTML">
      <div class="dep-graph__loading">Loading dependency graph...</div>
    </div>
  );
}
