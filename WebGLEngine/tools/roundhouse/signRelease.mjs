// tools/roundhouse/signRelease.mjs
//
// v2959 -- THE HUB SIDE: SIGN A BUILD SO A PINNED-KEY PEER CAN TRUST IT.
//
//   node tools/roundhouse/signRelease.mjs keygen              -- make a keypair (once, ever)
//   node tools/roundhouse/signRelease.mjs sign <build.zip>    -- emit a signed manifest for that zip
//   node tools/roundhouse/signRelease.mjs pubkey              -- print the public key to hand out
//
// THE ONE RULE THAT MATTERS MOST HERE. The PRIVATE key must never leave this machine, and above all must never
// end up inside a build. A signing key shipped in the zip is not a signing key -- everyone who downloads it can
// sign anything, and every pinned public key in the fleet becomes worthless at once. So:
//
//   - keygen writes the private key OUTSIDE the engine tree by default (~/.swek/release-private.pem),
//   - it refuses to write one inside the tree unless explicitly forced, and says why,
//   - it chmods it 0600 where the platform supports it,
//   - and buildKeyLeak-selfcheck.mjs fails the build if a private key is found anywhere under the tree.
//
// The manifest signs {version, sha256, size} -- not the bytes directly. The checksum is what binds the signature
// to those exact bytes, which is why substituting a payload under a replayed signature fails (v2958).

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = path.resolve(here, "..", "..");
export const DEFAULT_KEY_DIR = path.join(os.homedir(), ".swek");
export const PRIVATE_PATH = path.join(DEFAULT_KEY_DIR, "release-private.pem");
export const PUBLIC_PATH = path.join(DEFAULT_KEY_DIR, "release-public.pem");

/** True if `p` is inside the engine tree -- i.e. would be swept into a build zip. */
export function insideTree(p) {
    const rel = path.relative(ENGINE_ROOT, path.resolve(p));
    return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function keygen({ dir = DEFAULT_KEY_DIR, force = false } = {}) {
    const priv = path.join(dir, "release-private.pem");
    const pub = path.join(dir, "release-public.pem");
    if (insideTree(priv) && !force) {
        throw new Error(
            "refusing to write a private key inside the engine tree (" + priv + ").\n" +
            "  A signing key inside a build ships to everyone who downloads it, and every pinned public key in\n" +
            "  the fleet becomes worthless the moment it does. Choose a directory outside the tree, or pass\n" +
            "  force:true if you genuinely know what you are doing.");
    }
    if (fs.existsSync(priv) && !force) throw new Error("a key already exists at " + priv + " -- refusing to overwrite it (that would orphan every peer pinned to the old one)");
    fs.mkdirSync(dir, { recursive: true });
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    fs.writeFileSync(priv, privateKey.export({ type: "pkcs8", format: "pem" }));
    fs.writeFileSync(pub, publicKey.export({ type: "spki", format: "pem" }));
    try { fs.chmodSync(priv, 0o600); } catch {}
    return { priv, pub, publicKeyPem: fs.readFileSync(pub, "utf8") };
}

/** Sign a build. Reads the zip, hashes it, signs the manifest. Returns the manifest a peer will verify. */
export function signBuild(zipPath, { privatePath = PRIVATE_PATH, version = null } = {}) {
    if (!fs.existsSync(privatePath)) throw new Error("no private key at " + privatePath + " -- run `signRelease.mjs keygen` first");
    const bytes = fs.readFileSync(zipPath);
    const v = version || (path.basename(zipPath).match(/_v(\d+)\.zip$/i) || [])[1];
    if (!v) throw new Error("cannot infer a version from " + path.basename(zipPath) + " -- pass one explicitly");
    const manifest = { version: "v" + String(v).replace(/^v/, ""), sha256: crypto.createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
    const key = crypto.createPrivateKey(fs.readFileSync(privatePath, "utf8"));
    const signature = crypto.sign(null, Buffer.from(JSON.stringify(manifest)), key).toString("base64");
    return { ...manifest, signature, file: path.basename(zipPath), signedAt: new Date().toISOString() };
}

// ---- CLI --------------------------------------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const [cmd, a] = process.argv.slice(2);
    try {
        if (cmd === "keygen") {
            const r = keygen({});
            console.log("keypair written");
            console.log("  private: " + r.priv + "   (NEVER copy this anywhere, never into a build)");
            console.log("  public : " + r.pub + "    (this is what you put on a verified-tier machine)");
            console.log("\n" + r.publicKeyPem);
        } else if (cmd === "sign") {
            if (!a) { console.error("usage: signRelease.mjs sign <build.zip>"); process.exit(2); }
            const m = signBuild(a, {});
            const out = path.join(ENGINE_ROOT, "tools", "roundhouse", "release-manifest.json");
            fs.writeFileSync(out, JSON.stringify(m, null, 2) + "\n");
            console.log(`signed ${m.file} as ${m.version}`);
            console.log(`  sha256 ${m.sha256.slice(0, 32)}...  ${m.size} bytes`);
            console.log(`  manifest -> ${out}   (served at /release)`);
        } else if (cmd === "pubkey") {
            if (!fs.existsSync(PUBLIC_PATH)) { console.error("no public key yet -- run keygen"); process.exit(2); }
            process.stdout.write(fs.readFileSync(PUBLIC_PATH, "utf8"));
        } else {
            console.error("usage: signRelease.mjs <keygen|sign <zip>|pubkey>");
            process.exit(2);
        }
    } catch (e) { console.error(String((e && e.message) || e)); process.exit(1); }
}
