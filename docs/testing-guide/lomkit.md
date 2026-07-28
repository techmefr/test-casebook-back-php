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

## If `lomkit/laravel-access-control` is also present

That package typically layers row-level scoping on top of Lomkit's own model-level Policy checks (e.g. restricting a `search` to rows the persona's tenant/agency/scope can see, independent of whether they pass the `view` ability on the model class in general). Treat it as a **third enforcement layer**, distinct from both the structural whitelist (422) and the Policy gate (403): a persona might pass `view` on the `Agency` model in general but still have a given row's data filtered out of their `search` results by the access-control scope. Assert the row is **absent from the result set**, not merely that a direct-record request 403s — the two failure modes are different bugs.
