#!/data/data/com.termux/files/usr/bin/sh
# tools/roundhouse/termux_boot_peer.sh
#
# v2935 -- PERSISTENCE, MEASURED NOT ASSERTED.
#
# Install: copy (or symlink) this file to ~/.termux/boot/ so the Termux:Boot add-on (F-Droid build only; the
# Play Store build is deprecated and will not run boot scripts) executes it when the device finishes booting.
# Termux:Boot runs every executable in ~/.termux/boot/ once per boot, in a minimal environment, so this script
# sets its own PATH and holds a wake-lock before doing anything slow.
#
# WHAT THIS IS FOR. androidPeer.mjs registers a prediction about persistence: Termux:Boot + termux-wake-lock +
# a battery-optimisation exemption SHOULD survive Doze (start-on-boot, stay alive when idle) but should NOT
# survive memory pressure (Android reaps Termux under load because no config makes it a foreground service). That
# is a claim to be GRADED on real hardware, not confirmed by wishful configuration. This script's job is to
# generate the evidence that grades it, and the discipline is the same one the symlink block follows: the script
# performs the persistence SETUP; it records what it OBSERVES; it never writes the verdict.
#
# THE LEDGER IS THE MEASUREMENT. Every boot, this script appends one line to a persistence ledger with: the boot
# timestamp, the device uptime at launch, and -- crucially -- whether the PREVIOUS run exited cleanly or vanished.
# A clean exit means the suite finished and the process ended normally. A vanished run (a "started" with no
# matching "finished") is the fingerprint of a REAP: the OS killed the process mid-run, which is exactly the
# memory-pressure event the prediction says WILL happen. So the ledger distinguishes the two survival questions
# by observation:
#   - survivesDozeWithBootWakeLock  -> did we boot and reach here at all after an idle period? (a fresh line appears)
#   - survivesMemoryPressure        -> did any run vanish between "started" and "finished"? (a reap is recorded)
# The desktop verdict tool reads this ledger; the phone never decides. If the phone shows reaps, the prediction
# is CONFIRMED, not falsified -- the interesting falsification would be a phone that NEVER reaps, which would
# mean it is somehow a foreground service, which would be the surprising and reportable result.

export PATH="/data/data/com.termux/files/usr/bin:$PATH"
cd "$(dirname "$0")/../.." 2>/dev/null || cd "$HOME" || exit 1   # -> WebGLEngine/ if launched from the repo
LEDGER="$HOME/storage/downloads/swek-persistence-ledger.jsonl"
[ -d "$HOME/storage/downloads" ] || LEDGER="$HOME/swek-persistence-ledger.jsonl"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
uptime_s() { cut -d' ' -f1 /proc/uptime 2>/dev/null || echo "?"; }

# -- detect whether the PREVIOUS run vanished (a reap) by inspecting the last ledger line -----------------------------
PREV_REAP="unknown"
if [ -f "$LEDGER" ]; then
    LAST="$(tail -n 1 "$LEDGER" 2>/dev/null)"
    case "$LAST" in
        *'"event":"started"'*)  PREV_REAP="yes" ;;   # a started with no finished after it = the process vanished
        *'"event":"finished"'*) PREV_REAP="no"  ;;   # clean completion last time
        *)                      PREV_REAP="unknown" ;;
    esac
fi

# -- hold the wake-lock for the run (courtesy; released on exit/signal) -----------------------------------------------
SWEK_WAKE=0
if command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock 2>/dev/null; then
    SWEK_WAKE=1
    trap 'if [ "$SWEK_WAKE" = "1" ]; then termux-wake-unlock 2>/dev/null; fi' EXIT INT TERM
fi

# -- record the boot: a fresh line here IS the Doze-survival evidence (we came back up and ran) -----------------------
BOOT_TS="$(now)"; UP="$(uptime_s)"
printf '{"event":"started","boot":"%s","uptimeAtLaunch":%s,"previousRunReaped":"%s","wakeLock":%s}\n' \
    "$BOOT_TS" "${UP:-0}" "$PREV_REAP" "$([ "$SWEK_WAKE" = "1" ] && echo true || echo false)" >> "$LEDGER"


# -- v2950: flush any queued results before anything else. A boot is the natural retry moment -- the network is
# usually up and the device is awake. This is why an unreachable hub is only ever a delay: every boot tries again.
sh tools/roundhouse/swek_outbox.sh >> "$LEDGER.outbox.log" 2>&1 || true

# -- run the one-shot peer (bootstrap does the install/symlink/suite; this script only wraps it for boot) -------------
if [ -x tools/roundhouse/termux_peer.sh ]; then
    sh tools/roundhouse/termux_peer.sh
    RUN_RC=$?
else
    # not launched from the repo: nothing to run, but the boot line above still records Doze survival
    RUN_RC=127
fi

# -- record the clean finish: the presence of THIS line after a "started" is what proves no reap occurred -------------
printf '{"event":"finished","boot":"%s","exit":%s,"uptimeAtFinish":%s}\n' \
    "$BOOT_TS" "$RUN_RC" "$(uptime_s)" >> "$LEDGER"

# NOTE: this script writes "started" and "finished" but NEVER writes survivesDoze or survivesMemoryPressure. Those
# are derived by the desktop verdict tool from the pattern of lines across boots -- the phone measures, the tool
# adjudicates, and the prediction is graded rather than confirmed.
