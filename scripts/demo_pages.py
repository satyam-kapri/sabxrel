"""Prepare local technical-review pages and speech text from the checked-in script."""
from pathlib import Path
import html
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/"output"/"demo"
OUT.mkdir(parents=True, exist_ok=True)
text = (ROOT/"docs"/"DEMO_SCRIPT.md").read_text(encoding="utf-8")
segments = []
for heading, body in re.findall(r"### (\d{2}[^\n]*)\n\n(.*?)(?=\n##|\n###|\Z)", text, re.S):
    segments.append({"number": heading[:2], "title": heading[5:].strip(), "text": body.strip()})
(OUT/"segments.json").write_text(json.dumps(segments, indent=2), encoding="utf-8")

CSS = """body{margin:0;background:#102e29;color:#dce8db;font-family:Arial,sans-serif;padding:55px 70px;box-sizing:border-box}*{box-sizing:border-box}.kicker{color:#91c3a9;font-size:13px;letter-spacing:3px}h1{font-size:38px;letter-spacing:-1px;margin:16px 0 32px;font-weight:500}.flow{display:flex;align-items:center;gap:18px;margin:45px 0}.node{background:#1f4639;padding:28px 24px;border:1px solid #41604d;border-radius:8px;flex:1}.node b{display:block;font-size:20px;margin-bottom:14px}.node small{color:#9eb49e;line-height:1.8;font-size:14px}.arrow{color:#99c09f;font-size:30px}p{font-size:17px;color:#a4b9a2;line-height:1.9;max-width:1100px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:45px}h2{font-weight:500;font-size:23px;margin-top:28px}pre{background:#193e33;border:1px solid #345943;border-radius:8px;padding:24px;line-height:1.8;font-size:15px;white-space:pre-wrap;color:#b8dbbd}ul{padding-left:20px}li{font-size:17px;margin:18px 0;color:#b7cbb1;line-height:1.7}.footer{position:fixed;bottom:25px;left:70px;color:#779b85;font-size:11px;letter-spacing:2px}.badge{display:inline-block;background:#2e6044;color:#c3e6b7;padding:9px 14px;border-radius:5px;font-size:13px}.number{font-size:46px;color:#b6ddb1;font-weight:500}code{color:#c7e5c1}"""
def page(name, title, body):
    (OUT/f"{name}.html").write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><title>Ventus · {html.escape(title)}</title><style>{CSS}</style><body><div class="kicker">VENTUS / TECHNICAL REVIEW</div><h1>{title}</h1>{body}<div class="footer">REACT + PYTHON · REPRODUCIBLE HISTORICAL ANALYSIS</div></body></html>', encoding="utf-8")

page("architecture", "A small architecture, with explicit boundaries.", '<div class="flow"><div class="node"><b>Elexon APIs</b><small>WINDFOR publications<br>FUELHH · WIND actuals</small></div><span class="arrow">→</span><div class="node"><b>Validated snapshot</b><small>Source history + manifest<br>SHA-256 integrity check</small></div><span class="arrow">→</span><div class="node"><b>Python / FastAPI</b><small>Decision-time selection<br>Alignment + metrics</small></div><span class="arrow">→</span><div class="node"><b>React / TypeScript</b><small>Decision replay<br>Accuracy + provenance</small></div></div><div class="columns"><div><h2>Ingest once. Reproduce consistently.</h2><p>Bounded requests, finite timeouts, explicit date windows, retained publications, and source metadata.</p></div><div><h2>Keep the critical rules testable.</h2><p>Pure domain functions do not depend on HTTP, browser state, or live upstream availability.</p></div></div>')
domain = (ROOT/"backend"/"app"/"domain.py").read_text()
start = domain.index('        for target in delivery_grid(decision):')
end = domain.index('            rows.append({', start)
snippet = domain[start:end]
page("selection", "The publication cutoff is enforced in one place.", '<pre>'+html.escape(snippet)+'</pre><div class="columns"><div><h2>No future revisions</h2><p>Publication timestamps remain attached to every selected forecast. A missing eligible forecast stays missing.</p></div><div><h2>One hourly comparison</h2><p>Both actual half-hours are required. Error = forecast − actual. Full-grid coverage is reported separately.</p></div></div>')
page("verification", "Verification that targets the failure modes.", '<span class="badge">GITHUB ACTIONS · PASSED</span><div class="columns"><div><h2><span class="number">44</span> backend tests</h2><ul><li>Exact cutoff and future-revision exclusion</li><li>Missing / zero actuals and conflicting revisions</li><li>Independent metric arithmetic and pooled RMSE</li><li>Month boundaries, DST, schema and checksum</li></ul></div><div><h2><span class="number">6</span> frontend workflows</h2><ul><li>Delivery dates and full forecast timestamps</li><li>Unavailable data, no fabricated values, and retry</li><li>Accuracy cohort drill-down and February boundary</li><li>Additional browser checks of actual chart rendering</li></ul></div></div><p>Ubuntu CI passed: tests → TypeScript production build → Docker image → running-container smoke test.</p>')
page("delivery", "A reproducible application, ready for review.", '<div class="columns"><div><h2>Local and CI verified</h2><pre>docker compose up --build\n\npython -m pytest backend/tests -q\nnpm test\nnpm run build</pre><p>Multi-stage build · non-root Python runtime<br>Dataset-aware health check · read-only historical data</p></div><div><h2>Delivery status</h2><ul><li>Anonymous-name public GitHub repository published</li><li>Docker build and runtime smoke test passed in CI</li><li>AI disclosure, source licence, architecture, and startup guide included</li><li>Temporary Vercel preview blocked by edge HTTP 403</li><li>Durable hosting and unlisted YouTube upload still outstanding</li></ul></div></div>')
print(f"Prepared {len(segments)} narration segments and four technical pages.")
