# Worked example — Symfony

Same scenario as the Laravel [`worked-example.md`](worked-example.md)/[`blog-worked-example.md`](blog-worked-example.md): a blog-style Article API with roles (admin/author/member), a private-article visibility rule, scheduled publishing, and comments that notify the article's owner — this time on Symfony, using its own Voter/Security abstraction instead of a Laravel Policy/Gate.

## Result

**45/45 tests green** (9 unit + 36 functional), PHPStan level 7 clean, **93.12% line coverage** (pcov) — well above the 80% floor.

## The stack, as actually built

- **Symfony 8.1** (`symfony/skeleton` + `symfony/security-bundle` + Doctrine ORM/migrations), PHP 8.4, SQLite for the test database (no separate DB container needed).
- **Authorization via a Voter** (`Symfony\Component\Security\Core\Authorization\Voter\Voter`) — Symfony's own first-class authorization abstraction, auto-tagged `security.voter` by the container the moment a class extends `Voter` (confirmed via `bin/console debug:container`, no manual service-tagging needed). Structurally this is the closest thing in this cross-ecosystem doctrine set to Hapi's own auth-scheme abstraction or a Laravel Policy — a dedicated permission-check class the framework itself dispatches to, not a hook/middleware.
- **A custom `AbstractAuthenticator`** (`ApiTokenAuthenticator`) reading a `Bearer <token>` header and resolving a `User` via a `UserBadge` — Symfony's own idiomatic authentication extension point (no JWT library; a project might swap in `lexik/jwt-authentication-bundle` for real JWTs, but the doctrine's principle — read the project's actual authenticator, don't assume a specific package — applies either way).
- **Symfony's own Serializer + Validator components** for request validation: `$serializer->deserialize($json, Dto::class, 'json', ['allow_extra_attributes' => false])` (the `.strict()`/`allowUnknown: false` equivalent) followed by `$validator->validate($dto)` with `Assert\NotBlank`/`Assert\Type` constraints on plain DTO classes.
- **`Symfony\Component\Clock\ClockInterface` + `MockClock`**, swapped into the container per-test via `static::getContainer()->set(ClockInterface::class, new MockClock($when))` — Symfony's own idiomatic time-mocking mechanism, a direct structural counterpart to Jest's fake timers, but container-based rather than global-monkeypatch-based (see the isolation section below for why this matters).
- **`dama/doctrine-test-bundle`** for per-test transaction isolation (wraps every test in a transaction, rolled back after) — the Symfony ecosystem's equivalent of Laravel's `RefreshDatabase`/`LazilyRefreshDatabase`.
- **PHPUnit's native mock/stub tooling** (`createStub`/`createMock`) for the unit-level Voter tests and the notification-spy functional test — no separate mocking library needed, same as the doctrine's existing PHPUnit convention.
- PHPStan level 7 with `phpstan-symfony` and `phpstan-doctrine` extensions (the Symfony-ecosystem counterpart of Larastan).

## A real finding: `Voter::voteOnAttribute()`'s signature gained a parameter in a recent Symfony version

The first `bin/console debug:container` run failed to compile at all: `Declaration of App\Security\ArticleVoter::voteOnAttribute(...): bool must be compatible with Symfony\Component\Security\Core\Authorization\Voter\Voter::voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token, ?Vote $vote = null): bool`. Symfony 8.1's `Voter` base class added a fourth `?Vote $vote = null` parameter (used for vote-reasoning/debugging) that didn't exist in earlier versions documented in most tutorials. **This is the same category of finding as the doctrine's existing "ORM major-version API drift" note** (a Laravel relations-option shape changing between versions) — a base-class method signature that widened is exactly the kind of break `phpstan`/the compiler catches immediately, and exactly the kind of break copy-pasted-from-older-docs code silently ships without a static-analysis or even compile step. Fixed by adding the parameter to the override.

## A real finding: PHPUnit 12+ flags `createMock()` used without `->expects()` as a code smell

Every unit test using `$this->createMock(TokenInterface::class)` configured only with `->method('getUser')->willReturn(...)` (no `->expects()` call-count assertion) passed, but PHPUnit reported 9 notices: *"No expectations were configured for the mock object... Consider refactoring your test code to use a test stub instead."* This is a real PHPUnit 12 behavior change, not a project bug — the fix is `createStub()` instead of `createMock()` for pure test doubles where only the return value matters, reserving `createMock()` for cases that actually assert invocation counts (like the `CommentNotifier` spy in `CommentsTest`, which correctly uses `createMock()` + `expects(self::once())`). Worth knowing before writing PHPUnit 12 tests: the two methods are no longer interchangeable-by-convention, the tool now enforces the distinction.

## A real finding: a fresh Symfony skeleton fails PHPStan level 7 out of the box

Mirroring the Laravel worked example's "a fresh skeleton fails Larastan level 7 with 8 real errors" finding: `src/Kernel.php` as generated by `symfony/skeleton` ships a private `getAllowedEnvs()` method that is **never called anywhere** — PHPStan level 7's dead-code check flags it immediately. Deleted it (the method is vestigial boilerplate, not a project need) rather than suppressing the rule. `tests/bootstrap.php` similarly ships a `method_exists(Dotenv::class, 'bootEnv')` guard that will always evaluate true against any currently-supported Symfony version — also dead code, also fixed by simplifying rather than baselining.

## Cross-framework comparison point: validation-failure status code

This project's `decode()` helper throws `UnprocessableEntityHttpException` (422) explicitly on a Symfony Validator violation, matching the Express/Fastify/Koa convention (developer-chosen 422) rather than Hapi's Joi-driven 400 default. Symfony's Validator component has no opinion on HTTP status by itself — like Koa, the status code is entirely the project's own choice.

## Authorization: the persona matrix, twice

`tests/Unit/ArticleVoterTest.php` (9 cases) calls the Voter's public `vote()` method directly with a stub `TokenInterface`, no HTTP, no container — the Symfony-native equivalent of unit-testing a Laravel Policy or a JS `articlePolicy` object directly. `tests/Functional/ArticlesPermissionTest.php` (13 cases) drives the same matrix through `WebTestCase`'s `KernelBrowser`, a real in-process HTTP request/response cycle (Symfony's own `supertest`-equivalent, bundled with the framework rather than a separate package) — weighted on the refused cells (outsider-author, plain-member, guest) per the doctrine's persona-matrix principle.

## Validation

`tests/Functional/ArticlesValidationTest.php` — 7 cases (missing title, missing body, non-string title, non-boolean `isPrivate`, an undeclared field rejected via the Serializer's `allow_extra_attributes: false`, a valid full payload, a valid partial update), all asserting **422**.

## Isolation

- `dama/doctrine-test-bundle` wraps every test in a database transaction, rolled back automatically after — no manual schema reset between tests, the direct Symfony-ecosystem counterpart of Laravel's `RefreshDatabase`.
- **The scheduling suite swaps `ClockInterface` in the container** (`static::getContainer()->set(ClockInterface::class, new MockClock($when))`) rather than faking global time functions. This is a structurally different — and structurally safer — mechanism than Jest's `useFakeTimers()`: because Symfony's clock mocking is dependency-injected rather than a global monkey-patch of `time()`/`Date.now()`-equivalents, **it does not exhibit the fake-timers-hangs-real-async-plumbing hazard found repeatedly on the JS side** (tRPC/GraphQL/Fastify/Hapi/Koa all needed a `doNotFake` list to avoid hanging their own HTTP-driving mechanism). Only code that actually asks the container for `ClockInterface` sees the fake time; everything else (the HTTP kernel, the database driver, PHPUnit itself) keeps using real timers. This is a genuine, non-obvious cross-ecosystem architectural difference worth naming explicitly: DI-based time-mocking sidesteps an entire category of bug that global-timer-patching introduces.
- The notification test uses PHPUnit's native `createMock()` + `expects(self::once())`, swapped into the container the same way as the clock — Symfony's DI container is the uniform mechanism for both isolation needs (fake time, fake collaborator), unlike the JS side where `jest.useFakeTimers()` and `jest.spyOn()` are two separate, unrelated tools.

## Honest scope

This example doesn't exercise:
- **Symfony's Messenger component** (for async notification dispatch) — the `CommentNotifier` here is a synchronous logger call, matching the JS examples' `notificationService.notify()` pattern, not Messenger's queue/worker model
- **Multi-role aggregation** — this project's `User::getRole()` models a single primary role per user (matching the JS examples), unlike the Laravel worked example's `spatie/laravel-permission`-based secondary-role case; a project using Symfony's own multi-role `getRoles(): array` more fully would need this case added
- **Data integrity** — same open gap flagged in the Laravel worked example and every JS worked example

## Reproduction

Everything above was built and run with only Docker on the host — no local PHP/Composer install:

```bash
# 1. fresh Symfony skeleton + packages
docker run --rm -v $(pwd):/app -w /app composer:2 composer create-project symfony/skeleton . --prefer-dist -q
docker run --rm -v $(pwd):/app -w /app composer:2 composer require symfony/security-bundle symfony/orm-pack symfony/validator symfony/serializer-pack --with-all-dependencies -q
docker run --rm -v $(pwd):/app -w /app composer:2 composer require --dev symfony/test-pack phpstan/phpstan phpstan/phpstan-symfony phpstan/phpstan-doctrine dama/doctrine-test-bundle -q

# 2. sqlite for the test DB (edit .env: DATABASE_URL="sqlite:///%kernel.project_dir%/var/data_%kernel.environment%.db")
docker run --rm -v $(pwd):/app -w /app -e APP_ENV=test php:8.4-cli php bin/console doctrine:schema:create

# 3. run the suite
docker run --rm -v $(pwd):/app -w /app -e APP_ENV=test php:8.4-cli vendor/bin/phpunit

# 4. static analysis
docker run --rm -v $(pwd):/app -w /app php:8.4-cli vendor/bin/phpstan analyse --memory-limit=512M

# 5. coverage (php:8.4-cli ships no coverage driver — install pcov in the same container invocation)
docker run --rm -v $(pwd):/app -w /app -e APP_ENV=test php:8.4-cli bash -c \
  'pecl install pcov && docker-php-ext-enable pcov && vendor/bin/phpunit --coverage-text'
```

`php:8.4-cli` ships `pdo_sqlite`/`sqlite3` by default. After any container-run command, `docker run --rm -v $(pwd):/app composer:2 chown -R 1000:1000 /app` if you hit `Permission denied` writing new files — the official images run as root.
