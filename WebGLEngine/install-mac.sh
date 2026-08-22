#!/usr/bin/env bash
# install-mac.sh - one-time setup for VoxelEngine on macOS.
#
# Does:
#   1. Verifies macOS environment (uname, architecture)
#   2. Checks for Node.js; if missing, suggests Homebrew install
#   3. Runs `npm install` in ai-bridge/ (pure-JS deps; no compiler needed)
#   4. Makes start-mac.sh executable
#
# After this finishes, run ./start-mac.sh to launch the engine.

set -e        # fail-fast on any command error
set -u        # error on unset variable

# Always run from the script's own directory so relative paths work
# regardless of where the user invokes it from.
cd "$(dirname "$0")"

BOLD=$(tput bold 2>/dev/null || echo "")
DIM=$(tput dim  2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

say() { printf "%s\n" "$1"; }
ok()  { printf "${GREEN}✓${RESET} %s\n" "$1"; }
warn(){ printf "${YELLOW}!${RESET} %s\n" "$1"; }
fail(){ printf "${RED}✗${RESET} %s\n" "$1"; exit 1; }

# ---- 1. OS check ----
say "${BOLD}VoxelEngine — macOS install${RESET}"
say ""

OS="$(uname -s)"
if [ "$OS" != "Darwin" ]; then
    fail "This script is for macOS only. You're on: $OS. Use Start_Everything.bat on Windows or write a linux equivalent."
fi

ARCH="$(uname -m)"
case "$ARCH" in
    arm64)   ok "macOS on Apple Silicon ($ARCH)";;
    x86_64)  ok "macOS on Intel ($ARCH)";;
    *)       warn "Unrecognized arch: $ARCH (proceeding anyway)";;
esac

# ---- 2. Node.js ----
if ! command -v node >/dev/null 2>&1; then
    say ""
    say "${RED}Node.js is not installed.${RESET}"
    say ""
    say "Options to install:"
    say "  ${BOLD}A. Homebrew (recommended)${RESET}"
    say "     /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    say "     brew install node"
    say ""
    say "  ${BOLD}B. Official installer${RESET}"
    say "     Download from https://nodejs.org/  (use the LTS .pkg for macOS)"
    say ""
    say "  ${BOLD}C. nvm (if you manage multiple Node versions)${RESET}"
    say "     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    say "     nvm install --lts"
    say ""
    fail "Install Node.js and re-run ./install-mac.sh"
fi

NODE_VERSION="$(node --version)"
NODE_MAJOR="$(echo "$NODE_VERSION" | cut -d. -f1 | tr -d 'v')"
if [ "$NODE_MAJOR" -lt 18 ]; then
    warn "Node $NODE_VERSION is old. Recommend 18.x or newer. Continuing anyway."
else
    ok "Node $NODE_VERSION"
fi

# ---- 2b. Bun (optional, faster runtime) ----
# Bun is much more stable on macOS than on Windows (the Windows socket panic
# doesn't apply here), so we install it and prefer it at launch — Node stays as
# the fallback. Harmless if it fails; the engine runs fine on Node either way.
[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"
if command -v bun >/dev/null 2>&1; then
    ok "Bun $(bun --version) present"
else
    say ""
    say "Installing Bun (faster JS runtime; optional)..."
    if curl -fsSL https://bun.sh/install | bash; then
        export PATH="$HOME/.bun/bin:$PATH"
        if command -v bun >/dev/null 2>&1; then ok "Bun $(bun --version) installed"; else warn "Bun installed but not on PATH yet — open a new terminal (start-mac.sh will still find it)"; fi
    else
        warn "Bun install didn't complete (not fatal) — the engine will run on Node."
    fi
fi

# ---- 3. npm install ----
if [ ! -d "ai-bridge/node_modules" ]; then
    say ""
    pushd ai-bridge >/dev/null
    if command -v bun >/dev/null 2>&1; then
        say "Installing ai-bridge dependencies with bun..."
        bun install || { warn "bun install failed — falling back to npm"; npm install; }
    else
        say "Installing ai-bridge dependencies with npm (pure JS, no Xcode needed)..."
        npm install
    fi
    popd >/dev/null
    ok "ai-bridge dependencies installed"
else
    ok "ai-bridge/node_modules already present"
fi

# ---- 4. Make launcher executable ----
if [ -f "start-mac.sh" ]; then
    chmod +x start-mac.sh
    ok "start-mac.sh is executable"
fi
# v2232 -- the double-clickable Finder launcher lives at the PROJECT ROOT (one level up from
# WebGLEngine) and the brain script need the exec bit too (a .zip does not always preserve it).
if [ -f "../Start Mac SweK Engine.command" ]; then
    chmod +x "../Start Mac SweK Engine.command"
    ok "double-clickable 'Start Mac SweK Engine.command' is ready (starts KPop + bridge + GPU Brain)"
fi
[ -f "brain/start-brain-mac.sh" ] && chmod +x "brain/start-brain-mac.sh"

# ---- 5. Optional Chrome check (for the launcher) ----
if [ -d "/Applications/Google Chrome.app" ]; then
    ok "Chrome found at /Applications/Google Chrome.app (will be preferred for launching)"
elif [ -d "/Applications/Chromium.app" ]; then
    ok "Chromium found (will be preferred for launching)"
else
    warn "Chrome not detected. The launcher will use your default browser instead."
fi

say ""
say "${GREEN}${BOLD}Setup complete.${RESET}"
say ""
say "Next: double-click ${BOLD}Start Mac SweK Engine.command${RESET} in Finder, or run ${BOLD}./start-mac.sh${RESET} in Terminal."
say ""
