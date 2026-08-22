// FILE: ai-bridge/installAndroidPeerBridge.mjs
//
// v2922 -- THE INSTALLER, BECAUSE A PATCH CANNOT SHIP server.js. The live server.js and server.html have moved
// through versions this patch has never seen, so overwriting either from a patch zip would silently revert
// someone's tree. Instead: three insertions, each wrapped in a version marker, each anchored on a line chosen
// for being old and load-bearing (the buildName require is v2871, /self/zip is v1682, the checkPeersVer button
// is the update header) -- lines that have survived a hundred versions are the ones likeliest to survive the
// next one.
//
// IDEMPOTENT BY MARKER: a second run finds the markers and changes nothing -- byte-identical output, verified by
// the selfcheck. A missing anchor does not guess: it prints the exact line to paste by hand and where, reports
// PARTIAL, and leaves everything else installed. Nothing is written unless it changes.
//
// Run:  node ai-bridge/installAndroidPeerBridge.mjs            (installs into the real tree)
//       node ai-bridge/installAndroidPeerBridge.mjs <server.js> <server.html>   (selfcheck sandbox)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARK = "v2922 android-peer (install)";

const SERVER_JS = process.argv[2] || path.join(HERE, "server.js");
const SERVER_HTML = process.argv[3] || path.join(HERE, "..", "server.html");

const INSERTS = [
    {
        file: SERVER_JS, name: "require",
        anchor: 'const buildName = require("./buildName.js");',
        where: "after",
        line: `const androidPeerBridge = require("./androidPeerBridge.js");   /* ${MARK} - front door for the Android peer round: /android/status, /android/verdict */`,
    },
    {
        file: SERVER_JS, name: "route",
        anchor: 'if (req.method === "GET" && req.url.split("?")[0] === "/self/zip") {',
        where: "before",
        line: `    if (androidPeerBridge.handle(req, res)) return;   /* ${MARK} */`,
    },
    {
        file: SERVER_HTML, name: "button",
        anchor: '<button id="checkPeersVer"',
        where: "before",
        line: `<a id="androidPeerBtn" href="/android-peer.html" title="SweK Android Peer - install guide, expectations, and the verdict front door for the phone's ballot" style="font-size:11px;padding:2px 10px;margin-left:6px;background:#143020;color:#8fe0ae;border:1px solid #2c6a45;border-radius:5px;cursor:pointer;text-decoration:none;">&#129302; Android Peer</a><!-- ${MARK} -->`,
    },
];

let changed = 0, already = 0, missing = 0;
const byFile = new Map();
for (const ins of INSERTS) {
    if (!byFile.has(ins.file)) {
        if (!fs.existsSync(ins.file)) { console.error("MISSING FILE: " + ins.file); missing++; continue; }
        byFile.set(ins.file, fs.readFileSync(ins.file, "utf8"));
    }
    let src = byFile.get(ins.file);
    if (src.includes(ins.line) || (src.includes(MARK) && src.includes(ins.name === "button" ? "androidPeerBtn" : ins.name === "require" ? "androidPeerBridge = require" : "androidPeerBridge.handle"))) {
        console.log("  already   " + ins.name + " (" + path.basename(ins.file) + ")"); already++; continue;
    }
    const at = src.indexOf(ins.anchor);
    if (at < 0) {
        console.log("  NO ANCHOR " + ins.name + " in " + path.basename(ins.file) + " -- paste by hand, " + ins.where + " the line:\n" +
            "            " + ins.anchor + "\n" +
            "            this line: " + ins.line.trim());
        missing++; continue;
    }
    if (ins.where === "after") {
        const eol = src.indexOf("\n", at);
        src = src.slice(0, eol + 1) + ins.line + "\n" + src.slice(eol + 1);
    } else {
        const bol = src.lastIndexOf("\n", at) + 1;
        src = src.slice(0, bol) + ins.line + "\n" + src.slice(bol);
    }
    byFile.set(ins.file, src);
    console.log("  installed " + ins.name + " (" + path.basename(ins.file) + ")"); changed++;
}
for (const [file, src] of byFile) {
    if (fs.readFileSync(file, "utf8") !== src) fs.writeFileSync(file, src);
}
console.log(changed + " installed, " + already + " already present, " + missing + " need hand-paste" +
    (missing ? " -- PARTIAL (the lines above are the manual fallback; the hub page repeats them)" : ""));
process.exit(missing ? 1 : 0);
