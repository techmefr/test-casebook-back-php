# test-casebook-back

> A testing methodology and AI-agent playbook for PHP backends — exhaustive, strictly-typed, persona-matrix-driven test suites.

Most "AI, write my tests" runs stop at the happy path: a few green checks, a coverage number that looks fine on paper, and a permission matrix nobody actually built. `test-casebook-back` is a playbook that forces the opposite — plan every case from the source before writing anything, weight the persona matrix on the *refused* cases (not just the allowed ones), gate every block behind an independent review, and hold a real coverage floor. It's been proven on five PHP frameworks (Laravel, Symfony, Slim, Mezzio, CodeIgniter 4) via worked examples — see `docs/testing-guide/` for the receipts.

**What's next:** this doctrine is about to be run for real against actual open-source PHP projects, not synthetic demos, with results (and hopefully PRs) published as they land. If you maintain a PHP project and wouldn't mind being a test subject, or if you want to run this doctrine yourself and compare notes, open an issue or reach out — requests for "please test project X" are very welcome.

`test-casebook-back` is the **backend counterpart** of [`test-casebook`](https://github.com/techmefr/test-casebook) (the frontend/JS doctrine). Same method — plan first, exhaustive not happy-path, isolated and deterministic, permission matrix dense on refused cells, independent review gate, enforced coverage floor — ported to PHP. It lives in its **own repo** because the two ecosystems share no distribution mechanism (Composer vs `npx`), no runner (PHPUnit/Pest vs Vitest/Playwright), and no static-analysis tool (PHPStan/Larastan vs `tsc`/ESLint) — see `docs/strategy.md` for the full reasoning.

## Core vs optional — this is not a Laravel-only or Lomkit-only doctrine

The **core** (`AGENTS.md` Steps 1–6) applies to **any PHP backend** — plain PHPUnit, no assumptions about which framework or packages you run. A few things are detected and applied **only if present** in the target project's `composer.json`:

| Detected via `composer.json` | If present | If absent |
|---|---|---|
| `laravel/framework` | Policies/Gates, Eloquent factories, `spatie/laravel-permission` for roles | Adapt to the project's own framework (Symfony Voters, bespoke auth) |
| `symfony/framework-bundle` | Voters for authorization, a custom `AbstractAuthenticator`, Serializer+Validator for input validation, `ClockInterface`/`MockClock` for time-mocking (DI-based, no fake-timers hazard) | N/A |
| `pestphp/pest` (Laravel only) | Use Pest syntax | Default: plain PHPUnit test classes |
| `larastan/larastan` (or `phpstan/phpstan`) | Static analysis is part of the definition of done | Skip that check entirely |
| `spatie/laravel-permission` | Build personas via `givePermissionTo`/`assignRole` | Build personas from whatever the project actually uses (role column, bespoke Gate/Voter) |
| `lomkit/laravel-rest-api` | Also read [`docs/testing-guide/lomkit.md`](docs/testing-guide/lomkit.md) — Resource-specific cases (field/relation whitelisting, search/mutate endpoints) | Nothing in the core steps depends on it — skip the guide entirely |
| `lomkit/laravel-access-control` | Treat row-level scoping as a third enforcement layer (see the Lomkit guide) | N/A |
| `dama/doctrine-test-bundle` (Symfony) | Per-test transaction rollback is automatic | Reset schema/data explicitly between tests |
| `slim/slim` | No bundled ORM/auth/validation — all hand-rolled; test via `$app->handle($request)` directly, no extra test-HTTP-client package | N/A |
| `mezzio/mezzio` | No bundled ORM/auth/validation, same as Slim; build/test a `MiddlewarePipe` directly; 404 vs 405 needs an explicit `RouteResult::isMethodFailure()` check | N/A |
| `codeigniter4/framework` | Hand-rolled auth via a Filter; test via `FeatureTestTrait`; `ext-intl` is a hard install requirement; router has no 405 concept; unmatched routes need `set404Override` registered or feature tests get an uncaught exception | N/A |

**Not every PHP backend runs Laravel, Lomkit, `laravel-access-control`, or an org-specific PHPStan ruleset.** Those are real and valuable at Xefi, but this doctrine is written so a plain framework + test-runner project gets the full core method without being handed instructions for packages it doesn't have.

## What's inside

- **`AGENTS.md`** — the playbook. Detect the stack, confirm the runner, run static analysis if present, write tests plan-first with a persona matrix for every gated unit, verify.
- **`.claude/skills/test-casebook-back/`** + **`.claude/agents/{test-writer-back,test-reviewer-back}`** — orchestrates the plan → write → review → commit flow.
- **`.claude/hooks/test-casebook-back-gate.mjs`** — a Claude Code `PreToolUse` hook that blocks writing to a `*Test.php` file under `tests/` until a `task-test.md` plan exists above it. (The hook itself runs on Node — that's how Claude Code hooks work regardless of the target project's language, same as the JS-side `test-casebook` repo's hook.)
- **`docs/strategy.md`** — why this doctrine, and why it's a separate repo from the frontend one.
- **`docs/conventions.md`** — test naming, the `task-test.md` shape, persona naming.
- **`docs/testing-guide/lomkit.md`** — optional module: the two structurally different enforcement layers Lomkit uses (422 structural whitelist vs 403 Policy gate). Verified twice over — first by reading the package source, then for real: `lomkit/laravel-rest-api` + `lomkit/laravel-access-control` installed on the blog project, 63/63 tests green, Larastan level 7 clean, and two real bugs found in the process (see the guide's "Verified for real" section).
- **`docs/testing-guide/worked-example.md`** — a real Article API (roles + a private article), run for real: 32/32 PHPUnit tests green (unit + feature, incl. validation & multi-role), Larastan level 7 clean, no Lomkit involved (core doctrine only).
- **`docs/testing-guide/blog-worked-example.md`** — the full blog idea (visiteur/membre/auteur/admin), scheduled publishing + comments + notification, run for real: 47/47 tests green, Larastan level 7 clean. First real exercise of the isolation rules (`travelTo`, `Notification::fake()`, `recycle()`).
- **`docs/testing-guide/symfony.md`** — the first non-Laravel worked example, same scenario on Symfony 8.1 using its own Voter/Authenticator abstractions instead of a Laravel Policy/Gate: 45/45 tests green (9 unit + 36 functional), PHPStan level 7 clean, 93.12% line coverage. Found a real base-class signature change (`Voter::voteOnAttribute()` gained a parameter in a recent Symfony version), a PHPUnit 12 behavior change (`createMock()` without `->expects()` now warns — use `createStub()`), and that Symfony's DI-based time-mocking (`ClockInterface`/`MockClock`) sidesteps the fake-timers-hangs-real-async-plumbing hazard found repeatedly on the JS side, since only code that asks the container for the clock sees fake time.
- **`docs/testing-guide/slim.md`** — a micro-framework worked example with no bundled ORM/auth/validation, everything hand-rolled: 47/47 tests green (9 unit + 38 functional), PHPStan level 7 clean, 96.75% line coverage. Found that `AppFactory::create()` ships with no routing/error middleware (404/405 propagate as uncaught exceptions until `addRoutingMiddleware()`/`addErrorMiddleware()` are added), that Slim's own `$app->handle($request)` is a zero-extra-dependency native test mechanism, and that PHP has no fake-timer mechanism at all (unlike JS's global fake timers or Symfony's DI-based clock).
- **`docs/testing-guide/mezzio.md`** — the Laminas-project micro-framework, built directly against its `MiddlewarePipe` primitives (no service container): 48/48 tests green (9 unit + 39 functional), PHPStan level 7 clean, 97.66% line coverage. Found that Mezzio's `DispatchMiddleware` collapses 404 and 405 into one undifferentiated failure unless `RouteResult::isMethodFailure()` is checked explicitly, and confirmed — by porting it unmodified — that the Slim worked example's domain layer (policies, validators, value objects) is entirely framework-agnostic PHP.
- **`docs/testing-guide/codeigniter4.md`** — built from the official `codeigniter4/appstarter` skeleton, the one framework in this doctrine so far assembled from a full application shell rather than library-mode primitives: 48/48 tests green (9 unit + 39 functional), PHPStan level 7 clean, 97.35% line coverage (scoped to the code actually written). Found that `ext-intl` is a hard install-time requirement (not just a coverage nicety), that CI4's router has no 405 concept at all (a wrong verb on a real path is a plain 404), and that an unmatched route throws an uncaught `PageNotFoundException` in feature tests unless `$routes->set404Override(...)` is registered.
- **`bin/casebook-back-init.php`** — scaffolder: copies `AGENTS.md`, `docs/` and `.claude/` into a target project.

## How it's consumed

- **Claude Code skill + sub-agents** — open the target project in Claude Code (with this repo scaffolded into it) and invoke the `test-casebook-back` skill.
- **Scaffolder** — `php bin/casebook-back-init.php init [--force]`, run from a checkout of this repo, targeting your project's working directory as `cwd`.
- **Docs** — hand `AGENTS.md` (and `docs/testing-guide/lomkit.md` if relevant) to any agent directly.

No installable Composer package yet (no service provider, no `artisan casebook:init` wrapper) — see `composer.json`'s `extra.note`. That's a natural fast-follow once this repo has seen real use; not built yet so as not to over-engineer ahead of actual usage.

## Status

Built from real conventions found in Xefi's own Laravel/Lomkit backends (`skera-api`, `nexeren-api`, `platform-api`): PHPUnit as the actual runner (not Pest), Larastan at level 7 with a `phpstan-baseline.neon` and the `xefi/phpstan-xefi-rules` package, `spatie/laravel-permission` for roles, `#[Test]` attribute + snake_case method naming. Also run end-to-end for real, in three stages on the same growing blog project, executed in Docker throughout:

1. A fresh `laravel/laravel` project with roles and a private article — 32/32 PHPUnit tests green (unit + feature, incl. validation & multi-role), Larastan level 7 clean after fixing the real errors it found. See [`docs/testing-guide/worked-example.md`](docs/testing-guide/worked-example.md).
2. Expanded into the full blog idea (visiteur/membre/auteur/admin, scheduled publishing, comments, notification) to exercise the isolation rules for real — 47/47 green. See [`docs/testing-guide/blog-worked-example.md`](docs/testing-guide/blog-worked-example.md).
3. Converted to `lomkit/laravel-rest-api` + `lomkit/laravel-access-control` — 63/63 green, Larastan level 7 clean, and two real bugs found along the way (a dangling-transaction bug in Lomkit's own `mutate()` on a 403, and a container-state leak when two Lomkit requests hit the same endpoint inside one test method). See [`docs/testing-guide/lomkit.md`](docs/testing-guide/lomkit.md)'s "Verified for real" section.

Every category in `AGENTS.md`'s Step 5.0bis checklist — Authorization, Validation, Multi-role aggregation, Isolation, and the Lomkit optional module — has now been run for real, not just documented from reading source.

Four more claims in this doctrine have since been checked for real against that same demo, not just assumed: the 80% coverage floor is genuinely met (90.6% lines via `pcov`); the Pest path actually runs 64/64 green alongside plain PHPUnit, not just PHPUnit; pointing Larastan at `tests/` as well as `app/` surfaces real, fixable errors (`collect()`'s unresolved template type, Pest's unbound `$this`); and the `test-casebook-back-gate.mjs` hook still correctly blocks/allows test-file writes against the final, fully-accumulated project. See [`docs/testing-guide/worked-example.md`](docs/testing-guide/worked-example.md)'s closing section for the details.

The doctrine has since extended beyond Laravel: a fourth stage built the same Article API scenario on **Symfony 8.1**, Docker-only reproduction recipe, 45/45 tests green, PHPStan level 7 clean, 93.12% line coverage. See [`docs/testing-guide/symfony.md`](docs/testing-guide/symfony.md) — real findings include a Symfony base-class signature change, a PHPUnit 12 mock/stub behavior change, and a genuine architectural advantage of DI-based time-mocking over global fake-timers.

A fifth stage built the same scenario on **Slim 4**, a micro-framework with no bundled ORM/auth/validation at all — everything hand-rolled — 47/47 tests green, PHPStan level 7 clean, 96.75% line coverage. See [`docs/testing-guide/slim.md`](docs/testing-guide/slim.md) — real findings include Slim shipping no routing/error middleware by default (404/405 propagate as uncaught exceptions until added explicitly), a zero-extra-dependency native test mechanism (`$app->handle($request)`), and a three-way cross-ecosystem split on time-mocking (JS's global fake timers with a hazard list, Symfony's DI-based clock with no hazard, and plain PHP's complete absence of any fake-timer mechanism).

A sixth stage built the same scenario on **Mezzio**, the Laminas-project's PSR-15 micro-framework, wired directly against its `MiddlewarePipe` primitives rather than the full skeleton + service-container application shell — 48/48 tests green, PHPStan level 7 clean, 97.66% line coverage. See [`docs/testing-guide/mezzio.md`](docs/testing-guide/mezzio.md) — real findings include Mezzio collapsing 404 and 405 into one undifferentiated routing failure unless `RouteResult::isMethodFailure()` is checked explicitly (a quieter version of Slim's missing-middleware gap — no exception, just the wrong status code if missed), and empirical confirmation that a correctly-isolated PHP domain layer (policies, validators, value objects) is genuinely framework-agnostic: the Slim worked example's domain code was reused byte-for-byte with zero changes.

A seventh and final stage built the same scenario on **CodeIgniter 4**, this time from the official full-application skeleton rather than library-mode primitives — 48/48 tests green, PHPStan level 7 clean, 97.35% line coverage (scoped to the code actually written, after narrowing `phpunit.dist.xml`'s default `<source>` scope away from ~30 untouched framework-boilerplate `Config/*.php` files that were diluting the real figure down to 76.53%). See [`docs/testing-guide/codeigniter4.md`](docs/testing-guide/codeigniter4.md) — real findings include `ext-intl` being a hard install-time requirement (not an optional coverage nicety like `pcov`), CI4's router having no 405 concept at all (a wrong HTTP verb on a real path is indistinguishable from an unmatched route), and an unmatched route throwing an uncaught `PageNotFoundException` in feature tests unless `$routes->set404Override(...)` is registered — a third, distinct shape of the same lesson Slim and Mezzio already surfaced: every framework that doesn't ship a fully-wired skeleton fails its not-found path differently until tested explicitly.

## Contributing

Same spirit as the frontend repo: contributions are welcome, no permission needed. If a rule here doesn't match your project's reality, or you've built something similar for a different backend stack (Symfony, plain PHP, a different REST toolkit), open an issue or a PR — verify against the real tool before proposing a fix, don't guess.

Three ways to get involved right now, before the real-project runs even start:
- **Suggest a project to test** — open an issue with a link and why it'd be a good candidate (real business logic, actively maintained, ideally open to external PRs).
- **Run the doctrine yourself** — scaffold it into your own PHP project, try it, and report back what worked, what didn't, and what it found that you wouldn't have caught otherwise.
- **Volunteer your project** — if you maintain a PHP backend and don't mind an experimental test suite showing up as a PR, say so.

## License

MIT
