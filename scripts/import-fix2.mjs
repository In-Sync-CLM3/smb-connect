import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';

const CSV_DIR = 'C:\\Users\\admin\\Downloads\\CSV';
const API_URL = 'https://api.supabase.com/v1/projects/rzbtuvuqtuhjfkhgckwp/database/query';
const TOKEN = 'sbp_097229f54511582b264f4377d0ef44f077dfff8f';
const OLD_PROJECT = 'jqynxytwngtytvuzucuo';
const NEW_PROJECT = 'rzbtuvuqtuhjfkhgckwp';

function readCSV(filename) {
  const filepath = join(CSV_DIR, filename);
  const content = readFileSync(filepath, 'utf-8').replace(/^\uFEFF/, '');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });
}

function esc(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function rewrite(val) {
  if (!val) return val;
  return String(val).replaceAll(OLD_PROJECT, NEW_PROJECT);
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

async function importOneByOne(table, filename, buildSQL) {
  console.log(`\n--- Importing ${table} from ${filename} ---`);
  let rows;
  try { rows = readCSV(filename); } catch(e) { console.log(`  Skip: ${e.message}`); return; }
  if (!rows.length) { console.log('  No data'); return; }
  console.log(`  ${rows.length} rows`);
  let ok = 0, fail = 0;
  for (const r of rows) {
    try {
      const sql = buildSQL(r);
      if (sql) { await runSQL(sql); ok++; }
    } catch(e) {
      fail++;
      if (fail <= 3) console.error(`  ✗ ${e.message.substring(0, 120)}`);
    }
  }
  console.log(`  Done: ${ok} imported, ${fail} skipped`);
}

async function main() {
  console.log('=== Fix Import Round 2 ===');

  // 1. Connections
  await importOneByOne('connections', 'connections_2026-03-04.csv', r =>
    `INSERT INTO connections (id, sender_id, receiver_id, status, message, created_at, updated_at, responded_at)
     VALUES (${esc(r.id)}, ${esc(r.sender_id)}, ${esc(r.receiver_id)}, ${esc(r.status)},
     ${esc(r.message)}, ${esc(r.created_at)}, ${esc(r.updated_at)}, ${r.responded_at ? esc(r.responded_at) : 'NULL'})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 2. Chat participants
  await importOneByOne('chat_participants', 'chat_participants_2026-03-04.csv', r =>
    `INSERT INTO chat_participants (id, chat_id, member_id, is_muted, joined_at, last_read_at)
     VALUES (${esc(r.id)}, ${esc(r.chat_id)}, ${esc(r.member_id)}, ${r.is_muted || 'false'},
     ${esc(r.joined_at)}, ${r.last_read_at ? esc(r.last_read_at) : 'NULL'})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 3. Messages
  await importOneByOne('messages', 'messages_2026-03-04.csv', r =>
    `INSERT INTO messages (id, chat_id, sender_id, message_type, content, attachments, metadata,
     is_edited, is_deleted, deleted_at, sent_at, created_at, updated_at)
     VALUES (${esc(r.id)}, ${esc(r.chat_id)}, ${esc(r.sender_id)}, ${esc(r.message_type)},
     ${esc(r.content)}, ${r.attachments ? esc(r.attachments) + '::jsonb' : 'NULL'},
     ${r.metadata ? esc(r.metadata) + '::jsonb' : 'NULL'},
     ${r.is_edited || 'false'}, ${r.is_deleted || 'false'}, ${r.deleted_at ? esc(r.deleted_at) : 'NULL'},
     ${esc(r.sent_at)}, ${esc(r.created_at)}, ${esc(r.updated_at)})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 4. Post mentions
  await importOneByOne('post_mentions', 'post_mentions_2026-03-04.csv', r =>
    `INSERT INTO post_mentions (id, post_id, mentioned_user_id, mentioned_association_id, created_at)
     VALUES (${esc(r.id)}, ${esc(r.post_id)}, ${r.mentioned_user_id ? esc(r.mentioned_user_id) : 'NULL'},
     ${r.mentioned_association_id ? esc(r.mentioned_association_id) : 'NULL'}, ${esc(r.created_at)})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 5. Event landing pages - large HTML content
  await importOneByOne('event_landing_pages', 'event_landing_pages_2026-03-04.csv', r =>
    `INSERT INTO event_landing_pages (id, event_id, title, slug, html_content, is_active,
     association_id, created_by, registration_enabled, created_at, updated_at,
     css_content, registration_fee, event_date, event_time, event_venue,
     default_utm_source, default_utm_medium, default_utm_campaign)
     VALUES (${esc(r.id)}, ${r.event_id ? esc(r.event_id) : 'NULL'}, ${esc(r.title)}, ${esc(r.slug)},
     ${esc(rewrite(r.html_content))}, ${r.is_active || 'true'},
     ${r.association_id ? esc(r.association_id) : 'NULL'}, ${r.created_by ? esc(r.created_by) : 'NULL'},
     ${r.registration_enabled || 'false'}, ${esc(r.created_at)}, ${esc(r.updated_at)},
     ${esc(r.css_content)}, ${r.registration_fee || 'NULL'},
     ${r.event_date ? esc(r.event_date) : 'NULL'}, ${r.event_time ? esc(r.event_time) : 'NULL'},
     ${esc(r.event_venue)}, ${esc(r.default_utm_source)}, ${esc(r.default_utm_medium)}, ${esc(r.default_utm_campaign)})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 6. Event landing page pages
  await importOneByOne('event_landing_page_pages', 'event_landing_page_pages_2026-03-04.csv', r =>
    `INSERT INTO event_landing_page_pages (id, landing_page_id, title, slug, html_content, sort_order, is_default, created_at, updated_at)
     VALUES (${esc(r.id)}, ${esc(r.landing_page_id)}, ${esc(r.title)}, ${esc(r.slug)},
     ${esc(rewrite(r.html_content))}, ${r.sort_order || '0'}, ${r.is_default || 'false'},
     ${esc(r.created_at)}, ${esc(r.updated_at)})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 7. Event coupons
  await importOneByOne('event_coupons', 'event_coupons_2026-03-04.csv', r =>
    `INSERT INTO event_coupons (id, landing_page_id, code, name, discount_type, discount_value,
     max_uses, max_uses_per_user, current_uses, valid_from, valid_until, is_active, created_by, created_at, updated_at)
     VALUES (${esc(r.id)}, ${esc(r.landing_page_id)}, ${esc(r.code)}, ${esc(r.name)},
     ${esc(r.discount_type)}, ${r.discount_value || '0'},
     ${r.max_uses || 'NULL'}, ${r.max_uses_per_user || 'NULL'}, ${r.current_uses || '0'},
     ${r.valid_from ? esc(r.valid_from) : 'NULL'}, ${r.valid_until ? esc(r.valid_until) : 'NULL'},
     ${r.is_active || 'true'}, ${r.created_by ? esc(r.created_by) : 'NULL'},
     ${esc(r.created_at)}, ${esc(r.updated_at)})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 8. Event coupon usages
  await importOneByOne('event_coupon_usages', 'event_coupon_usages_2026-03-04.csv', r =>
    `INSERT INTO event_coupon_usages (id, coupon_id, registration_id, email, discount_applied, used_at)
     VALUES (${esc(r.id)}, ${esc(r.coupon_id)}, ${r.registration_id ? esc(r.registration_id) : 'NULL'},
     ${esc(r.email)}, ${r.discount_applied || '0'}, ${esc(r.used_at)})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 9. Event registrations
  await importOneByOne('event_registrations', 'event_registrations_2026-03-04.csv', r =>
    `INSERT INTO event_registrations (id, landing_page_id, coupon_id, first_name, last_name,
     email, phone, status, original_amount, discount_amount, final_amount,
     registration_data, user_id, utm_source, utm_medium, utm_campaign, created_at)
     VALUES (${esc(r.id)}, ${esc(r.landing_page_id)}, ${r.coupon_id ? esc(r.coupon_id) : 'NULL'},
     ${esc(r.first_name)}, ${esc(r.last_name)}, ${esc(r.email)}, ${esc(r.phone)},
     ${esc(r.status)}, ${r.original_amount || '0'}, ${r.discount_amount || '0'}, ${r.final_amount || '0'},
     ${r.registration_data ? esc(r.registration_data) + '::jsonb' : 'NULL'},
     ${r.user_id ? esc(r.user_id) : 'NULL'}, ${esc(r.utm_source)}, ${esc(r.utm_medium)}, ${esc(r.utm_campaign)},
     ${esc(r.created_at)})
     ON CONFLICT (id) DO NOTHING;`
  );

  console.log('\n=== Fix Import Round 2 Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
