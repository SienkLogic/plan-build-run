interface ConfigEditorProps {
  config: Record<string, unknown>;
}

function BoolField({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label class="config-field config-field--check">
      <input type="checkbox" name={name} checked={checked || false} />
      {label}
    </label>
  );
}

function SelectField({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: string[];
}) {
  return (
    <label class="config-field">
      <span class="config-field__label">{label}</span>
      <select name={name}>
        {options.map((o) => (
          <option value={o} selected={o === value}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  name,
  label,
  value,
  type,
  readonly,
}: {
  name: string;
  label: string;
  value: string | number;
  type?: string;
  readonly?: boolean;
}) {
  return (
    <label class="config-field">
      <span class="config-field__label">{label}</span>
      <input
        type={type || 'text'}
        name={name}
        value={String(value ?? '')}
        readonly={readonly}
      />
    </label>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 class="config-section__title">{title}</h3>;
}

export function ConfigEditor({ config }: ConfigEditorProps) {
  const features = (config.features as Record<string, boolean>) || {};
  const gates = (config.gates as Record<string, boolean>) || {};
  const models = (config.models as Record<string, string>) || {};
  const para = (config.parallelization as Record<string, unknown>) || {};
  const planning = (config.planning as Record<string, unknown>) || {};
  const git = (config.git as Record<string, string>) || {};
  const safety = (config.safety as Record<string, boolean>) || {};
  const localLlm = (config.local_llm as Record<string, unknown>) || {};
  const llmFeatures = (localLlm.features as Record<string, boolean>) || {};
  const llmMetrics = (localLlm.metrics as Record<string, unknown>) || {};
  const llmAdvanced = (localLlm.advanced as Record<string, unknown>) || {};

  const rawJson = JSON.stringify(config, null, 2);

  return (
    <div class="config-editor" x-data="{ mode: 'form' }">
      {/* Mode toggle */}
      <div class="config-mode-toggle" role="group" aria-label="Editor mode">
        <button
          type="button"
          class="tab-btn"
          x-on:click="mode = 'form'"
          x-bind:class="{ active: mode === 'form' }"
        >
          Form
        </button>
        <button
          type="button"
          class="tab-btn"
          x-on:click="mode = 'raw'"
          x-bind:class="{ active: mode === 'raw' }"
        >
          Raw JSON
        </button>
      </div>

      {/* Form mode */}
      <div x-show="mode === 'form'">
        <form
          hx-post="/api/settings/config"
          hx-target="#config-feedback"
          hx-swap="innerHTML"
          hx-encoding="application/x-www-form-urlencoded"
        >
          {/* General section */}
          <div class="config-section">
            <SectionTitle title="General" />
            <SelectField
              name="mode"
              label="Mode"
              value={String(config.mode ?? 'normal')}
              options={['normal', 'autonomous', 'cautious']}
            />
            <SelectField
              name="depth"
              label="Depth"
              value={String(config.depth ?? 'standard')}
              options={['standard', 'comprehensive', 'light']}
            />
            <SelectField
              name="context_strategy"
              label="Context Strategy"
              value={String(config.context_strategy ?? 'aggressive')}
              options={['aggressive', 'balanced', 'conservative']}
            />
            <TextField
              name="version"
              label="Version"
              value={String(config.version ?? '')}
              readonly={true}
            />
          </div>

          {/* Features section */}
          <div class="config-section">
            <SectionTitle title="Features" />
            {Object.entries(features).map(([key, val]) => (
              <BoolField name={`features.${key}`} label={key.replace(/_/g, ' ')} checked={val} />
            ))}
          </div>

          {/* Gates section */}
          <div class="config-section">
            <SectionTitle title="Gates" />
            {Object.entries(gates).map(([key, val]) => (
              <BoolField name={`gates.${key}`} label={key.replace(/_/g, ' ')} checked={val} />
            ))}
          </div>

          {/* Models section */}
          <div class="config-section">
            <SectionTitle title="Models" />
            {Object.entries(models).map(([key, val]) => (
              <SelectField
                name={`models.${key}`}
                label={key}
                value={val}
                options={['haiku', 'sonnet', 'opus', 'inherit']}
              />
            ))}
          </div>

          {/* Parallelization section */}
          <div class="config-section">
            <SectionTitle title="Parallelization" />
            <BoolField name="parallelization.enabled" label="Enabled" checked={!!para.enabled} />
            <BoolField name="parallelization.plan_level" label="Plan Level" checked={!!para.plan_level} />
            <BoolField name="parallelization.task_level" label="Task Level" checked={!!para.task_level} />
            <BoolField name="parallelization.use_teams" label="Use Teams" checked={!!para.use_teams} />
            <TextField
              name="parallelization.max_concurrent_agents"
              label="Max Concurrent Agents"
              value={Number(para.max_concurrent_agents ?? 3)}
              type="number"
            />
            <TextField
              name="parallelization.min_plans_for_parallel"
              label="Min Plans for Parallel"
              value={Number(para.min_plans_for_parallel ?? 2)}
              type="number"
            />
          </div>

          {/* Planning section */}
          <div class="config-section">
            <SectionTitle title="Planning" />
            <BoolField
              name="planning.commit_docs"
              label="Commit Docs"
              checked={!!planning.commit_docs}
            />
            <TextField
              name="planning.max_tasks_per_plan"
              label="Max Tasks per Plan"
              value={Number(planning.max_tasks_per_plan ?? 8)}
              type="number"
            />
            <BoolField
              name="planning.search_gitignored"
              label="Search Gitignored"
              checked={!!planning.search_gitignored}
            />
          </div>

          {/* Git section */}
          <div class="config-section">
            <SectionTitle title="Git" />
            <SelectField
              name="git.mode"
              label="Mode"
              value={git.mode ?? 'enabled'}
              options={['enabled', 'disabled']}
            />
            <SelectField
              name="git.branching"
              label="Branching"
              value={git.branching ?? 'none'}
              options={['none', 'phase', 'milestone']}
            />
            <TextField
              name="git.commit_format"
              label="Commit Format"
              value={git.commit_format ?? ''}
            />
            <TextField
              name="git.phase_branch_template"
              label="Phase Branch Template"
              value={git.phase_branch_template ?? ''}
            />
            <TextField
              name="git.milestone_branch_template"
              label="Milestone Branch Template"
              value={git.milestone_branch_template ?? ''}
            />
          </div>

          {/* Safety section */}
          <div class="config-section">
            <SectionTitle title="Safety" />
            <BoolField
              name="safety.always_confirm_destructive"
              label="Always Confirm Destructive"
              checked={!!safety.always_confirm_destructive}
            />
            <BoolField
              name="safety.always_confirm_external_services"
              label="Always Confirm External Services"
              checked={!!safety.always_confirm_external_services}
            />
          </div>

          {/* Local LLM section */}
          <div class="config-section">
            <SectionTitle title="Local LLM" />
            <BoolField name="local_llm.enabled" label="Enabled" checked={!!localLlm.enabled} />
            <TextField name="local_llm.provider" label="Provider" value={String(localLlm.provider ?? '')} />
            <TextField name="local_llm.endpoint" label="Endpoint" value={String(localLlm.endpoint ?? '')} />
            <TextField name="local_llm.model" label="Model" value={String(localLlm.model ?? '')} />
            <TextField
              name="local_llm.timeout_ms"
              label="Timeout (ms)"
              value={Number(localLlm.timeout_ms ?? 30000)}
              type="number"
            />
            <TextField
              name="local_llm.max_retries"
              label="Max Retries"
              value={Number(localLlm.max_retries ?? 3)}
              type="number"
            />
            <SelectField
              name="local_llm.fallback"
              label="Fallback"
              value={String(localLlm.fallback ?? 'frontier')}
              options={['frontier', 'skip', 'error']}
            />
            <SelectField
              name="local_llm.routing_strategy"
              label="Routing Strategy"
              value={String(localLlm.routing_strategy ?? 'local_first')}
              options={['local_first', 'frontier_first', 'always_local', 'always_frontier']}
            />

            {/* LLM Features sub-section */}
            <div class="config-section config-section--nested">
              <SectionTitle title="LLM Features" />
              {Object.entries(llmFeatures).map(([key, val]) => (
                <BoolField
                  name={`local_llm.features.${key}`}
                  label={key.replace(/_/g, ' ')}
                  checked={val}
                />
              ))}
              {Object.keys(llmFeatures).length === 0 && (
                <p class="config-empty">No local LLM features configured.</p>
              )}
            </div>

            {/* LLM Metrics sub-section */}
            <div class="config-section config-section--nested">
              <SectionTitle title="LLM Metrics" />
              <BoolField
                name="local_llm.metrics.enabled"
                label="Enabled"
                checked={!!llmMetrics.enabled}
              />
              <BoolField
                name="local_llm.metrics.show_session_summary"
                label="Show Session Summary"
                checked={!!llmMetrics.show_session_summary}
              />
              <TextField
                name="local_llm.metrics.log_file"
                label="Log File"
                value={String(llmMetrics.log_file ?? '')}
              />
              <TextField
                name="local_llm.metrics.frontier_token_rate"
                label="Frontier Token Rate"
                value={Number(llmMetrics.frontier_token_rate ?? 0)}
                type="number"
              />
            </div>

            {/* LLM Advanced sub-section */}
            <div class="config-section config-section--nested">
              <SectionTitle title="LLM Advanced" />
              <TextField
                name="local_llm.advanced.confidence_threshold"
                label="Confidence Threshold"
                value={Number(llmAdvanced.confidence_threshold ?? 0)}
                type="number"
              />
              <TextField
                name="local_llm.advanced.max_input_tokens"
                label="Max Input Tokens"
                value={Number(llmAdvanced.max_input_tokens ?? 0)}
                type="number"
              />
              <TextField
                name="local_llm.advanced.num_ctx"
                label="Num Ctx"
                value={Number(llmAdvanced.num_ctx ?? 0)}
                type="number"
              />
              <TextField
                name="local_llm.advanced.disable_after_failures"
                label="Disable After Failures"
                value={Number(llmAdvanced.disable_after_failures ?? 0)}
                type="number"
              />
              <TextField
                name="local_llm.advanced.keep_alive"
                label="Keep Alive"
                value={String(llmAdvanced.keep_alive ?? '')}
              />
              <BoolField
                name="local_llm.advanced.shadow_mode"
                label="Shadow Mode"
                checked={!!llmAdvanced.shadow_mode}
              />
            </div>
          </div>

          <div class="config-actions">
            <button type="submit" class="btn btn--primary">Save Config</button>
          </div>
        </form>
        <div id="config-feedback" class="config-feedback" aria-live="polite"></div>
      </div>

      {/* Raw JSON mode */}
      <div x-show="mode === 'raw'" x-cloak>
        <form
          hx-post="/api/settings/config"
          hx-target="#config-feedback-raw"
          hx-swap="innerHTML"
        >
          <textarea name="rawJson" rows={30} class="config-raw-json">
            {rawJson}
          </textarea>
          <div class="config-actions">
            <button type="submit" class="btn btn--primary">Save JSON</button>
          </div>
        </form>
        <div id="config-feedback-raw" class="config-feedback" aria-live="polite"></div>
      </div>
    </div>
  );
}
