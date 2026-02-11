# Towline Workflow

Visual guide to how Towline's commands connect. For detailed reference, see [DOCS.md](DOCS.md).

## Main Workflow Loop

```mermaid
flowchart TD
    Start([Start]) --> NewOrExisting{New project<br/>or existing?}

    NewOrExisting -->|New| Begin["/dev:begin<br/>Deep questioning, research,<br/>requirements, roadmap"]
    NewOrExisting -->|Existing code| Scan["/dev:scan<br/>Analyze codebase"]
    Scan --> Begin

    Begin --> PlanPhase["/dev:plan N<br/>Research, create plans,<br/>verify before building"]

    PlanPhase --> BuildPhase["/dev:build N<br/>Execute plans in<br/>parallel waves"]

    BuildPhase --> ReviewPhase["/dev:review N<br/>Automated verification<br/>+ conversational UAT"]

    ReviewPhase --> GapsFound{Gaps found?}

    GapsFound -->|No| MorePhases{More phases?}
    GapsFound -->|Yes| FixGaps["/dev:plan N --gaps<br/>Create gap-closure plans"]
    FixGaps --> BuildGaps["/dev:build N --gaps-only"]
    BuildGaps --> ReviewPhase

    MorePhases -->|Yes| PlanPhase
    MorePhases -->|No| Milestone["/dev:milestone complete<br/>Archive and tag"]
    Milestone --> Done([Done])
```

## Entry Points

```mermaid
flowchart LR
    subgraph "Core Loop"
        Plan["/dev:plan"] --> Build["/dev:build"] --> Review["/dev:review"]
        Review -->|repeat| Plan
    end

    subgraph "Before Planning"
        Explore["/dev:explore<br/>Open-ended discovery"]
        Discuss["/dev:discuss N<br/>Lock phase decisions"]
        Assumptions["/dev:plan N --assumptions<br/>Surface assumptions"]
    end

    subgraph "Skip the Ceremony"
        Quick["/dev:quick<br/>Ad-hoc task, atomic commit"]
        Continue["/dev:continue<br/>Auto-execute next step"]
    end

    subgraph "Troubleshooting"
        Debug["/dev:debug<br/>Hypothesis-driven"]
        Health["/dev:health<br/>Check .planning/ integrity"]
        Status["/dev:status<br/>Where am I?"]
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

    NeedBreak -->|Yes| Pause["/dev:pause<br/>Save handoff file +<br/>WIP commit"]
    NeedBreak -->|No| Continue([Continue working])

    Pause --> Later([Later...])
    Later --> Resume["/dev:resume<br/>Find pause point,<br/>restore context"]
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
    MNew["/dev:milestone new<br/>Define scope"] --> Phases["Plan → Build → Review<br/>(repeat for each phase)"]

    Phases --> AllDone{All phases<br/>complete?}
    AllDone -->|No| Phases
    AllDone -->|Yes| Audit["/dev:milestone audit<br/>Integration check +<br/>requirements coverage"]

    Audit --> AuditResult{Gaps found?}
    AuditResult -->|No| Complete["/dev:milestone complete<br/>Archive + git tag"]
    AuditResult -->|Yes| GapPhases["/dev:milestone gaps<br/>Create gap-closure phases"]
    GapPhases --> Phases

    Complete --> NextMilestone{Next milestone?}
    NextMilestone -->|Yes| MNew
    NextMilestone -->|No| Done([Project complete])
```

## Decision Guide

```mermaid
flowchart TD
    What{What do you<br/>want to do?}

    What -->|"Start a project"| Begin["/dev:begin"]
    What -->|"Think through ideas"| Explore["/dev:explore"]
    What -->|"Quick fix or small task"| Quick["/dev:quick"]
    What -->|"Continue where I left off"| Resume["/dev:resume"]
    What -->|"I'm lost"| Status["/dev:status"]
    What -->|"Something is broken"| Debug["/dev:debug"]
    What -->|"Build the next phase"| TaskSize{Simple or<br/>complex?}

    TaskSize -->|"Simple"| Continue["/dev:continue"]
    TaskSize -->|"Complex, want control"| Plan["/dev:plan N"]
    Plan --> Build["/dev:build N"]
    Build --> Review["/dev:review N"]
```
