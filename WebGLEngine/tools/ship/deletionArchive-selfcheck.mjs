// tools/ship/deletionArchive-selfcheck.mjs
//
// v3207 -- PROVES THAT A TOOL WHICH DELETES CANNOT DELETE WITHOUT WRITING A WAY BACK.
//
// Keith, on deciding to remove two dead files: "i should have made sure when we deleted files before, that they
// exported and zipped up, just in case." removeCluster deleted 66 live modules and the reachability bug was bad
// -- BUT THE BUG BEING UNRECOVERABLE IS WHAT MADE IT A MONTH. Recovery cost 43 versions of not noticing, two
// zip diffs, three convergence passes, and a 203-archive sweep across two drives.
//
// EVERY CHECK BELOW IS SHOWN FAILING THE OTHER WAY, because the only claim that matters here is a claim about
// ABSENCE -- "it cannot delete without an archive" -- and an absence asserted is worth nothing.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { archiveBeforeDelete, buildZip } from "./deletionArchive.mjs";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { pass++; console.log("  PASS  " + n + (d ? "   " + d : "")); } else { fail++; console.log("  FAIL  " + n + (d ? "   " + d : "")); } };

console.log("\ndeletionArchive-selfcheck -- a tool that deletes owes a way back\n");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-del-"));
fs.mkdirSync(path.join(tmp, "sub"), { recursive: true });
fs.writeFileSync(path.join(tmp, "a.js"), "export const a = 1;\n");
fs.writeFileSync(path.join(tmp, "sub", "b.js"), "export const b = 2;\n");

// ---- 1. the archive actually holds the bytes -----------------------------------------------------------
{
    const r = archiveBeforeDelete(tmp, ["a.js", "sub/b.js"], { reason: "gate fixture", tag: "test" });
    ok("an archive is written and reports what it holds", !!r && r.count === 2, r ? path.basename(r.path) : "none");
    const buf = fs.readFileSync(r.path);
    ok("it begins with a local file header, so it is a zip and not an empty file",
        buf.readUInt32LE(0) === 0x04034b50, buf.length + " bytes");
    // read it back WITHOUT the writer, so a symmetrical bug in buildZip cannot hide inside its own verifier
    const txt = buf.toString("latin1");
    ok("!! both paths survive, ROOT-RELATIVE and with the subdirectory intact",
        txt.includes("a.js") && txt.includes("sub/b.js"),
        "a flattened archive restores to the wrong place, which is worse than none -- it looks like it worked");
    ok("...and the file CONTENTS are there, not just the names",
        txt.includes("export const a = 1;") && txt.includes("export const b = 2;"),
        "stored entries, so the bytes are literally in the file and a reader needs no codec");
    ok("a WHY.txt rides along", txt.includes("WHY.txt") && txt.includes("TO RESTORE"),
        "a zip of loose files with no explanation is a puzzle in six months; it records the tool, the time and the reason");
    ok("...and the WHY names the re-run", txt.includes("RE-RUN THE IMPORT GATES"),
        "a restored file brings its own dependencies -- that has needed more than one pass EVERY time it has been done here");
}

// ---- 2. THE REFUSALS. It must be impossible to delete believing an archive exists when it does not. ------
{
    let threw = false;
    try { archiveBeforeDelete(tmp, ["does-not-exist.js"], { tag: "test" }); } catch { threw = true; }
    ok("!! it THROWS when it could not read a single file, rather than returning a falsy result",
        threw,
        "a caller must not be able to treat 'the archive failed' as a warning it prints and steps past -- that is the shape of every near-miss in this tree");

    const r = archiveBeforeDelete(tmp, ["a.js", "gone.js"], { tag: "test" });
    ok("a PARTIAL read still archives what it could, and NAMES what it could not",
        r && r.count === 1 && r.unreadable.length === 1 && /gone\.js/.test(r.unreadable[0]),
        "silently archiving 1 of 2 and reporting success is how a restorer discovers the gap at the worst moment");
    ok("...and the unreadable file is named INSIDE the zip too, not only in the return value",
        fs.readFileSync(r.path, "latin1").includes("UNREADABLE"),
        "the return value is gone the moment the process exits; the zip is what survives");

    ok("an empty delete list archives nothing and does not invent a file",
        archiveBeforeDelete(tmp, [], { tag: "test" }) === null);
}

// ---- 3. THE POINT: removeCluster cannot reach its rmSync without going through this ----------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "removeCluster.mjs"), "utf8");
    const code = noComments(src);
    ok("removeCluster imports the archiver", /archiveBeforeDelete/.test(code) && /deletionArchive\.mjs/.test(code));
    const iArchive = code.indexOf("archiveBeforeDelete(ENG");
    const iDelete = code.indexOf("fs.rmSync");
    ok("!! ...and CALLS it BEFORE rmSync, not after and not alongside",
        iArchive > 0 && iDelete > 0 && iArchive < iDelete,
        "archive at char " + iArchive + ", delete at char " + iDelete + " -- an archive written after the delete is a list of empty files");
    ok("...and does not swallow the throw",
        !/try\s*\{[^}]*archiveBeforeDelete/.test(code),
        "wrapping it in a catch would restore exactly the behaviour this replaces: a way back that is optional in practice");
}

// ---- 4. the real archive this round produced -------------------------------------------------------------
{
    const dir = path.join(ENG, "tools", "ship", "deleted");
    const zips = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".zip")) : [];
    ok("the engine/ barrel deletion left its archive in the tree",
        zips.some((z) => /engine-barrel/.test(z)),
        zips.join(", ") || "none -- v3207 deleted engine/index.js and engine/bootstrap.js and MUST have kept a copy");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("\n" + (fail === 0 ? `deletionArchive-selfcheck: all ${pass} checks pass` : `deletionArchive-selfcheck: ${fail} FAILED, ${pass} passed`));
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(fail === 0 ? 0 : 1);
