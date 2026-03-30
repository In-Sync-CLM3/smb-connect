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
    quote: '"',
    escape: '"',
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
  if (!res.ok) throw new Error(`SQL error (${res.status}): ${text}`);
  return text;
}

async function main() {
  // 1. Fix associations - import one by one with proper handling
  console.log('=== Fixing Associations ===');
  const assocs = readCSV('associations_2026-03-04.csv');
  console.log(`  ${assocs.length} associations`);

  // Delete the placeholder we created earlier
  await runSQL("DELETE FROM associations WHERE id = '9cb4672e-6423-429e-a260-1e7ad12f34d5' AND name = 'The Rise' AND description = 'Default association';").catch(() => {});

  for (const a of assocs) {
    const sql = `INSERT INTO associations (id, name, description, logo, website, contact_email, contact_phone,
      address, city, state, country, postal_code, is_active, created_at, updated_at,
      keywords, social_links, founded_year, industry, created_by, cover_image)
    VALUES (
      ${esc(a.id)}, ${esc(a.name)}, ${esc(a.description)},
      ${esc(rewrite(a.logo))}, ${esc(a.website)}, ${esc(a.contact_email)}, ${esc(a.contact_phone)},
      ${esc(a.address)}, ${esc(a.city)}, ${esc(a.state)}, ${esc(a.country)}, ${esc(a.postal_code)},
      ${a.is_active || 'true'}, ${esc(a.created_at)}, ${esc(a.updated_at)},
      ${a.keywords && a.keywords !== '[]' && a.keywords !== '' ? esc(a.keywords) + '::text[]' : "'{}'"},
      ${a.social_links && a.social_links !== '' ? esc(a.social_links) + '::jsonb' : 'NULL'},
      ${a.founded_year || 'NULL'}, ${esc(a.industry)}, ${a.created_by ? esc(a.created_by) : 'NULL'},
      ${esc(rewrite(a.cover_image))}
    ) ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description,
      logo = EXCLUDED.logo, website = EXCLUDED.website,
      contact_email = EXCLUDED.contact_email, contact_phone = EXCLUDED.contact_phone,
      city = EXCLUDED.city, state = EXCLUDED.state, country = EXCLUDED.country,
      is_active = EXCLUDED.is_active, cover_image = EXCLUDED.cover_image;`;
    try {
      await runSQL(sql);
      console.log(`  ✓ ${a.name}`);
    } catch (e) {
      console.error(`  ✗ ${a.name}: ${e.message.substring(0, 150)}`);
    }
  }

  // 2. Fix companies - now that associations exist
  console.log('\n=== Fixing Companies ===');
  const companies = readCSV('companies_2026-03-04.csv');
  for (const c of companies) {
    const sql = `INSERT INTO companies (id, association_id, name, description, logo, website, email, phone,
      address, city, state, country, postal_code, gst_number, pan_number,
      business_type, industry_type, employee_count, year_established,
      is_active, is_verified, verified_at, subscription_tier,
      created_at, updated_at, annual_turnover, created_by, is_default)
    VALUES (
      ${esc(c.id)}, ${esc(c.association_id)}, ${esc(c.name)}, ${esc(c.description)},
      ${esc(rewrite(c.logo))}, ${esc(c.website)}, ${esc(c.email)}, ${esc(c.phone)},
      ${esc(c.address)}, ${esc(c.city)}, ${esc(c.state)}, ${esc(c.country)}, ${esc(c.postal_code)},
      ${esc(c.gst_number)}, ${esc(c.pan_number)}, ${esc(c.business_type)}, ${esc(c.industry_type)},
      ${c.employee_count || 'NULL'}, ${c.year_established || 'NULL'},
      ${c.is_active || 'true'}, ${c.is_verified || 'false'}, ${c.verified_at ? esc(c.verified_at) : 'NULL'},
      ${esc(c.subscription_tier)}, ${esc(c.created_at)}, ${esc(c.updated_at)},
      ${c.annual_turnover || 'NULL'}, ${c.created_by ? esc(c.created_by) : 'NULL'},
      ${c.is_default || 'false'}
    ) ON CONFLICT (id) DO NOTHING;`;
    try {
      await runSQL(sql);
      console.log(`  ✓ ${c.name}`);
    } catch (e) {
      console.error(`  ✗ ${c.name}: ${e.message.substring(0, 150)}`);
    }
  }

  // 3. Re-import profiles with NULL last_name allowed
  console.log('\n=== Fixing Profiles (NULL last_name now allowed) ===');
  const profiles = readCSV('profiles_2026-03-04.csv');
  let profileFixed = 0;
  for (const p of profiles) {
    const sql = `INSERT INTO profiles (id, first_name, last_name, phone, avatar, bio,
      created_at, updated_at, current_context, headline, cover_image,
      location, linkedin_url, twitter_url, website_url, employment_status, open_to_work, email)
    VALUES (
      ${esc(p.id)}, ${esc(p.first_name)}, ${p.last_name ? esc(p.last_name) : 'NULL'},
      ${esc(p.phone)}, ${esc(rewrite(p.avatar))}, ${esc(p.bio)},
      ${esc(p.created_at)}, ${esc(p.updated_at)}, ${esc(p.current_context)}, ${esc(p.headline)},
      ${esc(rewrite(p.cover_image))}, ${esc(p.location)},
      ${esc(p.linkedin_url)}, ${esc(p.twitter_url)}, ${esc(p.website_url)},
      ${esc(p.employment_status)}, ${p.open_to_work || 'false'}, ${esc(p.email)}
    ) ON CONFLICT (id) DO UPDATE SET
      last_name = EXCLUDED.last_name, avatar = EXCLUDED.avatar,
      cover_image = EXCLUDED.cover_image
    WHERE profiles.last_name IS NOT NULL AND EXCLUDED.last_name IS NULL
       OR profiles.avatar != EXCLUDED.avatar
       OR profiles.cover_image != EXCLUDED.cover_image;`;
    try {
      await runSQL(sql);
      profileFixed++;
    } catch (e) {
      // Only log real errors, not conflicts
      if (!e.message.includes('duplicate') && !e.message.includes('conflict')) {
        console.error(`  ✗ ${p.email}: ${e.message.substring(0, 100)}`);
      }
    }
  }
  console.log(`  Profiles processed: ${profileFixed}`);

  // 4. Fix association_managers - now associations exist
  console.log('\n=== Fixing Association Managers ===');
  const managers = readCSV('association_managers_2026-03-04.csv');
  for (const m of managers) {
    const sql = `INSERT INTO association_managers (id, user_id, association_id, role, permissions, is_active, created_at, updated_at)
    VALUES (
      ${esc(m.id)}, ${esc(m.user_id)}, ${esc(m.association_id)}, ${esc(m.role)},
      ${m.permissions ? esc(m.permissions) + '::jsonb' : 'NULL'},
      ${m.is_active || 'true'}, ${esc(m.created_at)}, ${esc(m.updated_at)}
    ) ON CONFLICT (id) DO NOTHING;`;
    try {
      await runSQL(sql);
      console.log(`  ✓ manager ${m.id.substring(0, 8)}`);
    } catch (e) {
      console.error(`  ✗ ${m.id.substring(0, 8)}: ${e.message.substring(0, 100)}`);
    }
  }

  // 5. Fix members - now companies exist
  console.log('\n=== Fixing Members ===');
  const members = readCSV('members_2026-03-04.csv');
  let memFixed = 0, memSkip = 0;
  for (const m of members) {
    const sql = `INSERT INTO members (id, user_id, company_id, role, designation, department,
      permissions, is_active, joined_at, created_at, updated_at, created_by)
    VALUES (
      ${esc(m.id)}, ${esc(m.user_id)}, ${esc(m.company_id)}, ${esc(m.role)},
      ${esc(m.designation)}, ${esc(m.department)},
      ${m.permissions ? esc(m.permissions) + '::jsonb' : 'NULL'},
      ${m.is_active || 'true'}, ${m.joined_at ? esc(m.joined_at) : 'NULL'},
      ${esc(m.created_at)}, ${esc(m.updated_at)},
      ${m.created_by ? esc(m.created_by) : 'NULL'}
    ) ON CONFLICT (id) DO NOTHING;`;
    try {
      await runSQL(sql);
      memFixed++;
    } catch (e) {
      memSkip++;
    }
  }
  console.log(`  Members imported: ${memFixed}, skipped: ${memSkip}`);

  // 6. Fix admin_users
  console.log('\n=== Fixing Admin Users ===');
  const admins = readCSV('admin_users_2026-03-04.csv');
  for (const a of admins) {
    const sql = `INSERT INTO admin_users (id, user_id, is_super_admin, is_active, created_at, updated_at, is_hidden, permissions)
    VALUES (
      ${esc(a.id)}, ${esc(a.user_id)}, ${a.is_super_admin || 'false'}, ${a.is_active || 'true'},
      ${esc(a.created_at)}, ${esc(a.updated_at)}, ${a.is_hidden || 'false'},
      ${a.permissions ? esc(a.permissions) + '::jsonb' : 'NULL'}
    ) ON CONFLICT (id) DO NOTHING;`;
    try {
      await runSQL(sql);
      console.log(`  ✓ admin ${a.user_id.substring(0, 8)}`);
    } catch (e) {
      console.error(`  ✗ ${a.user_id.substring(0, 8)}: ${e.message.substring(0, 100)}`);
    }
  }

  console.log('\n=== Fix Import Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
