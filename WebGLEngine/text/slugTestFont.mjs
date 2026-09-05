// WebGLEngine/text/slugTestFont.mjs -- v4457
// ---------------------------------------------------------------------------------------------------------------
// THE CONSTRUCTED TEST FONT, MOVED OUT OF text/slug-selfcheck.mjs SO A SECOND GATE CAN READ THE SAME BYTES.
//
// Seven glyphs specified point by point rather than drawn, so that every expectation about them is a
// restatement of the TrueType specification and not of the parser under test:
//
//   A "tri"       three on-curve points                      -> three straight lines
//   B "offstart"  contour BEGINS on an off-curve point
//   C "twooff"    two adjacent off-curve points              -> one implied on-curve midpoint
//   D "alloff"    EVERY point off-curve                      -> every on-curve point implied
//   E "comp"      composite: "tri" at half scale, offset (200, 150)
//   F "ring"      square annulus, outer CCW and inner CW     -> nonzero fill with a hole
//
// unitsPerEm 1024, sCapHeight 700, and a legacy `kern` table carrying A/B = -80 and B/C = +40.
//
// *** WHY IT MOVED. *** tools/ship/slugWgsl-selfcheck.mjs grades the WGSL port on a real device against the CPU
// key, and it wants the glyphs whose outlines are known from construction -- the composite and the all-off-curve
// contour above all. Retyping 1.5 KB of base64 into a second gate is the drift the tree refuses everywhere else
// ("a second hand-written 0.2 is how a port drifts"), so the bytes live here once and both gates import them.
// slug-selfcheck.mjs's own header still documents what each glyph is for; only the constant left.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

const FONT_B64 =
    "AAEAAAALAIAAAwAwT1MvMkb1QkYAAAE4AAAAYGNtYXAAhQCyAAABtAAAAEhnbHlmgFi1PAAAAgwAAACwaGVhZDBL1v4AAAC8AAAANmhoZWEH" +
    "bgOMAAAA9AAAACRobXR4GJwC1AAAAZgAAAAca2VybgA5/9IAAAK8AAAAHmxvY2EAgQCqAAAB/AAAABBtYXhwAAwADgAAARgAAAAgbmFtZRKX" +
    "90YAAALcAAAAcnBvc3Q+8VgMAAADUAAAAFAAAQAAAAEAAGU/2LdfDzz1AAEEAAAAAADmp8lBAAAAAOanyUEAZAAAA4QDhAAAAAMAAgAAAAAA" +
    "AAABAAADIP84AGQD6ABkAGQDhAABAAAAAAAAAAAAAAAAAAAABwABAAAABwAIAAIAAwABAAIAAAAAAAAAAAAAAAAAAQABAAQDhAGQAAUABAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAD8/Pz8AAAAgAEYDIP84AAAAAAAAAAAAAAAAAAAAAAK8AAAA" +
    "IAAAAlgAAAPoAGQD6ABkA+gAZAPoAHwD6ABkArwAyAAAAAIAAAADAAAAFAADAAEAAAAUAAQANAAAAAYABAABAAIAIABG//8AAAAgAEH////g" +
    "AAAAAQAAAAQAAAABAAIAAwAEAAYABQAAAAAADAAaACgAOABNAFgAAQBkAAADhAMgAAIAADMhAWQDIP5wAyAAAQBkAGQDhAOEAAIAAAABIQH0" +
    "/nADIAOE/OAAAAEAZABkA4QDhAADAAA3EiATZMgBkMhkAyD84AABAHwAfAOEA4QAAwAACAMCAAGE/nz+fAOE/nz+fAGEAAIAZABkA4QDhAAD" +
    "AAcAADchESETESERZAMg/ODIAZBkAyD9qAGQ/nAA//8A+gCWAooCJgELAAEAyACWIAAAAAAAAAEAAAAaAAEAAgAMAAEAAAABAAL/sAACAAMA" +
    "KAAAAAAABAA2AAEAAAAAAAEADQAAAAEAAAAAAAIABwANAAMAAQQJAAEAGgAUAAMAAQQJAAIADgAuU2x1Z1NlbGZjaGVja1JlZ3VsYXIAUwBs" +
    "AHUAZwBTAGUAbABmAGMAaABlAGMAawBSAGUAZwB1AGwAYQByAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAABAgEDAQQB" +
    "BQDdAQYDdHJpCG9mZnN0YXJ0BnR3b29mZgZhbGxvZmYEY29tcA==";

/** The font, as bytes, ready for slugFont.parseFont. A fresh copy each call, so a caller cannot alter the shared one. */
export function testFontBytes() {
    return Uint8Array.from(Buffer.from(FONT_B64, "base64"));
}

export const TEST_FONT_BASE64 = FONT_B64;
