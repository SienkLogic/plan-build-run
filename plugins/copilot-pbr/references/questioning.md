<!-- canonical: ../../pbr/references/questioning.md -->
# Deep Questioning Guide

Techniques for understanding a user's project vision during `/pbr:begin`. The goal is to build a complete mental model of what needs to be built, not just a feature list.

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

## Required Context Checklist

By the end of questioning, you should have clear answers for ALL of these:

### The Problem
- [ ] What problem is being solved?
- [ ] Who has this problem? (specific users/personas)
- [ ] How are they solving it today? (current state)
- [ ] Why is the current solution inadequate?

### The Solution
- [ ] What is being built? (concrete description)
- [ ] What does "done" look like? (at least 3 success criteria)
- [ ] What are the core features? (prioritized)
- [ ] What is explicitly NOT being built? (scope boundaries)

### Constraints
- [ ] Technology choices already made (language, framework, hosting)
- [ ] Budget constraints (money, time, resources)
- [ ] Team constraints (size, skill level, availability)
- [ ] Integration constraints (existing systems, APIs, databases)
- [ ] Timeline expectations (deadlines, milestones)

### Decisions Already Made
- [ ] Architecture preferences or requirements
- [ ] Deployment environment (cloud, self-hosted, serverless)
- [ ] Authentication approach
- [ ] Data storage approach
- [ ] Third-party services to use

### Edge Cases and Concerns
- [ ] What keeps them up at night about this project?
- [ ] What's the hardest part?
- [ ] What might go wrong?
- [ ] What are they unsure about?

---

## Progressive Depth Layers

Structure the conversation as deepening layers. Each layer builds on the previous one. You do not need to complete every layer in every project, but the order matters — do not jump to Layer 3 before Layer 1 is solid.

### Layer 1: Shape — "What are you building?"
Establish the broad outline. What is it, who is it for, what does it do?
- Core purpose and user personas
- Primary features and workflows
- Technology preferences or constraints

### Layer 2: Feel — "How should users experience this?"
Move from structure to experience. How does it feel to use?
- UI expectations, interaction patterns, responsiveness
- Tone, branding, visual direction
- Performance expectations from the user's perspective

### Layer 3: Edges — "What happens when things go wrong?"
Probe failure modes, edge cases, and the unexpected.
- Error handling, empty states, data conflicts
- Permission boundaries, rate limits, abuse scenarios
- What the user has NOT thought about yet

### Layer 4: System — "How does this fit into the bigger picture?"
Zoom out to the surrounding ecosystem.
- Integrations, data flows, deployment environment
- Operational concerns — monitoring, backups, migrations
- Future evolution and extensibility

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

## Anti-Patterns

1. **DO NOT** present a form and ask users to fill it in
2. **DO NOT** ask all questions at once — have a conversation
3. **DO NOT** assume you know what they want — ask
4. **DO NOT** suggest technologies before understanding the problem
5. **DO NOT** skip edge case exploration
6. **DO NOT** accept vague answers — push for specifics
7. **DO NOT** rush through questioning to get to planning
8. **DO NOT** ignore concerns or hand-wave them away
9. **DO NOT** lead the user toward a particular solution
10. **DO NOT** forget to summarize and confirm understanding
11. **DO NOT** ask what you already know — track what the user has stated and never re-ask it. If they said "I'm using React", do not later ask "Are you using a frontend framework?" If they said "PostgreSQL", do not ask "What database are you using?" Redundant questions waste exchanges and erode trust. Instead, build on what you know: "You mentioned React — are you using Next.js or plain CRA?"
