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
# ---- SYNCHRONOUS, AND THE ASYNC VERSION IS WHY -----------------------------------------------------------------
#
# This ran async for one commit and was reverted, so the reason is recorded here rather than lost to a diff.
# Async does not wait, which buys a faster start and BUYS A RACE: for the few seconds the install takes, a gate
# reaching for a native adapter finds none and goes red -- AND SAYS SO ACCURATELY, because
# headlessGpuSkipReason() reports the state at the moment it is asked. That is the bad kind of wrong answer. A
# red that is obviously broken gets re-run; a red with a correct, specific, well-worded reason gets BELIEVED,
# and this exact reason already cost a session: pathTracerWgsl sat red through several ships while its skip
# text named the missing package the whole time. Re-introducing a window where that same message is true for a
# few seconds, in a tree whose gates are read carefully, trades a real risk of a wrong conclusion for a few
# seconds of startup.
#
# The warm path still exits immediately, which is where most of the latency argument lived anyway: container
# state is cached after this completes, so the common case is one `require` and a line of output.
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

# v4838 -- A SECOND THING, BECAUSE THE SANDBOX OWNS THE TIMING RECORD AGAIN. ai-bridge/ declares @napi-rs/canvas and
# @napi-rs/webcodecs as optionalDependencies, and a container that lacks them declines webcodecsFramesToMp4-selfcheck
# whole (and sections of qrBridge and gateAxioms). The 2.10GHz host had them and recorded the gate at 756 ms; the
# 2.80GHz host did not, so its first sweep as owner filed the gate `skipped` and skipReading-selfcheck went red on a
# fifth skipper. The record's owner should run what the previous owner ran. Same rule as below: warm path first,
# synchronous, and --no-save so package.json is never touched (package-lock.json is gitignored).
AIB="${CLAUDE_PROJECT_DIR:-$PWD}/WebGLEngine/ai-bridge"
if [ -d "$AIB" ] && ! (cd "$AIB" && node -e 'require.resolve("@napi-rs/canvas"); require.resolve("@napi-rs/webcodecs")') >/dev/null 2>&1; then
  echo "[session-start] installing ai-bridge's @napi-rs/canvas and @napi-rs/webcodecs (optionalDependencies the record's gates use)"
  (cd "$AIB" && npm install --no-save --no-audit --no-fund @napi-rs/canvas@^1.0.9 @napi-rs/webcodecs@^1.4.1) \
    || echo "[session-start] ai-bridge optional install failed -- webcodecsFramesToMp4-selfcheck will SKIP, and say why"
fi

# The warm path: synchronous, instant, no race. Nothing below this line runs on a cached container.
# v4856 -- the pin is 0.6.2 (section 70), and a container cached on 0.6.0 must not read "already present": the version is asked.
WEBGPU_PIN=0.6.2
if [ "$(node -e 'try { console.log(require("/opt/node22/lib/node_modules/webgpu/package.json").version) } catch { }' 2>/dev/null)" = "$WEBGPU_PIN" ]; then
  echo "[session-start] node-webgpu $WEBGPU_PIN already present -- nothing to install"
  exit 0
fi

# The cold path waits. It is the only path that touches the network, and it is measured in seconds.
echo "[session-start] installing node-webgpu $WEBGPU_PIN (pinned to the version tools/ship/headlessGpu.mjs records)"
npm install -g webgpu@$WEBGPU_PIN --no-fund --no-audit

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
