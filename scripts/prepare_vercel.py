"""Build a portable Vercel Build Output directory on Windows.

Run after npm run build. Downloads Linux Python wheels, not Windows binaries.
Uses the handler emitted by the official Vercel Python builder.
"""
from pathlib import Path
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    stage = ROOT/"tmp"/"vercel-prebuilt"
    output = stage/".vercel"/"output"
    function = output/"functions"/"api"/"index.func"
    function.mkdir(parents=True, exist_ok=True)
    wrapper = ROOT/".vercel"/"output"/"functions"/"api"/"index.py.func"/"vc__handler__python.py"
    if not wrapper.exists():
        raise SystemExit("Run the official @vercel/python builder once to generate its supported handler before this Windows workaround.")
    shutil.copy2(wrapper, function/"vc__handler__python.py")
    shutil.copytree(ROOT/"backend"/"app", function/"backend"/"app", ignore=shutil.ignore_patterns("__pycache__"), dirs_exist_ok=True)
    shutil.copy2(ROOT/"backend"/"__init__.py", function/"backend"/"__init__.py")
    (function/"api").mkdir(exist_ok=True)
    shutil.copy2(ROOT/"api"/"index.py", function/"api"/"index.py")
    (function/"data").mkdir(exist_ok=True)
    for name in ("snapshot.json", "manifest.json"):
        shutil.copy2(ROOT/"data"/name, function/"data"/name)
    subprocess.run([sys.executable, "-m", "uv", "pip", "install", "--python-version", "3.12", "--python-platform", "x86_64-manylinux2014", "--only-binary", ":all:", "--target", str(function/"_vendor"), "-r", str(ROOT/"requirements.txt"), "vercel-runtime==0.24.1"], check=True)
    config = {"handler": "vc__handler__python.vc_handler", "runtime": "python3.12", "architecture": "x86_64", "environment": {"PYTHONPATH": "_vendor", "PYTHONDONTWRITEBYTECODE": "1"}, "supportsResponseStreaming": True}
    (function/".vc-config.json").write_text(json.dumps(config, indent=2))
    shutil.copytree(ROOT/"dist", output/"static", dirs_exist_ok=True)
    (output/"config.json").write_text(json.dumps({"version": 3, "routes": [{"src": "/api/(.*)", "dest": "/api/index"}, {"handle": "filesystem"}, {"src": "/.*", "dest": "/index.html"}]}, indent=2))
    # The official handler module resolves its entrypoint at runtime; ensure the
    # staged package contains the source and Linux extension modules it needs.
    extensions = list((function/"_vendor").rglob("*.so"))
    if not extensions or any((function/"_vendor").rglob("*.pyd")):
        raise SystemExit("Expected Linux wheels only in the deployment package")
    print(f"Prepared {stage}; {len(extensions)} Linux extensions; no source credentials included.")


if __name__ == "__main__":
    main()
