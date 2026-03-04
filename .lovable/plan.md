

# Database-Level CSV Export via Edge Function

## Problem
The current client-side approach is limited by RLS policies and the JS client's constraints. The user wants a proper database-level export that bypasses RLS and handles all tables reliably.

## Approach
Create an edge function `export-table-csv` that uses the **service role key** (already configured) to query any table directly at the database level, bypassing RLS. It returns raw CSV data as a downloadable response.

## Implementation

### 1. Create edge function: `supabase/functions/export-table-csv/index.ts`
- Accepts `{ table: string }` or `{ tables: string[] }` in POST body
- Validates the table name against an allowlist (prevents SQL injection)
- Uses `createClient` with `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS
- Fetches all rows using paginated `.range()` calls with service role
- Converts to CSV server-side and returns as `text/csv` with `Content-Disposition` header
- Authenticates the caller and verifies they are an admin via `admin_users` table

### 2. Update `src/pages/admin/DataExport.tsx`
- Replace the client-side `fetchAllRows` with calls to the edge function
- The edge function returns CSV directly, so the client just triggers the download
- Keep the same UI (table selection, checkboxes, download buttons)

### 3. Config
- Add function config in `supabase/config.toml` with `verify_jwt = false` (auth checked in code)

## Key Details
- **Security**: Edge function verifies the caller is an active admin before allowing export
- **No RLS limits**: Service role key bypasses all RLS policies
- **No row limits**: Paginated fetching server-side ensures all rows are captured
- **Allowlist**: Only pre-approved table names are accepted, preventing arbitrary table access

### Files
- **Create**: `supabase/functions/export-table-csv/index.ts`
- **Modify**: `src/pages/admin/DataExport.tsx` (call edge function instead of client queries)
- **Modify**: `supabase/config.toml` (add function config)

