#!/usr/bin/env node
// Converte o CSV do backend em SQL para o D1.
//   node importar.js chaves-backend-*.csv gostos-antecipados > carregar.sql
//   npx wrangler d1 execute beatfreak-unlock --remote --file=carregar.sql
const fs = require('fs');
const [, , csvPath, album] = process.argv;
if (!csvPath || !album) { console.error('uso: node importar.js <csv> <album-slug>'); process.exit(1); }

const rows = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/).slice(1);
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const cell = s => s.replace(/^"|"$/g, '').replace(/""/g, '"');

console.log('BEGIN TRANSACTION;');
let n = 0;
for (let i = 0; i < rows.length; i += 200) {
  const chunk = rows.slice(i, i + 200).map(line => {
    const [serial, hash, , lot, prefix] = line.split(',').map(cell);
    n++;
    return `(${q(hash)},${q(serial)},${q(album)},${q(lot || '')},${q(prefix || '')},'unused')`;
  });
  console.log(`INSERT OR IGNORE INTO keys (code_hash,serial,album,lot,prefix,status) VALUES\n${chunk.join(',\n')};`);
}
console.log('COMMIT;');
console.error(`${n} chaves preparadas para ${album}`);
