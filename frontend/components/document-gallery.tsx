'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  FileText,
  Pencil,
  Send,
  Download,
  Loader2,
  Search,
  LayoutGrid,
  Rows3,
  X,
  Trash2,
  FileX2,
} from 'lucide-react';
import { toast } from 'sonner';

import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ApiService } from '@/lib/api';
import type { Invoice } from '@/types/invoice';

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    toast.error('Download fehlgeschlagen');
  }
}

const ImageEditor = dynamic(
  () => import('@/components/image-editor').then(m => m.ImageEditor),
  { ssr: false }
);

// ─── helpers ────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const statusColor: Record<string, string> = {
  pending:    'bg-slate-500/80',
  processing: 'bg-blue-500/80',
  success:    'bg-green-600/90',
  failed:     'bg-red-600/90',
};

// ─── Lazy thumbnail ──────────────────────────────────────────────────────────

function DocumentThumbnail({
  invoiceId,
  refreshKey = 0,
  onBlankPagesDetected,
}: {
  invoiceId: number;
  refreshKey?: number;
  onBlankPagesDetected?: (pages: number[]) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fired = useRef(false);
  const callbackRef = useRef(onBlankPagesDetected);
  callbackRef.current = onBlankPagesDetected;

  useEffect(() => {
    fired.current = false;
    setSrc(null);
    setPages(null);

    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fired.current) {
          fired.current = true;
          setLoading(true);
          Promise.all([
            ApiService.getPdfAsPng(invoiceId),
            ApiService.detectBlankPages(invoiceId),
          ])
            .then(([thumbRes, blankRes]) => {
              setSrc(thumbRes.png_data);
              setPages(thumbRes.page_count);
              callbackRef.current?.(thumbRes.page_count > 1 ? blankRes.blank_pages : []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
        }
      },
      { threshold: 0.05, rootMargin: '120px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [invoiceId, refreshKey]);

  return (
    <div
      ref={ref}
      className="aspect-[210/297] bg-muted overflow-hidden flex items-center justify-center relative select-none"
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
        </div>
      )}
      {src ? (
        <img
          src={src}
          alt="Vorschau"
          className="w-full h-full object-contain bg-white dark:bg-neutral-100"
          draggable={false}
        />
      ) : !loading ? (
        <FileText className="h-14 w-14 text-muted-foreground/25" />
      ) : null}
      {pages !== null && (
        <div className="absolute bottom-1.5 right-1.5 bg-black/55 text-white text-[10px] px-1.5 py-0.5 rounded-sm leading-none">
          {pages} {pages === 1 ? 'Seite' : 'Seiten'}
        </div>
      )}
    </div>
  );
}

// ─── Document card (grid mode) ───────────────────────────────────────────────

interface EditorState {
  pngData: string;
  filename: string;
  invoiceId: number;
}

function DocumentCard({
  invoice,
  onOpenEditor,
  onRefresh,
  refreshKey = 0,
}: {
  invoice: Invoice;
  onOpenEditor: (state: EditorState) => void;
  onRefresh: () => void;
  refreshKey?: number;
}) {
  const [transferring, setTransferring] = useState(false);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blankPages, setBlankPages] = useState<number[]>([]);
  const [deletingBlanks, setDeletingBlanks] = useState(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await ApiService.deleteInvoice(invoice.id);
      toast.success('Rechnung gelöscht');
      onRefresh();
    } catch (err) {
      toast.error('Löschen fehlgeschlagen', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleTransfer = async () => {
    setTransferring(true);
    try {
      await ApiService.transferInvoice(invoice.id);
      toast.success('Übertragung gestartet', {
        description: 'Wird zu Lexware Office und Paperless-ngx übertragen.',
      });
      onRefresh();
    } catch (err) {
      toast.error('Übertragung fehlgeschlagen', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setTransferring(false);
    }
  };

  const handleEdit = async () => {
    setConverting(true);
    try {
      const result = await ApiService.getPdfAsPng(invoice.id);
      onOpenEditor({ pngData: result.png_data, filename: invoice.filename, invoiceId: invoice.id });
    } catch (err) {
      toast.error('PDF konnte nicht konvertiert werden', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setConverting(false);
    }
  };

  const handleDeleteBlankPages = async () => {
    setDeletingBlanks(true);
    try {
      await ApiService.deletePages(invoice.id, blankPages);
      toast.success(`${blankPages.length} Leerseite${blankPages.length !== 1 ? 'n' : ''} gelöscht`);
      setBlankPages([]);
      setLocalRefreshKey(k => k + 1);
      onRefresh();
    } catch (err) {
      toast.error('Löschen fehlgeschlagen', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setDeletingBlanks(false);
    }
  };

  return (
    <Card className="overflow-hidden group hover:shadow-lg transition-shadow duration-150 flex flex-col">
      {/* Thumbnail + badge overlay */}
      <div className="relative overflow-hidden">
        <DocumentThumbnail
          invoiceId={invoice.id}
          refreshKey={refreshKey + localRefreshKey}
          onBlankPagesDetected={setBlankPages}
        />

        {/* Status badges top-right */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded text-white leading-none', statusColor[invoice.paperless_status])}>
            Paperless
          </span>
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded text-white leading-none', statusColor[invoice.lexware_status])}>
            Lexware
          </span>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-150" />

        {/* Blank pages badge */}
        {blankPages.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <button
                  className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none transition-colors"
                  title="Leerseiten gefunden — klicken zum Löschen"
                />
              }
            >
              <FileX2 className="h-3 w-3" />
              {blankPages.length} Leerseite{blankPages.length !== 1 ? 'n' : ''}
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                  <FileX2 />
                </AlertDialogMedia>
                <AlertDialogTitle>Leerseiten löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  {blankPages.length} leere Seite{blankPages.length !== 1 ? 'n' : ''} in „{invoice.filename}" gefunden.
                  {blankPages.length !== 1 ? ' Diese sollen' : ' Diese soll'} unwiderruflich gelöscht werden.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel variant="outline">Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={handleDeleteBlankPages}
                  disabled={deletingBlanks}
                >
                  {deletingBlanks && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Löschen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <CardContent className="p-3 flex flex-col gap-2 flex-1">
        {/* Filename */}
        <p
          className="text-sm font-medium leading-snug line-clamp-2 break-all min-h-[2.5rem]"
          title={invoice.filename}
        >
          {invoice.filename}
        </p>

        {/* Metadata */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{format(parseISO(invoice.created_at), 'dd.MM.yyyy', { locale: de })}</span>
          {invoice.file_size > 0 && <span>{formatSize(invoice.file_size)}</span>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1 mt-auto">
          <Button
            size="icon-sm"
            variant="outline"
            onClick={handleEdit}
            disabled={converting}
            title="Bearbeiten"
          >
            {converting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Pencil className="h-3.5 w-3.5" />}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger render={<Button size="icon-sm" variant="outline" title="Löschen" disabled={deleting} />}>
              {deleting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />}
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                  <Trash2 />
                </AlertDialogMedia>
                <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="font-medium break-all">„{invoice.filename}"</span>
                  {' '}wird unwiderruflich gelöscht.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel variant="outline">Abbrechen</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDelete}>Löschen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            variant="outline"
            size="icon-sm"
            title="Herunterladen"
            onClick={() => downloadFile(invoice.file, invoice.filename)}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            className="ml-auto h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
            onClick={handleTransfer}
            disabled={transferring || invoice.status === 'processing'}
          >
            {transferring
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />}
            Übertragen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Document row (list mode) ────────────────────────────────────────────────

function DocumentRow({
  invoice,
  onOpenEditor,
  onRefresh,
  refreshKey = 0,
}: {
  invoice: Invoice;
  onOpenEditor: (state: EditorState) => void;
  onRefresh: () => void;
  refreshKey?: number;
}) {
  const [transferring, setTransferring] = useState(false);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blankPages, setBlankPages] = useState<number[]>([]);
  const [deletingBlanks, setDeletingBlanks] = useState(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await ApiService.deleteInvoice(invoice.id);
      toast.success('Rechnung gelöscht');
      onRefresh();
    } catch (err) {
      toast.error('Löschen fehlgeschlagen', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleTransfer = async () => {
    setTransferring(true);
    try {
      await ApiService.transferInvoice(invoice.id);
      toast.success('Übertragung gestartet');
      onRefresh();
    } catch (err) {
      toast.error('Übertragung fehlgeschlagen', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setTransferring(false);
    }
  };

  const handleEdit = async () => {
    setConverting(true);
    try {
      const result = await ApiService.getPdfAsPng(invoice.id);
      onOpenEditor({ pngData: result.png_data, filename: invoice.filename, invoiceId: invoice.id });
    } catch (err) {
      toast.error('PDF konnte nicht konvertiert werden', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setConverting(false);
    }
  };

  const handleDeleteBlankPages = async () => {
    setDeletingBlanks(true);
    try {
      await ApiService.deletePages(invoice.id, blankPages);
      toast.success(`${blankPages.length} Leerseite${blankPages.length !== 1 ? 'n' : ''} gelöscht`);
      setBlankPages([]);
      setLocalRefreshKey(k => k + 1);
      onRefresh();
    } catch (err) {
      toast.error('Löschen fehlgeschlagen', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setDeletingBlanks(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
      {/* Mini thumbnail */}
      <div className="w-10 h-14 shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center">
        <DocumentThumbnail
          invoiceId={invoice.id}
          refreshKey={refreshKey + localRefreshKey}
          onBlankPagesDetected={setBlankPages}
        />
      </div>

      {/* Filename + date */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" title={invoice.filename}>
          {invoice.filename}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {format(parseISO(invoice.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
          {invoice.file_size > 0 && ` · ${formatSize(invoice.file_size)}`}
        </p>
      </div>

      {/* Status + blank pages badges */}
      <div className="flex gap-1.5 shrink-0 items-center">
        {blankPages.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <button
                  className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none transition-colors"
                  title="Leerseiten gefunden — klicken zum Löschen"
                />
              }
            >
              <FileX2 className="h-3 w-3" />
              {blankPages.length} Leerseite{blankPages.length !== 1 ? 'n' : ''}
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                  <FileX2 />
                </AlertDialogMedia>
                <AlertDialogTitle>Leerseiten löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  {blankPages.length} leere Seite{blankPages.length !== 1 ? 'n' : ''} in „{invoice.filename}" gefunden.
                  {blankPages.length !== 1 ? ' Diese sollen' : ' Diese soll'} unwiderruflich gelöscht werden.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel variant="outline">Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  onClick={handleDeleteBlankPages}
                  disabled={deletingBlanks}
                >
                  {deletingBlanks && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  Löschen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded text-white leading-none', statusColor[invoice.paperless_status])}>
          Paperless
        </span>
        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded text-white leading-none', statusColor[invoice.lexware_status])}>
          Lexware
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon-sm" variant="ghost" onClick={handleEdit} disabled={converting} title="Bearbeiten">
          {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" title="Löschen" disabled={deleting} />}>
            {deleting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-medium break-all">„{invoice.filename}"</span>
                {' '}wird unwiderruflich gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="outline">Abbrechen</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete}>Löschen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Herunterladen"
          onClick={() => downloadFile(invoice.file, invoice.filename)}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
          onClick={handleTransfer}
          disabled={transferring || invoice.status === 'processing'}
        >
          {transferring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Übertragen
        </Button>
      </div>
    </div>
  );
}

// ─── Main gallery ────────────────────────────────────────────────────────────

export function DocumentGallery() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [refreshKeys, setRefreshKeys] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    try {
      const data = await ApiService.getInvoices();
      setInvoices(data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  const handleEditorClose = useCallback((editedInvoiceId?: number) => {
    if (editedInvoiceId !== undefined) {
      setRefreshKeys(prev => ({ ...prev, [editedInvoiceId]: (prev[editedInvoiceId] ?? 0) + 1 }));
    }
    setEditor(null);
    load();
  }, [load]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const filtered = invoices
    .filter(i => i.filename.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <>
      <Dialog
        open={!!editor}
        onOpenChange={(open: boolean) => { if (!open) handleEditorClose(editor?.invoiceId); }}
      >
        <DialogContent
          className="fixed inset-0 block max-w-full sm:max-w-full w-full h-full rounded-none p-0 border-none gap-0 translate-x-0 translate-y-0 top-0 left-0 overflow-hidden"
          showCloseButton={false}
        >
          {editor && (
            <ImageEditor
              imageUrl={editor.pngData}
              filename={editor.filename}
              invoiceId={editor.invoiceId}
              onClose={() => handleEditorClose(editor.invoiceId)}
              className="absolute inset-0"
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Dokumente suchen…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} {filtered.length === 1 ? 'Dokument' : 'Dokumente'}
        </span>
        <div className="flex border rounded-md overflow-hidden">
          <button
            onClick={() => setView('grid')}
            className={cn('px-2.5 py-1.5 transition-colors', view === 'grid' ? 'bg-muted' : 'hover:bg-muted/50')}
            title="Kachelansicht"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView('list')}
            className={cn('px-2.5 py-1.5 border-l transition-colors', view === 'list' ? 'bg-muted' : 'hover:bg-muted/50')}
            title="Listenansicht"
          >
            <Rows3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className={cn(
          view === 'grid'
            ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
            : 'flex flex-col gap-2'
        )}>
          {Array.from({ length: 10 }).map((_, i) =>
            view === 'grid'
              ? <Skeleton key={i} className="aspect-[210/297] rounded-lg" />
              : <Skeleton key={i} className="h-20 rounded-lg" />
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mb-3 opacity-25" />
          <p className="text-sm">
            {query ? `Keine Ergebnisse für „${query}"` : 'Noch keine Dokumente hochgeladen'}
          </p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map(invoice => (
              <motion.div
                key={invoice.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              >
                <DocumentCard
                  invoice={invoice}
                  onOpenEditor={setEditor}
                  onRefresh={load}
                  refreshKey={refreshKeys[invoice.id] ?? 0}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <Card className="overflow-hidden divide-y p-0">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map(invoice => (
              <motion.div
                key={invoice.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              >
                <DocumentRow
                  invoice={invoice}
                  onOpenEditor={setEditor}
                  onRefresh={load}
                  refreshKey={refreshKeys[invoice.id] ?? 0}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </Card>
      )}
    </div>
    </>
  );
}
