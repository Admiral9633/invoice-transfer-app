'use client';

import React, { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, CheckCircle2, XCircle, Loader2, Pencil, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ApiService } from '@/lib/api';

// Dynamic import with ssr:false because react-konva requires browser APIs
const ImageEditor = dynamic(
  () => import('@/components/image-editor').then((m) => m.ImageEditor),
  { ssr: false },
);

interface UploadedFile {
  file: File;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  id?: number;
  error?: string;
  transferStatus?: 'idle' | 'transferring' | 'done' | 'error';
}

interface EditorState {
  pngData: string;
  filename: string;
  invoiceId: number;
}

export function InvoiceUploader() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [converting, setConverting] = useState<number | null>(null);

  const handleTransfer = useCallback(async (invoiceId: number, fileIndex: number) => {
    setFiles((prev) => {
      const updated = [...prev];
      updated[fileIndex] = { ...updated[fileIndex], transferStatus: 'transferring' };
      return updated;
    });
    try {
      await ApiService.transferInvoice(invoiceId);
      setFiles((prev) => {
        const updated = [...prev];
        updated[fileIndex] = { ...updated[fileIndex], transferStatus: 'done' };
        return updated;
      });
      toast.success('Übertragung gestartet', {
        description: 'Wird zu Lexware Office und Paperless-ngx übertragen.',
      });
    } catch (err) {
      setFiles((prev) => {
        const updated = [...prev];
        updated[fileIndex] = { ...updated[fileIndex], transferStatus: 'error' };
        return updated;
      });
      toast.error('Übertragung fehlgeschlagen', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    }
  }, []);

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

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Add files to state with uploading status
    const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
      file,
      status: 'uploading',
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...newFiles]);

    // Upload each file
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      const fileIndex = files.length + i;

      try {
        // Simulate progress
        const progressInterval = setInterval(() => {
          setFiles((prev) => {
            const updated = [...prev];
            if (updated[fileIndex]?.progress < 90) {
              updated[fileIndex].progress += 10;
            }
            return updated;
          });
        }, 200);

        // Upload file
        const response = await ApiService.uploadInvoice(file);

        clearInterval(progressInterval);

        // Update file status
        setFiles((prev) => {
          const updated = [...prev];
          updated[fileIndex] = {
            ...updated[fileIndex],
            status: 'success',
            progress: 100,
            id: response.id,
          };
          return updated;
        });

        toast.success(`${file.name} erfolgreich hochgeladen`);

        // Detect blank pages immediately after upload
        try {
          const blankResult = await ApiService.detectBlankPages(response.id);
          if (blankResult.blank_pages.length > 0) {
            const n = blankResult.blank_pages.length;
            toast.warning(
              `${n} Leerseite${n !== 1 ? 'n' : ''} gefunden`,
              {
                description: `In „${file.name}"`,
                duration: 12000,
                action: {
                  label: 'Jetzt löschen',
                  onClick: async () => {
                    try {
                      await ApiService.deletePages(response.id, blankResult.blank_pages);
                      toast.success(`${n} Leerseite${n !== 1 ? 'n' : ''} gelöscht`);
                    } catch {
                      toast.error('Löschen fehlgeschlagen');
                    }
                  },
                },
              }
            );
          }
        } catch {
          // silent — blank page detection is best-effort
        }
      } catch (error) {
        setFiles((prev) => {
          const updated = [...prev];
          updated[fileIndex] = {
            ...updated[fileIndex],
            status: 'error',
            progress: 0,
            error: error instanceof Error ? error.message : 'Upload fehlgeschlagen',
          };
          return updated;
        });

        toast.error(`Fehler beim Hochladen von ${file.name}`, {
          description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        });
      }
    }
  }, [files.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: true,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Drop Zone */}
      <Card className="border-2 border-dashed">
        <CardContent className="p-8">
          <div
            {...getRootProps()}
            className={`cursor-pointer transition-colors ${
              isDragActive ? 'bg-primary/5' : ''
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold">
                  {isDragActive
                    ? 'PDF hier ablegen...'
                    : 'PDF-Rechnungen hochladen'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Ziehe Dateien hierher oder klicke zum Auswählen
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Nur PDF-Dateien (max. 10MB)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((uploadedFile, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {uploadedFile.status === 'uploading' && (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                    {uploadedFile.status === 'success' && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    {uploadedFile.status === 'error' && (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {uploadedFile.file.name}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        ({(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>

                    {uploadedFile.status === 'uploading' && (
                      <Progress value={uploadedFile.progress} className="mt-2 h-1" />
                    )}

                    {uploadedFile.status === 'error' && uploadedFile.error && (
                      <p className="text-xs text-red-500 mt-1">
                        {uploadedFile.error}
                      </p>
                    )}

                    {uploadedFile.status === 'success' && (
                      <p className="text-xs text-green-600 mt-1">
                        Erfolgreich hochgeladen
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Transfer button */}
                    {uploadedFile.status === 'success' && uploadedFile.id != null && (
                      <button
                        onClick={() => handleTransfer(uploadedFile.id!, index)}
                        disabled={uploadedFile.transferStatus === 'transferring' || uploadedFile.transferStatus === 'done'}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                        title="Zu Lexware & Paperless übertragen"
                      >
                        {uploadedFile.transferStatus === 'transferring' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : uploadedFile.transferStatus === 'done' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        {uploadedFile.transferStatus === 'done' ? 'Übertragen' : 'Übertragen'}
                      </button>
                    )}

                    {/* Edit button */}
                    {uploadedFile.status === 'success' && uploadedFile.id != null && (
                      <button
                        onClick={() => openEditor(uploadedFile.id!, uploadedFile.file.name)}
                        disabled={converting === uploadedFile.id}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {converting === uploadedFile.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Pencil className="h-3 w-3" />
                        )}
                        Bearbeiten
                      </button>
                    )}

                    {uploadedFile.status !== 'uploading' && (
                      <button
                        onClick={() => removeFile(index)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Image editor modal */}
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
