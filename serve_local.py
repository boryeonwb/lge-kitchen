# -*- coding: utf-8 -*-
"""로컬 배포용 정적 서버 + /api 프록시.

배포(k8s)에서는 nginx 가 `dist/` 를 서빙하고 `/api` 를 정산 백엔드로 넘긴다. 로컬에도
같은 구조가 필요한데 Docker 없이 돌려야 해서, 그 두 가지만 하는 서버를 stdlib 로 짰다.

    python serve_local.py                 # 0.0.0.0:3100, /api → 127.0.0.1:8000
    python serve_local.py 3200 http://127.0.0.1:8123

**0.0.0.0 에 붙는다** — 같은 망의 다른 PC 에서 `http://<이 PC IP>:3100` 으로 열 수 있다.
dev 서버(`npm run dev`)는 localhost 에만 붙어 혼자만 볼 수 있었다.

프록시를 두는 이유는 CORS 다. 브라우저가 백엔드를 직접 부르면 출처가 달라져 막히는데,
같은 출처로 들어와 서버가 넘겨 주면 그 문제가 없다 — 배포의 nginx 와 같은 방식이다.
"""
import os
import shutil
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3100
API = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8000").rstrip("/")

# 운영 탭은 미디어믹스 시트·Criteo 시트·SMBS 환율을 받아 오느라 오래 걸릴 수 있다
TIMEOUT = 300


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIST, **kw)

    def log_message(self, fmt, *args):
        # 정적 파일까지 다 찍으면 콘솔이 흘러가 정작 오류를 놓친다 — API 만 남긴다
        if self.path.startswith("/api"):
            sys.stderr.write(f"{self.log_date_time_string()}  {fmt % args}\n")

    def _proxy(self, body=None):
        req = urllib.request.Request(API + self.path, data=body, method=self.command)
        ct = self.headers.get("Content-Type")
        if ct:
            req.add_header("Content-Type", ct)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as up:
                data = up.read()
                self.send_response(up.status)
                for k in ("Content-Type", "Cache-Control"):
                    if up.headers.get(k):
                        self.send_header(k, up.headers[k])
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            # 백엔드가 안 떠 있으면 화면이 조용히 비는 대신 사유가 보이게 한다
            msg = f'{{"error":"정산 백엔드({API})에 연결하지 못했습니다 — {e}"}}'.encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def do_GET(self):
        if self.path.startswith("/api"):
            return self._proxy()
        # SPA 폴백 — 해시 라우팅이라 실제로는 / 하나뿐이지만, 새로고침이 404 로 죽지 않게
        p = self.translate_path(self.path)
        if not os.path.exists(p) or os.path.isdir(p):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api"):
            return self.send_error(405)
        n = int(self.headers.get("Content-Length") or 0)
        return self._proxy(self.rfile.read(n) if n else None)


def main():
    if not os.path.isfile(os.path.join(DIST, "index.html")):
        print("dist/ 가 없습니다. 먼저 `npm run build` 를 실행하세요.")
        sys.exit(1)
    try:
        ip = __import__("socket").gethostbyname(__import__("socket").gethostname())
    except Exception:
        ip = "이-PC-IP"
    print(f" 광고주 대시보드 (로컬)  http://localhost:{PORT}")
    print(f" 같은 망의 다른 PC 에서 http://{ip}:{PORT}")
    print(f" /api → {API}")
    print(" 끄려면 Ctrl+C")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    if not shutil.which("python") and not sys.executable:
        print("python 을 찾지 못했습니다.")
        sys.exit(1)
    main()
