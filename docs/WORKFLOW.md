# Plan-Build-Run Workflow

Visual guide to how Plan-Build-Run's commands connect. For detailed reference, see [DOCS.md](DOCS.md).

## Main Workflow Loop

```mermaid
flowchart TD
    Start([Start]) --> NewOrExisting{New project<br/>or existing?}

    NewOrExisting -->|New| Begin["/pbr:begin<br/>Deep questioning, research,<br/>requirements, roadmap"]
    NewOrExisting -->|Existing code| Scan["/pbr:scan<br/>Analyze codebase"]
    Scan --> Begin

    Begin --> PlanPhase["/pbr:plan N<br/>Research, create plans,<br/>verify before building"]

    PlanPhase --> BuildPhase["/pbr:build N<br/>Execute plans in<br/>parallel waves"]

    BuildPhase --> ReviewPhase["/pbr:review N<br/>Automated verification<br/>+ conversational UAT"]

    ReviewPhase --> GapsFound{Gaps found?}

    GapsFound -->|No| MorePhases{More phases?}
    GapsFound -->|Yes| FixGaps["/pbr:plan N --gaps<br/>Create gap-closure plans"]
    FixGaps --> BuildGaps["/pbr:build N --gaps-only"]
    BuildGaps --> ReviewPhase

    MorePhases -->|Yes| PlanPhase
    MorePhases -->|No| Milestone["/pbr:milestone complete<br/>Archive and tag"]
    Milestone --> Done([Done])
```

## Entry Points

```mermaid
flowchart LR
    subgraph "Core Loop"
        Plan["/pbr:plan"] --> Build["/pbr:build"] --> Review["/pbr:review"]
        Review -->|repeat| Plan
    end

    subgraph "Before Planning"
        Explore["/pbr:explore<br/>Open-ended discovery"]
        Discuss["/pbr:discuss N<br/>Lock phase decisions"]
        Assumptions["/pbr:plan N --assumptions<br/>Surface assumptions"]
    end

    subgraph "Skip the Ceremony"
        Quick["/pbr:quick<br/>Ad-hoc task, atomic commit"]
        Continue["/pbr:continue<br/>Auto-execute next step"]
    end

    subgraph "Troubleshooting"
        Debug["/pbr:debug<br/>Hypothesis-driven"]
        Health["/pbr:health<br/>Check .planning/ integrity"]
        Status["/pbr:status<br/>Where am I?"]
    end

    Explore -.->|informs| Plan
    Discuss -.->|locks decisions for| Plan
    Assumptions -.->|informs| Plan
    Quick -.->|independent| Build
    Continue -.->|delegates to| Plan
    Continue -.->|delegates to| Build
    Continue -.->|delegates to| Review
    Debug -.->|fixes issues in| Build
    Status -.->|suggests| Plan
    Status -.->|suggests| Build
```

## Session Management

```mermaid
flowchart TD
    Working([Working on a phase]) --> NeedBreak{Need to stop?}

    NeedBreak -->|Yes| Pause["/pbr:pause<br/>Save handoff file +<br/>WIP commit"]
    NeedBreak -->|No| Continue([Continue working])

    Pause --> Later([Later...])
    Later --> Resume["/pbr:resume<br/>Find pause point,<br/>restore context"]
    Resume --> Suggest[Suggests next action]
    Suggest --> Continue

    Working --> ContextLimit{Context getting full?}
    ContextLimit -->|Yes| AutoPause["PreCompact hook<br/>preserves STATE.md"]
    AutoPause --> NewSession([New session])
    NewSession --> SessionStart["SessionStart hook<br/>injects project state"]
    SessionStart --> Resume
```

## Milestone Lifecycle

```mermaid
flowchart TD
    MNew["/pbr:milestone new<br/>Define scope"] --> Phases["Plan → Build → Review<br/>(repeat for each phase)"]

    Phases --> AllDone{All phases<br/>complete?}
    AllDone -->|No| Phases
    AllDone -->|Yes| Audit["/pbr:milestone audit<br/>Integration check +<br/>requirements coverage"]

    Audit --> AuditResult{Gaps found?}
    AuditResult -->|No| Complete["/pbr:milestone complete<br/>Archive + git tag"]
    AuditResult -->|Yes| GapPhases["/pbr:milestone gaps<br/>Create gap-closure phases"]
    GapPhases --> Phases

    Complete --> NextMilestone{Next milestone?}
    NextMilestone -->|Yes| MNew
    NextMilestone -->|No| Done([Project complete])
```

## Decision Guide

```mermaid
flowchart TD
    What{What do you<br/>want to do?}

    What -->|"Start a project"| Begin["/pbr:begin"]
    What -->|"Think through ideas"| Explore["/pbr:explore"]
    What -->|"Quick fix or small task"| Quick["/pbr:quick"]
    What -->|"Continue where I left off"| Resume["/pbr:resume"]
    What -->|"I'm lost"| Status["/pbr:status"]
    What -->|"Something is broken"| Debug["/pbr:debug"]
    What -->|"Build the next phase"| TaskSize{Simple or<br/>complex?}

    TaskSize -->|"Simple"| Continue["/pbr:continue"]
    TaskSize -->|"Complex, want control"| Plan["/pbr:plan N"]
    Plan --> Build["/pbr:build N"]
    Build --> Review["/pbr:review N"]
```
