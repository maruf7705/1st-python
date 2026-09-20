import http.server
import socketserver
import sys
import threading
import time
import urllib.request

PORT = 8080

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), QuietHandler) as httpd:
        print(f"Server started at http://localhost:{PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    time.sleep(1)
    
    try:
        url = f"http://localhost:{PORT}/index.html"
        res = urllib.request.urlopen(url, timeout=3)
        print(f"Healthcheck OK: status={res.status}")
    except Exception as e:
        print(f"Healthcheck failed: {e}")
        sys.exit(1)
    
    print("Server ready. Keeping alive.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Server stopping.")
