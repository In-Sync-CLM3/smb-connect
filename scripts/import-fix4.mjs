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
  console.log('=== Fix Import Round 4 ===');

  // First, get existing member IDs from DB
  const dbMembers = JSON.parse(await runSQL('SELECT id FROM members;'));
  const dbIdSet = new Set(dbMembers.map(m => m.id));
  console.log(`Existing members in DB: ${dbIdSet.size}`);

  // Also get existing company IDs
  const dbCompanies = JSON.parse(await runSQL('SELECT id FROM companies;'));
  const dbCompanySet = new Set(dbCompanies.map(c => c.id));
  console.log(`Existing companies in DB: ${dbCompanySet.size}`);

  // Read members CSV and find missing ones
  const members = readCSV('members_2026-03-04.csv');
  const missing = members.filter(m => !dbIdSet.has(m.id));
  console.log(`Missing members to import: ${missing.length}`);

  // Check what company_ids are referenced by missing members
  const missingCompanyIds = new Set();
  for (const m of missing) {
    if (m.company_id && !dbCompanySet.has(m.company_id)) {
      missingCompanyIds.add(m.company_id);
    }
  }
  console.log(`Missing company IDs referenced: ${missingCompanyIds.size}`);

  // If there are missing companies, try to import them first
  if (missingCompanyIds.size > 0) {
    console.log('\n--- Importing missing companies ---');
    const companies = readCSV('companies_2026-03-04.csv');
    let cOk = 0;
    for (const c of companies) {
      if (!missingCompanyIds.has(c.id)) continue;
      try {
        await runSQL(`INSERT INTO companies (id, association_id, name, description, logo, website, email, phone,
          address, city, state, country, postal_code, gst_number, pan_number,
          business_type, industry_type, employee_count, year_established,
          is_active, is_verified, verified_at, subscription_tier,
          created_at, updated_at, annual_turnover, created_by, is_default)
        VALUES (
          ${esc(c.id)}, ${esc(c.association_id)}, ${esc(c.name)}, ${esc(c.description)},
          ${esc(c.logo)}, ${esc(c.website)}, ${esc(c.email)}, ${esc(c.phone)},
          ${esc(c.address)}, ${esc(c.city)}, ${esc(c.state)}, ${esc(c.country)}, ${esc(c.postal_code)},
          ${esc(c.gst_number)}, ${esc(c.pan_number)}, ${esc(c.business_type)}, ${esc(c.industry_type)},
          ${c.employee_count || 'NULL'}, ${c.year_established || 'NULL'},
          ${c.is_active || 'true'}, ${c.is_verified || 'false'}, ${c.verified_at ? esc(c.verified_at) : 'NULL'},
          ${esc(c.subscription_tier)}, ${esc(c.created_at)}, ${esc(c.updated_at)},
          ${c.annual_turnover || 'NULL'}, ${c.created_by ? esc(c.created_by) : 'NULL'},
          ${c.is_default || 'false'}
        ) ON CONFLICT (id) DO NOTHING;`);
        cOk++;
        dbCompanySet.add(c.id);
      } catch(e) {
        console.log(`  ✗ company ${c.name}: ${e.message.substring(0, 120)}`);
      }
    }
    console.log(`  Companies imported: ${cOk}`);

    // For any still-missing companies, check if the members reference companies
    // that exist under different IDs (trigger-created). If so, we need to either
    // create the company or set company_id to NULL
    const stillMissing = new Set();
    for (const id of missingCompanyIds) {
      if (!dbCompanySet.has(id)) stillMissing.add(id);
    }
    if (stillMissing.size > 0) {
      console.log(`  Still missing ${stillMissing.size} companies not in CSV`);
      // These were likely trigger-created companies in the old DB
      // We need to create placeholder companies or import members without company_id
    }
  }

  // Now import missing members
  console.log('\n--- Importing missing members ---');
  let ok = 0, fail = 0;
  const errors = {};
  for (const m of missing) {
    try {
      await runSQL(`INSERT INTO members (id, user_id, company_id, role, designation, department,
        permissions, is_active, joined_at, created_at, updated_at, created_by)
      VALUES (
        ${esc(m.id)}, ${esc(m.user_id)}, ${esc(m.company_id)}, ${esc(m.role)},
        ${esc(m.designation)}, ${esc(m.department)},
        ${m.permissions ? esc(m.permissions) + '::jsonb' : 'NULL'},
        ${m.is_active || 'true'}, ${m.joined_at ? esc(m.joined_at) : 'NULL'},
        ${esc(m.created_at)}, ${esc(m.updated_at)},
        ${m.created_by ? esc(m.created_by) : 'NULL'}
      ) ON CONFLICT (id) DO NOTHING;`);
      ok++;
      dbIdSet.add(m.id);
    } catch(e) {
      fail++;
      const key = e.message.substring(0, 80);
      errors[key] = (errors[key] || 0) + 1;
    }
  }
  console.log(`  Members imported: ${ok}, failed: ${fail}`);
  if (Object.keys(errors).length > 0) {
    console.log('  Error summary:');
    for (const [msg, count] of Object.entries(errors)) {
      console.log(`    ${count}x: ${msg}`);
    }
  }

  // Now try connections
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
  console.log(`  Connections imported: ${cOk}, failed: ${cFail}`);

  // Also retry chat_participants and messages
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
  for (const t of ['members', 'connections', 'chat_participants', 'messages', 'companies']) {
    const r = JSON.parse(await runSQL(`SELECT count(*) FROM ${t};`));
    console.log(`  ${t}: ${r[0].count}`);
  }

  console.log('\n=== Fix Import Round 4 Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
