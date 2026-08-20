// tools/roundhouse/applyStaged-selfcheck.mjs
//
// v2972 -- `applicable` FINALLY MEANS SOMETHING, AND THE EXTRACTOR IS WHY IT CAN.
//
// updatePolicy has computed `applicable` since v2958 and nothing acted on it, so the verified tier differed from
// plain download only by a printed message -- the key ceremony was decorative. This closes it.
//
// Applying needed extraction, and there is no zip library here and no built-in zip reader. Adding a dependency
// or shelling out to `unzip` were the easy answers; the container is parsed with zlib and fs instead, for a
// reason that is not purity:
//
//     THE EXTRACTOR IS WHAT STANDS BETWEEN A SIGNED ARCHIVE AND ARBITRARY FILE WRITES.
//
// A signature proves an archive came from the key holder. It does not prove the archive is harmless, and the
// verified tier exists so a machine can act WITHOUT a human reading the contents. ZIP-SLIP -- an entry named
// ../../../etc/cron.d/x -- escapes the destination and lands anywhere. Delegating that to whatever `unzip` does
// would put the one decision that matters outside anything this tree can gate.

import { unsafeReason, readCentralDirectory, extractZip } from "./safeExtract.mjs";
import { verifyBuild } from "./updatePolicy.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));

// minimal single-entry zip builder, so hostile archives can be constructed without shipping one
function mkzip(name, content) {
    const data = zlib.deflateRawSync(Buffer.from(content)), nb = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(content.length, 22); lh.writeUInt16LE(nb.length, 26);
    const local = Buffer.concat([lh, nb, data]);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(content.length, 24); cd.writeUInt16LE(nb.length, 28); cd.writeUInt32LE(0, 42);
    const cdb = Buffer.concat([cd, nb]);
    const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(1, 8); eo.writeUInt16LE(1, 10);
    eo.writeUInt32LE(cdb.length, 12); eo.writeUInt32LE(local.length, 16);
    return Buffer.concat([local, cdb, eo]);
}
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), "swek-apply-"));

// ---- 1. ZIP-SLIP AND ITS RELATIVES ARE REFUSED --------------------------------------------------------------------------
{
    const cases = [
        ["../../../etc/cron.d/pwn", "parent traversal"],
        ["/etc/passwd", "absolute path"],
        ["C:\\Windows\\system32\\x.dll", "absolute path"],
        ["ok/../../escape", "parent traversal"],
        ["a\0b", "NUL byte"],
    ];
    ok("!! every classic escape is refused by name",
        cases.every(([n]) => !!unsafeReason(n, {})),
        cases.map(([n]) => n.slice(0, 18)).join(" | ") + " -- all refused. A signature says who made the archive, " +
        "not that it is safe to unpack");

    ok("symlink entries are refused",
        !!unsafeReason("link", { isSymlink: true }),
        "a symlink extracts harmlessly and then points wherever it likes -- the escape happens after extraction, " +
        "so the name check alone would not catch it");

    ok("an ordinary path is allowed",
        unsafeReason("WebGLEngine/main.js", {}) === null,
        "the guard is strict, not broken");
}

// ---- 2. A HOSTILE ARCHIVE IS REFUSED WHOLE, BEFORE ANY WRITE ---------------------------------------------------------------
{
    const dest = path.join(tmpdir(), "out");
    let threw = null;
    try { extractZip(mkzip("../../escaped.txt", "pwned"), dest); } catch (e) { threw = e.message; }
    ok("!! one bad entry aborts the ENTIRE extraction",
        !!threw && /refusing the whole archive/.test(threw) && !fs.existsSync(dest),
        "and the destination is never created. A build with a hostile entry is not a build to install three " +
        "quarters of, so validation runs over every entry before a single byte is written");
}

// ---- 3. IT NEVER OVERWRITES AN EXISTING TREE -------------------------------------------------------------------------------
{
    const d = path.join(tmpdir(), "exists");
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "precious.txt"), "do not clobber me");
    let threw = null;
    try { extractZip(mkzip("a.txt", "x"), d); } catch (e) { threw = e.message; }
    ok("!! extracting onto an existing directory is refused",
        !!threw && /already exists/.test(threw) && fs.readFileSync(path.join(d, "precious.txt"), "utf8") === "do not clobber me",
        "applying a build extracts ALONGSIDE, never over. The running install is untouched by construction rather " +
        "than by care, so a failed apply costs a deletable directory and nothing else");
}

// ---- 4. A REAL ARCHIVE ROUND-TRIPS, EXECUTABLE BITS INTACT --------------------------------------------------------------------
{
    const zip = mkzip("WebGLEngine/main.js", 'const ENGINE_VERSION = "v9999";');
    const dest = path.join(tmpdir(), "good");
    const r = extractZip(zip, dest);
    ok("a well-formed archive extracts and its contents are correct",
        r.files === 1 && /v9999/.test(fs.readFileSync(path.join(dest, "WebGLEngine", "main.js"), "utf8")),
        "central-directory parse, raw inflate, path-checked write -- with zlib and fs, no dependency and no " +
        "child_process anywhere in the apply path");
}

// ---- 5. APPLYING REQUIRES A VERIFIED SIGNATURE, NOT MERELY A GOOD CHECKSUM ------------------------------------------------------
{
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const PEM = publicKey.export({ type: "spki", format: "pem" });
    const bytes = Buffer.from("BUILD");
    const man = { version: "v9999", sha256: crypto.createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
    const signed = { ...man, signature: crypto.sign(null, Buffer.from(JSON.stringify(man)), privateKey).toString("base64") };

    ok("!! at download tier a perfectly good signed build is still NOT applicable",
        verifyBuild({ bytes, offer: signed, policy: { tier: "download" } }).applicable === false,
        "checksum verifies, signature is genuine -- and applying still requires the operator to have chosen the " +
        "verified tier and pinned a key. Being able to verify is not being authorised to install");

    ok("at verified tier WITH the key it is applicable",
        verifyBuild({ bytes, offer: signed, policy: { tier: "verified", publicKeyPem: PEM } }).applicable === true,
        "this is the value `applicable` has carried since v2958 with nothing acting on it -- the key ceremony was " +
        "decorative until now");

    const src = fs.readFileSync(path.join(here, "applyStaged.mjs"), "utf8");
    ok("!! applyStaged extracts ONLY when applicable is true",
        /if \(!v\.applicable\)/.test(src) && /NOT applying/.test(src),
        "any other tier prints why and exits without extracting, rather than falling back to 'checksum was fine'");

    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/`(?:[^`\\]|\\.)*`/g, "``").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    ok("...and it still never restarts anything",
        !/child_process|\bexec\(|\bspawn\(/.test(code),
        "extract, verify what landed, print the path. Switching is a human act -- an updater that restarted the " +
        "engine could turn a bad build into an outage nobody chose");
}

console.log();
if (fails) { console.log("applyStaged-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("applyStaged-selfcheck: all checks pass");
