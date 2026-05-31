import { InvoiceUploader } from '@/components/invoice-uploader';
import { DocumentGallery } from '@/components/document-gallery';

export default function Home() {
  return (
    <main className="flex-1 p-6 space-y-10 max-w-7xl">
      <section id="upload">
        <h2 className="text-lg font-semibold mb-4">Rechnungen hochladen</h2>
        <InvoiceUploader />
      </section>

      <section id="rechnungen">
        <h2 className="text-lg font-semibold mb-4">Dokumente</h2>
        <DocumentGallery />
      </section>
    </main>
  );
}
