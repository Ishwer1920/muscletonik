#!/usr/bin/env python3
"""Tiny static server for ClipForge.

ffmpeg.wasm loads best over http(s) rather than file://.
The single-thread core used here does NOT require SharedArrayBuffer,
but we send the cross-origin-isolation headers anyway so you can later
swap in the faster multi-threaded core with zero changes.

Usage:
    python3 serve.py            # serves on http://localhost:8000
    python3 serve.py 8080       # custom port
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"ClipForge running at  http://localhost:{port}")
    print("Press Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
