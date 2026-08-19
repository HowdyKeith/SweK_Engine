// tools/roundhouse/androidUpdate.mjs
//
// v2969 -- THE PHONE LEARNS IT IS BEHIND.
//
//   node tools/roundhouse/androidUpdate.mjs [hub-url]
//
// Until now the three-tier update policy was desktop-only: a phone could not even be TOLD a newer build existed,
// let alone fetch one. This gives it the same machinery -- the SAME machinery, deliberately: updatePolicy.mjs is
// imported, not reimplemented. Two policy engines with drifting defaults is the duplicate this project found in
// its own tunnel registries two rounds ago, and once is enough.
//
// WHAT IS DIFFERENT ON A PHONE, and it is a default rather than a mechanism:
//
//     THE DEFAULT TIER HERE IS "notify", WHERE THE DESKTOP DEFAULTS TO AUTO-DOWNLOAD.
//
// A build is ~21MB. On a desktop that is nothing; on a phone it may be metered mobile data that costs the owner
// real money, spent on their behalf while they were not looking. Termux cannot reliably tell whether the current
// connection is metered, and a mechanism that cannot check must not assume the cheap answer. So the phone is told
// and does nothing else unless its owner opts in by writing a policy file -- at which point the same decide() and
// verifyBuild() run as anywhere else.
//
// APPLYING IS SAFE BY CONSTRUCTION HERE, unlike the desktop. The Termux install unzips into ~/SweK_Engine_vNNNN/,
// a new directory per version, so a downloaded build cannot overwrite the running one -- the worst case is disk
// use, and the owner switches by cd-ing into the new folder when they choose. This script still does not unzip:
// staging and applying stay separate everywhere, so there is one rule to remember rather than a per-platform one.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decide, verifyBuild, readPolicy } from "./updatePolicy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MEMO = path.join(here, ".swek-lighthouse");
const POLICY = path.join(here, "update-policy.json");

/** The phone's default differs from the desktop's, for the metered-data reason above. */
export const ANDROID_DEFAULT_POLICY = { tier: "notify", autoDownload: false, stagingDir: "swek-updates" };

export function readAndroidPolicy() {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(POLICY, "utf8")); } catch { raw = null; }
    // no file at all -> the conservative phone default, NOT the module default
    return readPolicy(raw || ANDROID_DEFAULT_POLICY);
}

/** Which build is this tree? Read from main.js so it cannot drift from what is actually installed. */
export function localVersion() {
    try {
        const m = fs.readFileSync(path.join(here, "..", "..", "main.js"), "utf8").match(/ENGINE_VERSION\s*=\s*"(v\d+)"/);
        return m ? m[1] : null;
    } catch { return null; }
}

async function main() {
    const given = process.argv.slice(2).map((u) => u.replace(/\/+$/, "")).filter(Boolean);
    let candidates = given;
    if (!candidates.length) { try { candidates = fs.readFileSync(MEMO, "utf8").split("\n").map((s) => s.trim()).filter(Boolean); } catch {} }
    if (!candidates.length) { console.error("no hub URL known -- run lighthouse_checkin.mjs once, or pass one here"); process.exit(2); }

    const mine = localVersion();
    const pol = readAndroidPolicy();
    console.log(`this build: ${mine || "unknown"}   policy: ${pol.tier}${pol.autoDownload ? " (auto-download on)" : ""}`);

    let rel = null, hub = null;
    for (const c of candidates) {
        const r = await fetch(c + "/release", { signal: AbortSignal.timeout(15000) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (r && r.version) { rel = r; hub = c; break; }
    }
    if (!rel) { console.log("no hub reachable, or no release has been signed yet -- nothing to do"); return; }

    const d = decide(pol, rel, { current: mine });
    console.log(`hub has ${rel.version} -> ${d.action}: ${d.why}`);

    if (d.action === "none" || d.action === "notify") {
        if (d.action === "notify" && rel.version !== mine) {
            console.log("");
            console.log(`  A newer build exists (${rel.version}). Nothing was downloaded.`);
            console.log(`  A build is ~21MB; on mobile data that is a cost only you should agree to.`);
            console.log(`  To fetch it now:      download ${hub}/download/SweK_Engine_${rel.version}.zip in Chrome`);
            console.log(`  To let this do it:    echo '{"tier":"download","autoDownload":true}' > tools/roundhouse/update-policy.json`);
            console.log(`  Installing is always yours: unzip into ~ and cd into the new folder. Nothing overwrites`);
            console.log(`  the build you are running -- each version lives in its own directory.`);
        }
        return;
    }

    // download / download-and-verify
    const res = await fetch(`${hub}/download/SweK_Engine_${rel.version}.zip`, { signal: AbortSignal.timeout(600000) }).catch(() => null);
    if (!res || !res.ok) { console.log("could not fetch the build -- nothing staged, nothing lost"); return; }
    const bytes = Buffer.from(await res.arrayBuffer());
    const v = verifyBuild({ bytes, offer: rel, policy: pol });
    if (!v.ok) { console.log(`REFUSED to stage: ${v.why}`); return; }

    // stage into shared Downloads so the owner can see it from the file manager too
    const dl = path.join(process.env.HOME || here, "storage", "downloads");
    const stage = fs.existsSync(dl) ? path.join(dl, pol.stagingDir) : path.join(here, pol.stagingDir);
    fs.mkdirSync(stage, { recursive: true });
    const dest = path.join(stage, `SweK_Engine_${rel.version}.zip`);
    fs.writeFileSync(dest, bytes);
    console.log(`staged ${dest}  (${(bytes.length / 1048576).toFixed(1)}MB)`);
    console.log(v.applicable ? "  signature VERIFIED against the pinned key" : "  checksum verified");
    console.log(`  to install:  cd ~ && unzip -oq "${dest}" && cd SweK_Engine_${rel.version}/WebGLEngine`);
    console.log("  your current build is untouched -- the new one unzips into its own folder.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); });
}
