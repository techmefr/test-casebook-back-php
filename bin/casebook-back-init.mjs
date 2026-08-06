#!/usr/bin/env node
// Thin wrapper so the scaffolder is reachable through `npx test-casebook-back-php`.
// The scaffolder itself is bin/casebook-back-init.php — this only locates a PHP
// binary and forwards the arguments unchanged.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'casebook-back-init.php')
const php = process.env.PHP_BINARY || 'php'

const probe = spawnSync(php, ['--version'], { stdio: 'ignore' })
if (probe.error) {
    console.error(
        `test-casebook-back-php: no PHP binary found (tried "${php}").\n` +
            `Install PHP, or set PHP_BINARY, or run the scaffolder directly:\n` +
            `  php ${script} init --force`
    )
    process.exit(1)
}

const result = spawnSync(php, [script, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
