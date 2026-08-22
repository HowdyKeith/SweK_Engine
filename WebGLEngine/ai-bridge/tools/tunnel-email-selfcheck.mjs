// WebGLEngine/ai-bridge/tools/tunnel-email-selfcheck.mjs — v2248 (v2249 Outlook default)
//
// planEmail decides whether/where to mail a fresh tunnel URL. The send itself is RIG-ONLY (Outlook via
// cscript, or SMTP), but this logic keeps it from double-mailing, mailing when nothing can send, or
// mailing to the wrong address -- and, per Geek's ask, treats OUTLOOK as ready without SMTP creds.
//
//   run: node ai-bridge/tools/tunnel-email-selfcheck.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { planEmail } = require("../tunnelEmail.js");

const OUTLOOK = { mode: "outlook", smtp: {} };
const SMTP_OK = { mode: "smtp", smtp: { user: "geek@example.com", pass: "app-pw", from: "geek@example.com" } };
const SMTP_NO = { mode: "smtp", smtp: { user: "x" } };
const DRAFT = { mode: "draft", smtp: {} };
const URL = "https://abc-def.trycloudflare.com";

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };

console.log("tunnel-email-selfcheck: when NOT to send");
ok("off -> no send", planEmail(URL, { on: false, to: "me@x.com" }, OUTLOOK).send === false);
ok("no url -> no send", planEmail("", { on: true, to: "me@x.com" }, OUTLOOK).send === false);
ok("duplicate url -> no send", planEmail(URL, { on: true, to: "me@x.com", lastUrl: URL }, OUTLOOK).reason === "duplicate");
ok("draft mode -> mailer-not-configured", planEmail(URL, { on: true, to: "me@x.com" }, DRAFT).reason === "mailer-not-configured");
ok("smtp without app-password -> mailer-not-configured", planEmail(URL, { on: true, to: "me@x.com" }, SMTP_NO).reason === "mailer-not-configured");

console.log("tunnel-email-selfcheck: OUTLOOK is ready without SMTP creds (the whole point)");
{
    const p = planEmail(URL, { on: true, to: "geek@outlook.com" }, OUTLOOK);
    ok("outlook + a recipient -> send", p.send === true && p.reason === "ok");
    ok("reports via = outlook", p.mode === "outlook");
    ok("sends to the configured address", p.to === "geek@outlook.com");
    ok("msg.to is an array", Array.isArray(p.msg.to) && p.msg.to[0] === "geek@outlook.com");
    ok("subject + body carry the url", p.msg.subject.includes(URL) && p.msg.body.includes(URL));
}
ok("outlook with NO address set -> no-recipient", planEmail(URL, { on: true, to: "" }, OUTLOOK).reason === "no-recipient");
ok("outlook falls back to smtp.from if present", planEmail(URL, { on: true }, { mode: "outlook", smtp: { from: "f@x.com" } }).to === "f@x.com");

console.log("tunnel-email-selfcheck: SMTP still works + precedence + force");
ok("smtp with creds -> send", planEmail(URL, { on: true }, SMTP_OK).send === true);
ok("smtp recipient defaults to self (from/user)", planEmail(URL, { on: true }, SMTP_OK).to === "geek@example.com");
ok("explicit cfg.to overrides", planEmail(URL, { on: true, to: "me@home.net" }, SMTP_OK).to === "me@home.net");
ok("force sends even on a duplicate", planEmail(URL, { on: true, to: "me@x.com", lastUrl: URL }, OUTLOOK, true).send === true);

console.log(`\ntunnel-email-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
