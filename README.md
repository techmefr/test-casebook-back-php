# test-casebook-back

> A testing methodology and AI-agent playbook for Laravel backends — exhaustive, strictly-typed, persona-matrix-driven test suites.

`test-casebook-back` is the **backend counterpart** of [`test-casebook`](https://github.com/techmefr/test-casebook) (the frontend/JS doctrine). Same method — plan first, exhaustive not happy-path, isolated and deterministic, permission matrix dense on refused cells, independent review gate, enforced coverage floor — ported to PHP/Laravel. It lives in its **own repo** because the two ecosystems share no distribution mechanism (Composer vs `npx`), no runner (PHPUnit/Pest vs Vitest/Playwright), and no static-analysis tool (PHPStan/Larastan vs `tsc`/ESLint) — see `docs/strategy.md` for the full reasoning.

## Core vs optional — this is not a Lomkit-only doctrine

The **core** (`AGENTS.md` Steps 1–6) applies to **any Laravel project** — plain PHPUnit, no assumptions about which packages you run. A few things are detected and applied **only if present** in the target project's `composer.json`:

| Detected via `composer.json` | If present | If absent |
|---|---|---|
| `pestphp/pest` | Use Pest syntax | Default: plain PHPUnit test classes |
| `larastan/larastan` (or `phpstan/phpstan`) | Static analysis is part of the definition of done | Skip that check entirely |
| `spatie/laravel-permission` | Build personas via `givePermissionTo`/`assignRole` | Build personas from whatever the project actually uses (role column, bespoke Gate) |
| `lomkit/laravel-rest-api` | Also read [`docs/testing-guide/lomkit.md`](docs/testing-guide/lomkit.md) — Resource-specific cases (field/relation whitelisting, search/mutate endpoints) | Nothing in the core steps depends on it — skip the guide entirely |
| `lomkit/laravel-access-control` | Treat row-level scoping as a third enforcement layer (see the Lomkit guide) | N/A |

**Not every Laravel backend runs Lomkit, `laravel-access-control`, or an org-specific PHPStan ruleset.** Those are real and valuable at Xefi, but this doctrine is written so a plain Laravel + PHPUnit project gets the full core method without being handed instructions for packages it doesn't have.

## What's inside

- **`AGENTS.md`** — the playbook. Detect the stack, confirm the runner, run static analysis if present, write tests plan-first with a persona matrix for every gated unit, verify.
- **`.claude/skills/test-casebook-back/`** + **`.claude/agents/{test-writer-back,test-reviewer-back}`** — orchestrates the plan → write → review → commit flow.
- **`.claude/hooks/test-casebook-back-gate.mjs`** — a Claude Code `PreToolUse` hook that blocks writing to a `*Test.php` file under `tests/` until a `task-test.md` plan exists above it. (The hook itself runs on Node — that's how Claude Code hooks work regardless of the target project's language, same as the JS-side `test-casebook` repo's hook.)
- **`docs/strategy.md`** — why this doctrine, and why it's a separate repo from the frontend one.
- **`docs/conventions.md`** — test naming, the `task-test.md` shape, persona naming.
- **`docs/testing-guide/lomkit.md`** — optional module: the two structurally different enforcement layers Lomkit uses (422 structural whitelist vs 403 Policy gate). Verified twice over — first by reading the package source, then for real: `lomkit/laravel-rest-api` + `lomkit/laravel-access-control` installed on the blog project, 63/63 tests green, Larastan level 7 clean, and two real bugs found in the process (see the guide's "Verified for real" section).
- **`docs/testing-guide/worked-example.md`** — a real Article API (roles + a private article), run for real: 32/32 PHPUnit tests green (unit + feature, incl. validation & multi-role), Larastan level 7 clean, no Lomkit involved (core doctrine only).
- **`docs/testing-guide/blog-worked-example.md`** — the full blog idea (visiteur/membre/auteur/admin), scheduled publishing + comments + notification, run for real: 47/47 tests green, Larastan level 7 clean. First real exercise of the isolation rules (`travelTo`, `Notification::fake()`, `recycle()`).
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

## Contributing

Same spirit as the frontend repo: contributions are welcome, no permission needed. If a rule here doesn't match your project's reality, or you've built something similar for a different backend stack (Symfony, plain PHP, a different REST toolkit), open an issue or a PR — verify against the real tool before proposing a fix, don't guess.

## License

MIT
