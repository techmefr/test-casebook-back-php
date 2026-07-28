# Changelog

## 0.1.0

- **Initial release.** `AGENTS.md` (core doctrine: detect stack, confirm PHPUnit/Pest, static analysis if present, plan-first `task-test.md`, persona matrix for permission-gated units, coverage floor, review gate), `docs/strategy.md`, `docs/conventions.md`, `docs/testing-guide/lomkit.md` (optional module — verified against `lomkit/laravel-rest-api`'s actual source: the 422 structural-whitelist layer vs the 403 Policy-gate layer are two distinct things, not one), `.claude/skills/test-casebook-back/`, `.claude/agents/{test-writer-back,test-reviewer-back}`, the plan-gate hook, and `bin/casebook-back-init.php`. Calibrated against real conventions found in `skera-api`, `nexeren-api`, and `platform-api` (PHPUnit not Pest, Larastan level 7, `spatie/laravel-permission`, `xefi/phpstan-xefi-rules`) rather than assumed.
