// ui/aircraftClass.js — v1446
// Decipher what kind of aircraft an ADS-B contact is (jet / airliner / turboprop /
// light prop / helicopter) from the ICAO type designator (a.t), the ADS-B emitter
// category (a.category, A1..A7/B..), and an altitude/speed fallback. Shared by the
// world aircraft layer (glyph) and the radar scope (blip shape/colour).
//
//   classifyAircraft({ type, category, altFt, speedKt, onGround }) ->
//     { cls, name, glyph, color }
//   cls is one of: "airliner" | "jet" | "turboprop" | "prop" | "heli" | "unknown"

const STYLE = {
    airliner:  { name: "Airliner",       glyph: "\u{1F6EB}", color: "#7fd7ff" }, // 🛫
    jet:       { name: "Jet",            glyph: "\u2708",     color: "#9fe0ff" }, // ✈
    turboprop: { name: "Turboprop",      glyph: "\u{1F6E9}", color: "#ffd27f" }, // 🛩
    prop:      { name: "Prop",           glyph: "\u{1F6E9}", color: "#ffb14a" }, // 🛩
    heli:      { name: "Helicopter",     glyph: "\u{1F681}", color: "#8de08a" }, // 🚁
    unknown:   { name: "Aircraft",       glyph: "\u2708",     color: "#9fb0bf" },
};

function mk(cls) { return Object.assign({ cls }, STYLE[cls] || STYLE.unknown); }

export function classifyAircraft(a = {}) {
    const t = String(a.type || "").toUpperCase().trim();
    const cat = String(a.category || "").toUpperCase().trim();
    const alt = +a.altFt || 0, spd = +a.speedKt || 0, gnd = !!a.onGround;

    // helicopters first (category A7, or known rotor type prefixes)
    if (cat === "A7" || /^(EC|AS3|AS5|AS6|R22|R44|R66|B06|B407|B412|B429|S76|S92|H1[0-9]|H2[0-9]|A109|A119|A139|A169|A189)/.test(t)) return mk("heli");

    // category-driven big jets
    if (cat === "A3" || cat === "A4" || cat === "A5") return mk("airliner");
    if (cat === "A6") return mk("jet"); // high-performance (>5g / >400kt) — military/fast jets

    // known jet families by ICAO type prefix (airliners + regional + bizjets)
    if (/^(A20|A21|A19|A30|A31|A32|A33|A34|A35|A38|B71|B72|B73|B74|B75|B76|B77|B78|E17|E19|E29|E75|E90|E95|CRJ|MD8|MD9|DC9|B46)/.test(t)) return mk("airliner");
    if (/^(C25|C5[0-9]|C68|C70|CL30|CL35|CL60|GLF|GL[5-7]|LJ[0-9]|F2TH|FA[0-9]|F900|H25|HDJT|BE40|E50P|E55P|E545|E550|PRM1|GALX|ASTR|SBR[0-9]|WW24)/.test(t)) return mk("jet");

    // known turboprops
    if (/^(PC12|TBM[0-9]|B350|B300|B190|BE9|BE20|C208|C212|C441|DH8|AT4|AT5|AT7|SF34|SW[0-9]|E110|E120|PC6|D228|D328|SB20|F27|F50)/.test(t)) return mk("turboprop");

    // known light GA piston props
    if (/^(C1[2-8][0-9]|C20[0-6]|C172|C182|C152|P28|PA[0-9]|SR2[0-2]|DA[24][0-9]|DA40|DA42|M20|BE3[36]|BE55|BE58|BE76|GA8|RV[0-9]|CH7|TOBA|TB[0-9]|AA5|G115)/.test(t)) return mk("prop");

    // category light/small fallback
    if (cat === "A1") return mk("prop");
    if (cat === "A2") return mk("turboprop");
    if (cat === "B1" || cat === "B2" || cat === "B4") return mk("prop"); // glider / balloon / ultralight

    // altitude + speed heuristic (last resort)
    if (!gnd && alt >= 24000 && spd >= 250) return mk("jet");
    if (!gnd && alt > 0 && alt < 14000 && spd > 0 && spd < 170) return mk("prop");

    return mk("unknown");
}
