# Strategy — Why This Doctrine, Ported to the Backend

## The problem test-casebook (front) solves

A test suite that only exercises the happy path, mocks nothing deterministically, and authenticates as the same single user every time doesn't catch the bugs that matter: the refused permission state, the error branch, the race condition, the mock that's drifted from reality.

## Why the backend needs the same discipline, not a lighter version

An API has no DOM to select on, no CSS classes to accidentally couple a test to — so it's tempting to assume backend tests are inherently more robust. They aren't automatically: a Laravel/Lomkit backend has its own equivalent failure modes:

| Front failure mode | Backend equivalent |
|---|---|
| Selecting on CSS class/text instead of `data-test-*` | Asserting on a whole-response snapshot instead of the specific keys/status that matter |
| Testing only one permission state | Testing only one persona (usually an implicit admin/superuser) |
| A network mock that's drifted from the real API contract | A factory that's drifted from the real Model/Resource schema |
| Shared mutable test state (the same store instance) | The same seeded user mutated mid-test to represent different personas |
| No coverage floor, no enforced gate | No `phpstan.neon` level enforced, no coverage floor, tests merged without review |

The **stable selector** that replaces `data-test-*` on the backend is simpler and already free: it's the response contract itself — the JSON keys, the HTTP status code, the Policy ability name. Nothing to strip in production, nothing to invent.

## Why a persona matrix matters more here, not less

A JSON API is very often **the** enforcement boundary — if the backend gets a permission wrong, there's no client-side layer to (accidentally) catch it. This is why `AGENTS.md` Step 5.2 is not an optional nice-to-have here: a Laravel backend's Policies and Gates *are* the authorization system, and a test suite that never drives a refused persona has effectively never tested authorization at all — only that the happy path is reachable.

## Why this is a separate repo from `test-casebook`

1. **No shared distribution mechanism.** `npx` is Node; Composer is PHP. Forcing one scaffolder to cover both means either two code paths in one package or a worse experience for one side.
2. **No shared runner or static-analysis tool.** Vitest/Playwright/ESLint have no PHP equivalent story that reads naturally next to PHPUnit/Pest/PHPStan.
3. **Different governance.** Backend coverage floors, PHPStan levels, and required rulesets are commonly owned by a different lead than the frontend's — a single repo would have to represent two governance models in one file.
4. **Not every backend uses the same packages.** Lomkit, `laravel-access-control`, and an org-specific PHPStan ruleset are real and valuable at Xefi, but assuming them in `AGENTS.md`'s core steps would make this doctrine useless to any Laravel team that doesn't run that exact stack — hence they're optional modules (see `AGENTS.md`'s "Core vs optional" table), detected via `composer.json`, never assumed.

What does **not** change across the two repos: the method itself. Plan first (`task-test.md`), enumerate every case by reading the source, isolate and stay deterministic, weight the matrix on refused cells, gate every block with an independent reviewer, enforce a coverage floor that fails the build. That's one doctrine with two bodies of tooling-specific detail, not two doctrines.
