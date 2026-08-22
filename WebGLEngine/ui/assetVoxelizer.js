// ui/assetVoxelizer.js — v1687
// Turn ANY loaded model (THREE.Object3D from a .glb/.gltf/.obj) into a thing built out of colored voxels: surface
// voxelization with per-voxel color sampled from the model's texture (or vertex/material color), an optional solid
// interior fill, and per-voxel material tagging so some cubes can be LIQUID (translucent, see-through) while the rest
// are solid. Pure-data first, then an InstancedMesh per material type so even high resolutions render cheaply.
//
//   import { voxelizeObject } from "/ui/assetVoxelizer.js";
//   const out = voxelizeObject(THREE, model, { resolution: 96, fill: true, liquidTest: (name)=>/water|glass|liquid/i.test(name) });
//   scene.add(out.group);            // out.stats = {dims, voxels, solid, liquid, voxelSize}
//   out.toJSON();                    // serializable voxel data (for saving / library)
//
// "resolution" = number of voxels along the model's LONGEST axis. Generous upper end is fine — it instances.

export function voxelizeObject(THREE, root, opts = {}) {
    const resolution = Math.max(4, Math.min(512, Math.round(opts.resolution || 64)));
    const fill = opts.fill !== false;                         // default: solid interior
    const liquidTest = typeof opts.liquidTest === "function" ? opts.liquidTest : () => false;

    // ---- bounds -----------------------------------------------------------
    root.updateWorldMatrix(true, true);
    const bbox = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(); bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const vs = maxDim / resolution;                            // voxel edge (world units)
    const dims = [Math.max(1, Math.ceil(size.x / vs)), Math.max(1, Math.ceil(size.y / vs)), Math.max(1, Math.ceil(size.z / vs))];
    const [DX, DY, DZ] = dims;
    const idx = (x, y, z) => (x * DY + y) * DZ + z;
    const N = DX * DY * DZ;
    const state = new Uint8Array(N);                           // 0 empty, 1 surface, 2 exterior, 3 interior
    const colR = new Float32Array(N), colG = new Float32Array(N), colB = new Float32Array(N);
    const liquid = new Uint8Array(N);
    const o = bbox.min;

    function vcoord(p) {
        let x = Math.floor((p.x - o.x) / vs), y = Math.floor((p.y - o.y) / vs), z = Math.floor((p.z - o.z) / vs);
        if (x < 0) x = 0; else if (x >= DX) x = DX - 1;
        if (y < 0) y = 0; else if (y >= DY) y = DY - 1;
        if (z < 0) z = 0; else if (z >= DZ) z = DZ - 1;
        return [x, y, z];
    }

    // ---- per-mesh color sampler -------------------------------------------
    function makeSampler(mesh) {
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        let iw = 0, ih = 0, idata = null;
        try {
            const im = mat && mat.map && mat.map.image;
            if (im && (im.width || im.videoWidth)) {
                iw = im.width || im.videoWidth; ih = im.height || im.videoHeight;
                const c = document.createElement("canvas"); c.width = iw; c.height = ih;
                const cx = c.getContext("2d"); cx.drawImage(im, 0, 0, iw, ih);
                idata = cx.getImageData(0, 0, iw, ih).data;
            }
        } catch {}
        const base = (mat && mat.color) ? mat.color : new THREE.Color(0xb0b0b0);
        const flipY = !!(mat && mat.map && mat.map.flipY);   // glTF textures are flipY=false; plain images true
        const name = (mat && (mat.name || "")) + " " + (mesh.name || "");
        const isLiq = !!liquidTest(name);
        const geo = mesh.geometry, colAttr = geo.attributes.color, hasTex = !!(idata && geo.attributes.uv);
        return {
            isLiq, hasTex, colAttr,
            texAt(u, v) {
                let tx = ((u % 1) + 1) % 1, ty = ((v % 1) + 1) % 1;
                const px = Math.min(iw - 1, Math.max(0, Math.floor(tx * iw)));
                const vy = flipY ? (1 - ty) : ty;
                const py = Math.min(ih - 1, Math.max(0, Math.floor(vy * ih)));
                const k = (py * iw + px) * 4; return [idata[k] / 255, idata[k + 1] / 255, idata[k + 2] / 255];
            },
            base: [base.r, base.g, base.b],
        };
    }

    // ---- surface voxelization (rasterize each triangle into the grid) -----
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), P = new THREE.Vector3();
    let surfaceCount = 0;
    root.traverse((node) => {
        if (!node.isMesh || !node.geometry || !node.geometry.attributes.position) return;
        const geo = node.geometry, pos = geo.attributes.position, uv = geo.attributes.uv, col = geo.attributes.color;
        const index = geo.index ? geo.index.array : null;
        const triCount = index ? index.length / 3 : pos.count / 3;
        const wm = node.matrixWorld;
        const S = makeSampler(node);
        for (let t = 0; t < triCount; t++) {
            const i0 = index ? index[t * 3] : t * 3, i1 = index ? index[t * 3 + 1] : t * 3 + 1, i2 = index ? index[t * 3 + 2] : t * 3 + 2;
            A.fromBufferAttribute(pos, i0).applyMatrix4(wm); B.fromBufferAttribute(pos, i1).applyMatrix4(wm); C.fromBufferAttribute(pos, i2).applyMatrix4(wm);
            const eMax = Math.max(A.distanceTo(B), B.distanceTo(C), C.distanceTo(A));
            const steps = Math.max(1, Math.ceil(eMax / vs) + 1);
            for (let a = 0; a <= steps; a++) {
                for (let b = 0; b <= steps - a; b++) {
                    const wA = 1 - (a + b) / steps, wB = a / steps, wC = b / steps;
                    P.set(A.x * wA + B.x * wB + C.x * wC, A.y * wA + B.y * wB + C.y * wC, A.z * wA + B.z * wB + C.z * wC);
                    const [vx, vy, vz] = vcoord(P); const id = idx(vx, vy, vz);
                    if (state[id] === 1) continue;
                    state[id] = 1; surfaceCount++;
                    let rgb;
                    if (S.hasTex && uv) {
                        const u = uv.getX(i0) * wA + uv.getX(i1) * wB + uv.getX(i2) * wC;
                        const v = uv.getY(i0) * wA + uv.getY(i1) * wB + uv.getY(i2) * wC;
                        rgb = S.texAt(u, v);
                    } else if (S.colAttr && col) {
                        rgb = [col.getX(i0) * wA + col.getX(i1) * wB + col.getX(i2) * wC,
                               col.getY(i0) * wA + col.getY(i1) * wB + col.getY(i2) * wC,
                               col.getZ(i0) * wA + col.getZ(i1) * wB + col.getZ(i2) * wC];
                    } else rgb = S.base;
                    colR[id] = rgb[0]; colG[id] = rgb[1]; colB[id] = rgb[2];
                    if (S.isLiq) liquid[id] = 1;
                }
            }
        }
    });

    // ---- optional solid interior fill (flood the outside, fill the rest) --
    let interiorCount = 0;
    if (fill) {
        // average surface color for the (mostly hidden) interior
        let ar = 0, ag = 0, ab = 0, cnt = 0;
        for (let i = 0; i < N; i++) if (state[i] === 1) { ar += colR[i]; ag += colG[i]; ab += colB[i]; cnt++; }
        if (cnt) { ar /= cnt; ag /= cnt; ab /= cnt; }
        // BFS exterior from every empty boundary cell
        const stack = [];
        const pushIf = (x, y, z) => { if (x < 0 || y < 0 || z < 0 || x >= DX || y >= DY || z >= DZ) return; const id = idx(x, y, z); if (state[id] === 0) { state[id] = 2; stack.push(id); } };
        for (let x = 0; x < DX; x++) for (let y = 0; y < DY; y++) { pushIf(x, y, 0); pushIf(x, y, DZ - 1); }
        for (let x = 0; x < DX; x++) for (let z = 0; z < DZ; z++) { pushIf(x, 0, z); pushIf(x, DY - 1, z); }
        for (let y = 0; y < DY; y++) for (let z = 0; z < DZ; z++) { pushIf(0, y, z); pushIf(DX - 1, y, z); }
        while (stack.length) {
            const id = stack.pop(); const z = id % DZ, y = ((id - z) / DZ) % DY, x = Math.floor(id / (DY * DZ));
            pushIf(x + 1, y, z); pushIf(x - 1, y, z); pushIf(x, y + 1, z); pushIf(x, y - 1, z); pushIf(x, y, z + 1); pushIf(x, y, z - 1);
        }
        for (let i = 0; i < N; i++) if (state[i] === 0) { state[i] = 3; colR[i] = ar; colG[i] = ag; colB[i] = ab; interiorCount++; }
    }

    // ---- build the instanced cubes (solid + liquid) -----------------------
    const group = new THREE.Group(); group.name = "swek-voxelized";
    const geo = new THREE.BoxGeometry(vs, vs, vs);
    const solidMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0, vertexColors: false });
    const liquidMat = new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.55, depthWrite: false });
    let nSolid = 0, nLiquid = 0;
    for (let i = 0; i < N; i++) { if (state[i] === 1 || state[i] === 3) { if (liquid[i]) nLiquid++; else nSolid++; } }
    const solid = new THREE.InstancedMesh(geo, solidMat, Math.max(1, nSolid));
    const liq = new THREE.InstancedMesh(geo, liquidMat, Math.max(1, nLiquid));
    const m = new THREE.Matrix4(), col = new THREE.Color();
    let si = 0, li = 0;
    const half = vs * 0.5;
    const voxels = [];   // for export
    for (let x = 0; x < DX; x++) for (let y = 0; y < DY; y++) for (let z = 0; z < DZ; z++) {
        const id = idx(x, y, z); if (state[id] !== 1 && state[id] !== 3) continue;
        const px = o.x + x * vs + half, py = o.y + y * vs + half, pz = o.z + z * vs + half;
        m.makeTranslation(px, py, pz); col.setRGB(colR[id], colG[id], colB[id]);
        if (liquid[id]) { liq.setMatrixAt(li, m); liq.setColorAt(li, col); li++; }
        else { solid.setMatrixAt(si, m); solid.setColorAt(si, col); si++; }
        voxels.push([x, y, z, Math.round(colR[id] * 255), Math.round(colG[id] * 255), Math.round(colB[id] * 255), liquid[id] ? 1 : 0]);
    }
    solid.count = si; liq.count = li;
    solid.instanceMatrix.needsUpdate = true; if (solid.instanceColor) solid.instanceColor.needsUpdate = true;
    liq.instanceMatrix.needsUpdate = true; if (liq.instanceColor) liq.instanceColor.needsUpdate = true;
    if (si) group.add(solid); if (li) group.add(liq);
    // re-center the group on the model's center so it sits where the model was
    const center = new THREE.Vector3(); bbox.getCenter(center);

    const stats = { dims, voxelSize: vs, surface: surfaceCount, interior: interiorCount, solid: si, liquid: li, total: si + li };
    function dispose() { try { geo.dispose(); solidMat.dispose(); liquidMat.dispose(); } catch {} try { group.parent && group.parent.remove(group); } catch {} }
    function toJSON() { return { dims, voxelSize: vs, origin: [o.x, o.y, o.z], voxels }; }   // voxels: [x,y,z,r,g,b,liquid]
    return { group, stats, dispose, toJSON, center, instanced: { solid, liquid: liq } };
}
