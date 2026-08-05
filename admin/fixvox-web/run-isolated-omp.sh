#!/bin/sh
set -eu
exec sudo -n -u fixvox-agent -- env -i \
  PATH=/opt/fixvox-agent/bin:/usr/local/bin:/usr/bin:/bin \
  HOME="$HOME" USER=fixvox-agent LOGNAME=fixvox-agent LANG="${LANG:-C.UTF-8}" \
  OMP_CHAT_AGENT_ROOTS="$OMP_CHAT_AGENT_ROOTS" \
  OMP_CHAT_AGENT_AUDIT_PATH="$OMP_CHAT_AGENT_AUDIT_PATH" \
  OMP_CHAT_WORKSPACE_BROKER_SOCKET="$OMP_CHAT_WORKSPACE_BROKER_SOCKET" \
  OMP_CHAT_CONSTELACIONES_SOCKET="$OMP_CHAT_CONSTELACIONES_SOCKET" \
  OMP_CHAT_REMOTE_AGENT=1 \
  /opt/fixvox-agent/bin/omp "$@"
