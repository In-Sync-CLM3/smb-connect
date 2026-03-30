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
  console.log('=== Fix Import Round 7: Batch member ID remap ===\n');

  // Step 1: Build company ID mapping
  const dbCompanies = await runSQL('SELECT id, name, association_id FROM companies;');
  const csvCompanies = readCSV('companies_2026-03-04.csv');

  const companyMap = {};
  for (const csvC of csvCompanies) {
    const match = dbCompanies.find(dbC => dbC.name === csvC.name && dbC.association_id === csvC.association_id);
    if (match && csvC.id !== match.id) {
      companyMap[csvC.id] = match.id;
      console.log(`Company map: ${csvC.name}: ${csvC.id.substring(0,8)} -> ${match.id.substring(0,8)}`);
    }
  }

  // Step 2: Get DB members and CSV members
  const dbMembers = await runSQL('SELECT id, user_id, company_id FROM members;');
  const dbIdSet = new Set(dbMembers.map(m => m.id));
  const csvMembers = readCSV('members_2026-03-04.csv');

  // Build user_id lookup for DB members
  const dbByUser = {};
  for (const m of dbMembers) {
    if (!dbByUser[m.user_id]) dbByUser[m.user_id] = [];
    dbByUser[m.user_id].push(m);
  }

  // Build remap list
  const remaps = [];
  for (const cm of csvMembers) {
    if (dbIdSet.has(cm.id)) continue;
    const dbMatches = dbByUser[cm.user_id] || [];
    if (dbMatches.length === 0) continue;

    const mappedCompanyId = companyMap[cm.company_id] || cm.company_id;
    let match = dbMatches.find(dm => dm.company_id === mappedCompanyId);
    if (!match && dbMatches.length === 1) match = dbMatches[0];

    if (match && match.id !== cm.id) {
      remaps.push({ oldId: match.id, newId: cm.id });
    }
  }
  console.log(`\nRemaps needed: ${remaps.length}`);

  // Step 3: Build a single SQL transaction for the remap
  // Process in batches of 50 to avoid huge queries
  const BATCH = 50;
  let totalOk = 0, totalFail = 0;

  for (let i = 0; i < remaps.length; i += BATCH) {
    const batch = remaps.slice(i, i + BATCH);
    let sql = 'BEGIN;\n';

    // Build a temp mapping table
    sql += `CREATE TEMP TABLE IF NOT EXISTS id_remap (old_id uuid, new_id uuid);\n`;
    sql += `TRUNCATE id_remap;\n`;
    for (const { oldId, newId } of batch) {
      sql += `INSERT INTO id_remap VALUES ('${oldId}', '${newId}');\n`;
    }

    // Update child tables using the mapping
    sql += `UPDATE connections SET sender_id = r.new_id FROM id_remap r WHERE connections.sender_id = r.old_id;\n`;
    sql += `UPDATE connections SET receiver_id = r.new_id FROM id_remap r WHERE connections.receiver_id = r.old_id;\n`;
    sql += `UPDATE chat_participants SET member_id = r.new_id FROM id_remap r WHERE chat_participants.member_id = r.old_id;\n`;
    sql += `UPDATE messages SET sender_id = r.new_id FROM id_remap r WHERE messages.sender_id = r.old_id;\n`;

    // Update member IDs - need to do one by one to avoid conflicts
    for (const { oldId, newId } of batch) {
      sql += `UPDATE members SET id = '${newId}' WHERE id = '${oldId}';\n`;
    }

    sql += 'COMMIT;\n';

    try {
      await runSQL(sql);
      totalOk += batch.length;
      console.log(`  Batch ${Math.floor(i/BATCH)+1}: ${batch.length} remapped`);
    } catch(e) {
      // If batch fails, try one by one
      console.log(`  Batch ${Math.floor(i/BATCH)+1} failed: ${e.message.substring(0, 100)}`);
      console.log(`  Retrying one by one...`);
      for (const { oldId, newId } of batch) {
        try {
          const singleSql = `
            BEGIN;
            UPDATE connections SET sender_id = '${newId}' WHERE sender_id = '${oldId}';
            UPDATE connections SET receiver_id = '${newId}' WHERE receiver_id = '${oldId}';
            UPDATE chat_participants SET member_id = '${newId}' WHERE member_id = '${oldId}';
            UPDATE messages SET sender_id = '${newId}' WHERE sender_id = '${oldId}';
            UPDATE members SET id = '${newId}' WHERE id = '${oldId}';
            COMMIT;
          `;
          await runSQL(singleSql);
          totalOk++;
        } catch(e2) {
          totalFail++;
          if (totalFail <= 5) console.log(`    ✗ ${oldId.substring(0,8)}->${newId.substring(0,8)}: ${e2.message.substring(0,100)}`);
        }
      }
    }
  }
  console.log(`\nTotal remapped: ${totalOk}, failed: ${totalFail}`);

  // Step 4: Now import connections
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

  // Step 5: Retry chat + messages
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
    } catch(e) { cpFail++; }
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
    } catch(e) { mFail++; }
  }
  console.log(`  Messages: ${mOk} imported, ${mFail} failed`);

  // Final counts
  console.log('\n=== Final Counts ===');
  for (const t of ['members', 'companies', 'connections', 'chat_participants', 'messages']) {
    const r = await runSQL(`SELECT count(*) FROM ${t};`);
    console.log(`  ${t}: ${r[0].count}`);
  }

  console.log('\n=== Fix Import Round 7 Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
