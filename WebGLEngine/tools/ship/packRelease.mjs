// WebGLEngine/tools/ship/packRelease.mjs -- v3947
//
// Run: node tools/ship/packRelease.mjs --out <dir> [--prefix SweK_Engine]
//
// THE RELEASE ZIP, FROM A COMMAND LINE, USING THE PACKER THE BUTTON ALREADY USES.
//
// *** THIS FILE EXISTS SO THAT CI DOES NOT GET ITS OWN ANSWER TO "WHAT IS IN A RELEASE". *** The obvious way to
// build a zip in a workflow is `zip -r`, with an exclude list written in YAML. That list would be a SECOND
// declaration of the thing packagerBridge.js already declares -- this tree's most repeated defect -- and of all
// the places to have one, this is the worst: THE EXCLUDE LIST IS WHAT KEEPS THE SECRETS OUT. SKIP_FILES holds
// github.json, gmail.json, twitch-eventsub.json and fifteen more. A YAML copy that drifted by one line would
// publish a credential to a public release page, and it would do it quietly, because a zip that is slightly too
// big looks exactly like a zip.
//
// So there is no packing logic here at all. It resolves makeInstallable() and calls it. Everything this prints
// comes back from that call -- including the version, which is read from main.js's marker by the packer rather
// than passed in, so a caller cannot ask for a zip labelled something the tree does not say.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const packager = require_(path.join(ENG, "ai-bridge", "packagerBridge.js"));

const arg = (name) => {
    const i = process.argv.indexOf("--" + name);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "";
};

const out = arg("out");
const prefix = arg("prefix") || "SweK_Engine";

console.log("[packRelease] the release zip, built by the same packer the GitHub panel's button calls");

// The version is READ, not accepted: printing it before the build means a mislabeled tag is visible in the log
// above the artifact rather than discovered by whoever downloads it.
const ver = packager.engineVersion();
if (!ver) {
    console.error("[packRelease] no ENGINE_VERSION marker in WebGLEngine/main.js -- refusing to name a zip after a version the tree does not state");
    process.exit(2);
}
console.log("[packRelease] tree says " + ver + "; project root " + packager.PROJECT_ROOT);

const r = await packager.makeInstallable(out ? { outDir: out, prefix } : { prefix });
if (!r || !r.ok) {
    console.error("[packRelease] FAILED: " + ((r && r.error) || "no result"));
    process.exit(1);
}
console.log("[packRelease] " + r.path);
console.log("[packRelease] " + r.mb + " MB (" + r.bytes + " bytes), " + r.copied + " files, root " + r.root);

// A machine-readable line for the workflow to read, so the YAML does not have to parse prose -- and so the
// path travels as a FACT from the packer rather than being reconstructed from a naming rule the YAML guessed.
if (process.env.GITHUB_OUTPUT) {
    const fs = require_("node:fs");
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
        "zip=" + r.path + "\nversion=" + r.version + "\nbytes=" + r.bytes + "\nroot=" + r.root + "\n");
}
process.exit(0);
