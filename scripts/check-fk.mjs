const API_URL = 'https://api.supabase.com/v1/projects/rzbtuvuqtuhjfkhgckwp/database/query';
const TOKEN = 'sbp_097229f54511582b264f4377d0ef44f077dfff8f';

async function runSQL(sql) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return JSON.parse(await res.text());
}

// Check connections FK constraints
console.log('=== Connections FK constraints ===');
const fks = await runSQL(`
  SELECT conname, pg_get_constraintdef(c.oid) as def
  FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'connections' AND c.contype = 'f';
`);
console.log(JSON.stringify(fks, null, 2));

// Check how many sender_id/receiver_id values exist in members
console.log('\n=== Sample connections CSV sender/receiver check ===');
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
const content = readFileSync('C:\\Users\\admin\\Downloads\\CSV\\connections_2026-03-04.csv', 'utf-8').replace(/^\uFEFF/, '');
const rows = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });

// Check first 3 rows
for (const r of rows.slice(0, 3)) {
  console.log(`\nRow: sender=${r.sender_id}, receiver=${r.receiver_id}`);
  const s = await runSQL(`SELECT id FROM members WHERE id = '${r.sender_id}';`);
  const rv = await runSQL(`SELECT id FROM members WHERE id = '${r.receiver_id}';`);
  console.log(`  sender exists: ${s.length > 0}, receiver exists: ${rv.length > 0}`);
}

// Count how many unique sender/receiver IDs exist vs don't exist in members
const allIds = new Set();
rows.forEach(r => { allIds.add(r.sender_id); allIds.add(r.receiver_id); });
let found = 0, missing = 0;
for (const id of allIds) {
  const r = await runSQL(`SELECT id FROM members WHERE id = '${id}';`);
  if (r.length > 0) found++; else missing++;
}
console.log(`\nUnique member IDs referenced: ${allIds.size}, found: ${found}, missing: ${missing}`);
