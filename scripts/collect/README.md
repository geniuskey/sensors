# Collectors

One collector per source. A collector only fetches/parses source-shaped records and preserves provenance. It must not decide canonical identity; matching against the database happens in `diff_report.py`, and nothing in this folder writes `public/data`, the SQLite DB or D1.

Python stdlib only (`urllib`, `html.parser`, `json`). Run from the repo root (`python` on Windows, `python3` elsewhere).

## Pipeline

```
collector -> data/raw/<source>/<YYYY-MM-DD>/snapshot.json
          -> diff_report.py -> data/reports/<date>-<source>.md + .json
          -> audit_low_confidence.py -> data/reports/<date>-audit.md + .json
run_all.py runs all of the above and writes data/reports/<date>-summary.md (used as PR body)
```

Snapshot format:

```json
{
  "source": "helpix",
  "source_url": "https://helpix.ru/isensor/",
  "checked_at": "2026-09-26T11:35:34Z",
  "source_tier": "secondary",
  "request_count": 32,
  "errors": [],
  "record_count": 426,
  "records": []
}
```

Records keep raw strings (`resolution_raw`, `pixel_size_raw`, `optical_format_raw`, `specs`, `role_raw`) next to parsed numbers (`resolution_mp`, `pixel_size_um`, `optical_format`).

## Usage

```bash
npm run collect                     # all enabled collectors + reports + audit summary
python scripts/collect/run_all.py --sources samsung,helpix --max-pages 10
python scripts/collect/run_all.py --skip-collect --full-audit   # rebuild reports from latest snapshots
python scripts/collect/helpix.py --max-pages 20                 # single collector
npm run collect:report              # diff_report.py for every source with a snapshot (--source X to limit)
npm run audit                       # full low-confidence audit
```

Collector options: `--max-pages`, `--delay` (seconds per host, default 2; robots `Crawl-delay` wins if larger), `--timeout`, `--retries`, `--date`, `--quiet`.

## Fetch policy (`common.py`)

- User-Agent `MobileImageSensorDB-Collector/0.1 (+https://github.com/geniuskey/sensors; ...)`.
- robots.txt checked per host via `urllib.robotparser`; 401/403/5xx on robots.txt means no crawling.
- Sequential requests, per-host delay, retries with exponential backoff on 429/5xx (honours `Retry-After`), 30 s timeout.
- No anti-bot bypasses, no headless browsers, no login.

## Sources

| Source | File | Tier | Method | Status |
|---|---|---|---|---|
| Samsung ISOCELL | `samsung.py` | official | JSON endpoints used by the product pages: `/aemapi/semi/iaFindList` (mobile category 329) and `/aemapi/semi/prdSpecInfo` per product | working |
| OmniVision | `omnivision.py` | official | `product-sitemap.xml` then static spec list on each product page; `OV*` URLs fetched first; only pages with image-sensor spec fields are emitted | working (full catalog ~385 pages, default limit 400) |
| Helpix | `helpix.py` | secondary | `/isensor/` index (all sensors, per year) + detail pages newest-first for phone lists and roles (Russian labels kept raw, translated in the report) | working |
| Sony Semiconductor | - | official | - | **skipped**: `sony-semicon.com/robots.txt` explicitly disallows `ClaudeBot` and `Claude-SearchBot`. Because this pipeline is AI-authored and maintained, we respect that opt-out rather than crawl under a different UA. Sony specs stay manual. |
| SmartSens, SK hynix | - | official | - | not implemented yet |
| SP information | - | secondary | - | not implemented yet (robots.txt allows; WordPress sitemap available) |
| DXOMARK | - | benchmark | - | not implemented yet (phone-level; test-page links only, no scores) |

Adding a collector: create `<source>.py` exposing `SOURCE`, `SOURCE_URL`, `DEFAULT_MAX_PAGES` and `collect(fetcher, max_pages) -> (records, meta)`, end with `run_collector(sys.modules[__name__])`, then add it to `ENABLED` in `run_all.py` (and to `OFFICIAL_SOURCES` in `diff_report.py` if official).

## Diff report (`diff_report.py`)

Compares the latest snapshot per source with `public/data/sensors.json` and `phones.json`:

- **Matching**: exact source URL (sensor sources + phone-camera `source_url`), then normalized names/aliases (manufacturer prefixes, `ISOCELL`/`S5K`, `LYT-`/`LYTIA` folded; parenthesised and `/`-separated aliases indexed). Multiple candidates are reported as *ambiguous* and never auto-resolved; unmatched records list `possible_matches` by prefix.
- **Spec conflicts** beyond tolerance: resolution > max(0.5 MP, 3%), pixel size > 0.02 um, optical format > 3% of diagonal. `official_vs_secondary` marks an official source disagreeing with a DB row that has no official source.
- **New sensors**, **DB gaps** the source could fill, **new phone mappings** (with `phone_in_db` when the phone already exists), and record additions/removals since the previous snapshot.

## Scheduled workflow

`.github/workflows/collect.yml` runs weekly (Monday) and monthly (1st, with `--full-audit`), plus `workflow_dispatch`. It opens/updates the PR branch `automation/source-collection` containing only `data/raw/*/<date>/snapshot.json` and `data/reports/**`, with the summary as the PR body. It has no Cloudflare secrets and never writes D1. To pause it, remove the `schedule:` block or disable the workflow in the Actions tab.
