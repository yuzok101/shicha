#!/usr/bin/env python3
"""Push tavlin-v79 working tree to GitHub branch tavlin-v79-fab-fix via Git Data API.
Two commits on top of tavlin-htr-integration-20260928 tip:
  1) v78 production baseline (full tree)
  2) v79 FAB glass fix (changed files only)
"""
import base64, json, os, sys, urllib.request, urllib.error

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_response_body

ALLOWED = ("api.github.com",)
CRED = "custom.github"
REPO = "yuzok101/shicha"
BASE_BRANCH = "tavlin-htr-integration-20260928"
NEW_BRANCH = "tavlin-v79-fab-fix"
WORKDIR = "/home/hatch/workspace/tavlin-v79"

CHANGED_V79 = [
    "public/2-style.css",
    "public/3-app.js",
    "public/6-sw.js",
    "public/index.html",
    "deploy-v79.py",
]

def api(method, path, payload=None, timeout=600):
    url = "https://api.github.com" + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", "muse-github-skill/1.0")
    if data: req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, CRED, allowed_hosts=ALLOWED)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(read_response_body(resp).decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {e.read().decode()[:2000]}")

def blob_for(path):
    with open(os.path.join(WORKDIR, path), "rb") as f:
        raw = f.read()
    try:
        txt = raw.decode("utf-8")
        b = api("POST", f"/repos/{REPO}/git/blobs", {"content": txt, "encoding": "utf-8"}, timeout=300)
    except (UnicodeDecodeError, RuntimeError):
        b64 = base64.b64encode(raw).decode("ascii")
        b = api("POST", f"/repos/{REPO}/git/blobs", {"content": b64, "encoding": "base64"}, timeout=900)
    return b["sha"], len(raw)

def all_files():
    out = []
    for root, dirs, names in os.walk(WORKDIR):
        dirs[:] = [d for d in dirs if d != ".git"]
        for n in sorted(names):
            fp = os.path.join(root, n)
            out.append(os.path.relpath(fp, WORKDIR).replace(os.sep, "/"))
    return sorted(out)

def main():
    print("base ref...", flush=True)
    base_sha = api("GET", f"/repos/{REPO}/git/refs/heads/{BASE_BRANCH}")["object"]["sha"]
    print(" base:", base_sha[:12], flush=True)

    files = all_files()
    print(f"{len(files)} files; creating blobs for baseline...", flush=True)
    tree_entries = []
    for i, p in enumerate(files):
        sha, size = blob_for(p)
        tree_entries.append({"path": p, "mode": "100644", "type": "blob", "sha": sha})
        if (i + 1) % 10 == 0: print(f"  {i+1}/{len(files)}", flush=True)
    print(" creating baseline tree...", flush=True)
    tree = api("POST", f"/repos/{REPO}/git/trees", {"tree": tree_entries}, timeout=300)
    print(" creating baseline commit...", flush=True)
    c1 = api("POST", f"/repos/{REPO}/git/commits", {
        "message": "v78 production baseline (deployed 2026-10-04 via wrangler; AI, chat, fridge scan, voice, mascot FAB)",
        "tree": tree["sha"], "parents": [base_sha]})
    print(" c1:", c1["sha"][:12], flush=True)

    print(" blobs for v79 changes...", flush=True)
    entries2 = []
    for p in CHANGED_V79:
        sha, size = blob_for(p)
        entries2.append({"path": p, "mode": "100644", "type": "blob", "sha": sha})
        print(f"  {p} ({size}b)", flush=True)
    print(" creating v79 tree...", flush=True)
    t2 = api("POST", f"/repos/{REPO}/git/trees", {"base_tree": tree["sha"], "tree": entries2}, timeout=300)
    print(" creating v79 commit...", flush=True)
    c2 = api("POST", f"/repos/{REPO}/git/commits", {
        "message": "v79: FAB glass fix — 112px, white 40% glass + blur(16px), versioned mascot URLs (?v=79), preload, SW cache v79",
        "tree": t2["sha"], "parents": [c1["sha"]]})
    print(" c2:", c2["sha"][:12], flush=True)

    print(" creating branch ref...", flush=True)
    api("POST", f"/repos/{REPO}/git/refs", {"ref": f"refs/heads/{NEW_BRANCH}", "sha": c2["sha"]})
    print(f"OK: branch {NEW_BRANCH} -> {c2['sha']}")

if __name__ == "__main__":
    main()
