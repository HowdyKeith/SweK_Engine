# smaa -- provenance

Recorded 2026-11-22, at the ship of the round that vendored it (v4933).

| field | value |
|---|---|
| upstream | https://github.com/playcanvas/engine |
| file | `src/extras/effects/smaa/smaa-lookup.js` |
| release | `playcanvas@2.24.2` on npm (the file read is `build/playcanvas/src/extras/effects/smaa/smaa-lookup.js` in that package) |
| licence | MIT -- `LICENSE` beside this file, "Copyright (c) 2011-2026 PlayCanvas Ltd." |
| algorithm | SMAA (Jimenez, Echevarria, Sousa, Gutierrez, 2012); its reference code, https://github.com/iryoku/smaa, is MIT too |

What was taken: the two lookup tables only (the area table, 160 x 80 RG8, and the search table, 64 x 16 R8), decoded once from
PlayCanvas's deflate-raw base64 into `smaaLookup.mjs` so a page needs no DecompressionStream. The shaders that read them
(`render/smaaPass.js`, `render/smaaPassGPU.mjs`) were written here from the paper and the reference code's structure; no
PlayCanvas shader code is vendored. `tools/ship/smaaPass-selfcheck.mjs` checks the tables' sizes and their sha256s.
