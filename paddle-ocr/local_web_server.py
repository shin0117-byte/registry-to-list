"""Portable localhost server for the downloaded edition."""
import json
import os
import shutil
import subprocess
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INSTALLER = ROOT / "安裝PaddleOCR精準模式.cmd"
VENV_PYTHON = ROOT / ".paddleocr-venv" / "Scripts" / "python.exe"

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(ROOT), **kwargs)
    def send_json(self, status, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Cache-Control", "no-store"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/paddleocr-status":
            return self.send_json(200, {"pythonAvailable": bool(shutil.which("py") or shutil.which("python")), "installed": VENV_PYTHON.exists()})
        return super().do_GET()
    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/start-paddleocr-install": return self.send_json(404, {"code": "not-found"})
        if not (shutil.which("py") or shutil.which("python")): return self.send_json(409, {"code": "python-required"})
        if not INSTALLER.exists(): return self.send_json(500, {"code": "installer-missing"})
        subprocess.Popen(["cmd.exe", "/c", "start", "PaddleOCR precision setup", str(INSTALLER)], cwd=ROOT)
        return self.send_json(202, {"started": True})

def main():
    server = ThreadingHTTPServer(("127.0.0.1", 4173), Handler)
    print("Local website: http://127.0.0.1:4173")
    webbrowser.open("http://127.0.0.1:4173")
    server.serve_forever()
if __name__ == "__main__": main()
