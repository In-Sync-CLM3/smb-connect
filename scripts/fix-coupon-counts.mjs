const API_URL = 'https://api.supabase.com/v1/projects/rzbtuvuqtuhjfkhgckwp/database/query';
const TOKEN = 'sbp_097229f54511582b264f4377d0ef44f077dfff8f';

async function runSQL(sql) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text.substring(0, 200));
  return JSON.parse(text);
}

// Update current_uses to match actual usage count
const result = await runSQL(`
  UPDATE event_coupons c
  SET current_uses = (SELECT count(*) FROM event_coupon_usages cu WHERE cu.coupon_id = c.id)
  RETURNING code, current_uses;
`);
console.log('Updated coupon counts:');
for (const r of result) console.log(`  ${r.code}: ${r.current_uses}`);
