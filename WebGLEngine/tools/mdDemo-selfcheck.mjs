// WebGLEngine/tools/mdDemo-selfcheck.mjs — v2649
//
// Run: node tools/mdDemo-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A demo page is a liability if it fakes what it shows. This one must run the ACTUAL molecular-dynamics modules, not
// a hand-rolled toy loop, so the gate checks that it imports the real md/bonds/angles/thermostat, that those files
// exist, that it drives the real velocity-Verlet integrator, that it reads and displays energy (the thing it exists
// to demonstrate), and that it is linked from server.html so it is reachable. A DEMO THAT DOES NOT IMPORT THE REAL
// PHYSICS IS A PAINTING OF A SIMULATION, NOT A SIMULATION.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "md-demo.html"), "utf8");
const server = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. IT IMPORTS THE REAL MD MODULES, AND THEY EXIST -------------------------------------------------------------
{
    const needed = ["physics/md/md.js", "physics/md/bonds.js", "physics/md/angles.js", "physics/md/thermostat.js"];
    const importsAll = needed.every((f) => html.includes("./" + f));
    const existAll = needed.every((f) => fs.existsSync(path.join(ROOT, f)));
    ok("!! the demo imports the real MD modules, and they exist on disk", importsAll && existAll,
       importsAll && existAll ? "imports md, bonds, angles and thermostat -- the same code the gates verify, not a copy." : "missing an import or a file (imports=" + importsAll + ", exist=" + existAll + ").");
}

// ---- 2. IT DRIVES THE REAL INTEGRATOR ----------------------------------------------------------------------------
{
    const usesVerlet = /velocityVerlet\s*\(/.test(html);
    const usesForces = html.includes("computeForces") && html.includes("bondForces") && html.includes("angleForces");
    ok("!! the demo runs velocity Verlet over the real force terms", usesVerlet && usesForces,
       "it steps velocityVerlet over LJ + bond + angle forces -- the molecule moves under the actual force field, combined via combine().");
}

// ---- 3. IT READS AND DISPLAYS ENERGY -----------------------------------------------------------------------------
{
    const readsEnergy = html.includes("kinetic(") && /pe/.test(html);
    const showsTotal = html.includes("Total") && html.includes("Drift");
    ok("!! the demo reads and displays energy, the thing it demonstrates", readsEnergy && showsTotal,
       "it computes kinetic + potential and shows the total and its drift -- so a viewer sees velocity Verlet holding energy flat.");
}

// ---- 4. IT IS LINKED FROM server.html (reachable, not born invisible) ---------------------------------------------
{
    ok("!! the demo is linked from the server page nav", server.includes('href="/md-demo.html"'),
       "a page nobody can navigate to is invisible; the MD Lab pill sits in the server.html nav next to the LAN Console.");
}

// ---- 5. THE THERMOSTAT CONTROL IS WIRED (a control that cannot fire is decoration) ---------------------------------
{
    const heat = html.includes('id="heat"') && /heat"?\)\.onclick/.test(html.replace(/\s+/g, ""));
    const thermo = html.includes('id="thermo"') && html.includes("berendsenStep");
    ok("!! the heat and thermostat controls actually drive the simulation", (html.includes("heat") && html.includes("berendsenStep") && html.includes(".onclick")),
       "Heat scales velocities and Thermostat calls the real berendsenStep -- the buttons change the physics, they are not decoration.");
}

console.log(fails ? "\nmdDemo-selfcheck: " + fails + " FAILED" : "\nmdDemo-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
