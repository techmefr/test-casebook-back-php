# Conventions — Test Naming and the `task-test.md` Plan

## Test method naming

Match whichever the target project already uses — don't force a switch:

- **PHPUnit (default assumption):** `#[Test]` attribute + a descriptive snake_case method name that states the behaviour, not the mechanism:
  ```php
  #[Test]
  public function it_refuses_a_persona_without_permission_to_update_the_agency(): void
  ```
  over a name that just restates the method under test (`test_update_agency`) without saying what's being verified.
- **Pest (if the project uses it):** `it('refuses a persona without permission to update the agency', function () { ... })` — same rule, the description is a behaviour statement.

## Class naming

- `{Unit}Test.php` for a single unit (`AgencyResourceTest.php`, `UserStatePolicyTest.php`).
- Group Feature-level tests (hitting real routes/endpoints) under `tests/Feature/`, unit-level tests (a Policy in isolation, a single service class) under `tests/Unit/` — or the project's existing `functional/{module}/tests/Feature|Unit` layout if it follows an OSDD-style module structure (`technical/` never imports `functional/` — same layering rule as the application code itself applies to its tests).

## The `task-test.md` plan — same shape as the front doctrine

```md
## app/Policies/AgencyPolicy.php — unit + feature

- [ ] admin persona → update() allowed on any agency
- [ ] owner persona (agency.user_id matches) → update() allowed on their own agency
- [ ] outsider persona (no permission) → update() refused — 403 at the route level, data unchanged
- [ ] persona with permission via a secondary/aggregated role → update() still allowed (aggregation case)

## App\Rest\Resources\AgencyResource — feature (Lomkit)

- [ ] requesting the undeclared field `internal_notes` → 422
- [ ] requesting the undeclared relation `auditTrail` → 422
- [ ] search.gates reflects the real Policy decision for an outsider persona
```

One checkbox = one test, exactly as in the front doctrine. A block isn't done until every checkbox has a real, assertion-bearing test, the reviewer has approved it, and it's committed.

## Persona naming in tests

Name persona variables by **role in the scenario**, not by a generic `$user`/`$user2`:

```php
$admin = User::factory()->create()->givePermissionTo('update global agencies');
$owner = User::factory()->create();
$agency = Agency::factory()->for($owner)->create();
$outsider = User::factory()->create(); // no permission granted — the refused cell
```

Never `$user1`/`$user2` — a reviewer (human or agent) shouldn't have to cross-reference back to the matrix to know which persona a variable represents.
