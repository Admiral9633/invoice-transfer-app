export interface Invoice {
  id: number;
  file: string;
  filename: string;
  file_size: number;
  status: 'pending' | 'processing' | 'success' | 'failed';
  lexware_status: 'pending' | 'processing' | 'success' | 'failed';
  lexware_response: any;
  lexware_transferred_at: string | null;
  paperless_status: 'pending' | 'processing' | 'success' | 'failed';
  paperless_response: any;
  paperless_document_id: number | null;
  paperless_transferred_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UploadResponse {
  id: number;
  filename: string;
  status: string;
}
