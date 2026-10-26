"""Publish this reviewed checkout using an existing Git Credential Manager account.

No token is written to disk or printed. Repository identity is retained in the
ignored tmp directory to make retries idempotent.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner", required=True)
    args = parser.parse_args()
    env = {**os.environ, "GCM_INTERACTIVE": "never", "GIT_TERMINAL_PROMPT": "0"}
    credential = subprocess.run(["git", "-c", "credential.interactive=never", "credential", "fill"], input=f"protocol=https\nhost=github.com\nusername={args.owner}\n\n", text=True, capture_output=True, env=env, check=True)
    values = dict(line.split("=", 1) for line in credential.stdout.splitlines() if "=" in line)
    token = values.get("password")
    if not token:
        raise SystemExit("Existing GitHub credential unavailable; no login was requested.")

    def api(path, body=None):
        request = urllib.request.Request("https://api.github.com"+path, data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": "Bearer "+token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "VentusDelivery", "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)

    user = api("/user")
    if user["login"].lower() != args.owner.lower():
        raise SystemExit("Credential owner mismatch")
    state_path = ROOT/"tmp"/"repository.json"
    if state_path.exists():
        repo = json.loads(state_path.read_text())
        if repo["owner"]["login"].lower() != args.owner.lower():
            raise SystemExit("Repository state belongs to a different account")
    else:
        name_path = ROOT/"tmp"/"repository-name.txt"
        name = name_path.read_text().strip() if name_path.exists() else "r-"+secrets.token_hex(5)
        name_path.write_text(name)
        try:
            repo = api("/repos/"+args.owner+"/"+name)
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            repo = api("/user/repos", {"name": name, "description": "Historical wind forecast decision support · React and Python", "private": False, "auto_init": False})
        state_path.write_text(json.dumps(repo, indent=2))
    delivery_path = ROOT/"docs"/"DELIVERY.md"
    content = delivery_path.read_text(encoding="utf-8")
    content = content.replace("Public repository: publication in progress; final URL will be recorded here.", "Public repository: "+repo["html_url"])
    delivery_path.write_text(content, encoding="utf-8")
    def git(*command):
        subprocess.run(["git", *command], cwd=ROOT, env=env, check=True)
    if not (ROOT/".git").exists():
        git("init", "-b", "main")
        git("config", "user.name", user["login"])
        git("config", "user.email", f'{user["id"]}+{user["login"]}@users.noreply.github.com')
        git("config", "credential.https://github.com.username", user["login"])
        git("remote", "add", "origin", repo["clone_url"])
    git("add", ".")
    changed = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode
    if changed:
        git("commit", "-m", "Implement historical wind forecast decision support")
    git("push", "-u", "origin", "main")
    print(json.dumps({"repository": repo["html_url"], "public": not repo["private"]}))


if __name__ == "__main__":
    main()
