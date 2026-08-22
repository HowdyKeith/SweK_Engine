// WebGLEngine/tools/ship/gateConfigWrites-selfcheck.mjs -- v3937
//
// Run: node tools/ship/gateConfigWrites-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** A GATE ARMED THE LIVE UPDATER AND NOBODY NOTICED FOR THIRTY-FIVE VERSIONS. ***
//
// ai-bridge/downloadScan-selfcheck.mjs wrote one-byte zips named SweK_Engine_v9101 (1).zip, v9102, v9103 into a
// temp folder to prove the scanner reads copy-suffixed names -- correct, and worth checking. To make the scanner
// look there it called:
//
//     sb.setConfig({ update: { downloadsDir: dir, enabled: true, autoApply: true } })
//
// setConfig ends in saveCfg(), which WRITES THE FILE. It never put the value back. So on Keith's rig the running
// engine was aimed at a directory of placeholders, with auto-apply switched on BY THE TEST, and the update banner
// offered to install v9302 over v3936. The only thing between that and a real build being replaced by a file
// containing the letter x was Keith reading the banner and asking about it. patchScanDoor-selfcheck did the same
// thing twice more.
//
// *** THE INSTANCE WAS ONE LINE. THE CLASS IS THIS FILE. *** A test that mutates production state to run will
// eventually forget to put it back -- and the failure is silent, arrives later, and looks like a bug in the
// thing being tested rather than in the test. The scanners take a DIRECTORY ARGUMENT now, so no gate has any
// reason to write config at all, and this check makes the old shortcut unavailable rather than merely discouraged.
//
// NOT A BAN ON setConfig ITSELF: the bridge's own route calls it, and so may a tool whose SUBJECT is the config.
// What is refused is a *-selfcheck writing the keys that steer the updater at real files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP = /node_modules|[\\/]\.git|[\\/]vendor|render-qa[\\/]out/;
let fails = 0;
const ok = (n, c, d) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + n + (d ? "   " + d : "")); if (!c) fails++; };

/** Blank comments and string bodies: a gate that DESCRIBES the defect must not read as committing it. */
function codeOnly(t) {
    const out = []; let inBlock = false;
    for (const line of String(t).split("\n")) {
        const s = line.trimStart();
        if (inBlock) { if (/\*\//.test(line)) inBlock = false; out.push(""); continue; }
        if (s.startsWith("/*")) { if (!/\*\//.test(s.slice(2))) inBlock = true; out.push(""); continue; }
        if (s.startsWith("//")) { out.push(""); continue; }
        out.push(line);
    }
    return out.join("\n").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

function walk(dir, out = []) {
    let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of es) {
        const f = path.join(dir, e.name);
        if (SKIP.test(f)) continue;
        if (e.isDirectory()) walk(f, out);
        else if (/-selfcheck\.mjs$/.test(e.name)) out.push(f);
    }
    return out;
}

// The keys that steer the updater at real files and grant it permission to act on them.
const STEERING = ["downloadsDir", "targetDir", "autoApply", "enabled", "autoFetch", "autoPullPeers", "autoRemoveOld"];
const CALL = /\bsetConfig\s*\(/;

const gates = walk(ENG);
const offenders = [];
for (const f of gates) {
    const code = codeOnly(fs.readFileSync(f, "utf8"));
    if (!CALL.test(code)) continue;
    // which steering keys appear in the same file's live code
    const hit = STEERING.filter((k) => new RegExp("\\b" + k + "\\s*:").test(code));
    if (hit.length) offenders.push(path.relative(ENG, f).replace(/\\/g, "/") + " [" + hit.join(", ") + "]");
}

ok("!! *** NO GATE WRITES THE UPDATER'S STEERING CONFIG ***", offenders.length === 0,
   offenders.length
     ? "WOULD LEAVE THE LIVE INSTALLER MISAIMED: " + offenders.join(" | ")
     : gates.length + " gates scanned. setConfig persists through saveCfg(), so a gate that writes downloadsDir " +
       "or autoApply changes what the RUNNING ENGINE will install -- and downloadScan-selfcheck did exactly that " +
       "until v3937, leaving Keith's rig offering a one-byte v9302 over v3936");

ok("...and the scanners take a directory, so a gate has no reason to write config",
   ["scanDownloads", "scanDownloadsPartial", "scanDownloadsRejects", "updateStatus", "patchScan"]
       .every((fn) => new RegExp("function " + fn + "\\s*\\(\\s*\\w+").test(fs.readFileSync(path.join(ENG, "ai-bridge", "sysadminBridge.js"), "utf8"))),
   "each takes an optional folder and falls back to downloadsDir(), so production is unchanged and a fixture " +
   "needs no persistence. REMOVING THE REASON is what makes the rule above keepable");

// A CHECK NOBODY HAS SEEN FAIL MIGHT NOT FIRE.
{
    const bad = "sb.setConfig({ update: { downloadsDir: dir, autoApply: true } });";
    const good = "const st = sb.updateStatus(dir);";
    const judge = (src) => CALL.test(codeOnly(src)) && STEERING.some((k) => new RegExp("\\b" + k + "\\s*:").test(codeOnly(src)));
    ok("!! SABOTAGE: the exact line that armed the rig IS caught", judge(bad) === true,
       "downloadScan-selfcheck line 43, verbatim, as it stood from v3919 to v3936");
    ok("...and the corrected form is NOT", judge(good) === false, "passing the folder writes nothing");
    ok("...and a COMMENT describing the defect is not read as committing it",
       judge("// sb.setConfig({ update: { downloadsDir: d, autoApply: true } }) -- what v3937 removed") === false,
       "this file and two others explain the shape at length; a scanner that matched prose would flag its own notes");
}

console.log(fails ? "\ngateConfigWrites-selfcheck: " + fails + " FAILED" : "\ngateConfigWrites-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
