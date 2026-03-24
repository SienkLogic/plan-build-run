const { MIGRATIONS: _MIGRATIONS, getMigrationPath } = require('../plugins/pbr/scripts/lib/migrate');

describe('config migration', () => {
  function migrateConfig(config) {
    // v1 → v2 migration
    if (!config.version || config.version < 2) {
      const migrated = { ...config, version: 2 };

      // Migrate model_profile to per-agent models
      if (config.model_profile && !config.models) {
        const profiles = {
          quality: {
            researcher: 'sonnet',
            planner: 'inherit',
            executor: 'inherit',
            verifier: 'sonnet',
            integration_checker: 'sonnet',
            debugger: 'inherit',
            mapper: 'sonnet',
            synthesizer: 'haiku',
          },
          balanced: {
            researcher: 'sonnet',
            planner: 'inherit',
            executor: 'sonnet',
            verifier: 'sonnet',
            integration_checker: 'sonnet',
            debugger: 'inherit',
            mapper: 'sonnet',
            synthesizer: 'haiku',
          },
          budget: {
            researcher: 'haiku',
            planner: 'sonnet',
            executor: 'sonnet',
            verifier: 'haiku',
            integration_checker: 'haiku',
            debugger: 'sonnet',
            mapper: 'haiku',
            synthesizer: 'haiku',
          },
        };
        migrated.models = profiles[config.model_profile] || profiles.balanced;
        delete migrated.model_profile;
      }

      // Add missing feature flags with defaults
      migrated.features = {
        structured_planning: true,
        goal_verification: true,
        integration_verification: true,
        context_isolation: true,
        atomic_commits: true,
        session_persistence: true,
        research_phase: true,
        plan_checking: true,
        tdd_mode: false,
        status_line: true,
        ...(config.features || {}),
      };

      // Migrate workflow booleans to features
      if (config.workflow) {
        if (config.workflow.research !== undefined) {
          migrated.features.research_phase = config.workflow.research;
        }
        if (config.workflow.plan_check !== undefined) {
          migrated.features.plan_checking = config.workflow.plan_check;
        }
        if (config.workflow.verifier !== undefined) {
          migrated.features.goal_verification = config.workflow.verifier;
        }
        delete migrated.workflow;
      }

      // Add context_strategy default
      if (!migrated.context_strategy) {
        migrated.context_strategy = 'aggressive';
      }

      // Ensure models exists
      if (!migrated.models) {
        migrated.models = {
          researcher: 'sonnet',
          planner: 'inherit',
          executor: 'inherit',
          verifier: 'sonnet',
          integration_checker: 'sonnet',
          debugger: 'inherit',
          mapper: 'sonnet',
          synthesizer: 'haiku',
        };
      }

      // Ensure parallelization has all fields
      migrated.parallelization = {
        enabled: true,
        plan_level: true,
        task_level: false,
        max_concurrent_agents: 3,
        min_plans_for_parallel: 2,
        use_teams: false,
        ...(config.parallelization || {}),
      };

      // Ensure git has all fields
      migrated.git = {
        branching: 'none',
        commit_format: '{type}({scope}): {description}',
        phase_branch_template: 'plan-build-run/phase-{phase}-{slug}',
        milestone_branch_template: 'plan-build-run/{milestone}-{slug}',
        ...(config.git || {}),
      };

      // Ensure gates has all fields
      migrated.gates = {
        confirm_project: true,
        confirm_roadmap: true,
        confirm_plan: true,
        confirm_execute: false,
        confirm_transition: true,
        issues_review: true,
        ...(config.gates || {}),
      };

      return migrated;
    }

    return config;
  }

  test('v1 config with model_profile migrates to v2', async () => {
    const v1 = {
      mode: 'interactive',
      depth: 'standard',
      model_profile: 'balanced',
      workflow: {
        research: true,
        plan_check: true,
        verifier: true,
      },
      planning: {
        commit_docs: true,
      },
      parallelization: {
        enabled: true,
      },
      gates: {
        confirm_plan: true,
      },
    };

    const v2 = migrateConfig(v1);

    expect(v2.version).toBe(2);
    expect(v2.model_profile).toBeUndefined();
    expect(v2.models).toBeDefined();
    expect(v2.models.executor).toBe('sonnet'); // balanced profile
    expect(v2.features.research_phase).toBe(true);
    expect(v2.features.plan_checking).toBe(true);
    expect(v2.workflow).toBeUndefined();
    expect(v2.context_strategy).toBe('aggressive');
  });

  test('v1 budget profile migrates correctly', async () => {
    const v1 = { model_profile: 'budget' };
    const v2 = migrateConfig(v1);

    expect(v2.models.researcher).toBe('haiku');
    expect(v2.models.executor).toBe('sonnet');
    expect(v2.models.synthesizer).toBe('haiku');
  });

  test('v1 quality profile migrates correctly', async () => {
    const v1 = { model_profile: 'quality' };
    const v2 = migrateConfig(v1);

    expect(v2.models.researcher).toBe('sonnet');
    expect(v2.models.executor).toBe('inherit');
    expect(v2.models.planner).toBe('inherit');
  });

  test('v2 config passes through unchanged', async () => {
    const v2 = {
      version: 2,
      context_strategy: 'balanced',
      mode: 'interactive',
      depth: 'standard',
      features: { structured_planning: true },
      models: { researcher: 'sonnet' },
    };

    const result = migrateConfig(v2);
    expect(result).toEqual(v2);
  });

  test('missing fields get defaults', async () => {
    const v1 = {};
    const v2 = migrateConfig(v1);

    expect(v2.version).toBe(2);
    expect(v2.context_strategy).toBe('aggressive');
    expect(v2.features.structured_planning).toBe(true);
    expect(v2.features.tdd_mode).toBe(false);
    expect(v2.parallelization.enabled).toBe(true);
    expect(v2.parallelization.use_teams).toBe(false);
    expect(v2.git.branching).toBe('none');
    expect(v2.gates.confirm_plan).toBe(true);
    expect(v2.gates.confirm_execute).toBe(false);
  });

  test('v1 workflow.research=false migrates to features', async () => {
    const v1 = {
      workflow: { research: false, plan_check: false, verifier: true },
    };
    const v2 = migrateConfig(v1);

    expect(v2.features.research_phase).toBe(false);
    expect(v2.features.plan_checking).toBe(false);
    expect(v2.features.goal_verification).toBe(true);
  });

  test('existing v1 parallelization fields preserved', async () => {
    const v1 = {
      parallelization: {
        enabled: false,
        max_concurrent_agents: 5,
      },
    };
    const v2 = migrateConfig(v1);

    expect(v2.parallelization.enabled).toBe(false);
    expect(v2.parallelization.max_concurrent_agents).toBe(5);
    expect(v2.parallelization.use_teams).toBe(false); // Added default
  });
});

describe('v2 to v3 migration', () => {
  function applyV2ToV3(config) {
    const clone = JSON.parse(JSON.stringify(config));
    const path = getMigrationPath(2, 3);
    for (const m of path) m.migrate(clone);
    return clone;
  }

  test('adds all new workflow properties with defaults', async () => {
    const v2 = { schema_version: 2, workflow: { enforce_pbr_skills: 'advisory' } };
    const v3 = applyV2ToV3(v2);

    expect(v3.workflow.inline_execution).toBe(false);
    expect(v3.workflow.inline_max_tasks).toBe(2);
    expect(v3.workflow.inline_context_cap_pct).toBe(40);
    expect(v3.workflow.phase_boundary_clear).toBe('off');
    expect(v3.workflow.autonomous).toBe(false);
    expect(v3.workflow.speculative_planning).toBe(false);
    expect(v3.workflow.phase_replay).toBe(false);
    // Existing property preserved
    expect(v3.workflow.enforce_pbr_skills).toBe('advisory');
  });

  test('adds new top-level sections', async () => {
    const v2 = { schema_version: 2 };
    const v3 = applyV2ToV3(v2);

    expect(v3.intel).toEqual({ enabled: false, auto_update: false, inject_on_start: false });
    expect(v3.context_ledger).toEqual({ enabled: false, stale_after_minutes: 60 });
    expect(v3.learnings).toEqual({ enabled: false, read_depth: 3 });
    expect(v3.verification).toEqual({ confidence_gate: false, confidence_threshold: 1.0 });
    expect(v3.context_budget).toEqual({ threshold_curve: 'linear' });
  });

  test('adds planning.multi_phase and gates.checkpoint_auto_resolve', async () => {
    const v2 = {
      schema_version: 2,
      planning: { commit_docs: true, max_tasks_per_plan: 5 },
      gates: { confirm_plan: true, auto_checkpoints: false },
    };
    const v3 = applyV2ToV3(v2);

    expect(v3.planning.multi_phase).toBe(false);
    expect(v3.planning.commit_docs).toBe(true);
    expect(v3.planning.max_tasks_per_plan).toBe(5);
    expect(v3.gates.checkpoint_auto_resolve).toBe('none');
    expect(v3.gates.confirm_plan).toBe(true);
    expect(v3.gates.auto_checkpoints).toBe(false);
  });

  test('is idempotent', async () => {
    const v2 = { schema_version: 2, workflow: { enforce_pbr_skills: 'block' } };
    const first = applyV2ToV3(v2);
    const second = applyV2ToV3(first);

    expect(second).toEqual(first);
  });

  test('does not overwrite existing values', async () => {
    const v2 = {
      schema_version: 2,
      workflow: { inline_execution: true },
      intel: { enabled: true, auto_update: true, inject_on_start: true },
    };
    const v3 = applyV2ToV3(v2);

    expect(v3.workflow.inline_execution).toBe(true);
    expect(v3.intel.enabled).toBe(true);
    expect(v3.intel.auto_update).toBe(true);
    // New defaults still added for other workflow properties
    expect(v3.workflow.inline_max_tasks).toBe(2);
  });

  test('full path v0 to v3', async () => {
    const v0 = { mode: 'yolo', depth: 'lean' };
    const path = getMigrationPath(0, 3);
    expect(path.length).toBe(3);

    const result = JSON.parse(JSON.stringify(v0));
    for (const m of path) m.migrate(result);

    expect(result.schema_version).toBe(3);
    expect(result.mode).toBe('autonomous');
    expect(result.depth).toBe('quick');
    expect(result.intel).toBeDefined();
    expect(result.learnings).toBeDefined();
    expect(result.context_ledger).toBeDefined();
    expect(result.verification).toBeDefined();
    expect(result.context_budget).toBeDefined();
    expect(result.workflow.inline_execution).toBe(false);
    expect(result.planning.multi_phase).toBe(false);
    expect(result.gates.checkpoint_auto_resolve).toBe('none');
  });
});
