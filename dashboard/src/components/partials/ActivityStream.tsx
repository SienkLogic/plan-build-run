import type { FC } from 'hono/jsx';
import { html } from 'hono/html';

interface ActivityItem {
  path: string;
  timestamp: string;
  type: string;
}

interface ActivityStreamProps {
  activity: ActivityItem[];
}

export const ActivityStream: FC<ActivityStreamProps> = ({ activity }) => {
  return (
    <div class="card activity-stream" id="activity-stream">
      <div class="card__header">Recent Activity</div>
      {activity.length === 0 ? (
        <p class="activity-stream__empty">No recent .planning/ commits found.</p>
      ) : (
        <>
          <ul class="activity-stream__list">
            {activity.map((item, i) => (
              <li class="activity-item" key={i}>
                <span class="activity-item__icon" aria-hidden="true">◈</span>
                <span class="activity-item__path">{item.path}</span>
                <time
                  class="activity-item__time"
                  datetime={item.timestamp}
                  data-timestamp={item.timestamp}
                >
                  …
                </time>
              </li>
            ))}
          </ul>
          {html`<script>
            (function() {
              function relativeTime(ts) {
                var diff = Date.now() - new Date(ts).getTime();
                var minutes = Math.floor(diff / 60000);
                if (minutes < 60) return minutes + 'm ago';
                var hours = Math.floor(minutes / 60);
                if (hours < 24) return hours + 'h ago';
                var days = Math.floor(hours / 24);
                return days + 'd ago';
              }
              var els = document.querySelectorAll('.activity-item__time[data-timestamp]');
              for (var i = 0; i < els.length; i++) {
                els[i].textContent = relativeTime(els[i].dataset.timestamp);
              }
            })();
          </script>`}
        </>
      )}
    </div>
  );
};
