---
name: test-casebook-back
description: Use when asked to write, complete, or harden a Laravel backend's test suite the test-casebook-back way — exhaustive, strictly-typed, persona-matrix-driven tests with a task-test.md plan, block-by-block execution, and a review gate. Triggers on "write tests" / "cover this" / "test this Policy/Resource/Action" in a Laravel project. Orchestrates the test-writer-back and test-reviewer-back sub-agents.
---

# test-casebook-back — test suite orchestrator (Laravel backend)

You drive the test-casebook-back methodology on the **current (target) Laravel project**. The full doctrine is `AGENTS.md` (at the project root, or in this repo if invoked directly) — it is the **single source of truth**. Read it first; this skill only orchestrates.

## What this skill does

1. **Read `AGENTS.md`** end to end, including the "Core vs optional" table at the top.
2. **Step 1 yourself**: read the target project's `composer.json`, detect Pest vs PHPUnit, Larastan/PHPStan presence and level, `spatie/laravel-permission`, `lomkit/laravel-rest-api`, `lomkit/laravel-access-control`. If Lomkit is present, also read `docs/testing-guide/lomkit.md` before planning any Resource-related block.
3. **Build the plan** (`task-test.md`, Step 5.0): list every unit, read each one's source end to end, enumerate every case, reconcile against existing tests (same audit rule as the front doctrine — an existing test isn't automatically "done").
4. **Execute block by block** (Step 5.1) by delegating each block:
   - hand the block to the **`test-writer-back`** sub-agent (the unit's path, its enumerated cases, whether it's Lomkit-exposed);
   - hand the written block to the **`test-reviewer-back`** sub-agent (independent — never the agent that wrote it) before any commit;
   - if rejected, send findings back to `test-writer-back`, then re-review — do **not** commit a rejected block;
   - commit one focused commit per approved block (test file(s) + ticked `task-test.md`).
5. **Verify** (Step 6): run the test suite, run static analysis if present, enforce the coverage floor.

## Delegation rules

- Blocks are independent — several `test-writer-back` → `test-reviewer-back` chains may run concurrently, but keep one reviewer per block, distinct from its writer.
- Permission-gated units (any Policy/Gate check) carry a **persona matrix** (Step 5.2). If the target project has no way to mint a persona with a specific permission state, **stop and tell the user** — don't fabricate a green run locked to a single default persona.
- Don't apply the Lomkit-specific guide to a project that doesn't have `lomkit/laravel-rest-api` in `composer.json` — the core steps stand on their own.

## Definition of done

Every box in `task-test.md` ticked, reviewed, and committed; coverage at or above the project's floor; static analysis clean if present; every permission-gated unit covered by its persona matrix, dense on the refused cells. See `AGENTS.md` → "Definition of done".
