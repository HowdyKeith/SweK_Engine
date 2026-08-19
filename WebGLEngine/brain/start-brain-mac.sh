#!/usr/bin/env bash
# start-brain-mac.sh -- launch the SweK GPU Brain on macOS (v2090).
#
# Handles BOTH Apple Silicon (M-series) and Intel Macs:
#   * Apple Silicon -> Deno's WebGPU (wgpu) maps to METAL, so the GPU brain
#     should get a real hardware adapter. This is the fast path.
#   * Intel Mac -> Metal too, but on the weaker integrated GPU; the adapter may
#     be a software/fallback, which the brain's initGPU() HARD-REFUSES by design.
#
# So we try the GPU brain first, and if it exits fast with the "software adapter
# refused / no adapter" signal, we transparently relaunch as the CPU brain
# (BRAIN_BACKEND=cpu, exact Dijkstra, no GPU needed). Either way a brain runs and
# joins the fleet. We do NOT pin WGPU_BACKEND on mac -- unlike the Windows
# launcher (which pins vulkan for Pascal NVIDIA), wgpu's default on Apple is
# Metal, and pinning the wrong backend would break it.
#
# Deno auto-installs on first run via the official installer (no admin, ~35MB).

set -u
BRAIN_DIR="$1"           # absolute path to WebGLEngine/brain
: "${BRAIN_LOG:=$BRAIN_DIR/brain-mac.log}"

# --- ensure Deno -----------------------------------------------------------
if ! command -v deno >/dev/null 2>&1; then
    # try the standard install location first (a prior run may have installed it)
    if [ -x "$HOME/.deno/bin/deno" ]; then
        export PATH="$HOME/.deno/bin:$PATH"
    else
        echo "[brain] Deno not found -- installing via the official installer (no admin)..."
        # official Deno installer; DENO_INSTALL controls the target dir
        if curl -fsSL https://deno.land/install.sh | DENO_INSTALL="$HOME/.deno" sh >/dev/null 2>&1; then
            export PATH="$HOME/.deno/bin:$PATH"
        fi
    fi
fi
if ! command -v deno >/dev/null 2>&1; then
    echo "[brain] Deno still not found -- GPU Brain skipped. Install: brew install deno   (or: curl -fsSL https://deno.land/install.sh | sh)"
    exit 0
fi

cd "$BRAIN_DIR" || { echo "[brain] cannot cd to $BRAIN_DIR"; exit 0; }

ARCH="$(uname -m 2>/dev/null || echo '?')"     # arm64 = Apple Silicon, x86_64 = Intel
echo "[brain] macOS ($ARCH) -- starting SweK GPU Brain (Metal via wgpu)..."

# --- try the GPU brain, watch its first seconds for the software-refusal ----
# initGPU() throws with a message containing 'software' / 'fallback' / 'adapter'
# when it cannot get a real GPU. We capture early output; if we see that, we
# relaunch on the CPU backend. If the brain stays up, we tail-follow into a log.
GPU_OK=0
# start GPU brain, capture the first ~6s of output to detect an early refusal
TMPOUT="$(mktemp -t swekbrain.XXXXXX)"
(
    # no WGPU_BACKEND pin on mac -> wgpu picks Metal
    deno run --unstable-webgpu --allow-net --allow-env --allow-read --allow-write brain.js
) >"$TMPOUT" 2>&1 &
BRAIN_PID=$!

# watch for up to 6 seconds: did it die with a GPU-refusal, or is it running?
for i in $(seq 1 12); do
    sleep 0.5
    if ! kill -0 "$BRAIN_PID" 2>/dev/null; then
        # it exited quickly -- check why
        if grep -qiE 'software|fallback|no webgpu adapter|no adapter|navigator.gpu missing' "$TMPOUT"; then
            echo "[brain] no hardware GPU adapter on this Mac (likely Intel integrated) -- falling back to the CPU brain (exact Dijkstra)."
        else
            echo "[brain] GPU brain exited early; output:"; sed 's/^/[brain]   /' "$TMPOUT"
            echo "[brain] falling back to the CPU brain."
        fi
        break
    fi
    GPU_OK=1
done

if [ "$GPU_OK" = "1" ]; then
    echo "[brain] GPU brain running (pid $BRAIN_PID). Log: $BRAIN_LOG"
    # detach: keep it running after this script/window ends, log to file
    cat "$TMPOUT" >>"$BRAIN_LOG" 2>/dev/null || true
    rm -f "$TMPOUT" 2>/dev/null || true
    # re-attach its stdout to the log going forward is not possible post-spawn;
    # the brain already writes its own console. Just disown it.
    disown "$BRAIN_PID" 2>/dev/null || true
    exit 0
fi

# --- CPU fallback ----------------------------------------------------------
rm -f "$TMPOUT" 2>/dev/null || true
echo "[brain] starting CPU fields brain..."
BRAIN_BACKEND=cpu nohup deno run --allow-net --allow-env --allow-read --allow-write brain.js >>"$BRAIN_LOG" 2>&1 &
CPU_PID=$!
disown "$CPU_PID" 2>/dev/null || true
echo "[brain] CPU brain running (pid $CPU_PID). Log: $BRAIN_LOG"
exit 0
