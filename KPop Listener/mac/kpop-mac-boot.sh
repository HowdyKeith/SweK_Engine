#!/usr/bin/env bash
# KPop Listener — macOS boot/login autostart via launchd.
#
# The Python listener (KPopListener.py) runs fine on macOS (Unix-domain socket at
# /tmp/KPopListenerPipe.sock), but nothing starts it at boot the way the Windows
# Run_Listener*.bat files do. This installs a launchd LaunchAgent so it starts at
# login and stays up.
#
# Usage:
#   ./kpop-mac-boot.sh check        # report install + run status (default)
#   ./kpop-mac-boot.sh install      # write + load the LaunchAgent
#   ./kpop-mac-boot.sh uninstall    # unload + remove it
#   ./kpop-mac-boot.sh restart      # reload it
#   ./kpop-mac-boot.sh status       # launchd job + socket status
set -euo pipefail

LABEL="com.kpop.listener"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LISTENER_DIR="$(cd "$HERE/.." && pwd)"
SCRIPT="$LISTENER_DIR/KPopListener.py"
PLIST_SRC="$HERE/com.kpop.listener.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
SOCK="/tmp/KPopListenerPipe.sock"

py() { command -v python3 2>/dev/null || command -v python 2>/dev/null || true; }

cmd_install() {
  local PY; PY="$(py)"
  [ -n "$PY" ]      || { echo "python3 not found on PATH"; exit 1; }
  [ -f "$SCRIPT" ]  || { echo "listener not found: $SCRIPT"; exit 1; }
  [ -f "$PLIST_SRC" ] || { echo "plist template missing: $PLIST_SRC"; exit 1; }
  mkdir -p "$HOME/Library/LaunchAgents"
  sed -e "s#__PYTHON__#$PY#g" \
      -e "s#__SCRIPT__#$SCRIPT#g" \
      -e "s#__WORKDIR__#$LISTENER_DIR#g" \
      "$PLIST_SRC" > "$PLIST_DST"
  launchctl unload "$PLIST_DST" 2>/dev/null || true
  launchctl load -w "$PLIST_DST"
  echo "installed + loaded: $PLIST_DST"
  echo "  python : $PY"
  echo "  script : $SCRIPT"
  cmd_status
}

cmd_uninstall() {
  launchctl unload "$PLIST_DST" 2>/dev/null || true
  rm -f "$PLIST_DST"
  echo "uninstalled: $PLIST_DST"
}

cmd_restart() {
  [ -f "$PLIST_DST" ] || { echo "not installed; run: $0 install"; exit 1; }
  launchctl unload "$PLIST_DST" 2>/dev/null || true
  launchctl load -w "$PLIST_DST"
  echo "restarted"
  cmd_status
}

cmd_status() {
  printf 'launchd job     : '
  if launchctl list 2>/dev/null | grep -q "$LABEL"; then
    launchctl list 2>/dev/null | awk -v L="$LABEL" '$3==L {print "loaded (pid "$1", last exit "$2")"}'
  else
    echo "not loaded"
  fi
  printf 'ipc socket      : '
  if [ -S "$SOCK" ]; then echo "present ($SOCK)"; else echo "absent (listener not bound yet)"; fi
}

cmd_check() {
  echo "== KPop Listener — macOS boot check =="
  printf 'plist installed : '
  if [ -f "$PLIST_DST" ]; then echo "yes ($PLIST_DST)"; else echo "NO  (run: $0 install)"; fi
  printf 'python3         : '
  local PY; PY="$(py)"; [ -n "$PY" ] && echo "$PY" || echo "MISSING"
  printf 'listener script : '
  [ -f "$SCRIPT" ] && echo "$SCRIPT" || echo "MISSING ($SCRIPT)"
  cmd_status
  echo "logs            : /tmp/kpop-listener.out.log  /tmp/kpop-listener.err.log"
}

case "${1:-check}" in
  install)   cmd_install ;;
  uninstall) cmd_uninstall ;;
  restart)   cmd_restart ;;
  status)    cmd_status ;;
  check|*)   cmd_check ;;
esac
