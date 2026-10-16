---
name: phase-workflow
description: Starts, continues and finishes Aboard implementation phases and spikes, resolves VERIFY items, and keeps docs/PROGRESS.md up to date as the project's memory. Use at the start and end of any implementation task, when beginning a new phase or spike, or when asked what to do next.
---

# Phase workflow (Aboard)

`docs/PROGRESS.md` holds the current state (phases, acceptance criteria, VERIFY log, decisions, lessons). `UPDATE.md` in the project root holds the history of every change.

## Start of every task
1. Read `docs/PROGRESS.md`: active phase and task, decisions log, VERIFY log, lessons. Then read the current task in `docs/TASKS.md`; tasks run in order, one at a time.
2. If the task belongs to a later phase than the active one, tell the owner and ask before starting it.
3. Read the spec files for the area (`AGENTS.md` → "Where to look") and the requirement IDs in `docs/PRD.md`.
4. List every **VERIFY** item the task depends on (VERIFY log in `docs/PROGRESS.md`). Resolve them first (below).
5. Write an implementation plan: goal, requirement IDs, files to create/change, tests, VERIFY items, risks. Get approval for database, auth, Drive, security or multi-module changes.

## Resolving a VERIFY item
1. Check, in this order: the installed package's type definitions or source in `node_modules/`; the CircuitJS fork's Java source; the official docs for the exact version; a minimal experiment.
2. Never mark an item confirmed from memory or from a blog post alone.
3. Record in the VERIFY log: status (`Confirmed` or `Changed (spec updated)`), one-line result, date.
4. If the result differs from the spec, update the spec text in the same change and add a line to the decisions log.

## Spikes (phase 0)
- Spike code is throwaway: put it in `spikes/S<n>-<name>/`, outside `apps/web`.
- Write `docs/spikes/S<n>.md`: goal, exact versions, what worked, what failed, decisions, open issues, VERIFY items resolved.
- A spike is done when its report exists and its VERIFY items are logged.

## During the task
- Small steps; run `pnpm lint && pnpm typecheck && pnpm test` after each meaningful step.
- Database changes use skill `db-migration`. Risky changes end with skill `security-review`.
- Do not widen scope: note extra ideas as open issues in the report instead of implementing them.

## Finishing a task
1. Run: `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm ci:security` (and `pnpm test:e2e` when UI flows changed). Push and verify that GitHub Actions CI passes for the pushed commit hash.
2. Check the phase's acceptance criteria. A phase is `Done (YYYY-MM-DD)` only when all of them pass on the listed browsers/devices; otherwise keep `In progress` and list what is left.
3. Append an entry to `UPDATE.md` using the template from Task 1 in `docs/TASKS.md` (request, files changed, checks, related IDs, open items). Append only.
4. Update `docs/PROGRESS.md`:
   - "Current state": active phase, current task, last updated date, next step, blockers;
   - phase status;
   - VERIFY log entries;
   - decisions log (only owner-approved decisions);
   - lessons (when the owner corrected something or a mistake repeated), then promote the lesson to a rule in `AGENTS.md` or `.agents/rules/` and note where.
5. Keep `AGENTS.md` under 200 lines; move detail to rule files or specs.
6. Report to the owner in Arabic: what changed, test results, GitHub Actions CI run URL and conclusion for the pushed commit, acceptance status, open items, next step.

## Decision tree: what next?
- A VERIFY item blocks the active phase → resolve it.
- Active phase has failing acceptance criteria → fix those first.
- Current task done → log it in `UPDATE.md` and move to the next task in `docs/TASKS.md`.
- All criteria of the phase pass → mark `Done`, set the next phase as active, start with its first task.
- Owner asks for something outside the plan → explain which phase it belongs to and ask; whatever is done, log it in `UPDATE.md`.
