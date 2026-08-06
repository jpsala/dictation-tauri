import { expect, test } from "bun:test";
import { validateTraycerRoutingPolicy } from "./traycer-routing-contract.ts";

const policy = [
  "version: 14",
  "policy: traycer_native_intent_first",
  "runtime:",
  "  control_plane: traycer",
  "  harness: codex",
  "  fallback_harness: omp",
  "  fallback_mode: manual_only",
  "  daily_entry: conversation",
  "execution:",
  "  automatic_fallback: false",
  "  automatic_new_session: false",
  "  automatic_send: false",
  "coordination:",
  "  agents: explicit_user_request_only",
  "  handoff: demand_only",
  "  worktrees: isolated_for_concurrency_only",
  "workflow:",
  "  implementation:",
  "    tools: native_harness",
  "approval:",
  "  mode: single_batch_envelope",
  "  local_reversible: proceed",
].join("\n");
const portable =
  "Traycer harness nativo diario; OMP standalone/manual; handoff objetivo rama/worktree decisiones archivos/cambios checks siguiente gate; no requiere .traycer.";

test("accepts the structured Traycer contract without Pi usage", () => {
  expect(validateTraycerRoutingPolicy(policy, portable)).toEqual([]);
});

test("accepts an explicit product/lab Pi block list", () => {
  const withPi = policy.replace(
    "  daily_entry: conversation",
    "  pi_usage:\n    - product_runtime\n    - harness_lab\n  daily_entry: conversation",
  );
  expect(validateTraycerRoutingPolicy(withPi, portable)).toEqual([]);
});

test("rejects a mutated control plane", () => {
  expect(
    validateTraycerRoutingPolicy(
      policy.replace("control_plane: traycer", "control_plane: omp"),
      portable,
    ),
  ).toContain("runtime.control_plane must be traycer");
});

test("rejects duplicate critical mappings and additional OMP authority", () => {
  const duplicateVersion = policy + "\nversion: 14";
  expect(validateTraycerRoutingPolicy(duplicateVersion, portable)).toEqual(
    expect.arrayContaining([expect.stringContaining("duplicate/conflicting version")]),
  );
  const misplacedControlPlane = policy.replace(
    "coordination:\n",
    "coordination:\n  control_plane: omp\n",
  );
  expect(validateTraycerRoutingPolicy(misplacedControlPlane, portable)).toEqual(
    expect.arrayContaining([expect.stringContaining("control_plane outside runtime.control_plane")]),
  );
  const additionalAuthority = policy.replace(
    "coordination:\n",
    "coordination:\n  omp_authority: daily\n",
  );
  expect(validateTraycerRoutingPolicy(additionalAuthority, portable)).toEqual(
    expect.arrayContaining([expect.stringContaining("additional OMP/AXI authority")]),
  );
});

test("rejects flow collections and critical mode outside approval", () => {
  const flow = policy.replace(
    "execution:\n",
    "execution:\n  support_tools: [search, read]\n",
  );
  expect(validateTraycerRoutingPolicy(flow, portable)).toContain(
    "unsupported YAML syntax at line 10",
  );
  const misplacedMode = policy.replace(
    "workflow:\n",
    "workflow:\n  mode: current_session\n",
  );
  expect(
    validateTraycerRoutingPolicy(misplacedMode, portable).some((error) =>
      error.includes("critical mode outside approval.mode"),
    ),
  ).toBe(true);
});

test("rejects duplicate and misplaced automatic_send", () => {
  const misplaced = policy.replace(
    "coordination:\n",
    "coordination:\n  automatic_send: true\n",
  );
  expect(validateTraycerRoutingPolicy(misplaced, portable)).toEqual(
    expect.arrayContaining([expect.stringContaining("automatic_send outside execution.automatic_send")]),
  );
  const duplicate = policy.replace(
    "  automatic_send: false\n",
    "  automatic_send: false\n  automatic_send: true\n",
  );
  expect(validateTraycerRoutingPolicy(duplicate, portable)).toEqual(
    expect.arrayContaining([expect.stringContaining("duplicate/conflicting automatic_send")]),
  );
});

test("rejects narrative without structured policy", () => {
  expect(
    validateTraycerRoutingPolicy("Traycer is preferred", portable).length,
  ).toBeGreaterThan(0);
});
