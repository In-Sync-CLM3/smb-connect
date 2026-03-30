import { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useImageUpload } from '@/hooks/useImageUpload';
import { quillModules, quillFormats } from '@/lib/quillConfig';
import 'react-quill/dist/quill.snow.css';

const ReactQuill = lazy(() => import('react-quill'));

interface BulkSendAssociationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  associationIds: string[];
}

export function BulkSendAssociationsDialog({
  open,
  onOpenChange,
  associationIds,
}: BulkSendAssociationsDialogProps) {
  const { toast } = useToast();
  const quillRef = useRef<any>(null);
  const { imageInputRef, uploadingImage, handleImageUpload } = useImageUpload(quillRef, {
    bucket: 'profile-images',
    pathPrefix: 'email-images',
  });
  const [loading, setLoading] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [associationNames, setAssociationNames] = useState<string[]>([]);
  
  // Email fields
  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  
  // WhatsApp fields
  const [whatsappMessage, setWhatsappMessage] = useState('');

  useEffect(() => {
    if (open && associationIds.length > 0) {
      loadRecipientInfo();
    }
  }, [open, associationIds]);

  const loadRecipientInfo = async () => {
    try {
      const { data: associations } = await supabase
        .from('associations')
        .select('name, contact_email, contact_phone')
        .in('id', associationIds);
      
      if (associations) {
        setAssociationNames(associations.map(a => a.name));
        setRecipientCount(associations.length);
      }
    } catch (error) {
      console.error('Error loading recipient info:', error);
    }
  };

  const handleSendEmail = async () => {
    if (!senderEmail || !emailSubject || !emailBody) {
      toast({
        title: 'Error',
        description: 'Please fill in all required email fields',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: associations } = await supabase
        .from('associations')
        .select('contact_email')
        .in('id', associationIds);

      if (!associations || associations.length === 0) {
        throw new Error('No associations found');
      }

      let sent = 0;
      let failed = 0;

      for (const association of associations) {
        if (!association.contact_email) {
          failed++;
          continue;
        }

        const { error } = await supabase.functions.invoke('send-email', {
          body: {
            to: association.contact_email,
            subject: emailSubject,
            bodyHtml: emailBody,
            bodyText: emailBody.replace(/<[^>]*>/g, ''),
            senderEmail,
            senderName: senderName || senderEmail,
          },
        });

        if (error) {
          failed++;
        } else {
          sent++;
        }
      }

      toast({
        title: 'Bulk Email Sent',
        description: `Successfully sent to ${sent} associations${failed > 0 ? `, ${failed} failed` : ''}`,
      });

      onOpenChange(false);
      setSenderEmail('');
      setSenderName('');
      setEmailSubject('');
      setEmailBody('');
    } catch (error: any) {
      console.error('Error sending bulk email:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send bulk email',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!whatsappMessage.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a message',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: associations } = await supabase
        .from('associations')
        .select('contact_phone, name')
        .in('id', associationIds);

      if (!associations || associations.length === 0) {
        throw new Error('No associations found');
      }

      let sent = 0;
      let failed = 0;

      for (const association of associations) {
        if (!association.contact_phone) {
          failed++;
          continue;
        }

        const { error } = await supabase.functions.invoke('send-whatsapp', {
          body: {
            to: association.contact_phone,
            message: whatsappMessage,
            recipientName: association.name,
          },
        });

        if (error) {
          failed++;
        } else {
          sent++;
        }
      }

      toast({
        title: 'Bulk WhatsApp Sent',
        description: `Successfully sent to ${sent} associations${failed > 0 ? `, ${failed} failed` : ''}`,
      });

      onOpenChange(false);
      setWhatsappMessage('');
    } catch (error: any) {
      console.error('Error sending bulk WhatsApp:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send bulk WhatsApp',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Bulk Message to Associations</DialogTitle>
        </DialogHeader>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Sending to <strong>{recipientCount}</strong> association{recipientCount !== 1 ? 's' : ''}.
            {associationNames.length > 0 && (
              <div className="mt-1 text-xs">
                {associationNames.join(', ')}
              </div>
            )}
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="email" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sender Email *</Label>
                <Input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="noreply@yourdomain.com"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label>Sender Name</Label>
                <Input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Your Organization"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Subject *</Label>
              <Input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Email subject"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Message *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage || loading}
                >
                  {uploadingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Insert Image
                    </>
                  )}
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
              <div className="border rounded-md overflow-hidden">
                <Suspense fallback={<div className="h-[300px] flex items-center justify-center">Loading editor...</div>}>
                  <ReactQuill
                    ref={quillRef}
                    theme="snow"
                    value={emailBody}
                    onChange={setEmailBody}
                    modules={quillModules}
                    formats={quillFormats}
                    placeholder="Email content..."
                    style={{ height: '300px', marginBottom: '42px' }}
                  />
                </Suspense>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleSendEmail} disabled={loading || recipientCount === 0}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Email
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp-message">Message *</Label>
              <Textarea
                id="whatsapp-message"
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
                placeholder="Type your WhatsApp message here..."
                rows={8}
                disabled={loading}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleSendWhatsApp} disabled={loading || recipientCount === 0}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send WhatsApp
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
