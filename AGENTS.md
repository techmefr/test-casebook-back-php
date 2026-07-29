# AGENTS.md — test-casebook-back testing playbook

> **For an AI coding agent (Claude Code, etc.).** You have been handed this file (or the test-casebook-back repository) and asked to set up the **test-casebook-back** methodology and write the test suite for a Laravel backend. This file lives in the test-casebook-back repo; **apply its steps to the project you are currently working in** (the "target project"), not to test-casebook-back itself.

`test-casebook-back` is the **backend counterpart** of [`test-casebook`](https://github.com/techmefr/test-casebook) — same doctrine (plan first, exhaustive not happy-path, isolated and deterministic, permission matrix, review gate, coverage floor), ported to PHP/Laravel instead of JS. It is a **separate repo on purpose**: the two ecosystems don't share a distribution mechanism (`npx` vs Composer), a runner (Vitest/Playwright vs PHPUnit/Pest), or a static-analysis tool (`tsc`/ESLint vs PHPStan) — forcing them into one doc produces a doc that fits neither.

## Core vs optional — don't assume packages nobody asked for

This playbook has a **generic core** that applies to any Laravel project, and **optional modules** that only apply if the target project actually uses the package in question. Detect before applying — never install or assume a package the project doesn't already depend on:

| Module | Detect via (`composer.json`) | If absent |
|---|---|---|
| **Core** (this file, Steps 1–6) | `laravel/framework` | N/A — always applies |
| Pest (vs plain PHPUnit) | `pestphp/pest` | Assume plain PHPUnit test classes (the default in this playbook) |
| Larastan (PHPStan for Laravel) | `larastan/larastan` | Skip the static-analysis step, or use plain `phpstan/phpstan` if present without Larastan |
| `spatie/laravel-permission` | `spatie/laravel-permission` | Build the persona catalog from whatever the project actually uses to gate access (a `role` column, custom Gate definitions, a bespoke ACL) — see Step 5.2 |
| `lomkit/laravel-rest-api` | `lomkit/laravel-rest-api` | Skip `docs/testing-guide/lomkit.md` entirely — nothing in the core steps depends on it |
| `lomkit/laravel-access-control` | `lomkit/laravel-access-control` | Skip the row-scoping notes in the Lomkit guide |
| Any project-specific PHPStan ruleset (e.g. an internal `*/phpstan-*-rules` package) | present in `require-dev` | Just run whatever `phpstan.neon` already configures — don't invent rules |

**Not every Laravel project runs Lomkit, laravel-access-control, or an org-specific PHPStan ruleset.** Those are documented as opt-in modules precisely so a plain Laravel + PHPUnit project isn't handed instructions for packages it doesn't have.

## Definition of done

When you finish, all of these must be true:

1. The test runner (PHPUnit or Pest, whichever the project already uses) is configured and the suite passes.
2. If a static-analysis tool is present (Larastan/PHPStan), it runs clean at the project's configured level — no new errors, no new baseline entries.
3. A `task-test.md` plan exists, lists every unit and its enumerated cases (see Step 5.0), and **every box in it is ticked, reviewed, and committed** — tests exist for every layer the project needs (unit/feature, and integration against the real database via factories), **cover every branch and state of each unit under test**, are **strictly typed** (`declare(strict_types=1)`, typed factories/fixtures), **pass**, and each block was validated by a review agent before its commit.
4. Test coverage is **at least the project's coverage floor** (see "Coverage floor" below).
5. Every **permission-gated** unit (a Policy, a Gate, a role/permission check) is covered by a **permission matrix** (Step 5.2) — scenario × persona, expected from the plan, at least one *refused* persona per gated capability, and every enforcement layer asserted.

Work through the steps in order. Do not skip verification.

### Coverage floor

The floor below is **80%** (lines and branches) unless this copy was configured with a different value for the project. It is a per-project, governance-owned setting, not a fixed constant — teams commonly set backend coverage differently from frontend coverage, which is one of the reasons this doctrine lives in its own repo (see the root README). If you are applying this playbook by hand and the user states a different floor, replace every coverage-threshold number you see below with theirs, consistently.

---

## Step 1 — Detect the stack

Read the target project's `composer.json`:

1. Confirm `laravel/framework` is present — this playbook assumes Laravel. If it's a different PHP framework (Symfony, plain PHP), the core principles (plan first, isolate, permission matrix, review gate) still apply but the specific commands below don't — adapt them to the framework's own testing tools.
2. Check for `pestphp/pest` — if present, use Pest syntax (`it(...)`, `test(...)`); if absent, use plain PHPUnit test classes (`extends TestCase`, `#[Test]` attribute or `test_` prefixed methods) — **this is the default assumption**, since it's the more common convention in real-world Laravel backends.
3. Check for `larastan/larastan` (or plain `phpstan/phpstan`) — if present, static analysis is part of the definition of done (Step 6); if absent, skip that check entirely rather than pushing the team to adopt a new tool.
4. Check for `spatie/laravel-permission` — changes how personas are built in Step 5.2 (roles/permissions API vs a bespoke check).
5. Check for `lomkit/laravel-rest-api` — if present, read `docs/testing-guide/lomkit.md` in addition to this file; it covers Resource-specific cases (field/relation whitelisting, search/mutate endpoints) that don't exist outside that package.

Match the project's **package manager** (Composer) and **test runner invocation** (`vendor/bin/phpunit` or `vendor/bin/pest`) — detect from `composer.json` scripts and lockfile, don't assume.

---

## Step 2 — Confirm the test runner is configured

- **PHPUnit (default):** `phpunit.xml` should already exist in a Laravel project (shipped by the framework). Confirm the `<source><include>` block scopes coverage to the project's own code (e.g. `app/`, or `functional/` + `technical/` in an OSDD-organized codebase) and excludes `*/tests/*` and `*/migrations/*`.
- **Pest (if detected):** confirm `tests/Pest.php` exists; Pest runs on top of PHPUnit, so the same `phpunit.xml` coverage scoping applies.
- **Coverage command:**
  ```bash
  vendor/bin/phpunit --coverage-text --coverage-filter=app  # or the project's actual source paths
  # or, if Pest is present:
  vendor/bin/pest --coverage --min=80
  ```
- **Do not install a runner the project doesn't have.** If neither PHPUnit config nor Pest is present (unlikely in a real Laravel project, since PHPUnit ships by default), stop and ask the user which one they want before proceeding.

---

## Step 3 — Static analysis (if Larastan/PHPStan is present)

If `larastan/larastan` or `phpstan/phpstan` is in `composer.json`:

```bash
vendor/bin/phpstan analyse --memory-limit=1G
```

- **Run at whatever `level` the project's `phpstan.neon` already sets.** Real Xefi backends run at **level 7** with a `phpstan-baseline.neon` for existing debt and a project-specific ruleset include (e.g. `xefi/phpstan-xefi-rules`) — don't second-guess an established level, and don't add new baseline entries to make a new file pass. If the level is uncomfortably strict for a specific line, fix the type, don't suppress it.
- **`declare(strict_types=1);`** at the top of every file you write or touch — the direct counterpart of the JS guides' "no `any`" rule.
- **Type factories and fixtures from the real Model/Resource/DTO**, never a bare untyped array — same anti-mock-drift principle as the front doctrine: a factory that has drifted from the real schema should fail at analysis time, not silently green a test against a shape that no longer exists.
- If the project has **no** static-analysis tool configured, skip this step entirely — don't push PHPStan onto a project that hasn't opted in (same rule as the front doctrine's cleaner: optional, never installed without asking).
- **Point `paths` at `tests/` too, not just `app/`.** If `phpstan.neon` only scans `app`, the test suite itself never gets checked — and running it for real against a test suite surfaces genuine errors the `app`-only scope misses: `collect($response->json(...))` unable to resolve its template type (fix: cast to `(array)` first), and — if Pest is present — Larastan not recognizing a Pest closure's bound `$this` as the project's `TestCase` (fix: an explicit `/** @var \Tests\TestCase $this */` docblock at the top of the closure). Both are real, not theoretical — verified against a running Lomkit + Pest demo project.

---

## Step 4 — Testing conventions (PHPUnit/Pest, isolation, determinism)

These map directly onto the front doctrine's Step 5.1 (isolate the unit, stay deterministic, don't test the framework) — same principles, PHP idioms:

- **Isolate with a fresh database per test.** Use `LazilyRefreshDatabase` over `RefreshDatabase` where available (skips the migration entirely if the schema is already current — faster, same isolation guarantee); either way, never share database state across tests.
- **Model assertions over raw database assertions.** `assertModelExists($model)` / `assertModelMissing($model)` over `assertDatabaseHas('table', [...])` — more expressive, and it fails with a clearer message when the shape of the row changes.
- **Factory states and sequences, not inline overrides.** `User::factory()->unverified()->create()` reads as intent; `User::factory()->create(['email_verified_at' => null])` doesn't, and duplicates the same override across every test that needs it.
- **`recycle()` to share a relationship instance across nested factories** instead of letting each factory call mint its own — otherwise "the same conceptual entity" silently becomes two different rows and a test that should catch a real relationship bug passes for the wrong reason.
- **Call `Event::fake()` *after* factory setup, never before.** Model factories commonly rely on model events (e.g. a `creating` hook that generates a UUID or a slug) — faking events before the factory call silences those hooks and produces a broken, incompletely-built model. Order matters here in a way it usually doesn't for the JS guides' `vi.useFakeTimers()`.
- **`Exceptions::fake()` over `withoutExceptionHandling()`** when the case is "was this exception reported correctly" rather than "let it bubble up in the test" — lets the request complete normally while still asserting on what got reported.
- **Freeze time with `Carbon::setTestNow()` / `travel()`** for anything date-dependent — same rule as the front doctrine's `vi.useFakeTimers()`, same reasoning (a boundary tested only far from the threshold still passes if the constant silently changes).
- **Mock outbound HTTP with `Http::fake()`**, queue/mail/events with `Queue::fake()`/`Mail::fake()`/`Event::fake()` (mind the ordering rule above) — never hit a real external endpoint from a test.
- **Don't test the framework.** Don't write a case asserting that an Eloquent relationship loads, that a migration runs, or that a third-party package's own internals behave as documented — that's the package's own test suite's job. Test **your** Policies, **your** validation rules, **your** custom Resource/Action/Instruction logic.

---

## Step 5 — Write the tests

### Step 5.0 — Plan in `task-test.md` first, then execute block by block

Identical process to the front doctrine, PHP-flavored:

1. **List every unit under test** — every Model's business logic, every Policy, every custom Action/Job/Listener, every Controller/Resource endpoint that isn't purely framework CRUD, grouped **one block per unit**. Include units that already have tests — audit them (see the front doctrine's "Existing tests" rule, unchanged here).
2. **Read the unit's full source end to end** before enumerating cases — every branch, every guard, every collaborator it calls.
3. **Enumerate every case as a checkbox**: every input partition, every conditional branch, every state (success/empty/error), every validation rule (valid **and** invalid input), every guard the code already contains, and — critically — **every authorization gate** (see Step 5.2: this needs a full persona matrix, not one happy-path user).
4. Note the layer (unit/feature) and, if the unit is Lomkit-exposed, the endpoint(s) involved.

### Step 5.0bis — The category checklist (don't stop at permissions)

The persona matrix (Step 5.2) is the highest-value category because it's where refused-access bugs hide, but a unit's `task-test.md` block is not exhaustive until every category below has been considered for it — tick "N/A" explicitly rather than silently skipping one:

- **Authorization** — the persona matrix (Step 5.2).
- **Validation** — every rule in the FormRequest/`$request->validate()` call, both the valid case and *each* invalid case (missing, wrong type, out of range, duplicate-when-unique) — one case per rule, not one "invalid payload" catch-all.
- **Business/state logic** — every branch and every state transition the unit's own code contains (not the framework's), including the empty/error/edge states, not just the success path.
- **Isolation** — no test may depend on wall-clock time (`Carbon::setTestNow()`), a real external HTTP call (`Http::fake()` with typed fixtures), or a real queue/mail/notification dispatch (`Bus::fake()`/`Mail::fake()`/`Notification::fake()`) — assert the fake was dispatched with the right arguments, don't let it actually fire.
- **Data integrity** — unique constraints, cascade/restrict deletes, foreign-key-required relations — assert via the database, not just the model in memory (`assertModelExists`/`assertDatabaseHas`).
- **Multi-role aggregation** — already required by Step 5.2's last bullet; re-checked here so it isn't missed for a unit that looks single-role at first read.
- **Optional-module cases** — Lomkit structural whitelist (422) and Policy gate (403) as two separate cases (see the Lomkit guide) if the unit is Lomkit-exposed; row-scoping if `laravel-access-control` is present.

A block that only has "authorization: ✅" ticked and nothing else considered is not done — it's one category out of several, and the coverage floor (Step 6) will not catch a category that was never written as a case in the first place.

### Step 5.1 — Execute each block

Same discipline as the front doctrine: one assertion-bearing test per checkbox, `declare(strict_types=1)`, run the block, tick the checkbox, hand it to an independent reviewer before committing (see the `test-writer-back`/`test-reviewer-back` agents). No comments in the test files — intent lives in the test/method names, not in `// arrange / act / assert` banners.

### Step 5.2 — Permission-gated units: the persona matrix

Directly ported from the front doctrine's Step 5.2 — same reasoning, same weighting toward refused cells, PHP-specific mechanics:

**Build a persona catalog via factories, minted fresh per test.** Never mutate a single seeded user's role/permissions mid-test to represent a different persona — that user carries state (cached policy results, loaded relations) from its prior persona that doesn't exist in reality. Mint a new `User::factory()->...->create()` per persona instead.

- **With `spatie/laravel-permission`:** `User::factory()->create()->givePermissionTo('view global users')` (or `->assignRole('admin')`), one factory call per persona, per test.
- **Without it:** drive whatever the project actually uses — a `role` column, a bespoke `Gate::define()` check — as long as it's a real input the test controls, not a hardcoded assumption baked into the test helper.

**Drive the gate directly, assert the observable outcome.** `Gate::allows('update', $model)` / `$this->actingAs($persona)->patchJson(...)->assertForbidden()` — assert what the system does (200/403, field present/absent), never "does this persona hold permission X" (that just re-tests the permission package's own resolution, see "don't test the framework").

- **Weight the matrix on the refused cells.** For every gated capability, at least one persona that must be **denied** — that's where the bugs live, not in the already-easy "this persona is allowed" case.
- **The expected outcome comes from the plan, never from the app's own check.** Computing "expected = what `Gate::allows()` returns" and asserting against `Gate::allows()` is circular — if the gate itself is wrong, the test greens over the bug.
- **Assert every enforcement layer.** If both a Policy (record-level, `Gate::authorize` → 403) and a package-level structural check (e.g. Lomkit's field/relation whitelist → 422, see the Lomkit guide) exist for the same capability, assert both — a UI/API that hides a field while the underlying query still returns it is exactly the bug this step exists to catch.
- **A capability that rides a secondary/aggregated role needs its own unit case.** A persona catalog that only exercises single-role personas never surfaces a bug in how rights *combine* — mint at least one persona whose access to a given capability comes from a non-primary role and assert it still works.
- **If you cannot drive the persona/gate at all, stop and say so** — don't fake a green test locked to a single default persona.

---

## Step 6 — Verify (do not skip)

1. **Run the tests** — `vendor/bin/phpunit` or `vendor/bin/pest`; they must pass.
2. **Run static analysis**, if present — `vendor/bin/phpstan analyse`; must be clean at the project's configured level.
3. **Run coverage and enforce the floor:**
   ```bash
   vendor/bin/phpunit --coverage-text --coverage-filter=app
   # or: vendor/bin/pest --coverage --min=80
   ```
   If coverage is below the floor, that maps to cases missing from `task-test.md` — go back to Step 5.0, don't lower the threshold.

---

## Guardrails

- Do **not** assume Lomkit, `laravel-access-control`, `spatie/laravel-permission`, or any org-specific PHPStan ruleset is present — detect via `composer.json` (Step 1) and skip the module cleanly if it isn't.
- Do **not** invent a persona catalog helper that hardcodes one project's permission package API — build it from what the target project actually uses.
- Do **not** write comments in the test files (or any code you touch) — same rule as the front doctrine, unchanged: intent lives in test/method names.
- Do **not** stop at the happy path, and do **not** skip the `task-test.md` plan — same reasoning as the front doctrine.
- Do **not** ship loosely-typed tests — `declare(strict_types=1)`, typed factories/fixtures, and (if Larastan/PHPStan is present) a clean analysis run.
- Do **not** lower or disable the coverage floor to make the suite pass.
- Do **not** test a permission-gated unit under a single persona. Build the matrix (Step 5.2), dense on the refused cells, asserting every enforcement layer.
- Do **not** compute a case's expected result from the app's own gate check and assert against it — that's circular.
- Do **not** call `Event::fake()` before factory setup — it silences the model events factories often depend on.
- Do **not** mutate a single seeded user's role/permissions to represent multiple personas in one test — mint a fresh persona per test instead.
- Do **not** test the framework or a third-party package's own internals — test your Policies, your validation, your custom Resource/Action/Instruction logic only.
