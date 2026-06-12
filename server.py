import functools
import http.server
import socketserver

ROOT = "/Users/a0000/Documents/vibe coding/Game/2drpgGame"
PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 关闭缓存：确保每次刷新都加载最新的 JS / 图片，避免运行到旧代码
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


Handler = functools.partial(NoCacheHandler, directory=ROOT)

with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Serving {ROOT} at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
