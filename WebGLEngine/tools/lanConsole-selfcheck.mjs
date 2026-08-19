// WebGLEngine/tools/lanConsole-selfcheck.mjs — v2630
//
// Run: node tools/lanConsole-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A STATIC gate for lan.html -- no browser, so it never flakes under load. It checks the things that would
// silently break the console: wrong endpoints, no offline handling, or unescaped peer names injected into HTML.
import fs from "node:fs";
import { prose } from "./ship/sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "lan.html"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. IT READS THE RIGHT ENDPOINTS -----------------------------------------------------------------------------
ok("!! the console fetches /services and /okf/brief.json", /getJSON\(["']\/services["']\)/.test(html) && /\/okf\/brief\.json/.test(html),
   "the page is a view of the services registry and the OKF brief; if it fetched the wrong paths it would render an empty LAN against a healthy engine.");

// ---- 2. IT DEGRADES WHEN THERE IS NO ENGINE ----------------------------------------------------------------------
ok("!! there is an offline path for when no engine answers", /function offline\(/.test(html) && /catch\s*\(/.test(html) && /serve this page from the SweK engine/.test(html),
   "opened as a bare file or pointed at a dead host, the console must SAY so and tell you how to fix it, not sit blank -- an empty screen is an invitation to act, not a mystery.");

// ---- 3. PEER-SUPPLIED TEXT IS ESCAPED BEFORE IT HITS innerHTML ----------------------------------------------------
{
    // every dynamic value that reaches innerHTML must pass through esc(); a peer name is untrusted input.
    const hasEsc = /const esc =/.test(html) && /replace\(\/\[&<>\]/.test(html);
    // spot-check that the fields most likely to carry peer text are wrapped: peer name, service name, claim title
    const wrapped = /esc\(b\.peer\)/.test(html) && /esc\(s\.name\)/.test(html) && /esc\(c\.title\)/.test(html);
    ok("!! peer/service/claim text is escaped before rendering", hasEsc && wrapped,
       hasEsc && wrapped ? "esc() wraps peer names, service names, and claim titles -- a peer advertising a service called <img onerror=...> cannot script this console." : "unescaped dynamic text reaches innerHTML: hasEsc=" + hasEsc + " wrapped=" + wrapped + ". A REGISTRY THAT RENDERS PEER STRINGS RAW IS AN XSS HOLE.");
}

// ---- 4. THE SIGNATURE ELEMENTS ARE PRESENT -----------------------------------------------------------------------
ok("!! reachability dots and the claim ledger bar are wired", /class="dot/.test(html) && /\.dot\.off/.test(html) && /class="seg"/.test(html) && /renderOKF/.test(html),
   "the two things that make this readable at a glance -- a green/grey reachability dot per box, and the settled/open/broken ledger bar -- are the console's whole reason to exist over a raw JSON dump.");

// ---- 5. IT MATCHES THE ENGINE'S LCARS PALETTE --------------------------------------------------------------------
ok("!! it uses the engine's established LCARS palette, not a new one", /#ff9c3f|#ff9933|#ff9a6a/.test(html) && /#8aff9e/.test(html) && /Antonio/.test(html),
   "amber/salmon + the green accent + Antonio -- the same vocabulary as the other pages, so the console belongs to the engine rather than looking bolted on.");

console.log(fails ? "\nlanConsole-selfcheck: " + fails + " FAILED" : "\nlanConsole-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
