# subvoxel.mojo -- Mojo port of _refine_subvoxel (cell-tracking detector).
#
# EXPERIMENT (not yet wired into the engine): does Mojo meaningfully beat the
# NumPy/scipy version of this hot loop on real hardware? The NumPy version pays
# per-detection overhead (np.clip / np.sum / np.mgrid on a 27-voxel patch); a
# compiled scalar loop should erase that. We prove IDENTICAL results first,
# then compare speed -- decide from data, on your box.
#
# Mojo is a beta (1.0.0 beta, May 2026), compiler closed-source until fall 2026,
# Linux/macOS only. This file is written against the stable core (structs,
# fn, for loops, math) and Python interop so it can be called from the harness.
#
# NOTE ON API STABILITY: Mojo's stdlib is still stabilizing. If a symbol below
# has moved (e.g. the math import path, or List vs. InlineArray), the harness
# prints the error verbatim so we can pin the exact spelling from your build --
# same "verify, don't guess" discipline we used for AutoRemesher's CLI.

from python import Python, PythonObject
from memory import UnsafePointer


# Core kernel: given the flattened smoothed volume (row-major z,y,x), its dims,
# the integer peak coords, and the threshold, write refined (z,y,x) centroids.
# All scalar -- no per-patch allocation, which is the point.
fn refine_subvoxel_kernel(
    vol: UnsafePointer[Float64],
    Z: Int, Y: Int, X: Int,
    coords: UnsafePointer[Int],   # 3*N: (cz,cy,cx) triples
    n: Int,
    thr: Float64,
    out: UnsafePointer[Float64],  # 3*N: refined (z,y,x) triples
):
    for i in range(n):
        var cz = coords[i * 3 + 0]
        var cy = coords[i * 3 + 1]
        var cx = coords[i * 3 + 2]

        var z0 = cz - 1
        if z0 < 0:
            z0 = 0
        var z1 = cz + 2
        if z1 > Z:
            z1 = Z
        var y0 = cy - 1
        if y0 < 0:
            y0 = 0
        var y1 = cy + 2
        if y1 > Y:
            y1 = Y
        var x0 = cx - 1
        if x0 < 0:
            x0 = 0
        var x1 = cx + 2
        if x1 > X:
            x1 = X

        var wsum: Float64 = 0.0
        var sz: Float64 = 0.0
        var sy: Float64 = 0.0
        var sx: Float64 = 0.0

        for zz in range(z0, z1):
            for yy in range(y0, y1):
                # row base for (zz,yy,*)
                var base = (zz * Y + yy) * X
                for xx in range(x0, x1):
                    var v = vol[base + xx] - thr
                    if v > 0.0:
                        wsum += v
                        sz += Float64(zz) * v
                        sy += Float64(yy) * v
                        sx += Float64(xx) * v

        if wsum <= 0.0:
            out[i * 3 + 0] = Float64(cz)
            out[i * 3 + 1] = Float64(cy)
            out[i * 3 + 2] = Float64(cx)
        else:
            out[i * 3 + 0] = sz / wsum
            out[i * 3 + 1] = sy / wsum
            out[i * 3 + 2] = sx / wsum


# Python-callable entry point. Accepts NumPy arrays (contiguous float64 volume,
# int64 coords Nx3), returns a NumPy Nx3 float64 array of refined centroids.
# Uses ctypes data pointers so we operate on the same buffers with no copy.
@export
fn refine_subvoxel(vol_obj: PythonObject, coords_obj: PythonObject, thr: Float64) raises -> PythonObject:
    var np = Python.import_module("numpy")

    var shape = vol_obj.shape
    var Z = Int(shape[0])
    var Y = Int(shape[1])
    var X = Int(shape[2])
    var n = Int(coords_obj.shape[0])

    # raw pointers into the NumPy buffers (caller guarantees contiguity + dtype)
    var vol_ptr = vol_obj.ctypes.data.unsafe_get_as_pointer[DType.float64]()
    var coords_ptr = coords_obj.ctypes.data.unsafe_get_as_pointer[DType.int64]()

    var out_np = np.empty((n, 3), dtype=np.float64)
    var out_ptr = out_np.ctypes.data.unsafe_get_as_pointer[DType.float64]()

    # int64 (NumPy) vs Int (Mojo word) -- read coords as Int64 then use as Int
    var coords_i = UnsafePointer[Int].alloc(n * 3)
    for k in range(n * 3):
        coords_i[k] = Int(coords_ptr[k])

    refine_subvoxel_kernel(
        vol_ptr, Z, Y, X, coords_i, n, thr, out_ptr,
    )
    coords_i.free()
    return out_np
