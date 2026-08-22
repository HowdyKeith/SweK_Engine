#!/usr/bin/env python3
# pdf_tools.py — PDF support for the engine's comic reader (and image export).
# Uses PyMuPDF (fitz) to: report page count, render a page to PNG (so PDFs show
# in the comic reader page-by-page), and export the embedded image files out of
# a PDF (the "images stored in PDFs" use case). One JSON line per call on stdout.
#
#   info  <pdf>                      -> {ok, pages}
#   render <pdf> <page> <out.png> [dpi]  -> {ok, path, w, h, page}
#   render-pages <pdf> <outdir> [dpi] [fmt] [quality]  -> {ok, count, dir, files, fmt, dpi, quality}
#   extract-images <pdf> <outdir>    -> {ok, count, dir, files:[...]}  (original embedded images)
#
# Install (on the engine PC):  pip install PyMuPDF
import sys, os, json, re


def _stem(pdf):
    # base name of the pdf (no extension), sanitized for use in filenames
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", os.path.splitext(os.path.basename(pdf))[0]).strip("_")
    return s or "pdf"


def out(o):
    sys.stdout.write(json.dumps(o) + "\n")
    sys.stdout.flush()
    sys.exit(0)


try:
    import fitz  # PyMuPDF
except Exception as e:
    out({"ok": False, "error": "PyMuPDF not installed", "need": "PyMuPDF",
         "hint": "pip install PyMuPDF", "detail": str(e)})


def cmd_info(pdf):
    d = fitz.open(pdf)
    out({"ok": True, "pages": d.page_count, "name": os.path.basename(pdf)})


def cmd_render(pdf, page, outpath, dpi=150):
    d = fitz.open(pdf)
    i = max(0, min(d.page_count - 1, int(page)))
    pg = d.load_page(i)
    pix = pg.get_pixmap(dpi=int(dpi))
    od = os.path.dirname(outpath)
    if od:
        os.makedirs(od, exist_ok=True)
    pix.save(outpath)
    out({"ok": True, "path": outpath, "w": pix.width, "h": pix.height, "page": i})


def cmd_text(pdf, page):
    d = fitz.open(pdf)
    i = max(0, min(d.page_count - 1, int(page)))
    txt = d.load_page(i).get_text("text")
    out({"ok": True, "page": i, "text": txt})


def cmd_extract_images(pdf, outdir):
    # Pull the ORIGINAL embedded image streams out of the PDF (lossless byte copy —
    # this IS the 100% original quality). Named <pdfstem>_pNNN[_k].<ext> by the page
    # the image first appears on (k only when a page has more than one image).
    d = fitz.open(pdf)
    os.makedirs(outdir, exist_ok=True)
    stem = _stem(pdf)
    seen = set()
    files = []
    n = 0
    for pno in range(d.page_count):
        try:
            imgs = d.get_page_images(pno)
        except Exception:
            imgs = []
        k = 0
        for img in imgs:
            xref = img[0]
            if xref in seen:
                continue
            seen.add(xref)
            try:
                ext = d.extract_image(xref)
                data = ext["image"]
                e = (ext.get("ext") or "png").lower()
                k += 1
                suffix = "" if (len(imgs) <= 1) else ("_%d" % k)
                fn = os.path.join(outdir, "%s_p%03d%s.%s" % (stem, pno + 1, suffix, e))
                with open(fn, "wb") as f:
                    f.write(data)
                files.append(os.path.basename(fn))
                n += 1
            except Exception:
                pass
    out({"ok": True, "count": n, "dir": outdir, "files": files, "mode": "embedded"})


def cmd_render_pages(pdf, outdir, dpi=200, fmt="png", quality=100):
    # Render EACH PAGE to its own image named <pdfstem>_pNNN.<fmt>. One file per page,
    # deterministic naming. PNG is lossless (= 100%). JPEG/WebP use the quality value.
    fmt = (fmt or "png").lower().lstrip(".")
    if fmt == "jpeg":
        fmt = "jpg"
    if fmt not in ("png", "jpg", "webp"):
        fmt = "png"
    try:
        dpi = int(float(dpi))
    except Exception:
        dpi = 200
    dpi = max(50, min(600, dpi))
    try:
        quality = int(quality)
    except Exception:
        quality = 100
    quality = max(1, min(100, quality))
    d = fitz.open(pdf)
    os.makedirs(outdir, exist_ok=True)
    stem = _stem(pdf)
    files = []
    used_fmt = fmt
    note = ""
    for pno in range(d.page_count):
        pg = d.load_page(pno)
        # no alpha for jpg/webp; alpha is harmless for png
        pix = pg.get_pixmap(dpi=dpi, alpha=(fmt == "png"))
        fn = os.path.join(outdir, "%s_p%03d.%s" % (stem, pno + 1, fmt))
        if fmt == "png":
            pix.save(fn)
        else:
            ok_saved = False
            # 1) PyMuPDF native (jpg_quality supported on modern PyMuPDF)
            try:
                if fmt == "jpg":
                    pix.save(fn, jpg_quality=quality)
                    ok_saved = True
            except Exception:
                ok_saved = False
            # 2) Pillow (handles jpg + webp quality reliably)
            if not ok_saved:
                try:
                    from PIL import Image
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    if fmt == "webp":
                        img.save(fn, "WEBP", quality=quality)
                    else:
                        img.save(fn, "JPEG", quality=quality)
                    ok_saved = True
                except Exception:
                    ok_saved = False
            # 3) fallback to PNG so the export still succeeds
            if not ok_saved:
                fn = os.path.join(outdir, "%s_p%03d.png" % (stem, pno + 1))
                pix.save(fn)
                used_fmt = "png"
                note = "jpg/webp needs a newer PyMuPDF or Pillow; fell back to lossless PNG"
        files.append(os.path.basename(fn))
    out({"ok": True, "count": len(files), "dir": outdir, "files": files,
         "fmt": used_fmt, "dpi": dpi, "quality": (100 if used_fmt == "png" else quality), "note": note})


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        out({"ok": False, "error": "usage: info|render|render-pages|extract-images <pdf> ..."})
    c = a[0]
    try:
        if c == "info":
            cmd_info(a[1])
        elif c == "render":
            cmd_render(a[1], a[2], a[3], a[4] if len(a) > 4 else 150)
        elif c == "render-pages":
            cmd_render_pages(a[1], a[2], a[3] if len(a) > 3 else 200, a[4] if len(a) > 4 else "png", a[5] if len(a) > 5 else 100)
        elif c == "extract-images":
            cmd_extract_images(a[1], a[2])
        elif c == "text":
            cmd_text(a[1], a[2] if len(a) > 2 else 0)
        else:
            out({"ok": False, "error": "unknown command: " + c})
    except IndexError:
        out({"ok": False, "error": "missing args for " + c})
    except Exception as e:
        out({"ok": False, "error": str(e)})
