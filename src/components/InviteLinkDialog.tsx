import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Copy, CheckCircle2, RefreshCw, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface InviteLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationType: 'association' | 'company';
  organizationName: string;
}

export function InviteLinkDialog({
  open,
  onOpenChange,
  organizationId,
  organizationType,
  organizationName,
}: InviteLinkDialogProps) {
  const [token, setToken] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const linkUrl = token ? `${window.location.origin}/join/${token}` : '';

  useEffect(() => {
    if (open) loadLink();
  }, [open, organizationId]);

  const loadLink = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('invite_links' as any)
        .select('id, token')
        .eq('organization_id', organizationId)
        .eq('organization_type', organizationType)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      setToken((data as any)?.token ?? null);
      setLinkId((data as any)?.id ?? null);
    } catch (err: any) {
      console.error('Error loading invite link:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const { data, error } = await supabase.rpc('create_invite_link' as any, {
        p_organization_id: organizationId,
        p_organization_type: organizationType,
        p_role: organizationType === 'company' ? 'member' : 'manager',
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setToken(data.token);
      setLinkId(data.id);
      toast.success('Invite link generated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate invite link');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleRevoke = async () => {
    if (!linkId) return;
    try {
      setGenerating(true);
      const { data, error } = await supabase.rpc('revoke_invite_link' as any, { p_link_id: linkId });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setToken(null);
      setLinkId(null);
      toast.success('Invite link disabled');
    } catch (err: any) {
      toast.error(err.message || 'Failed to disable invite link');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Invite Link — {organizationName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : token ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share this link to let anyone join directly.
            </p>
            <div className="flex gap-2">
              <Input value={linkUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopy} disabled={generating}>
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Regenerate</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevoke}
                disabled={generating}
                className="text-destructive hover:text-destructive"
              >
                Disable
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">No active invite link. Generate one to share.</p>
            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              Generate Invite Link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
