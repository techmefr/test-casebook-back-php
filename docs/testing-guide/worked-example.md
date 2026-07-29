# Worked example — an Article API with roles and a private article

> Verified for real: fresh `laravel/laravel` project, `spatie/laravel-permission` for roles, plain PHPUnit (no Pest, no Lomkit — the core doctrine, no optional module), run inside Docker (`php:8.4-cli`) since there's no native PHP on the build host. **32/32 tests green (11 unit + 21 feature), Larastan level 7 clean.** This isn't a plausible-looking example — every assertion below actually ran.

## The scenario

A REST API for articles (`GET/POST/PUT/DELETE /api/articles`) with four personas:

- **admin** — sees and can act on every article, public or private.
- **author (owner)** — can create articles, and update/delete their own.
- **author (outsider)** — same role, but not the owner of the article under test — must be refused on someone else's private article and on someone else's article for update/delete.
- **plain user** — can read public articles but can't create one.
- **guest** — no session at all; every endpoint must reject with 401.

One article is `is_private = true`, visible only to its owner and to admins — this is the dense, refused-cells-heavy case the persona matrix exists to catch.

## The Policy — the actual authorization surface

```php
class ArticlePolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Article $article): bool
    {
        if (! $article->is_private) {
            return true;
        }

        return $user->hasRole('admin') || $user->id === $article->user_id;
    }

    public function create(User $user): bool
    {
        return $user->hasAnyRole(['admin', 'author']);
    }

    public function update(User $user, Article $article): bool
    {
        return $user->hasRole('admin') || $user->id === $article->user_id;
    }

    public function delete(User $user, Article $article): bool
    {
        return $user->hasRole('admin') || $user->id === $article->user_id;
    }
}
```

The controller calls `$this->authorize(...)` per action, and filters the `index` listing through `Gate::allows('view', $article)` per row rather than trusting a single blanket check — this is the same principle as Lomkit's per-row `gates`, without Lomkit.

## The persona-matrix test — dense on the refused cells

```php
class ArticlePermissionTest extends TestCase
{
    use LazilyRefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['name' => 'admin']);
        Role::create(['name' => 'author']);
        Role::create(['name' => 'user']);
    }

    #[Test]
    public function outsider_cannot_view_someone_elses_private_article(): void
    {
        $owner = User::factory()->create()->assignRole('author');
        $outsider = User::factory()->create()->assignRole('author');
        $private = Article::factory()->for($owner)->private()->create();

        $this->actingAs($outsider)
            ->getJson("/api/articles/{$private->id}")
            ->assertForbidden();
    }

    #[Test]
    public function guest_is_rejected_on_every_endpoint(): void
    {
        $owner = User::factory()->create()->assignRole('author');
        $article = Article::factory()->for($owner)->create();

        $this->getJson('/api/articles')->assertUnauthorized();
        $this->getJson("/api/articles/{$article->id}")->assertUnauthorized();
        $this->postJson('/api/articles', ['title' => 'x', 'body' => 'y'])->assertUnauthorized();
        $this->putJson("/api/articles/{$article->id}", ['title' => 'z'])->assertUnauthorized();
        $this->deleteJson("/api/articles/{$article->id}")->assertUnauthorized();
    }
}
```

Full matrix actually run (14 feature tests, HTTP end-to-end): index visibility for admin vs. an outsider author, view of a private article for owner / admin / outsider / plain user, guest rejection across all five endpoints in one test, create allowed for author and refused for plain user, update/delete allowed for owner and admin and refused for an outsider — with `assertModelExists`/`assertModelMissing` confirming refusal actually left the row untouched, not just the response code.

## The unit-level counterpart — the same matrix, without HTTP

The feature tests above prove the endpoint behaves correctly, but they exercise routing, middleware, and the controller on every case — slower, and a failure there doesn't tell you whether the bug is in the Policy or somewhere else in the stack. `tests/Unit/ArticlePolicyTest.php` drives `ArticlePolicy` directly, `new ArticlePolicy()`, no HTTP, no `actingAs()`:

```php
class ArticlePolicyTest extends TestCase
{
    use LazilyRefreshDatabase;

    private ArticlePolicy $policy;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['name' => 'admin']);
        Role::create(['name' => 'author']);
        Role::create(['name' => 'user']);
        $this->policy = new ArticlePolicy();
    }

    #[Test]
    public function view_denies_an_outsider_on_someone_elses_private_article(): void
    {
        $owner = User::factory()->create()->assignRole('author');
        $outsider = User::factory()->create()->assignRole('author');
        $private = Article::factory()->for($owner)->private()->create();

        $this->assertFalse($this->policy->view($outsider, $private));
    }
}
```

9 unit tests run this way, same personas, same refused-cell weighting, against `view`/`create`/`update`/`delete` — all green. This is the same distinction the doctrine's Step 5.0 refers to as "unit/feature" layers: the feature suite is the one that must exist (it's what a client actually experiences), the unit suite is the one that pinpoints a failure fast and runs faster in CI — write both when a Policy or another pure-logic unit is involved, not just the feature layer.

Notes that came out of actually running this, not from guessing:
- **`Controller` needs the `AuthorizesRequests` trait explicitly** — the Laravel 11+ skeleton's base `Controller` is empty; `$this->authorize()` throws `Call to undefined method` until you add `use Illuminate\Foundation\Auth\Access\AuthorizesRequests;`. Worth checking before writing the first authorization test against a fresh skeleton.
- **`assignRole()` returns `$this`**, so `User::factory()->create()->assignRole('author')` is safe to chain directly into a persona variable — no need for a separate statement.
- Personas are named `$admin` / `$owner` / `$outsider` / `$plainUser`, never `$user1`/`$user2` — see [`docs/conventions.md`](../conventions.md).

## The static-analysis gate — also actually run

Larastan at level 7 (the level found in `skera-api`/`nexeren-api`/`platform-api`) failed first with 8 real errors: missing return types on every controller action, and missing generic type-hints on `HasFactory`/`BelongsTo`/`HasMany` (`missingType.generics`). Fixing those (explicit `: JsonResponse` return types, `@return BelongsTo<User, $this>`-style PHPDoc on relations, `@use HasFactory<ArticleFactory>`) brought it to a clean `[OK] No errors` — confirming the "definition of done" in `AGENTS.md` isn't just a suggestion, a real skeleton fails it out of the box.

## How to reproduce this yourself (no native PHP needed)

Everything above was built and run with only Docker on the host — no local PHP/Composer install. From an empty directory:

```bash
# 1. fresh Laravel project
docker run --rm -v $(pwd):/app -w /app composer:2 composer create-project laravel/laravel . --prefer-dist -q
docker run --rm -v $(pwd):/app -w /app composer:2 chown -R 1000:1000 /app

# 2. roles package
docker run --rm -v $(pwd):/app -w /app composer:2 composer require spatie/laravel-permission -q
docker run --rm -v $(pwd):/app -w /app php:8.4-cli php artisan vendor:publish --provider='Spatie\Permission\PermissionServiceProvider'

# 3. (create migration/model/policy/controller/routes/factory/test — see the code blocks above and in this repo's own demo, not shipped as files in test-casebook-back itself)

# 4. wire routes/api.php into bootstrap/app.php:
#    ->withRouting(web: ..., api: __DIR__.'/../routes/api.php', commands: ..., health: '/up')

# 5. run the suite
docker run --rm -v $(pwd):/app -w /app php:8.4-cli php artisan test --filter=ArticlePermissionTest

# 6. static analysis (needs larastan/larastan in require-dev and a phpstan.neon at level 7)
docker run --rm -v $(pwd):/app -w /app composer:2 composer require --dev larastan/larastan -q
docker run --rm -v $(pwd):/app -w /app php:8.4-cli vendor/bin/phpstan analyse --memory-limit=512M
```

Use `php:8.4-cli` specifically — `php:8.3-cli` fails on `composer create-project laravel/laravel` because current Laravel requires PHP ≥ 8.4.1. After any container-run command, `chown -R 1000:1000 /app` (via the `composer:2` image) if you hit `Permission denied` writing new files — the official images run as root.

## Validation — every rule, both directions

`ArticleValidationTest` (7 tests) asserts each `store`/`update` validation rule on both sides: a missing required field, a wrong-typed field (`title` as an array, `is_private` as a non-boolean string), and the valid case — using `assertJsonValidationErrors('field')` to name exactly which rule fired, not just a blanket `assertUnprocessable()`. Catching *which* field failed matters: a test that only checks the 422 status would still pass if the wrong rule silently swallowed a real validation gap.

## Multi-role aggregation — access via a secondary role

Two cases in `ArticlePolicyTest` mint a persona whose access to a capability comes from a **secondary** role rather than a single defining one — the case `AGENTS.md`'s Step 5.2 explicitly calls out as often missing:

```php
#[Test]
public function create_is_allowed_via_a_secondary_author_role_on_a_primarily_plain_user(): void
{
    $userWithSecondaryAuthorRole = User::factory()->create();
    $userWithSecondaryAuthorRole->assignRole(['user', 'author']);

    $this->assertTrue($this->policy->create($userWithSecondaryAuthorRole));
}
```

A persona catalog that only ever mints single-role users (`assignRole('author')`) would never have caught a bug in how `hasAnyRole()` or a bespoke aggregation combines rights — this is exactly the case that closes that blind spot.

## Honest scope of what this example actually exercises

Of the category checklist in `AGENTS.md` Step 5.0bis, this example drives **Authorization** (unit + feature), **Validation**, and **Multi-role aggregation** end to end — 32/32 green. **Isolation** (`travelTo()`, `Notification::fake()`, `recycle()`) is now also exercised for real, in the expanded [`blog-worked-example.md`](blog-worked-example.md) rather than here — this scenario had no time-dependent rule or external side effect to justify it, so the isolation cases live where a real need for them exists instead of being bolted on artificially.

What's still documented in the doctrine but **not yet demonstrated running for real** in this repo:

Lomkit's two-layer distinction is now also run for real — see the "Verified for real" section in [`docs/testing-guide/lomkit.md`](lomkit.md), which converted this same blog project to `lomkit/laravel-rest-api` + `lomkit/laravel-access-control` and found real bugs the source-reading pass alone didn't catch (a dangling-transaction bug in Lomkit's own `mutate()`, and a container-state leak when two Lomkit requests hit the same endpoint in one test method).

Treat this worked example, `blog-worked-example.md`, and `lomkit.md`'s verified section together as proof that every category in `AGENTS.md` Step 5.0bis — Authorization, Validation, Multi-role aggregation, Isolation, and the Lomkit optional module — has now been run for real, not just documented from reading source.

Four more things `AGENTS.md` asserts but this repo hadn't actually run, now also verified for real against the same accumulated demo (63-test Lomkit-converted blog project):

- **The 80% coverage floor is genuinely met, not just assumed.** `vendor/bin/phpunit --coverage-text` (pcov, run in Docker) reports **90.6% lines, 83.33% methods, 81.82% classes** — every app file at 100% except `ArticleResource` (78.9% lines — a few untested branches in `mutating()`) and Lomkit's own generated `Resource` base class (40% — untouched boilerplate). One caveat found while measuring: `php artisan test --coverage-text` (the exact flag combination this doc used to recommend) silently prints **no coverage table at all**, with exit code 0 — Laravel's `test` wrapper only renders the report for the plain `--coverage` flag, not `--coverage-text`. Use `--coverage` (or call `vendor/bin/phpunit --coverage-text` directly) — `AGENTS.md`'s own command already says `--coverage`, so this is a warning about a similar-looking flag, not a doctrine bug.
- **The Pest path actually runs, not just plain PHPUnit.** Installed `pestphp/pest` + `pestphp/pest-plugin-laravel` into the demo, ran `vendor/bin/pest --init`, wrote one real `it(...)`/`expect()` test — it ran green alongside all 63 existing plain-PHPUnit `#[Test]` classes in the same `php artisan test` invocation (64/64), confirming Pest really does run on top of PHPUnit rather than needing a separate suite.
- **Larastan scanning `tests/` (not just `app/`) surfaces real errors.** See `AGENTS.md` Step 3's new note — `collect($response->json(...))` and Pest's unbound `$this` are genuine, fixable gaps a static-analysis pass over `app/` alone would never catch.
- **The `test-casebook-back-gate.mjs` hook re-tested against this final, fully-accumulated project** (not just the minimal skeleton it was first tried against): still correctly blocks a `PreToolUse` write to a new `*Test.php` under `tests/` when no `task-test.md` exists anywhere above it (exit 2, clear message), still allows it the moment one is added anywhere up the directory chain (exit 0), and still no-ops on non-test files (exit 0) — even though this demo project isn't itself a git repo, so the hook's "stop climbing at `.git`" bound is exercised all the way to filesystem root without ever firing, which is a correctness edge case, not a bug.

## What this confirms about the core doctrine

- The persona-matrix approach works with **plain PHPUnit, no Lomkit, no Pest** — the core (`AGENTS.md` Steps 1–6) doesn't need any optional module to produce a dense, real permission suite.
- `spatie/laravel-permission`'s `hasRole`/`hasAnyRole` compose cleanly with a standard Laravel Policy — nothing back-doctrine-specific was needed to wire that up.
- The static-analysis gate catches real omissions (return types, generics) that the test suite alone doesn't — both pillars are necessary, matching the front doctrine's PHPStan/tsc gate.
