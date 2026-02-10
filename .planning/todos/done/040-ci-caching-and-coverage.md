---
title: "Add npm caching and coverage threshold to CI"
status: pending
priority: P1
source: dev-guide-review
created: 2026-02-10
theme: testing
---

## Goal

CI runs 9 jobs (3 OS × 3 Node versions) with no npm caching — wasting ~2-3 min per job. Also no coverage threshold enforcement, so coverage can silently degrade.

## Changes

1. **`.github/workflows/test.yml`** — Add npm cache:
   ```yaml
   - uses: actions/cache@v4
     with:
       path: ~/.npm
       key: ${{ runner.os }}-node-${{ matrix.node-version }}-${{ hashFiles('**/package-lock.json') }}
   ```

2. **`.github/workflows/test.yml`** — Add coverage threshold (one job):
   ```yaml
   - run: npm test -- --coverage --coverageThreshold='{"global":{"branches":65,"functions":65,"lines":65,"statements":65}}'
   ```

3. **`.github/workflows/test.yml`** — Upload test artifacts on failure:
   ```yaml
   - uses: actions/upload-artifact@v4
     if: failure()
     with:
       name: test-logs-${{ matrix.os }}-${{ matrix.node-version }}
       path: .planning/logs/
   ```

## Acceptance Criteria

- [ ] npm caching saves ≥1 min per job
- [ ] Coverage threshold enforced on at least one matrix cell
- [ ] Test failure artifacts uploaded for debugging
