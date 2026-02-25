import type { FC } from 'hono/jsx';

interface QuickAction {
  label: string;
  href: string;
  primary: boolean;
}

interface QuickActionsProps {
  actions: QuickAction[];
}

export const QuickActions: FC<QuickActionsProps> = ({ actions }) => {
  return (
    <div class="quick-actions" id="quick-actions">
      <p class="quick-actions__label">Quick Actions</p>
      {actions.length === 0 ? (
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </span>
          <p class="empty-state__heading">No quick actions</p>
          <p class="empty-state__body">Start a new phase to see actions here.</p>
        </div>
      ) : (
        <div class="quick-actions__buttons">
          {actions.map((action, i) => (
            <a
              key={i}
              href={action.href}
              class={`btn${action.primary ? ' btn--primary' : ' btn--secondary'}`}
            >
              {action.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
