#!/usr/bin/env node
// Thin wrapper so the scaffolder is reachable through `npx test-casebook-back-php`.
// The scaffolder itself is bin/casebook-back-init.php — this only locates a PHP
// binary and forwards the arguments unchanged.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = dirname(here)
const script = join(here, 'casebook-back-init.php')
const php = process.env.PHP_BINARY || 'php'

const { name: PKG_NAME, version: PKG_VERSION } = JSON.parse(
    readFileSync(join(pkgRoot, 'package.json'), 'utf8')
)

function isNewer(a, b) {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return true
        if ((pa[i] || 0) < (pb[i] || 0)) return false
    }
    return false
}

async function checkForUpdate() {
    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 1500)
        const res = await fetch(`https://registry.npmjs.org/${PKG_NAME}/latest`, {
            signal: controller.signal,
        })
        clearTimeout(timeout)
        if (!res.ok) return
        const { version: latest } = await res.json()
        if (latest && isNewer(latest, PKG_VERSION)) {
            console.log(
                `\nA newer version of ${PKG_NAME} is available: ${PKG_VERSION} -> ${latest}.`
            )
            console.log(
                `Update with: npm i -D ${PKG_NAME}@latest (or bump the pin and rerun "npx ${PKG_NAME} init --force").`
            )
        }
    } catch {
        // offline or registry unreachable: stay silent, never block the scaffolder
    }
}

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
await checkForUpdate()
process.exit(result.status ?? 1)
