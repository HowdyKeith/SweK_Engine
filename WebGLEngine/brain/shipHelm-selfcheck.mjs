// WebGLEngine/brain/shipHelm-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/shipHelm-selfcheck.mjs      (instant; pure)
//
// THE SHIP'S SEAT, HELD (brain/shipHelm.mjs; Keith, 2026-11-28: "Could the ships have ai brain seats like the subs do?"). The seat's contract -- obs in, { heading, speed } out --
// and its three hand-written occupants:
//   steady   its base course at cruise (60% of top), whatever it hears
//   zigzag   legs of 60 s, 0.6 rad either side of the base course, at cruise
//   evade    zigzag until a torpedo is heard; then the torpedo put astern (its heading plus the torpedo's bearing plus pi) at full speed for 60 s; then back to zigzag
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import * as H from "./shipHelm.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
console.log("shipHelm-selfcheck -- the ship's helm seat\n");
const self = (t, heading = 0.3) => ({ x: 0, y: 0, heading, speed: 3, hp: 300, cls: "destroyer", maxSpeed: 6 });
const torp = [{ kind: "torpedo", bearing: 0.5, snr: 20 }], boat = [{ kind: "boat", bearing: -0.4, snr: 15 }];

const st = H.makeHelm("steady", { base: 1.1 });
ok("!! STEADY: its base course at cruise, whatever it hears", [[0, []], [200, torp], [400, boat]].every(([t, c]) => { const o = st({ t, self: self(t), contacts: c }); return near(o.heading, 1.1) && near(o.speed, 3.6); }));
const zz = H.makeHelm("zigzag", { base: 0 }), legs = [0, 59, 60, 119, 120].map((t) => zz({ t, self: self(t), contacts: torp }).heading);
ok("!! ZIGZAG: legs of 60 s, 0.6 rad either side of the base course, at cruise (and a torpedo changes nothing)", near(legs[0], 0.6) && near(legs[1], 0.6) && near(legs[2], -0.6) && near(legs[3], -0.6) && near(legs[4], 0.6) && near(zz({ t: 5, self: self(5), contacts: [] }).speed, 3.6), legs.map((v) => v.toFixed(2)).join(", "));
const ev = H.makeHelm("evade", { base: 0 }), before = ev({ t: 10, self: self(10), contacts: boat }), at = ev({ t: 20, self: self(20, 0.3), contacts: torp }), still = ev({ t: 70, self: self(70, 2), contacts: [] }), after = ev({ t: 81, self: self(81, 2), contacts: [] });
ok("!! EVADE: zigzag while it hears no torpedo (a boat is not one)", near(before.heading, 0.6) && near(before.speed, 3.6));
ok("!! ON A TORPEDO: the torpedo put astern -- its heading plus the bearing plus pi -- at full speed, held 60 s even when it is heard no more; then zigzag again", near(at.heading, wrap(0.3 + 0.5 + Math.PI)) && near(at.speed, 6) && near(still.heading, at.heading) && near(still.speed, 6) && near(after.heading, -0.6) && near(after.speed, 3.6), `${at.heading.toFixed(3)} at ${at.speed}; at 70 s ${still.heading.toFixed(3)}; at 81 s ${after.heading.toFixed(3)}`);
let refused = false; try { H.makeHelm("ram"); } catch { refused = true; }
ok("!! an unknown helm is refused; the seat lists its three", refused && H.HELMS.join() === "steady,zigzag,evade");
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: (filled in after the sweep)
