import { ConfigEditor } from './ConfigEditor';

interface SettingsPageProps {
  config: Record<string, unknown>;
  activeTab?: 'config' | 'logs';
}

export function SettingsPage({ config, activeTab }: SettingsPageProps) {
  const initialTab = activeTab || 'config';
  return (
    <div class="settings" x-data={`{ tab: '${initialTab}' }`}>
      <h1 class="page-title">Settings</h1>

      <div class="settings-tabs" role="tablist">
        <button
          role="tab"
          class="tab-btn"
          x-on:click="tab = 'config'"
          x-bind:class="{ active: tab === 'config' }"
          x-bind:aria-selected="tab === 'config'"
        >
          Config
        </button>
        <button
          role="tab"
          class="tab-btn"
          x-on:click="tab = 'logs'"
          x-bind:class="{ active: tab === 'logs' }"
          x-bind:aria-selected="tab === 'logs'"
        >
          Logs
        </button>
      </div>

      <div x-show="tab === 'config'">
        <ConfigEditor config={config} />
      </div>

      <div x-show="tab === 'logs'" x-cloak>
        <p>Log Viewer — <a href="/settings/logs">Open Log Viewer</a></p>
      </div>
    </div>
  );
}
