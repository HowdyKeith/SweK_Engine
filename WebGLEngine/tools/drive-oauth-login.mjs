#!/usr/bin/env node
// tools/drive-oauth-login.mjs - one-time OAuth consent for Drive auto-pull (installed-app / loopback / PKCE).
//
//   node tools/drive-oauth-login.mjs [clientId] [clientSecret]
//
// Reads clientId + clientSecret from ai-bridge/drive.json (oauth section) or args, opens the Google consent screen in a
// browser, catches the redirect on a loopback port, and writes the resulting refresh_token back into drive.json so the
// bridge can mint access tokens. Run this once on the rig (needs a browser + network).

import { createRequire } from "module";
import fs from "fs";
import path from "path";
import url from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const oa = require(path.join(__dirname, "..", "ai-bridge", "driveOauth.js"));
const cfgPath = path.join(__dirname, "..", "ai-bridge", "drive.json");

let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch (e) {}
const oauth = cfg.oauth || {};
const clientId = process.argv[2] || oauth.clientId;
const clientSecret = process.argv[3] || oauth.clientSecret;
if (!clientId || !clientSecret) {
    console.error('Need clientId + clientSecret. Put them in ai-bridge/drive.json under "oauth", or pass them as args:');
    console.error("  node tools/drive-oauth-login.mjs <clientId> <clientSecret>");
    process.exit(2);
}

console.log("Starting Google consent (a browser window should open; if not, copy the printed URL)...");
try {
    const tokens = await oa.runConsent({ clientId, clientSecret, scope: oa.SCOPE }, { timeoutMs: 180000 });
    if (!tokens.refresh_token) {
        console.error("\nNo refresh_token returned. Remove this app at https://myaccount.google.com/permissions and retry");
        console.error("(Google only issues a refresh token on first consent; prompt=consent is set to force it).");
        process.exit(1);
    }
    cfg.oauth = Object.assign({}, oauth, { clientId, clientSecret, refreshToken: tokens.refresh_token });
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    console.log("\nAuthorized. refresh_token saved to ai-bridge/drive.json (oauth.refreshToken).");
    console.log('Now set "folderId" and "enabled": true in drive.json, and the bridge will pull updates from your Drive.');
} catch (e) {
    console.error("\nConsent failed: " + (e && e.message));
    process.exit(1);
}
