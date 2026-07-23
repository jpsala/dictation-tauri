#!/usr/bin/env bash

# Local orchestration primitives for a future explicitly approved Gate F run.
# This file is sourceable and performs no external operation by itself.

_gate_f_require_function() {
  local function_name="${1:-}" label="${2:-function}"
  if [[ ! "$function_name" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || ! declare -F "$function_name" >/dev/null; then
    printf 'gate_f_error=invalid_%s\n' "$label" >&2
    return 64
  fi
}

_gate_f_sleep() {
  sleep "$1"
}

gate_f_poll_readiness() {
  local timeout_seconds="${1:-}" interval_seconds="${2:-}" readiness_fn="${3:-}"
  local sleep_fn="${GATE_F_SLEEP_FN:-_gate_f_sleep}"

  [[ "$timeout_seconds" =~ ^[0-9]+$ ]] || {
    printf 'gate_f_error=invalid_readiness_timeout\n' >&2
    return 64
  }
  [[ "$interval_seconds" =~ ^[1-9][0-9]*$ ]] || {
    printf 'gate_f_error=invalid_readiness_interval\n' >&2
    return 64
  }
  _gate_f_require_function "$readiness_fn" readiness_function || return
  _gate_f_require_function "$sleep_fn" sleep_function || return

  local elapsed=0 delay
  while true; do
    if "$readiness_fn"; then
      return 0
    fi
    if ((elapsed >= timeout_seconds)); then
      return 124
    fi

    delay="$interval_seconds"
    if ((delay > timeout_seconds - elapsed)); then
      delay=$((timeout_seconds - elapsed))
    fi
    "$sleep_fn" "$delay" || return
    elapsed=$((elapsed + delay))
  done
}

_gate_f_recover_once() {
  local original_status="${1:-1}"
  if [[ "${GATE_F_RECOVERY_ENTERED:-0}" == "1" ]]; then
    return 0
  fi

  GATE_F_RECOVERY_ENTERED=1
  trap - EXIT

  local recovery_status=0 baseline_status=0
  "$GATE_F_RECOVERY_FN" || recovery_status=$?
  "$GATE_F_BASELINE_FN" || baseline_status=$?
  printf 'gate_f_recovery_status=%d gate_f_baseline_status=%d original_status=%d\n' \
    "$recovery_status" "$baseline_status" "$original_status" >&2
  exit "$original_status"
}

gate_f_run_after_mutation() (
  local mutation_fn="${1:-}" postcheck_fn="${2:-}" recovery_fn="${3:-}" baseline_fn="${4:-}"
  _gate_f_require_function "$mutation_fn" mutation_function || return
  _gate_f_require_function "$postcheck_fn" postcheck_function || return
  _gate_f_require_function "$recovery_fn" recovery_function || return
  _gate_f_require_function "$baseline_fn" baseline_function || return

  local mutation_status=0 postcheck_status=0
  "$mutation_fn" || mutation_status=$?
  if ((mutation_status != 0)); then
    return "$mutation_status"
  fi

  GATE_F_RECOVERY_FN="$recovery_fn"
  GATE_F_BASELINE_FN="$baseline_fn"
  GATE_F_RECOVERY_ENTERED=0
  trap '_gate_f_recover_once "$?"' EXIT

  "$postcheck_fn" || postcheck_status=$?
  if ((postcheck_status == 0)); then
    trap - EXIT
    return 0
  fi
  return "$postcheck_status"
)
