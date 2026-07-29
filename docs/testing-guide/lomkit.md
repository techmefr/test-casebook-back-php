# Lomkit (`lomkit/laravel-rest-api`) Testing Guide

> Optional module — only read this if the target project's `composer.json` has `lomkit/laravel-rest-api`. Nothing in `AGENTS.md`'s core steps depends on it.

Lomkit exposes Eloquent models through a fixed set of POST-driven endpoints (`search`, `mutate`, `operate`, `details`, `destroy`, `restore`, `force`) built from a declarative **Resource** class. Testing it well means understanding that it enforces access in **two structurally different ways**, which map to two different HTTP status codes and two different testing concerns — conflating them is the most common mistake.

## The two layers — verified against the package source, not guessed

### Layer 1 — structural whitelist (422, not persona-dependent)

`fields()`, `relations()`, `scopes()`, `limits()`, `filters`, `sorts`, `includes`, `selects`, `aggregates` on a Resource are **static declarations** — the same for every request regardless of who's asking. A `search` request is validated against them via Laravel's own validation rules (`Lomkit\Rest\Rules\Search\SearchFilter`, `SearchSort`, `SearchInclude`, etc. — confirmed in `vendor/lomkit/laravel-rest-api/src/Rules/Search/Search.php`). Requesting a field, relation, filter, sort, or include that isn't declared on the Resource fails **validation**, returning **422**, not 403.

This is a **leak test**, not a permission test: it verifies the Resource's own config doesn't expose more than intended, and it's the same for every persona.

```php
public function test_requesting_an_undeclared_field_is_rejected(): void
{
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/users/search', [
        'search' => ['selects' => [['field' => 'password_reset_token']]],
    ])->assertStatus(422);
}

public function test_requesting_an_undeclared_relation_is_rejected(): void
{
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/users/search', [
        'search' => ['includes' => [['relation' => 'internalAuditLog']]],
    ])->assertStatus(422);
}
```

### Layer 2 — Policy authorization (403, persona-dependent — this is the real matrix)

Record-level and relationship-mutation operations go through Laravel's own `Gate::authorize()` (confirmed in `vendor/lomkit/laravel-rest-api/src/Concerns/Authorizable.php`), which throws `AuthorizationException` → **403** when denied. The abilities Lomkit checks are the standard Laravel seven **plus** two relationship-specific ones:

`viewAny`, `view`, `create`, `update`, `delete`, `restore`, `forceDelete`, **`attach{Model}`**, **`detach{Model}`**

This is where `AGENTS.md` Step 5.2's persona matrix applies for real — build the matrix against these abilities, on your project's actual Policies, dense on the refused personas:

```php
public function test_a_user_without_permission_cannot_update_another_users_agency(): void
{
    $agency = Agency::factory()->create();
    $outsider = User::factory()->create(); // no permission granted

    $this->actingAs($outsider)->postJson('/api/agencies/mutate', [
        'mutate' => [['operation' => 'update', 'key' => $agency->id, 'attributes' => ['name' => 'Hacked']]],
    ])->assertForbidden();

    $this->assertSame($agency->name, $agency->fresh()->name); // and the data-layer assertion
}

public function test_an_admin_can_update_any_agency(): void
{
    $agency = Agency::factory()->create();
    $admin = User::factory()->create()->givePermissionTo('update global agencies');

    $this->actingAs($admin)->postJson('/api/agencies/mutate', [
        'mutate' => [['operation' => 'update', 'key' => $agency->id, 'attributes' => ['name' => 'Renamed']]],
    ])->assertOk();
}
```

### Client-requested per-row gates

A `search` request can ask Lomkit to include specific gate results per row (`search.gates: ['update', 'delete']`, validated against the same seven core abilities — `attach`/`detach` are not requestable this way since they're relationship-specific, not per-row). If your frontend uses this to decide whether to render an edit/delete control, test that the returned gate value matches the real Policy decision for that persona — a UI that trusts a stale or wrong per-row gate value is the same class of bug as a hidden button with an unprotected action behind it.

```php
public function test_search_gates_reflect_the_real_policy_decision(): void
{
    $agency = Agency::factory()->create();
    $outsider = User::factory()->create();

    $response = $this->actingAs($outsider)->postJson('/api/agencies/search', [
        'search' => ['gates' => ['update']],
    ])->assertOk();

    $row = collect($response->json('data'))->firstWhere('id', $agency->id);
    $this->assertFalse($row['gates']['update']);
}
```

## Resource method signatures (verified against real Resource classes)

```php
class AgencyResource extends ResourceControlled // or Lomkit\Rest\Http\Resource directly
{
    public static $model = Agency::class;

    public function fields(RestRequest $request): array { /* exposed fields */ }
    public function scoutFields(RestRequest $request): array { /* Scout/search-index fields, if using scout mode */ }
    public function relations(RestRequest $request): array { /* HasMany::make(...), BelongsTo::make(...)-> etc. */ }
    public function scopes(RestRequest $request): array { /* named local scopes the client may request */ }
    public function limits(RestRequest $request): array { /* allowed page sizes */ }
    public function rules(RestRequest $request): array { /* validation rules for mutate */ }
}
```

Custom **Actions** (`php artisan rest:action`) and **Instructions** (`php artisan rest:instruction`) are project-specific mutators/query-refiners exposed under `/{resource}/actions/{uriKey}` and the `search.instructions` key respectively — treat them as their own units in `task-test.md` (Step 5.0), not as an extension of the Resource's own case list.

## What NOT to test (don't test the framework)

Don't write a case asserting that Lomkit's own search filters, sorts, or pagination work in the abstract — that's Lomkit's own test suite's job (it's a well-tested third-party package). Test:
- **your** Resource's `fields()`/`relations()`/`scopes()` declarations (the leak tests above),
- **your** Policies (the persona matrix above),
- **your** custom Actions/Instructions,
- **your** `searchQuery`/`mutateQuery`/`destroyQuery` overrides if the project customizes them (e.g. a multi-tenant scoping applied via `lomkit/laravel-access-control` or a bespoke `->controlled()` scope) — this is exactly the kind of query-level enforcement that's easy to get right in one Resource and forget in the next, so a case for it belongs in every gated Resource's block, not just once.

## Verified for real: `lomkit/laravel-rest-api` + `lomkit/laravel-access-control` installed and run

Everything above this section was originally written from reading the package source. It has now also been run for real — the Article/blog demo (see `blog-worked-example.md`) was given a real `ArticleResource` on top of `lomkit/laravel-rest-api ^2.22` and `lomkit/laravel-access-control ^0.5`, with real HTTP requests through `php artisan test`. **63/63 tests green, Larastan level 7 clean.** Three things the source-reading alone didn't catch, only running it did:

1. **`destroy` is bulk-by-body, not a URL segment.** There is no `DELETE /articles/{id}` route — the registered route is `DELETE /articles` and the target rows are named in the JSON body: `{"resources": [1, 2, 3]}`. `authorizeTo('delete', $model)` runs in a loop over the resolved models, so a persona-matrix 403 test still works, it's just shaped differently than a conventional REST `DELETE /resource/{id}`:
   ```php
   $this->actingAs($outsider)
       ->deleteJson('/api/rest/articles', ['resources' => [$article->id]])
       ->assertForbidden();
   ```
   An unknown id in `resources` fails **validation** (422, via `Rule::exists`), not the Policy gate (403) — another instance of the two-layer distinction, this time on the destroy path rather than search.

2. **`details` is not "get one record."** It returns `{'data': $resource->jsonSerialize()}` — the Resource's own *schema* (fields/relations/limits), not a model instance. Fetching a single record by id is done through `search` with an `id` filter, or through `mutate`'s `update` operation with a `key`. Assuming `details` was a Nova-style "show" endpoint would have produced tests asserting the wrong shape entirely.

3. **A real upstream bug: `mutate()` leaves a dangling transaction on a 403.** `Lomkit\Rest\Concerns\PerformsRestOperations::mutate()` calls `DB::beginTransaction()` manually and only reaches `DB::commit()` on the success path — there is no `try/catch`/`rollback`. When `authorizeTo('create', ...)` throws `AuthorizationException` mid-mutate (the exact case a persona-matrix "denied" test wants to assert), the transaction is never closed. In a test suite that reuses one SQLite connection across tests (as `LazilyRefreshDatabase` does), the very next test that touches the database fails with `SQLSTATE[HY000]: General error: 1 cannot start a transaction within a transaction` — a failure that looks like it belongs to a completely unrelated test. The workaround, until this is fixed upstream: explicitly close the transaction after asserting the 403 —
   ```php
   $this->actingAs($member)
       ->postJson('/api/rest/articles/mutate', $payload)
       ->assertForbidden();

   DB::rollBack();
   ```
   This is a real, reproducible package limitation (confirmed by isolating the two requests into separate test methods and watching the second one only fail when it follows a mutate-403 test) — not a testing-doctrine convention, and not something to silently work around without a comment pointing future readers at this section.

4. **Running two Lomkit requests to the *same* endpoint inside one test method can silently skip validation on the second call.** A structural-whitelist (422) test written as `actingAs($admin)->postJson(...); actingAs($member)->postJson(...)` in one method had its second call bypass field validation entirely and hit the database with the raw invalid field — while each call passed correctly in its own isolated test method. This reinforces the doctrine's existing "one assertion-bearing test per case" rule (`AGENTS.md` Step 5.1): with Lomkit specifically, that rule isn't just about naming/readability, it avoids resource/container state leaking between requests replayed in the same PHPUnit process.

5. **Row-level scoping for `laravel-access-control`-style needs is your own `searchQuery()` override, not automatic.** `search()`'s only built-in authorization call is a single `authorizeTo('viewAny', Model::class)` — it does **not** filter rows by the `view` Policy method on its own. Without an explicit `searchQuery()` override, an authenticated member could search and see every private/scheduled article regardless of the `ArticlePolicy::view()` rule, because the policy is never consulted per-row during search. This is exactly the "third enforcement layer" the section below describes — it must be written, it doesn't come for free just because a Policy exists.

## If `lomkit/laravel-access-control` is also present

That package typically layers row-level scoping on top of Lomkit's own model-level Policy checks (e.g. restricting a `search` to rows the persona's tenant/agency/scope can see, independent of whether they pass the `view` ability on the model class in general). Treat it as a **third enforcement layer**, distinct from both the structural whitelist (422) and the Policy gate (403): a persona might pass `view` on the `Agency` model in general but still have a given row's data filtered out of their `search` results by the access-control scope. Assert the row is **absent from the result set**, not merely that a direct-record request 403s — the two failure modes are different bugs.
