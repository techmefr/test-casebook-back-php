#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

let input = {};
try {
  input = JSON.parse(Buffer.concat(chunks).toString() || "{}");
} catch {
  process.exit(0);
}

const filePath = input?.tool_input?.file_path ?? "";
const isPhpTest = /Test\.php$/.test(filePath) && /(^|\/)tests\//i.test(filePath);
if (!isPhpTest) process.exit(0);

let dir = dirname(filePath);
while (true) {
  if (existsSync(join(dir, "task-test.md"))) process.exit(0);
  const atRepoRoot = existsSync(join(dir, ".git"));
  const parent = dirname(dir);
  if (atRepoRoot || parent === dir) break;
  dir = parent;
}

console.error(
  "test-casebook-back: no task-test.md plan found above this test file. Do not write tests directly — invoke the test-casebook-back skill: it builds the task-test.md plan first, then delegates each block to the test-writer-back sub-agent and gates it with test-reviewer-back before commit.",
);
process.exit(2);
