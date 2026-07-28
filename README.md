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
- **`docs/testing-guide/lomkit.md`** — optional module: the two structurally different enforcement layers Lomkit uses (422 structural whitelist vs 403 Policy gate), verified against the package's actual source, not guessed.
- **`bin/casebook-back-init.php`** — scaffolder: copies `AGENTS.md`, `docs/` and `.claude/` into a target project.

## How it's consumed

- **Claude Code skill + sub-agents** — open the target project in Claude Code (with this repo scaffolded into it) and invoke the `test-casebook-back` skill.
- **Scaffolder** — `php bin/casebook-back-init.php init [--force]`, run from a checkout of this repo, targeting your project's working directory as `cwd`.
- **Docs** — hand `AGENTS.md` (and `docs/testing-guide/lomkit.md` if relevant) to any agent directly.

No installable Composer package yet (no service provider, no `artisan casebook:init` wrapper) — see `composer.json`'s `extra.note`. That's a natural fast-follow once this repo has seen real use; not built yet so as not to over-engineer ahead of actual usage.

## Status

Early — built from real conventions found in Xefi's own Laravel/Lomkit backends (`skera-api`, `nexeren-api`, `platform-api`): PHPUnit as the actual runner (not Pest), Larastan at level 7 with a `phpstan-baseline.neon` and the `xefi/phpstan-xefi-rules` package, `spatie/laravel-permission` for roles, `#[Test]` attribute + snake_case method naming. The Lomkit two-layer distinction (422 structural vs 403 Policy) was verified by reading `vendor/lomkit/laravel-rest-api/src` directly, not assumed. Not yet run end-to-end against a real project's test suite the way the frontend doctrine was (see its `docs/testing-guide/laravel.md` worked example) — that's the natural next validation step.

## Contributing

Same spirit as the frontend repo: contributions are welcome, no permission needed. If a rule here doesn't match your project's reality, or you've built something similar for a different backend stack (Symfony, plain PHP, a different REST toolkit), open an issue or a PR — verify against the real tool before proposing a fix, don't guess.

## License

MIT
