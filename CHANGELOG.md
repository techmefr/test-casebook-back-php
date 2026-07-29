# Changelog

## 0.8.0

- **Four more claims checked for real, not just assumed, against the accumulated Lomkit/blog demo:**
  - **Coverage floor**: `vendor/bin/phpunit --coverage-text` (pcov, in Docker) reports 90.6% lines / 83.33% methods / 81.82% classes — the 80% floor is genuinely met. Found along the way: `php artisan test --coverage-text` silently prints no coverage table at all (exit 0) — use `--coverage` instead (already what `AGENTS.md`'s own command uses).
  - **Pest path**: installed `pestphp/pest` + `pestphp/pest-plugin-laravel`, ran `vendor/bin/pest --init`, wrote a real `it(...)`/`expect()` test — 64/64 green alongside the 63 existing plain-PHPUnit classes in one `php artisan test` run.
  - **Larastan on `tests/`**: added `tests` to `phpstan.neon`'s `paths` (previously `app` only) — surfaced two real, fixable errors: `collect($response->json(...))` unable to resolve its template type (fixed with an `(array)` cast), and Larastan not recognizing Pest's bound `$this` as `TestCase` (fixed with an explicit `@var` docblock). `AGENTS.md` Step 3 updated with this note.
  - **Hook re-test**: `test-casebook-back-gate.mjs` re-run against the final, fully-accumulated demo project (previously only tested against a minimal skeleton) — still correctly blocks/allows `*Test.php` writes based on `task-test.md` presence.

## 0.7.0

- **Lomkit's two-layer distinction verified for real, closing the last open gap.** Converted the blog demo to `lomkit/laravel-rest-api ^2.22` + `lomkit/laravel-access-control ^0.5`: a real `ArticleResource` (fields, `createRules`/`updateRules`, a `searchQuery()` override for row-level scoping, a `mutating()` hook to auto-associate the authenticated user on create) driving `search`/`mutate`/`destroy`. Run for real: 63/63 tests green, Larastan level 7 clean.
- Found and documented two real, non-obvious things running it surfaced that reading the source alone hadn't:
  - **A real upstream bug** — `Lomkit\Rest\Concerns\PerformsRestOperations::mutate()` calls `DB::beginTransaction()` manually with no matching rollback on exception; a 403 thrown mid-mutate (exactly the case a persona-matrix "denied" test needs) leaves the transaction open and corrupts the next test's DB state (`cannot start a transaction within a transaction`). Documented with the workaround (`DB::rollBack()` after asserting the 403).
  - **A container-state leak** — two Lomkit requests to the same endpoint inside one PHPUnit test method can silently skip validation on the second call; splitting into one test per persona (already the doctrine's convention) avoids it and is now called out explicitly as a Lomkit-specific reason to follow that rule, not just a style preference.
  - Also documented two real API shape corrections: `destroy` is bulk-by-body (`DELETE /articles` with `{"resources": [...]}`), not a URL segment; `details` returns the Resource's own schema, not a record — fetching one record goes through `search` or `mutate`'s `update`.
- Every category in `AGENTS.md`'s Step 5.0bis checklist (Authorization, Validation, Multi-role aggregation, Isolation, Lomkit) has now been run for real at least once.

## 0.6.0

- **`docs/testing-guide/blog-worked-example.md`** — expanded the worked example into the full blog idea (visiteur/membre/auteur/admin), adding scheduled publishing (`published_at`) and comments with an owner notification. This finally exercises the Isolation category for real: `travelTo()` for the scheduling gate (proves it's actually time-driven, not a factory-default fluke), `Notification::fake()`/`assertSentTo()` for the comment notification, and `recycle()` for sharing one article across several comments (with a regression assertion — `Article::count() === 1` — that would fail if `recycle()` were dropped). Run for real: 47/47 tests green (14 unit + 33 feature), Larastan level 7 clean. Confirms the persona model (visitor/member/author/admin) is coherent end to end. Lomkit remains the only Step 5.0bis category still unverified against a real project.

## 0.5.0

- **Validation and multi-role aggregation added to the worked example** — `ArticleValidationTest` (7 tests) covers every `store`/`update` rule both ways (missing/wrong-typed field vs valid payload), asserting the specific field via `assertJsonValidationErrors`. `ArticlePolicyTest` gained 2 cases minting a persona whose access comes from a secondary role (`assignRole(['user', 'author'])`), not a single defining one. Run for real: 32/32 green, Larastan level 7 still clean. Closes the Validation and Multi-role-aggregation gaps from the previous release's scope note; Isolation mechanics and Lomkit remain the open ones.

## 0.4.0

- **Unit-level counterpart to the worked example** — `ArticlePolicyTest` (9 tests) drives `ArticlePolicy` directly, no HTTP, same persona matrix as the feature suite. Run for real alongside the existing feature suite: 23/23 green, Larastan level 7 still clean. Closes the gap where the example only demonstrated the feature/HTTP layer and never the unit layer the doctrine's Step 5.0 also asks for.

## 0.3.0

- **Configurable coverage floor** — `bin/casebook-back-init.php init --coverage=<1-100>` rewrites the threshold in the scaffolded `AGENTS.md` (default 80%), mirroring the frontend scaffolder's `--coverage` flag. Tested for real: `--coverage=90` correctly updates all three threshold occurrences without corrupting surrounding prose, the default path leaves `80` untouched, and an out-of-range value (`150`) is rejected with a clear error and a non-zero exit code.

## 0.2.0

- **`docs/testing-guide/worked-example.md`** — real end-to-end verification: fresh `laravel/laravel` project, `spatie/laravel-permission` roles, plain PHPUnit (no Pest, no Lomkit — core doctrine only), Article API with a private article, four personas (admin/author-owner/author-outsider/plain-user/guest). Run for real in Docker (`php:8.4-cli`): 14/14 tests green, Larastan level 7 clean (after fixing 8 real errors it found — missing return types and generic type-hints). Confirms the core persona-matrix method works without any optional module.

## 0.1.0

- **Initial release.** `AGENTS.md` (core doctrine: detect stack, confirm PHPUnit/Pest, static analysis if present, plan-first `task-test.md`, persona matrix for permission-gated units, coverage floor, review gate), `docs/strategy.md`, `docs/conventions.md`, `docs/testing-guide/lomkit.md` (optional module — verified against `lomkit/laravel-rest-api`'s actual source: the 422 structural-whitelist layer vs the 403 Policy-gate layer are two distinct things, not one), `.claude/skills/test-casebook-back/`, `.claude/agents/{test-writer-back,test-reviewer-back}`, the plan-gate hook, and `bin/casebook-back-init.php`. Calibrated against real conventions found in `skera-api`, `nexeren-api`, and `platform-api` (PHPUnit not Pest, Larastan level 7, `spatie/laravel-permission`, `xefi/phpstan-xefi-rules`) rather than assumed.
