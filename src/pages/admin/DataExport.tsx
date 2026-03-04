import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { BackButton } from '@/components/BackButton';
import { Download, Loader2, CheckSquare, Square } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

const EXPORTABLE_TABLES = [
  'profiles', 'associations', 'association_managers', 'association_requests',
  'companies', 'company_admins', 'company_invitations', 'company_requests',
  'connections', 'members', 'member_invitations', 'member_invitation_audit',
  'events', 'event_registrations', 'event_landing_pages', 'event_landing_page_pages',
  'event_coupons', 'event_coupon_usages', 'event_requisitions',
  'posts', 'post_likes', 'post_comments', 'post_shares', 'post_bookmarks', 'post_mentions',
  'notifications', 'chats', 'chat_participants', 'messages',
  'email_lists', 'email_list_recipients', 'email_campaigns', 'email_campaign_recipients',
  'email_campaign_events', 'email_conversations', 'email_messages', 'email_templates',
  'whatsapp_lists', 'whatsapp_list_recipients',
  'analytics_events', 'audit_logs',
  'skills', 'work_experience', 'education', 'certifications',
  'key_functionaries', 'admin_users', 'password_reset_otps',
] as const;

type TableName = typeof EXPORTABLE_TABLES[number];

function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function convertToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const headerRow = headers.map(escapeCSVValue).join(',');
  const rows = data.map(row => headers.map(h => escapeCSVValue(row[h])).join(','));
  return [headerRow, ...rows].join('\n');
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchAllRows(tableName: string): Promise<Record<string, unknown>[]> {
  let allData: Record<string, unknown>[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(tableName as any)
      .select('*')
      .range(from, from + step - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = [...allData, ...(data as unknown as Record<string, unknown>[])];
    if (data.length < step) break;
    from += step;
  }
  return allData;
}

export default function DataExport() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<TableName>>(new Set());
  const [exporting, setExporting] = useState<Set<string>>(new Set());
  const [rowCounts, setRowCounts] = useState<Record<string, number>>({});

  const toggleTable = (table: TableName) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(table) ? next.delete(table) : next.add(table);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === EXPORTABLE_TABLES.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(EXPORTABLE_TABLES));
    }
  };

  const exportTable = async (table: TableName) => {
    setExporting(prev => new Set(prev).add(table));
    try {
      const data = await fetchAllRows(table);
      setRowCounts(prev => ({ ...prev, [table]: data.length }));
      if (data.length === 0) {
        toast({ title: `${table}`, description: 'No data found in this table.' });
        return;
      }
      const csv = convertToCSV(data);
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadCSV(csv, `${table}_${timestamp}.csv`);
      toast({ title: 'Downloaded', description: `${table} — ${data.length} rows` });
    } catch (error: any) {
      console.error(`Export error for ${table}:`, error);
      toast({ title: 'Export Failed', description: `${table}: ${error.message}`, variant: 'destructive' });
    } finally {
      setExporting(prev => { const n = new Set(prev); n.delete(table); return n; });
    }
  };

  const exportSelected = async () => {
    if (selected.size === 0) {
      toast({ title: 'No tables selected', description: 'Please select at least one table.', variant: 'destructive' });
      return;
    }
    for (const table of selected) {
      await exportTable(table);
    }
  };

  const isAnyExporting = exporting.size > 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto py-4 md:pl-20 flex items-center gap-3">
          <BackButton fallbackPath="/admin/actions" variant="ghost" />
          <div>
            <h1 className="text-2xl font-bold">Data Export</h1>
            <p className="text-sm text-muted-foreground">Download database tables as CSV for backup</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-4 md:py-8 md:pl-20 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Select Tables</CardTitle>
                <CardDescription>Choose tables to export. {selected.size} of {EXPORTABLE_TABLES.length} selected.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {selected.size === EXPORTABLE_TABLES.length ? <CheckSquare className="w-4 h-4 mr-1" /> : <Square className="w-4 h-4 mr-1" />}
                  {selected.size === EXPORTABLE_TABLES.length ? 'Deselect All' : 'Select All'}
                </Button>
                <Button size="sm" onClick={exportSelected} disabled={isAnyExporting || selected.size === 0}>
                  {isAnyExporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                  Download Selected
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {EXPORTABLE_TABLES.map(table => (
                <div
                  key={table}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selected.has(table)}
                      onCheckedChange={() => toggleTable(table)}
                      disabled={isAnyExporting}
                    />
                    <span className="text-sm font-mono">{table}</span>
                    {rowCounts[table] !== undefined && (
                      <Badge variant="secondary" className="text-xs">{rowCounts[table]} rows</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => exportTable(table)}
                    disabled={exporting.has(table)}
                    className="h-8 w-8"
                  >
                    {exporting.has(table) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
