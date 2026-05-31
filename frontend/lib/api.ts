import { Invoice, UploadResponse } from '@/types/invoice';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export class ApiService {
  static async uploadInvoice(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/invoices/upload/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Upload failed');
    }

    return response.json();
  }

  static async getInvoices(): Promise<Invoice[]> {
    const response = await fetch(`${API_URL}/invoices/`);

    if (!response.ok) {
      throw new Error('Failed to fetch invoices');
    }

    return response.json();
  }

  static async getInvoice(id: number): Promise<Invoice> {
    const response = await fetch(`${API_URL}/invoices/${id}/`);

    if (!response.ok) {
      throw new Error('Failed to fetch invoice');
    }

    return response.json();
  }

  static async deleteInvoice(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/invoices/${id}/`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete invoice');
    }
  }

  static async getPdfAsPng(id: number, page = 0): Promise<{
    png_data: string;
    page_count: number;
    page: number;
    width: number;
    height: number;
  }> {
    const response = await fetch(`${API_URL}/invoices/${id}/pdf-to-png/?page=${page}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: string }).error || 'PDF-Konvertierung fehlgeschlagen');
    }

    return response.json();
  }

  static async getPagesThumbnails(id: number): Promise<{
    pages: { page: number; png_data: string; width: number; height: number }[];
    page_count: number;
  }> {
    const response = await fetch(`${API_URL}/invoices/${id}/pages-png/`);
    if (!response.ok) throw new Error('Seitenvorschau fehlgeschlagen');
    return response.json();
  }

  static async rotatePage(id: number, page: number, angle: 90 | -90 | 180): Promise<void> {
    const response = await fetch(`${API_URL}/invoices/${id}/rotate-page/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, angle }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: string }).error || 'Drehen fehlgeschlagen');
    }
  }

  static async deletePages(id: number, pages: number[]): Promise<void> {
    const response = await fetch(`${API_URL}/invoices/${id}/delete-pages/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: string }).error || 'Löschen fehlgeschlagen');
    }
  }

  static async detectBlankPages(id: number): Promise<{ blank_pages: number[]; page_count: number }> {
    const response = await fetch(`${API_URL}/invoices/${id}/detect-blank-pages/`);
    if (!response.ok) throw new Error('Leerseiten-Erkennung fehlgeschlagen');
    return response.json();
  }

  static async extractPages(id: number, pages: number[], keepOriginal = false): Promise<Invoice> {
    const response = await fetch(`${API_URL}/invoices/${id}/extract-pages/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages, delete_originals: !keepOriginal }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: string }).error || 'Auslagern fehlgeschlagen');
    }
    return response.json();
  }

  static async savePngAsPdf(id: number, pngData: string, page = 0): Promise<void> {
    const response = await fetch(`${API_URL}/invoices/${id}/save-png-as-pdf/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ png_data: pngData, page }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: string }).error || 'Speichern fehlgeschlagen');
    }
  }

  static async saveAnnotations(
    id: number,
    page: number,
    canvasWidth: number,
    objects: unknown[],
  ): Promise<void> {
    const response = await fetch(`${API_URL}/invoices/${id}/save-annotations/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, canvas_width: canvasWidth, objects }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: string }).error || 'Speichern fehlgeschlagen');
    }
  }

  static async searchText(id: number, query: string): Promise<{
    query: string;
    count: number;
    matches: { page: number; x: number; y: number; width: number; height: number; page_width: number }[];
  }> {
    const response = await fetch(`${API_URL}/invoices/${id}/search-text/?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: string }).error || 'Suche fehlgeschlagen');
    }
    return response.json();
  }

  static async transferInvoice(id: number): Promise<Invoice> {
    const response = await fetch(`${API_URL}/invoices/${id}/transfer/`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error((error as { error?: string }).error || 'Übertragung fehlgeschlagen');
    }

    return response.json();
  }
}
