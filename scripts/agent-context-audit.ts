import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type Finding = {
  level: "error" | "warn";
  message: string;
};

const root = process.cwd();
const findings: Finding[] = [];

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function exists(path: string) {
  return existsSync(join(root, path));
}

function add(level: Finding["level"], message: string) {
  findings.push({ level, message });
}

function approxTokens(content: string) {
  return approxTokensFromChars(content.length);
}

function approxTokensFromChars(chars: number) {
  return Math.ceil(chars / 4);
}

function warnIfTooLarge(path: string, maxChars: number, label: string) {
  if (!exists(path)) return;
  const content = read(path);
  if (content.length > maxChars) {
    add(
      "warn",
      `${label} is large (${content.length} chars, ~${approxTokens(content)} tokens); compact or move detail to deeper references`,
    );
  }
}

function topicFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return match[1];
}

function hasFrontmatterKey(frontmatter: string, key: string) {
  return new RegExp(`^${key}:`, "m").test(frontmatter);
}

function frontmatterValue(frontmatter: string, key: string) {
  const match = frontmatter.match(new RegExp(`^${key}:[ \\t]*([^\\r\\n]*)`, "m"));
  return match?.[1]?.trim();
}

function frontmatterList(frontmatter: string, key: string) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*\\r?\\n((?:\\s+- .+\\r?\\n?)+)`, "m"));
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^- /, "").trim())
    .filter(Boolean);
}

function modifiedMs(path: string) {
  return statSync(join(root, path)).mtimeMs;
}

if (!exists("docs/WORKING_MEMORY.md")) {
  add("error", "Missing docs/WORKING_MEMORY.md");
}

if (!exists("docs/GLOSSARY.md")) {
  add("error", "Missing docs/GLOSSARY.md");
}

if (!exists("docs/TOPICS.md")) {
  add("error", "Missing docs/TOPICS.md");
}

warnIfTooLarge("AGENTS.md", 6000, "AGENTS.md");
warnIfTooLarge("docs/README.md", 5000, "docs/README.md");
warnIfTooLarge("docs/WORKING_MEMORY.md", 6000, "docs/WORKING_MEMORY.md");
warnIfTooLarge("docs/TOPICS.md", 6000, "docs/TOPICS.md");
warnIfTooLarge("docs/DEVELOPMENT.md", 9000, "docs/DEVELOPMENT.md");

if (exists("AGENTS.md") && exists("docs/WORKING_MEMORY.md")) {
  const hotPathFiles = [
    "AGENTS.md",
    "docs/.generated/context-index.md",
    "docs/WORKING_MEMORY.md",
  ].filter(exists);
  const hotPathChars = hotPathFiles.reduce((total, path) => total + read(path).length, 0);

  if (hotPathChars > 18000) {
    add(
      "warn",
      `Hot context path is large (${hotPathChars} chars, ~${approxTokensFromChars(hotPathChars)} tokens across ${hotPathFiles.join(", ")}); reduce initial reading load`,
    );
  }
}

const topicsDir = join(root, "docs", "topics");
const topicFiles = existsSync(topicsDir)
  ? readdirSync(topicsDir).filter((name) => name.endsWith(".md")).sort()
  : [];

if (!topicFiles.length) {
  add("error", "No docs/topics/*.md files found");
}

const topicsIndex = exists("docs/TOPICS.md") ? read("docs/TOPICS.md") : "";

for (const file of topicFiles) {
  const topicPath = join("docs", "topics", file);
  const content = read(topicPath);
  const frontmatter = topicFrontmatter(content);

  if (!frontmatter) {
    add("warn", `${topicPath} has no frontmatter`);
  } else {
    for (const key of ["id", "status", "kind", "triggers", "primary_refs"]) {
      if (!hasFrontmatterKey(frontmatter, key)) {
        add("warn", `${topicPath} frontmatter missing ${key}`);
      }
    }

    const status = frontmatterValue(frontmatter, "status");
    const maxChars = status === "reference" || status === "historical" ? 12000 : 9000;

    if (content.length > maxChars) {
      add(
        "warn",
        `${topicPath} is large (${content.length} chars, ~${approxTokens(content)} tokens); keep active topics as routers and move detail deeper`,
      );
    }
  }

  if (!topicsIndex.includes(`topics/${file}`)) {
    add("warn", `${topicPath} is not linked from docs/TOPICS.md`);
  }
}

const topicLinks = [...topicsIndex.matchAll(/\]\(topics\/([^)]+\.md)\)/g)].map(
  (match) => match[1],
);

for (const link of topicLinks) {
  if (!exists(join("docs", "topics", link))) {
    add("error", `docs/TOPICS.md links missing topic docs/topics/${link}`);
  }
}

function walkMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkMarkdownFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

const taskStatuses = new Set([
  "pending",
  "active",
  "paused",
  "blocked",
  "done",
  "archived",
  "reference",
]);
const taskPriorities = new Set(["low", "medium", "high", "critical"]);

if (!exists("docs/tasks")) {
  add("warn", "Missing docs/tasks/");
} else {
  if (!exists("docs/tasks/README.md")) {
    add("warn", "Missing docs/tasks/README.md");
  }

  if (!exists("docs/tasks/TEMPLATE.md")) {
    add("warn", "Missing docs/tasks/TEMPLATE.md");
  }

  if (!exists("docs/tasks/archive")) {
    add("warn", "Missing docs/tasks/archive/");
  }

  for (const file of walkMarkdownFiles(join(root, "docs", "tasks"))) {
    const taskPath = relative(root, file).replaceAll("\\", "/");
    const content = read(taskPath);
    const frontmatter = topicFrontmatter(content);

    if (!frontmatter) {
      add("warn", `${taskPath} has no frontmatter`);
      continue;
    }

    for (const key of ["status", "started", "updated", "priority"]) {
      if (!hasFrontmatterKey(frontmatter, key)) {
        add("warn", `${taskPath} frontmatter missing ${key}`);
      }
    }

    const status = frontmatterValue(frontmatter, "status");
    const priority = frontmatterValue(frontmatter, "priority");
    const topic = frontmatterValue(frontmatter, "topic");
    const refs = [
      ...frontmatterList(frontmatter, "related"),
      ...frontmatterList(frontmatter, "source_refs"),
    ];
    const isArchivedPath = taskPath.startsWith("docs/tasks/archive/");

    if (status && !taskStatuses.has(status)) {
      add("warn", `${taskPath} has unknown task status ${status}`);
    }

    if (priority && !taskPriorities.has(priority)) {
      add("warn", `${taskPath} has unknown task priority ${priority}`);
    }

    if (status === "archived" && !isArchivedPath) {
      add("warn", `${taskPath} has archived status outside docs/tasks/archive/`);
    }

    if (isArchivedPath && status !== "archived") {
      add("warn", `${taskPath} is in docs/tasks/archive/ without archived status`);
    }

    const maxChars =
      status === "archived" || status === "reference" || status === "done" ? 12000 : 8000;

    if (content.length > maxChars) {
      add(
        "warn",
        `${taskPath} is large (${content.length} chars, ~${approxTokens(content)} tokens); tasks should be resumable work state, not transcripts`,
      );
    }

    if (topic && !exists(topic)) {
      add("warn", `${taskPath} topic points to missing file ${topic}`);
    }

    for (const ref of refs) {
      if (!exists(ref)) {
        add("warn", `${taskPath} points to missing ref ${ref}`);
      }
    }
  }
}

if (!exists("docs/.generated/context-index.md")) {
  add("warn", "Missing generated context index docs/.generated/context-index.md");
} else {
  const indexTime = modifiedMs("docs/.generated/context-index.md");
  for (const path of [
    "docs/WORKING_MEMORY.md",
    "docs/GLOSSARY.md",
    "docs/TOPICS.md",
    "docs/tasks/README.md",
  ]) {
    if (exists(path) && modifiedMs(path) > indexTime) {
      add("warn", `docs/.generated/context-index.md is older than ${path}`);
    }
  }
}

const errors = findings.filter((finding) => finding.level === "error");
const warnings = findings.filter((finding) => finding.level === "warn");

if (!findings.length) {
  console.log("Agent context audit passed.");
  process.exit(0);
}

for (const finding of findings) {
  console.log(`${finding.level.toUpperCase()}: ${finding.message}`);
}

console.log(
  `Agent context audit found ${errors.length} error(s), ${warnings.length} warning(s).`,
);

process.exit(errors.length ? 1 : 0);
