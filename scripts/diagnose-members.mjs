import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

const CSV_DIR = 'C:\\Users\\admin\\Downloads\\CSV';
const API_URL = 'https://api.supabase.com/v1/projects/rzbtuvuqtuhjfkhgckwp/database/query';
const TOKEN = 'sbp_097229f54511582b264f4377d0ef44f077dfff8f';

function readCSV(filename) {
  const filepath = CSV_DIR + '\\' + filename;
  const content = readFileSync(filepath, 'utf-8').replace(/^\uFEFF/, '');
  return parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true });
}

async function runSQL(sql) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return JSON.parse(await res.text());
}

async function main() {
  // Get DB members
  const dbMembers = await runSQL('SELECT id, user_id, company_id FROM members;');
  const csvMembers = readCSV('members_2026-03-04.csv');

  // Build lookups
  const dbByUserId = {};
  for (const m of dbMembers) {
    if (!dbByUserId[m.user_id]) dbByUserId[m.user_id] = [];
    dbByUserId[m.user_id].push(m);
  }

  const csvById = {};
  for (const m of csvMembers) { csvById[m.id] = m; }

  // Get companies from both
  const dbCompanies = await runSQL('SELECT id, name, association_id FROM companies;');
  const csvCompanies = readCSV('companies_2026-03-04.csv');

  console.log(`DB companies: ${dbCompanies.length}`);
  for (const c of dbCompanies) console.log(`  DB: ${c.id.substring(0,8)} = ${c.name} (assoc: ${c.association_id?.substring(0,8)})`);
  console.log();
  for (const c of csvCompanies) console.log(`  CSV: ${c.id.substring(0,8)} = ${c.name} (assoc: ${c.association_id?.substring(0,8)})`);

  // For the 374 missing members, check if user_id exists in DB members with different company
  let matchByUser = 0, noUserMatch = 0;
  const dbIdSet = new Set(dbMembers.map(m => m.id));
  const missingMembers = csvMembers.filter(m => !dbIdSet.has(m.id));

  console.log(`\nMissing CSV members: ${missingMembers.length}`);
  // Sample first 5
  for (const m of missingMembers.slice(0, 5)) {
    const dbMatches = dbByUserId[m.user_id] || [];
    if (dbMatches.length > 0) {
      matchByUser++;
      console.log(`  CSV member ${m.id.substring(0,8)}: user=${m.user_id.substring(0,8)} company=${m.company_id.substring(0,8)}`);
      for (const dm of dbMatches) {
        console.log(`    DB match: id=${dm.id.substring(0,8)} company=${dm.company_id.substring(0,8)}`);
      }
    } else {
      noUserMatch++;
    }
  }

  // Count overall
  let totalMatch = 0, totalNoMatch = 0;
  for (const m of missingMembers) {
    if ((dbByUserId[m.user_id] || []).length > 0) totalMatch++; else totalNoMatch++;
  }
  console.log(`\nMissing members with same user_id in DB: ${totalMatch}`);
  console.log(`Missing members with NO user_id match: ${totalNoMatch}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
