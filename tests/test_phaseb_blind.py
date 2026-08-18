"""Blind control (--no-image): variant parsing, output-dir disjointness from
the sighted eval, the message/pixel contract, and the sighted-blind gain."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "pipelines"))

import modal_phaseb_train as pb  # noqa: E402

PROMPT = "Convert this document page to markdown."


def test_blind_variants_parse_dedupe_and_reject():
    assert pb.blind_variants("") == []
    assert pb.blind_variants("all") == list(pb.BLIND_VARIANTS)
    assert pb.blind_variants("blank") == ["blank"]
    # order follows BLIND_VARIANTS, not the spec, and repeats collapse
    assert pb.blind_variants("blank,withheld") == ["withheld", "blank"]
    assert pb.blind_variants(" blank , blank ") == ["blank"]
    for bad in ("noimage", "withheld,nope", "sighted"):
        with pytest.raises(ValueError):
            pb.blind_variants(bad)


def test_check_blind_allows_sighted_only_as_empty():
    assert pb.check_blind("") == ""
    for v in pb.BLIND_VARIANTS:
        assert pb.check_blind(v) == v
    with pytest.raises(ValueError, match="--no-image"):
        pb.check_blind("blind")


def test_blind_dirs_never_collide_with_sighted_eval():
    cases = [("A", 1e-4), ("B", 3e-4), ("C", 0.0), ("R4a", 1.0), ("R5b", "5k_ep1")]
    sighted = {pb.eval_dir(a, k) for a, k in cases}
    assert sighted == {f"phaseb/eval/{pb.arm_label(a, k)}" for a, k in cases}
    seen = set(sighted)
    for variant in pb.BLIND_VARIANTS:
        dirs = {pb.eval_dir(a, k, blind=variant) for a, k in cases}
        assert all(d.startswith(f"phaseb/{pb.BLIND_ROOT}/") for d in dirs)
        assert all(d.endswith(f"__{variant}") for d in dirs)
        assert not dirs & seen
        seen |= dirs
    # smoke artifacts stay under their own root in both modes
    assert pb.eval_dir("A", 1e-4, smoke=True) == "phaseb/smoke/eval/A"
    assert (pb.eval_dir("A", 1e-4, blind="blank", smoke=True)
            == f"phaseb/smoke/{pb.BLIND_ROOT}/A__blank")
    with pytest.raises(ValueError):
        pb.eval_dir("A", 1e-4, blind="nope")


def test_eval_label_suffixes_the_arm_label():
    assert pb.eval_label("C", 0.0) == "C"
    assert pb.eval_label("C", 0.0, "withheld") == "C__withheld"
    assert pb.eval_label("R5b", "5k_ep1", "blank") == "R5b_5k_ep1__blank"


def test_blind_messages_hold_the_prompt_fixed():
    sighted = pb.blind_messages(PROMPT)
    blank = pb.blind_messages(PROMPT, "blank")
    withheld = pb.blind_messages(PROMPT, "withheld")
    # blank keeps the image-token span: same message list as sighted
    assert blank == sighted
    assert sighted == [{"role": "user", "content": [
        {"type": "image"}, {"type": "text", "text": PROMPT}]}]
    # withheld drops the image part entirely
    assert withheld == [{"role": "user", "content": [{"type": "text", "text": PROMPT}]}]
    # the prompt string is byte-identical in every variant
    for msgs in (sighted, blank, withheld):
        texts = [p["text"] for p in msgs[0]["content"] if p["type"] == "text"]
        assert texts == [PROMPT]
    with pytest.raises(ValueError):
        pb.blind_messages(PROMPT, "nope")


def test_blind_image_is_a_same_size_white_page():
    from PIL import Image

    page = Image.new("RGB", (137, 61), (12, 34, 56))
    assert pb.blind_image(page) is page
    blank = pb.blind_image(page, "blank")
    assert blank.size == page.size and blank.mode == page.mode
    assert blank.getextrema() == ((255, 255), (255, 255), (255, 255))
    assert blank is not page
    with pytest.raises(ValueError, match="withheld"):
        pb.blind_image(page, "withheld")


def _scores(values: dict[str, float], content: dict[str, float] | None = None):
    fams = {"d0": "text", "d1": "text", "d2": "tables", "d3": "charts"}
    out = {}
    for k, v in values.items():
        rec = {"image_id": k, "family": fams[k], "score": v}
        if content is not None and k in content:
            rec["content_edit_sim"] = content[k]
        out[k] = rec
    return out


def test_gain_block_is_paired_per_metric_and_family():
    sighted = _scores({"d0": 0.9, "d1": 0.7, "d2": 0.5, "d3": 0.4},
                      {"d0": 0.95, "d1": 0.75, "d2": 0.55})
    blind = _scores({"d0": 0.3, "d1": 0.2, "d2": 0.1, "d3": 0.2},
                    {"d0": 0.35, "d1": 0.25, "d2": 0.15})
    g = pb.gain_block(sighted, blind)
    assert set(g) == {"score", "content_edit_sim"}
    assert g["score"]["overall"]["n_docs"] == 4
    assert g["score"]["overall"]["mean_diff"] == pytest.approx(0.425)
    assert set(g["score"]["families"]) == {"text", "tables", "charts"}
    assert g["score"]["families"]["text"]["mean_diff"] == pytest.approx(0.55)
    # content_edit_sim pairs only docs carrying the field in BOTH arms
    assert g["content_edit_sim"]["overall"]["n_docs"] == 3
    assert set(g["content_edit_sim"]["families"]) == {"text", "tables"}
    assert g["content_edit_sim"]["overall"]["mean_diff"] == pytest.approx(0.5)


def _summary(overall: float, fam: dict[str, float], content: float | None = None):
    s = {
        "overall": {"mean": overall, "n": 3},
        "families": {f: {"mean": v, "n": 1} for f, v in fam.items()},
    }
    if content is not None:
        s["content_edit_sim"] = {"mean": content, "n": 2}
        for f in ("text", "tables"):
            if f in s["families"]:
                s["families"][f]["content_edit_sim"] = {"mean": content, "n": 1}
    return s


def test_summary_mean_reads_both_metrics_and_reports_absent_slices():
    s = _summary(0.6, {"text": 0.8, "charts": 0.2}, content=0.9)
    assert pb.summary_mean(s, "overall", "score") == 0.6
    assert pb.summary_mean(s, "text", "score") == 0.8
    assert pb.summary_mean(s, "overall", "content_edit_sim") == 0.9
    assert pb.summary_mean(s, "text", "content_edit_sim") == 0.9
    # charts carry no gold markdown -> no content readout; absent family -> None
    assert pb.summary_mean(s, "charts", "content_edit_sim") is None
    assert pb.summary_mean(s, "math", "score") is None


def test_blind_table_covers_every_arm_slice_and_variant():
    sighted = _scores({"d0": 0.9, "d1": 0.7, "d2": 0.5}, {"d0": 0.95, "d1": 0.75})
    blind = _scores({"d0": 0.3, "d1": 0.2, "d2": 0.1}, {"d0": 0.35, "d1": 0.25})
    bundle = {
        "variants": ["withheld", "blank"],
        "arms": {
            "A": {
                "sighted": {"summary": _summary(0.7, {"text": 0.8, "tables": 0.5}, 0.85)},
                "withheld": {"summary": _summary(0.2, {"text": 0.25, "tables": 0.1}, 0.3),
                             "gain": pb.gain_block(sighted, blind)},
                "blank": {"summary": _summary(0.25, {"text": 0.3, "tables": 0.15}, 0.35),
                          "gain": pb.gain_block(sighted, blind)},
            },
        },
    }
    table = pb.blind_table(bundle, "score")
    lines = table.splitlines()
    assert lines[0].startswith("| arm | slice | sighted |")
    assert "gain vs withheld [95% CI]" in lines[0] and "gain vs blank [95% CI]" in lines[0]
    # header + rule + (overall, tables, text) — FAMILY_ORDER order, not insertion
    assert len(lines) == 5
    assert [ln.split("|")[2].strip() for ln in lines[2:]] == ["overall", "tables", "text"]
    assert "0.7000" in lines[2] and "+0.5000" in lines[2]
    # charts have no content readout, so the content table prints em dashes
    content = pb.blind_table(bundle, "content_edit_sim")
    assert content.splitlines()[0] == lines[0]
    assert "0.8500" in content.splitlines()[2]
