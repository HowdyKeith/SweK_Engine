#!/usr/bin/env python3
# Comic-page optimizer for phone/tablet viewing. Pillow only — no other tools.
#   crop          <in> <out>                      autocrop white scan border
#   optimize      <in> <out> [maxdim] [targetKB]   downscale + WebP toward target size
#   crop-optimize <in> <out> [maxdim] [targetKB]   both
# Prints "PILLOW_NOT_INSTALLED" + exit 3 when Pillow is missing (engine auto-installs it).
import sys


def _need():
    try:
        from PIL import Image  # noqa: F401
        return None
    except Exception:
        return "Pillow"


def autocrop(im):
    # Find the bounding box of non-white content and trim the border to it.
    # Robust: if the detected box is missing or nearly the whole page (nothing to
    # crop), leave the image alone so we never shave actual art.
    from PIL import Image, ImageChops
    rgb = im.convert("RGB")
    bg = Image.new("RGB", rgb.size, (255, 255, 255))
    diff = ImageChops.difference(rgb, bg).convert("L")
    mask = diff.point(lambda p: 255 if p > 14 else 0)   # tolerance for off-white scans
    bbox = mask.getbbox()
    if not bbox:
        return im
    w, h = rgb.size
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if bw >= w * 0.97 and bh >= h * 0.97:
        return im   # essentially no border
    pad = max(2, int(min(w, h) * 0.004))   # tiny pad so we don't clip edges of art
    box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad))
    return im.crop(box)


def optimize(im, maxdim, target_kb):
    # Downscale to a phone/tablet-friendly max dimension, then WebP-encode and
    # step the quality down only as far as needed to land near the target size.
    # A quality floor protects image quality — we never go below it even if the
    # page stays a little over target.
    from PIL import Image
    import io
    w, h = im.size
    if max(w, h) > maxdim:
        s = maxdim / float(max(w, h))
        im = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    im = im.convert("RGB")
    target = target_kb * 1024
    floor = 62
    best = None
    for q in (92, 88, 84, 80, 76, 72, 68, floor):
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=q, method=4)
        best = buf.getvalue()
        if len(best) <= target:
            break
    return best


def main():
    a = sys.argv[1:]
    if len(a) < 3:
        print("usage: crop|optimize|crop-optimize <in> <out> [maxdim] [targetKB]")
        sys.exit(2)
    if _need():
        print("PILLOW_NOT_INSTALLED")
        sys.exit(3)
    from PIL import Image
    import io
    mode, inp, out = a[0], a[1], a[2]
    maxdim = int(a[3]) if len(a) > 3 else 1600
    target_kb = int(a[4]) if len(a) > 4 else 900
    im = Image.open(inp)
    if "crop" in mode:
        im = autocrop(im)
    if "optimize" in mode:
        data = optimize(im, maxdim, target_kb)
    else:
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "WEBP", quality=90, method=4)
        data = buf.getvalue()
    with open(out, "wb") as f:
        f.write(data)
    print("OK %s %d" % (out, len(data)))


if __name__ == "__main__":
    main()
