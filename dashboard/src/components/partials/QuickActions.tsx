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
    </div>
  );
};
