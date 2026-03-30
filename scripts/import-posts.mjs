import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { join } from 'path';

const CSV_DIR = 'C:\\Users\\admin\\Downloads\\CSV';
const API_URL = 'https://api.supabase.com/v1/projects/rzbtuvuqtuhjfkhgckwp/database/query';
const TOKEN = 'sbp_097229f54511582b264f4377d0ef44f077dfff8f';
const OLD_PROJECT = 'jqynxytwngtytvuzucuo';
const NEW_PROJECT = 'rzbtuvuqtuhjfkhgckwp';

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

const filepath = join(CSV_DIR, 'posts_2026-03-04.csv');
const content = readFileSync(filepath, 'utf-8').replace(/^\uFEFF/, '');

// Try strict quote parsing (no relax_quotes) to handle multiline content
const rows = parse(content, {
  columns: true,
  skip_empty_lines: true,
  quote: '"',
  escape: '"',
});
console.log(`Parsed ${rows.length} posts (strict mode)`);

// If still low, try with relax options
if (rows.length < 20) {
  console.log('Trying relaxed mode...');
  const rows2 = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  });
  console.log(`Relaxed mode: ${rows2.length} rows`);
}

let ok = 0, fail = 0, dup = 0;
for (const r of rows) {
  try {
    const sql = `INSERT INTO posts (id, user_id, content, image_url, likes_count, comments_count,
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
     ON CONFLICT (id) DO NOTHING;`;
    await runSQL(sql);
    ok++;
  } catch(e) {
    fail++;
    if (fail <= 5) console.error(`  ✗ ${r.id?.substring(0,8)}: ${e.message.substring(0, 150)}`);
  }
}

// Check final count
const result = await runSQL('SELECT count(*) FROM posts;');
const count = JSON.parse(result)[0]?.count;
console.log(`\nDone: ${ok} new, ${fail} failed. Total posts in DB: ${count}`);
