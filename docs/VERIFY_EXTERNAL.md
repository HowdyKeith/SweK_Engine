# VERIFY_EXTERNAL.md — verify before you bake

Standing rule: web-search-verify any external repo URL, version, package name, or install command BEFORE it
goes into the codebase, the install catalog, or a suggested-repos list. Prior AI tooling fabricated
non-existent repos/versions; this checklist is the guard. It has already caught real ones (retired
`claude.ai/new?q=` injection vector; the FluidVoice macOS-only reality; the Immich v3 endpoint check).

## The checklist (run every item before wiring)

1. **The repo exists and is the right one.** Fetch the actual GitHub repo. Confirm owner/name, that it's
   maintained (recent commits/releases), and that it does what you think. Do not trust a remembered URL.

2. **The version/tag is real.** Use the GitHub releases/API to get the EXACT current tag. Never write a
   version number from memory. For npm/pip, `npm view <pkg> version` / check PyPI.

3. **The install command is copied from the source, not invented.** Reproduce it from the README / release
   page verbatim. Note the package manager (winget/brew/pip/npm/docker) and whether it needs a service
   running afterward.

4. **Platform + hardware reality.** Does it run on Keith's actual boxes? Flags that matter here:
   - **ARCHITECTURE BEFORE VERSION, on the Mac side.** *(added v3334, after a real miss.)* This list used to
     name the Mac risk as an OS-version risk only, and named architecture solely for the Windows box. So
     turbo-fieldfare - pure arm64 + Metal - got checked against its macOS minimum and the actual blocker went
     unasked: **Stellar Atlas is an INTEL Mac (x86_64), and no macOS upgrade changes that.** Ask `uname -m`
     before you ask `sw_vers`. Apple-Silicon-only and macOS-only are DIFFERENT CLAIMS, and a row can be one
     without being the other.
   - macOS 12 (Stellar Atlas), **x86_64** - many casks require macOS 13/14/15; check the minimum *and* whether
     a universal or Intel build exists at all.
   - Pascal / sm_61 (GTX 1070/1080 on Galaxina) — CUDA/torch versions that dropped Pascal will fail.
   - Windows vs Mac vs Linux — is it cross-platform, or (like FluidVoice) single-OS?
   - No-Metal / NVIDIA-only tradeoffs (e.g. faster-whisper has no Metal backend).

5. **If it has a platform constraint, DECLARE IT IN `requires`, not in prose.** *(added v3334.)*
   `install_catalog.json` entries take a `requires: { os, arch, macosMin, why }` block, and
   `ai-bridge/platformRequires.js` is the one thing that reads it - the install bridge refuses with a 409 and
   names every unmet requirement before running a command. A constraint written only in `description` is
   invisible to every check and to the button itself, which is how `app-apple-container` came to recommend
   Apple-Silicon software to an Intel Mac. **And do not derive the block from a keyword scan of the
   description** - that scan reported `raycast-llm` as Apple-Silicon-only when the row says the opposite
   (smaller model on Intel, bigger on Apple Silicon). Read the row.

6. **Honest labels over optimistic ones.** If no maintained integration exists, wire it as an explicit
   PLACEHOLDER with a note (as done for Sparc3D), not as if it works. If there's a known risk (Pascal/torch),
   ship the risk note next to it.

7. **Security smell.** Reject anything that looks like a prompt-injection or exfiltration vector even if it
   would be convenient (the retired `claude.ai/new?q=` case). Prefer plain, boring, well-known sources.

## If a check fails
Don't bake it. Either wire an honest placeholder with a note, or tell Keith exactly what's missing and let
him decide. A fabricated dependency is the highest-embarrassment failure class — cheap to prevent here.
