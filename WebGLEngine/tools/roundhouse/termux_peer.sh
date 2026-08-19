#!/data/data/com.termux/files/usr/bin/bash
# tools/roundhouse/termux_peer.sh
#
# v2920 -- THE PHONE'S SIDE OF THE ROUND. Run this inside Termux from the WebGLEngine directory of an unzipped
# SweK build. It performs the registered steps in order, records what the registration needs recorded, and
# leaves ONE artifact: android-phone.json, dropped into shared Downloads so the desktop can pull it and run
#
#     node tools/roundhouse/androidVerdict.mjs tools/roundhouse/android-reference.json android-phone.json
#
# Every step maps to a claim in ANDROID_REGISTRATION (androidPeer.mjs v2919). Nothing here hides a failure:
# a red npm install is RECORDED red, because a falsified prediction is a result and a fudged one is nothing.
#
# Prerequisites (one-time, manual, by design -- each is a user consent):
#   pkg install nodejs          # Termux's bionic Node
#   termux-setup-storage        # creates ~/storage/* bridges to shared storage (Android permission prompt)
#   pkg install termux-api      # optional, for termux-wake-lock
set -u
cd "$(dirname "$0")/../.." || exit 1   # -> WebGLEngine/

echo "== SweK android peer bootstrap (v2928) =="
node --version || { echo "node missing: pkg install nodejs"; exit 1; }

# -- v2928: give mobile V8 room for the long suite, WITHOUT propagating a flag that itself OOMs -----------------------
# The runner spawns each selfcheck as a child `node` process (androidRunner.mjs line 75), and NODE_OPTIONS is
# inherited by spawned children, so setting it here reaches every check. But --max-old-space-size=2048 on a
# 32-bit bionic Node can itself fail to allocate, so the size is chosen from the actual pointer width rather than
# hardcoded: a large heap only where the address space can hold it. A pre-existing NODE_OPTIONS is preserved.
SWEK_BITS="$(node -e 'process.stdout.write(String(process.arch))' 2>/dev/null)"
case "$SWEK_BITS" in
    arm64|x64|ppc64|s390x) SWEK_HEAP=2048 ;;   # 64-bit: room to spare
    *)                     SWEK_HEAP=1024 ;;   # 32-bit (arm, ia32) or unknown: stay under the 32-bit ceiling
esac
export NODE_OPTIONS="--max-old-space-size=${SWEK_HEAP}${NODE_OPTIONS:+ $NODE_OPTIONS}"
echo "-- NODE_OPTIONS=${NODE_OPTIONS} (arch ${SWEK_BITS:-unknown}); propagates to every spawned selfcheck"

# -- claim: npmInstallOmitOptionalSucceeds -- the actual exit code, recorded, not assumed ---------------------------
SWEK_NPM_INSTALL_OK=""
if [ -d ai-bridge ]; then
    echo "-- npm install --omit=optional (the manifest says: no gyp step; the phone now gets to disagree)"
    ( cd ai-bridge && npm install --omit=optional --no-audit --no-fund )
    if [ $? -eq 0 ]; then SWEK_NPM_INSTALL_OK=1; echo "   install: OK"; else SWEK_NPM_INSTALL_OK=0; echo "   install: FAILED (recorded -- this falsifies the claim, which is a result)"; fi
fi

# -- claim: autoUpdateSymlinksRequired = 1 -- make the one symlink, and only if the prediction's precondition holds --
# NOTE (v2928): this block deliberately does NOT set the claim's outcome. It performs the FIX; the RUNNER performs
# the MEASUREMENT (its ~/Downloads probe). Keeping the two apart is the point -- a script that both applied the
# symlink and asserted "1 was required" would be configuring the experiment to confirm itself, which is the exact
# failure the whole registration is built to refuse.
if [ ! -e "$HOME/Downloads" ] && [ -d "$HOME/storage/downloads" ]; then
    ln -s "$HOME/storage/downloads" "$HOME/Downloads" && echo "-- created the one predicted symlink: ~/Downloads -> ~/storage/downloads"
elif [ -e "$HOME/Downloads" ]; then
    echo "-- ~/Downloads already exists ($(readlink "$HOME/Downloads" 2>/dev/null || echo 'real directory')) -- the probe will record which"
else
    echo "-- ~/storage/downloads missing: run termux-setup-storage first (the probe records AWAITING)"
fi

# -- v2928: hold the CPU/screen awake for the whole run, and GUARANTEE release on any exit ---------------------------
# claim 5 (Doze survival) is longitudinal and graded elsewhere; this is courtesy so the ~20-min suite is not
# suspended mid-run. Hardened over v2920: the trap now covers INT and TERM as well as EXIT, so a Ctrl-C or an
# OS signal still releases the lock instead of leaving the phone pinned awake. Acquisition failure is non-fatal.
SWEK_WAKE=0
if command -v termux-wake-lock >/dev/null 2>&1; then
    if termux-wake-lock 2>/dev/null; then
        SWEK_WAKE=1
        trap 'if [ "$SWEK_WAKE" = "1" ]; then termux-wake-unlock 2>/dev/null; echo "-- wake-lock released"; fi' EXIT INT TERM
        echo "-- wake-lock acquired (released automatically on exit, Ctrl-C, or termination)"
    else
        echo "-- wake-lock unavailable (termux-api present but request refused) -- suite still runs, may sleep"
    fi
else
    echo "-- termux-wake-lock not installed (pkg install termux-api) -- suite still runs, may sleep mid-run"
fi

# -- claim: roundhouseSelfchecksPassOnBionic -- the suite, same runner, same budget as the reference -----------------
echo "-- running the roundhouse suite (this is the cheapest real port test; expect ~15-25 min on a phone)"
OUT="android-phone.json"
SWEK_NPM_INSTALL_OK="$SWEK_NPM_INSTALL_OK" node tools/roundhouse/androidRunner.mjs "$OUT"

# -- deliver the ballot through the same door the auto-update claim uses ---------------------------------------------
if [ -d "$HOME/storage/downloads" ]; then
    cp "$OUT" "$HOME/storage/downloads/android-phone.json" && echo "-- transcript copied to shared Downloads (the same directory the updater scans -- the ballot travels the road it certifies)"
fi
echo "== done. On the desktop:  node tools/roundhouse/androidVerdict.mjs tools/roundhouse/android-reference.json android-phone.json =="

# -- THE RUNNER'S CLI CONTRACT (do not "improve" this into flags) ----------------------------------------------------
# androidRunner.mjs takes POSITIONAL arguments -- [outFile] [budgetSeconds] -- and reads the npm result from the
# ENVIRONMENT variable SWEK_NPM_INSTALL_OK. An external review suggested passing --out=, --npm-exit= and
# --symlink-applied= instead. That would silently destroy the ballot: argv[2] becomes the literal string
# "--out=/path" so a file with that name is created, and argv[3] becomes Number("--npm-exit=0") = NaN, so every
# check is killed at a NaN millisecond budget. If flags are ever wanted, androidRunner.mjs must be taught to parse
# them FIRST, in the same commit, with its gate updated -- never by changing the caller alone.

# -- PERSISTENCE (optional, longitudinal): to run automatically on every boot and generate the survival ledger
#    that grades survivesDoze / survivesMemoryPressure, install the F-Droid Termux:Boot add-on and copy the boot
#    script into its directory:
#        mkdir -p ~/.termux/boot && cp tools/roundhouse/termux_boot_peer.sh ~/.termux/boot/
#    It appends to ~/storage/downloads/swek-persistence-ledger.jsonl; feed that to androidVerdict.mjs on the desktop.


# -- v2969: tell the owner if a newer build exists. CHECK only by default -- a build is ~21MB and this may be
# metered mobile data. Nothing is downloaded unless update-policy.json opts in, and nothing is ever installed.
node tools/roundhouse/androidUpdate.mjs 2>/dev/null || echo "-- update check skipped (no hub known yet)"

# -- v2950 STORE AND FORWARD: queue the ballot, then try once -----------------------------------------------------
# The suite has just taken 15-25 minutes. If the hub is unreachable right now the results must not be stranded, so
# the ballot goes into the OUTBOX first and delivery is attempted second. Whatever fails to send stays queued and
# is retried by swek_outbox.sh -- which the boot script runs on every boot, so an unreachable hub costs a delay,
# never a lost run.
SWEK_DL="$HOME/storage/downloads"; [ -d "$SWEK_DL" ] || SWEK_DL="$HOME"
mkdir -p "$SWEK_DL/swek-outbox" 2>/dev/null
if [ -f "$SWEK_DL/android-phone.json" ]; then
    cp "$SWEK_DL/android-phone.json" "$SWEK_DL/swek-outbox/$(date -u +%Y%m%dT%H%M%SZ)-android-phone.json" 2>/dev/null
    echo "-- ballot queued in the outbox"
fi
sh tools/roundhouse/swek_outbox.sh 2>/dev/null || echo "-- hub not reachable yet; the ballot stays queued and will be retried on the next boot or outbox run"
