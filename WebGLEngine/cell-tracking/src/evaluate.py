"""
evaluate.py — runs the detection+tracking pipeline on samples that have ground
truth (train split), then scores predictions against the GT using the
competition's exact metric. Useful for tuning detector/tracker parameters
before submitting.
"""
import argparse

from io_utils import discover_samples, load_geff_graph
from metric import aggregate_scores, evaluate_sample
from run_pipeline import process_sample


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data_dir", default="../test_data")
    ap.add_argument("--split", default="train")
    ap.add_argument("--sigma", type=float, default=1.5)
    ap.add_argument("--min_distance", type=int, default=4)
    ap.add_argument("--max_link_distance", type=float, default=7.0)
    ap.add_argument("--division_distance", type=float, default=10.0)
    args = ap.parse_args()

    sample_ids = discover_samples(args.data_dir, args.split)
    print(f"Evaluating {len(sample_ids)} samples: {sample_ids}\n")

    per_sample_results = {}
    for sid in sample_ids:
        pred_nodes, pred_edges = process_sample(
            sid, args.data_dir, args.split,
            sigma=args.sigma, min_distance=args.min_distance,
            max_link_distance=args.max_link_distance,
            division_distance=args.division_distance,
            verbose=False,
        )
        gt_nodes, gt_edges, meta = load_geff_graph(f"{args.data_dir}/{args.split}/{sid}.geff")
        est_total = meta.get("estimated_number_of_nodes", len(gt_nodes))

        result = evaluate_sample(pred_nodes, pred_edges, gt_nodes, gt_edges, est_total)
        per_sample_results[sid] = result

        e = result["edge"]
        d = result["division"]
        print(f"[{sid}] pred_nodes={len(pred_nodes)} gt_nodes={len(gt_nodes)} "
              f"est_total={est_total}")
        print(f"  edge:     TP={e['tp']} FP={e['fp']} FN={e['fn']} "
              f"jaccard={e['jaccard']:.3f} adjusted={e['adjusted_jaccard']:.3f}")
        print(f"  division: TP={d['tp']} FP={d['fp']} FN={d['fn']}")

    print()
    final = aggregate_scores(per_sample_results)
    print("=" * 60)
    print(f"Adjusted edge Jaccard (weight-avg): {final['adjusted_edge_jaccard']:.4f}")
    print(f"Division Jaccard (micro-avg):       {final['division_jaccard']:.4f} "
          f"(TP={final['division_tp']} FP={final['division_fp']} FN={final['division_fn']})")
    print(f"FINAL SCORE:                        {final['final_score']:.4f}")
    print("=" * 60)


if __name__ == "__main__":
    main()
