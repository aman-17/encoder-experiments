"""extbench stock-vs-repaired pure parts: the merger key map is strict in both
directions (the checkpoint-key form of qwen_vit's strict load_state_dict), the three
official scorers' report formats parse into raw slices, deltas only cross arms on
matching numeric leaves, and the launch lines carry per-arm app names where the bench
supports them."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "pipelines"))

import modal_extbench_bridge as xb  # noqa: E402

CKPT_KEYS = [
    "model.language_model.layers.0.self_attn.q_proj.weight",
    "model.visual.blocks.0.attn.qkv.weight",
    "model.visual.merger.linear_fc1.weight",
    "model.visual.merger.linear_fc1.bias",
    "model.visual.merger.linear_fc2.weight",
    "model.visual.merger.linear_fc2.bias",
    "model.visual.merger.norm.weight",
    "model.visual.merger.norm.bias",
]
BRIDGE_KEYS = ["linear_fc1.weight", "linear_fc1.bias", "linear_fc2.weight",
               "linear_fc2.bias", "norm.weight", "norm.bias"]

OLMOCR_SUMMARY = """\
  [FAIL] Test 4_pg451_equation_05 on old_scans_math/4_pg451 page 1 average pass ratio: 0.000
  Average Score: 73.6% (95% CI: [72.6%, 74.7%]) over 8413 tests.

============================================================
Final Summary with 95% Confidence Intervals:
qwen35_4b_stock      : Average Score: 41.2% ± 1.3% (average of per-JSONL scores)
    absent  : 49.3% average pass rate over 823 tests
    baseline: 99.9% average pass rate over 1403 tests
    math    : 76.1% average pass rate over 3385 tests
    order   : 69.6% average pass rate over 1061 tests
    present : 66.4% average pass rate over 721 tests
    table   : 84.4% average pass rate over 1020 tests

    Results by JSONL file:
        arxiv_math.jsonl              : 75.4% (2206/2927 tests)
        baseline                      : 99.9% (1393/1394 tests)
        headers_footers.jsonl         : 49.5% (376/760 tests)
        table_tests.jsonl             : 84.4% (863/1022 tests)

Generating test report...
"""

OMNIDOC_METRIC = {
    "text_block": {
        "all": {"Edit_dist": {"ALL_page_avg": 0.2}},
        "group": {"Edit_dist": {"text_language: text_english": 0.1}},
        "page": {"Edit_dist": {"ALL": 0.2, "language: english": 0.1}},
    },
    "display_formula": {"all": {"Edit_dist": {"ALL_page_avg": 0.5},
                                "CDM": {"all": 0.9}}},
    "table": {"all": {"TEDS": {"all": 0.7}, "TEDS_structure_only": {"all": 0.8},
                      "Edit_dist": {"ALL_page_avg": 0.3}}},
    "reading_order": {"all": {"Edit_dist": {"ALL_page_avg": 0.25}}},
}

PULSE_SUMMARY = {
    "summary": {"n_total": 1820, "n_scored": 1668, "coverage_pct": 91.6, "mean": 0.6638},
    "per_language": {"english": 0.7308, "arabic": 0.5503},
}

ITEM_ROWS = {
    "table_tests.jsonl": [
        {"id": "t_table_00", "type": "table", "pdf": "tables/a.pdf"},
        {"id": "t_base", "type": "baseline", "pdf": "tables/a.pdf"},
        {"id": "t_table_01", "type": "table", "pdf": "tables/b.pdf"},
    ],
    "headers_footers.jsonl": [
        {"id": "h_absent_00", "type": "absent", "pdf": "headers_footers/c.pdf"},
    ],
}


def test_merger_key_map_is_strict_both_ways():
    mapping = xb.merger_key_map(CKPT_KEYS, BRIDGE_KEYS)
    assert mapping == {f"model.visual.merger.{k}": k for k in BRIDGE_KEYS}
    with pytest.raises(RuntimeError, match="missing"):
        xb.merger_key_map(CKPT_KEYS, BRIDGE_KEYS[:-1])
    with pytest.raises(RuntimeError, match="unknown"):
        xb.merger_key_map(CKPT_KEYS, [*BRIDGE_KEYS, "extra.weight"])
    with pytest.raises(RuntimeError, match="one merger"):
        xb.merger_key_map([*CKPT_KEYS, "model.visual2.merger.norm.weight"], BRIDGE_KEYS)
    with pytest.raises(RuntimeError, match="no checkpoint key"):
        xb.merger_key_map(CKPT_KEYS[:2], BRIDGE_KEYS)


def test_parse_olmocr_summary_reads_only_the_final_block():
    parsed = xb.parse_olmocr_summary(OLMOCR_SUMMARY)
    assert parsed["candidate"] == "qwen35_4b_stock"
    assert (parsed["overall"], parsed["ci95"]) == (41.2, 1.3)
    assert parsed["test_types"]["table"] == {"score": 84.4, "n_tests": 1020}
    assert set(parsed["test_types"]) == {"absent", "baseline", "math", "order",
                                         "present", "table"}
    assert parsed["by_file"]["arxiv_math.jsonl"] == {"score": 75.4, "passed": 2206,
                                                     "total": 2927}
    assert parsed["by_file"]["baseline"]["total"] == 1394
    with pytest.raises(RuntimeError, match="Final Summary"):
        xb.parse_olmocr_summary("no summary here")


def test_omnidoc_composite_and_slices():
    sliced = xb.omnidoc_slices(OMNIDOC_METRIC)
    assert sliced["overall"] == pytest.approx((0.8 + 0.7 + 0.9) / 3 * 100, abs=1e-4)
    assert sliced["table_teds"] == 0.7
    assert sliced["reading_order_edit"] == 0.25
    assert sliced["slices"]["text_block"]["group"]["Edit_dist"] == {
        "text_language: text_english": 0.1}
    no_cdm = {**OMNIDOC_METRIC,
              "display_formula": {"all": {"Edit_dist": {"ALL_page_avg": 0.5}}}}
    assert xb.omnidoc_slices(no_cdm)["overall"] is None


def test_default_bridge_is_a_frozen_snapshot_not_the_live_arm_dir():
    # the training app rewrites phaseb/<arm>/bridge.safetensors at every val
    # improvement; a benchmark must be served a snapshot that cannot move
    assert xb.DEFAULT_BRIDGE_PATH.endswith("_ep1/bridge.safetensors")
    assert xb.DEFAULT_REPAIRED_ARM == "repaired_ep1"


def test_delta_tree_only_crosses_matching_numeric_leaves():
    stock = {"a": 1.0, "b": {"c": 2, "d": "x"}, "e": True, "only_stock": 1.0}
    repaired = {"a": 1.5, "b": {"c": 5, "d": "y"}, "e": False, "only_rep": 2.0}
    assert xb.delta_tree(stock, repaired) == {"a": 0.5, "b": {"c": 3.0}}
    assert xb.delta_tree({"a": "x"}, {"a": "y"}) is None


def test_launch_commands_cover_both_arms_and_only_override_supported_apps():
    cmds = xb.launch_commands("stock_dir", "rep_dir")
    assert len(cmds) == 2 * len(xb.BENCHES)
    assert cmds[0] == ("BENCH_APP=bench-olmocr-stock modal run --detach bench_olmocr.py "
                       "--model /models/hf_exports/stock_dir")
    assert all("--model /models/hf_exports/rep_dir" in c for c in cmds[1::2])
    assert not any(c.startswith("BENCH_APP=") for c in cmds if "bench_pulse.py" in c)


def test_assemble_bundle_and_tables_keep_every_slice():
    reports = {
        arm: {
            "olmocr": {"found": True, "path": f"/r/{arm}", "n_predictions": 1403,
                       "payload": OLMOCR_SUMMARY.replace("41.2", score)},
            "omnidoc": {"found": True, "path": f"/o/{arm}", "n_predictions": 1651,
                        "payload": OMNIDOC_METRIC},
            "pulse": {"found": False, "path": f"/p/{arm}", "payload": None},
        }
        for arm, score in (("stock", "41.2"), ("repaired_ep1", "45.7"))
    }
    bundle = xb.assemble_bundle(reports, {"bridge_weights": "/vol/b.safetensors"})
    assert bundle["arms"] == {"stock": "stock", "repaired": "repaired_ep1"}
    assert bundle["stock"]["pulse"] == {"status": "missing", "path": "/p/stock"}
    assert bundle["delta"]["olmocr"]["overall"] == pytest.approx(4.5)
    assert bundle["delta"]["omnidoc"]["table_teds"] == 0.0
    assert "pulse" not in bundle["delta"]
    assert bundle["config"]["bridge_weights"] == "/vol/b.safetensors"

    md = xb.markdown_tables(bundle)
    assert "| slice | stock | repaired_ep1 | Δ |" in md
    assert "| **overall** (macro over jsonls) | 41.2 | 45.7 | +4.5 |" in md
    assert "| table (n=1020) | 84.4 | 84.4 | +0.0 |" in md
    assert "| table_teds | 0.7000 | 0.7000 | +0.0000 |" in md
    assert "PulseBench-Tab" not in md


def test_olmocr_universe_adds_one_baseline_per_uncovered_pdf():
    universe = xb.olmocr_universe(ITEM_ROWS)
    # tables/a.pdf already carries its own baseline test; b and c get generated ones
    assert set(universe) == {"t_table_00", "t_base", "t_table_01", "h_absent_00",
                             "tables/b.pdf_baseline", "headers_footers/c.pdf_baseline"}
    assert universe["tables/b.pdf_baseline"] == {"type": "baseline",
                                                 "source_file": xb.BASELINE_FILE,
                                                 "pdf": "tables/b.pdf"}
    assert universe["t_base"]["source_file"] == "table_tests.jsonl"


def test_item_confusion_partitions_and_checks_against_the_scorer_tables():
    universe = xb.olmocr_universe(ITEM_ROWS)
    conf = xb.item_confusion(universe, {"t_table_00", "h_absent_00"},
                             {"t_table_01", "h_absent_00"})
    assert conf["overall"] == {"n": 6, "pass_pass": 3, "pass_fail": 1, "fail_pass": 1,
                               "fail_fail": 1, "net": 0, "stock_pass_pct": 66.7,
                               "repaired_pass_pct": 66.7}
    assert conf["by_test_type"]["table"]["pass_fail"] == 1
    assert conf["by_test_type"]["table"]["fail_pass"] == 1
    assert conf["by_source_file"][xb.BASELINE_FILE]["n"] == 2
    with pytest.raises(RuntimeError, match="outside the universe"):
        xb.item_confusion(universe, {"ghost"}, set())

    summary = {"by_file": {"table_tests.jsonl": {"passed": 2, "total": 3}},
               "test_types": {"table": {"score": 50.0, "n_tests": 2}}}
    same = xb.item_confusion(universe, {"t_table_00"}, {"t_table_00"})
    assert xb.confusion_matches_summary(same, summary) == {
        "by_file/table_tests.jsonl": True, "by_type/table": True}
    assert not any(xb.confusion_matches_summary(
        xb.item_confusion(universe, set(), set()), summary).values())


def test_olmocr_failure_reasons_reads_the_fail_log():
    reasons = xb.olmocr_failure_reasons(
        "  [FAIL] Test 4_pg451_equation_05 on old_scans_math/4_pg451 page 1 average pass "
        "ratio: 0.000 (0/1 repeats passed). Ex: No match found for x=1 anywhere in "
        "content\n"
        "  [FAIL] Test tables/a.pdf_baseline on tables/a page 1 average pass ratio: "
        "0.000 (0/1 repeats passed). Ex: Text ends with 6636 repeating 2-grams, invalid\n"
        "qwen35_4b_stock      : Average Score: 41.2% ± 1.3%\n")
    assert reasons == {
        "4_pg451_equation_05": "No match found for x=1 anywhere in content",
        "tables/a.pdf_baseline": "Text ends with 6636 repeating 2-grams, invalid"}


def test_repetition_fraction_separates_prose_from_a_loop():
    prose = " ".join(f"w{i}" for i in range(400))
    assert xb.repetition_fraction(prose) == (0.0, pytest.approx(1 / 391, abs=1e-6))
    # a 9-word loop: nearly every 10-gram is a duplicate, but no single one holds
    # more than 1/9 of them — the duplicate share is the flag, not the top gram
    duplicate, top = xb.repetition_fraction("the same phrase over and over again "
                                            "forever more " * 60)
    assert duplicate > 0.9 and top < 0.2
    assert xb.repetition_fraction("short text") == (0.0, 0.0)
    # no-space scripts fall back to character grams instead of scoring one giant token
    assert xb.repetition_fraction("表格数据行" * 40)[0] > 0.9


def test_failure_kind_puts_page_pathology_before_the_scorer_reason():
    reason = "No match found for x=1 anywhere in content"
    assert xb.failure_kind(reason, "   ", 0.0, False) == "empty_output"
    assert xb.failure_kind(reason, "text", 0.5, False) == "repetition"
    assert xb.failure_kind(reason, "text", 0.0, True) == "truncated_at_cap"
    assert xb.failure_kind(reason, "I'm sorry, I cannot", 0.0, False) == "refusal"
    assert xb.failure_kind(reason, "text", 0.0, False) == "math_not_found"
    assert xb.failure_kind("No tables found in the content", "t", 0.0, False) \
        == "table_dropped"
    assert xb.failure_kind("Expected 'x' with threshold 0.99 but best match ratio was "
                           "0.910", "t", 0.0, False) == "text_partial"
    assert xb.failure_kind("Expected 'x' with threshold 0.99 but best match ratio was "
                           "0.130", "t", 0.0, False) == "text_not_found"
    assert xb.failure_kind("Could not find a location where 'x' fits", "t", 0.0, False) \
        == "order_anchor_missing"
    assert xb.failure_kind("Text contains disallowed characters ['的']", "t", 0.0, False) \
        == "disallowed_characters"
    assert xb.failure_kind("something new", "t", 0.0, False) == "other"


def test_transitions_and_sampling_are_deterministic():
    universe = xb.olmocr_universe(ITEM_ROWS)
    stock, repaired = {"t_table_00"}, {"t_table_00", "t_table_01"}
    assert xb.transition_ids(universe, stock, repaired, "pass_fail") == ["t_table_01"]
    assert xb.transition_ids(universe, stock, repaired, "fail_fail") == ["t_table_00"]
    ids = xb.transition_ids(universe, stock, repaired, "pass_pass")
    assert xb.stratified_sample(ids, universe, 2, seed=0) == \
        xb.stratified_sample(ids, universe, 2, seed=0)
    assert len(xb.stratified_sample(ids, universe, 2, seed=0)) <= 2


def test_degeneration_stats_and_clip():
    records = [{"chars": 0, "tokens": 0, "repetition": 0.0, "top_gram": 0.0,
                "table_markup": False, "emphasis_per_1k": 0.0},
               {"chars": 40, "tokens": 8100, "repetition": 0.9, "top_gram": 0.1,
                "table_markup": True, "emphasis_per_1k": 4.0},
               {"chars": 40, "tokens": 10, "repetition": 0.0, "top_gram": 0.0,
                "table_markup": False, "emphasis_per_1k": 0.0},
               {"chars": 80, "tokens": 20, "repetition": 0.0, "top_gram": 0.0,
                "table_markup": False, "emphasis_per_1k": 0.0}]
    stats = xb.degeneration_stats(records, cap=8192)
    assert (stats["n"], stats["empty"], stats["at_cap"]) == (4, 1, 1)
    assert stats["repetition_ge_floor"] == 1
    assert stats["repetition_ge"]["0.9"] == 1 and stats["repetition_ge"]["0.05"] == 1
    assert stats["with_table_markup"] == 1
    assert stats["mean_emphasis_per_1k"] == 1.0
    assert stats["mean_chars"] == 40.0
    assert xb.clip("abc", 2, 1) == "abc"
    clipped = xb.clip("x" * 100, 10, 5)
    assert clipped.startswith("x" * 10) and "85 chars omitted" in clipped


def test_table_markup_counts_both_forms_the_benches_keep():
    assert xb.has_table_markup("<table><tr><td>1</td></tr></table>")
    assert xb.has_table_markup("intro\n| a | b |\n|---|---|\n| 1 | 2 |\n")
    assert not xb.has_table_markup("plain prose with a | pipe mid-line and no row")


def test_contains_ratio_separates_omitted_from_garbled():
    gold = "Journal of Applied Mathematics, Vol. 12"
    assert xb.contains_ratio(gold, "no header here at all, only body text") < 0.6
    assert xb.contains_ratio(gold, "x " + gold + " y") == 1.0
    assert 0.6 < xb.contains_ratio(gold, "Joumal of Apphed Mathernatics, Vol. l2") < 1.0
    assert xb.contains_ratio("", "text") == 0.0


def test_emphasis_and_scorer_threshold_readback():
    assert xb.strip_emphasis("**Red** *Cross* ~~will~~ `live`") == "Red Cross will live"
    assert xb.emphasis_rate("*" * 4 + "a" * 996) == pytest.approx(1.0)
    assert xb.emphasis_rate("") == 0.0
    reason = ("Expected 'Kofoid, E....' with threshold 0.9905660377358491 but best "
              "match ratio was 0.467")
    assert xb.scorer_ratio_and_threshold(reason) == (0.9905660377358491, 0.467)
    assert xb.scorer_ratio_and_threshold("No tables found in the content") is None
