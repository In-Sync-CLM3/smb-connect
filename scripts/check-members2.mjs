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

// Get ALL member IDs from DB in one query
const dbMembers = await runSQL('SELECT id FROM members;');
console.log(`Members in DB: ${dbMembers.length}`);

const dbIdSet = new Set(dbMembers.map(m => m.id));
const csvIdSet = new Set(csvMembers.map(m => m.id));

let csvInDb = 0, csvNotInDb = 0;
for (const id of csvIdSet) {
  if (dbIdSet.has(id)) csvInDb++; else csvNotInDb++;
}

let dbNotInCsv = 0;
for (const id of dbIdSet) {
  if (!csvIdSet.has(id)) dbNotInCsv++;
}

console.log(`\nCSV member IDs found in DB: ${csvInDb}`);
console.log(`CSV member IDs NOT in DB: ${csvNotInDb}`);
console.log(`DB members NOT in CSV (trigger-created): ${dbNotInCsv}`);

// Now check connections - which member IDs are they referencing?
const connContent = readFileSync('C:\\Users\\admin\\Downloads\\CSV\\connections_2026-03-04.csv', 'utf-8').replace(/^\uFEFF/, '');
const connections = parse(connContent, { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
const connMemberIds = new Set();
connections.forEach(c => { connMemberIds.add(c.sender_id); connMemberIds.add(c.receiver_id); });

let connInDb = 0, connNotInDb = 0;
for (const id of connMemberIds) {
  if (dbIdSet.has(id)) connInDb++; else connNotInDb++;
}
console.log(`\nConnection member IDs: ${connMemberIds.size} unique`);
console.log(`  Found in DB: ${connInDb}`);
console.log(`  NOT in DB: ${connNotInDb}`);

// Are the missing connection member IDs in the CSV?
let connInCsv = 0;
for (const id of connMemberIds) {
  if (!dbIdSet.has(id) && csvIdSet.has(id)) connInCsv++;
}
console.log(`  Missing from DB but present in CSV: ${connInCsv}`);
