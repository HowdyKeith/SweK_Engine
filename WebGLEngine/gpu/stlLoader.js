// gpu/stlLoader.js — v1449
// A dependency-free STL parser (binary + ASCII) so 3D-print .stl files — like a
// tabletop game's miniature pack — can load as spawnable engine kinds. STL has no
// colour or index data, so we generate flat-shaded geometry (face normals) and a
// uniform vertex colour, then normalise the (arbitrary mm-scale) mesh to fit the
// game grid. Feeds the same assetLoader._createMesh path the voxel kinds use.

export function parseSTL(buf) {
    const dv = new DataView(buf);
    if (buf.byteLength >= 84) {
        const tri = dv.getUint32(80, true);
        if (84 + tri * 50 === buf.byteLength) return parseBinary(dv, tri);   // exact size ⇒ binary
    }
    let txt = "";
    try { txt = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 1024))); } catch {}
    if (/^\s*solid/i.test(txt) && buf.byteLength < 1e8) {
        const full = new TextDecoder().decode(buf);
        if (/facet/i.test(full)) return parseAscii(full);
    }
    if (buf.byteLength >= 84) { const tri = dv.getUint32(80, true); if (tri > 0 && 84 + tri * 50 <= buf.byteLength) return parseBinary(dv, tri); }
    throw new Error("unrecognized STL");
}

function parseBinary(dv, tri) {
    const positions = new Float32Array(tri * 9), normals = new Float32Array(tri * 9), indices = new Uint32Array(tri * 3);
    let o = 84, pi = 0;
    for (let t = 0; t < tri; t++) {
        const nx = dv.getFloat32(o, true), ny = dv.getFloat32(o + 4, true), nz = dv.getFloat32(o + 8, true); o += 12;
        for (let v = 0; v < 3; v++) {
            positions[pi] = dv.getFloat32(o, true); positions[pi + 1] = dv.getFloat32(o + 4, true); positions[pi + 2] = dv.getFloat32(o + 8, true); o += 12;
            normals[pi] = nx; normals[pi + 1] = ny; normals[pi + 2] = nz;
            indices[t * 3 + v] = t * 3 + v; pi += 3;
        }
        o += 2;   // attribute byte count
    }
    return { positions, normals, indices, vertexCount: tri * 3, indexCount: tri * 3 };
}

function parseAscii(txt) {
    const verts = [], norms = [];
    const facets = txt.split(/facet\s+normal/i).slice(1);
    for (const f of facets) {
        const nm = f.match(/^\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/);
        const nx = nm ? +nm[1] : 0, ny = nm ? +nm[2] : 0, nz = nm ? +nm[3] : 0;
        const vm = [...f.matchAll(/vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/gi)].slice(0, 3);
        if (vm.length < 3) continue;
        for (const m of vm) { verts.push(+m[1], +m[2], +m[3]); norms.push(nx, ny, nz); }
    }
    const tri = verts.length / 9 | 0;
    const positions = new Float32Array(verts), normals = new Float32Array(norms), indices = new Uint32Array(tri * 3);
    for (let i = 0; i < tri * 3; i++) indices[i] = i;
    return { positions, normals, indices, vertexCount: tri * 3, indexCount: tri * 3 };
}

// recenter + scale to fit `targetSize`, optionally rest on the floor (min y = 0)
export function normalizeGeometry(g, { targetSize = 3, anchor = "floor" } = {}) {
    const p = g.positions;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.length; i += 3) { if (p[i] < minX) minX = p[i]; if (p[i] > maxX) maxX = p[i]; if (p[i + 1] < minY) minY = p[i + 1]; if (p[i + 1] > maxY) maxY = p[i + 1]; if (p[i + 2] < minZ) minZ = p[i + 2]; if (p[i + 2] > maxZ) maxZ = p[i + 2]; }
    const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
    const span = Math.max(dx, dy, dz) || 1, s = targetSize / span;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    for (let i = 0; i < p.length; i += 3) {
        p[i] = (p[i] - cx) * s; p[i + 1] = (p[i + 1] - cy) * s; p[i + 2] = (p[i + 2] - cz) * s;
        if (anchor === "floor") p[i + 1] += (dy * s) / 2;   // shift up so the base sits at y=0
    }
    return g;
}

// parse + normalize + register as a spawnable kind. color = [r,g,b] 0..1 (uniform).
export function registerSTLKind(assetLoader, name, buf, opts = {}) {
    if (!assetLoader || !assetLoader.gl || !assetLoader.cache || !assetLoader._createMesh) throw new Error("asset loader unsupported");
    if (assetLoader.cache.get(name)) return name;
    const g = normalizeGeometry(parseSTL(buf), opts);
    const col = opts.color || [0.72, 0.74, 0.78];
    const colors = new Float32Array(g.vertexCount * 3);
    for (let i = 0; i < g.vertexCount; i++) { colors[i * 3] = col[0]; colors[i * 3 + 1] = col[1]; colors[i * 3 + 2] = col[2]; }
    const mesh = assetLoader._createMesh(g.positions.buffer, g.indices.buffer, g.normals.buffer, colors.buffer,
        { name, vertexCount: g.vertexCount, indexCount: g.indexCount, hasNormals: true, hasColors: true });
    if (!mesh) throw new Error("createMesh failed");
    assetLoader.cache.set(name, mesh);
    assetLoader._ollamaRequested?.add?.(name);
    return name;
}

// fetch an .stl by URL (e.g. an extracted mod file the bridge serves) + register it
export async function registerSTLFromUrl(assetLoader, name, url, opts = {}) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("fetch " + r.status);
    const buf = await r.arrayBuffer();
    return registerSTLKind(assetLoader, name, buf, opts);
}
