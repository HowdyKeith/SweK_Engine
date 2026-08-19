// WebGLEngine/ai-bridge/tools/puppeteer-bridge-selfcheck.mjs — proves the pure logic of the devtools bridge.
//
// It does NOT launch Chrome (that is RIG-ONLY). It proves the parts that must be right regardless of
// whether puppeteer-core or Chrome are installed: the URL guard (own-pages only unless overridden), the
// route ownership, and that status() never throws even with no puppeteer-core present.
//
//   run: node ai-bridge/tools/puppeteer-bridge-selfcheck.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const b = require("../puppeteerBridge.js");

let pass = 0, total = 0;
const ok = (name, cond, detail = "") => { total++; if (cond) { pass++; console.log(`  ok   ${name}`); } else { console.log(`  FAIL ${name}${detail ? "  -- " + detail : ""}`); } };

console.log("puppeteer-bridge-selfcheck: route ownership");
ok("owns /devtools/shot", b.owns("/devtools/shot"));
ok("owns /devtools/status?x=1 (ignores query)", b.owns("/devtools/status?x=1"));
ok("does NOT own /rocket/prepare", !b.owns("/rocket/prepare"));

console.log("puppeteer-bridge-selfcheck: URL guard (own pages only unless overridden)");
ok("localhost allowed", b._guardUrl("http://localhost:8787/server.html", false).ok);
ok("127.0.0.1 allowed", b._guardUrl("http://127.0.0.1:8787/brain-maze.html", false).ok);
ok("private LAN (192.168.x) allowed", b._guardUrl("http://192.168.10.40:8787/server.html", false).ok);
ok("private LAN (10.x) allowed", b._guardUrl("http://10.0.0.5:8787/", false).ok);
ok(".local mDNS host allowed", b._guardUrl("http://galaxina.local:8787/", false).ok);
ok("public URL BLOCKED by default", !b._guardUrl("https://example.com/", false).ok);
ok("public URL allowed with allowExternal", b._guardUrl("https://example.com/", true).ok);
ok("non-http scheme rejected", !b._guardUrl("file:///etc/passwd", true).ok);
ok("garbage rejected", !b._guardUrl("not a url", false).ok);

console.log("puppeteer-bridge-selfcheck: status() never throws");
let s = null, threw = false;
try { s = b._status(); } catch { threw = true; }
ok("status() returned without throwing", !threw && !!s);
ok("status reports a puppeteer field", !!s && typeof s.puppeteer === "string");
ok("status lists the routes", !!s && Array.isArray(s.routes) && s.routes.includes("/devtools/shot"));

console.log(`\npuppeteer-bridge-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
