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
  return text;
}

async function main() {
  console.log('=== Fix Import Round 5: Remap member IDs ===');

  // Get all DB members
  const dbMembers = JSON.parse(await runSQL('SELECT id, user_id, company_id FROM members;'));
  console.log(`DB members: ${dbMembers.length}`);

  // Build lookup by (user_id, company_id)
  const dbLookup = {};
  for (const m of dbMembers) {
    const key = `${m.user_id}|${m.company_id}`;
    dbLookup[key] = m.id;
  }

  // Read CSV members
  const csvMembers = readCSV('members_2026-03-04.csv');
  console.log(`CSV members: ${csvMembers.length}`);

  // Find members that need ID remapping
  const remaps = []; // { oldDbId, newCsvId }
  let alreadyCorrect = 0, noMatch = 0;
  for (const cm of csvMembers) {
    const key = `${cm.user_id}|${cm.company_id}`;
    const dbId = dbLookup[key];
    if (dbId === cm.id) {
      alreadyCorrect++;
    } else if (dbId) {
      remaps.push({ oldDbId: dbId, newCsvId: cm.id, userId: cm.user_id });
    } else {
      noMatch++;
    }
  }
  console.log(`Already correct: ${alreadyCorrect}`);
  console.log(`Need remapping: ${remaps.length}`);
  console.log(`No match (missing company): ${noMatch}`);

  // Remap member IDs - need to handle FK cascades
  // First check what tables reference members(id)
  const fks = JSON.parse(await runSQL(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'members' AND ccu.column_name = 'id';
  `));
  console.log('\nTables referencing members(id):');
  for (const fk of fks) {
    console.log(`  ${fk.table_name}.${fk.column_name}`);
  }

  // Do the remapping - update member IDs
  // Since FKs have ON DELETE CASCADE, we need to be careful
  // Best approach: temporarily drop FK constraints, update IDs, re-add constraints
  // Or: update in correct order (child tables first, then parent)

  // Actually, let's just update the member ID directly and let CASCADE handle it
  // But wait - CASCADE is for DELETE, not UPDATE. Let's check if ON UPDATE CASCADE is set.
  const fkDefs = JSON.parse(await runSQL(`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname IN ('connections', 'chat_participants') AND c.contype = 'f';
  `));
  console.log('\nFK definitions:');
  for (const fk of fkDefs) {
    console.log(`  ${fk.conname}: ${fk.def}`);
  }

  // Since FKs likely don't have ON UPDATE CASCADE, we need to:
  // 1. For each remap, update child table references first
  // 2. Then update the member ID itself
  console.log('\n--- Remapping member IDs ---');
  let remapOk = 0, remapFail = 0;
  for (const { oldDbId, newCsvId, userId } of remaps) {
    try {
      // Update references in child tables
      for (const fk of fks) {
        await runSQL(`UPDATE ${fk.table_name} SET ${fk.column_name} = '${newCsvId}' WHERE ${fk.column_name} = '${oldDbId}';`);
      }
      // Update the member ID itself
      await runSQL(`UPDATE members SET id = '${newCsvId}' WHERE id = '${oldDbId}';`);
      remapOk++;
    } catch(e) {
      remapFail++;
      if (remapFail <= 5) console.log(`  ✗ ${oldDbId} -> ${newCsvId}: ${e.message.substring(0, 150)}`);
    }
  }
  console.log(`  Remapped: ${remapOk}, failed: ${remapFail}`);

  // Now also update other member fields from CSV (role, designation, etc.)
  console.log('\n--- Updating member details from CSV ---');
  let updated = 0;
  for (const m of csvMembers) {
    try {
      await runSQL(`UPDATE members SET
        role = ${esc(m.role)},
        designation = ${esc(m.designation)},
        department = ${esc(m.department)},
        permissions = ${m.permissions ? esc(m.permissions) + '::jsonb' : 'COALESCE(permissions, NULL)'},
        is_active = ${m.is_active || 'true'},
        joined_at = ${m.joined_at ? esc(m.joined_at) : 'joined_at'},
        created_at = ${esc(m.created_at)},
        updated_at = ${esc(m.updated_at)}
      WHERE id = '${m.id}';`);
      updated++;
    } catch(e) {
      // ignore - member might not exist if company was missing
    }
  }
  console.log(`  Updated: ${updated}`);

  // Now retry connections
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

  // Retry chat_participants and messages
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
  for (const t of ['members', 'connections', 'chat_participants', 'messages']) {
    const r = JSON.parse(await runSQL(`SELECT count(*) FROM ${t};`));
    console.log(`  ${t}: ${r[0].count}`);
  }

  console.log('\n=== Fix Import Round 5 Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
