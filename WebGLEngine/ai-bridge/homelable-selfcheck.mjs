// ai-bridge/homelable-selfcheck.mjs
//
// Run: node ai-bridge/homelable-selfcheck.mjs
//
// The borrow reads homelable's device inventory and hands SweK normalised device records and radar blips. The gate holds
// the pure parts to the verified homelable schema: every node type maps to a sensible SweK kind (Zigbee coordinator ->
// zigbee, camera -> camera, an unknown type -> generic device, never a crash), online/mac are read correctly, and the
// blips carry a position for every device -- homelable's canvas x/y when present, a stable ring placement when not. The
// sabotage makes the type map collapse everything to one kind, and the mapping check fails -- a borrowed inventory that
// cannot tell a Zigbee coordinator from a camera is not worth reading.
import { kindFor, parseCanvas, toRadarBlips } from "./homelableBridge.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const CANVAS = {
    nodes: [
        { id: 1, type: "router", name: "Router", mac: "aa:bb:cc", status: "online", x: 100, y: 50 },
        { id: 2, type: "zigbee_coordinator", name: "ZB Coord", status: "online" },
        { id: 3, type: "iot", name: "Smart Plug", mac: "dd:ee:ff", status: "offline" },
        { id: 4, type: "camera", name: "Frigate Cam", status: "online" },
        { id: 5, type: "some_new_type_homelable_added", name: "Mystery", status: "up" },
    ],
};

// ---- 1. TYPE MAPPING: homelable types -> SweK kinds, unknown -> generic ---------------------------------
{
    ok("!! homelable node types map to SweK kinds, unknown falls back to generic", kindFor("router") === "infra" && kindFor("zigbee_coordinator") === "zigbee" && kindFor("camera") === "camera" && kindFor("iot") === "iot" && kindFor("some_new_type") === "device",
       "a router is infra, a Zigbee coordinator is zigbee, a camera is a camera, and a type homelable invents tomorrow reads as a generic device instead of crashing the import.");
}

// ---- 2. PARSE: records carry id, label, kind, mac, online ----------------------------------------------
{
    const d = parseCanvas(CANVAS);
    const plug = d.find((x) => x.id === "3");
    const cam = d.find((x) => x.id === "4");
    ok("!! parseCanvas normalises id, label, kind, mac and online", d.length === 5 && plug && plug.online === false && plug.mac === "dd:ee:ff" && plug.kind === "iot" && cam.online === true,
       "the five homelable nodes become five device records; the offline smart plug reads online=false with its MAC, the camera reads online and kind camera.");
}

// ---- 3. BLIPS: every device gets a position ------------------------------------------------------------
{
    const blips = toRadarBlips(parseCanvas(CANVAS));
    const withPos = blips.filter((b) => typeof b.x === "number" && typeof b.z === "number");
    const router = blips.find((b) => b.id === "hl:1");
    ok("!! every device becomes a radar blip with a position", blips.length === 5 && withPos.length === 5 && router.x === 100 && router.z === 50 && blips.every((b) => b.id.startsWith("hl:")),
       "all five become blips namespaced hl:*, the router keeps its homelable canvas position, and the ones without a canvas position get a stable ring placement -- none end up positionless.");
}

// ---- 4. TOLERANT: a bare array and empty input don't throw ---------------------------------------------
{
    const bare = parseCanvas([{ id: 9, type: "nas", name: "NAS", status: "online" }]);
    ok("!! parseCanvas accepts a bare array and empty input without throwing", bare.length === 1 && bare[0].kind === "server" && parseCanvas(null).length === 0 && parseCanvas({}).length === 0,
       "a bare node array parses (a NAS is a server), and null or an empty object yields an empty list rather than an error -- a homelable that's down or mid-migration never breaks the reader.");
}

// ---- 5. STABLE: same canvas -> same records -----------------------------------------------------------
{
    ok("!! the parse is stable", JSON.stringify(parseCanvas(CANVAS)) === JSON.stringify(parseCanvas(CANVAS)),
       "the same canvas parses to the same records every time -- a read, not a guess.");
}

console.log(fails ? "\nhomelable-selfcheck: " + fails + " FAILED" : "\nhomelable-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
