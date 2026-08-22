// maps/uvtt/presets.mjs -- v3818
//
// *** THE SHIPPED UVTT MAPS, IN ONE LIST. *** uvtt.html reads this to fill its preset dropdown and
// maps/uvtt/presets-selfcheck.mjs reads the SAME list to check every entry resolves to a file that parses and
// fits its own declared map_size. A dropdown hand-typed in the page and a gate hand-typed beside it would be
// two lists that agree until the day somebody adds an eighth map to one of them.
//
// THE FILES ARE VERBATIM AS KEITH SUPPLIED THEM. Not reformatted, not repaired, not stripped of their
// placeholder images -- so what the loader does with them here is what it will do with a file off a
// cartographer's site. Where they are odd, the oddity is described below rather than edited away, because
// A PRESET THAT HAS BEEN QUIETLY CLEANED UP IS A TEST OF NOTHING.

/** @type {{file:string,label:string,note:string,pairsWith?:string}[]} */
export const UVTT_PRESETS = [
    {
        file: "single-wall-10.uvtt",
        label: "Single wall + door (10x10)",
        note: "The smallest thing the loader can be asked to do: one wall segment, one door, one light. " +
              "Useful precisely because almost nothing is going on -- if this looks wrong, nothing else will be right.",
    },
    {
        file: "two-rooms-30.uvtt",
        label: "Two rooms + corridor (30x30)",
        note: "A west room, a corridor with a door at each end, an east chamber. The ordinary case.",
    },
    {
        file: "two-rooms-apse-30.uvtt",
        label: "Two rooms + apse, secret door (30x30)",
        note: "As above, but the east chamber comes to a point and there is a SECRET door in the west wall. " +
              "Carries three lights, so it is the one to look at when checking that embedded lights land.",
    },
    {
        file: "tower-30-lvl1.uvtt",
        label: "Tower, level 1 (30x30)",
        note: "Upper floor with a funnelled passage down to the east hall. The freestanding portal at (22,20) " +
              "is a STAIRCASE rather than a door -- it is marked freestanding and open, which is how a UVTT " +
              "file says 'this is a hole between levels, not something that swings'.",
        pairsWith: "tower-30-lvl2.uvtt",
    },
    {
        file: "tower-30-lvl2.uvtt",
        label: "Tower, level 2 (30x30)",
        note: "The floor below, with the matching staircase at the same (22,20), a secret door and an arrow " +
              "slit. THE TWO FILES SHARE THAT COORDINATE ON PURPOSE and that is the whole of the link between " +
              "them -- see the note in uvtt.html about why the Levels slider does NOT stack these.",
        pairsWith: "tower-30-lvl1.uvtt",
    },
    {
        file: "keep-60-lvl1.uvtt",
        label: "Keep, level 1 (60x60)",
        note: "The biggest of the set: a great hall, a long corridor and an east wing. Its image field is the " +
              "string \"MapImage\" rather than base64 -- A PLACEHOLDER FROM WHATEVER WROTE IT -- which is why " +
              "the loader now says so instead of failing silently.",
        pairsWith: "keep-60-lvl2.uvtt",
    },
    {
        file: "keep-60-lvl2.uvtt",
        label: "Keep, level 2 (60x60)",
        note: "The floor below, with four freestanding pillars as closed wall loops. Note the third pillar's " +
              "corner at (20,20) where the other three would put (20,22): the file says what it says and it " +
              "is left alone. Also carries the same \"MapImage\" placeholder.",
        pairsWith: "keep-60-lvl1.uvtt",
    },
];

/** Where the files live, relative to the engine root. One place, so the page and the gate cannot disagree. */
export const UVTT_PRESET_DIR = "maps/uvtt";
