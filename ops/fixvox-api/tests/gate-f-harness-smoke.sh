#!/usr/bin/env bash
set -euo pipefail
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_DIR="$(cd "$TEST_DIR/.." && pwd)"
HARNESS="$OPS_DIR/gate-f-harness.sh"

bash -n "$HARNESS"
bash -n "${BASH_SOURCE[0]}"
# shellcheck disable=SC1090
source "$HARNESS"

tmp="$(mktemp -d "${TMPDIR:-/tmp}/fixvox-gate-f-harness.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

sleep_calls=0
stub_sleep() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
  sleep_calls=$((sleep_calls + 1))
}
# Consumed indirectly by the sourced harness.
# shellcheck disable=SC2034
GATE_F_SLEEP_FN=stub_sleep

readiness_calls=0
delayed_readiness() {
  readiness_calls=$((readiness_calls + 1))
  ((readiness_calls >= 3))
}
gate_f_poll_readiness 5 1 delayed_readiness
[[ "$readiness_calls" == "3" && "$sleep_calls" == "2" ]]

readiness_calls=0
sleep_calls=0
never_ready() {
  readiness_calls=$((readiness_calls + 1))
  return 1
}
set +e
gate_f_poll_readiness 3 1 never_ready
poll_status=$?
set -e
[[ "$poll_status" == "124" && "$readiness_calls" == "4" && "$sleep_calls" == "3" ]]

recovery_log="$tmp/recovery.log"
mutation_ok() {
  printf 'mutation\n' >> "$recovery_log"
}
postcheck_fails() {
  printf 'postcheck\n' >> "$recovery_log"
  return 42
}
recovery_fails_after_reentry_attempt() {
  printf 'recovery\n' >> "$recovery_log"
  _gate_f_recover_once 99
  printf 'recovery_after_reentry\n' >> "$recovery_log"
  return 17
}
baseline_fails() {
  printf 'baseline\n' >> "$recovery_log"
  return 23
}
set +e
gate_f_run_after_mutation mutation_ok postcheck_fails recovery_fails_after_reentry_attempt baseline_fails 2>"$tmp/recovery.stderr"
recovery_status=$?
set -e
[[ "$recovery_status" == "42" ]]
[[ "$(grep -c '^recovery$' "$recovery_log")" == "1" ]]
[[ "$(grep -c '^baseline$' "$recovery_log")" == "1" ]]
grep -Fxq 'recovery_after_reentry' "$recovery_log"
grep -Fxq 'gate_f_recovery_status=17 gate_f_baseline_status=23 original_status=42' "$tmp/recovery.stderr"

mutation_log="$tmp/mutation-failure.log"
mutation_fails() {
  printf 'mutation\n' >> "$mutation_log"
  return 31
}
should_not_run() {
  printf 'unexpected\n' >> "$mutation_log"
}
set +e
gate_f_run_after_mutation mutation_fails should_not_run should_not_run should_not_run >/dev/null 2>&1
mutation_status=$?
set -e
[[ "$mutation_status" == "31" ]]
[[ "$(wc -l < "$mutation_log")" == "1" ]]

printf 'gate_f_harness_smoke=ok delayed_calls=3 timeout_calls=4 timeout_status=124 recovery_calls=1 baseline_calls=1 original_status=42\n'
