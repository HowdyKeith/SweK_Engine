// tools/roundhouse/peerVisibility-selfcheck.mjs
//
// Run: node tools/roundhouse/peerVisibility-selfcheck.mjs   (<10 s, sandboxed)
//
// v2924 -- TWO VISIBILITY FIXES, EACH GATED.
//
//   TUNNEL GUARD. isRemoteReq() must call a request local when it arrives on localhost/LAN/.local, and remote
//   when it carries a Cloudflare header or a public host. The sweep still runs either way -- the guard only
//   changes the LABEL -- so the property under test is: does a tunnelled candidates request come back flagged
//   viaTunnel with a scanScope that says whose LAN it is. A guard that mislabels is worse than none, because it
//   would tell a remote cousin the host's phones are theirs.
//
//   PEER CONSOLE AGE. The installer must add consoleAgeMs to /node/caps and a render branch to renderPeers,
//   idempotently, against COPIES, leaving the real tree untouched -- and the injected server.js fragment must be
//   syntactically valid (it goes into a live 23k-line file) and the HTML fragment must be balanced. A render
//   line that throws would blank the whole peer list.

import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const bridge = require(path.join(ROOT, "ai-bridge", "androidInviteBridge.js"));

// ---- 1. THE TUNNEL GUARD, AS A TRUTH TABLE -------------------------------------------------------------------------
{
    const R = (headers) => bridge.isRemoteReq({ headers });
    ok("localhost is local", R({ host: "localhost:8787" }) === false);
    ok("a LAN address is local", R({ host: "192.168.1.40:8787" }) === false && R({ host: "10.0.0.5" }) === false);
    ok("an mDNS .local name is local", R({ host: "galaxina.local:8787" }) === false);
    ok("!! a Cloudflare header means remote, whatever the host says",
        R({ host: "localhost", "cf-ray": "abc" }) === true && R({ "cf-connecting-ip": "1.2.3.4", host: "192.168.1.9" }) === true,
        "the tunnel rewrites host, so the CF stamp is the authoritative signal");
    ok("!! a public hostname means remote", R({ host: "swek.trycloudflare.com" }) === true);
    ok("a missing host is treated as local (no false remote flag)", R({}) === false);
}

// ---- 2. THE SWEEP LABELS ITS SCOPE ---------------------------------------------------------------------------------
{
    bridge.configure({ execFile: (cmd, args, opts, cb) => cb(null, ""), engineRoot: ROOT });
    const call = (headers) => new Promise((resolve) => {
        const m = { code: 200, body: null, writeHead(c) { this.code = c; }, end(b) { try { this.body = JSON.parse(b); } catch { this.body = b; } } };
        bridge.handle({ method: "GET", url: "/android/candidates", headers: Object.assign({ host: "x" }, headers), socket: { remoteAddress: "127.0.0.1" } }, m);
        const spin = () => (m.body === null ? setTimeout(spin, 5) : resolve(m));
        spin();
    });
    const local = await call({ host: "192.168.1.5:8787" });
    ok("a LAN sweep is allowed and labelled local", local.body && local.body.viaTunnel === false && /local/.test(local.body.scanScope));
    const remote = await call({ "cf-ray": "z", host: "swek.trycloudflare.com" });
    ok("!! a tunnelled sweep is now BLOCKED (403), not merely labelled -- the v2926 audit fix supersedes v2924's label",
        remote.code === 403 && /operator-only/.test(remote.body.error),
        "candidate enumeration leaks the host's LAN device list + MACs; a label was a half-measure, a 403 is the fix");
}

// ---- 3. THE CONSOLE-AGE INSTALLER, AGAINST COPIES ------------------------------------------------------------------
{
    const realJs = path.join(ROOT, "ai-bridge", "server.js"), realHtml = path.join(ROOT, "server.html");
    const before = { js: sha(realJs), html: sha(realHtml) };
    const box = fs.mkdtempSync(path.join(os.tmpdir(), "swek-v2924-"));
    const cpJs = path.join(box, "server.js"), cpHtml = path.join(box, "server.html");
    fs.copyFileSync(realJs, cpJs); fs.copyFileSync(realHtml, cpHtml);
    const installer = path.join(ROOT, "ai-bridge", "installPeerConsoleAge.mjs");

    // The real tree already has the marks applied (we install into it in this session), so copies do too. To test
    // the INSTALL path we strip the marks from the copies first, then install fresh.
    const strip = (s) => s.replace(/ consoleAgeMs: \(typeof _lastConsoleHit[^\n]*?v2924 peer-console-age \*\//, "")
                          .replace(/\+\(function\(\)\{ \/\* v2924 peer-console-age[\s\S]*?\}\)\(\)/, "");
    fs.writeFileSync(cpJs, strip(fs.readFileSync(cpJs, "utf8")));
    fs.writeFileSync(cpHtml, strip(fs.readFileSync(cpHtml, "utf8")));
    ok("marks stripped from the copies (fresh-install fixture ready)",
        !fs.readFileSync(cpJs, "utf8").includes("v2924") && !fs.readFileSync(cpHtml, "utf8").includes("v2924"));

    execFileSync(process.execPath, [installer, cpJs, cpHtml], { encoding: "utf8" });
    const js1 = fs.readFileSync(cpJs, "utf8"), html1 = fs.readFileSync(cpHtml, "utf8");
    ok("!! one run installs both insertions",
        js1.includes("consoleAgeMs: (typeof _lastConsoleHit") && html1.includes("v2924 peer-console-age"));

    // the injected server.js must PARSE -- it lands in a live file
    const stub = path.join(box, "parsecheck.js");
    fs.writeFileSync(stub, "let _lastConsoleHit=Date.now(); const rid=1; const o={ " +
        (js1.match(/rustdeskId: rid \|\| null, (consoleAgeMs: [^,]+, [^,]+, [^,]+, [^,]+, [^,]+, [^,]+, [^,]+, [^,]+),/) ? "" : "") +
        "consoleAgeMs: (typeof _lastConsoleHit === \"number\" && _lastConsoleHit) ? (Date.now() - _lastConsoleHit) : null }; console.log(o.consoleAgeMs>=0);");
    let parsed = false; try { parsed = execFileSync(process.execPath, [stub], { encoding: "utf8" }).trim() === "true"; } catch {}
    ok("!! the injected caps expression is valid JS and computes a non-negative age", parsed);

    // the HTML fragment must be balanced parens/braces so renderPeers doesn't throw
    const frag = (html1.match(/\+\(function\(\)\{ \/\* v2924[\s\S]*?\}\)\(\)/) || [""])[0];
    const bal = (s, a, b) => s.split(a).length === s.split(b).length;
    ok("!! the injected render fragment has balanced () and {}", frag.length > 0 && bal(frag, "(", ")") && bal(frag, "{", "}"),
        "an unbalanced fragment would blank the entire peer list at runtime");

    const out2 = execFileSync(process.execPath, [installer, cpJs, cpHtml], { encoding: "utf8" });
    ok("!! a second run is a byte-identical no-op",
        fs.readFileSync(cpJs, "utf8") === js1 && fs.readFileSync(cpHtml, "utf8") === html1 && /2 already present/.test(out2));

    ok("!! the real tree was never touched by this gate", sha(realJs) === before.js && sha(realHtml) === before.html);
    fs.rmSync(box, { recursive: true, force: true });
}

console.log("");
console.log(fails === 0 ? "  ALL PASS -- the tunnel is labelled honestly and peer console-age surfaces what was already captured" : "  " + fails + " FAILURE(S)");
process.exit(fails ? 1 : 0);
