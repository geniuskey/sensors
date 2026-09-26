# sensors.euiyun.com

Open mobile image-sensor catalog and smartphone adoption database for `sensors.euiyun.com`.

## Architecture

- **GitHub**: provenance, migrations, reviewed source changes, exports.
- **Cloudflare Pages**: static UI.
- **Pages Functions**: read-only API.
- **Cloudflare D1**: production serving database.
- **Mac Studio / agents**: collectors, normalization, validation, PR creation.

The repository is deliberately reproducible: raw/import data -> normalized SQLite/D1 schema -> public CSV/JSON -> website.

## Bootstrap

```bash
npm install
npm run data:build
npm run build
```

This imports `data/raw/bootstrap_2026-09.csv`, produces `database/local.sqlite3`, `database/seed.sql`, `public/data/sensors.json`, and `public/data/all-in-one.csv`.

## Cloudflare setup

```bash
npx wrangler login
npx wrangler d1 create sensors-db
cp wrangler.toml.example wrangler.toml
# put the returned database_id in wrangler.toml
npm run d1:migrate:remote
npm run d1:seed:remote
npm run deploy
```

Then add `sensors.euiyun.com` under the Pages project's **Custom domains**.

## Data policy

Never silently overwrite a disputed fact. Preserve source URLs, confidence, aliases and manual overrides. Official manufacturer sources outrank secondary catalogs for sensor specifications; adoption mappings may require third-party sources when OEMs do not publish sensor part numbers.

Read `docs/AGENT_GUIDE.md`, `docs/DATA_MODEL.md`, `docs/DATA_SOURCES.md`, and `docs/MAINTENANCE.md` before changing data pipelines.
