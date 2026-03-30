const API_URL = 'https://api.supabase.com/v1/projects/rzbtuvuqtuhjfkhgckwp/database/query';
const TOKEN = 'sbp_097229f54511582b264f4377d0ef44f077dfff8f';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

async function runSQL(sql) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return JSON.parse(await res.text());
}

const content = readFileSync('C:\\Users\\admin\\Downloads\\CSV\\members_2026-03-04.csv', 'utf-8').replace(/^\uFEFF/, '');
const csvMembers = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
console.log(`Members in CSV: ${csvMembers.length}`);

const dbCount = await runSQL('SELECT count(*) FROM members;');
console.log(`Members in DB: ${dbCount[0].count}`);

// Check how many CSV member IDs are in the DB
const csvIds = new Set(csvMembers.map(m => m.id));
let found = 0, missing = 0;
const missingIds = [];
for (const id of csvIds) {
  const r = await runSQL(`SELECT id FROM members WHERE id = '${id}';`);
  if (r.length > 0) found++;
  else { missing++; if (missingIds.length < 5) missingIds.push(id); }
}
console.log(`CSV member IDs in DB: ${found}, missing: ${missing}`);
console.log('Sample missing:', missingIds);

// Check if DB has extra members not in CSV (trigger-created)
const dbMembers = await runSQL('SELECT id FROM members LIMIT 10;');
const csvIdSet = csvIds;
let extra = 0;
for (const m of dbMembers) {
  if (!csvIdSet.has(m.id)) extra++;
}
console.log(`\nSample: ${extra} of 10 DB members are NOT in CSV (trigger-created)`);
