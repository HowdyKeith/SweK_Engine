// utils/voxelsToObj.js — convert a voxel array [[x,y,z,c],...] into an OBJ
// text suitable for gpuAssetLoader.installOBJText().
//
// Same visible-face culling as the phone voxel viewer: a face is only
// emitted if there's NO neighbor voxel on that side, so internal faces
// are skipped (big win for solid models).
//
// The OBJ is normalized to roughly unit-radius bounds so the engine's
// per-kind scaleFor() controls final world size.

export function voxelsToObj(voxels, opts = {}) {
    if (!Array.isArray(voxels) || voxels.length === 0) {
        return "# empty\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
    }
    const normalize = opts.normalize !== false;
    // Build set for O(1) neighbor lookup
    const set = new Set();
    for (const v of voxels) {
        if (!Array.isArray(v) || v.length < 3) continue;
        set.add(`${v[0]},${v[1]},${v[2]}`);
    }
    // Compute bounds for normalization
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const v of voxels) {
        if (v[0] < lo[0]) lo[0] = v[0]; if (v[0] > hi[0]) hi[0] = v[0];
        if (v[1] < lo[1]) lo[1] = v[1]; if (v[1] > hi[1]) hi[1] = v[1];
        if (v[2] < lo[2]) lo[2] = v[2]; if (v[2] > hi[2]) hi[2] = v[2];
    }
    const cx = (lo[0] + hi[0]) / 2;
    const cy = (lo[1] + hi[1]) / 2;
    const cz = (lo[2] + hi[2]) / 2;
    const maxExtent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1) / 2 + 0.5;
    const scale = normalize ? (1 / maxExtent) : 1;

    // Faces: each entry has direction offset + 4 corner positions (CCW from outside)
    const FACES = [
        { d: [ 1, 0, 0], v: [[ 0.5,-0.5,-0.5],[ 0.5, 0.5,-0.5],[ 0.5, 0.5, 0.5],[ 0.5,-0.5, 0.5]] },
        { d: [-1, 0, 0], v: [[-0.5,-0.5, 0.5],[-0.5, 0.5, 0.5],[-0.5, 0.5,-0.5],[-0.5,-0.5,-0.5]] },
        { d: [ 0, 1, 0], v: [[-0.5, 0.5,-0.5],[ 0.5, 0.5,-0.5],[ 0.5, 0.5, 0.5],[-0.5, 0.5, 0.5]] },
        { d: [ 0,-1, 0], v: [[-0.5,-0.5, 0.5],[ 0.5,-0.5, 0.5],[ 0.5,-0.5,-0.5],[-0.5,-0.5,-0.5]] },
        { d: [ 0, 0, 1], v: [[ 0.5,-0.5, 0.5],[ 0.5, 0.5, 0.5],[-0.5, 0.5, 0.5],[-0.5,-0.5, 0.5]] },
        { d: [ 0, 0,-1], v: [[-0.5,-0.5,-0.5],[-0.5, 0.5,-0.5],[ 0.5, 0.5,-0.5],[ 0.5,-0.5,-0.5]] },
    ];

    const vLines = [];
    const fLines = [];
    let vIdx = 1;   // OBJ is 1-indexed
    for (const v of voxels) {
        if (!Array.isArray(v) || v.length < 3) continue;
        const [x, y, z] = v;
        for (const F of FACES) {
            const nx = x + F.d[0], ny = y + F.d[1], nz = z + F.d[2];
            if (set.has(`${nx},${ny},${nz}`)) continue;
            // Emit 4 verts + 1 quad face (CCW)
            for (const corner of F.v) {
                const wx = (x + corner[0] - cx) * scale;
                const wy = (y + corner[1] - cy) * scale;
                const wz = (z + corner[2] - cz) * scale;
                vLines.push(`v ${wx.toFixed(3)} ${wy.toFixed(3)} ${wz.toFixed(3)}`);
            }
            fLines.push(`f ${vIdx} ${vIdx + 1} ${vIdx + 2} ${vIdx + 3}`);
            vIdx += 4;
        }
    }
    return `# voxels-to-obj (${voxels.length} voxels, ${fLines.length} faces)\n` +
           vLines.join("\n") + "\n" + fLines.join("\n") + "\n";
}
