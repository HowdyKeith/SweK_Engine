sha256.wasm — SHA-256 (FIPS 180-4) compiled from sha256.ts via AssemblyScript 0.28.19.
The SAME .wasm runs byte-identically on every box (Windows/Intel Mac/peers) via the bridge's
Node WebAssembly — no Docker, no per-OS binary. Verified byte-identical to Node crypto +
the existing VBA/JS/Python SHA-256 demos. ABI: write input bytes to memory offset 0, call
hash(len), read 32-byte digest at digestPtr(). Rebuild: npx asc sha256.ts -o sha256.wasm
--optimize --runtime stub --initialMemory 2

graphlayout.wasm — force-directed graph layout repulsion (O(n^2)) + integrate,
compiled from graphlayout.ts via AssemblyScript 0.28.19. ABI: write pos to
posPtr() (n*3 f32), vel to velPtr() (n*3 f32), call repulse(n,kRep,grav,damp,
cooling) then integrate(n), read pos back. Mirrors graph_viewer's stepLayout
inner loop exactly (verified identical to 7.6e-6, f32-vs-f64 rounding only).
NOTE: measured only ~1.07-1.14x vs V8 JS on this loop — the O(n^2) *algorithm*
is the ceiling, not the language; NOT wired into graph_viewer.html (a Barnes-Hut
O(n log n) rewrite or a GPU path is the real fix if the node ceiling matters).
Rebuild: npx asc graphlayout.ts -o graphlayout.wasm --optimize --runtime stub --initialMemory 192
