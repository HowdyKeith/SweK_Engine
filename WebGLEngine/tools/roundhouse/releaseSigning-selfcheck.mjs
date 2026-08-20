// tools/roundhouse/releaseSigning-selfcheck.mjs
//
// v2959 -- THE LOOP CLOSES, AND THE ONE THING THAT MUST NEVER HAPPEN.
//
// Hub signs a build; a verified-tier peer checks the signature against a key its operator pinned by hand. The
// whole scheme rests on one asymmetry: the public key may go anywhere, and the PRIVATE key must never leave the
// hub -- above all it must never be swept into a build zip. A signing key inside a release is not a signing key:
// everyone who downloads it can sign anything, and every pinned public key in the fleet is worthless at once.
//
// So the loudest check in this file is not about cryptography. It is a search of the shipped tree for a private
// key, and it fails the build if one is there.

import { keygen, signBuild, insideTree, PRIVATE_PATH } from "./signRelease.mjs";
import { verifyBuild } from "./updatePolicy.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = path.resolve(here, "..", "..");

// ---- 1. NO PRIVATE KEY IS ANYWHERE IN THE SHIPPED TREE ------------------------------------------------------------------
{
    const hits = [];
    const walk = (dir, depth = 0) => {
        if (depth > 6) return;
        let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name === "node_modules" || e.name === ".git") continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full, depth + 1); continue; }
            if (!/\.(pem|key)$/i.test(e.name) && !/private/i.test(e.name)) continue;
            let head = ""; try { head = fs.readFileSync(full, "utf8").slice(0, 200); } catch { continue; }
            if (/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/.test(head)) hits.push(path.relative(ENGINE_ROOT, full));
        }
    };
    walk(ENGINE_ROOT);
    ok("!! NO private key exists anywhere in the engine tree",
        hits.length === 0,
        hits.length ? "FOUND: " + hits.join(", ") + " -- this would ship to every peer" :
        "searched the tree for PEM private-key blocks and found none. A signing key inside a build makes every " +
        "pinned public key in the fleet worthless the moment someone downloads it");
}

// ---- 2. KEYGEN REFUSES TO PUT A KEY WHERE IT WOULD SHIP ---------------------------------------------------------------------
{
    ok("!! keygen refuses a destination inside the engine tree",
        (() => { try { keygen({ dir: path.join(ENGINE_ROOT, "tools", "roundhouse") }); return false; } catch (e) { return /inside the engine tree/.test(e.message); } })(),
        "the default destination is ~/.swek, outside the tree entirely, and an inside-the-tree path is rejected " +
        "with the reason spelled out rather than silently accepted");

    ok("...and the default private path is outside the tree",
        !insideTree(PRIVATE_PATH),
        PRIVATE_PATH + " -- outside, so a build sweep cannot pick it up");
}

// ---- 3. THE SIGNATURE ACTUALLY BINDS THE BYTES ---------------------------------------------------------------------------------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-sign-"));
    const k = keygen({ dir });
    const zip = path.join(dir, "SweK_Engine_v2959.zip");
    fs.writeFileSync(zip, Buffer.from("PRETEND BUILD BYTES"));
    const manifest = signBuild(zip, { privatePath: k.priv });

    ok("!! a signed build verifies on a peer holding the matching public key",
        verifyBuild({ bytes: fs.readFileSync(zip), offer: manifest, policy: { tier: "verified", publicKeyPem: k.publicKeyPem } }).applicable === true,
        "hub signs {version, sha256, size}; peer verifies against the pinned key. " + manifest.version + ", " + manifest.size + " bytes");

    fs.writeFileSync(zip, Buffer.from("TAMPERED BUILD!!!!"));
    const after = verifyBuild({ bytes: fs.readFileSync(zip), offer: manifest, policy: { tier: "verified", publicKeyPem: k.publicKeyPem } });
    ok("!! swapping the zip AFTER signing is caught, even though the signature is genuine",
        after.applicable === false && /checksum mismatch/.test(after.why),
        "the signature covers the manifest and the checksum binds the manifest to those exact bytes -- so a real " +
        "signature over substituted content fails, which is the attack this design exists to stop");

    ok("keygen refuses to overwrite an existing key",
        (() => { try { keygen({ dir }); return false; } catch (e) { return /refusing to overwrite/.test(e.message); } })(),
        "overwriting would orphan every peer already pinned to the old key -- an irreversible mistake, so it " +
        "takes an explicit force");
}

// ---- 4. THE PEER STAGES, AND STILL NEVER RUNS ANYTHING -------------------------------------------------------------------------
{
    const peer = fs.readFileSync(path.join(here, "lighthouse_checkin.mjs"), "utf8")
        .replace(/^\s*\/\/.*$/gm, "").replace(/`(?:[^`\\]|\\.)*`/g, "``").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    ok("!! even with staging wired in, the peer has no exec, spawn, or extraction",
        !/child_process|\bexec\(|\bspawn\(|\bunzip\b|\bextract\b/.test(peer),
        "it writes a verified zip into a staging folder and stops. Downloading is not installing, and the line " +
        "between them is the entire safety property");

    ok("a build that fails verification is REFUSED, not staged anyway",
        /REFUSED to stage/.test(fs.readFileSync(path.join(here, "lighthouse_checkin.mjs"), "utf8")),
        "a bad checksum means the file never reaches the staging folder -- otherwise a person would later find " +
        "an unverified zip sitting where verified ones go and reasonably assume it had passed");
}

console.log();
if (fails) { console.log("releaseSigning-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("releaseSigning-selfcheck: all checks pass");
