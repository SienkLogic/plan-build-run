# Plan-Build-Run Architecture — Agent Orchestration

How each command works internally. [DOCS.md](DOCS.md) is the text reference, [WORKFLOW.md](WORKFLOW.md) shows how commands relate to each other — this document shows the **internal orchestration** of each command: which agents get spawned, in what order, what they read and write, and how the orchestrator sequences the work.

---

## Legend

```mermaid
flowchart LR
    subgraph Legend
        direction LR
        I[Inline step] --> A{{Agent spawn}}
        A --> D{Decision}
        D --> F[(File I/O)]
        U([User interaction])
    end

    style I fill:#4a90d9,color:#fff
    style A fill:#e67e22,color:#fff
    style D fill:#9b59b6,color:#fff
    style F fill:#27ae60,color:#fff
    style U fill:#e74c3c,color:#fff
```

| Symbol | Meaning |
|--------|---------|
| Rectangle `[step]` | Inline — orchestrator does it directly |
| Hexagon `{{agent}}` | Agent spawn via `Task()` |
| Diamond `{decision}` | Conditional branch |
| Cylinder `[(file)]` | File read or write |
| Stadium `([user])` | User interaction point |
| Dashed border | Optional / conditional step |
| `-->` solid arrow | Sequential execution |
| Multiple arrows from one node | Parallel execution (when noted) |

---

## `/pbr:begin` — Project Initialization

The most complex command. A 10-step pipeline with a parallel fan-out/fan-in research phase.

```mermaid
flowchart TD
    Start([User runs /pbr:begin]) --> Brownfield{Existing code<br/>detected?}

    Brownfield -->|Yes| SuggestScan[Suggest /pbr:scan first]
    SuggestScan --> UserChoice{User proceeds<br/>with begin?}
    UserChoice -->|No| Abort([End])
    UserChoice -->|Yes| Questions
    Brownfield -->|No| Questions

    Questions([Deep questioning conversation<br/>— adaptive to depth setting]) --> Prefs([Workflow preferences<br/>— branching, commit style, etc.])

    Prefs --> WriteConfig[(Write .planning/config.json)]

    WriteConfig --> DepthCheck{Research<br/>depth?}

    DepthCheck -->|quick| SkipResearch[Skip research]
    DepthCheck -->|standard| Researchers
    DepthCheck -->|comprehensive| Researchers

    subgraph "Parallel Research Fan-Out"
        Researchers[Determine research areas] -->|parallel| R1{{researcher<br/>focus=STACK}}
        Researchers -->|parallel| R2{{researcher<br/>focus=FEATURES}}
        Researchers -->|parallel| R3{{researcher<br/>focus=ARCHITECTURE}}
        Researchers -->|parallel| R4{{researcher<br/>focus=PITFALLS}}
    end

    R1 --> ResearchFiles[(Write .planning/research/*.md)]
    R2 --> ResearchFiles
    R3 --> ResearchFiles
    R4 --> ResearchFiles

    ResearchFiles --> Synth{{synthesizer<br/>model=haiku}}
    SkipResearch --> Scope

    Synth --> SynthFile[(Write .planning/research/SUMMARY.md)]
    SynthFile --> Scope

    Scope([Requirements scoping conversation]) --> WriteReqs[(Write REQUIREMENTS.md)]

    WriteReqs --> Roadmap{{planner<br/>mode=roadmap}}

    Roadmap --> RoadmapFiles[("Write ROADMAP.md<br/>Write PROJECT.md<br/>Create phase directories")]

    RoadmapFiles --> InitState[("Write STATE.md<br/>Write CONTEXT.md")]

    InitState --> GitSetup[Initialize git tracking]
    GitSetup --> Done([Done])

    style R1 fill:#e67e22,color:#fff
    style R2 fill:#e67e22,color:#fff
    style R3 fill:#e67e22,color:#fff
    style R4 fill:#e67e22,color:#fff
    style Synth fill:#e67e22,color:#fff
    style Roadmap fill:#e67e22,color:#fff
    style Questions fill:#e74c3c,color:#fff
    style Prefs fill:#e74c3c,color:#fff
    style Scope fill:#e74c3c,color:#fff
```

**Agent count**: 2–6 (0–4 researchers + 1 synthesizer + 1 planner)

---

## `/pbr:plan` — Phase Planning

A 3-agent pipeline with an optional revision loop.

```mermaid
flowchart TD
    Start([User runs /pbr:plan N]) --> Validate[Parse and validate phase number]

    Validate --> LoadCtx[("Read ROADMAP.md, REQUIREMENTS.md,<br/>CONTEXT.md, config.json,<br/>prior SUMMARY.md files")]

    LoadCtx --> Assumptions{--assumptions<br/>flag?}
    Assumptions -->|Yes| SurfaceAssumptions([Surface and record assumptions<br/>→ append to CONTEXT.md])
    Assumptions -->|No| SeedCheck

    SurfaceAssumptions --> SeedCheck

    SeedCheck[Scan for matching seeds<br/>in .planning/seeds/] --> ResearchCheck{--skip-research<br/>flag?}

    ResearchCheck -->|Yes| SkipR[Skip research]
    ResearchCheck -->|No| Research{{researcher<br/>phase-scoped}}

    Research --> ResearchOut[(Write phases/NN-slug/RESEARCH.md)]
    ResearchOut --> Planner

    SkipR --> Planner{{planner<br/>mode=phase-plan}}

    Planner --> PlanFiles[(Write PLAN-*.md files)]

    PlanFiles --> CheckerEnabled{plan_checking<br/>enabled?}

    CheckerEnabled -->|No| Approval
    CheckerEnabled -->|Yes| Checker{{plan-checker}}

    Checker --> CheckResult{Issues<br/>found?}

    CheckResult -->|No| Approval
    CheckResult -->|Yes| RevisionCount{Revision<br/>count < 3?}

    RevisionCount -->|Yes| Revise{{planner<br/>mode=revision}}
    RevisionCount -->|No| Approval

    Revise --> RevisedPlan[(Update PLAN-*.md)] --> Checker

    Approval([User approves plan]) --> UpdateState[(Update STATE.md)]
    UpdateState --> Done([Done])

    style Research fill:#e67e22,color:#fff
    style Planner fill:#e67e22,color:#fff
    style Checker fill:#e67e22,color:#fff
    style Revise fill:#e67e22,color:#fff
    style Approval fill:#e74c3c,color:#fff
    style SurfaceAssumptions fill:#e74c3c,color:#fff
```

**Agent count**: 1–3 (0–1 researcher + 1 planner + 0–1 checker), plus up to 3 revision iterations

---

## `/pbr:build` — Phase Execution

Wave-based parallel execution with checkpoint recovery.

```mermaid
flowchart TD
    Start([User runs /pbr:build N]) --> LoadConfig[("Read config.json,<br/>STATE.md, CONTEXT.md")]

    LoadConfig --> DiscoverPlans[("Read PLAN-*.md files<br/>Extract wave assignments")]

    DiscoverPlans --> PriorWork{Prior checkpoint<br/>exists?}
    PriorWork -->|Yes| Recovery{Resume or<br/>restart?}
    Recovery -->|Resume| SkipCompleted[Skip completed tasks]
    Recovery -->|Restart| ClearCheckpoint[Clear checkpoint]
    PriorWork -->|No| WriteManifest

    SkipCompleted --> WriteManifest
    ClearCheckpoint --> WriteManifest

    WriteManifest[(Write .checkpoint-manifest.json)]

    WriteManifest --> WaveLoop

    subgraph WaveLoop ["Wave Loop (sequential through waves)"]
        direction TB
        NextWave[Start wave N] --> SpawnExec

        subgraph "Parallel Executors"
            SpawnExec[Spawn executors for wave] -->|parallel| E1{{executor<br/>plan=PLAN-01}}
            SpawnExec -->|parallel| E2{{executor<br/>plan=PLAN-02}}
            SpawnExec -->|parallel| EN{{executor<br/>plan=PLAN-NN}}
        end

        E1 --> WaitAll[Wait for wave completion]
        E2 --> WaitAll
        EN --> WaitAll

        WaitAll --> ReadResults[("Read SUMMARY-*.md<br/>Spot-check results")]

        ReadResults --> WaveFailed{Any executor<br/>failed?}
        WaveFailed -->|Yes| HandleFail{Retry count<br/>< 2?}
        HandleFail -->|Yes| RetryExec{{executor<br/>retry failed plan}}
        HandleFail -->|No| UserDecision([User: skip or abort?])
        RetryExec --> WaveFailed
        WaveFailed -->|No| MoreWaves{More waves?}
        MoreWaves -->|Yes| NextWave
    end

    UserDecision -->|Skip| MoreWaves
    UserDecision -->|Abort| Aborted([Abort build])

    MoreWaves -->|No| VerifyCheck{goal_verification<br/>enabled?}

    VerifyCheck -->|Yes| Verifier{{verifier}}
    VerifyCheck -->|No| Finalize

    Verifier --> VerifyOut[(Write VERIFICATION.md)]
    VerifyOut --> Finalize

    Finalize[("Update STATE.md<br/>Commit planning docs")] --> Done([Done])

    style E1 fill:#e67e22,color:#fff
    style E2 fill:#e67e22,color:#fff
    style EN fill:#e67e22,color:#fff
    style RetryExec fill:#e67e22,color:#fff
    style Verifier fill:#e67e22,color:#fff
    style UserDecision fill:#e74c3c,color:#fff
```

**Agent count**: 1–N executors per wave + 0–1 verifier. Typical: 2–4 executors per wave across 1–3 waves.

---

## `/pbr:review` — Phase Verification

Conditional branching between automated verification and user-driven UAT, with an optional auto-fix pipeline.

```mermaid
flowchart TD
    Start([User runs /pbr:review N]) --> CheckExisting{VERIFICATION.md<br/>exists and passed?}

    CheckExisting -->|Yes, passed| ShowResults[Display existing results]
    CheckExisting -->|No or failed| SpawnVerifier{{verifier}}

    SpawnVerifier --> VerifyOut[(Write VERIFICATION.md)]
    VerifyOut --> ShowResults

    ShowResults --> UAT([Conversational UAT<br/>— walk through must-haves<br/>with user])

    UAT --> UATResult{All items<br/>pass?}

    UATResult -->|Yes| MarkComplete[("Update STATE.md<br/>→ phase verified")]
    UATResult -->|No| AutoFixCheck{--auto-fix<br/>flag?}

    AutoFixCheck -->|No| ListGaps[List gaps and<br/>suggest actions]
    ListGaps --> Done([Done])

    AutoFixCheck -->|Yes| Debug{{debugger<br/>analyze gaps}}

    Debug --> GapPlan{{planner<br/>mode=gap-closure}}

    GapPlan --> GapPlanCheck{plan_checking<br/>enabled?}
    GapPlanCheck -->|Yes| GapChecker{{plan-checker}}
    GapPlanCheck -->|No| GapPlanOut

    GapChecker --> GapPlanOut[(Write gap-closure PLAN-*.md)]
    GapPlanOut --> UserApproval([User approves<br/>gap-closure plan])

    MarkComplete --> Done([Done])
    UserApproval --> Done

    style SpawnVerifier fill:#e67e22,color:#fff
    style Debug fill:#e67e22,color:#fff
    style GapPlan fill:#e67e22,color:#fff
    style GapChecker fill:#e67e22,color:#fff
    style UAT fill:#e74c3c,color:#fff
    style UserApproval fill:#e74c3c,color:#fff
```

**Agent count**: 0–4 (0–1 verifier + 0–1 debugger + 0–1 planner + 0–1 checker)

---

## `/pbr:scan` — Codebase Analysis

Pure fan-out: 4 parallel mapper agents, each writing different analysis files.

```mermaid
flowchart TD
    Start([User runs /pbr:scan]) --> ExistingCheck{Existing analysis<br/>found?}

    ExistingCheck -->|Yes| RefreshChoice([Refresh all,<br/>specific areas,<br/>or keep?])
    ExistingCheck -->|No| Recon

    RefreshChoice --> Recon

    Recon["Initial reconnaissance<br/>— project type, scale, structure"] --> ReconFile[(Write .planning/codebase/RECON.md)]

    ReconFile --> SpawnMappers[Spawn 4 mappers in parallel]

    subgraph "Parallel Codebase Mapping"
        SpawnMappers -->|parallel| M1{{codebase-mapper<br/>focus=tech}}
        SpawnMappers -->|parallel| M2{{codebase-mapper<br/>focus=arch}}
        SpawnMappers -->|parallel| M3{{codebase-mapper<br/>focus=quality}}
        SpawnMappers -->|parallel| M4{{codebase-mapper<br/>focus=concerns}}
    end

    M1 --> F1[("STACK.md<br/>INTEGRATIONS.md")]
    M2 --> F2[("ARCHITECTURE.md<br/>STRUCTURE.md")]
    M3 --> F3[("CONVENTIONS.md<br/>TESTING.md")]
    M4 --> F4[("CONCERNS.md")]

    F1 --> Verify[Verify all output files exist]
    F2 --> Verify
    F3 --> Verify
    F4 --> Verify

    Verify --> Summary[Present summary to user]
    Summary --> GitCommit{Commit<br/>analysis?}
    GitCommit -->|Yes| Commit[Git commit]
    GitCommit -->|No| Done([Done])
    Commit --> Done

    style M1 fill:#e67e22,color:#fff
    style M2 fill:#e67e22,color:#fff
    style M3 fill:#e67e22,color:#fff
    style M4 fill:#e67e22,color:#fff
    style RefreshChoice fill:#e74c3c,color:#fff
```

**Agent count**: 4 (all parallel)

---

## `/pbr:explore` — Idea Exploration

Mostly inline conversation with one conditional agent spawn.

```mermaid
flowchart TD
    Start([User runs /pbr:explore]) --> ProjectExists{.planning/<br/>exists?}

    ProjectExists -->|Yes| LoadCtx{{Context loader<br/>reads project state}}
    ProjectExists -->|No| FreeForm

    LoadCtx --> FreeForm([Socratic conversation<br/>— open-ended exploration])

    FreeForm --> ResearchNeeded{Complex question<br/>needs research?}

    ResearchNeeded -->|No| Continue([Continue conversation])
    ResearchNeeded -->|Yes| UserApproval{User approves<br/>research?}
    UserApproval -->|No| Continue
    UserApproval -->|Yes| Researcher{{researcher<br/>targeted investigation}}
    Researcher --> Continue

    Continue --> ContextPressure{~10 exchanges<br/>reached?}
    ContextPressure -->|No| FreeForm
    ContextPressure -->|Yes| OutputRouting

    OutputRouting{Where should<br/>insights go?}

    OutputRouting -->|"Todo"| Todo[(todos/pending/NNN-slug.md)]
    OutputRouting -->|"Requirement"| Req[(Append to REQUIREMENTS.md)]
    OutputRouting -->|"Phase context"| Ctx[(phases/NN-slug/CONTEXT.md)]
    OutputRouting -->|"Research question"| RQ[(research/questions.md)]
    OutputRouting -->|"Roadmap update"| RM[(Append to ROADMAP.md)]
    OutputRouting -->|"Note"| Note[(notes/slug.md)]
    OutputRouting -->|"Seed"| Seed[(seeds/SEED-NNN-slug.md)]

    style LoadCtx fill:#e67e22,color:#fff
    style Researcher fill:#e67e22,color:#fff
    style FreeForm fill:#e74c3c,color:#fff
    style UserApproval fill:#e74c3c,color:#fff
```

**Agent count**: 0–2 (0–1 context loader + 0–1 researcher)

---

## `/pbr:discuss` — Pre-Planning Discussion

Fully inline — no agents spawned.

```mermaid
flowchart TD
    Start([User runs /pbr:discuss N]) --> CheckPlans{Plans already<br/>exist for phase?}

    CheckPlans -->|Yes| Warn[Warn: plans exist,<br/>discussion may be late]
    CheckPlans -->|No| LoadContext

    Warn --> LoadContext[("Read ROADMAP.md,<br/>REQUIREMENTS.md,<br/>prior SUMMARY.md files")]

    LoadContext --> Explore[Open exploration — understand phase scope]

    Explore --> GrayAreas["Identify 3–4 gray areas<br/>— ambiguous decisions"]

    GrayAreas --> PresentAreas([Present gray areas<br/>with options to user])

    PresentAreas --> DeepDive

    subgraph DeepDive ["Deep-Dive Loop (per area)"]
        SelectArea([User selects area]) --> Q1([Follow-up question 1])
        Q1 --> Q2([Follow-up question 2])
        Q2 --> Q3([Follow-up question 3])
        Q3 --> Q4([Follow-up question 4])
        Q4 --> MoreAreas{More areas<br/>to explore?}
        MoreAreas -->|Yes| SelectArea
    end

    MoreAreas -->|No| Deferred([Capture deferred ideas])

    Deferred --> WriteCtx[(Write phases/NN-slug/CONTEXT.md)]
    WriteCtx --> Done([Done])

    style PresentAreas fill:#e74c3c,color:#fff
    style SelectArea fill:#e74c3c,color:#fff
    style Q1 fill:#e74c3c,color:#fff
    style Q2 fill:#e74c3c,color:#fff
    style Q3 fill:#e74c3c,color:#fff
    style Q4 fill:#e74c3c,color:#fff
    style Deferred fill:#e74c3c,color:#fff
```

**Agent count**: 0

---

## `/pbr:quick` — Quick Task Execution

Minimal orchestration: one agent, no loops.

```mermaid
flowchart TD
    Start([User runs /pbr:quick]) --> CheckProject{.planning/<br/>exists?}

    CheckProject -->|Yes| LoadConfig[(Read config.json)]
    CheckProject -->|No| Defaults[Use defaults]

    LoadConfig --> GetTask
    Defaults --> GetTask

    GetTask([Get task description from user]) --> ValidateScope{Scope small<br/>enough?}

    ValidateScope -->|No| SuggestPlan[Suggest /pbr:plan instead]
    SuggestPlan --> Done([End])

    ValidateScope -->|Yes| CreateDir[("Generate slug + task number<br/>Create quick/NNN-slug/<br/>Write minimal PLAN.md")]

    CreateDir --> Executor{{executor}}

    Executor --> ReadResult[(Read SUMMARY.md)]

    ReadResult --> UpdateState[("Update STATE.md<br/>Commit planning docs")]

    UpdateState --> Done([Done])

    style Executor fill:#e67e22,color:#fff
    style GetTask fill:#e74c3c,color:#fff
```

**Agent count**: 1

---

## `/pbr:continue` — Auto-Resume Next Step

A decision tree that delegates to other skills.

```mermaid
flowchart TD
    Start([User runs /pbr:continue]) --> ReadState[(Read STATE.md)]

    ReadState --> ScanPriority["Scan for priority items:<br/>— UAT blockers<br/>— checkpoints<br/>— pending verifications<br/>— incomplete phases"]

    ScanPriority --> Determine{What's the<br/>next action?}

    Determine -->|"Phase needs planning"| DelegatePlan["Execute /pbr:plan N"]
    Determine -->|"Plans ready, not built"| DelegateBuild["Execute /pbr:build N"]
    Determine -->|"Built, not reviewed"| DelegateReview["Execute /pbr:review N"]
    Determine -->|"Checkpoint paused"| DelegateBuildResume["Execute /pbr:build N<br/>(resume checkpoint)"]
    Determine -->|"All phases complete"| DelegateMilestone["Suggest /pbr:milestone"]
    Determine -->|"Hard stop found"| Report([Report blocker to user])

    style DelegatePlan fill:#4a90d9,color:#fff
    style DelegateBuild fill:#4a90d9,color:#fff
    style DelegateReview fill:#4a90d9,color:#fff
    style DelegateBuildResume fill:#4a90d9,color:#fff
    style DelegateMilestone fill:#4a90d9,color:#fff
    style Report fill:#e74c3c,color:#fff
```

**Agent count**: 0 (delegates to other commands which spawn their own agents)

---

## `/pbr:debug` — Systematic Debugging

Scientific method loop with checkpoint-driven investigation rounds.

```mermaid
flowchart TD
    Start([User runs /pbr:debug]) --> SessionCheck{Active debug<br/>session exists?}

    SessionCheck -->|Yes| ResumeChoice{Resume<br/>existing?}
    ResumeChoice -->|Yes| LoadSession[(Read debug/NNN-slug.md)]
    ResumeChoice -->|No| NewSession
    SessionCheck -->|No| NewSession

    NewSession([Gather symptoms from user]) --> CreateFile[("Generate session ID<br/>Write debug/NNN-slug.md")]

    LoadSession --> SpawnDebugger
    CreateFile --> SpawnDebugger

    SpawnDebugger{{debugger}}

    SpawnDebugger --> Result{Debugger<br/>outcome?}

    Result -->|ROOT_CAUSE| FixReport["Report root cause<br/>and applied fix"]
    Result -->|INCONCLUSIVE| Suggest["Suggest next steps<br/>or manual investigation"]

    Result -->|CHECKPOINT| Checkpoint([Present findings to user<br/>— need more info])

    Checkpoint --> UserInput([User provides<br/>additional context])

    UserInput --> UpdateFile[(Update debug/NNN-slug.md)]
    UpdateFile --> SpawnDebugger

    FixReport --> UpdateState[(Update STATE.md)]
    Suggest --> UpdateState
    UpdateState --> Done([Done])

    style SpawnDebugger fill:#e67e22,color:#fff
    style NewSession fill:#e74c3c,color:#fff
    style Checkpoint fill:#e74c3c,color:#fff
    style UserInput fill:#e74c3c,color:#fff
```

**Agent count**: 1 (may be spawned multiple times across checkpoint rounds, max 5 hypotheses per round)

---

## `/pbr:milestone` — Milestone Management

Four subcommands with different orchestration patterns.

```mermaid
flowchart TD
    Start([User runs /pbr:milestone]) --> Sub{Subcommand?}

    Sub -->|new| MNew
    Sub -->|complete| MComplete
    Sub -->|audit| MAudit
    Sub -->|gaps| MGaps

    %% --- NEW ---
    subgraph "milestone new"
        MNew([Get milestone details]) --> MNewPlan[Mini roadmap session<br/>— define phases]
        MNewPlan --> MNewWrite[("Update ROADMAP.md<br/>Create phase directories<br/>Update PROJECT.md, STATE.md")]
        MNewWrite --> MNewCommit[Commit]
    end

    %% --- COMPLETE ---
    subgraph "milestone complete"
        MComplete[Determine version] --> MCompVerify{All phases<br/>verified?}
        MCompVerify -->|No| MCompWarn[Warn: unverified phases]
        MCompVerify -->|Yes| MCompStats
        MCompWarn --> MCompStats
        MCompStats["Gather stats<br/>— git log, diffs, accomplishments"]
        MCompStats --> MCompArchive[("Archive docs to milestones/version-*<br/>Collapse phases in ROADMAP.md<br/>Update PROJECT.md")]
        MCompArchive --> MCompTag[Git tag + commit]
    end

    %% --- AUDIT ---
    subgraph "milestone audit"
        MAudit[Read all VERIFICATION.md files] --> MAuditChecker{{integration-checker}}
        MAuditChecker --> MAuditReqs[Check requirements coverage<br/>against REQUIREMENTS.md]
        MAuditReqs --> MAuditReport[("Write MILESTONE-AUDIT.md")]
        MAuditReport --> MAuditPresent[Report to user]
    end

    %% --- GAPS ---
    subgraph "milestone gaps"
        MGaps[Find most recent audit] --> MGapsRead[(Read audit report)]
        MGapsRead --> MGapsPrioritize([Prioritize gaps with user])
        MGapsPrioritize --> MGapsPhases[("Group into phases<br/>Update ROADMAP.md<br/>Create directories")]
        MGapsPhases --> MGapsCommit[Commit]
    end

    style MAuditChecker fill:#e67e22,color:#fff
    style MNew fill:#e74c3c,color:#fff
    style MGapsPrioritize fill:#e74c3c,color:#fff
```

**Agent count**: 0 (new, complete, gaps) or 1 (audit spawns integration-checker)

---

## Session Commands — `/pbr:status`, `/pbr:pause`, `/pbr:resume`

All inline, no agents. Read project state and act on it.

```mermaid
flowchart TD
    subgraph "/pbr:status (read-only)"
        S_Start([Run /pbr:status]) --> S_Read[("Read STATE.md, ROADMAP.md,<br/>config.json, phase directories")]
        S_Read --> S_Calc[Calculate progress per phase]
        S_Calc --> S_Special[Check for special conditions<br/>— debug sessions, pending todos]
        S_Special --> S_Display[Display status dashboard]
        S_Display --> S_Route{Suggest<br/>next action}
    end

    subgraph "/pbr:pause (snapshot)"
        P_Start([Run /pbr:pause]) --> P_Read[(Read STATE.md, config.json)]
        P_Read --> P_Gather[Gather session state<br/>— completed work, git log]
        P_Gather --> P_Remaining[Determine remaining work]
        P_Remaining --> P_Write[("Write .continue-here.md<br/>Update STATE.md")]
        P_Write --> P_Commit[WIP commit]
    end

    subgraph "/pbr:resume (restore)"
        R_Start([Run /pbr:resume]) --> R_Read[(Read STATE.md)]
        R_Read --> R_Search[Search for .continue-here.md files]
        R_Search --> R_Found{Continue file<br/>found?}
        R_Found -->|Yes| R_Display[Display resume context]
        R_Found -->|No| R_Infer[Infer position from STATE.md]
        R_Infer --> R_Display
        R_Display --> R_Validate[Validate resume point<br/>— check for stale data]
        R_Validate --> R_Next[Present next action]
    end
```

**Agent count**: 0 for all three

---

## Simple Commands — `/pbr:todo`, `/pbr:config`, `/pbr:health`, `/pbr:help`

All fully inline with no agent spawns.

```mermaid
flowchart TD
    subgraph "/pbr:todo"
        T_Start([Run /pbr:todo]) --> T_Sub{Subcommand?}
        T_Sub -->|add| T_Add[("Generate ID<br/>Check duplicates<br/>Write todos/pending/NNN-slug.md")]
        T_Sub -->|list| T_List[("Read todos/pending/*.md<br/>Parse frontmatter<br/>Display table")]
        T_Sub -->|done| T_Done[("Move file to todos/done/<br/>Update frontmatter<br/>Update STATE.md")]
    end

    subgraph "/pbr:config"
        C_Start([Run /pbr:config]) --> C_Load[(Read config.json)]
        C_Load --> C_Mode{Direct setting<br/>or interactive?}
        C_Mode -->|Direct| C_Set[Apply setting]
        C_Mode -->|Interactive| C_Show([Display current config<br/>Gather changes from user])
        C_Show --> C_Set
        C_Set --> C_Write[(Write config.json)]
    end

    subgraph "/pbr:health"
        H_Start([Run /pbr:health]) --> H_Checks["Run 6 checks:<br/>1. Directory structure<br/>2. Config validity<br/>3. Phase consistency<br/>4. Plan/Summary pairing<br/>5. STATE.md accuracy<br/>6. Frontmatter validity"]
        H_Checks --> H_Bonus[Bonus: recent decisions]
        H_Bonus --> H_Report[Present diagnostic report]
    end

    subgraph "/pbr:help"
        Help_Start([Run /pbr:help]) --> Help_Show[Display command reference]
    end

    style C_Show fill:#e74c3c,color:#fff
```

**Agent count**: 0 for all four

---

## Agent Summary

| Agent | Used By | Model | Purpose |
|-------|---------|-------|---------|
| `researcher` | begin, plan, explore | inherit | Domain research, technology investigation |
| `synthesizer` | begin | haiku | Compress research outputs into summary |
| `planner` | begin, plan, review | inherit | Generate roadmaps, phase plans, gap-closure plans |
| `plan-checker` | plan, review | inherit | Verify plan quality, trigger revisions |
| `executor` | build, quick | inherit | Execute plan tasks, write code, create files |
| `verifier` | build, review | inherit | Goal-backward verification of phase outcomes |
| `debugger` | debug, review | inherit | Scientific-method bug investigation |
| `codebase-mapper` | scan | sonnet | Analyze codebase from a specific focus angle |
| `integration-checker` | milestone audit | sonnet | Cross-phase integration and E2E flow checks |

All agents are spawned via `Task()` with `subagent_type` — agent definitions are auto-loaded from `agents/*.md`, never inlined into the orchestrator prompt.

---

## Execution Patterns

### Fan-Out / Fan-In
Used by `/pbr:begin` (researchers) and `/pbr:scan` (mappers). Multiple agents run in parallel, each writing independent output files. The orchestrator waits for all to complete before proceeding.

### Pipeline
Used by `/pbr:plan`. Agents run sequentially — each one's output feeds the next. Researcher → Planner → Checker, with a conditional revision loop back to the planner.

### Wave Execution
Used by `/pbr:build`. Plans are grouped into waves by dependency order. Within each wave, executors run in parallel. Waves execute sequentially — wave 2 doesn't start until wave 1 completes.

### Checkpoint Loop
Used by `/pbr:debug`. The agent runs, hits a checkpoint when it needs user input, the orchestrator presents findings and collects input, then respawns the agent with the new context.

### Delegation
Used by `/pbr:continue`. The orchestrator reads state, decides which command to run next, and hands off to that command's full orchestration flow.
