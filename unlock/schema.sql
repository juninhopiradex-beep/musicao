-- BeatFreak · Unlock · esquema D1
CREATE TABLE IF NOT EXISTS keys (
  code_hash   TEXT PRIMARY KEY,          -- SHA-256 do código normalizado
  serial      TEXT NOT NULL,
  album       TEXT NOT NULL,
  lot         TEXT,
  prefix      TEXT,
  status      TEXT NOT NULL DEFAULT 'unused',   -- unused | redeemed | blocked
  redeemed_at TEXT,
  device      TEXT,
  ip_hash     TEXT,
  ua          TEXT,
  -- Geografia da ativação. Vem do edge da Cloudflare, sem serviço externo.
  -- Guardamos cidade/país, nunca o IP em claro.
  pais        TEXT,          -- ISO-2: AO, PT, ZA
  pais_nome   TEXT,
  regiao      TEXT,          -- província
  cidade      TEXT,
  lat         REAL,
  lon         REAL
);
CREATE INDEX IF NOT EXISTS idx_keys_serial ON keys(album, serial);
CREATE INDEX IF NOT EXISTS idx_keys_status ON keys(album, status);
CREATE INDEX IF NOT EXISTS idx_keys_geo    ON keys(album, pais, cidade);

CREATE TABLE IF NOT EXISTS attempts (
  ip_hash TEXT NOT NULL,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts ON attempts(ip_hash, ts);
