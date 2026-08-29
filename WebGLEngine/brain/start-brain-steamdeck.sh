#!/usr/bin/env bash
# start-brain-steamdeck.sh -- launch the SweK GPU Brain on Steam Deck / Linux desktop.
#
# WGPU_BACKEND IS PINNED HERE, UNLIKE start-brain-mac.sh -- and it is pinned
# for the Deck specifically, not guessed. START_BRAIN.bat already pins
# WGPU_BACKEND=vulkan on Windows "for the Pascal-friendly path" (older NVIDIA
# hardware where wgpu's default DX12 backend is not the best match); mac
# deliberately does NOT pin anything because wgpu's default there is already
# Metal. On Linux there is no single obviously-right default the way macOS
# has Metal -- wgpu can pick GL as a fallback on some configurations -- and
# the Steam Deck's actual GPU (AMD RDNA2, "Van Gogh"/"Phoenix" APU) has ONE
# unambiguously best-supported backend on this OS: Mesa's RADV, a native
# Vulkan ICD that is SteamOS's own primary graphics path (it is what Proton
# itself runs games through). Pinning vulkan here is not a guess parallel to
# the Windows Pascal pin -- it is asking wgpu for the driver this specific
# hardware and OS combination is built around.
#
# Same GPU-first-then-CPU-fallback shape as start-brain-mac.sh: try the GPU
# brain, watch its first seconds for the software-adapter-refusal signal
# initGPU() throws by design, and transparently relaunch on the CPU backend
# if no real hardware adapter answers. Either way a brain runs and joins the
# fleet.
#
# Deno auto-installs on first run via the official installer (no root, ~35MB;
# lands in $HOME, so it survives a SteamOS system update the same way a
# Distrobox container's exports do -- it is not touching the read-only OS).

set -u
BRAIN_DIR="$1"           # absolute path to WebGLEngine/brain
: "${BRAIN_LOG:=$BRAIN_DIR/brain-steamdeck.log}"

# --- ensure Deno -----------------------------------------------------------
if ! command -v deno >/dev/null 2>&1; then
    if [ -x "$HOME/.deno/bin/deno" ]; then
        export PATH="$HOME/.deno/bin:$PATH"
    else
        echo "[brain] Deno not found -- installing via the official installer (no root)..."
        if curl -fsSL https://deno.land/install.sh | DENO_INSTALL="$HOME/.deno" sh >/dev/null 2>&1; then
            export PATH="$HOME/.deno/bin:$PATH"
        fi
    fi
fi
if ! command -v deno >/dev/null 2>&1; then
    echo "[brain] Deno still not found -- GPU Brain skipped. Install: curl -fsSL https://deno.land/install.sh | sh   (or via Distrobox, same reasoning as Node in install-steamdeck.sh)"
    exit 0
fi

cd "$BRAIN_DIR" || { echo "[brain] cannot cd to $BRAIN_DIR"; exit 0; }

echo "[brain] Linux ($(uname -m)) -- starting SweK GPU Brain (Vulkan via Mesa RADV)..."

# --- try the GPU brain, watch its first seconds for the software-refusal ----
GPU_OK=0
TMPOUT="$(mktemp -t swekbrain.XXXXXX)"
(
    WGPU_BACKEND=vulkan deno run --unstable-webgpu --allow-net --allow-env --allow-read --allow-write brain.js
) >"$TMPOUT" 2>&1 &
BRAIN_PID=$!

for i in $(seq 1 12); do
    sleep 0.5
    if ! kill -0 "$BRAIN_PID" 2>/dev/null; then
        if grep -qiE 'software|fallback|no webgpu adapter|no adapter|navigator.gpu missing' "$TMPOUT"; then
            echo "[brain] no hardware Vulkan adapter answered -- falling back to the CPU brain (exact Dijkstra)."
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
    cat "$TMPOUT" >>"$BRAIN_LOG" 2>/dev/null || true
    rm -f "$TMPOUT" 2>/dev/null || true
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
