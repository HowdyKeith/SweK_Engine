// FILE: gpu/OBJParser.js
// Round 44 — minimal OBJ text parser. Handles the subset Ollama and
// most CAD exports produce:
//   v x y z       — position
//   vn x y z      — normal (optional; computed from faces if absent)
//   vt u v        — texcoord (skipped — engine doesn't use UVs on these)
//   f v/vt/vn ... — face (3+ verts; quads triangulated; n-gons via fan)
//
// Output matches GPUAssetLoader._createMesh expectations:
//   vertices: ArrayBuffer of Float32 — interleaved [px,py,pz, nx,ny,nz, r,g,b]
//   indices:  ArrayBuffer of Uint32  — triangle indices into vertices
//
// Color defaults to white (1,1,1) — overridable via `tint` opt for
// per-kind tinting (e.g. all sky kaiju cyan-tinted).

export class OBJParser {

    static parse(text, opts = {}) {
        const tint = opts.tint ?? [1, 1, 1];

        const positions = [];   // [x, y, z, x, y, z, ...]
        const normals   = [];   // same shape

        // Faces use a key "posIdx/normalIdx" → unique vertex index in `verts`
        const vertCache = new Map();
        const verts = [];        // each entry: [px,py,pz,nx,ny,nz,r,g,b]
        const indices = [];

        // Strip line endings + iterate
        const lines = text.split(/\r?\n/);
        let lineNo = 0;
        for (const rawLine of lines) {
            lineNo++;
            const line = rawLine.trim();
            if (!line || line[0] === "#") continue;
            // Tokenize, collapsing repeated whitespace
            const t = line.split(/\s+/);
            const tag = t[0];

            if (tag === "v") {
                positions.push(parseFloat(t[1]), parseFloat(t[2]), parseFloat(t[3]));
            } else if (tag === "vn") {
                normals.push(parseFloat(t[1]), parseFloat(t[2]), parseFloat(t[3]));
            } else if (tag === "f") {
                // Collect face vertices first (handle 3 / 4 / N-gon by fan)
                const faceVerts = [];
                for (let i = 1; i < t.length; i++) {
                    const spec = t[i];
                    if (!spec) continue;
                    // Specs: "v", "v/vt", "v/vt/vn", "v//vn"
                    const parts = spec.split("/");
                    let posIdx = parseInt(parts[0], 10);
                    let normIdx = parts[2] ? parseInt(parts[2], 10) : 0;
                    // OBJ uses 1-based indices; negatives are relative-from-end
                    if (posIdx < 0) posIdx = (positions.length / 3) + posIdx + 1;
                    if (normIdx < 0) normIdx = (normals.length / 3) + normIdx + 1;
                    faceVerts.push({ posIdx, normIdx });
                }
                if (faceVerts.length < 3) continue;
                // Triangulate via fan: (0, i, i+1) for i in 1..n-2
                for (let i = 1; i < faceVerts.length - 1; i++) {
                    const tri = [faceVerts[0], faceVerts[i], faceVerts[i + 1]];
                    // If no normals supplied, compute one for this triangle
                    let n = null;
                    if (tri[0].normIdx === 0) {
                        const p0 = positions.slice((tri[0].posIdx - 1) * 3, (tri[0].posIdx - 1) * 3 + 3);
                        const p1 = positions.slice((tri[1].posIdx - 1) * 3, (tri[1].posIdx - 1) * 3 + 3);
                        const p2 = positions.slice((tri[2].posIdx - 1) * 3, (tri[2].posIdx - 1) * 3 + 3);
                        const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
                        const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
                        const nx = ay * bz - az * by;
                        const ny = az * bx - ax * bz;
                        const nz = ax * by - ay * bx;
                        const len = Math.hypot(nx, ny, nz) || 1;
                        n = [nx / len, ny / len, nz / len];
                    }
                    for (const v of tri) {
                        const key = `${v.posIdx}|${v.normIdx}|${n ? `${n[0].toFixed(3)},${n[1].toFixed(3)},${n[2].toFixed(3)}` : ""}`;
                        let idx = vertCache.get(key);
                        if (idx === undefined) {
                            const pStart = (v.posIdx - 1) * 3;
                            const px = positions[pStart], py = positions[pStart + 1], pz = positions[pStart + 2];
                            let nx, ny, nz;
                            if (v.normIdx > 0) {
                                const nStart = (v.normIdx - 1) * 3;
                                nx = normals[nStart]; ny = normals[nStart + 1]; nz = normals[nStart + 2];
                            } else {
                                [nx, ny, nz] = n;
                            }
                            verts.push(px, py, pz, nx, ny, nz, tint[0], tint[1], tint[2]);
                            idx = (verts.length / 9) - 1;
                            vertCache.set(key, idx);
                        }
                        indices.push(idx);
                    }
                }
            }
            // ignore vt, g, o, s, mtllib, usemtl, etc.
        }

        if (verts.length === 0 || indices.length === 0) {
            throw new Error("OBJ has no geometry");
        }

        const vertexBuffer = new Float32Array(verts).buffer;
        const indexBuffer = new Uint32Array(indices).buffer;

        const meta = {
            vertexCount: verts.length / 9,
            indexCount: indices.length,
            hasNormals: true,
            hasColors: true,
            stride: 9 * 4,    // 9 floats × 4 bytes
        };

        return { vertexBuffer, indexBuffer, meta };
    }
}
