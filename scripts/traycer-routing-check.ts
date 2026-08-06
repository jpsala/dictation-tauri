import { existsSync, readFileSync } from "node:fs";
import { validateTraycerRoutingPolicy } from "./traycer-routing-contract.ts";

const policyPath = "docs/reference/tool-routing.yaml";
const portablePath = "docs/topics/portable-multiharness-contract.md";
const errors = validateTraycerRoutingPolicy(
  existsSync(policyPath) ? readFileSync(policyPath, "utf8") : "",
  existsSync(portablePath) ? readFileSync(portablePath, "utf8") : "",
);
if (!existsSync(policyPath)) errors.push(`Missing ${policyPath}`);
if (!existsSync(portablePath)) errors.push(`Missing ${portablePath}`);
if (errors.length) {
  errors.forEach((error) => console.error(`ERROR: ${error}`));
  process.exitCode = 1;
} else {
  console.log("Traycer portable routing contract passed.");
}
