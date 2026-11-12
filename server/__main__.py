"""Start the server:  python -m server  [--host 0.0.0.0] [--port 8000]"""
import argparse

import uvicorn

from .app import create_app


def main():
    ap = argparse.ArgumentParser(description="RoboFight Server")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--db", default=None, help="Pfad zur SQLite-Datenbank (Standard: robofight.db)")
    args = ap.parse_args()
    uvicorn.run(create_app(db_path=args.db), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
