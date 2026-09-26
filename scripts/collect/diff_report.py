"""Compare the latest source snapshot(s) with public/data/sensors.json + phones.json.

Reports, per source:
  - new sensors (not matched by URL, normalized name or alias)
  - spec conflicts beyond tolerance (resolution / pixel size / optical format)
  - DB gaps the source could fill
  - new phone mappings (Helpix detail pages)
  - record additions/removals since the previous snapshot of the same source
Writes data/reports/<date>-<source>.md and .json. Never modifies the database.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

from common import REPORTS_DIR, RAW_DIR, ROOT, latest_snapshot, optical_format_inches, snapshot_sources, utc_now

SENSORS_JSON = ROOT / 'public' / 'data' / 'sensors.json'
PHONES_JSON = ROOT / 'public' / 'data' / 'phones.json'

OFFICIAL_SOURCES = {'samsung', 'sony', 'omnivision', 'smartsens', 'skhynix'}
PREFIX_WORDS = ['sk hynix', 'hynix', 'sony', 'samsung', 'isocell', 'omnivision', 'galaxycore', 'smartsens',
                'superpix', 'metasilicon', 'panasonic', 'byd', 'onsemi']
MANUFACTURER_FAMILY = {'hynix': 'skhynix', 'ovt': 'omnivision'}
MOBILE_HINTS = ('smartphone', 'mobile', 'selfie', 'still image / video camera', 'phone')

RU_ROLE_WORDS = {
    'тыловая': 'Rear', 'фронтальная': 'Front', 'основная': 'Main', 'широкоугольная': 'Ultra-wide',
    'сверхширокоугольная': 'Ultra-wide', 'телеобъектив': 'Telephoto', 'телефото': 'Telephoto', 'телевик': 'Telephoto',
    'перископная': 'Periscope', 'макро': 'Macro', 'глубины': 'Depth', 'монохромная': 'Mono',
    'дополнительная': 'Auxiliary',
}

RU_DEVICE_GROUPS = {'мобильники': 'Phone', 'планшеты': 'Tablet'}

TOLERANCE = {
    'resolution_mp': lambda db, src: abs(db - src) <= max(0.5, 0.03 * db),
    'pixel_size_um': lambda db, src: abs(db - src) <= 0.02,
    'optical_format': lambda db, src: abs(db - src) <= 0.03 * db,
}


def norm(value: str | None) -> str:
    return re.sub(r'[^a-z0-9]+', '', (value or '').lower().replace('+', ' plus '))


def core_key(value: str) -> str:
    s = (value or '').strip().lower()
    changed = True
    while changed:
        changed = False
        for word in PREFIX_WORDS:
            if s.startswith(word + ' '):
                s, changed = s[len(word):].strip(), True
    key = norm(s).replace('lytia', 'lyt')  # Sony renamed LYT-xxx to LYTIA xxx
    return key[3:] if key.startswith('s5k') and len(key) > 4 else key


def name_keys(name: str) -> list[str]:
    parts = [name, re.sub(r'\([^)]*\)', ' ', name), *re.findall(r'\(([^)]*)\)', name), *name.split('/')]
    keys = []
    for part in parts:
        k = core_key(part)
        if len(k) >= 3 and k not in keys:
            keys.append(k)
    return keys


def family(manufacturer: str | None) -> str:
    k = norm(manufacturer)
    return MANUFACTURER_FAMILY.get(k, k)


def norm_url(url: str | None) -> str:
    return (url or '').strip().lower().replace('http://', 'https://').rstrip('/')


def translate_role(raw: str | None) -> str:
    roles = []
    for part in (raw or '').split(','):
        words = [RU_ROLE_WORDS.get(w, w) for w in part.strip().lower().split()]
        if words:
            roles.append(' '.join(words))
    return ' + '.join(roles)


class Database:
    def __init__(self, sensors_path: Path = SENSORS_JSON, phones_path: Path = PHONES_JSON):
        self.sensors = json.loads(sensors_path.read_text(encoding='utf-8'))
        self.phones = json.loads(phones_path.read_text(encoding='utf-8')) if phones_path.exists() else []
        self.by_id = {s['canonical_id']: s for s in self.sensors}
        self.name_index: dict[str, set[str]] = defaultdict(set)
        self.url_index: dict[str, set[str]] = defaultdict(set)
        self.sensor_phone_keys: dict[str, set[str]] = defaultdict(set)
        for s in self.sensors:
            cid = s['canonical_id']
            names = [s.get('canonical_name'), s.get('marketing_name'), s.get('internal_code'),
                     cid.split(':', 1)[-1], *(s.get('aliases') or [])]
            for n in filter(None, names):
                for k in name_keys(n):
                    self.name_index[k].add(cid)
            urls = [s.get('source_url')] + [x.get('url') for x in s.get('sources') or []]
            for u in filter(None, urls):
                self.url_index[norm_url(u)].add(cid)
            for p in s.get('phones') or []:
                self.sensor_phone_keys[cid].add(norm(p.get('model')))
        self.phone_index = {norm(p['model']): p['canonical_id'] for p in self.phones}
        for p in self.phones:
            for cam in p.get('cameras') or []:
                if cam.get('sensor_id') in self.by_id and cam.get('source_url'):
                    self.url_index[norm_url(cam['source_url'])].add(cam['sensor_id'])

    def possible_matches(self, name: str, limit: int = 5) -> list[str]:
        keys = name_keys(name)
        if not keys:
            return []
        k = keys[0]
        out = set()
        for key, ids in self.name_index.items():
            if key != k and min(len(k), len(key)) >= 4 and abs(len(key) - len(k)) <= 3 and (
                    key.startswith(k) or k.startswith(key)):
                out |= ids
        return sorted(out)[:limit]

    def match(self, name: str, manufacturer: str | None, url: str | None) -> tuple[str | None, str, list[str]]:
        """Return (canonical_id, method, candidates). Conservative: ambiguity is never auto-resolved by guess."""
        if url:
            hits = self.url_index.get(norm_url(url), set())
            if len(hits) == 1:
                return next(iter(hits)), 'url', []
        fam = family(manufacturer)
        for key in name_keys(name):
            hits = self.name_index.get(key)
            if not hits:
                continue
            if len(hits) == 1:
                return next(iter(hits)), 'name', []
            same = [h for h in hits if family(self.by_id[h]['manufacturer']) == fam]
            if len(same) == 1:
                return same[0], 'name+manufacturer', []
            return None, 'ambiguous', sorted(hits)
        return None, 'none', []


def record_name(rec: dict) -> str:
    return rec.get('model') or rec.get('name') or rec.get('title') or ''


def record_url(rec: dict) -> str | None:
    return rec.get('url') or rec.get('product_url') or rec.get('spec_api_url')


def is_mobile(source: str, rec: dict) -> bool:
    if source != 'omnivision':
        return True
    text = ' '.join(str(rec.get(k) or '') for k in ('use_case', 'headline', 'category')).lower()
    return any(h in text for h in MOBILE_HINTS)


def db_value(sensor: dict, field: str):
    if field == 'optical_format':
        return optical_format_inches(sensor.get('sensor_size'))
    v = sensor.get(field)
    return float(v) if isinstance(v, (int, float)) else None


def src_value(rec: dict, field: str):
    if field == 'optical_format':
        return optical_format_inches(rec.get('optical_format'))
    v = rec.get(field)
    return float(v) if isinstance(v, (int, float)) else None


RAW_FIELD = {'resolution_mp': 'resolution_raw', 'pixel_size_um': 'pixel_size_raw', 'optical_format': 'optical_format_raw'}
DB_FIELD = {'resolution_mp': 'resolution_mp', 'pixel_size_um': 'pixel_size_um', 'optical_format': 'sensor_size'}


def previous_snapshot(source: str, latest: Path) -> Path | None:
    dated = sorted(p for p in (RAW_DIR / source).iterdir()
                   if p.is_dir() and (p / 'snapshot.json').exists() and p.name < latest.parent.name)
    return dated[-1] / 'snapshot.json' if dated else None


def build_report(source: str, db: Database, snapshot_path: Path | None = None) -> dict:
    snapshot_path = snapshot_path or latest_snapshot(source)
    if not snapshot_path:
        raise FileNotFoundError(f'no snapshot for {source}')
    snap = json.loads(snapshot_path.read_text(encoding='utf-8'))
    tier = snap.get('source_tier') or ('official' if source in OFFICIAL_SOURCES else 'secondary')
    new_sensors, conflicts, gaps, mappings, ambiguous = [], [], [], [], []
    matched = defaultdict(int)
    non_mobile = 0

    for rec in snap['records']:
        name, url = record_name(rec), record_url(rec)
        if not is_mobile(source, rec):
            non_mobile += 1
            continue
        cid, method, candidates = db.match(name, rec.get('manufacturer'), url)
        matched[method] += 1
        if method == 'ambiguous':
            ambiguous.append({'name': rec.get('title') or name, 'manufacturer': rec.get('manufacturer'),
                              'candidates': candidates, 'source_url': url})
            continue
        if cid is None:
            new_sensors.append({
                'name': rec.get('title') or name, 'manufacturer': rec.get('manufacturer'),
                'resolution_mp': rec.get('resolution_mp'), 'pixel_size_um': rec.get('pixel_size_um'),
                'optical_format': rec.get('optical_format'), 'year': rec.get('year'),
                'status': rec.get('status'), 'phone_count': len(rec.get('phones') or []), 'source_url': url,
                'possible_matches': db.possible_matches(name),
            })
            continue
        sensor = db.by_id[cid]
        db_sources = sorted({x.get('type') or '' for x in sensor.get('sources') or []})
        for field, within in TOLERANCE.items():
            dv, sv = db_value(sensor, field), src_value(rec, field)
            if sv is None:
                continue
            if dv is None:
                gaps.append({'canonical_id': cid, 'field': DB_FIELD[field], 'source_value': rec.get(RAW_FIELD[field]),
                             'source_url': url})
            elif not within(dv, sv):
                conflicts.append({
                    'canonical_id': cid, 'name': sensor.get('canonical_name'), 'field': DB_FIELD[field],
                    'db_value': sensor.get(DB_FIELD[field]), 'source_value': rec.get(RAW_FIELD[field]),
                    'source_parsed': rec.get(field), 'source_tier': tier, 'source_url': url,
                    'db_confidence': sensor.get('confidence'), 'db_source_types': db_sources,
                    'official_vs_secondary': tier == 'official' and not any('official' in t for t in db_sources),
                })
        for phone in rec.get('phones') or []:
            key = norm(phone.get('name'))
            if not key or key in db.sensor_phone_keys.get(cid, set()):
                continue
            mappings.append({
                'canonical_id': cid, 'sensor': sensor.get('canonical_name'), 'phone': phone.get('name'),
                'phone_in_db': db.phone_index.get(key), 'role_raw': phone.get('role_raw'),
                'role': translate_role(phone.get('role_raw')), 'year': phone.get('year'),
                'device_group': RU_DEVICE_GROUPS.get((phone.get('device_group') or '').lower(),
                                                     phone.get('device_group')), 'phone_url': phone.get('url'), 'source_url': url,
            })

    since_previous = None
    prev = previous_snapshot(source, snapshot_path)
    if prev:
        old = json.loads(prev.read_text(encoding='utf-8'))
        key = lambda r: norm_url(record_url(r)) or norm(record_name(r))  # noqa: E731
        old_keys = {key(r): record_name(r) for r in old['records']}
        new_keys = {key(r): record_name(r) for r in snap['records']}
        since_previous = {
            'previous_snapshot': prev.relative_to(ROOT).as_posix(),
            'added': sorted(new_keys[k] for k in new_keys.keys() - old_keys.keys()),
            'removed': sorted(old_keys[k] for k in old_keys.keys() - new_keys.keys()),
        }

    mappings.sort(key=lambda m: (m['phone_in_db'] is None, -(m['year'] or 0), m['sensor'], m['phone']))
    return {
        'source': source,
        'source_tier': tier,
        'snapshot': snapshot_path.relative_to(ROOT).as_posix(),
        'snapshot_date': snapshot_path.parent.name,
        'checked_at': snap.get('checked_at'),
        'generated_at': utc_now(),
        'db': {'sensors': len(db.sensors), 'phones': len(db.phones)},
        'summary': {
            'records': len(snap['records']), 'non_mobile_skipped': non_mobile,
            'matched_by_url': matched['url'], 'matched_by_name': matched['name'] + matched['name+manufacturer'],
            'new_sensors': len(new_sensors), 'ambiguous': len(ambiguous), 'spec_conflicts': len(conflicts),
            'official_vs_secondary_conflicts': sum(c['official_vs_secondary'] for c in conflicts),
            'db_gaps_fillable': len(gaps), 'new_phone_mappings': len(mappings),
            'new_mappings_phone_in_db': sum(1 for m in mappings if m['phone_in_db']),
            'snapshot_errors': len(snap.get('errors') or []),
        },
        'since_previous': since_previous,
        'new_sensors': new_sensors,
        'ambiguous': ambiguous,
        'spec_conflicts': conflicts,
        'db_gaps': gaps,
        'new_phone_mappings': mappings,
    }


def _table(rows: list[dict], cols: list[tuple[str, str]], max_rows: int) -> list[str]:
    if not rows:
        return ['_None._', '']
    out = ['| ' + ' | '.join(h for h, _ in cols) + ' |', '|' + '---|' * len(cols)]
    for r in rows[:max_rows]:
        cells = []
        for _, k in cols:
            v = r.get(k)
            v = ', '.join(v) if isinstance(v, list) else ('' if v is None else str(v))
            cells.append(v.replace('|', '\\|'))
        out.append('| ' + ' | '.join(cells) + ' |')
    if len(rows) > max_rows:
        out.append(f'\n_{len(rows) - max_rows} more rows in the JSON sidecar._')
    return out + ['']


def summary_lines(report: dict) -> list[str]:
    s = report['summary']
    lines = [
        f"- Snapshot: `{report['snapshot']}` (checked {report['checked_at']}, tier: {report['source_tier']})",
        f"- Records: {s['records']} (non-mobile skipped: {s['non_mobile_skipped']}); matched by URL {s['matched_by_url']}, "
        f"by name/alias {s['matched_by_name']}; ambiguous {s['ambiguous']}",
        f"- New sensors not in DB: **{s['new_sensors']}**",
        f"- Spec conflicts: **{s['spec_conflicts']}** (official != secondary: {s['official_vs_secondary_conflicts']})",
        f"- DB gaps this source could fill: {s['db_gaps_fillable']}",
        f"- New phone mappings: **{s['new_phone_mappings']}** ({s['new_mappings_phone_in_db']} for phones already in DB)",
    ]
    if s['snapshot_errors']:
        lines.append(f"- Collector errors: {s['snapshot_errors']} (see snapshot `errors`)")
    prev = report.get('since_previous')
    if prev:
        lines.append(f"- Since `{prev['previous_snapshot']}`: +{len(prev['added'])} / -{len(prev['removed'])} records")
    return lines


def render_markdown(report: dict, max_rows: int = 150) -> str:
    md = [f"# Source diff: {report['source']} ({report['snapshot_date']})", '',
          'Generated by `scripts/collect/diff_report.py`. Review only; nothing here is applied to the database.', '']
    md += summary_lines(report) + ['']
    md += ['## Spec conflicts', '']
    md += _table(report['spec_conflicts'], [('Sensor', 'canonical_id'), ('Field', 'field'), ('DB', 'db_value'),
                                            ('Source', 'source_value'), ('Official vs secondary', 'official_vs_secondary'),
                                            ('DB confidence', 'db_confidence'), ('Source URL', 'source_url')], max_rows)
    md += ['## New sensors not in DB', '']
    md += _table(report['new_sensors'], [('Name', 'name'), ('Maker', 'manufacturer'), ('MP', 'resolution_mp'),
                                         ('Pixel um', 'pixel_size_um'), ('Format', 'optical_format'), ('Year', 'year'),
                                         ('Phones', 'phone_count'), ('Possible DB match', 'possible_matches'),
                                         ('Source URL', 'source_url')], max_rows)
    md += ['## Ambiguous matches (manual review)', '']
    md += _table(report['ambiguous'], [('Name', 'name'), ('Maker', 'manufacturer'), ('Candidates', 'candidates'),
                                       ('Source URL', 'source_url')], max_rows)
    md += ['## New phone mappings', '']
    md += _table(report['new_phone_mappings'], [('Sensor', 'canonical_id'), ('Phone', 'phone'),
                                                ('Phone in DB', 'phone_in_db'), ('Role', 'role'), ('Year', 'year'),
                                                ('Device', 'device_group'),
                                                ('Phone URL', 'phone_url')], max_rows)
    md += ['## DB gaps fillable from this source', '']
    md += _table(report['db_gaps'], [('Sensor', 'canonical_id'), ('Field', 'field'), ('Source value', 'source_value'),
                                     ('Source URL', 'source_url')], max_rows)
    prev = report.get('since_previous')
    if prev and (prev['added'] or prev['removed']):
        md += ['## Changes since previous snapshot', '',
               f"Added: {', '.join(prev['added'][:max_rows]) or '-'}", '',
               f"Removed: {', '.join(prev['removed'][:max_rows]) or '-'}", '']
    return '\n'.join(md)


def write_report(report: dict, max_rows: int = 150) -> tuple[Path, Path]:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    stem = REPORTS_DIR / f"{report['snapshot_date']}-{report['source']}"
    md_path, json_path = stem.with_suffix('.md'), stem.with_suffix('.json')
    md_path.write_text(render_markdown(report, max_rows) + '\n', encoding='utf-8')
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return md_path, json_path


def main(argv: list[str] | None = None) -> list[dict]:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--source', action='append', help='source name (repeatable); default: all with snapshots')
    parser.add_argument('--max-rows', type=int, default=150, help='rows per Markdown table')
    args = parser.parse_args(argv)
    db = Database()
    reports = []
    for source in args.source or snapshot_sources():
        report = build_report(source, db)
        md_path, _ = write_report(report, args.max_rows)
        print(f"{source}: {json.dumps(report['summary'])} -> {md_path.relative_to(ROOT).as_posix()}")
        reports.append(report)
    return reports


if __name__ == '__main__':
    main()
