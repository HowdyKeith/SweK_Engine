// tools/export/renderRoster.mjs -- the pages the headless "render service" can turn into review clips. autonomous:true
// means the scene is brain/seed-driven, so each run is a genuinely different video (worth swiping through and picking
// the best). These are the current showcase pages; add a line to enroll a new one.
export const ROSTER = [
    { id: "away-mission", title: "ES Away Mission", url: "/es-away-mission.html", seconds: 20, autonomous: true, category: "showcase" },
    { id: "raycaster", title: "Sprite Raycaster", url: "/sprite-raycast.html", seconds: 16, autonomous: true, category: "showcase" },
    { id: "living-box", title: "Living Box", url: "/living-box.html", seconds: 18, autonomous: true, category: "showcase" },
    { id: "nebula-device", title: "Nebula (Unified Device)", url: "/nebula-device.html", seconds: 14, autonomous: false, category: "tech" },
    { id: "gfx-device", title: "Unified Device", url: "/gfx-device.html", seconds: 10, autonomous: false, category: "tech" }
];
export function byId(id) { return ROSTER.find(r => r.id === id) || null; }
export default ROSTER;
