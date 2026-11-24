"""Starting goalies from DailyFaceoff, served as JSON to the dashboard's Refresh (docs/adr/0001).

GET /goalies?date=YYYY-MM-DD -> [{"team": "NJD", "goalie": "Connor Hellebuyck", "status": "Confirmed"}, ...]
One page request per call; the dashboard calls it only during Refresh.
"""
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from scrapling.fetchers import Fetcher

DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def starts(day: str) -> list[dict]:
    page = Fetcher.get(f"https://www.dailyfaceoff.com/starting-goalies/{day}", timeout=20)
    if page.status != 200:
        raise RuntimeError(f"DailyFaceoff returned {page.status}")
    raw = page.css("#__NEXT_DATA__::text").get()
    if not raw:
        raise RuntimeError("DailyFaceoff page has no game data (layout changed?)")
    out = []
    for g in json.loads(raw)["props"]["pageProps"].get("data") or []:
        for side in ("home", "away"):
            name, status = g.get(f"{side}GoalieName"), g.get(f"{side}NewsStrengthName")
            if name and status:
                out.append({"team": g[f"{side}TeamAbbreviation"], "goalie": name, "status": status})
    return out


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        day = parse_qs(url.query).get("date", [""])[0]
        if url.path != "/goalies" or not DATE.match(day):
            return self.reply(400, {"error": "use /goalies?date=YYYY-MM-DD"})
        try:
            self.reply(200, starts(day))
        except Exception as e:  # reported to Refresh as a warning
            self.reply(502, {"error": f"DailyFaceoff scrape failed: {e}"})

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 3002), Handler).serve_forever()
