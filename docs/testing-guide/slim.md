# Worked example — Slim

Same scenario as the Laravel [`worked-example.md`](worked-example.md)/[`blog-worked-example.md`](blog-worked-example.md) and [`symfony.md`](symfony.md): a blog-style Article API with roles (admin/author/member), a private-article visibility rule, scheduled publishing, and comments that notify the article's owner — this time on Slim, a micro-framework with no bundled ORM, router validation, or auth of its own. Everything beyond routing is hand-rolled, mirroring the JS "Express" precedent in `test-casebook-back-js`.

## Result

**47/47 tests green** (9 unit + 38 functional), PHPStan level 7 clean, **96.75% line coverage** (pcov) — well above the 80% floor.

## The stack, as actually built

- **Slim 4.15** + `slim/psr7` (PSR-7 implementation) + `php-di/php-di` (present as a dependency, not currently wired into the app — see "Honest scope") + `firebase/php-jwt` for Bearer-token auth.
- **No ORM, no database** — a plain in-memory `Db` class (arrays keyed by id), the same architectural choice already made for the JS Express/Fastify/Koa demos in this doctrine. Slim itself has no opinion on persistence.
- **Hand-rolled JWT auth** (`Security/Auth.php` using `firebase/php-jwt`'s `JWT::encode`/`JWT::decode`) plus a PSR-15 `AuthMiddleware` that resolves the bearer token to a `User` — there is no framework-provided authentication layer to lean on, unlike Symfony's `Voter`/`Authenticator` or Laravel's guards.
- **Hand-rolled validation** (`Validators.php`) — a plain PHP class returning a `ValidationResult(valid, errors, data)` value object, no external validation library, structurally identical to the JS Express demo's manual validators.
- **PHPUnit 13** for tests, **PHPStan level 7** for static analysis — no framework-specific PHPStan extension exists for Slim (unlike `phpstan-symfony`/Larastan), because there's barely any framework surface to model.

## The framework-native test mechanism: `$app->handle($request)` directly

Slim's own `App` object exposes `handle(ServerRequestInterface): ResponseInterface` — the exact method the front controller calls in production. Building a `TestClient` wrapper around `Slim\Psr7\Factory\ServerRequestFactory`/`StreamFactory` plus `$app->handle($request)` gives a full in-process request/response cycle **with zero extra test-HTTP-client dependency** — no `supertest`-equivalent package needed at all. This is arguably the cleanest "framework-native, zero extra dependency" test mechanism found across this whole doctrine so far: Symfony needs `symfony/test-pack`'s `KernelBrowser`, Laravel needs its own `TestCase::get()/post()` helpers, but Slim's production entrypoint (`public/index.php`'s `$app->run()`) and the test entrypoint (`$app->handle($request)`) are the same object with the same method, one layer apart.

## A real finding: a fresh `AppFactory::create()` app has no routing or error middleware — 404/405 propagate as uncaught exceptions

The first functional run of `NotFoundTest` failed with two hard PHP errors, not HTTP responses: `Slim\Exception\HttpNotFoundException: Not found.` and `Slim\Exception\HttpMethodNotAllowedException: Method not allowed.` bubbling straight out of `$app->handle()`. Slim, unlike Symfony/Laravel, does not add its routing/error middleware by default — `AppFactory::create()` gives you a bare app that will throw PSR-7-incompatible exceptions the moment a route doesn't match or a method isn't allowed. The fix is two explicit calls at the end of app construction:

```php
$app->addRoutingMiddleware();
$app->addErrorMiddleware(false, false, false);
```

This is the same category of finding as Symfony's "a fresh skeleton fails PHPStan out of the box" and the JS "package now ships its own bundled types" notes: **the framework's own quickstart leaves out a piece every real app needs**, and only running the actual failure path (not just the happy path) surfaces it. A worked example that only tested the persona matrix (all real routes, all real methods) would never have caught this — it took the dedicated `NotFoundTest` suite to expose it.

## A real finding: two PHPDoc tags on one line silently fail to parse

`private function checkUnknownFields(mixed $payload, array $allowed): array` had `/** @param list<string> $allowed @return array<string, string> */` as a single-line docblock. PHPStan level 7 still flagged `missingType.iterableValue` on the return type — the `@return` tag was silently swallowed because both tags shared one line. Splitting into a standard multi-line docblock (`@param` and `@return` each on their own line) fixed it immediately. Worth flagging because there was no parse error or warning; PHPStan simply behaved as if the `@return` annotation didn't exist, which reads exactly like "PHPStan doesn't understand generics here" until you look closely at the docblock syntax itself.

## A real finding: `Slim\App`'s container-type generic isn't covariant, so annotating it precisely creates its own error

Attempting to fix PHPStan's `missingType.generics` finding on `AppFactoryBuilder::create(): \Slim\App` by adding `@return \Slim\App<Psr\Container\ContainerInterface|null>` produced a *second*, self-inflicted error: `should return Slim\App<...> but returns Slim\App<...>` — textually identical types PHPStan still refuses to unify, because (per PHPStan's own generics documentation) `Slim\App`'s `TContainerInterface` template is declared invariant. This is a known, accepted PHPStan/Slim limitation, not a project bug — the pragmatic fix is a scoped `ignoreErrors` entry for the `missingType.generics` identifier in `phpstan.neon`, rather than fighting an unwinnable annotation. Worth naming as a comparison point: Symfony's worked example needed zero PHPStan-baseline entries; Slim's needed exactly one, and it's a vendor-generics quirk rather than an app defect.

## A real finding: `CommentNotifier` was constructed with `new` inside the app factory, making it unspyable

`AppFactoryBuilder::create(Db $db)` originally built `new CommentNotifier()` internally with no way for a test to intercept the call. Rather than adding a full DI container (php-di is a dependency but wasn't actually wired into routing), the minimal fix was an optional constructor parameter: `create(Db $db, ?CommentNotifier $notifier = null)`, defaulting via `??=`. This is the same architectural move Symfony's worked example used for its clock (swap the collaborator in, rather than mock a global) — just done by hand instead of through a container, because Slim's demo has no container to lean on.

## Comparison point: no fake-timers hazard category exists in PHP at all

The scheduling suite (`ArticlesSchedulingTest`) uses real relative dates (`new \DateTimeImmutable('+1 day')` / `'-1 day'`) rather than mocking time, because `ArticlePolicy::view()` defaults its `$now` parameter to `new \DateTimeImmutable()` and the route wiring never overrides it. Unlike JS (`jest.useFakeTimers()`, with its documented hazard of hanging unrelated async plumbing unless a `doNotFake` list is set — see the Fastify/Hapi/Koa/tRPC/GraphQL findings in `test-casebook-back-js`) and even unlike Symfony's DI-swapped `ClockInterface`, PHP has **no global fake-timer mechanism at all** — there's nothing to monkey-patch `time()` with, and no ecosystem convention for it. The pragmatic workaround (relative real dates) works here specifically because the policy method already accepts an optional `\DateTimeImmutable $now` for its *unit* tests; the *functional* suite simply can't inject that same override without either wiring a swappable clock through the whole app (as Symfony did) or accepting real-clock-relative dates. Worth naming explicitly: this is a genuine three-way split across the doctrine (JS: global fake timers + hazard list; Symfony: DI-based clock, no hazard; Slim/plain-PHP: no mechanism, fall back to relative real dates).

## Authorization: the persona matrix, twice

`tests/Unit/ArticlePolicyTest.php` (9 cases) instantiates `ArticlePolicy` directly and calls `view()`/`update()`/`delete()`/`create()` with plain `User`/`Article` value objects — no HTTP, no framework — the same unit-level shape as every other framework in this doctrine. `tests/Functional/ArticlesPermissionTest.php` (13 cases, expanded to 13 after adding a "token for a deleted user" case) drives the same matrix through `TestClient`, weighted on the refused cells (outsider-author, plain-member, expired/invalid/missing token, deleted-user token).

## Validation

`tests/Functional/ArticlesValidationTest.php` — 7 cases (missing title, missing body, empty title, non-boolean `isPrivate`, non-ISO-8601 `publishedAt`, an unknown field rejected, a valid full payload), all asserting **422** — confirmed by running, not assumed; the hand-rolled `Validators` class returns 422 by construction in the route closures, matching the Express/Fastify/Koa developer-chosen convention rather than any framework default.

## Honest scope

This example doesn't exercise:
- **`php-di/php-di`**, despite being a composer dependency — the app factory uses manual `new` construction throughout; a real project reaching for Slim's DI container would change how collaborators (and their test doubles) are wired
- **A real database** — same in-memory-only choice already made for the JS Express/Fastify/Koa demos
- **Data integrity** — same open gap flagged in every other worked example in this doctrine

## Reproduction

Everything above was built and run with only Docker on the host — no local PHP/Composer install:

```bash
# 1. project skeleton
docker run --rm -v $(pwd):/app -w /app composer:2 composer init --name=demo/back-php-slim -n -q
docker run --rm -v $(pwd):/app -w /app composer:2 composer require slim/slim slim/psr7 php-di/php-di firebase/php-jwt -q
docker run --rm -v $(pwd):/app -w /app composer:2 composer require --dev phpunit/phpunit phpstan/phpstan -q

# 2. run the suite
docker run --rm -v $(pwd):/app -w /app php:8.4-cli vendor/bin/phpunit

# 3. static analysis (bump the memory limit — the default 128M is not enough for phpstan's own parser)
docker run --rm -v $(pwd):/app -w /app php:8.4-cli php -d memory_limit=512M vendor/bin/phpstan analyse

# 4. coverage (php:8.4-cli ships no coverage driver — install pcov in the same container invocation)
docker run --rm -v $(pwd):/app -w /app php:8.4-cli bash -c \
  'pecl install pcov && docker-php-ext-enable pcov && php -d memory_limit=512M vendor/bin/phpunit --coverage-text'
```

After any container-run command, `docker run --rm -v $(pwd):/app composer:2 chown -R 1000:1000 /app` if you hit `Permission denied` writing new files — the official images run as root.
