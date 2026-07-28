#!/usr/bin/env php
<?php

declare(strict_types=1);

$pkgRoot = dirname(__DIR__);
$cwd = getcwd();
$args = array_slice($argv, 1);
$command = $args[0] ?? null;
$force = in_array('--force', $args, true);

$assets = ['AGENTS.md', 'docs', '.claude'];

function walk(string $dir): array
{
    $out = [];
    foreach (scandir($dir) as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $full = $dir . DIRECTORY_SEPARATOR . $entry;
        if (is_dir($full)) {
            $out = array_merge($out, walk($full));
        } else {
            $out[] = $full;
        }
    }
    return $out;
}

function copyAsset(string $pkgRoot, string $cwd, string $name, bool $force): array
{
    $src = $pkgRoot . DIRECTORY_SEPARATOR . $name;
    if (!file_exists($src)) {
        return ['copied' => [], 'skipped' => []];
    }
    $copied = [];
    $skipped = [];
    $files = is_dir($src) ? walk($src) : [$src];
    foreach ($files as $file) {
        $rel = ltrim(str_replace($pkgRoot, '', $file), DIRECTORY_SEPARATOR);
        $dest = $cwd . DIRECTORY_SEPARATOR . $rel;
        if (file_exists($dest) && !$force) {
            $skipped[] = $rel;
            continue;
        }
        @mkdir(dirname($dest), 0777, true);
        copy($file, $dest);
        $copied[] = $rel;
    }
    return ['copied' => $copied, 'skipped' => $skipped];
}

function usage(): void
{
    echo "test-casebook-back — testing methodology scaffolder\n\n";
    echo "Usage:\n";
    echo "  php bin/casebook-back-init.php init [--force]\n\n";
    echo "  init     copy AGENTS.md, docs/ and .claude/ into the current project\n";
    echo "  --force  overwrite files that already exist\n";
    echo "\nNote: this is a plain script, not yet a Composer package with an `artisan casebook:init`\n";
    echo "wrapper — that's a natural fast-follow once this repo is published. For now, run it\n";
    echo "directly from a checkout of this repo, pointed at your target project's directory.\n";
}

function init(string $pkgRoot, string $cwd, array $assets, bool $force): void
{
    $copied = [];
    $skipped = [];
    foreach ($assets as $asset) {
        $result = copyAsset($pkgRoot, $cwd, $asset, $force);
        $copied = array_merge($copied, $result['copied']);
        $skipped = array_merge($skipped, $result['skipped']);
    }

    echo "\ntest-casebook-back — scaffolded into {$cwd}\n\n";
    if ($copied) {
        echo 'Added ' . count($copied) . " file(s):\n";
        foreach ($copied as $file) {
            echo "  + {$file}\n";
        }
    }
    if ($skipped) {
        echo "\nSkipped " . count($skipped) . " existing file(s) (use --force to overwrite):\n";
        foreach ($skipped as $file) {
            echo "  = {$file}\n";
        }
    }
    echo "\nNext steps:\n";
    echo "  1. Open this project in Claude Code and invoke the \"test-casebook-back\" skill.\n";
    echo "  2. Read AGENTS.md's \"Core vs optional\" table — it only applies the Lomkit-specific\n";
    echo "     guide if lomkit/laravel-rest-api is actually in your composer.json.\n";
}

if ($command === 'init') {
    init($pkgRoot, $cwd, $assets, $force);
} else {
    usage();
}
