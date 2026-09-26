"""OmniVision product catalog (official).

Product URLs come from the Yoast product sitemap; each product page carries a static
spec list (li.spec-field). Only pages exposing image-sensor spec fields are emitted.
"""
from __future__ import annotations

import sys
from html.parser import HTMLParser

from common import (clean_text, parse_optical_format, parse_pixel_um, parse_resolution_mp,
                    run_collector, sitemap_urls)

SOURCE = 'omnivision'
SOURCE_URL = 'https://www.ovt.com/products/'
SOURCE_TIER = 'official'
DEFAULT_MAX_PAGES = 400
SITEMAP = 'https://www.ovt.com/product-sitemap.xml'


class SpecParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.specs: dict[str, str] = {}
        self.headline = ''
        self.og_title = ''
        self._field: str | None = None
        self._title: list[str] = []
        self._text: list[str] = []
        self._mode: str | None = None
        self._depth = 0
        self._in_h1 = False
        self._h1: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class') or ''
        if tag == 'meta' and a.get('property') == 'og:title':
            self.og_title = a.get('content') or ''
        if tag == 'h1' and 'product-single-info' in cls:
            self._in_h1 = True
        if tag == 'li' and 'spec-field' in cls:
            self._field, self._title, self._text = a.get('data-raw') or '', [], []
        if tag == 'div' and self._field is not None:
            if 'product-single-specs-items-title' in cls:
                self._mode, self._depth = 'title', 1
            elif 'product-single-specs-items-text' in cls:
                self._mode, self._depth = 'text', 1
            elif self._mode:
                self._depth += 1

    def handle_endtag(self, tag):
        if tag == 'h1' and self._in_h1:
            self._in_h1 = False
            self.headline = clean_text(''.join(self._h1))
        if tag == 'div' and self._mode:
            self._depth -= 1
            if self._depth == 0:
                self._mode = None
        if tag == 'li' and self._field is not None:
            title = clean_text(''.join(self._title))
            if self._field.startswith('Image Sensors'):
                self.specs[title] = clean_text(''.join(self._text))
            self._field = None

    def handle_data(self, data):
        if self._in_h1:
            self._h1.append(data)
        if self._mode == 'title':
            self._title.append(data)
        elif self._mode == 'text':
            self._text.append(data)


def parse_product(page: str, url: str) -> dict | None:
    p = SpecParser()
    p.feed(page)
    if not p.specs:
        return None
    name = url.rstrip('/').rsplit('/', 1)[-1].upper()
    return {
        'name': name,
        'manufacturer': 'OmniVision',
        'url': url,
        'headline': p.headline,
        'page_title': p.og_title,
        'specs': p.specs,
        'category': p.specs.get('Category'),
        'use_case': p.specs.get('Use Case'),
        'resolution_raw': p.specs.get('Resolution'),
        'pixel_size_raw': p.specs.get('Pixel Size'),
        'optical_format_raw': p.specs.get('Optical Format'),
        'resolution_mp': parse_resolution_mp(p.specs.get('Resolution')),
        'pixel_size_um': parse_pixel_um(p.specs.get('Pixel Size')),
        'optical_format': parse_optical_format(p.specs.get('Optical Format')),
    }


def collect(fetcher, max_pages: int = DEFAULT_MAX_PAGES):
    urls = [(loc, lastmod) for loc, lastmod in sitemap_urls(fetcher.get(SITEMAP))
            if '/products/' in loc and loc.rstrip('/') != SOURCE_URL.rstrip('/')]
    if not urls:
        raise RuntimeError('OmniVision product sitemap returned no product URLs')
    # Mobile sensors use the OV* prefix (OS/OX/OG/OH are security/auto/GS/medical); fetch them
    # first so a --max-pages limit still covers the mobile lineup.
    urls.sort(key=lambda u: 0 if u[0].rstrip('/').rsplit('/', 1)[-1].startswith('ov') else 1)
    records, errors, fetched, skipped = [], [], 0, 0
    for loc, lastmod in urls[:max_pages]:
        fetched += 1
        try:
            rec = parse_product(fetcher.get(loc), loc)
        except Exception as e:
            errors.append({'url': loc, 'error': repr(e)})
            continue
        if rec is None:
            skipped += 1
            continue
        rec['lastmod'] = lastmod
        records.append(rec)
    return records, {'source_tier': SOURCE_TIER, 'sitemap': SITEMAP, 'sitemap_products': len(urls),
                     'pages_fetched': fetched, 'non_image_sensor_pages': skipped, 'errors': errors,
                     'complete': fetched >= len(urls)}


if __name__ == '__main__':
    run_collector(sys.modules[__name__])
