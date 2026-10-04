#!/usr/bin/env python3
"""Deploy Tavlin to Cloudflare Workers: assets via upload-session flow, then script."""
import base64, hashlib, json, mimetypes, os, sys, urllib.request, urllib.error
sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response, read_response_body

CRED = "custom.cloudflare"
HOSTS = ["api.cloudflare.com"]
ACCT = "c7ad7d26d4cc7bc59aaf0c82d54bd641"
WORKER = "tavlin"
DB_ID = "4fef9627-4d9a-458f-b819-46c59a824ac7"
BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}"
PUBLIC = "/home/hatch/workspace/tavlin-v79/public"
WORKER_JS = "/home/hatch/workspace/tavlin-v79/worker.js"

def api_req(method, path, body=None, ctype="application/json", bearer_jwt=None):
    req = urllib.request.Request(BASE + path, method=method)
    if bearer_jwt:
        req.add_header("Authorization", f"Bearer {bearer_jwt}")
    else:
        add_surrogate_to_request(req, CRED, allowed_hosts=HOSTS)
    if body is not None:
        req.data = body if isinstance(body, bytes) else json.dumps(body).encode()
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return read_json_response(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"API {method} {path} -> HTTP {e.code}: {e.read().decode()[:800]}")

def file_hash(content: bytes, ext: str) -> str:
    return hashlib.sha256(base64.b64encode(content).decode().encode() + ext.encode()).hexdigest()[:32]

def build_manifest():
    manifest, files = {}, {}
    for root, _, names in os.walk(PUBLIC):
        for n in sorted(names):
            fp = os.path.join(root, n)
            rel = "/" + os.path.relpath(fp, PUBLIC).replace(os.sep, "/")
            content = open(fp, "rb").read()
            ext = os.path.splitext(n)[1][1:]
            h = file_hash(content, ext)
            manifest[rel] = {"hash": h, "size": len(content)}
            files[h] = (rel, content)
    return manifest, files

def multipart(parts):
    # parts: list of (name, filename_or_None, content_type, bytes)
    boundary = "----tavlindeploy" + hashlib.sha256(os.urandom(16)).hexdigest()[:16]
    body = b""
    for name, filename, ctype, data in parts:
        body += f"--{boundary}\r\n".encode()
        disp = f'Content-Disposition: form-data; name="{name}"'
        if filename: disp += f'; filename="{filename}"'
        body += disp.encode() + b"\r\n"
        body += f"Content-Type: {ctype}\r\n\r\n".encode() + data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"

def main():
    manifest, files = build_manifest()
    print(f"manifest: {len(manifest)} files")
    # 1. upload session
    s = api_req("POST", f"/workers/scripts/{WORKER}/assets-upload-session", {"manifest": manifest})
    jwt, buckets = s["result"]["jwt"], s["result"]["buckets"]
    print(f"session ok, buckets: {len(buckets)}")
    # 2. upload buckets
    completion_jwt = jwt
    for b in buckets:
        parts = []
        for h in b:
            rel, content = files[h]
            ctype = mimetypes.guess_type(rel)[0] or "application/octet-stream"
            parts.append((h, h, ctype, base64.b64encode(content)))
        body, ctype = multipart(parts)
        r = api_req("POST", "/workers/assets/upload?base64=true", body, ctype, bearer_jwt=jwt)
        if r["result"].get("jwt"): completion_jwt = r["result"]["jwt"]
        print(f"  bucket {len(b)} files uploaded")
    # 3. script upload
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": "2026-09-17",
        "assets": {"jwt": completion_jwt},
        "bindings": [
            {"name": "ASSETS", "type": "assets"},
            {"name": "DB", "type": "d1", "database_id": DB_ID, "id": DB_ID},
            # NOTE: SESSION_SECRET is NOT declared here — secrets set via the
            # secrets API stay bound to the script automatically across uploads.
        ],
        "annotations": {"workers/message": "v77 AI features (Gemini) + v74 user management"},
    }
    script = open(WORKER_JS, "rb").read()
    parts = [
        ("metadata", None, "application/json", json.dumps(metadata).encode()),
        ("worker.js", "worker.js", "application/javascript+module", script),
    ]
    body, ctype = multipart(parts)
    r = api_req("PUT", f"/workers/scripts/{WORKER}", body, ctype)
    print("script upload success:", r.get("success"))
    print(json.dumps(r.get("result", {}), ensure_ascii=False)[:500])

if __name__ == "__main__":
    main()
