import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const taskArgIndex = process.argv.indexOf("--task");
const taskPath = taskArgIndex >= 0 ? process.argv[taskArgIndex + 1] : "";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function exists(path: string) {
  return existsSync(join(root, path));
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function frontmatter(content: string) {
  return content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

function value(meta: string, key: string) {
  return meta.match(new RegExp(`^${key}:[ \\t]*([^\\r\\n]*)`, "m"))?.[1]?.trim() ?? "";
}

function listValues(meta: string, key: string) {
  const match = meta.match(new RegExp(`^${key}:\\s*\\r?\\n((?:\\s+- .+\\r?\\n?)+)`, "m"));
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^- /, "").trim())
    .filter(Boolean);
}

if (!taskPath) {
  fail("Usage: bun scripts/context-refresh.ts --task docs/tasks/<task>.md");
}

if (!exists(taskPath)) {
  fail(`Task not found: ${taskPath}`);
}

const task = read(taskPath);
const meta = frontmatter(task);
const topic = value(meta, "topic");
const sourceRefs = listValues(meta, "source_refs");
const related = listValues(meta, "related");

console.log("# Context Refresh");
console.log("");
console.log(`Task: ${taskPath}`);
console.log(`Status: ${value(meta, "status") || "unknown"}`);
console.log(`Priority: ${value(meta, "priority") || "unknown"}`);
console.log(`Updated: ${value(meta, "updated") || "unknown"}`);
console.log("");

if (topic) {
  console.log(`Topic: ${topic} ${exists(topic) ? "OK" : "MISSING"}`);
} else {
  console.log("Topic: not set");
}

console.log("");
console.log("## Related");
if (related.length) {
  for (const path of related) console.log(`- ${path}: ${exists(path) ? "OK" : "MISSING"}`);
} else {
  console.log("- none");
}

console.log("");
console.log("## Source Refs");
if (sourceRefs.length) {
  for (const path of sourceRefs) console.log(`- ${path}: ${exists(path) ? "OK" : "MISSING"}`);
} else {
  console.log("- none");
}

console.log("");
console.log("Review missing refs, then update the task/topic manually or ask the agent to patch them.");
