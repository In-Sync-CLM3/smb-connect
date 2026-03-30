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
      if (fail <= 5) console.error(`  ✗ ${e.message.substring(0, 200)}`);
    }
  }
  console.log(`  Done: ${ok} imported, ${fail} skipped`);
}

async function main() {
  console.log('=== Fix Import Round 3 ===');

  // 1. Event landing page pages (slug now nullable)
  await importOneByOne('event_landing_page_pages', 'event_landing_page_pages_2026-03-04.csv', r =>
    `INSERT INTO event_landing_page_pages (id, landing_page_id, title, slug, html_content, sort_order, is_default, created_at, updated_at)
     VALUES (${esc(r.id)}, ${esc(r.landing_page_id)}, ${esc(r.title)}, ${r.slug ? esc(r.slug) : 'NULL'},
     ${esc(rewrite(r.html_content))}, ${r.sort_order || '0'}, ${r.is_default || 'false'},
     ${esc(r.created_at)}, ${esc(r.updated_at)})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 2. Posts - correct column names: user_id, image_url, video_url, document_url, post_context, organization_id
  await importOneByOne('posts', 'posts_2026-03-04.csv', r =>
    `INSERT INTO posts (id, user_id, content, image_url, likes_count, comments_count,
     created_at, updated_at, original_post_id, original_author_id, video_url,
     shares_count, reposts_count, post_context, organization_id, document_url)
     VALUES (${esc(r.id)}, ${esc(r.user_id)}, ${esc(r.content)}, ${esc(rewrite(r.image_url))},
     ${r.likes_count || '0'}, ${r.comments_count || '0'},
     ${esc(r.created_at)}, ${esc(r.updated_at)},
     ${r.original_post_id ? esc(r.original_post_id) : 'NULL'},
     ${r.original_author_id ? esc(r.original_author_id) : 'NULL'},
     ${esc(rewrite(r.video_url))}, ${r.shares_count || '0'}, ${r.reposts_count || '0'},
     ${esc(r.post_context)}, ${r.organization_id ? esc(r.organization_id) : 'NULL'},
     ${esc(rewrite(r.document_url))})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 3. Event coupon usages - try with looser FK handling
  await importOneByOne('event_coupon_usages', 'event_coupon_usages_2026-03-04.csv', r =>
    `INSERT INTO event_coupon_usages (id, coupon_id, registration_id, email, discount_applied, used_at)
     VALUES (${esc(r.id)}, ${esc(r.coupon_id)}, ${r.registration_id ? esc(r.registration_id) : 'NULL'},
     ${esc(r.email)}, ${r.discount_applied || '0'}, ${esc(r.used_at)})
     ON CONFLICT (id) DO NOTHING;`
  );

  // 4. Check current counts
  console.log('\n=== Current Table Counts ===');
  const tables = ['posts', 'event_landing_page_pages', 'event_coupon_usages', 'connections', 'chat_participants', 'messages'];
  for (const t of tables) {
    try {
      const result = await runSQL(`SELECT count(*) FROM ${t};`);
      const parsed = JSON.parse(result);
      console.log(`  ${t}: ${parsed[0]?.count || 0}`);
    } catch(e) {
      console.log(`  ${t}: error - ${e.message.substring(0, 80)}`);
    }
  }

  console.log('\n=== Fix Import Round 3 Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
