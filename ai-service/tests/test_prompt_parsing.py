from utils.llm_output_guardrails import safe_json_parser


def test_safe_json_parser_strict_json():
    raw = '{"reasoning_summary":"ok","strengths":[],"weaknesses":[],"recommendation":"Maybe","llm_confidence_score":50}'
    parsed = safe_json_parser(raw)
    assert parsed.ok is True
    assert parsed.data["recommendation"] == "Maybe"


def test_safe_json_parser_markdown_fences():
    raw = """```json
{"a": 1}
```"""
    parsed = safe_json_parser(raw)
    assert parsed.ok is True
    assert parsed.data == {"a": 1}


def test_safe_json_parser_extracts_first_object():
    raw = "NOTE: here is JSON:\n{ \"a\": 1, \"b\": 2 }\nThanks!"
    parsed = safe_json_parser(raw)
    assert parsed.ok is True
    assert parsed.data["b"] == 2

