# test-casebook-back

**A playbook that stops an AI from writing happy-path-only tests for your PHP backend.**

Most "AI, write my tests" runs stop at a few green checks and a coverage number that looks fine on paper — with permissions, edge cases, and refused-access paths left untested. `test-casebook-back` forces an agent to plan every case from the source *before* writing anything, weight the persona matrix on what gets *refused* (not just what's allowed), gate every block behind an independent review, and hold a real coverage floor.

It's not theory — it's been run for real, end to end, on five PHP frameworks:

| Framework | Tests | Static analysis | Coverage | One real thing it found |
|---|---|---|---|---|
| Laravel + Lomkit | 63/63 | Larastan lvl 7 clean | — | a dangling-transaction bug in Lomkit's own `mutate()` |
| Symfony 8.1 | 45/45 | PHPStan lvl 7 clean | 93.12% | DI-based clock sidesteps the fake-timers hazard entirely |
| Slim 4 | 47/47 | PHPStan lvl 7 clean | 96.75% | ships with **no** routing/error middleware by default |
| Mezzio | 48/48 | PHPStan lvl 7 clean | 97.66% | 404 and 405 collapse into one failure unless checked explicitly |
| CodeIgniter 4 | 48/48 | PHPStan lvl 7 clean | 97.35% | router has no concept of 405 at all — wrong verb reads as 404 |

Full receipts, including the bugs and the fixes, in [`docs/testing-guide/`](docs/testing-guide/).

## Quickstart

```bash
# from a checkout of this repo, targeting your project as cwd
php bin/casebook-back-init.php init --force

# then, in Claude Code, opened on your project:
# invoke the `test-casebook-back` skill
```

That scaffolds `AGENTS.md`, `docs/`, and `.claude/` into your project. From there an agent detects your stack (Laravel? Symfony? plain PHPUnit?) and follows the playbook — see the detection table below for what changes per framework.

## Real projects — testing starts soon, get involved

This doctrine is about to be run for real against actual open-source PHP projects, not synthetic demos, with results (and hopefully PRs back to maintainers) published as they land.

- **Suggest a project** — open an issue: a link and why it's a good candidate.
- **Run it yourself** — scaffold it into your own project and report back what it found.
- **Volunteer your project** — if you maintain a PHP backend and don't mind an experimental test suite showing up as a PR, say so.

## Core vs optional — not a Laravel-only or Lomkit-only doctrine

The **core** (`AGENTS.md` Steps 1–6) applies to **any PHP backend** — plain PHPUnit, no framework assumptions. A few things are detected and applied **only if present** in `composer.json`:

| Detected via `composer.json` | If present | If absent |
|---|---|---|
| `laravel/framework` | Policies/Gates, Eloquent factories, `spatie/laravel-permission` for roles | Adapt to the project's own framework (Symfony Voters, bespoke auth) |
| `symfony/framework-bundle` | Voters, `AbstractAuthenticator`, Serializer+Validator, `ClockInterface`/`MockClock` (DI-based, no fake-timers hazard) | N/A |
| `pestphp/pest` (Laravel only) | Use Pest syntax | Default: plain PHPUnit test classes |
| `larastan/larastan` / `phpstan/phpstan` | Static analysis is part of the definition of done | Skip that check entirely |
| `spatie/laravel-permission` | Build personas via `givePermissionTo`/`assignRole` | Build personas from whatever the project actually uses |
| `lomkit/laravel-rest-api` | Also read [`docs/testing-guide/lomkit.md`](docs/testing-guide/lomkit.md) — field/relation whitelisting, search/mutate cases | Skip the guide entirely |
| `lomkit/laravel-access-control` | Treat row-level scoping as a third enforcement layer | N/A |
| `dama/doctrine-test-bundle` (Symfony) | Per-test transaction rollback is automatic | Reset schema/data explicitly between tests |
| `slim/slim` | No bundled ORM/auth/validation — test via `$app->handle($request)` directly | N/A |
| `mezzio/mezzio` | Build/test a `MiddlewarePipe` directly; 404 vs 405 needs an explicit `RouteResult::isMethodFailure()` check | N/A |
| `codeigniter4/framework` | Test via `FeatureTestTrait`; `ext-intl` is a hard install requirement; router has no 405 concept; unmatched routes need `set404Override` registered | N/A |

**Not every PHP backend runs Laravel or Lomkit.** Those are real and valuable at Xefi, but a plain framework + test-runner project gets the full core method without being handed instructions for packages it doesn't have.

## What's inside

- **`AGENTS.md`** — the playbook itself.
- **`.claude/skills/test-casebook-back/`** + **`.claude/agents/{test-writer-back,test-reviewer-back}`** — orchestrates plan → write → review → commit.
- **`.claude/hooks/test-casebook-back-gate.mjs`** — a Claude Code `PreToolUse` hook that blocks writing to a `*Test.php` file until a `task-test.md` plan exists above it.
- **`docs/strategy.md`** — why this doctrine, and why it's a separate repo from the frontend one.
- **`docs/conventions.md`** — test naming, the `task-test.md` shape, persona naming.
- **`docs/testing-guide/`** — one file per worked example (`worked-example.md`, `blog-worked-example.md`, `lomkit.md`, `symfony.md`, `slim.md`, `mezzio.md`, `codeigniter4.md`), each with the full run: commands, numbers, and the real bugs found.
- **`bin/casebook-back-init.php`** — the scaffolder used above.

## How it's consumed

- **Claude Code skill + sub-agents** — the primary path, shown in Quickstart.
- **Scaffolder alone** — `php bin/casebook-back-init.php init [--force]`.
- **Docs directly** — hand `AGENTS.md` (and the relevant `docs/testing-guide/*.md`) to any agent.

No installable Composer package yet (no service provider, no `artisan casebook:init` wrapper) — a natural fast-follow once this repo has seen real use.

## Contributing

Same spirit as the frontend repo: contributions are welcome, no permission needed. If a rule here doesn't match your project's reality, or you've built something similar for a different backend stack, open an issue or a PR — verify against the real tool before proposing a fix, don't guess.

## License

MIT
