# Worked example — CodeIgniter 4

Same scenario as the Laravel [`worked-example.md`](worked-example.md)/[`blog-worked-example.md`](blog-worked-example.md), [`symfony.md`](symfony.md), [`slim.md`](slim.md), and [`mezzio.md`](mezzio.md): a blog-style Article API with roles (admin/author/member), a private-article visibility rule, scheduled publishing, and comments that notify the article's owner — this time on CodeIgniter 4, built from the official `codeigniter4/appstarter` skeleton rather than a bare micro-framework.

## Result

**48/48 tests green** (9 unit + 39 functional), PHPStan level 7 clean, **97.35% line coverage** (pcov, scoped to the code actually written) — well above the 80% floor.

## The stack, as actually built

- **`codeigniter4/appstarter`** (the official starter, `codeigniter4/framework` ^4.7) + `firebase/php-jwt` for Bearer-token auth. Unlike Symfony/Slim/Mezzio, this is the one framework in the doctrine so far built from the *full application skeleton* (`app/Config/*`, `app/Controllers/BaseController`, `app/Filters`) rather than assembled from library-mode primitives — CI4 doesn't offer a documented "use it as a library" mode the way Mezzio explicitly does.
- **No ORM, no database** — the same in-memory `Db` value-object store reused from Slim/Mezzio (`App\Domain\Db`, byte-for-byte the same shape). CI4 ships its own Query Builder/Model layer, but nothing in this scenario requires it, so it goes unused — same "no bundled persistence needed" choice as every other worked example.
- **A hand-rolled JWT auth Filter** (`App\Filters\AuthFilter`, implementing `CodeIgniter\Filters\FilterInterface`) — CI4's own request-interception extension point (registered as a named alias in `app/Config/Filters.php`, attached to a route group in `app/Config/Routes.php`), the direct structural counterpart to Slim's/Mezzio's hand-rolled PSR-15 middleware. CI4 ships no authentication of its own beyond the optional `codeigniter4/shield` package, which this scenario doesn't pull in.
- **CI4's own `Services` container** (`app/Config/Services.php`, extending `CodeIgniter\Config\BaseService`) used as the DI mechanism — `Services::db()`, `Services::articleAuth()`, `Services::commentNotifier()`, `Services::currentUser()` are project-added service factories following the framework's own `getSharedInstance()`/lazy-singleton convention. This is a genuine structural difference from Slim/Mezzio (constructor-injected collaborators, no container) and closer in spirit to Symfony's container — but resolved by static factory method call rather than autowired constructor injection.
- **CI4's own `FeatureTestTrait`** (`CodeIgniter\Test\FeatureTestTrait`, mixed into a `CIUnitTestCase` subclass) for functional tests — `$this->withHeaders([...])->withBodyFormat('json')->post($path, $params)` drives a full in-process request through the actual `CodeIgniter::run()` entrypoint, no separate test-HTTP-client dependency, the same "framework-native, zero extra package" shape Slim's `$app->handle()` and Mezzio's hand-built `MiddlewarePipe::handle()` already established as a recurring pattern across this doctrine's PHP micro/full frameworks.

## A real finding: a fresh `php:8.4-cli` image is missing `ext-intl`, which `codeigniter4/framework` hard-requires

`composer create-project codeigniter4/appstarter` failed outright on the very first Docker invocation: `codeigniter4/framework requires ext-intl * -> it is missing from your system`. Unlike the pcov-for-coverage gap (already a known, already-documented pattern in this doctrine — install the extension in the same container invocation), this is a **hard install-time requirement**, not an optional coverage-only extra: CodeIgniter 4 cannot be installed at all without `intl`, on any environment. The fix is the same shape as pcov's: `apt-get install -y libicu-dev && docker-php-ext-install intl` in the same container invocation as the composer/phpunit/phpstan command — but because this now has to happen on *every* container run (composer install, phpunit, phpstan all need it), it was worth baking into a small reusable local image (`Dockerfile.test`: `FROM php:8.4-cli` + `intl` + `pcov` installed once) rather than repeating a slow `apt-get`/`pecl install` on every single command, the way the pcov-only frameworks could get away with doing per-invocation.

## A real finding: CI4's router has no method-not-allowed concept at all — a wrong HTTP verb on a real path is indistinguishable from an unmatched route

The first `NotFoundTest` run for a `PUT /articles` request (a real path, registered only for `GET`/`POST`) did **not** produce a 405 — CI4's FastRoute-less custom router simply reports "no route found," identical to hitting a path that doesn't exist at all. This is a genuine, negative cross-framework comparison point: Slim and Mezzio both preserve the allowed-methods distinction internally (Slim throws a distinct `HttpMethodNotAllowedException`; Mezzio's `RouteResult::isMethodFailure()` flags it explicitly) — CodeIgniter 4's router doesn't carry that information at all. A project that needs a real 405 on CodeIgniter 4 would have to hand-roll the check itself (e.g. registering the path for every verb and dispatching a 405 inside the controller for the ones it doesn't support) rather than relying on anything the framework's routing layer already knows. The doctrine's test for this case was adjusted to assert the true CI4 behavior (**404**, not 405) rather than asserting a status the framework cannot actually produce.

## A real finding: an unmatched route throws an uncaught `PageNotFoundException` in feature tests unless a `set404Override` is registered

The very same `NotFoundTest` run also failed on the plain `GET /does-not-exist` case — not with a 404 response, but with an **uncaught `CodeIgniter\Exceptions\PageNotFoundException` propagating out of the test itself**. Reading `CodeIgniter::display404errors()` explains why: it only converts the exception into an HTTP response if a `$routes->set404Override(...)` callback is registered in `app/Config/Routes.php`; with no override, it re-throws unconditionally. In a real HTTP deployment this re-thrown exception is normally caught by the front controller's top-level exception handler (`Config\Exceptions`) and rendered as an HTML/JSON error page — but `FeatureTestTrait::call()` invokes `CodeIgniter::run()` directly, with no such top-level handler wrapping it, so the exception surfaces raw in the test. The fix — registering an explicit `set404Override` closure that sets a 404 status and a JSON body via `service('response')` — is a one-line addition to `Routes.php`, but **it is not optional**: without it, no feature test can ever assert a clean 404 response for a genuinely unmatched route, only catch the exception itself. This is the same category of finding as Slim's "no routing/error middleware by default" and Mezzio's "404/405 collapsed into one undifferentiated failure" — a third, distinct shape of the same underlying lesson: **every micro/full framework in this doctrine that doesn't ship a fully-wired skeleton needs its not-found path exercised explicitly, because each one fails differently when it isn't.**

## A real finding: PHPStan flags filter return-type annotations that are wider than what the implementation actually returns

`AuthFilter::before()`/`::after()` had no explicit return type (matching `FilterInterface`'s own loosely-typed signature, which allows `RequestInterface|ResponseInterface|string|void|null`). PHPStan level 7 correctly noted that this concrete implementation never actually returns `null` or `string` — narrowing the return type to `RequestInterface|ResponseInterface` (dropping the interface's broader allowance) fixed it. Also flagged: a bare `service('response')` call — CI4's global helper functions (`service()`, `config()`, etc.) are loaded at runtime via Composer's `files` autoload, not resolvable by PHPStan's static analysis without extra bootstrapping; the fix was simply to use the already-imported `Config\Services::response()` static call instead, consistent with how every other service in this codebase is already resolved.

## Authorization: the persona matrix, twice

`tests/Unit/ArticlePolicyTest.php` (9 cases, identical to Slim/Mezzio) instantiates `ArticlePolicy` directly — no HTTP, no framework, confirming for a third time that this doctrine's domain layer is genuinely framework-agnostic PHP (see the Mezzio guide's finding on this same point — CI4's copy is unmodified from Slim's). `tests/Functional/ArticlesPermissionTest.php` (16 cases) drives the same matrix through `FeatureTestTrait`, weighted on the refused cells (outsider-author, plain-member, expired/invalid/missing/deleted-user token).

## Validation

`tests/Functional/ArticlesValidationTest.php` — 7 cases, identical shape to every other framework in this doctrine, all asserting **422** from the same hand-rolled `Validators` class reused unmodified from Slim/Mezzio.

## Comparison point: no fake-timers hazard category exists in PHP at all

Same finding as Slim's and Mezzio's worked examples, reused unmodified: `ArticlePolicy::view()` accepts an optional `\DateTimeImmutable $now`, defaulting to real wall-clock time; the scheduling suite drives it with relative real dates rather than mocking time, because PHP has no global fake-timer mechanism to reach for.

## Honest scope

This example doesn't exercise:
- **CI4's own Query Builder/Model/Entity layer** — the in-memory `Db` class is a deliberate substitute, same choice made for every other framework's worked example in this doctrine
- **`codeigniter4/shield`** (CI4's official auth package) — the hand-rolled JWT Filter stands in for it, the same "read the project's actual auth mechanism, don't assume a specific package" principle already documented in `AGENTS.md`'s Symfony row
- **Data integrity** — same open gap flagged in every other worked example in this doctrine

## Reproduction

Everything above was built and run with only Docker on the host — no local PHP/Composer install. Because `ext-intl` is a hard install-time requirement (not just a coverage nicety like `pcov`), a small reusable local image is worth building once rather than reinstalling on every command:

```bash
# 1. project skeleton (ext-intl is required by codeigniter4/framework but missing from php:8.4-cli by default)
docker run --rm -v $(pwd):/app -w /app composer:2 composer create-project codeigniter4/appstarter . --prefer-dist
docker run --rm -v $(pwd):/app -w /app composer:2 composer update --ignore-platform-req=ext-intl -q
docker run --rm -v $(pwd):/app -w /app composer:2 composer require firebase/php-jwt --ignore-platform-req=ext-intl -q
docker run --rm -v $(pwd):/app -w /app composer:2 composer require --dev phpstan/phpstan --ignore-platform-req=ext-intl -q

# 2. build a reusable local test image (intl + pcov baked in once, instead of reinstalling on every run)
cat > Dockerfile.test <<'DOCKERFILE'
FROM php:8.4-cli
RUN apt-get update -qq \
    && apt-get install -y -qq libicu-dev >/dev/null \
    && docker-php-ext-install intl >/dev/null \
    && pecl install pcov >/dev/null \
    && docker-php-ext-enable pcov \
    && rm -rf /var/lib/apt/lists/*
DOCKERFILE
docker build -t ci4-test-php:local -f Dockerfile.test .

# 3. run the suite (with coverage — pcov is already baked into the image)
docker run --rm -v $(pwd):/app -w /app ci4-test-php:local php vendor/bin/phpunit --coverage-text

# 4. static analysis (bump the memory limit — the default 128M is not enough for phpstan's own parser)
docker run --rm -v $(pwd):/app -w /app ci4-test-php:local php -d memory_limit=512M vendor/bin/phpstan analyse
```

After any `composer:2`-image command, `docker run --rm -v $(pwd):/app composer:2 chown -R 1000:1000 /app` if you hit `Permission denied` writing new files — the official images run as root.
