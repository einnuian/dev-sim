"""HTTP API for the CEO UI: forwards prompts to ``dev_sim`` coding + review agents."""

from __future__ import annotations

import json
import os
import sys
from concurrent.futures import Future, ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from dev_sim.agents_payload import get_session_agents

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="dev_sim_bridge")
_current: Future[Any] | None = None


def _cors_headers(handler: BaseHTTPRequestHandler) -> dict[str, str]:
    origin = handler.headers.get("Origin") or "*"
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
    }


class BridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    def _send(self, code: int, body: bytes, content_type: str = "application/json") -> None:
        h = {"Content-Type": content_type, "Content-Length": str(len(body))}
        h.update(_cors_headers(self))
        self.send_response(code)
        for k, v in h.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self._send(204, b"")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            payload = json.dumps({"ok": True, "service": "dev_sim_bridge"}).encode("utf-8")
            self._send(200, payload)
            return
        if parsed.path == "/api/agents":
            qs = parse_qs(parsed.query)
            raw = (qs.get("seed") or [None])[0]
            refresh_vals = qs.get("refresh") or []
            force_refresh = any(str(v).lower() in ("1", "true", "yes") for v in refresh_vals)
            seed: int | None
            if raw is None or raw == "":
                seed = None
            else:
                try:
                    seed = int(raw)
                except ValueError:
                    self._send(400, json.dumps({"ok": False, "error": "invalid seed"}).encode("utf-8"))
                    return
            try:
                rs = None if seed is None else seed ^ 0x9E3779B9
                data = get_session_agents(coding_seed=seed, review_seed=rs, force_refresh=force_refresh)
            except Exception as e:  # noqa: BLE001
                self._send(500, json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}).encode("utf-8"))
                return
            self._send(200, json.dumps({"ok": True, **data}).encode("utf-8"))
            return
        self._send(404, json.dumps({"ok": False, "error": "not found"}).encode("utf-8"))

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/orchestrate":
            self._send(404, json.dumps({"ok": False, "error": "not found"}).encode("utf-8"))
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send(400, json.dumps({"ok": False, "error": "invalid JSON"}).encode("utf-8"))
            return

        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            self._send(400, json.dumps({"ok": False, "error": "missing prompt"}).encode("utf-8"))
            return

        ws_raw = body.get("workspace")
        workspace = Path(ws_raw).expanduser() if ws_raw else None

        global _current
        if _current is not None and not _current.done():
            self._send(
                429,
                json.dumps({"ok": False, "error": "another orchestrate run is still in progress"}).encode("utf-8"),
            )
            return

        def job() -> dict[str, Any]:
            os.chdir(REPO_ROOT)
            from dev_sim_bridge.pipeline import run_orchestrate_for_prompt

            coding_p = body.get("coding") if isinstance(body.get("coding"), dict) else None
            review_p = body.get("review") if isinstance(body.get("review"), dict) else None

            try:
                return run_orchestrate_for_prompt(
                    prompt,
                    repo_root=REPO_ROOT,
                    workspace=workspace,
                    coding_persona=coding_p,
                    review_persona=review_p,
                )
            except Exception as e:  # noqa: BLE001 — surface to UI
                return {"ok": False, "error": f"{type(e).__name__}: {e}"}

        _current = _executor.submit(job)
        try:
            result = _current.result()
        except Exception as e:  # noqa: BLE001
            self._send(500, json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
            return

        code = 200 if result.get("ok") else 422
        self._send(code, json.dumps(result).encode("utf-8"))


def main(host: str = "127.0.0.1", port: int = 8765) -> None:
    os.chdir(REPO_ROOT)
    httpd = ThreadingHTTPServer((host, port), BridgeHandler)
    print(f"dev_sim_bridge listening on http://{host}:{port}", file=sys.stderr)
    print("  POST /api/orchestrate  JSON {\"prompt\": \"...\"}", file=sys.stderr)
    print("  GET  /api/health", file=sys.stderr)
    print("  GET  /api/agents  optional ?seed=int", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.", file=sys.stderr)
    finally:
        httpd.server_close()
        _executor.shutdown(wait=False, cancel_futures=True)


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    a = p.parse_args()
    main(host=a.host, port=a.port)
