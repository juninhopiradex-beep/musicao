-- Acrescenta a geografia a uma base de dados que já existe.
-- Corre uma vez:  wrangler d1 execute beatfreak-unlock --remote --file=migracao-geo.sql
-- Os discos já ativados antes desta migração ficam sem localização — é esperado.
ALTER TABLE keys ADD COLUMN pais      TEXT;
ALTER TABLE keys ADD COLUMN pais_nome TEXT;
ALTER TABLE keys ADD COLUMN regiao    TEXT;
ALTER TABLE keys ADD COLUMN cidade    TEXT;
ALTER TABLE keys ADD COLUMN lat       REAL;
ALTER TABLE keys ADD COLUMN lon       REAL;
CREATE INDEX IF NOT EXISTS idx_keys_geo ON keys(album, pais, cidade);
