import fs from "node:fs";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { BUNDLE, apply, rootWithBuilds } from "./threePatch.mjs";
const S = process.argv[2], b = fs.readFileSync(BUNDLE, "utf8");
const builds = { p10: apply(fs.readFileSync(`${S}/p10.diff`, "utf8"), b).text, p11: apply(fs.readFileSync(`${S}/p11.diff`, "utf8"), b).text };
const { root, dispose } = rootWithBuilds(builds);
try { for (const k of ["r10", "r11"]) { const code = fs.readFileSync(`${S}/${k}.js`, "utf8");
  for (const dir of ["/vendor/three-webgpu", "/three-patched/" + (k === "r10" ? "p10" : "p11")]) {
    const r = await runInEngineOrigin({ engineRoot: root, timeoutMs: 300000, args: {}, script: `async () => { const THREE = await import("${dir}/three.webgpu.js"), T = await import("${dir}/three.tsl.js"); let res; const report = (x) => { res = x; }; ${code}; return res; }` });
    console.log(k, dir, JSON.stringify(r.ok ? r.result : r.reason || r)); } } } finally { dispose(); }
