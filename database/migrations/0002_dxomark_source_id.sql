ALTER TABLE dxomark_results ADD COLUMN source_id INTEGER REFERENCES sources(id);
