# Deep Questioning Guide

Techniques for understanding a user's project vision during `/pbr:begin`. The goal is to build a complete mental model of what needs to be built, not just a feature list.

> Skills are being migrated to these patterns. See Phase 5 for skill-level updates.

---

## Philosophy

**You are a thinking partner, not an interviewer.**

Project initialization is dream extraction, not requirements gathering. The user often has a fuzzy idea. Your job is to help them sharpen it. Ask questions that make them think "oh, I hadn't considered that" or "yes, that's exactly what I mean."

Don't interrogate. Collaborate. Don't follow a script. Follow the thread.

By the end of questioning, you need enough clarity to write a PROJECT.md that downstream phases can act on:

- **Research** needs: what domain to research, what the user already knows, what unknowns exist
- **Requirements** needs: clear enough vision to scope v1 features
- **Roadmap** needs: clear enough vision to decompose into phases, what "done" looks like
- **plan** needs: specific requirements to break into tasks, context for implementation choices
- **build** needs: success criteria to verify against, the "why" behind requirements

A vague PROJECT.md forces every downstream phase to guess. The cost compounds.

---

## Background Context Checklist

Use this as a **background checklist**, not a conversation structure. Check these mentally as you go. If gaps remain, weave questions naturally into the conversation.

- [ ] What they're building (concrete enough to explain to a stranger)
- [ ] Why it needs to exist (the problem or desire driving it)
- [ ] Who it's for (even if just themselves)
- [ ] What "done" looks like (observable outcomes)

Four things. When you have all four, you can offer to proceed. If they volunteer more, capture it.

---

## Core Questioning Techniques

### Challenge Vagueness

When the user says something abstract or general, push for specifics.

| They say | You ask |
|----------|---------|
| "It should be fast" | "Fast how? Page load under 1 second? API response under 200ms? What's the baseline today?" |
| "A dashboard" | "What's on the dashboard? What data? What can users do with it?" |
| "User management" | "What can users do? Sign up, log in, reset password? Roles? Permissions? Teams?" |
| "It needs to scale" | "Scale to what? 100 users? 100,000? What's the growth timeline?" |

### Make Abstract Concrete

Ask for examples and walk-throughs.

- "Walk me through what a user does when they first open this."
- "Give me an example of [that feature] in action."
- "If I were a user right now, what would I see?"
- "What does a typical session look like from start to finish?"

### Surface Assumptions

Expose hidden assumptions the user hasn't stated.

- "Why do you assume [X]? Is that a hard requirement?"
- "Have you considered [alternative]? What made you choose [their approach]?"
- "What if [assumption] turns out to be wrong?"
- "Is that because of a technical constraint, or a preference?"

### Find Edges

Probe for edge cases and boundary conditions.

- "What happens when [unexpected input]?"
- "What if two users do [action] at the same time?"
- "What about offline/slow connections?"
- "What if the user has [unusual state]?"
- "What's the maximum [items/users/data] this needs to handle?"

### Reveal Motivation

Understand the WHY behind features.

- "Why does that matter?"
- "What problem does that solve for the user?"
- "What happens if we don't build that?"
- "Who specifically needs this? Why?"
- "What's the cost of getting this wrong?"

### Prioritize Ruthlessly

Force ranking and trade-off decisions.

- "If you could only ship three features, which three?"
- "Would you rather have [A] done well or [A and B] done halfway?"
- "What's the minimum that would make this useful?"
- "What would you cut if you had to ship in half the time?"

### Surface Implications

When the user states a preference or makes a choice, surface what it implies before moving on. This avoids surprises later and reveals whether the user has thought through the consequences.

- "You want real-time updates. That typically means WebSockets, which adds deployment complexity. Are you prepared for that, or would polling work?"
- "Card-based layout with sort/filter usually means client-side state management. How complex are your filtering needs?"
- "You mentioned multi-tenant. That affects database design, auth, billing — have you thought through isolation boundaries?"
- "Self-hosted deployment means you own uptime. Do you have monitoring and on-call plans?"

The pattern: **[stated preference] implies [consequence]. Is that acceptable, or should we reconsider?**

### Frame Trade-offs, Not Menus

Replace "Do you want A or B?" with trade-off framing that shows real consequences.

| Instead of | Ask |
|------------|-----|
| "SQL or NoSQL?" | "SQL gives you strong consistency and relationships but needs schema migrations. NoSQL gives you flexible documents but makes joins painful. What matters more for your data?" |
| "SSR or SPA?" | "SSR gives you better SEO and initial load, but adds server cost. SPA gives you snappier interactions but hurts discoverability. What's the priority?" |
| "Monolith or microservices?" | "A monolith ships faster and is simpler to debug, but gets harder to scale independently. Microservices scale cleanly but add deployment and coordination overhead. Where are you on that spectrum?" |

The pattern: **A gives you X but costs Y. B gives you Z but costs W. What matters more to you?**

This produces better answers than binary choices because users reveal their actual priorities.

---

## Progressive Depth Layers

Structure the conversation as deepening layers. Each layer builds on the previous one. You do not need to complete every layer in every project, but the order matters — do not jump to Layer 3 before Layer 1 is solid.

### Layer 1: Shape — "What are you building?"
Establish the broad outline. What is it, who is it for, what does it do?
- Core purpose and user personas
- Primary features and workflows
- Technology preferences or constraints
- What is being built (concrete deliverable)
- What is NOT being built (scope boundaries)
- Technology choices already made (language, framework, hosting)

### Layer 2: Feel — "How should users experience this?"
Move from structure to experience. How does it feel to use?
- UI expectations, interaction patterns, responsiveness
- Tone, branding, visual direction
- Performance expectations from the user's perspective
- Timeline expectations and budget constraints

### Layer 3: Edges — "What happens when things go wrong?"
Probe failure modes, edge cases, and the unexpected.
- Error handling, empty states, data conflicts
- Permission boundaries, rate limits, abuse scenarios
- What the user has NOT thought about yet
- What keeps them up at night about this project
- What might go wrong, what's the hardest part

### Layer 4: System — "How does this fit into the bigger picture?"
Zoom out to the surrounding ecosystem.
- Integrations, data flows, deployment environment
- Operational concerns — monitoring, backups, migrations
- Future evolution and extensibility
- Integration constraints (existing systems, APIs, databases)
- Architecture preferences and deployment targets

---

## Conversation Flow

The conversation should feel natural, not like an interrogation. Follow this general arc:

### Opening (1-2 exchanges)
Start broad and let them paint the picture:
- "What are you building?"
- "Tell me about this project."

### Exploration (3-5 exchanges)
Dive into specifics on each area they mention:
- Follow their energy — explore what they're excited about
- Circle back to areas they glossed over
- Use "tell me more about..." and "what does that mean exactly?"

### Constraints (2-3 exchanges)
Shift to practical matters:
- "What are you working with? Language, framework, hosting?"
- "Any hard constraints I should know about?"
- "What's the timeline looking like?"

### Prioritization (1-2 exchanges)
Force trade-offs:
- "Of everything we discussed, what's the core? What MUST be in v1?"
- "What can wait for v2?"

### Confirmation (1 exchange)
Summarize back what you heard and confirm:
- "Let me play this back: you're building [X] that [does Y] for [users Z]. The core features are [A, B, C]. You're using [stack]. The biggest risk is [concern]. Did I get that right?"

---

## Domain-Aware Probing

When the user mentions a specific technology area (e.g., "React app", "REST API", "real-time chat"), use domain-specific follow-up questions to go deeper. General questions miss critical details that only matter in that domain.

See **[skills/shared/domain-probes.md](../shared/domain-probes.md)** for technology-specific probing patterns organized by domain (frontend frameworks, databases, APIs, auth, deployment, etc.). Reference those patterns when the conversation enters a technology-specific area rather than relying on generic follow-ups.

---

## Using AskUserQuestion

Use AskUserQuestion to help users think by presenting concrete options to react to.

### Concrete Interpretations

Options should be specific and reactable, not abstract categories.

**Bad options:**
- "Simple", "Medium", "Complex"
- "Technical", "Business", "Other"
- Leading options that presume an answer

**Good options:**
- "Landing page with contact form", "Multi-page site with blog", "Full web app with auth and dashboard"
- "Sub-second response", "Handles large datasets", "Quick to build"
- Specific examples that reveal priorities

**Example — vague answer:**
User says "it should be fast"

- header: "Fast"
- question: "Fast how?"
- options: ["Sub-second response", "Handles large datasets", "Quick to build", "Let me explain"]

**Example — following a thread:**
User mentions "frustrated with current tools"

- header: "Frustration"
- question: "What specifically frustrates you?"
- options: ["Too many clicks", "Missing features", "Unreliable", "Let me explain"]

### Modifying Options

Users can modify a presented option without selecting "Other":
- Select by number and modify: "#1 but with X"
- Reference and adjust: "#2 with pagination disabled"

When a user modifies an option, accept the modification as their decision. Do not re-present options or ask them to pick from the original list.

For AskUserQuestion structural rules (max 4 options, 12-char header, multiSelect), see `references/ui-formatting.md`.

---

## Freeform Rule

**When the user wants to explain freely, STOP using AskUserQuestion.**

If a user selects "Other" or "Let me explain" and their response signals they want to describe something in their own words (e.g., "let me describe it", "I'll explain", "something else", or any open-ended reply that isn't choosing/modifying an existing option), you MUST:

1. **Ask your follow-up as plain text** -- NOT via AskUserQuestion
2. **Wait for them to type at the normal prompt**
3. **Resume AskUserQuestion** only after processing their freeform response

**Wrong:** User says "let me describe it" -> AskUserQuestion("What feature?", ["Feature A", "Feature B", "Describe in detail"])
**Right:** User says "let me describe it" -> "Go ahead -- what are you thinking?"

The freeform rule prevents AskUserQuestion from becoming an interrogation tool. When someone wants to talk, let them talk.

---

## Decision Gate

When you have enough clarity to write the target document (PROJECT.md, CONTEXT.md, etc.), offer to proceed:

```
AskUserQuestion:
  question: "I think I understand what you're after. Ready to proceed?"
  header: "Ready?"
  options:
    - label: "Yes, proceed"    description: "Move forward with document creation"
    - label: "Keep exploring"  description: "I want to share more or ask me more"
```

If "Keep exploring" -- ask what they want to add or identify gaps and probe naturally. Loop until "Yes, proceed" is selected.

This gate is **mandatory** in all skills that transition from questioning to document creation (begin, discuss, explore).

---

## Anti-Patterns

1. **DO NOT** present a form and ask users to fill it in
2. **DO NOT** walk through a checklist -- the background checklist is for your mental tracking, never for the user
3. **DO NOT** ask all questions at once — have a conversation
4. **DO NOT** assume you know what they want — ask
5. **DO NOT** suggest technologies before understanding the problem
6. **DO NOT** impose premature constraints before understanding what the user actually wants to build
7. **DO NOT** skip edge case exploration
8. **DO NOT** accept vague answers — push for specifics
9. **DO NOT** rush through questioning to get to planning
10. **DO NOT** ignore concerns or hand-wave them away
11. **DO NOT** lead the user toward a particular solution
12. **DO NOT** forget to summarize and confirm understanding
13. **DO NOT** ask what you already know — track what the user has stated and never re-ask it. If they said "I'm using React", do not later ask "Are you using a frontend framework?" If they said "PostgreSQL", do not ask "What database are you using?" Redundant questions waste exchanges and erode trust. Instead, build on what you know: "You mentioned React — are you using Next.js or plain CRA?"
14. **DO NOT** use corporate speak or jargon — "What are your success criteria?" and "Who are your stakeholders?" sound like a consultant, not a thinking partner
15. **DO NOT** ask about the user's technical experience — it's irrelevant and condescending. You build what they describe regardless of their background.
