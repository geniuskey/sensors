PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS manufacturers (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS sensors (
  id INTEGER PRIMARY KEY, manufacturer_id INTEGER NOT NULL REFERENCES manufacturers(id), canonical_id TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL, marketing_name TEXT, internal_code TEXT, resolution_mp REAL, resolution_px TEXT,
  sensor_size TEXT, pixel_size_um REAL, pixel_binning TEXT, fwc TEXT, af TEXT, hdr TEXT, cfa TEXT,
  two_layer_transistor TEXT, transfer_gate TEXT, notes TEXT, first_listed_year INTEGER, confidence TEXT,
  example_phones TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sensor_aliases (sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE, alias TEXT NOT NULL, alias_type TEXT, PRIMARY KEY(sensor_id, alias));
CREATE TABLE IF NOT EXISTS phones (id INTEGER PRIMARY KEY, canonical_id TEXT NOT NULL UNIQUE, oem TEXT, model TEXT NOT NULL, release_year INTEGER, soc TEXT);
CREATE TABLE IF NOT EXISTS phone_cameras (
 id INTEGER PRIMARY KEY, phone_id INTEGER NOT NULL REFERENCES phones(id) ON DELETE CASCADE, sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
 camera_role TEXT, mapping_confidence TEXT, UNIQUE(phone_id,sensor_id,camera_role)
);
CREATE TABLE IF NOT EXISTS dxomark_results (
 phone_id INTEGER PRIMARY KEY REFERENCES phones(id) ON DELETE CASCADE, device_name TEXT, match_status TEXT, camera_score REAL, photo_score REAL, video_score REAL,
 main_score REAL, ultrawide_score REAL, tele_score REAL, selfie_score REAL, display_score REAL, battery_score REAL,
 launch_price_usd REAL, launch_date TEXT, camera_protocol TEXT, checked_date TEXT
);
CREATE TABLE IF NOT EXISTS sources (id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, source_type TEXT, title TEXT, checked_at TEXT);
CREATE TABLE IF NOT EXISTS sensor_sources (sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE, source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE, relationship TEXT NOT NULL DEFAULT 'spec', PRIMARY KEY(sensor_id,source_id,relationship));
CREATE TABLE IF NOT EXISTS camera_sources (camera_id INTEGER NOT NULL REFERENCES phone_cameras(id) ON DELETE CASCADE, source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE, PRIMARY KEY(camera_id,source_id));
CREATE INDEX IF NOT EXISTS idx_sensors_name ON sensors(canonical_name);
CREATE INDEX IF NOT EXISTS idx_sensors_manufacturer ON sensors(manufacturer_id);
CREATE INDEX IF NOT EXISTS idx_aliases_alias ON sensor_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_phones_model ON phones(model);
CREATE INDEX IF NOT EXISTS idx_phone_cameras_sensor ON phone_cameras(sensor_id);
CREATE INDEX IF NOT EXISTS idx_phone_cameras_phone ON phone_cameras(phone_id);
