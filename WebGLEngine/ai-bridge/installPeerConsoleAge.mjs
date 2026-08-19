// FILE: ai-bridge/installPeerConsoleAge.mjs
//
// v2924 -- SURFACE WHAT WAS ALREADY CAPTURED. server.js has tracked _lastConsoleHit since v2330 (the last time a
// browser fetched server.html on that box). The peer list never showed it, so a fleet operator could see that a
// peer was ONLINE but not whether anyone was actually AT it. This installer threads that one number out through
// the per-peer probe (/node/caps) and renders it in each peer row as "console active Ns ago" -- the peer-side
// equivalent of the "on <page> (Ns ago)" line the Remote-logins section already shows for tunnel visitors.
//
// TWO INSERTIONS, both marker-wrapped and idempotent, both against copies when the selfcheck runs. Like the
// front-door installer, a missing anchor prints the hand-paste line rather than guessing, and a second run is a
// byte-identical no-op.
//
// Run:  node ai-bridge/installPeerConsoleAge.mjs
//       node ai-bridge/installPeerConsoleAge.mjs <server.js> <server.html>   (selfcheck sandbox)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARK = "v2924 peer-console-age";

const SERVER_JS = process.argv[2] || path.join(HERE, "server.js");
const SERVER_HTML = process.argv[3] || path.join(HERE, "..", "server.html");

const INSERTS = [
    {
        // add consoleAgeMs to the /node/caps reply. Anchor on the exact reply object literal (v-stable since v1570).
        file: SERVER_JS, name: "caps-field", token: "consoleAgeMs",
        find: "rustdeskId: rid || null,",
        replace: `rustdeskId: rid || null, consoleAgeMs: (typeof _lastConsoleHit === "number" && _lastConsoleHit) ? (Date.now() - _lastConsoleHit) : null, /* ${MARK} */`,
    },
    {
        // render it in the peer row. Anchor on the version-badge span that already exists in renderPeers.
        file: SERVER_HTML, name: "peer-row", token: "consoleAgeMs",
        find: "(p.version?\" <span style=\\'font-size:9px;padding:0 4px;border-radius:3px;background:#0d2218;color:#7fefb0;border:1px solid #1e4a30\\'>v\"+esc(String(p.version))+\"</span>\":\"\")",
        replace: "(p.version?\" <span style=\\'font-size:9px;padding:0 4px;border-radius:3px;background:#0d2218;color:#7fefb0;border:1px solid #1e4a30\\'>v\"+esc(String(p.version))+\"</span>\":\"\")+(function(){ /* " + MARK + " */ var ca=(pr&&typeof pr.consoleAgeMs===\"number\")?pr.consoleAgeMs:null; if(ca==null) return \"\"; var s=Math.round(ca/1000); var t=s<60?(s+\"s\"):(s<3600?(Math.round(s/60)+\"m\"):(Math.round(s/3600)+\"h\")); var fresh=s<90; return \" <span title=\\'someone had a console open on this peer this recently\\' style=\\'font-size:9px;padding:0 4px;border-radius:3px;background:\"+(fresh?\"#0d2218\":\"#1a1a22\")+\";color:\"+(fresh?\"#7fefb0\":\"#8a8a9a\")+\";border:1px solid #2a3a30\\'>\\uD83D\\uDCFA \"+t+\"</span>\"; })()",
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
    if (src.includes(MARK) && src.includes(ins.token)) { console.log("  already   " + ins.name); already++; continue; }
    if (!src.includes(ins.find)) {
        console.log("  NO ANCHOR " + ins.name + " in " + path.basename(ins.file) + " -- hand-edit: replace\n        " + ins.find + "\n            with\n        " + ins.replace);
        missing++; continue;
    }
    if (src.split(ins.find).length > 2) {
        console.log("  AMBIGUOUS " + ins.name + " -- anchor appears more than once in " + path.basename(ins.file) + "; hand-edit required");
        missing++; continue;
    }
    byFile.set(ins.file, src.replace(ins.find, ins.replace));
    console.log("  installed " + ins.name); changed++;
}
for (const [file, src] of byFile) if (fs.readFileSync(file, "utf8") !== src) fs.writeFileSync(file, src);
console.log(changed + " installed, " + already + " already present, " + missing + " need hand-paste");
process.exit(missing ? 1 : 0);
