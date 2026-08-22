// FILE: ui/MeshQcBadges.js
// VERSION: v1 — round 283
//
// Small reusable row of QC badges for a mesh. One badge per stat
// (verts, tris, file size, post-process additions, smoothing iters,
// hole-fill count). Used in the AI pipeline bench step cards and in
// the asset_pipeline demo so the result of each pipeline stage is
// surfaced visually rather than only as a console log.
//
// API:
//   createMeshQcBadges(stats) → HTMLElement
//
// stats:
//   {
//     verts: number,       triangles: number,
//     fileBytes?: number,   // raw OBJ size if known
//     addedTris?: number,   // from postprocess (hole fill)
//     smoothIters?: number, // from postprocess (smoothing)
//     normals?: boolean,    // true if recomputed normals attached
//     processed?: boolean,  // true = this row is the post-processed one
//     warning?: string,     // optional, shown red
//   }
//
// Visual: small pill row, ~12px tall, monospace, color-coded by
// category. Green for "did work" (added tris, smoothing), grey for
// raw counts, red for warnings. Fits within ~280px width.

function _humanBytes(n) {
    if (n == null) return "—";
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
    return `${(n / 1024 / 1024).toFixed(2)}M`;
}

function _humanCount(n) {
    if (n == null) return "—";
    if (n < 1000) return String(n);
    if (n < 1000000) return `${(n / 1000).toFixed(1)}K`;
    return `${(n / 1000000).toFixed(2)}M`;
}

export function createMeshQcBadges(stats = {}) {
    const row = document.createElement("div");
    row.className = "mesh-qc-badges";
    row.style.cssText = [
        "display:flex",
        "flex-wrap:wrap",
        "gap:4px",
        "font:10px monospace",
        "margin:4px 0",
    ].join(";");

    const mk = (label, value, color = "#9ef", title = "") => {
        const pill = document.createElement("span");
        pill.style.cssText = [
            "background:rgba(255,255,255,0.06)",
            `color:${color}`,
            "padding:1px 6px",
            "border-radius:8px",
            `border:1px solid ${color}44`,
        ].join(";");
        pill.innerHTML = `<span style="opacity:0.65">${label}</span> ${value}`;
        if (title) pill.title = title;
        return pill;
    };

    if (stats.processed) {
        row.appendChild(mk("✨", "post-proc", "#9fb", "Mesh has been post-processed (hole-fill + smooth + normals)"));
    }
    row.appendChild(mk("v", _humanCount(stats.verts), "#9ef", "Vertex count"));
    row.appendChild(mk("△", _humanCount(stats.triangles), "#cef", "Triangle count"));
    if (stats.fileBytes != null) {
        row.appendChild(mk("size", _humanBytes(stats.fileBytes), "#aaa", "OBJ text size"));
    }
    if (stats.addedTris != null && stats.addedTris > 0) {
        row.appendChild(mk("+△", String(stats.addedTris), "#9fb", "Triangles added by hole-fill"));
    }
    if (stats.unfilledHoles != null && stats.unfilledHoles > 0) {
        row.appendChild(mk("?", String(stats.unfilledHoles), "#fc8", "Complex holes left unfilled (need multi-tri fix)"));
    }
    if (stats.smoothIters != null && stats.smoothIters > 0) {
        row.appendChild(mk("smooth", `${stats.smoothIters}×`, "#9fb", "Laplacian smoothing iterations"));
    }
    if (stats.normals === true) {
        row.appendChild(mk("⟂", "normals", "#cef", "Vertex normals included"));
    }
    if (stats.durationMs != null) {
        row.appendChild(mk("⏱", `${stats.durationMs}ms`, "#aac", "Post-processing wall time"));
    }
    if (stats.warning) {
        row.appendChild(mk("⚠", stats.warning, "#f99", stats.warning));
    }

    return row;
}
