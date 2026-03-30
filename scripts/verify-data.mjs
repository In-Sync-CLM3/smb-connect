const API_URL = 'https://api.supabase.com/v1/projects/rzbtuvuqtuhjfkhgckwp/database/query';
const TOKEN = 'sbp_097229f54511582b264f4377d0ef44f077dfff8f';

async function runSQL(sql) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return JSON.parse(await res.text());
}

async function main() {
  console.log('=== Verifying Landing Pages ===');
  const lps = await runSQL(`SELECT id, title, slug, is_active, registration_enabled, registration_fee, event_date FROM event_landing_pages;`);
  for (const lp of lps) {
    console.log(`  ${lp.title} | slug: ${lp.slug} | active: ${lp.is_active} | reg: ${lp.registration_enabled} | fee: ${lp.registration_fee} | date: ${lp.event_date}`);
  }

  console.log('\n=== Landing Page Pages ===');
  const pages = await runSQL(`SELECT p.id, p.title, p.slug, p.landing_page_id, p.is_default, p.sort_order, lp.title as lp_title
    FROM event_landing_page_pages p
    LEFT JOIN event_landing_pages lp ON p.landing_page_id = lp.id;`);
  for (const p of pages) {
    console.log(`  ${p.title} | slug: ${p.slug} | parent: ${p.lp_title} | default: ${p.is_default} | order: ${p.sort_order}`);
  }

  // Check if HTML content has old project URLs
  const oldRefs = await runSQL(`SELECT id, title FROM event_landing_pages WHERE html_content LIKE '%jqynxytwngtytvuzucuo%';`);
  console.log(`\n  Pages with old project URLs in HTML: ${oldRefs.length}`);
  const oldRefs2 = await runSQL(`SELECT id, title FROM event_landing_page_pages WHERE html_content LIKE '%jqynxytwngtytvuzucuo%';`);
  console.log(`  Sub-pages with old project URLs in HTML: ${oldRefs2.length}`);

  console.log('\n=== Verifying Coupons ===');
  const coupons = await runSQL(`SELECT c.id, c.code, c.name, c.discount_type, c.discount_value, c.is_active, c.current_uses, c.max_uses,
    lp.title as landing_page
    FROM event_coupons c
    LEFT JOIN event_landing_pages lp ON c.landing_page_id = lp.id;`);
  for (const c of coupons) {
    console.log(`  ${c.code} (${c.name}) | ${c.discount_type}: ${c.discount_value} | active: ${c.is_active} | uses: ${c.current_uses}/${c.max_uses || '∞'} | page: ${c.landing_page}`);
  }

  console.log('\n=== Coupon Usages ===');
  const usages = await runSQL(`SELECT cu.email, cu.discount_applied, c.code, cu.registration_id
    FROM event_coupon_usages cu
    LEFT JOIN event_coupons c ON cu.coupon_id = c.id
    LIMIT 5;`);
  for (const u of usages) {
    console.log(`  ${u.email} used ${u.code} | discount: ${u.discount_applied} | reg: ${u.registration_id ? 'linked' : 'unlinked'}`);
  }

  // Verify coupon usage counts match
  const usageCounts = await runSQL(`SELECT c.code, c.current_uses, count(cu.id) as actual_uses
    FROM event_coupons c
    LEFT JOIN event_coupon_usages cu ON cu.coupon_id = c.id
    GROUP BY c.id, c.code, c.current_uses;`);
  console.log('\n  Coupon usage count verification:');
  for (const u of usageCounts) {
    const match = u.current_uses == u.actual_uses ? '✓' : '✗ MISMATCH';
    console.log(`    ${u.code}: stored=${u.current_uses}, actual=${u.actual_uses} ${match}`);
  }

  console.log('\n=== Verifying Connections ===');
  const connStats = await runSQL(`SELECT status, count(*) FROM connections GROUP BY status;`);
  console.log('  By status:');
  for (const s of connStats) console.log(`    ${s.status}: ${s.count}`);

  // Check FK integrity
  const brokenSender = await runSQL(`SELECT count(*) FROM connections c WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.id = c.sender_id);`);
  const brokenReceiver = await runSQL(`SELECT count(*) FROM connections c WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.id = c.receiver_id);`);
  console.log(`\n  Broken sender FK refs: ${brokenSender[0].count}`);
  console.log(`  Broken receiver FK refs: ${brokenReceiver[0].count}`);

  // Check registrations linked to landing pages
  console.log('\n=== Registrations per Landing Page ===');
  const regStats = await runSQL(`SELECT lp.title, count(r.id) as registrations
    FROM event_landing_pages lp
    LEFT JOIN event_registrations r ON r.landing_page_id = lp.id
    GROUP BY lp.id, lp.title;`);
  for (const r of regStats) console.log(`  ${r.title}: ${r.registrations} registrations`);

  console.log('\n=== Verification Complete ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
