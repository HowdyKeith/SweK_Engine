// Run: node net/bridgeBase-selfcheck.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { bridgeBase } from "./bridgeBase.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const lan = bridgeBase({ protocol: "http:", hostname: "192.168.10.53", host: "192.168.10.53:8787" });
const cf = bridgeBase({ protocol: "https:", hostname: "abc.trycloudflare.com", host: "abc.trycloudflare.com", origin: "https://abc.trycloudflare.com" });
ok("LAN http page keeps http://host:8787 and ws://", lan.http === "http://192.168.10.53:8787" && lan.ws === "ws://192.168.10.53:8787", JSON.stringify(lan));
ok("!! a trycloudflare https page is same-origin over https/wss, with no :8787", cf.http === "https://abc.trycloudflare.com" && cf.ws === "wss://abc.trycloudflare.com", JSON.stringify(cf));
ok("...an https page on a custom port keeps the port", bridgeBase({ protocol: "https:", hostname: "h", host: "h:8443", origin: "https://h:8443" }).ws === "wss://h:8443");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (f) => readFileSync(path.join(root, f), "utf8");
ok("!! the two ESM callers go through bridgeBase() and no longer hardcode http://host:8787",
    ["gpu/gpuAssetLoader.js", "ai/VariantExpander.js"].every((f) => /bridgeBase\(/.test(src(f)) && !/`http:\/\/\$\{[^}]*\}:8787`/.test(src(f))));
ok("!! brains/bridgeClient.js (a classic script, so an inline copy) is same-origin over wss on an https page",
    /location\.protocol === "https:"/.test(src("brains/bridgeClient.js")) && /"wss:\/\/" \+ location\.host/.test(src("brains/bridgeClient.js")));
console.log("bridgeBase-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
