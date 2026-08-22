"""
run_pipeline.py — end-to-end: load zarr volume -> detect blobs per frame ->
link into tracks/divisions -> write submission CSV.

Usage:
    python run_pipeline.py --data_dir test_data --split train --out submission.csv
"""
import argparse
import time
from pathlib import Path

from detector import detect_blobs_volume, estimate_threshold
from io_utils import discover_samples, load_zarr_volume, write_submission_csv
from tracker import link_frames


def process_sample(sample_id, data_dir, split, sigma=1.5, min_distance=4,
                    max_link_distance=7.0, division_distance=10.0, verbose=True, workers=1, use_gpu=False,
                    max_gap=2, adaptive=False, subvoxel=False, tracker="hungarian"):
    zarr_path = Path(data_dir) / split / f"{sample_id}.zarr"
    t0 = time.time()
    volume, shape = load_zarr_volume(zarr_path)
    t1 = time.time()
    if verbose:
        print(f"[{sample_id}] loaded volume {shape} in {t1 - t0:.2f}s")

    abs_thr = estimate_threshold(volume)
    detections = detect_blobs_volume(
        volume, sigma=sigma, min_distance=min_distance, absolute_threshold=abs_thr, workers=workers,
    )
    t2 = time.time()
    n_det = sum(len(v) for v in detections.values())
    if verbose:
        print(f"[{sample_id}] detected {n_det} total blobs across {len(detections)} frames "
              f"in {t2 - t1:.2f}s (threshold={abs_thr:.1f}, workers={workers})")

    # v2210 -- `--tracker ilp` links with royerlab/tracksdata: one integer program over the whole movie,
    # solved by SCIP through ilpy. It beats the Hungarian baseline on jittered, dropped detections -- which
    # is what a detector really gives you -- and loses to it on perfect ones. See tools/tracker_bench.py.
    if tracker == "ilp":
        from tracker_ilp import ilp_available, link_frames_ilp
        ok, why = ilp_available()
        if not ok:
            raise SystemExit(f"--tracker ilp needs an ILP backend: {why}\n  pip install tracksdata ilpy")
        nodes_df, edges_df = link_frames_ilp(detections, max_link_distance=max_link_distance)
    else:
        nodes_df, edges_df = link_frames(
            detections, max_link_distance=max_link_distance, division_distance=division_distance,
            max_gap=max_gap,
        )
    t3 = time.time()
    if verbose:
        print(f"[{sample_id}] tracked: {len(nodes_df)} nodes, {len(edges_df)} edges "
              f"in {t3 - t2:.2f}s")

    return nodes_df, edges_df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data_dir", default="test_data")
    ap.add_argument("--split", default="train")
    ap.add_argument("--tracker", default="hungarian", choices=["hungarian", "ilp"],
                    help="hungarian: the classical baseline. ilp: royerlab/tracksdata + SCIP, better on noisy detections.")
    ap.add_argument("--out", default="submission.csv")
    ap.add_argument("--sigma", type=float, default=1.5)
    ap.add_argument("--min_distance", type=int, default=4)
    ap.add_argument("--max_link_distance", type=float, default=7.0)
    ap.add_argument("--max_gap", type=int, default=2,
                    help="frames a track may go undetected and still re-link on reappearance (v2080 gap-closing). 0 = a single miss ends the track.")
    ap.add_argument("--adaptive", action="store_true",
                    help="per-frame adaptive detection threshold (v2080). Recovers cells in photobleached/dim later frames that a single global threshold misses.")
    ap.add_argument("--subvoxel", action="store_true",
                    help="refine detections to sub-voxel intensity-weighted centroids (v2080). Sharpens positions, especially in the coarse z axis.")
    ap.add_argument("--division_distance", type=float, default=10.0)
    ap.add_argument("--samples", default="",
                    help="comma-separated sample IDs to run (default: all discovered). Used by the cluster scheduler to give each peer a subset.")
    ap.add_argument("--workers", type=int, default=1,
                    help="parallel processes for per-frame detection (0 = all CPU cores). Detection is the dominant cost and each frame is independent, so a many-core box scales near-linearly.")
    args = ap.parse_args()

    sample_ids = discover_samples(args.data_dir, args.split)
    if args.samples.strip():
        want = [x.strip() for x in args.samples.split(",") if x.strip()]
        missing = [w for w in want if w not in sample_ids]
        if missing:
            print(f"WARNING: requested samples not found and skipped: {missing}")
        sample_ids = [s for s in sample_ids if s in want]
    print(f"Running {len(sample_ids)} samples in {args.data_dir}/{args.split}: {sample_ids}")

    predictions = {}
    for sid in sample_ids:
        nodes_df, edges_df = process_sample(
            sid, args.data_dir, args.split,
            sigma=args.sigma, min_distance=args.min_distance,
            max_link_distance=args.max_link_distance,
            division_distance=args.division_distance,
            workers=args.workers, use_gpu=args.gpu, max_gap=args.max_gap,
            adaptive=args.adaptive, subvoxel=args.subvoxel, tracker=args.tracker,
        )
        predictions[sid] = (nodes_df, edges_df)

    out_df = write_submission_csv(predictions, args.out)
    print(f"\nWrote {len(out_df)} rows to {args.out}")


if __name__ == "__main__":
    main()
