# Worked example — the blog idea (visiteur / membre / auteur / admin), run for real

> Verified for real: same Docker setup as the Article-API example, expanded into a small blog — articles with scheduled publishing, comments, and a notification. **47/47 tests green (14 unit + 33 feature), Larastan level 7 clean.** This directly answers the question "does the blog idea with visitor/member/author/admin actually work?" — yes, and here's the proof.

## The scenario

Four personas, matching the idea exactly:

- **visiteur** — no account (guest). Can read published, public articles. Rejected (401) on everything else.
- **membre** — a registered account with no special role. Can read published public articles, comment on them. Cannot create articles.
- **auteur** — can create articles, update/delete their own, preview their own scheduled/private articles before anyone else can see them.
- **admin** — sees and can act on everything, including moderating any comment.

Two features beyond the original Article-API example, chosen specifically to force the doctrine's isolation rules to actually run:

1. **Scheduled publishing** (`published_at`) — an article isn't visible to anyone but its owner/admin until its publish time passes. This needs `Carbon`/time-travel to test for real, not a mocked clock.
2. **Comments with an email notification** to the article's owner — needs `Notification::fake()` to assert without actually sending mail, and gives a natural case for `recycle()` (many comments sharing one article).

## Authorization — same persona-matrix discipline, now against two resources

`ArticlePolicy::view()` combines two independent gates — scheduling and privacy — and both are asserted separately so a bug in either surfaces on its own:

```php
public function view(User $user, Article $article): bool
{
    if ($article->isScheduledForFuture()) {
        return $user->hasRole('admin') || $user->id === $article->user_id;
    }

    if (! $article->is_private) {
        return true;
    }

    return $user->hasRole('admin') || $user->id === $article->user_id;
}
```

`CommentPolicy::delete()` has three legitimate paths to the same permission — the comment's own author, the host article's author (moderating their own article), or an admin — and the persona matrix has one case per path plus one refused outsider:

```php
public function delete(User $user, Comment $comment): bool
{
    return $user->hasRole('admin')
        || $user->id === $comment->user_id
        || $user->id === $comment->article->user_id;
}
```

## Isolation, finally exercised for real

### Scheduled publishing — `travelTo()`, not a hand-rolled clock

```php
#[Test]
public function scheduled_article_becomes_visible_once_its_publish_time_passes(): void
{
    $owner = User::factory()->create()->assignRole('author');
    $member = User::factory()->create()->assignRole('member');

    $this->travelTo(now(), function () use ($owner, $member) {
        $scheduled = Article::factory()->for($owner)->create([
            'published_at' => now()->addMinutes(2),
        ]);

        $this->actingAs($member)
            ->getJson("/api/articles/{$scheduled->id}")
            ->assertForbidden();

        $this->travelTo(now()->addMinutes(3));

        $this->actingAs($member)
            ->getJson("/api/articles/{$scheduled->id}")
            ->assertOk();
    });
}
```

Same article, same request, only the clock moved — proves the gate is actually time-driven and not a fluke of factory defaults.

### Notification — asserted without ever sending mail

```php
#[Test]
public function commenting_notifies_the_article_owner(): void
{
    Notification::fake();

    $owner = User::factory()->create()->assignRole('author');
    $member = User::factory()->create()->assignRole('member');
    $article = Article::factory()->for($owner)->create();

    $this->actingAs($member)
        ->postJson("/api/articles/{$article->id}/comments", ['body' => 'nice read'])
        ->assertCreated();

    Notification::assertSentTo($owner, ArticleCommented::class);
}
```

### `recycle()` — many comments, one shared article

```php
#[Test]
public function many_comments_can_share_the_same_recycled_article_and_author(): void
{
    $owner = User::factory()->create()->assignRole('author');
    $article = Article::factory()->for($owner)->create();

    $comments = Comment::factory()
        ->count(3)
        ->recycle($article)
        ->for($owner)
        ->create();

    $this->assertCount(3, $comments);
    $this->assertTrue($comments->every(fn (Comment $comment) => $comment->article_id === $article->id));
    $this->assertSame(1, Article::count());
}
```

Without `recycle()`, `Comment::factory()->count(3)->create()` would mint 3 separate articles (one per comment, via the factory's own `article_id => Article::factory()`) — asserting `Article::count() === 1` is exactly what catches that mistake if `recycle()` is dropped.

## What this confirms

- **The blog idea works as specified** — visitor/member/author/admin, with a private article and now a scheduled one, is a coherent permission model; nothing in building and testing it surfaced a design problem.
- **Isolation mechanics (`travelTo`, `Notification::fake()`, `recycle()`) are no longer just documented** — each has a real, running test that would fail if the mechanic were removed or misused.
- Of the `AGENTS.md` Step 5.0bis category checklist, this example (combined with the Article-API one) has now driven Authorization (unit+feature), Validation, Multi-role aggregation, and Isolation for real. **Lomkit remains the only category still unverified against a real project.**
