// FILE: engine/favicon-inject.js
// v1895 — standalone, self-running version of the LCARS isometric-voxel favicon so the
// utility pages (server.html, tts.html, dictation.html, tradingfloor.html, ...) show the SAME
// tab icon as the full render (which injects it via engine/favicon.js from main.js).
// Plain <script src> (no module import needed). Same drawing + same localStorage cache key,
// so all pages share one generated icon.
(function () {
    if (typeof document === "undefined") return;
    var CACHE_KEY = "voxelengine.favicon.v1";

    function generate() {
        var size = 64;
        var c = document.createElement("canvas");
        c.width = size; c.height = size;
        var g = c.getContext("2d");
        g.fillStyle = "#0a0a0a"; g.fillRect(0, 0, size, size);
        g.strokeStyle = "#f90"; g.lineWidth = 3; g.strokeRect(1.5, 1.5, size - 3, size - 3);
        var cx = size / 2, cy = size / 2 + 4, s = 14;
        function iso(x, y, z) { return { x: cx + (x - z) * s * 0.866, y: cy + (x + z) * s * 0.5 - y * s }; }
        function face(pts, fill) {
            g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
            for (var i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
            g.closePath(); g.fillStyle = fill; g.fill();
            g.strokeStyle = "#000"; g.lineWidth = 1; g.stroke();
        }
        face([iso(0, 1, 0), iso(1, 1, 0), iso(1, 1, 1), iso(0, 1, 1)], "#ffb733");   // top
        face([iso(0, 0, 0), iso(0, 1, 0), iso(0, 1, 1), iso(0, 0, 1)], "#c66200");   // left
        face([iso(0, 0, 1), iso(0, 1, 1), iso(1, 1, 1), iso(1, 0, 1)], "#8c4400");   // right
        return c.toDataURL("image/png");
    }

    try {
        // Only inject if the page doesn't already declare a real icon.
        var existing = document.querySelector('link[rel~="icon"]');
        if (existing && existing.href && existing.href.indexOf("data:") === 0) return;

        var dataUrl = null;
        try { dataUrl = localStorage.getItem(CACHE_KEY); } catch (e) {}
        if (!dataUrl) { dataUrl = generate(); try { localStorage.setItem(CACHE_KEY, dataUrl); } catch (e) {} }

        document.querySelectorAll('link[rel~="icon"]').forEach(function (l) { l.remove(); });
        var link = document.createElement("link");
        link.rel = "icon"; link.type = "image/png"; link.href = dataUrl;
        document.head.appendChild(link);
    } catch (e) { /* non-fatal */ }
})();
