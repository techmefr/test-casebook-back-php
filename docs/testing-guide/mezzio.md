# Worked example — Mezzio (Laminas)

Same scenario as the Laravel [`worked-example.md`](worked-example.md)/[`blog-worked-example.md`](blog-worked-example.md), [`symfony.md`](symfony.md), and [`slim.md`](slim.md): a blog-style Article API with roles (admin/author/member), a private-article visibility rule, scheduled publishing, and comments that notify the article's owner — this time on Mezzio, the Laminas-project PSR-15 micro-framework, built directly against its middleware-pipeline primitives rather than through the full `mezzio-skeleton` + `laminas-servicemanager` application shell.

## Result

**48/48 tests green** (9 unit + 39 functional), PHPStan level 7 clean, **97.66% line coverage** (pcov) — well above the 80% floor.

## The stack, as actually built

- **`mezzio/mezzio` + `mezzio/mezzio-fastroute`** (FastRoute-backed router) + `laminas/laminas-diactoros` (PSR-7 implementation) + `firebase/php-jwt` for Bearer-token auth — no `laminas/laminas-servicemanager`, no DI container, no `mezzio-skeleton` scaffold. Mezzio is explicitly designed to be usable as a library (a `Laminas\Stratigility\MiddlewarePipe` built and piped by hand), not only through the full skeleton application — this worked example takes that path deliberately, the same architectural choice Slim's worked example made.
- **No ORM, no database** — the same in-memory `Db` value-object store reused verbatim from the Slim worked example (identical scenario, identical domain layer: `User`/`Article`/`Comment`/`ArticlePolicy`/`CommentPolicy`/`Validators` are byte-for-byte the same files). This is itself a finding worth naming: **the domain/business logic (policies, validators, value objects) is entirely framework-agnostic PHP** — porting from Slim to Mezzio required zero changes to any of it, only to the routing/middleware wiring layer.
- **Hand-rolled JWT auth**, identical to the Slim worked example's `Security/Auth.php` and a PSR-15 `AuthMiddleware` — Mezzio, like Slim, ships no authentication layer of its own.
- **Manual pipeline construction**: `Mezzio\Router\RouteCollector` registers routes (each wrapped in `Laminas\Stratigility\Middleware\CallableMiddlewareDecorator` since `RouteCollector`'s methods require PSR-15 `MiddlewareInterface`, not raw callables), then a `Laminas\Stratigility\MiddlewarePipe` is built by hand: `RouteMiddleware` → `AuthMiddleware` → `DispatchMiddleware` → a custom 404/405 fallback — the same four-stage shape Mezzio's own skeleton wires through `laminas-servicemanager` config, done explicitly instead.

## A real finding: Mezzio's `DispatchMiddleware` delegates 404 *and* 405 to the same fallback, undifferentiated

Unlike Slim (where a missing route or disallowed method throws two distinct exception types), Mezzio's `RouteResult::process()` collapses both failure modes into one behavior: on any routing failure, it simply calls `$handler->handle($request)` — passing control to whatever the *next* middleware in the pipe is, with no distinction between "no route matched" and "route matched, wrong method" baked into the control flow itself. The distinction is preserved as data, not control flow: `RouteResult::isMethodFailure(): bool`, readable from the request's `RouteResult::class` attribute inside that fallback middleware. Getting a correct 404-vs-405 split therefore requires writing that check explicitly:

```php
$routeResult = $request->getAttribute(RouteResult::class);
if ($routeResult instanceof RouteResult && $routeResult->isMethodFailure()) {
    return $error(405, 'method not allowed');
}
return $error(404, 'not found');
```

This is the same category of finding as Slim's "no routing/error middleware by default" note, but the shape of the gap is different: Slim fails loudly (an uncaught exception you cannot miss the first time you run a not-found test), Mezzio fails silently-but-wrong (falls through to whatever's next in the pipe with no exception at all, and would return the *wrong* status code — always 404 — if the implementer never reads `isMethodFailure()`). Both were caught only because a dedicated `NotFoundTest` suite exercised the actual not-found/method-not-allowed paths, not just the persona-matrix happy path — reinforcing the doctrine's existing "test every branch, not just the ones the happy-path persona matrix touches" principle from a second angle.

## A real finding: reusing Slim's domain layer verbatim, byte-for-byte, is itself the finding

`User.php`, `Article.php`, `Comment.php`, `Db.php`, `ArticlePolicy.php`, `CommentPolicy.php`, and `Validators.php` were copied from the Slim worked example with **zero modifications** and passed PHPStan level 7 and all 9 unit tests immediately, unmodified. This confirms, empirically rather than by assumption, a claim implicit in this doctrine's whole "authorization/validation logic should be tested at the unit level, independent of the framework" principle (Step 5.2's "test your Policies... directly"): a correctly-isolated PHP domain layer has **no framework coupling at all**, and porting a worked example between two micro-frameworks is purely a routing/middleware-wiring exercise, not a rewrite. The inverse would also have been a finding — if the domain layer had needed changes, that would mean it wasn't actually framework-agnostic — but it didn't, so the positive result stands as its own data point.

## A real finding: PHPStan flags an unused `use` in a closure, and a PSR-7 header-array type mismatch

Two genuine (if minor) findings on the first PHPStan run: an anonymous route-fallback closure captured `$json` via `use` but only ever called `$error` — `closure.unusedUse`, fixed by dropping the unused capture. Separately, `TestClient`'s `array<string, string>` headers parameter didn't satisfy `Laminas\Diactoros\ServerRequest`'s constructor, which types its `$headers` parameter as `array<non-empty-string, array<string>|string>` — PHPStan correctly flagged the shape mismatch (a `string` value is a subtype of `array<string>|string`, but the *key* type `string` vs `non-empty-string` isn't automatically compatible without an explicit assertion). Fixed with a locally-scoped `@var` annotation narrowing the type, rather than loosening the parameter's own type — same "fix the type, don't suppress it" rule as every other framework in this doctrine.

## A real finding: the domain layer's own dead code only surfaces once every branch is actually driven

`Db::deleteArticle()`'s cascade-delete-comments branch (the `foreach` that removes a deleted article's own comments) sat uncovered at 66.67% method/line coverage on the first coverage run — no functional test had ever deleted an article that already had a comment attached. This is the same "coverage floor forces you back to the plan" mechanic the doctrine already documents (Step 6: "if coverage is below the floor, that maps to cases missing from `task-test.md`"), caught here for real rather than asserted: adding one `deleting_an_article_also_deletes_its_comments` case (create a comment, delete the article, assert deleting that now-orphaned comment 404s) closed the gap to 100% on `Db`.

## Authorization: the persona matrix, twice

`tests/Unit/ArticlePolicyTest.php` (9 cases, identical to Slim's) instantiates `ArticlePolicy` directly — no HTTP, no framework. `tests/Functional/ArticlesPermissionTest.php` (15 cases, one more than Slim's after adding the cascade-delete case) drives the same matrix through `TestClient`, weighted on the refused cells (outsider-author, plain-member, expired/invalid/missing/deleted-user token).

## Validation

`tests/Functional/ArticlesValidationTest.php` — 7 cases, identical shape to every other framework in this doctrine, all asserting **422** from the same hand-rolled `Validators` class reused unmodified from Slim.

## Comparison point: no fake-timers hazard category exists in PHP at all

Same finding as Slim's worked example, reused unmodified: `ArticlePolicy::view()` accepts an optional `\DateTimeImmutable $now`, defaulting to real wall-clock time; the scheduling suite drives it with relative real dates (`new \DateTimeImmutable('+1 day')` / `'-1 day'`) rather than mocking time, because PHP has no global fake-timer mechanism to reach for (unlike JS's `jest.useFakeTimers()` with its documented hazard list, or Symfony's DI-based `ClockInterface`).

## Honest scope

This example doesn't exercise:
- **`laminas/laminas-servicemanager`** or any DI container — routes and middleware are wired by hand with `new`; a real Mezzio project using the full skeleton would resolve these through container factories instead, and a container-based project's test setup would look more like Symfony's (swap a service in the container) than this one's (pass a constructor argument)
- **A real database** — same in-memory-only choice already made for Slim and every JS Express/Fastify/Koa demo in this doctrine
- **Data integrity** — same open gap flagged in every other worked example in this doctrine

## Reproduction

Everything above was built and run with only Docker on the host — no local PHP/Composer install:

```bash
# 1. project skeleton
docker run --rm -v $(pwd):/app -w /app composer:2 composer require mezzio/mezzio mezzio/mezzio-fastroute laminas/laminas-diactoros firebase/php-jwt -q
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
