#!/bin/bash
# .claude/hooks/session-start.sh -- v4360
#
# WHAT A FRESH WEB SESSION IS MISSING, AND IT IS EXACTLY ONE THING.
#
# This tree vendors its dependencies: both package.json files in the repo declare zero deps, and playwright is
# already global in the image at /opt/node22/lib/node_modules. The one thing absent from a new container is
# node-webgpu (the npm package `webgpu`, Dawn's node binding, MIT), and without it every gate that reaches
# WebGPU natively either skips or goes red -- pathTracerWgsl held verify at "1 FAILURE(S) -- DO NOT SHIP" for a
# whole session before anyone read its skip reason, which had been naming this package the entire time.
#
# THE DRIVER IS ALREADY HERE and is NOT installed by this script: SwiftShader ships inside the Playwright
# chromium bundle, and tools/ship/headlessGpu.mjs finds it and sets VK_ICD_FILENAMES itself. So this hook does
# not export that variable -- a path baked into an env var here would go stale the next time the browser bundle
# version changes, and the module's own lookup would not. One install, no configuration.
#
# ---- ASYNC, AND ONLY WHERE ASYNC COSTS SOMETHING -------------------------------------------------------------
#
# The session does not wait for this. That buys a faster start and BUYS A RACE: for the few seconds the install
# takes, a gate that reaches for a native adapter will find none and skip or go red -- and it will say so
# accurately, because headlessGpuSkipReason() reports the state at the moment it is asked. A red in the first
# seconds of a session is worth re-running before it is believed.
#
# *** SO THE ASYNC DECLARATION IS MADE ONLY WHEN THERE IS WORK TO DO. *** A warm container -- the common case,
# since container state is cached after this completes -- finds the package already present, prints one line and
# exits synchronously, with no window at all. Declaring async unconditionally would hand every warm start a race
# in exchange for nothing, which is the worst of both. The window exists on a cold start because that is the only
# time it is paid for.
#
# WHAT THIS BUYS, AND WHAT IT DOES NOT: a SOFTWARE adapter. It lets the native-WebGPU gates execute and be
# graded against their CPU twins. It settles nothing about real-hardware floats -- the fleet kernel benches in
# tools/render-qa/deviceOwed.mjs still owe a verdict that only a real GPU can give.
set -euo pipefail

# Local machines have their own setup; this is for the ephemeral web container.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "[session-start] not a remote session -- nothing to do"
  exit 0
fi

# The warm path: synchronous, instant, no race. Nothing below this line runs on a cached container.
if node -e 'require("/opt/node22/lib/node_modules/webgpu")' >/dev/null 2>&1; then
  echo "[session-start] node-webgpu already present -- nothing to install"
  exit 0
fi

# The cold path is the only one that waits on a network, so it is the only one that goes async.
echo '{"async": true, "asyncTimeout": 300000}'

echo "[session-start] installing node-webgpu (pinned to the version tools/ship/headlessGpu.mjs records)"
npm install -g webgpu@0.6.0 --no-fund --no-audit

# Report what the tree itself concludes, rather than assuming the install worked. headlessGpuSkipReason() is the
# same function every native-WebGPU gate consults, so this line is the gates' own answer and not a proxy for it.
node -e '
import("'"${CLAUDE_PROJECT_DIR:-$PWD}"'/WebGLEngine/tools/ship/headlessGpu.mjs").then((m) => {
  const why = m.headlessGpuSkipReason();
  console.log(why === null
    ? "[session-start] native WebGPU is available -- the gates that need it will run"
    : "[session-start] native WebGPU still unavailable: " + why);
}).catch((e) => console.log("[session-start] could not ask the tree: " + String(e.message).slice(0, 120)));
'
