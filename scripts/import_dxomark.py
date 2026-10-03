from __future__ import annotations

import csv
import json
import re
import os
from datetime import date
from pathlib import Path
from urllib.parse import urljoin


ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / 'data/raw/dxomark smartphones.html'
CSV_PATH = ROOT / 'data/raw/bootstrap_2026-09.csv'
DXOMARK_BASE = 'https://www.dxomark.com/'
DXOMARK_SOURCE_TYPE = 'DXOMARK smartphone ranking'
CHECKED_DATE = date.today().isoformat()

OEM_FIXES = {
    'mate': 'Huawei', 'pura': 'Huawei', 'huawei': 'Huawei', 'mi': 'Xiaomi',
    'pixel': 'Google', 'black': 'Black Shark', 'china': 'China Mobile',
    'blackview': 'Blackview', 'honor': 'HONOR', 'vivo': 'vivo',
}
VARIANT_SUFFIX = re.compile(
    r'\s*\((?P<variant>Exynos|Snapdragon(?:\s+[\w.+-]+)?|MediaTek|'
    r'Dimensity(?:\s+[\w.+-]+)?|Qualcomm(?:\s+[\w.+-]+)?)\)\s*$',
    re.IGNORECASE,
)


def clean(value: object) -> str:
    return str(value or '').strip()


def identity_key(value: object) -> str:
    return re.sub(r'[^a-z0-9]+', '', clean(value).lower().replace('+', ' plus '))


def canonical_oem(value: object) -> str:
    name = clean(value)
    return OEM_FIXES.get(name.lower(), name)


def strip_brand_prefix(value: object, brand: object) -> str:
    text = clean(value)
    prefix = clean(brand)
    if not text or not prefix or not text.casefold().startswith(prefix.casefold()):
        return text
    if len(text) == len(prefix) or text[len(prefix)].isspace() or text[len(prefix)] in '-_':
        return text[len(prefix):].strip(' -_')
    return text


def model_key(brand: object, model: object) -> tuple[str, str]:
    oem = canonical_oem(brand)
    return identity_key(oem), identity_key(strip_brand_prefix(model, oem))


def load_rankings() -> list[dict]:
    html = HTML_PATH.read_text(encoding='utf-8', errors='replace')
    match = re.search(r'var smartphonesAsJson\s*=\s*(\[.*?\])\s*;', html, re.DOTALL)
    if not match:
        raise ValueError(f'Could not find smartphonesAsJson in {HTML_PATH}')
    return json.loads(match.group(1))



def source_fields(record: dict) -> dict[str, str]:
    source_url = urljoin(DXOMARK_BASE, clean(record.get('link')).lstrip('/'))
    if not source_url.startswith(DXOMARK_BASE + 'smartphones/'):
        raise ValueError(f'Unexpected DXOMARK device URL for {record.get("name")}: {source_url}')

    # Only the tested device name and a link to its DXOMARK test page are kept.
    # Scores, prices and launch dates are DXOMARK's data and are not copied.
    values = {
        'DXOMARK_Device': clean(record.get('name')),
        'DXOMARK_Source_URL': source_url,
        'DXOMARK_Source_Type': DXOMARK_SOURCE_TYPE,
        'DXOMARK_Checked_Date': CHECKED_DATE,
    }
    return {key: '' if value is None else str(value) for key, value in values.items()}


def main() -> None:
    rankings = load_rankings()
    snapshot_fields = ['DXOMARK_Brand', 'DXOMARK_Model', *source_fields(rankings[0]).keys()]
    snapshot_path = ROOT / 'data/raw/dxomark_smartphones.csv'
    with snapshot_path.open('w', encoding='utf-8-sig', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=snapshot_fields, lineterminator='\r\n')
        writer.writeheader()
        for record in rankings:
            writer.writerow({
                'DXOMARK_Brand': clean(record.get('brand')),
                'DXOMARK_Model': clean(record.get('model')),
                **source_fields(record),
            })

    exact: dict[tuple[str, str], list[dict]] = {}
    without_variant: dict[tuple[str, str], list[dict]] = {}
    for record in rankings:
        key = model_key(record.get('brand'), record.get('model'))
        exact.setdefault(key, []).append(record)
        model = clean(record.get('model'))
        variant = VARIANT_SUFFIX.search(model)
        if variant:
            base_model = model[:variant.start()].strip()
            without_variant.setdefault(model_key(record.get('brand'), base_model), []).append(record)

    with CSV_PATH.open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        fieldnames = reader.fieldnames
        rows = list(reader)
    if not fieldnames:
        raise ValueError(f'CSV has no header: {CSV_PATH}')
    required = {
        'Phone', 'OEM', 'Phone_Canonical_ID', 'DXOMARK_Match_Status',
        'DXOMARK_Device', 'DXOMARK_Source_URL', 'DXOMARK_Source_Type',
        'DXOMARK_Checked_Date',
    }
    missing = required - set(fieldnames)
    if missing:
        raise ValueError(f'CSV is missing required columns: {sorted(missing)}')

    by_phone: dict[str, tuple[dict, tuple[str, str]]] = {}
    for row in rows:
        if not clean(row.get('Phone')):
            continue
        phone_id = clean(row.get('Phone_Canonical_ID'))
        if not phone_id:
            raise ValueError(f'Phone row has no canonical ID: {row.get("Phone")}')
        key = model_key(row.get('OEM'), row.get('Phone'))
        by_phone.setdefault(phone_id, (row, key))

    assignments: dict[str, tuple[dict, str]] = {}
    ambiguous = 0
    for phone_id, (row, key) in by_phone.items():
        candidates = exact.get(key, [])
        status = 'Exact normalized model match'
        if len(candidates) > 1:
            ambiguous += 1
            continue
        if not candidates:
            candidates = without_variant.get(key, [])
            if len(candidates) > 1:
                ambiguous += 1
                continue
            if len(candidates) == 1:
                status = f'Tested variant: {VARIANT_SUFFIX.search(clean(candidates[0].get("model"))).group("variant")}'
        if len(candidates) == 1:
            values = source_fields(candidates[0])
            if values['DXOMARK_Source_URL']:
                assignments[phone_id] = (values, status)

    rows_updated = 0
    for row in rows:
        phone_id = clean(row.get('Phone_Canonical_ID'))
        if not phone_id or phone_id not in assignments:
            continue
        if model_key(row.get('OEM'), row.get('Phone')) != by_phone[phone_id][1]:
            continue
        values, status = assignments[phone_id]
        for field, value in values.items():
            if value:
                row[field] = value
        row['DXOMARK_Match_Status'] = status
        rows_updated += 1

    temp_path = CSV_PATH.with_suffix(CSV_PATH.suffix + '.tmp')
    with temp_path.open('w', encoding='utf-8-sig', newline='') as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator='\r\n')
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temp_path, CSV_PATH)

    exact_count = sum(status == 'Exact normalized model match' for _, status in assignments.values())
    variant_count = len(assignments) - exact_count
    print(
        f'Parsed {len(rankings)} DXOMARK devices; linked {len(assignments)} phone records '
        f'({exact_count} exact, {variant_count} tested variant), updated {rows_updated} CSV rows; '
        f'{ambiguous} ambiguous phone matches left unchanged.'
    )


if __name__ == '__main__':
    main()
