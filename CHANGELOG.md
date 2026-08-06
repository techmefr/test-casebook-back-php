# Changelog

## 0.14.0

- **Published on npm as `test-casebook-back-php`** — `npx test-casebook-back-php init --force` from a project root, or `npm i -D test-casebook-back-php` to pin a version so an update propagates by bumping the dependency. The published package ships `AGENTS.md`, `docs/`, `bin/`, `composer.json` and the `.claude/` skill and sub-agents.
- **Added `bin/casebook-back-init.mjs`**, a thin Node wrapper that locates a PHP binary (`PHP_BINARY` honoured) and forwards its arguments to `bin/casebook-back-init.php` unchanged, so the `npx` path and the direct `php bin/…` path run the exact same scaffolder. It fails with an explicit message and the direct command when no PHP binary is found.
- **Not on Packagist, and not planned.** What this repo distributes is a doctrine plus a Claude Code skill, not PHP runtime code — nothing in it is ever autoloaded, so there is no service provider and no `artisan casebook:init` to provide. README's "How it's consumed" updated accordingly.

## 0.13.0

- **Added mutation testing as a new optional Step 7**, detected via `infection/infection`: scoped to permission-gated/business-critical units, thresholds of 70%/50% mutation score, addressing the well-documented gap where line coverage alone lets a suite pass while asserting almost nothing (e.g. a reported 93% coverage / 34% mutation score case).
- **Reviewer (`test-reviewer-back`) now explicitly rejects weak assertions** (`assertNotNull`, bare `assertOk()`, "no exception thrown") and **checks oracle correctness** — the expected value in a test must come from the plan/business rule, never be reverse-engineered from the implementation's own output.
- **Guardrails extended** with the corresponding "do not" rules for weak assertions, circular oracles, and ignoring surviving mutants on gated units.

## 0.12.0

- **Fourth non-Laravel worked example, and the last in this framework queue: CodeIgniter 4.** Built from the official `codeigniter4/appstarter` skeleton — the first framework in this doctrine assembled from a full application shell rather than library-mode primitives. **48/48 tests green (9 unit + 39 functional), PHPStan level 7 clean, 97.35% line coverage** (scoped to code actually written). See [`docs/testing-guide/codeigniter4.md`](docs/testing-guide/codeigniter4.md).
- **Real finding: `ext-intl` is a hard install-time requirement for `codeigniter4/framework`**, not an optional coverage-only extra like `pcov` — `composer create-project` fails outright without it on a fresh `php:8.4-cli`/`composer:2` image. Because every subsequent command (composer, phpunit, phpstan) needed it repeatedly, a small reusable local Docker image (`Dockerfile.test`, intl + pcov baked in once) was built rather than reinstalling on every invocation.
- **Real finding: CodeIgniter 4's router has no method-not-allowed concept at all** — a wrong HTTP verb on a real, registered path (`PUT /articles`, only `GET`/`POST` registered) produces the exact same "no route found" outcome as hitting a path that doesn't exist. Unlike Slim (`HttpMethodNotAllowedException`) and Mezzio (`RouteResult::isMethodFailure()`), CI4's router simply doesn't track the distinction — a genuine negative cross-framework comparison point.
- **Real finding: an unmatched route throws an uncaught `PageNotFoundException` in feature tests** unless `$routes->set404Override(...)` is registered in `app/Config/Routes.php` — `CodeIgniter::display404errors()` only converts the exception into a response when an override exists; otherwise it re-throws, normally caught by the front controller's top-level exception handler in production, but nothing catches it when `FeatureTestTrait::call()` invokes `CodeIgniter::run()` directly. A third, distinct shape of the same lesson Slim's missing-middleware gap and Mezzio's undifferentiated-failure gap already taught: every framework not shipping a fully pre-wired skeleton needs its not-found path tested explicitly.
- **Real finding: the default `phpunit.dist.xml` coverage scope (`./app`) is diluted by ~30 untouched framework-boilerplate `Config/*.php` files**, reporting 76.53% lines overall versus 97.35% once scoped down to the code actually written for this scenario — the same "point coverage/PHPStan paths at your own code" principle `AGENTS.md` already documents for PHPStan, now confirmed for coverage scoping too.
- **`AGENTS.md`/`README.md` updated with a CodeIgniter 4 row** in the core-vs-optional detection tables — completing the confirmed four-framework PHP queue (Symfony, Slim, Mezzio, CodeIgniter 4) alongside the original Laravel worked examples.

## 0.11.0

- **Third non-Laravel worked example: Mezzio (Laminas).** Same blog-idea scenario, built directly against Mezzio's `Laminas\Stratigility\MiddlewarePipe` primitives — no `mezzio-skeleton`, no service container. **48/48 tests green (9 unit + 39 functional), PHPStan level 7 clean, 97.66% line coverage.** See [`docs/testing-guide/mezzio.md`](docs/testing-guide/mezzio.md).
- **Real finding: Mezzio's `DispatchMiddleware` collapses 404 and 405 into one undifferentiated failure** — `RouteResult::process()` delegates both to the same fallback handler with no exception and no automatic status-code distinction; only `RouteResult::isMethodFailure()`, read explicitly from the request attribute, tells them apart. Unlike Slim's loud missing-middleware failure (an uncaught exception impossible to miss), this fails quietly wrong (always 404) if not handled.
- **Real finding: the Slim worked example's entire domain layer (`User`/`Article`/`Comment`/`ArticlePolicy`/`CommentPolicy`/`Validators`) ported to Mezzio with zero code changes** — empirical confirmation that correctly-isolated PHP business/authorization logic is genuinely framework-agnostic, not just claimed to be by the doctrine's existing unit-testing principle.
- **Real finding: `Db::deleteArticle()`'s cascade-delete-comments branch sat uncovered** until a dedicated case (delete an article that already has a comment, assert the comment 404s afterward) was added — the coverage floor forcing a real gap back to the plan, per Step 6, caught for real rather than asserted.
- **Real finding: PHPStan flags an unused closure `use` and a PSR-7 header-array key-type mismatch** (`array<string, string>` vs `array<non-empty-string, array<string>|string>`) — both fixed at the type level rather than suppressed.
- **`AGENTS.md`/`README.md` updated with a Mezzio row** in the core-vs-optional detection tables.

## 0.10.0

- **Second non-Laravel worked example: Slim 4.** Same blog-idea scenario, built on a micro-framework with no bundled ORM/auth/validation — everything hand-rolled (JWT auth via `firebase/php-jwt`, plain-class validators, an in-memory `Db`). **47/47 tests green (9 unit + 38 functional), PHPStan level 7 clean, 96.75% line coverage.** See [`docs/testing-guide/slim.md`](docs/testing-guide/slim.md).
- **Real finding: `AppFactory::create()` ships with no routing/error middleware** — 404/405 propagate as uncaught `Slim\Exception\Http*Exception`s instead of HTTP responses until `$app->addRoutingMiddleware()`/`$app->addErrorMiddleware(...)` are added explicitly. Only surfaced by running the actual not-found/method-not-allowed paths, not the persona-matrix happy path.
- **Real finding: `$app->handle($request)` is a zero-extra-dependency native test mechanism** — Slim's own production entrypoint and its in-process test entrypoint are the same PSR-15 `handle()` method, no separate test-HTTP-client package needed at all.
- **Real finding: PHP has no fake-timer mechanism of any kind**, unlike JS's global `jest.useFakeTimers()` (with its documented hazard list) or Symfony's DI-based `ClockInterface`. The scheduling suite falls back to relative real dates (`new \DateTimeImmutable('+1 day')`) — a genuine three-way split worth naming across the doctrine.
- **Real finding: two PHPDoc tags crammed on one line silently fail to parse** — `/** @param ... @return ... */` on a single line silently dropped the `@return` tag, with PHPStan reporting a missing-type error rather than a syntax error. Fixed by splitting into a standard multi-line docblock.
- **Real finding: `Slim\App`'s container-type generic is declared invariant** — annotating `@return Slim\App<ContainerInterface|null>` produces a self-inflicted "should return X but returns X" error on textually identical types. Fixed with a scoped `ignoreErrors` entry rather than fighting an unwinnable annotation.
- **`AGENTS.md`/`README.md` updated with a Slim row** in the core-vs-optional detection tables.

## 0.9.0

- **First non-Laravel worked example: Symfony 8.1.** Same blog-idea scenario (roles, private article, scheduled publishing, comments + notification), built with Symfony's own idioms: a `Voter` for authorization, a custom `AbstractAuthenticator` for API-token auth, Serializer+Validator for request validation, `dama/doctrine-test-bundle` for per-test isolation. **45/45 tests green (9 unit + 36 functional), PHPStan level 7 clean, 93.12% line coverage.** See [`docs/testing-guide/symfony.md`](docs/testing-guide/symfony.md).
- **Real finding: `Voter::voteOnAttribute()`'s signature gained a `?Vote $vote = null` parameter** in a recent Symfony version — a fatal compile error until fixed, the same category of finding as the doctrine's existing "ORM major-version API drift" note.
- **Real finding: PHPUnit 12+ flags `createMock()` used without `->expects()`** as a code smell ("consider `createStub()` instead") — a genuine tooling behavior change, not a project bug. Pure test doubles now belong to `createStub()`; `createMock()` is reserved for assertions that actually check invocation counts.
- **Real finding: Symfony's DI-based time-mocking (`ClockInterface`/`MockClock`) has no fake-timers-hangs-real-async-plumbing hazard**, unlike every JS framework in the sibling `test-casebook-back-js` doctrine that needed a `doNotFake` list. Because the fake clock is swapped into the container rather than monkey-patching global timer functions, only code that explicitly asks for `ClockInterface` sees fake time — a genuine cross-ecosystem architectural difference worth naming.
- **`AGENTS.md`'s "Core vs optional" restructured to be framework-agnostic** (Laravel and Symfony both detected via `composer.json`, core steps apply to either) rather than assuming Laravel unconditionally — mirrors the multi-framework structure already used by the sibling `test-casebook-back-js` doctrine.

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
