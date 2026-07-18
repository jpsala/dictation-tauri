#!/bin/sh
set -eu
exec sudo -n -u fixvox-agent -- env -i \
  PATH=/usr/local/bin:/usr/bin:/bin \
  HOME="$HOME" USER=fixvox-agent LOGNAME=fixvox-agent LANG="${LANG:-C.UTF-8}" \
  PI_CODING_AGENT_DIR="$PI_CODING_AGENT_DIR" \
  PI_CHAT_AGENT_ROOTS="$PI_CHAT_AGENT_ROOTS" \
  PI_CHAT_AGENT_AUDIT_PATH="$PI_CHAT_AGENT_AUDIT_PATH" \
  PI_CHAT_WORKSPACE_BROKER_SOCKET="$PI_CHAT_WORKSPACE_BROKER_SOCKET" \
  PI_CHAT_CONSTELACIONES_SOCKET="$PI_CHAT_CONSTELACIONES_SOCKET" \
  PI_CHAT_REMOTE_AGENT=1 \
  /usr/bin/node /opt/fixvox-agent/pi-runtime/dist/cli.js "$@"
