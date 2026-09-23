import http.server
import socketserver
import sys
import threading
import time
import urllib.request
import webbrowser
import os

PORT = 8123
ROOT = os.path.dirname(os.path.abspath(__file__))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, format, *args):
        pass


def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), QuietHandler) as httpd:
        print(f"Server started at http://127.0.0.1:{PORT}")
        httpd.serve_forever()


if __name__ == "__main__":
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    time.sleep(1)

    try:
        url = f"http://127.0.0.1:{PORT}/index.html"
        res = urllib.request.urlopen(url, timeout=5)
        print(f"Healthcheck OK: status={res.status}")
    except Exception as e:
        print(f"Healthcheck failed: {e}")
        sys.exit(1)

    webbrowser.open(url)
    print("Game ready. Keeping server alive. (Close this window to stop.)")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Server stopping.")
