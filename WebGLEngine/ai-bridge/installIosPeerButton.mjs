// FILE: ai-bridge/installIosPeerButton.mjs
//
// v2925 -- one insertion: an iOS Peer button in server.html's header, right after the Android one (which the
// v2922 installer placed). Marker-wrapped, idempotent, hand-paste fallback on a missing anchor. Same discipline
// as every other patch-time server.html edit: never overwrite the file, insert at a stable anchor.
//
// Run:  node ai-bridge/installIosPeerButton.mjs   [server.html]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARK = "v2925 ios-peer (install)";
const SERVER_HTML = process.argv[2] || path.join(HERE, "..", "server.html");
const ANCHOR = '<!-- v2922 android-peer (install) -->';
const LINE = `<a id="iosPeerBtn" href="/ios-peer.html" title="SweK iOS Peer - iPhone/iPad: portable physics subset in-page, plus the Apple GPU as a first-class magmap vendor" style="font-size:11px;padding:2px 10px;margin-left:4px;background:#141f30;color:#9ec9ff;border:1px solid #2c4a6a;border-radius:5px;cursor:pointer;text-decoration:none;">&#127823; iOS Peer</a><!-- ${MARK} -->`;

if (!fs.existsSync(SERVER_HTML)) { console.error("MISSING: " + SERVER_HTML); process.exit(1); }
let src = fs.readFileSync(SERVER_HTML, "utf8");
if (src.includes(MARK) && src.includes("iosPeerBtn")) { console.log("  already present"); process.exit(0); }
if (!src.includes(ANCHOR)) {
    console.log("  NO ANCHOR (the v2922 android button) -- hand-paste, right after the Android Peer <a> tag:\n        " + LINE);
    process.exit(1);
}
const at = src.indexOf(ANCHOR) + ANCHOR.length;
src = src.slice(0, at) + "\n" + LINE + src.slice(at);
fs.writeFileSync(SERVER_HTML, src);
console.log("  installed iOS Peer button");
process.exit(0);
