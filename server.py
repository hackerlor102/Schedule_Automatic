#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script khởi động Web Server cục bộ phục vụ ứng dụng Xếp ca làm việc.
Tự động mở trình duyệt web khi chạy.
"""
import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def run():
    os.chdir(DIRECTORY)
    url = f"http://localhost:{PORT}"
    print(f"=" * 60)
    print(f"  HỆ THỐNG XẾP CA LÀM VIỆC - WEB SERVER ĐANG CHẠY")
    print(f"=" * 60)
    print(f"  Thư mục: {DIRECTORY}")
    print(f"  Địa chỉ: {url}")
    print(f"  Nhấn Ctrl+C để dừng server.")
    print(f"=" * 60)

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng server.")
        sys.exit(0)

if __name__ == "__main__":
    run()

