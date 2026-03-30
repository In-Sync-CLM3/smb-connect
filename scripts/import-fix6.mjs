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

function esc(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

async function runSQL(sql) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL error (${res.status}): ${text.substring(0, 300)}`);
  return JSON.parse(text);
}

async function main() {
  console.log('=== Fix Import Round 6: Full member ID remap ===\n');

  // Step 1: Build company ID mapping (CSV ID -> DB ID) by matching name + association
  const dbCompanies = await runSQL('SELECT id, name, association_id FROM companies;');
  const csvCompanies = readCSV('companies_2026-03-04.csv');

  const companyMap = {}; // CSV company ID -> DB company ID
  for (const csvC of csvCompanies) {
    // Find matching DB company by name and association_id
    const match = dbCompanies.find(dbC =>
      dbC.name === csvC.name && dbC.association_id === csvC.association_id
    );
    if (match) {
      companyMap[csvC.id] = match.id;
      if (csvC.id !== match.id) {
        console.log(`Company remap: ${csvC.name}: ${csvC.id.substring(0,8)} -> ${match.id.substring(0,8)}`);
      }
    }
  }

  // Step 2: Get DB members and build user_id lookup
  const dbMembers = await runSQL('SELECT id, user_id, company_id FROM members;');
  const dbIdSet = new Set(dbMembers.map(m => m.id));

  // Build map: user_id -> [db members]
  const dbByUser = {};
  for (const m of dbMembers) {
    if (!dbByUser[m.user_id]) dbByUser[m.user_id] = [];
    dbByUser[m.user_id].push(m);
  }

  // Step 3: Read CSV members and find remaps needed
  const csvMembers = readCSV('members_2026-03-04.csv');
  const remaps = []; // { oldDbId, newCsvId }

  for (const cm of csvMembers) {
    if (dbIdSet.has(cm.id)) continue; // Already correct

    // Find DB member with same user_id
    const dbMatches = dbByUser[cm.user_id] || [];
    if (dbMatches.length === 0) continue;

    // Match by company (using mapped company ID)
    const mappedCompanyId = companyMap[cm.company_id] || cm.company_id;
    let match = dbMatches.find(dm => dm.company_id === mappedCompanyId);

    // If no exact company match and only one DB member for this user, use it
    if (!match && dbMatches.length === 1) {
      match = dbMatches[0];
    }

    if (match && match.id !== cm.id) {
      remaps.push({ oldDbId: match.id, newCsvId: cm.id });
    }
  }

  console.log(`\nMember ID remaps needed: ${remaps.length}`);

  // Step 4: Do the remapping
  // Child tables referencing members(id): connections, chat_participants, messages
  const childTables = [
    { table: 'connections', columns: ['sender_id', 'receiver_id'] },
    { table: 'chat_participants', columns: ['member_id'] },
    { table: 'messages', columns: ['sender_id'] },
  ];

  let remapOk = 0, remapFail = 0;
  for (const { oldDbId, newCsvId } of remaps) {
    try {
      // Update child table references first
      for (const { table, columns } of childTables) {
        for (const col of columns) {
          await runSQL(`UPDATE ${table} SET ${col} = '${newCsvId}' WHERE ${col} = '${oldDbId}';`);
        }
      }
      // Update the member ID itself
      await runSQL(`UPDATE members SET id = '${newCsvId}' WHERE id = '${oldDbId}';`);
      remapOk++;
    } catch(e) {
      remapFail++;
      if (remapFail <= 5) console.log(`  ✗ ${oldDbId.substring(0,8)} -> ${newCsvId.substring(0,8)}: ${e.message.substring(0, 150)}`);
    }
  }
  console.log(`Remapped: ${remapOk}, failed: ${remapFail}`);

  // Step 5: Now import connections
  console.log('\n--- Importing connections ---');
  const connections = readCSV('connections_2026-03-04.csv');
  let cOk = 0, cFail = 0;
  for (const r of connections) {
    try {
      await runSQL(`INSERT INTO connections (id, sender_id, receiver_id, status, message, created_at, updated_at, responded_at)
       VALUES (${esc(r.id)}, ${esc(r.sender_id)}, ${esc(r.receiver_id)}, ${esc(r.status)},
       ${esc(r.message)}, ${esc(r.created_at)}, ${esc(r.updated_at)}, ${r.responded_at ? esc(r.responded_at) : 'NULL'})
       ON CONFLICT (id) DO NOTHING;`);
      cOk++;
    } catch(e) {
      cFail++;
      if (cFail <= 3) console.log(`  ✗ ${e.message.substring(0, 150)}`);
    }
  }
  console.log(`  Connections: ${cOk} imported, ${cFail} failed`);

  // Step 6: Retry chat_participants and messages
  console.log('\n--- Retrying chat_participants ---');
  const chatP = readCSV('chat_participants_2026-03-04.csv');
  let cpOk = 0, cpFail = 0;
  for (const r of chatP) {
    try {
      await runSQL(`INSERT INTO chat_participants (id, chat_id, member_id, is_muted, joined_at, last_read_at)
       VALUES (${esc(r.id)}, ${esc(r.chat_id)}, ${esc(r.member_id)}, ${r.is_muted || 'false'},
       ${esc(r.joined_at)}, ${r.last_read_at ? esc(r.last_read_at) : 'NULL'})
       ON CONFLICT (id) DO NOTHING;`);
      cpOk++;
    } catch(e) { cpFail++; if (cpFail <= 3) console.log(`  ✗ cp: ${e.message.substring(0,120)}`); }
  }
  console.log(`  Chat participants: ${cpOk} imported, ${cpFail} failed`);

  console.log('\n--- Retrying messages ---');
  const msgs = readCSV('messages_2026-03-04.csv');
  let mOk = 0, mFail = 0;
  for (const r of msgs) {
    try {
      await runSQL(`INSERT INTO messages (id, chat_id, sender_id, message_type, content, attachments, metadata,
       is_edited, is_deleted, deleted_at, sent_at, created_at, updated_at)
       VALUES (${esc(r.id)}, ${esc(r.chat_id)}, ${esc(r.sender_id)}, ${esc(r.message_type)},
       ${esc(r.content)}, ${r.attachments ? esc(r.attachments) + '::jsonb' : 'NULL'},
       ${r.metadata ? esc(r.metadata) + '::jsonb' : 'NULL'},
       ${r.is_edited || 'false'}, ${r.is_deleted || 'false'}, ${r.deleted_at ? esc(r.deleted_at) : 'NULL'},
       ${esc(r.sent_at)}, ${esc(r.created_at)}, ${esc(r.updated_at)})
       ON CONFLICT (id) DO NOTHING;`);
      mOk++;
    } catch(e) { mFail++; if (mFail <= 3) console.log(`  ✗ msg: ${e.message.substring(0,120)}`); }
  }
  console.log(`  Messages: ${mOk} imported, ${mFail} failed`);

  // Final counts
  console.log('\n=== Final Counts ===');
  for (const t of ['members', 'companies', 'connections', 'chat_participants', 'messages']) {
    const r = await runSQL(`SELECT count(*) FROM ${t};`);
    console.log(`  ${t}: ${r[0].count}`);
  }

  console.log('\n=== Fix Import Round 6 Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
