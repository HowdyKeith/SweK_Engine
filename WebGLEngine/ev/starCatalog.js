// ev/starCatalog.js
//
// A baked snapshot of real recorded star data -- position, distance, brightness, spectral type and temperature for a set
// of well-known stars, taken from standard catalogues (Hipparcos/SIMBAD values, web-verified). This is the honest way to
// bring real sky data into a deterministic engine: FETCH ONCE AND BAKE. The data below is static, so loading it is
// deterministic and needs no internet -- the physics core never reaches out to a server mid-run. The recipe for
// refreshing this snapshot (Python Astropy/Astroquery against SIMBAD and Gaia) lives in the project notes; the engine
// itself only ever reads what is baked here.
//
// This is a DATA layer, not a physics subsystem. The loader derives 3D positions (trigonometry) and absolute magnitudes
// (a logarithm), neither of which is bit-identical across architectures, so this is gated for correctness but is
// deliberately NOT part of the cross-architecture fingerprint.

// raH = right ascension in hours (0..24); dec = declination in degrees; distLy = distance in light-years;
// mag = apparent visual magnitude (smaller = brighter); tempK = surface temperature in kelvin.
export const STARS = [
    { name: "Sun",        raH: 0.000,  dec:   0.00, distLy: 0.0000158, mag: -26.75, spectral: "G2V",     tempK: 5772 },
    { name: "Sirius",     raH: 6.752,  dec: -16.72, distLy: 8.6,       mag:  -1.44, spectral: "A1V",     tempK: 9940 },
    { name: "Arcturus",   raH: 14.261, dec:  19.18, distLy: 36.7,      mag:  -0.05, spectral: "K1.5III", tempK: 4286 },
    { name: "Vega",       raH: 18.616, dec:  38.78, distLy: 25.04,     mag:   0.03, spectral: "A0V",     tempK: 9602 },
    { name: "Capella",    raH: 5.278,  dec:  46.00, distLy: 42.9,      mag:   0.08, spectral: "G3III",   tempK: 4970 },
    { name: "Rigel",      raH: 5.242,  dec:  -8.20, distLy: 863.0,     mag:   0.13, spectral: "B8Ia",    tempK: 12100 },
    { name: "Procyon",    raH: 7.655,  dec:   5.22, distLy: 11.5,      mag:   0.34, spectral: "F5IV",    tempK: 6530 },
    { name: "Betelgeuse", raH: 5.919,  dec:   7.41, distLy: 548.0,     mag:   0.45, spectral: "M1-2Ia",  tempK: 3600 },
    { name: "Altair",     raH: 19.846, dec:   8.87, distLy: 16.7,      mag:   0.76, spectral: "A7V",     tempK: 7550 },
    { name: "Aldebaran",  raH: 4.599,  dec:  16.51, distLy: 65.3,      mag:   0.87, spectral: "K5III",   tempK: 3900 },
    { name: "Antares",    raH: 16.490, dec: -26.43, distLy: 604.0,     mag:   1.06, spectral: "M1.5Iab", tempK: 3660 },
    { name: "Fomalhaut",  raH: 22.961, dec: -29.62, distLy: 25.1,      mag:   1.17, spectral: "A3V",     tempK: 8590 },
    { name: "Deneb",      raH: 20.690, dec:  45.28, distLy: 1467.0,    mag:   1.25, spectral: "A2Ia",    tempK: 8525 },
];

export function starByName(name) { return STARS.find((s) => s.name === name) || null; }
export function count() { return STARS.length; }

// 3D position in light-years, from the recorded right ascension, declination and distance (equatorial -> Cartesian).
export function position3D(s) {
    const raRad = s.raH * 15 * Math.PI / 180, decRad = s.dec * Math.PI / 180, cd = Math.cos(decRad);
    return [s.distLy * cd * Math.cos(raRad), s.distLy * cd * Math.sin(raRad), s.distLy * Math.sin(decRad)];
}

// Absolute magnitude from the recorded apparent magnitude and distance (the distance modulus). This is what strips away
// the deception of apparent brightness: the Sun is blinding only because it is close.
export function absoluteMagnitude(s) {
    const dPc = s.distLy / 3.261564;
    return s.mag - 5 * Math.log10(dPc / 10);
}

// A star's colour from its temperature -- hotter is bluer, cooler is redder (Wien's law, as a simple normalised ramp).
export function colorFromTemp(tempK) {
    const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const blue = clamp((tempK - 3000) / 9000);
    const red = clamp((12000 - tempK) / 9000);
    const green = clamp(0.5 * (blue + red));
    return [red, green, blue];
}
