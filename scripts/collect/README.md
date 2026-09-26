# Collector implementations

Create one collector per source. A collector's job is only to fetch/parse source-shaped records and preserve provenance. It must not decide canonical identity.

Planned collectors:

- `sony.py`
- `samsung.py`
- `omnivision.py`
- `smartsens.py`
- `skhynix.py`
- `spinformation.py`
- `helpix.py`
- `dxomark.py`

Each collector should emit a dated JSON snapshot under `data/raw/<source>/<YYYY-MM-DD>/` with:

```json
{
  "source_url": "...",
  "checked_at": "...",
  "records": []
}
```

Follow robots.txt, site terms and reasonable request rates. Prefer documented feeds/APIs when available. Do not implement anti-bot bypasses.
