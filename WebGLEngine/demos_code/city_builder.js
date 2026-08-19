// FILE: demos_code/city_builder.js
// VERSION: v728 — procedural downtown city demo
//
// Calls window.city.build() (mounted by ui/cityPack.js) to drop a grid of
// buildings + streets + sidewalks into the world. Requires the Quaternius
// Downtown City Mega Kit (or a compatible pack) dropped into
// GPU_Assets/city/. If the folder is empty, the demo still starts but
// logs a clear instruction and leaves the user on a flat plane.
//
// Camera: positioned for an aerial downtown overview, looking down at the
// grid center.
//
// Honest gaps:
// - No fly-through camera tour (just static overview)
// - No kaiju attacking the city (could be added by toggling kaijuSim on)
// - Demo doesn't auto-detect what pack is installed; defaults to "city"

export default {
    id:    "city_builder",
    label: "CITY BUILDER (procedural downtown)",
    hint:  "Builds a Quaternius-style downtown grid with streets, sidewalks, and props. Requires GPU_Assets/city/ populated.",
    isolation: "exclusive",   // hide the voxel kaiju world; flat stage
    displayOrder: 4,           // sits after blank_sandbox (3)

    controls: [
        "Auto — flattens terrain + builds a 6×6 city with streets",
        "Console: city.build({rows:10, cols:10}) — bigger grid",
        "Console: city.build({pack:'medieval'}) — different pack folder",
        "Console: city.clear() — wipe the last city",
        "Console: city.list() — see what GLBs are classified by role",
    ],

    async start() {
        const stage = (typeof window !== "undefined") ? window._stage : null;
        if (stage) {
            try { stage.enter({ floor: false }); } catch {}
            // city.build({flatten:true}) will lay its own floor; don't double-floor.
        }
        if (!window.city || !window.city.build) {
            console.warn("[city_builder] window.city not mounted yet — engine still booting? Retry in a moment.");
            return;
        }
        // Check the pack folder before starting, so we give a useful message
        // if it's empty rather than just silently doing nothing.
        try {
            const groups = await window.city.list("city");
            if (!groups) {
                console.warn("[city_builder] Could not list GPU_Assets/city/. Make sure the bridge is running.");
                return;
            }
            const buildingCount = (groups.skyscraper?.length || 0) + (groups.building?.length || 0);
            if (buildingCount === 0) {
                console.warn(
                    "[city_builder] No buildings found in GPU_Assets/city/. Download Quaternius Downtown\n" +
                    "City Mega Kit (https://quaternius.com/packs/downtowncitymegakit.html), unzip the GLTF\n" +
                    "files into WebGLEngine/GPU_Assets/city/, then re-run this demo."
                );
                return;
            }
        } catch (e) {
            console.warn("[city_builder] list() threw:", e.message);
            return;
        }

        // Build the city. Default 6x6 grid with streets + sidewalks.
        try {
            // v763 — pass an explicit center so we know where to point the
            // camera. Previously cityPack defaulted to camera position,
            // and then we moved the camera elsewhere — guaranteeing the
            // user saw empty world. Pin the build to (0, 0) and frame it.
            const center = { x: 0, z: 0 };
            const ids = await window.city.build({
                pack:        "city",
                rows:        6,
                cols:        6,
                spacing:     12,
                center,
                flatten:     true,
                floorY:      8,
                roads:       true,
                sidewalks:   true,
                propsPerBuilding: 1,
                vehicleCount: 6,
                seed:        Date.now() & 0xffff,
            });
            this._cityIds = ids || [];
            console.log(`[city_builder] city up — ${this._cityIds.length} entities at (${center.x}, ${center.z})`);

            // v763 — frame the city. Camera south of center, pitched down,
            // facing +Z so the city is dead ahead. City is 6×6 cells at
            // spacing 12 = 72u square. Stand back ~50u with 50u height.
            const cam = window.camera;
            if (cam && window._safeMoveCamera) {
                try {
                    window._safeMoveCamera(cam, center.x, 50, center.z - 50, { warnOnAdjust: false });
                } catch {}
                if (typeof cam.pitch === "number") cam.pitch = -0.45;     // look down ~26°
                if (typeof cam.yaw   === "number") cam.yaw   = 0;          // face +Z toward city
            }
        } catch (e) {
            console.warn("[city_builder] city.build threw:", e.message);
        }
    },

    stop() {
        try {
            if (window.city && window.city.clear) window.city.clear();
        } catch (e) {
            console.warn("[city_builder] city.clear threw:", e.message);
        }
        this._cityIds = [];
    },
};
