// WebGLEngine/ai-bridge/okfService-selfcheck.mjs — v2624
//
// Run: node ai-bridge/okfService-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Proves the /okf/ SERVICE serves a conformant, complete, safe OKF bundle over HTTP -- not just that the
// emitter writes files (okf-selfcheck covers that), but that the SERVER hands them out correctly.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const okfBridge = require("./okfBridge.js");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// a tiny mock of Node's res that captures the status, headers, and body a handler writes
function mockRes() {
    return {
        code: 0, headers: {}, body: "",
        writeHead(code, headers) { this.code = code; this.headers = headers || {}; },
        end(chunk) { if (chunk != null) this.body += chunk.toString(); },
    };
}
async function get(url) {
    const res = mockRes();
    await okfBridge.handle({ url }, res, {});
    return res;
}

// ---- 1. THE BRIDGE OWNS /okf AND NOTHING ELSE ---------------------------------------------------------------------
ok("!! /okf/* is owned, /okra and /ok are not", okfBridge.owns("/okf/") && okfBridge.owns("/okf/claims/index.md") && !okfBridge.owns("/okra") && !okfBridge.owns("/ok"),
   "owns() must match the /okf namespace exactly. If it over-matched (/okra, /ok) it would swallow unrelated routes; if it under-matched, the service would 404 its own bundle.");

// ---- 2. THE ROOT SERVES A CONFORMANT INDEX ------------------------------------------------------------------------
{
    const r = await get("/okf/");
    ok("!! GET /okf/ serves the root index with okf_version 0.1", r.code === 200 && /okf_version:\s*"?0\.1"?/.test(r.body) && /text\/markdown/.test(r.headers["Content-Type"] || ""),
       "status " + r.code + ", type " + (r.headers["Content-Type"] || "?") + ". A bare /okf/ must resolve to index.md -- the front door an agent walks in through -- and it must announce the format version so the consumer knows the rules.");
}

// ---- 3. A CLAIM CONCEPT IS SERVED AND CARRIES ITS type ------------------------------------------------------------
{
    const idx = await get("/okf/claims/index.md");
    const firstLink = (idx.body.match(/\]\((\/claims\/[^)]+\.md)\)/) || [])[1];
    ok("!! the claims listing links to real claim concepts", idx.code === 200 && !!firstLink,
       "claims/index.md served (" + idx.code + ") and links to " + (firstLink || "NOTHING") + ". The listing is how an agent discovers the concepts without a filesystem walk.");
    if (firstLink) {
        const c = await get("/okf" + firstLink);
        ok("!! a served claim concept declares type: claim", c.code === 200 && /^---[\s\S]*?\btype:\s*claim\b/m.test(c.body),
           "fetched " + firstLink + " (" + c.code + "); its frontmatter carries type: claim. The service must hand out the SAME conformant bytes the emitter wrote -- a concept that lost its type in transit is unreadable as OKF.");
    } else fails++;
}

// ---- 4. PATH TRAVERSAL IS REFUSED ---------------------------------------------------------------------------------
{
    const eviltargets = ["/okf/../../../etc/passwd", "/okf/..%2f..%2fmain.js", "/okf/claims/../../../package.json"];
    let leaked = 0;
    for (const u of eviltargets) { const r = await get(u); if (r.code === 200 && (/root:|ENGINE_VERSION|"name"/.test(r.body))) leaked++; }
    ok("!! path traversal out of the bundle is refused", leaked === 0,
       "tried " + eviltargets.length + " traversal payloads (../etc/passwd, encoded ../, nested ../); " + leaked + " leaked a file outside the bundle. A read-only knowledge service that can be walked up into the source tree is a file-disclosure hole, not a knowledge service.");
}

// ---- 5. A MISSING CONCEPT IS A PLAIN 404, NOT A CRASH -------------------------------------------------------------
{
    const r = await get("/okf/claims/no-such-claim-xyz.md");
    ok("!! a missing concept is a tolerated 404", r.code === 404,
       "status " + r.code + ". OKF consumers MUST tolerate broken links (targets may be not-yet-written knowledge), so a missing concept is a clean 404 -- never a 500, never a hang.");
}

// ---- 6. THE MANIFEST LISTS THE WHOLE BUNDLE -----------------------------------------------------------------------
{
    const r = await get("/okf/manifest.json");
    let m = null; try { m = JSON.parse(r.body); } catch {}
    ok("!! /okf/manifest.json enumerates the bundle for programmatic consumers", r.code === 200 && m && m.okf_version === "0.1" && Array.isArray(m.files) && m.files.length > 100 && m.files.includes("/index.md"),
       m ? "manifest lists " + m.files.length + " files, root " + m.root + ", version " + m.okf_version + " -- a machine can fetch this one route and then pull exactly the concepts it wants." : "manifest did not parse as JSON (" + r.code + ")");
}

console.log(fails ? "\nokfService-selfcheck: " + fails + " FAILED" : "\nokfService-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
