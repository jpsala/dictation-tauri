import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const canon = join(root, "docs", "skills");
const compat = join(root, ".agents", "skills");

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!existsSync(canon)) {
  fail("Missing canonical skills directory docs/skills");
}

if (!existsSync(compat)) {
  console.log(
    ".agents/skills discovery is disabled; canonical docs/skills exists",
  );
  process.exit(0);
}

const canonReal = realpathSync.native(canon);
const compatReal = realpathSync.native(compat);

if (canonReal !== compatReal) {
  fail(`.agents/skills must resolve to docs/skills. Got ${compatReal}, expected ${canonReal}`);
}

console.log(".agents/skills resolves to docs/skills");
