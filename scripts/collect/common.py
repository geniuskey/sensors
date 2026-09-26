"""Shared helpers for source collectors (stdlib only).

Collectors fetch and parse source-shaped records. They never decide canonical
identity; matching against the database happens in diff_report.py.
"""
from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / 'data' / 'raw'
REPORTS_DIR = ROOT / 'data' / 'reports'
REPO_URL = 'https://github.com/geniuskey/sensors'
USER_AGENT = f'MobileImageSensorDB-Collector/0.1 (+{REPO_URL}; low-rate weekly catalog check)'

RETRY_STATUS = {429, 500, 502, 503, 504}


class RobotsDisallowed(Exception):
    pass


class PoliteFetcher:
    """urllib fetcher with robots.txt check, per-host delay, retries and backoff."""

    def __init__(self, delay: float = 2.0, timeout: float = 30.0, retries: int = 3,
                 backoff: float = 5.0, user_agent: str = USER_AGENT, verbose: bool = True):
        self.delay = delay
        self.timeout = timeout
        self.retries = retries
        self.backoff = backoff
        self.user_agent = user_agent
        self.verbose = verbose
        self.request_count = 0
        self._robots: dict[str, urllib.robotparser.RobotFileParser] = {}
        self._last_request: dict[str, float] = {}

    def log(self, msg: str) -> None:
        if self.verbose:
            print(msg, file=sys.stderr)

    def _wait(self, host: str) -> None:
        rp = self._robots.get(host)
        crawl_delay = rp.crawl_delay(self.user_agent) if rp else None
        gap = max(self.delay, float(crawl_delay or 0))
        last = self._last_request.get(host)
        if last is not None:
            remaining = gap - (time.monotonic() - last)
            if remaining > 0:
                time.sleep(remaining)
        self._last_request[host] = time.monotonic()

    def _raw_get(self, url: str, accept: str) -> tuple[int, dict, bytes]:
        host = urllib.parse.urlsplit(url).netloc
        req = urllib.request.Request(url, headers={'User-Agent': self.user_agent, 'Accept': accept})
        attempt = 0
        while True:
            self._wait(host)
            self.request_count += 1
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return resp.status, dict(resp.headers), resp.read()
            except urllib.error.HTTPError as e:
                if e.code not in RETRY_STATUS or attempt >= self.retries:
                    return e.code, dict(e.headers or {}), e.read() if e.fp else b''
                wait = _retry_after(e.headers) or self.backoff * (2 ** attempt)
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if attempt >= self.retries:
                    raise
                wait = self.backoff * (2 ** attempt)
                self.log(f'  network error {e!r}')
            attempt += 1
            self.log(f'  retry {attempt}/{self.retries} in {wait:.0f}s: {url}')
            time.sleep(wait)

    def robots_for(self, url: str) -> urllib.robotparser.RobotFileParser:
        parts = urllib.parse.urlsplit(url)
        host = parts.netloc
        if host not in self._robots:
            robots_url = f'{parts.scheme}://{host}/robots.txt'
            rp = urllib.robotparser.RobotFileParser(robots_url)
            try:
                status, _, body = self._raw_get(robots_url, 'text/plain')
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                status, body = 503, b''
            if status in (401, 403):
                rp.disallow_all = True
            elif status >= 500:
                # Unreachable robots.txt: be conservative and do not crawl.
                rp.disallow_all = True
            elif status >= 400:
                rp.allow_all = True
            else:
                rp.parse(body.decode('utf-8', 'replace').splitlines())
            self._robots[host] = rp
        return self._robots[host]

    def allowed(self, url: str) -> bool:
        return self.robots_for(url).can_fetch(self.user_agent, url)

    def get(self, url: str, accept: str = 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5') -> str:
        if not self.allowed(url):
            raise RobotsDisallowed(url)
        self.log(f'GET {url}')
        status, headers, body = self._raw_get(url, accept)
        if status >= 400:
            raise urllib.error.HTTPError(url, status, f'HTTP {status}', None, None)
        charset = 'utf-8'
        m = re.search(r'charset=([\w-]+)', headers.get('Content-Type', '') or headers.get('content-type', ''))
        if m:
            charset = m.group(1)
        try:
            return body.decode(charset, 'replace')
        except LookupError:
            return body.decode('utf-8', 'replace')

    def get_json(self, url: str):
        return json.loads(self.get(url, accept='application/json'))


def _retry_after(headers) -> float | None:
    value = (headers or {}).get('Retry-After') if headers else None
    if not value:
        return None
    if value.isdigit():
        return min(float(value), 300.0)
    try:
        when = email.utils.parsedate_to_datetime(value)
        return max(0.0, min((when - dt.datetime.now(when.tzinfo)).total_seconds(), 300.0))
    except (TypeError, ValueError):
        return None


# ---------- parsing helpers ----------

def clean_text(value: str | None) -> str:
    return re.sub(r'\s+', ' ', html.unescape(value or '').replace('\xa0', ' ')).strip()


def parse_resolution_mp(value: str | None) -> float | None:
    """'50 МП', '8,160 x 6,144 (50MP)', '50MP', '200 Mp' -> float MP."""
    s = clean_text(value)
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:MP|Mp|mp|МП|Мп|megapixel)', s)
    if m:
        return float(m.group(1).replace(',', '.'))
    m = re.search(r'(\d[\d,]*)\s*[x×]\s*(\d[\d,]*)', s)
    if m:
        w, h = (int(x.replace(',', '')) for x in m.groups())
        return round(w * h / 1e6, 2)
    return None


def parse_pixel_um(value: str | None) -> float | None:
    s = clean_text(value)
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:µm|μm|um|мкм)', s)
    return float(m.group(1)) if m else None


def parse_optical_format(value: str | None) -> str | None:
    """Return the optical format as a normalized string like '1/1.56' or '1'."""
    s = clean_text(value).replace('”', '"').replace('″', '"')
    m = re.search(r'1\s*/\s*(\d+(?:\.\d+)?)', s)
    if m:
        return f'1/{m.group(1)}'
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:"|inch|-inch|型)', s)
    return m.group(1) if m else None


def optical_format_inches(value: str | None) -> float | None:
    s = parse_optical_format(value) if value else None
    if not s:
        return None
    if s.startswith('1/'):
        den = float(s[2:])
        return 1 / den if den else None
    return float(s)


class TableRowParser(HTMLParser):
    """Collects headings and table rows (cell text + first link) with heading context."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.headings: list[tuple[str, str]] = []
        self.rows: list[dict] = []
        self.context = {'h1': '', 'h2': '', 'h3': '', 'h4': ''}
        self._heading: str | None = None
        self._heading_text: list[str] = []
        self._table_class: list[str] = []
        self._row: list[dict] | None = None
        self._cell: dict | None = None
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style'):
            self._skip += 1
        elif tag in self.context:
            self._heading, self._heading_text = tag, []
        elif tag == 'table':
            self._table_class.append(a.get('class') or '')
        elif tag == 'tr':
            self._row = []
        elif tag in ('td', 'th') and self._row is not None:
            self._cell = {'tag': tag, 'text': [], 'href': None}
        elif tag == 'a' and self._cell is not None and self._cell['href'] is None:
            self._cell['href'] = a.get('href')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self._skip = max(0, self._skip - 1)
        elif tag == self._heading:
            text = clean_text(''.join(self._heading_text))
            self.context[tag] = text
            for lower in ('h2', 'h3', 'h4'):
                if lower > tag:
                    self.context[lower] = ''
            self.headings.append((tag, text))
            self._heading = None
        elif tag in ('td', 'th') and self._cell is not None and self._row is not None:
            self._row.append({'tag': self._cell['tag'], 'text': clean_text(''.join(self._cell['text'])),
                              'href': self._cell['href']})
            self._cell = None
        elif tag == 'tr' and self._row is not None:
            if self._row:
                self.rows.append({'cells': self._row, 'context': dict(self.context),
                                  'table_class': self._table_class[-1] if self._table_class else ''})
            self._row = None
        elif tag == 'table' and self._table_class:
            self._table_class.pop()

    def handle_data(self, data):
        if self._skip:
            return
        if self._heading is not None:
            self._heading_text.append(data)
        if self._cell is not None:
            self._cell['text'].append(data)


def sitemap_urls(xml_text: str) -> list[tuple[str, str | None]]:
    """Return (loc, lastmod) pairs from a sitemap urlset."""
    out = []
    for block in re.findall(r'<url>(.*?)</url>', xml_text, flags=re.S):
        loc = re.search(r'<loc>\s*([^<]+?)\s*</loc>', block)
        lastmod = re.search(r'<lastmod>\s*([^<]+?)\s*</lastmod>', block)
        if loc:
            out.append((html.unescape(loc.group(1)), lastmod.group(1) if lastmod else None))
    return out


# ---------- snapshots ----------

def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def today() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def write_snapshot(source: str, source_url: str, records: list[dict], meta: dict | None = None,
                   date: str | None = None) -> Path:
    date = date or today()
    out_dir = RAW_DIR / source / date
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / 'snapshot.json'
    payload = {'source': source, 'source_url': source_url, 'checked_at': utc_now(),
               'collector_version': 1, **(meta or {}), 'record_count': len(records), 'records': records}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return path


def latest_snapshot(source: str) -> Path | None:
    base = RAW_DIR / source
    if not base.is_dir():
        return None
    dated = sorted(p for p in base.iterdir() if p.is_dir() and re.fullmatch(r'\d{4}-\d{2}-\d{2}', p.name)
                   and (p / 'snapshot.json').exists())
    return dated[-1] / 'snapshot.json' if dated else None


def snapshot_sources() -> list[str]:
    if not RAW_DIR.is_dir():
        return []
    return sorted(p.name for p in RAW_DIR.iterdir() if p.is_dir() and latest_snapshot(p.name))


# ---------- CLI ----------

def add_fetch_args(parser: argparse.ArgumentParser, default_max_pages: int) -> None:
    parser.add_argument('--max-pages', type=int, default=default_max_pages,
                        help='max detail pages/API calls beyond the listing (default: %(default)s)')
    parser.add_argument('--delay', type=float, default=2.0, help='seconds between requests per host')
    parser.add_argument('--timeout', type=float, default=30.0)
    parser.add_argument('--retries', type=int, default=3)
    parser.add_argument('--date', help='snapshot date folder (default: today UTC)')
    parser.add_argument('--quiet', action='store_true')


def run_collector(module, argv: list[str] | None = None) -> Path:
    """Standard CLI for a collector module exposing SOURCE, SOURCE_URL, DEFAULT_MAX_PAGES, collect()."""
    parser = argparse.ArgumentParser(description=f'Collect {module.SOURCE} snapshot')
    add_fetch_args(parser, module.DEFAULT_MAX_PAGES)
    args = parser.parse_args(argv)
    fetcher = PoliteFetcher(delay=args.delay, timeout=args.timeout, retries=args.retries, verbose=not args.quiet)
    records, meta = module.collect(fetcher, max_pages=args.max_pages)
    meta = {**meta, 'request_count': fetcher.request_count, 'max_pages': args.max_pages}
    path = write_snapshot(module.SOURCE, module.SOURCE_URL, records, meta, date=args.date)
    print(f'{module.SOURCE}: {len(records)} records -> {path.relative_to(ROOT)}')
    return path
