// tools/roundhouse/applyStaged.mjs
//
// v2972 -- THE STEP THAT CONSUMES `applicable`.
//
//   node tools/roundhouse/applyStaged.mjs [staged.zip]
//
// updatePolicy has computed `applicable` since v2958 -- "checksum and signature both verify against the key
// pinned on this machine, so applying is authorised" -- and nothing has ever acted on it. The verified tier
// therefore differed from plain download only by a printed message, which made the key ceremony decorative.
//
// WHAT APPLYING MEANS HERE, and it is deliberately less than it sounds:
//
//     EXTRACT ALONGSIDE. NEVER OVER. NEVER DELETE. NEVER RESTART.
//
// A build extracts to a sibling directory named for its own version, exactly as the Termux install already does.
// Nothing overwrites the tree in use, nothing is removed, no process is restarted. The worst outcome of a failed
// or hostile apply is a directory that can be deleted; the running install is untouched by construction rather
// than by care. Switching remains a human act -- start the new one when convenient.
//
// AND IT REFUSES UNLESS THE SIGNATURE VERIFIES. Not "unless the checksum matches" -- the whole point of the
// verified tier is that a machine whose owner should not have to make security decisions acts only on a build
// signed by the key its operator placed there in person. At any other tier this exits without extracting and
// says why.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBuild, readPolicy } from "./updatePolicy.mjs";
import { extractZip } from "./safeExtract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

export function findStaged(policy) {
    const p = readPolicy(policy);
    const roots = [path.join(process.env.HOME || here, "storage", "downloads", p.stagingDir), path.join(here, p.stagingDir)];
    for (const r of roots) {
        try {
            const zips = fs.readdirSync(r).filter((f) => /^SweK_Engine_v\d+\.zip$/i.test(f))
                .sort((a, b) => parseInt(b.match(/v(\d+)/)[1], 10) - parseInt(a.match(/v(\d+)/)[1], 10));
            if (zips.length) return path.join(r, zips[0]);
        } catch {}
    }
    return null;
}

async function main() {
    let policy = {};
    try { policy = JSON.parse(fs.readFileSync(path.join(here, "update-policy.json"), "utf8")); } catch {}
    const p = readPolicy(policy);
    const zipPath = process.argv[2] || findStaged(policy);
    if (!zipPath || !fs.existsSync(zipPath)) { console.error("no staged build found -- run the update check first"); process.exit(2); }

    let manifest = null;
    try { manifest = JSON.parse(fs.readFileSync(path.join(here, "release-manifest.json"), "utf8")); } catch {}
    if (!manifest) { console.error("no release manifest available -- cannot verify what this archive claims to be"); process.exit(1); }

    const bytes = fs.readFileSync(zipPath);
    const v = verifyBuild({ bytes, offer: manifest, policy: p });
    console.log(`staged: ${zipPath}`);
    console.log(`tier ${v.tier}  checksum ${v.ok ? "ok" : "FAILED"}  signature ${v.signature}`);

    if (!v.applicable) {
        console.log("");
        console.log("NOT applying. " + v.why);
        if (p.tier !== "verified") {
            console.log("  Applying automatically requires the 'verified' tier AND a public key pinned on this");
            console.log("  machine. Without a key there is nothing to distinguish a genuine build from any other");
            console.log("  archive that happens to have the right checksum.");
        }
        console.log(`  You can still install it yourself: unzip "${zipPath}" into a directory of your choosing.`);
        process.exit(0);
    }

    const dest = path.resolve(here, "..", "..", "..", `SweK_Engine_${manifest.version}`);
    if (fs.existsSync(dest)) { console.log(`already applied: ${dest} exists -- nothing to do`); process.exit(0); }

    console.log(`signature VERIFIED against the pinned key -- extracting to ${dest}`);
    const tmp = dest + ".partial";
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    let r;
    try { r = extractZip(bytes, tmp); }
    catch (e) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} ; console.error("extraction refused: " + e.message); process.exit(1); }

    // the archive contains a top-level SweK_Engine_vNNNN/ -- lift it so dest IS that directory
    const inner = path.join(tmp, `SweK_Engine_${manifest.version}`);
    if (fs.existsSync(inner)) { fs.renameSync(inner, dest); fs.rmSync(tmp, { recursive: true, force: true }); }
    else { fs.renameSync(tmp, dest); }

    // confirm what landed is what was claimed, before telling anyone it worked
    const mainJs = path.join(dest, "WebGLEngine", "main.js");
    const landed = fs.existsSync(mainJs) && new RegExp(`ENGINE_VERSION = "${manifest.version}"`).test(fs.readFileSync(mainJs, "utf8"));
    console.log(`extracted ${r.files} files, ${(r.bytes / 1048576).toFixed(1)}MB`);
    console.log(landed ? `verified: ${dest} reports ${manifest.version}` : `WARNING: extracted, but main.js does not report ${manifest.version}`);
    console.log("");
    console.log("Your running install is untouched. Start the new one when you choose:");
    console.log(`  cd "${dest}/WebGLEngine"`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch((e) => { console.error(String((e && e.message) || e)); process.exit(1); });
}
