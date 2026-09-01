// WebGLEngine/tools/ship/wgslDeviceLimits.mjs -- v4207
//
// READS THE REAL WebGPU LIMITS FROM A BROWSER AND COMPARES THEM TO render/wgslSpec.mjs's DEFAULT_LIMITS.
//
// *** A TOOL AND NOT A GATE, FOR THE SAME REASON tools/ship/verifyLicenceTexts.mjs IS ONE. *** The gate can
// prove the validator is self-consistent and that it flags what it claims to flag. It cannot prove that
// 256 is really WebGPU's default maxComputeInvocationsPerWorkgroup, because that fact lives outside this
// repository. Only a device knows, and a gate that needs a GPU is a gate that silently passes on every box
// without one.
//
// *** AND THE NUMBERS IT CHECKS WERE WRITTEN FROM KNOWLEDGE, NOT FROM A SOURCE. *** w3.org and
// gpuweb.github.io are both blocked by this sandbox's egress proxy, and the headless shell here exposes no
// navigator.gpu, so neither the specification nor a live device was reachable from the box that wrote
// DEFAULT_LIMITS. LIMITS_PROVENANCE records exactly that. v4203 was a whole round about a number recorded as
// authoritative without being checked; this file is the check, arranged so it can be run wherever a real
// browser is.
//
// Run: node tools/ship/wgslDeviceLimits.mjs          (headless, needs a WebGPU-capable shell)
//      or open the printed page in any browser and read the table.

import { DEFAULT_LIMITS, LIMITS_PROVENANCE } from "../../render/wgslSpec.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/** The page body, also usable by hand: paste it into any browser's console. */
export function probeSource() {
    return `(async () => {
  if (!navigator.gpu) return { error: "no navigator.gpu in this browser" };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { error: "no WebGPU adapter" };
  const adapterLimits = {}; for (const k in adapter.limits) adapterLimits[k] = adapter.limits[k];
  // BARE requestDevice, exactly as every call site in this tree does it -- eight of them, and
  // requiredLimits appears nowhere in the repository.
  const device = await adapter.requestDevice();
  const deviceLimits = {}; for (const k in device.limits) deviceLimits[k] = device.limits[k];
  return { adapterLimits, deviceLimits };
})()`;
}

export async function main() {
    const { chromium, from } = resolvePlaywright(createRequire(import.meta.url));
    const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
    if (skip) { console.log("SKIP: " + skip); process.exit(2); }
    const browser = await chromium.launch({ executablePath: HEADLESS_SHELL,
        args: ["--use-gl=swiftshader", "--enable-unsafe-webgpu", "--enable-features=Vulkan", "--ignore-gpu-blocklist"] });
    const page = await browser.newPage();
    await page.goto("about:blank");
    const out = await page.evaluate(probeSource());
    await browser.close();

    console.log(`DEFAULT_LIMITS provenance: ${LIMITS_PROVENANCE.source}`);
    console.log(`  verified against spec: ${LIMITS_PROVENANCE.verifiedAgainstSpec} · against a device: ${LIMITS_PROVENANCE.verifiedAgainstDevice}`);
    console.log(`  ${LIMITS_PROVENANCE.why}\n`);
    if (out.error) {
        console.log(`UNVERIFIED: ${out.error}`);
        console.log("This proves nothing about the recorded numbers. Run it in a browser with WebGPU, or paste");
        console.log("the output of probeSource() into a console there.");
        process.exit(2);
    }
    let agree = 0, disagree = 0;
    console.log("limit                                recorded    device   adapter max");
    for (const [k, recorded] of Object.entries(DEFAULT_LIMITS)) {
        const dev = out.deviceLimits[k], ad = out.adapterLimits[k];
        const mark = dev === undefined ? "  (not reported)" : dev === recorded ? "  ok" : "  DISAGREES";
        if (dev !== undefined) { if (dev === recorded) agree++; else disagree++; }
        console.log("  " + k.padEnd(36) + String(recorded).padStart(8) + String(dev).padStart(10) + String(ad).padStart(12) + mark);
    }
    console.log(`\nwgslDeviceLimits: ${agree} agree, ${disagree} disagree`);
    if (disagree) console.log("Update DEFAULT_LIMITS in render/wgslSpec.mjs and set LIMITS_PROVENANCE.verifiedAgainstDevice.");
    process.exit(disagree ? 1 : 0);
}

// Only when run directly -- the gate imports probeSource() and must not launch a browser doing it.
// v4204 shipped exactly that bug in tools/ship/verifyLicenceTexts.mjs and it is not being repeated.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
