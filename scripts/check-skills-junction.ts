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
  fail("Missing compatibility path docs/skills");
}

const canonReal = realpathSync.native(canon);
const compatReal = realpathSync.native(compat);

if (canonReal !== compatReal) {
  fail(`docs/skills must resolve to docs/skills. Got ${compatReal}, expected ${canonReal}`);
}

console.log("docs/skills resolves to docs/skills");
