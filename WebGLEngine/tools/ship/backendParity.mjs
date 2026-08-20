// tools/ship/backendParity.mjs -- make the physics facade prove the parity it claims.
//
// The bug this exists to prevent, found on Keith's rig in v2448: box3d had bodyCount(), Jolt did not, and
// blobulator-gpu.html called it every single frame. Switching that page to Jolt threw a TypeError out of the frame
// function BEFORE its requestAnimationFrame at the bottom -- so the loop was never re-armed and the page silently
// froze. Switching back to box3d "fixed" it, which made it look like a Jolt problem rather than a missing method.
// Nothing caught it: one throw and the animation is simply gone, invisible unless the console happens to be open.
//
// The facade's whole promise is that the two backends are interchangeable. This checks that promise the only way worth
// checking it: read every method the PAGES actually call on a world, and demand that BOTH backends have it.
"use strict";
import fs from "node:fs";
import path from "node:path";

function methodsOf(src, className) {
    const i = src.indexOf("class " + className);
    if (i < 0) return new Set();
    let depth = 0, end = src.length;
    for (let j = src.indexOf("{", i); j < src.length; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
    }
    const body = src.slice(i, end);
    return new Set([...body.matchAll(/^\s{4}([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm)].map(m => m[1])
        .filter(n => !["constructor", "if", "for", "while", "return", "switch", "catch"].includes(n)));
}
const calledOnWorld = (src) => new Set([...src.matchAll(/\bworld\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)].map(m => m[1]));

function check(root) {
    const jolt = fs.readFileSync(path.join(root, "physics/jolt/joltLoader.js"), "utf8");
    const b3 = fs.readFileSync(path.join(root, "physics/box3d/box3dLoader.js"), "utf8");
    const joltM = methodsOf(jolt, "JoltWorld");
    // box3d's world handle is assembled inside createWorld rather than declared as a class, so match names anywhere
    const b3Has = (m) => new RegExp("(^|[^a-zA-Z.])" + m + "\\s*\\(", "m").test(b3);
    const pages = fs.readdirSync(root).filter(f => f.endsWith(".html"));
    const gaps = [];
    for (const p of pages) {
        const src = fs.readFileSync(path.join(root, p), "utf8");
        if (!/joltLoader|box3dLoader|selectBackend/.test(src)) continue;   // only pages that actually use physics
        for (const m of calledOnWorld(src)) {
            const inJolt = joltM.has(m), inB3 = b3Has(m);
            if (!inJolt || !inB3) gaps.push({ page: p, method: m, jolt: inJolt, box3d: inB3 });
        }
    }
    return { gaps, joltMethods: [...joltM].sort(), pages: pages.length };
}
export { check, methodsOf, calledOnWorld };
