#!/usr/bin/env bash
# install-steamdeck.sh - one-time setup for VoxelEngine on Steam Deck (SteamOS) / Linux desktop.
#
# Mirrors install-mac.sh's four steps -- OS check, Node.js check, npm install,
# make the launcher executable -- with the ONE thing that has to differ:
# SteamOS's root filesystem is READ-ONLY and reset on every system update, so
# `pacman -S nodejs` is explicitly the wrong advice here (it disappears on the
# next update). The distro's own guidance is Distrobox for exactly this reason
# -- see https://www.steamdeck.com/en/blog and blogs.igalia.com/berto -- so
# that is what this script recommends, not Homebrew's mac equivalent.
#
# After this finishes, run ./start-steamdeck.sh to launch the engine.

set -e
set -u

cd "$(dirname "$0")"

BOLD=$(tput bold 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
YELLOW=$(tput setaf 3 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

say() { printf "%s\n" "$1"; }
ok()  { printf "${GREEN}✓${RESET} %s\n" "$1"; }
warn(){ printf "${YELLOW}!${RESET} %s\n" "$1"; }
fail(){ printf "${RED}✗${RESET} %s\n" "$1"; exit 1; }

# ---- 1. OS check ----
say "${BOLD}VoxelEngine — Steam Deck / Linux desktop install${RESET}"
say ""

OS="$(uname -s)"
if [ "$OS" != "Linux" ]; then
    fail "This script is for Linux (SteamOS/Steam Deck). You're on: $OS. Use install-mac.sh on macOS or Start_Everything.bat on Windows."
fi

ARCH="$(uname -m)"
case "$ARCH" in
    x86_64)  ok "Linux on x86_64 ($ARCH) -- this is the Steam Deck's architecture";;
    aarch64) ok "Linux on aarch64 ($ARCH)";;
    *)       warn "Unrecognized arch: $ARCH (proceeding anyway)";;
esac
if [ -f /etc/os-release ] && grep -qi steamos /etc/os-release 2>/dev/null; then
    ok "SteamOS detected"
fi

# ---- 2. Node.js ----
# *** THIS IS THE STEP THAT ACTUALLY DIFFERS FROM install-mac.sh, AND WHY. ***
# SteamOS's root is read-only and reverts on update (steamos-readonly / rootfs
# overlay), so `pacman -S nodejs` -- the obvious Arch-native answer -- is a trap:
# it works today and is gone after the next OS update, silently. Distrobox is
# the platform's OWN documented answer for exactly this (persistent CLI tools
# in a container that survives updates); Flatpak is for GUI apps and has no
# node runtime story. This is not guessed -- it is what SteamOS's own guide and
# Valve's blog point Deck users at for command-line development.
if ! command -v node >/dev/null 2>&1; then
    say ""
    say "${RED}Node.js is not installed.${RESET}"
    say ""
    say "Steam Deck / SteamOS's root filesystem is READ-ONLY and resets on every"
    say "system update -- ${BOLD}pacman -S nodejs${RESET} will vanish on the next update."
    say "Distrobox is SteamOS's own answer for persistent command-line tools:"
    say ""
    say "  ${BOLD}A. Distrobox (recommended on SteamOS)${RESET}"
    say "     distrobox create --name swek --image archlinux:latest"
    say "     distrobox enter swek"
    say "     sudo pacman -Sy nodejs npm      # inside the container, persists across updates"
    say "     distrobox-export --bin \$(which node)    # makes it callable from the host shell too"
    say ""
    say "  ${BOLD}B. Official installer (any Linux, not SteamOS-specific)${RESET}"
    say "     Download the Linux .tar.xz from https://nodejs.org/  and add its bin/ to PATH"
    say ""
    say "  ${BOLD}C. nvm (if you manage multiple Node versions)${RESET}"
    say "     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    say "     nvm install --lts"
    say ""
    fail "Install Node.js (Distrobox recommended on SteamOS) and re-run ./install-steamdeck.sh"
fi

NODE_VERSION="$(node --version)"
NODE_MAJOR="$(echo "$NODE_VERSION" | cut -d. -f1 | tr -d 'v')"
if [ "$NODE_MAJOR" -lt 18 ]; then
    warn "Node $NODE_VERSION is old. Recommend 18.x or newer. Continuing anyway."
else
    ok "Node $NODE_VERSION"
fi

# ---- 2b. Bun (optional, faster runtime) ----
# Same optional-and-harmless shape as install-mac.sh's step 2b: Bun's known
# instability is Windows-specific (a socket panic this tree has documented
# elsewhere), so it is safe to try here too and the engine runs fine on Node
# either way if the install fails or Bun is unavailable in the Distrobox PATH.
[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"
if command -v bun >/dev/null 2>&1; then
    ok "Bun $(bun --version) present"
else
    say ""
    say "Installing Bun (faster JS runtime; optional)..."
    if curl -fsSL https://bun.sh/install | bash; then
        export PATH="$HOME/.bun/bin:$PATH"
        if command -v bun >/dev/null 2>&1; then ok "Bun $(bun --version) installed"; else warn "Bun installed but not on PATH yet -- open a new terminal (start-steamdeck.sh will still find it)"; fi
    else
        warn "Bun install didn't complete (not fatal) -- the engine will run on Node."
    fi
fi

# ---- 3. npm install ----
if [ ! -d "ai-bridge/node_modules" ]; then
    say ""
    pushd ai-bridge >/dev/null
    if command -v bun >/dev/null 2>&1; then
        say "Installing ai-bridge dependencies with bun..."
        bun install || { warn "bun install failed -- falling back to npm"; npm install; }
    else
        say "Installing ai-bridge dependencies with npm (pure JS, no native compiler needed)..."
        npm install
    fi
    popd >/dev/null
    ok "ai-bridge dependencies installed"
else
    ok "ai-bridge/node_modules already present"
fi

# ---- 4. Make launchers executable ----
if [ -f "start-steamdeck.sh" ]; then
    chmod +x start-steamdeck.sh
    ok "start-steamdeck.sh is executable"
fi
[ -f "brain/start-brain-steamdeck.sh" ] && chmod +x brain/start-brain-steamdeck.sh

say ""
say "${GREEN}${BOLD}Setup complete.${RESET} Run: ${BOLD}./start-steamdeck.sh${RESET}"
