#!/usr/bin/env python3
"""Servidor local para probar el motor sin internet.

    python3 scripts/test_server.py <carpeta> [puerto]

Sirve la carpeta tal cual, y bajo /slow/ los mismos archivos a ~300 KB/s
(para probar pausar, reanudar y cancelar a mitad de descarga). Entiende Range.
"""
import http.server
import os
import sys
import time

ROOT = os.path.abspath(sys.argv[1])
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def do_GET(self):
        slow = self.path.startswith("/slow/")
        path = self.translate_path(self.path[5:] if slow else self.path)
        if not slow or not os.path.isfile(path):
            return super().do_GET()
        size = os.path.getsize(path)
        start = 0
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):
            start = int(rng[6:].split("-")[0] or 0)
        self.send_response(206 if start else 200)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(size - start))
        if start:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, size - 1, size))
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            try:
                while chunk := f.read(32 * 1024):
                    self.wfile.write(chunk)
                    time.sleep(0.1)
            except (BrokenPipeError, ConnectionResetError):
                pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
