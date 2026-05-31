'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Invoice } from '@/types/invoice';
import { ApiService } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, CheckCircle2, XCircle, Clock, Pencil, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';

const ImageEditor = dynamic(
  () => import('@/components/image-editor').then((m) => m.ImageEditor),
  { ssr: false },
);

const statusConfig = {
  pending: { label: 'Wartend', icon: Clock, color: 'bg-gray-500' },
  processing: { label: 'In Bearbeitung', icon: Loader2, color: 'bg-blue-500' },
  success: { label: 'Erfolgreich', icon: CheckCircle2, color: 'bg-green-500' },
  failed: { label: 'Fehlgeschlagen', icon: XCircle, color: 'bg-red-500' },
};

interface EditorState {
  pngData: string;
  filename: string;
  invoiceId: number;
}

export function InvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [converting, setConverting] = useState<number | null>(null);
  const [transferring, setTransferring] = useState<number | null>(null);

  const openEditor = useCallback(async (invoiceId: number, filename: string) => {
    setConverting(invoiceId);
    try {
      const result = await ApiService.getPdfAsPng(invoiceId);
      setEditor({ pngData: result.png_data, filename, invoiceId });
    } catch (err) {
      toast.error('PDF konnte nicht konvertiert werden', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setConverting(null);
    }
  }, []);

  const handleTransfer = useCallback(async (invoiceId: number) => {
    setTransferring(invoiceId);
    try {
      await ApiService.transferInvoice(invoiceId);
      toast.success('Übertragung gestartet', {
        description: 'Wird zu Lexware Office und Paperless-ngx übertragen.',
      });
      loadInvoices();
    } catch (err) {
      toast.error('Übertragung fehlgeschlagen', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setTransferring(null);
    }
  }, []);

  useEffect(() => {
    loadInvoices();
    const interval = setInterval(loadInvoices, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadInvoices = async () => {
    try {
      const data = await ApiService.getInvoices();
      setInvoices(data);
    } catch (error) {
      console.error('Failed to load invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Noch keine Rechnungen hochgeladen</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {invoices.map((invoice) => {
        const StatusIcon = statusConfig[invoice.status].icon;
        const LexwareIcon = statusConfig[invoice.lexware_status].icon;
        const PaperlessIcon = statusConfig[invoice.paperless_status].icon;

        return (
          <Card key={invoice.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{invoice.filename}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(invoice.created_at), {
                        addSuffix: true,
                        locale: de,
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Transfer button — shown when not yet transferred */}
                  {invoice.status !== 'processing' && (
                    <button
                      onClick={() => handleTransfer(invoice.id)}
                      disabled={transferring === invoice.id}
                      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      title="Zu Lexware & Paperless übertragen"
                    >
                      {transferring === invoice.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      Übertragen
                    </button>
                  )}
                  <button
                    onClick={() => openEditor(invoice.id, invoice.filename)}
                    disabled={converting === invoice.id}
                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
                    title="PDF als PNG bearbeiten"
                  >
                    {converting === invoice.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Pencil className="h-3 w-3" />
                    )}
                    Bearbeiten
                  </button>
                  <Badge
                    variant={invoice.status === 'success' ? 'default' : 'secondary'}
                    className={statusConfig[invoice.status].color}
                  >
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {statusConfig[invoice.status].label}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Lexware Office
                  </p>
                  <div className="flex items-center gap-2">
                    <LexwareIcon
                      className={`h-4 w-4 ${
                        invoice.lexware_status === 'processing' ? 'animate-spin' : ''
                      }`}
                    />
                    <span className="text-sm">
                      {statusConfig[invoice.lexware_status].label}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Paperless-ngx
                  </p>
                  <div className="flex items-center gap-2">
                    <PaperlessIcon
                      className={`h-4 w-4 ${
                        invoice.paperless_status === 'processing' ? 'animate-spin' : ''
                      }`}
                    />
                    <span className="text-sm">
                      {statusConfig[invoice.paperless_status].label}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {editor && (
        <ImageEditor
          imageUrl={editor.pngData}
          filename={editor.filename}
          invoiceId={editor.invoiceId}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
