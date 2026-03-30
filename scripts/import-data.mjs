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
  const content = readFileSync(filepath, 'utf-8').replace(/^\uFEFF/, ''); // strip BOM
  const records = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });
  return records;
}

function escapeSQL(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  const s = String(val);
  return "'" + s.replace(/'/g, "''") + "'";
}

function rewriteUrls(val) {
  if (!val) return val;
  return String(val).replaceAll(OLD_PROJECT, NEW_PROJECT);
}

async function runSQL(sql) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SQL error (${res.status}): ${text}`);
  }
  return text;
}

// Build INSERT for a batch of rows
function buildInsert(table, rows, columns, urlColumns = [], jsonColumns = []) {
  if (rows.length === 0) return null;

  const valueParts = rows.map(row => {
    const vals = columns.map(col => {
      let val = row[col];
      if (val === undefined || val === null || val === '') return 'NULL';

      // Rewrite URLs
      if (urlColumns.includes(col)) {
        val = rewriteUrls(val);
      }

      // Handle JSON columns
      if (jsonColumns.includes(col)) {
        if (val === 'NULL' || val === '') return 'NULL';
        return escapeSQL(val) + '::jsonb';
      }

      // Handle booleans
      if (val === 'true' || val === 'false') return val;

      return escapeSQL(val);
    });
    return `(${vals.join(', ')})`;
  });

  return `INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(', ')}) VALUES\n${valueParts.join(',\n')}\nON CONFLICT DO NOTHING;`;
}

// Import in batches
async function importTable(table, filename, columns, urlColumns = [], jsonColumns = [], schema = 'public') {
  const fullTable = schema === 'public' ? table : `${schema}.${table}`;
  console.log(`\n--- Importing ${fullTable} from ${filename} ---`);

  let rows;
  try {
    rows = readCSV(filename);
  } catch (e) {
    console.log(`  Skipped: ${e.message}`);
    return;
  }

  if (rows.length === 0) {
    console.log('  No data to import');
    return;
  }

  console.log(`  ${rows.length} rows to import`);

  // Filter columns to only those present in CSV
  const csvColumns = Object.keys(rows[0]);
  const validColumns = columns.filter(c => csvColumns.includes(c));

  const BATCH_SIZE = 50;
  let imported = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const sql = buildInsert(fullTable, batch, validColumns, urlColumns, jsonColumns);
    if (!sql) continue;

    try {
      await runSQL(sql);
      imported += batch.length;
      if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= rows.length) {
        console.log(`  Progress: ${Math.min(imported, rows.length)}/${rows.length}`);
      }
    } catch (e) {
      console.error(`  Error at batch ${i}: ${e.message.substring(0, 200)}`);
      // Try one-by-one for failed batch
      for (const row of batch) {
        const singleSql = buildInsert(fullTable, [row], validColumns, urlColumns, jsonColumns);
        try {
          await runSQL(singleSql);
          imported++;
        } catch (e2) {
          console.error(`  Skipped row: ${e2.message.substring(0, 150)}`);
        }
      }
    }
  }

  console.log(`  Done: ${imported} rows imported`);
}

async function main() {
  console.log('=== SMB Connect Data Import ===\n');

  // Note: Cannot disable system triggers on Supabase hosted.
  // Import order handles FK dependencies instead.

  // 1. Import auth.users
  console.log('\n=== Phase 1: Auth Users ===');
  const authUsers = readCSV('auth_users_2026-03-04.csv');
  console.log(`  ${authUsers.length} users to import`);

  const AUTH_BATCH = 50;
  let authImported = 0;
  for (let i = 0; i < authUsers.length; i += AUTH_BATCH) {
    const batch = authUsers.slice(i, i + AUTH_BATCH);
    const values = batch.map(u => {
      const id = escapeSQL(u.id);
      const email = escapeSQL(u.email);
      const phone = u.phone ? escapeSQL(u.phone) : 'NULL';
      const emailConfirmed = u.email_confirmed_at ? escapeSQL(u.email_confirmed_at) : 'NULL';
      const createdAt = escapeSQL(u.created_at);
      const updatedAt = escapeSQL(u.updated_at);
      const lastSignIn = u.last_sign_in_at ? escapeSQL(u.last_sign_in_at) : 'NULL';
      const metadata = escapeSQL(JSON.stringify({
        sub: u.id,
        email: u.email,
        first_name: u.first_name || '',
        last_name: u.last_name || '',
      }));

      return `(
        '00000000-0000-0000-0000-000000000000',
        ${id},
        'authenticated',
        'authenticated',
        ${email},
        crypt('TempPass123!', gen_salt('bf')),
        ${emailConfirmed},
        '{"provider":"email","providers":["email"]}'::jsonb,
        ${metadata}::jsonb,
        ${createdAt},
        ${updatedAt},
        ${lastSignIn},
        ${phone},
        '', '', '', ''
      )`;
    }).join(',\n');

    const sql = `
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, last_sign_in_at, phone,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES ${values}
      ON CONFLICT (id) DO NOTHING;
    `;

    try {
      await runSQL(sql);
      authImported += batch.length;
    } catch (e) {
      console.error(`  Auth batch error: ${e.message.substring(0, 200)}`);
      // Try one by one
      for (const u of batch) {
        try {
          const singleValues = `(
            '00000000-0000-0000-0000-000000000000',
            ${escapeSQL(u.id)},
            'authenticated', 'authenticated',
            ${escapeSQL(u.email)},
            crypt('TempPass123!', gen_salt('bf')),
            ${u.email_confirmed_at ? escapeSQL(u.email_confirmed_at) : 'NULL'},
            '{"provider":"email","providers":["email"]}'::jsonb,
            ${escapeSQL(JSON.stringify({ sub: u.id, email: u.email, first_name: u.first_name || '', last_name: u.last_name || '' }))}::jsonb,
            ${escapeSQL(u.created_at)}, ${escapeSQL(u.updated_at)},
            ${u.last_sign_in_at ? escapeSQL(u.last_sign_in_at) : 'NULL'},
            ${u.phone ? escapeSQL(u.phone) : 'NULL'},
            '', '', '', ''
          )`;
          await runSQL(`INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at, phone, confirmation_token, email_change, email_change_token_new, recovery_token) VALUES ${singleValues} ON CONFLICT (id) DO NOTHING;`);
          authImported++;
        } catch (e2) {
          console.error(`  Skipped user ${u.email}: ${e2.message.substring(0, 100)}`);
        }
      }
    }
  }
  console.log(`  Auth users imported: ${authImported}`);

  // Create auth.identities for each user
  console.log('  Creating identity records...');
  try {
    await runSQL(`
      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      SELECT u.id::text, u.id,
        jsonb_build_object('sub', u.id::text, 'email', u.email),
        'email', u.last_sign_in_at, u.created_at, u.updated_at
      FROM auth.users u
      WHERE NOT EXISTS (
        SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
      );
    `);
    console.log('  Identities created');
  } catch (e) {
    console.error(`  Identity error: ${e.message.substring(0, 200)}`);
  }

  // 2. Import associations
  console.log('\n=== Phase 2: Core Tables ===');
  await importTable('associations', 'associations_2026-03-04.csv',
    ['id', 'name', 'description', 'logo', 'website', 'contact_email', 'contact_phone',
     'address', 'city', 'state', 'country', 'postal_code', 'is_active',
     'created_at', 'updated_at', 'keywords', 'social_links', 'founded_year',
     'industry', 'created_by', 'cover_image'],
    ['logo', 'cover_image'],
    ['social_links']
  );

  // 3. Import companies
  await importTable('companies', 'companies_2026-03-04.csv',
    ['id', 'association_id', 'name', 'description', 'logo', 'website', 'email', 'phone',
     'address', 'city', 'state', 'country', 'postal_code', 'gst_number', 'pan_number',
     'business_type', 'industry_type', 'employee_count', 'year_established',
     'is_active', 'is_verified', 'verified_at', 'subscription_tier',
     'created_at', 'updated_at', 'annual_turnover', 'created_by', 'is_default'],
    ['logo']
  );

  // 4. Import profiles
  await importTable('profiles', 'profiles_2026-03-04.csv',
    ['id', 'first_name', 'last_name', 'phone', 'avatar', 'bio',
     'created_at', 'updated_at', 'current_context', 'headline',
     'cover_image', 'location', 'linkedin_url', 'twitter_url', 'website_url',
     'employment_status', 'open_to_work', 'email'],
    ['avatar', 'cover_image']
  );

  // 5. Import admin_users
  await importTable('admin_users', 'admin_users_2026-03-04.csv',
    ['id', 'user_id', 'is_super_admin', 'is_active', 'created_at', 'updated_at',
     'is_hidden', 'permissions'],
    [],
    ['permissions']
  );

  // 6. Import association_managers
  await importTable('association_managers', 'association_managers_2026-03-04.csv',
    ['id', 'user_id', 'association_id', 'role', 'permissions', 'is_active',
     'created_at', 'updated_at'],
    [],
    ['permissions']
  );

  // 7. Import company_admins
  await importTable('company_admins', 'company_admins_2026-03-04.csv',
    ['id', 'user_id', 'company_id', 'is_active', 'created_at', 'updated_at']
  );

  // 8. Import members
  await importTable('members', 'members_2026-03-04.csv',
    ['id', 'user_id', 'company_id', 'role', 'designation', 'department',
     'permissions', 'is_active', 'joined_at', 'created_at', 'updated_at', 'created_by'],
    [],
    ['permissions']
  );

  // 9. Profile-related tables
  console.log('\n=== Phase 3: Profile Content ===');
  await importTable('work_experience', 'work_experience_2026-03-04.csv',
    ['id', 'user_id', 'title', 'company', 'location', 'start_date', 'end_date',
     'is_current', 'description', 'display_order', 'created_at', 'updated_at']
  );

  await importTable('education', 'education_2026-03-04.csv',
    ['id', 'user_id', 'school', 'degree', 'field_of_study', 'grade',
     'start_date', 'end_date', 'description', 'display_order', 'created_at', 'updated_at']
  );

  await importTable('certifications', 'certifications_2026-03-04.csv',
    ['id', 'user_id', 'name', 'issuing_organization', 'issue_date', 'expiration_date',
     'credential_id', 'credential_url', 'certificate_file_url', 'display_order',
     'created_at', 'updated_at'],
    ['certificate_file_url']
  );

  await importTable('skills', 'skills_2026-03-04.csv',
    ['id', 'user_id', 'skill_name', 'endorsements_count', 'display_order', 'created_at']
  );

  // 10. Social
  console.log('\n=== Phase 4: Social ===');
  await importTable('connections', 'connections_2026-03-04.csv',
    ['id', 'sender_id', 'receiver_id', 'status', 'message', 'responded_at',
     'created_at', 'updated_at']
  );

  await importTable('posts', 'posts_2026-03-04.csv',
    ['id', 'user_id', 'content', 'image_url', 'video_url', 'document_url',
     'organization_id', 'likes_count', 'comments_count', 'shares_count',
     'reposts_count', 'original_post_id', 'original_author_id', 'post_context',
     'created_at', 'updated_at'],
    ['image_url', 'video_url', 'document_url']
  );

  await importTable('post_likes', 'post_likes_2026-03-04.csv',
    ['id', 'post_id', 'user_id', 'created_at']
  );

  await importTable('post_comments', 'post_comments_2026-03-04.csv',
    ['id', 'post_id', 'user_id', 'content', 'created_at', 'updated_at']
  );

  await importTable('post_shares', 'post_shares_2026-03-04.csv',
    ['id', 'post_id', 'user_id', 'platform', 'created_at']
  );

  await importTable('post_bookmarks', 'post_bookmarks_2026-03-04.csv',
    ['id', 'post_id', 'user_id', 'created_at']
  );

  await importTable('post_mentions', 'post_mentions_2026-03-04.csv',
    ['id', 'post_id', 'mentioned_user_id', 'mentioned_association_id', 'created_at']
  );

  // 11. Messaging
  console.log('\n=== Phase 5: Messaging ===');
  await importTable('chats', 'chats_2026-03-04.csv',
    ['id', 'type', 'name', 'last_message_at', 'created_at', 'updated_at']
  );

  await importTable('chat_participants', 'chat_participants_2026-03-04.csv',
    ['id', 'chat_id', 'member_id', 'is_muted', 'joined_at', 'last_read_at']
  );

  await importTable('messages', 'messages_2026-03-04.csv',
    ['id', 'chat_id', 'sender_id', 'message_type', 'content', 'attachments',
     'metadata', 'is_edited', 'is_deleted', 'deleted_at', 'sent_at',
     'created_at', 'updated_at'],
    [],
    ['attachments', 'metadata']
  );

  // 12. Email
  console.log('\n=== Phase 6: Email ===');
  await importTable('email_lists', 'email_lists_2026-03-04.csv',
    ['id', 'name', 'description', 'association_id', 'company_id', 'created_by',
     'total_recipients', 'created_at', 'updated_at']
  );

  await importTable('email_list_recipients', 'email_list_recipients_2026-03-04.csv',
    ['id', 'list_id', 'email', 'name', 'metadata', 'created_at'],
    [],
    ['metadata']
  );

  await importTable('email_campaigns', 'email_campaigns_2026-03-04.csv',
    ['id', 'list_id', 'subject', 'sender_name', 'sender_email', 'sent_at',
     'created_by', 'association_id', 'company_id', 'external_campaign_id',
     'total_recipients', 'total_sent', 'total_delivered', 'total_opened',
     'total_clicked', 'total_bounced', 'total_complained', 'total_unsubscribed',
     'open_rate', 'click_rate', 'bounce_rate', 'created_at', 'updated_at']
  );

  await importTable('email_campaign_recipients', 'email_campaign_recipients_2026-03-04.csv',
    ['id', 'campaign_id', 'email', 'name', 'sent', 'sent_at', 'delivered',
     'delivered_at', 'opened', 'first_opened_at', 'last_opened_at', 'open_count',
     'clicked', 'first_clicked_at', 'last_clicked_at', 'click_count',
     'bounced', 'bounced_at', 'complained', 'unsubscribed',
     'external_message_id', 'created_at', 'updated_at']
  );

  await importTable('email_campaign_events', 'email_campaign_events_2026-03-04.csv',
    ['id', 'campaign_id', 'recipient_id', 'event_type', 'occurred_at',
     'recipient_email', 'external_message_id', 'ip_address', 'user_agent',
     'event_data', 'created_at'],
    [],
    ['event_data']
  );

  // 13. Events
  console.log('\n=== Phase 7: Events ===');
  await importTable('events', 'events_2026-03-04.csv',
    ['id', 'title', 'description', 'start_date', 'end_date', 'location',
     'event_type', 'event_link', 'thumbnail_url', 'link_preview_title',
     'link_preview_description', 'link_preview_image', 'created_by',
     'created_at', 'updated_at'],
    ['thumbnail_url', 'link_preview_image']
  );

  await importTable('event_landing_pages', 'event_landing_pages_2026-03-04.csv',
    ['id', 'association_id', 'event_id', 'title', 'slug', 'html_content',
     'css_content', 'registration_enabled', 'registration_fee', 'event_venue',
     'event_date', 'event_time', 'default_utm_source', 'default_utm_medium',
     'default_utm_campaign', 'is_active', 'created_by', 'created_at', 'updated_at']
  );

  await importTable('event_landing_page_pages', 'event_landing_page_pages_2026-03-04.csv',
    ['id', 'landing_page_id', 'title', 'slug', 'html_content', 'sort_order',
     'is_default', 'created_at', 'updated_at']
  );

  await importTable('event_coupons', 'event_coupons_2026-03-04.csv',
    ['id', 'landing_page_id', 'code', 'name', 'discount_type', 'discount_value',
     'max_uses', 'max_uses_per_user', 'current_uses', 'valid_from', 'valid_until',
     'is_active', 'created_by', 'created_at', 'updated_at']
  );

  await importTable('event_coupon_usages', 'event_coupon_usages_2026-03-04.csv',
    ['id', 'coupon_id', 'registration_id', 'email', 'discount_applied', 'used_at']
  );

  await importTable('event_registrations', 'event_registrations_2026-03-04.csv',
    ['id', 'landing_page_id', 'coupon_id', 'first_name', 'last_name', 'email',
     'phone', 'status', 'original_amount', 'discount_amount', 'final_amount',
     'registration_data', 'user_id', 'utm_source', 'utm_medium', 'utm_campaign',
     'created_at'],
    [],
    ['registration_data']
  );

  // 14. Invitations
  console.log('\n=== Phase 8: Invitations & Misc ===');
  await importTable('member_invitations', 'member_invitations_2026-03-04.csv',
    ['id', 'email', 'first_name', 'last_name', 'organization_id', 'organization_type',
     'role', 'designation', 'department', 'token', 'token_hash', 'status',
     'invited_by', 'expires_at', 'accepted_at', 'accepted_by', 'revoked_at',
     'revoked_by', 'created_at', 'updated_at']
  );

  await importTable('member_invitation_audit', 'member_invitation_audit_2026-03-04.csv',
    ['id', 'invitation_id', 'action', 'performed_by', 'ip_address', 'user_agent', 'created_at']
  );

  await importTable('company_invitations', 'company_invitations_2026-03-04.csv',
    ['id', 'association_id', 'email', 'company_name', 'token', 'status',
     'invited_by', 'expires_at', 'accepted_at', 'created_at']
  );

  await importTable('password_reset_otps', 'password_reset_otps_2026-03-04.csv',
    ['id', 'email', 'otp_code', 'used', 'used_at', 'expires_at', 'created_at']
  );

  // 15. Notifications & Audit
  await importTable('notifications', 'notifications_2026-03-04.csv',
    ['id', 'user_id', 'type', 'category', 'title', 'message', 'data',
     'link', 'is_read', 'read_at', 'created_at'],
    [],
    ['data']
  );

  await importTable('audit_logs', 'audit_logs_2026-03-04.csv',
    ['id', 'user_id', 'action', 'resource', 'resource_id', 'changes',
     'ip_address', 'user_agent', 'is_hidden_admin_action', 'created_at'],
    [],
    ['changes']
  );

  // Triggers were kept active throughout import.

  console.log('\n=== Import Complete ===');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
