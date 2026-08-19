// physics/metaball2d.js
//
// The screen-space field behind the Lab's isosurface render. The Blobarium's skin is the surface where the 3D blob
// field equals a threshold; drawing the true 3D isosurface every frame under a rotating camera would mean marching
// cubes, so the Lab projects the blob centres to the screen and evaluates the SAME finite-support cubic kernel the
// phantom uses -- sum of a*(1 - d^2/r^2)^3 inside each blob's radius -- in two dimensions, thresholding at ISO. It is
// a screen-space approximation of the isosurface, not the projected 3D surface, but it captures the defining
// behaviour: two blobs close together merge into one connected skin, two far apart stay separate. Pure arithmetic.
// (True 3D marching cubes is the faithful upgrade; this is the cheap, live, and honestly-labelled version.)

export const ISO2D = 1.0;

// Field at (px, py) from 2D blobs [{x, y, r, a}] -- cubic kernel, finite support, exactly the phantom's shape in 2D.
export function metaballField2d(blobs, px, py) {
    let s = 0;
    for (const b of blobs) {
        const d2 = (px - b.x) * (px - b.x) + (py - b.y) * (py - b.y);
        if (d2 >= b.r * b.r) continue;
        const u = 1 - d2 / (b.r * b.r);
        s += b.a * u * u * u;
    }
    return s;
}

// Is a point on or inside the skin (field >= ISO)?
export function insideSkin(blobs, px, py, iso = ISO2D) { return metaballField2d(blobs, px, py) >= iso; }

// Are two blobs' skins merged -- is the midpoint between their centres inside the surface? The metaball signature.
export function merged(a, b, iso = ISO2D) { return insideSkin([a, b], (a.x + b.x) / 2, (a.y + b.y) / 2, iso); }
