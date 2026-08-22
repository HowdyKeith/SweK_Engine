"""
dataset_tool.py — get the competition data and package it for transfer via Google Drive.

The tracking pipeline reads local zarr/geff files; it never talks to Kaggle. This helper
handles the data logistics separately:

  fetch    — download the competition data from Kaggle (needs the kaggle CLI + ~/.kaggle/
             kaggle.json on THIS box) into a staging dir and unzip it.
  pack     — tar each sample (its .zarr folder + .geff folder) into ONE file per sample in
             an out dir. A zarr is thousands of tiny chunk files; moving one tar per sample
             through the Drive API is enormously faster than thousands of small objects.
  unpack   — extract sample tars (downloaded from Drive) into a local test_data/<split>/.

Typical flow:
  # on Galaxina (has the Kaggle token):
  python dataset_tool.py fetch  --competition <name> --stage ../_kaggle_stage
  python dataset_tool.py pack   --stage ../_kaggle_stage --split train --out ../_dataset_tars
  #   -> the bridge uploads ../_dataset_tars/*.tar to your Drive dataset folder
  # on each peer (no Kaggle token needed):
  #   the bridge downloads the tars from Drive into ../_dataset_tars, then:
  python dataset_tool.py unpack --tars ../_dataset_tars --split train --data_dir ../test_data
"""
import argparse
import os
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path


def _sample_ids(split_dir):
    """Sample IDs in a split dir = the .zarr stems."""
    return sorted(p.name[:-5] for p in Path(split_dir).glob("*.zarr"))


def fetch(competition, stage, split=None):
    """Download + unzip the competition data via the kaggle CLI into `stage`."""
    stage = Path(stage); stage.mkdir(parents=True, exist_ok=True)
    # kaggle CLI reads ~/.kaggle/kaggle.json (or KAGGLE_USERNAME/KAGGLE_KEY env vars)
    cmd = ["kaggle", "competitions", "download", "-c", competition, "-p", str(stage)]
    print("[fetch] " + " ".join(cmd), flush=True)
    try:
        subprocess.run(cmd, check=True)
    except FileNotFoundError:
        print("ERROR: the 'kaggle' CLI isn't installed. pip install kaggle, and put your token at ~/.kaggle/kaggle.json", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as e:
        print("ERROR: kaggle download failed (is ~/.kaggle/kaggle.json present and the competition accepted?): " + str(e), file=sys.stderr)
        return 3
    # unzip any archives kaggle dropped
    for z in stage.glob("*.zip"):
        print("[fetch] unzip " + z.name, flush=True)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(stage)
        z.unlink()
    print("[fetch] staged at " + str(stage), flush=True)
    return 0


def pack(stage, split, out):
    """Tar each sample (<sample>.zarr + <sample>.geff) into out/<split>__<sample>.tar."""
    split_dir = Path(stage) / split
    if not split_dir.exists():
        # some competition zips put splits at the top level; fall back to stage itself
        split_dir = Path(stage)
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    ids = _sample_ids(split_dir)
    if not ids:
        print("[pack] no .zarr samples found in " + str(split_dir), file=sys.stderr)
        return 4
    for sid in ids:
        tar_path = out / (split + "__" + sid + ".tar")
        print("[pack] " + sid + " -> " + tar_path.name, flush=True)
        with tarfile.open(tar_path, "w") as tf:
            for suffix in (".zarr", ".geff"):
                member = split_dir / (sid + suffix)
                if member.exists():
                    tf.add(member, arcname=(sid + suffix))
    print("[pack] wrote " + str(len(ids)) + " sample tar(s) to " + str(out), flush=True)
    return 0


def unpack(tars, split, data_dir):
    """Extract out/<split>__<sample>.tar files into data_dir/<split>/."""
    tars = Path(tars)
    dest = Path(data_dir) / split
    dest.mkdir(parents=True, exist_ok=True)
    prefix = split + "__"
    found = sorted(p for p in tars.glob(prefix + "*.tar"))
    if not found:
        # also accept plain <sample>.tar
        found = sorted(tars.glob("*.tar"))
    if not found:
        print("[unpack] no .tar files in " + str(tars), file=sys.stderr)
        return 5
    for tp in found:
        print("[unpack] " + tp.name + " -> " + str(dest), flush=True)
        with tarfile.open(tp, "r") as tf:
            tf.extractall(dest)
    print("[unpack] extracted " + str(len(found)) + " tar(s) into " + str(dest), flush=True)
    return 0


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_fetch = sub.add_parser("fetch")
    p_fetch.add_argument("--competition", required=True)
    p_fetch.add_argument("--stage", default="../_kaggle_stage")

    p_pack = sub.add_parser("pack")
    p_pack.add_argument("--stage", default="../_kaggle_stage")
    p_pack.add_argument("--split", default="train")
    p_pack.add_argument("--out", default="../_dataset_tars")

    p_unpack = sub.add_parser("unpack")
    p_unpack.add_argument("--tars", default="../_dataset_tars")
    p_unpack.add_argument("--split", default="train")
    p_unpack.add_argument("--data_dir", default="../test_data")

    a = ap.parse_args()
    if a.cmd == "fetch":
        return fetch(a.competition, a.stage)
    if a.cmd == "pack":
        return pack(a.stage, a.split, a.out)
    if a.cmd == "unpack":
        return unpack(a.tars, a.split, a.data_dir)
    return 1


if __name__ == "__main__":
    sys.exit(main())
