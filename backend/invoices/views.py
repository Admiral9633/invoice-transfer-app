from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.utils import timezone
import os
import base64
import threading

from .models import Invoice
from .serializers import InvoiceSerializer, InvoiceUploadSerializer
from .services import LexwareService, PaperlessService


class InvoiceViewSet(viewsets.ModelViewSet):
    """ViewSet for Invoice CRUD operations"""
    
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    
    @action(detail=False, methods=['post'], serializer_class=InvoiceUploadSerializer)
    def upload(self, request):
        """
        Upload invoice PDF — stores it without transferring.
        """
        serializer = InvoiceUploadSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        uploaded_file = serializer.validated_data['file']
        
        invoice = Invoice.objects.create(
            file=uploaded_file,
            filename=uploaded_file.name,
            file_size=uploaded_file.size,
            status='pending'
        )
        
        return Response(
            InvoiceSerializer(invoice).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'], url_path='transfer')
    def transfer(self, request, pk=None):
        """
        Manually trigger transfer of an invoice to Lexware and Paperless-ngx.
        """
        invoice = self.get_object()

        if invoice.status == 'processing':
            return Response(
                {'error': 'Übertragung läuft bereits.'},
                status=status.HTTP_409_CONFLICT
            )

        invoice.status = 'processing'
        invoice.lexware_status = 'pending'
        invoice.paperless_status = 'pending'
        invoice.save(update_fields=['status', 'lexware_status', 'paperless_status'])

        thread = threading.Thread(
            target=self._transfer_invoice,
            args=(invoice.id,)
        )
        thread.start()

        return Response(
            InvoiceSerializer(invoice).data,
            status=status.HTTP_202_ACCEPTED
        )
    
    def _transfer_invoice(self, invoice_id: int):
        """Background task to transfer invoice to external services"""
        try:
            invoice = Invoice.objects.get(id=invoice_id)
            file_path = invoice.file.path
            filename = invoice.filename
            
            # Transfer to Lexware
            invoice.lexware_status = 'processing'
            invoice.save()
            
            lexware_service = LexwareService()
            lexware_success, lexware_response = lexware_service.upload_invoice(
                file_path, filename
            )
            
            invoice.lexware_status = 'success' if lexware_success else 'failed'
            invoice.lexware_response = lexware_response
            if lexware_success:
                invoice.lexware_transferred_at = timezone.now()
            invoice.save()
            
            # Transfer to Paperless-ngx
            invoice.paperless_status = 'processing'
            invoice.save()
            
            paperless_service = PaperlessService()
            paperless_success, paperless_response = paperless_service.upload_document(
                file_path, filename
            )
            
            invoice.paperless_status = 'success' if paperless_success else 'failed'
            invoice.paperless_response = paperless_response
            if paperless_success and 'id' in paperless_response:
                invoice.paperless_document_id = paperless_response['id']
                invoice.paperless_transferred_at = timezone.now()
            invoice.save()
            
            # Update overall status
            invoice.update_overall_status()
            
        except Invoice.DoesNotExist:
            pass
        except Exception as e:
            # Log error and update invoice status
            try:
                invoice = Invoice.objects.get(id=invoice_id)
                invoice.status = 'failed'
                invoice.save()
            except:
                pass

    @action(detail=True, methods=['get'], url_path='pdf-to-png')
    def pdf_to_png(self, request, pk=None):
        """
Convert a single page of the invoice PDF to a PNG image.
        Accepts optional ?page=N query param (0-indexed, default 0).
        Returns base64-encoded PNG data URL + metadata.
        """
        import fitz  # PyMuPDF

        invoice = self.get_object()
        file_path = invoice.file.path

        if not os.path.exists(file_path):
            return Response(
                {'error': 'PDF-Datei nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            doc = fitz.open(file_path)
        except Exception as e:
            return Response(
                {'error': f'PDF konnte nicht geöffnet werden: {e}'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )

        page_count = len(doc)
        try:
            page_index = int(request.query_params.get('page', 0))
        except (ValueError, TypeError):
            page_index = 0
        page_index = max(0, min(page_index, page_count - 1))
        page = doc[page_index]

        # 2× scale → 144 DPI
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        png_bytes = pix.tobytes("png")
        doc.close()

        png_b64 = base64.b64encode(png_bytes).decode('utf-8')

        return Response({
            'png_data': f'data:image/png;base64,{png_b64}',
            'page_count': page_count,
            'page': page_index,
            'width': pix.width,
            'height': pix.height,
        })

    @action(detail=True, methods=['post'], url_path='save-png-as-pdf')
    def save_png_as_pdf(self, request, pk=None):
        """
        Convert an edited PNG (base64) back to PDF, replacing only the given
        page (default 0) while preserving all other pages.
        """
        import fitz  # PyMuPDF

        invoice = self.get_object()
        png_data = request.data.get('png_data', '')
        try:
            page_index = int(request.data.get('page', 0))
        except (ValueError, TypeError):
            page_index = 0

        if not png_data or not png_data.startswith('data:image/png;base64,'):
            return Response(
                {'error': 'Ungültige PNG-Daten.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            img_bytes = base64.b64decode(png_data.split(',', 1)[1])
        except Exception:
            return Response({'error': 'PNG-Dekodierung fehlgeschlagen.'}, status=status.HTTP_400_BAD_REQUEST)

        file_path = invoice.file.path
        if not os.path.exists(file_path):
            return Response({'error': 'Original-PDF nicht gefunden.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            orig_doc = fitz.open(file_path)
            page_count = len(orig_doc)
            page_index = max(0, min(page_index, page_count - 1))
            orig_rect = orig_doc[page_index].rect

            # Build new PDF: copy pages before, insert edited page, copy pages after
            new_doc = fitz.open()
            if page_index > 0:
                new_doc.insert_pdf(orig_doc, from_page=0, to_page=page_index - 1)
            edited_page = new_doc.new_page(width=orig_rect.width, height=orig_rect.height)
            edited_page.insert_image(edited_page.rect, stream=img_bytes)
            if page_index < page_count - 1:
                new_doc.insert_pdf(orig_doc, from_page=page_index + 1, to_page=page_count - 1)

            pdf_bytes = new_doc.tobytes(garbage=4, deflate=True)
            new_doc.close()
            orig_doc.close()
        except Exception as e:
            return Response(
                {'error': f'PDF konnte nicht erstellt werden: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        with open(file_path, 'wb') as f:
            f.write(pdf_bytes)

        invoice.file_size = len(pdf_bytes)
        invoice.save(update_fields=['file_size'])

        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=['post'], url_path='save-annotations')
    def save_annotations(self, request, pk=None):
        """
        Apply vector annotations and TRUE redactions to a PDF page natively
        (no rasterization), preserving the page's selectable text and quality.

        Body (JSON):
          page:         int    — 0-indexed page to edit
          canvas_width: float  — width in px of the rendered page image the
                                 client drew on (i.e. the pdf-to-png output)
          objects:      list   — annotations in canvas-pixel coordinates
                                 (top-left origin, y axis pointing down)

        Supported object shapes:
          rect      {type:'rect',      x, y, width, height, stroke, strokeWidth, fill}
          ellipse   {type:'ellipse',   x, y (center), radiusX, radiusY, stroke, strokeWidth, fill}
          line      {type:'line',      points:[x,y,...], stroke, strokeWidth}
          arrow     {type:'arrow',     points:[x1,y1,x2,y2], stroke, strokeWidth}
          text      {type:'text',      x, y, text, fontSize, fill}
          redaction {type:'redaction', x, y, width, height, fill}

        Unlike save-png-as-pdf this keeps the original PDF text/vectors intact
        and writes annotations as real PDF content. Redactions use PyMuPDF
        add_redact_annot + apply_redactions, which permanently removes the
        underlying content (true redaction, not just an overlay).
        """
        import math
        import fitz  # PyMuPDF

        invoice = self.get_object()
        try:
            page_index = int(request.data.get('page', 0))
        except (ValueError, TypeError):
            page_index = 0
        objects = request.data.get('objects', [])
        try:
            canvas_width = float(request.data.get('canvas_width', 0))
        except (ValueError, TypeError):
            canvas_width = 0

        if not isinstance(objects, list) or not objects:
            return Response({'error': 'Keine Annotationen übergeben.'}, status=status.HTTP_400_BAD_REQUEST)
        if canvas_width <= 0:
            return Response({'error': 'Ungültige Canvas-Breite.'}, status=status.HTTP_400_BAD_REQUEST)

        file_path = invoice.file.path
        if not os.path.exists(file_path):
            return Response({'error': 'PDF-Datei nicht gefunden.'}, status=status.HTTP_404_NOT_FOUND)

        def hex_rgb(value, default=(0, 0, 0)):
            """Parse '#rrggbb' / '#rgb' to a 0..1 RGB tuple for PyMuPDF."""
            if not isinstance(value, str):
                return default
            v = value.strip().lstrip('#')
            if len(v) == 3:
                v = ''.join(c * 2 for c in v)
            if len(v) != 6:
                return default
            try:
                return (int(v[0:2], 16) / 255, int(v[2:4], 16) / 255, int(v[4:6], 16) / 255)
            except ValueError:
                return default

        try:
            doc = fitz.open(file_path)
            if page_index < 0 or page_index >= len(doc):
                doc.close()
                return Response({'error': 'Seitenindex außerhalb des Bereichs.'}, status=status.HTTP_400_BAD_REQUEST)
            page = doc[page_index]

            # The rendered image is in display (rotated) space.  Convert a
            # canvas pixel to an unrotated PDF point: scale by points-per-pixel,
            # then de-rotate so drawing lands correctly on rotated pages.
            rot = page.rotation
            disp_w = page.rect.width if rot in (0, 180) else page.rect.height
            scale = disp_w / canvas_width
            derot = page.derotation_matrix

            def P(x, y):
                return fitz.Point(x * scale, y * scale) * derot

            def rect_from(x, y, w, h):
                pts = [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)]
                xs = [p.x for p in pts]
                ys = [p.y for p in pts]
                return fitz.Rect(min(xs), min(ys), max(xs), max(ys))

            redactions = []

            for obj in objects:
                if not isinstance(obj, dict):
                    continue
                otype = obj.get('type')
                try:
                    if otype == 'redaction':
                        r = rect_from(float(obj['x']), float(obj['y']),
                                      float(obj['width']), float(obj['height']))
                        redactions.append((r, hex_rgb(obj.get('fill'), (0, 0, 0))))
                    elif otype == 'rect':
                        r = rect_from(float(obj['x']), float(obj['y']),
                                      float(obj['width']), float(obj['height']))
                        fill = obj.get('fill')
                        fill_rgb = None if (not fill or fill == 'transparent') else hex_rgb(fill)
                        page.draw_rect(r, color=hex_rgb(obj.get('stroke')), fill=fill_rgb,
                                       width=float(obj.get('strokeWidth', 1)) * scale)
                    elif otype == 'ellipse':
                        cx, cy = float(obj['x']), float(obj['y'])
                        rx, ry = float(obj['radiusX']), float(obj['radiusY'])
                        r = rect_from(cx - rx, cy - ry, 2 * rx, 2 * ry)
                        fill = obj.get('fill')
                        fill_rgb = None if (not fill or fill == 'transparent') else hex_rgb(fill)
                        page.draw_oval(r, color=hex_rgb(obj.get('stroke')), fill=fill_rgb,
                                       width=float(obj.get('strokeWidth', 1)) * scale)
                    elif otype == 'line':
                        pts = obj.get('points', [])
                        if len(pts) >= 4:
                            poly = [P(float(pts[i]), float(pts[i + 1]))
                                    for i in range(0, len(pts) - 1, 2)]
                            page.draw_polyline(poly, color=hex_rgb(obj.get('stroke')),
                                               width=float(obj.get('strokeWidth', 1)) * scale)
                    elif otype == 'arrow':
                        pts = obj.get('points', [])
                        if len(pts) >= 4:
                            p1 = P(float(pts[0]), float(pts[1]))
                            p2 = P(float(pts[2]), float(pts[3]))
                            color = hex_rgb(obj.get('stroke'))
                            w = float(obj.get('strokeWidth', 1)) * scale
                            ang = math.atan2(p2.y - p1.y, p2.x - p1.x)
                            head = max(8 * scale, w * 3)
                            h1 = fitz.Point(p2.x + head * math.cos(ang + math.radians(150)),
                                            p2.y + head * math.sin(ang + math.radians(150)))
                            h2 = fitz.Point(p2.x + head * math.cos(ang - math.radians(150)),
                                            p2.y + head * math.sin(ang - math.radians(150)))
                            shape = page.new_shape()
                            shape.draw_line(p1, p2)
                            shape.draw_line(p2, h1)
                            shape.draw_line(p2, h2)
                            shape.finish(color=color, width=w)
                            shape.commit()
                    elif otype == 'text':
                        txt = str(obj.get('text', ''))
                        if txt:
                            font_px = float(obj.get('fontSize', 12))
                            base = P(float(obj['x']), float(obj['y']) + font_px * 0.8)
                            page.insert_text(base, txt, fontsize=font_px * scale,
                                             color=hex_rgb(obj.get('fill')), rotate=rot)
                except (KeyError, ValueError, TypeError):
                    continue

            # Apply true redactions LAST so they remove everything beneath them.
            for r, fill in redactions:
                page.add_redact_annot(r, fill=fill)
            if redactions:
                page.apply_redactions()

            pdf_bytes = doc.tobytes(garbage=4, deflate=True)
            doc.close()
        except Exception as e:
            return Response(
                {'error': f'Annotationen konnten nicht angewendet werden: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        with open(file_path, 'wb') as f:
            f.write(pdf_bytes)
        invoice.file_size = len(pdf_bytes)
        invoice.save(update_fields=['file_size'])
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=['get'], url_path='search-text')
    def search_text(self, request, pk=None):
        """
        Full-text search across the PDF. Returns match rectangles in display
        (rendered-image) coordinate space so the client can overlay highlights.

        Query param: ?q=<text>
        Response: {query, count, matches:[{page, x, y, width, height, page_width}]}
        where x/y/width/height are in PDF points relative to the rendered page
        (page_width = display width in points; client scales by image_px/page_width).
        """
        import fitz  # PyMuPDF

        invoice = self.get_object()
        query = (request.query_params.get('q', '') or '').strip()
        if not query:
            return Response({'query': '', 'matches': [], 'count': 0})

        file_path = invoice.file.path
        if not os.path.exists(file_path):
            return Response({'error': 'PDF-Datei nicht gefunden.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            doc = fitz.open(file_path)
        except Exception as e:
            return Response({'error': f'PDF konnte nicht geöffnet werden: {e}'},
                            status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        matches = []
        for i in range(len(doc)):
            page = doc[i]
            rot_mat = page.rotation_matrix
            disp_w = page.rect.width if page.rotation in (0, 180) else page.rect.height
            for r in page.search_for(query):
                rr = r * rot_mat  # unrotated → display space
                matches.append({
                    'page': i,
                    'x': rr.x0,
                    'y': rr.y0,
                    'width': rr.width,
                    'height': rr.height,
                    'page_width': disp_w,
                })
        doc.close()

        return Response({'query': query, 'matches': matches, 'count': len(matches)})

    @action(detail=True, methods=['get'], url_path='pages-png')
    def pages_png(self, request, pk=None):
        """Return thumbnail PNGs for all pages (1× scale for speed)."""
        import fitz  # PyMuPDF

        invoice = self.get_object()
        file_path = invoice.file.path

        if not os.path.exists(file_path):
            return Response({'error': 'PDF-Datei nicht gefunden.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            doc = fitz.open(file_path)
        except Exception as e:
            return Response({'error': f'PDF konnte nicht geöffnet werden: {e}'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        pages = []
        mat = fitz.Matrix(1, 1)  # 1× for thumbnails
        for i in range(len(doc)):
            pix = doc[i].get_pixmap(matrix=mat)
            png_b64 = base64.b64encode(pix.tobytes('png')).decode()
            pages.append({
                'page': i,
                'png_data': f'data:image/png;base64,{png_b64}',
                'width': pix.width,
                'height': pix.height,
            })
        doc.close()

        return Response({'pages': pages, 'page_count': len(pages)})

    @action(detail=True, methods=['post'], url_path='rotate-page')
    def rotate_page(self, request, pk=None):
        """Rotate a single page in the PDF. Body: {page: 0, angle: 90}."""
        import fitz  # PyMuPDF

        invoice = self.get_object()
        try:
            page_index = int(request.data.get('page', 0))
            angle = int(request.data.get('angle', 90))
        except (ValueError, TypeError):
            return Response({'error': 'Ungültige Parameter.'}, status=status.HTTP_400_BAD_REQUEST)

        file_path = invoice.file.path
        if not os.path.exists(file_path):
            return Response({'error': 'PDF-Datei nicht gefunden.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            doc = fitz.open(file_path)
            if page_index < 0 or page_index >= len(doc):
                doc.close()
                return Response({'error': 'Seitenindex außerhalb des Bereichs.'}, status=status.HTTP_400_BAD_REQUEST)
            page = doc[page_index]
            page.set_rotation((page.rotation + angle) % 360)
            pdf_bytes = doc.tobytes(garbage=4, deflate=True)
            doc.close()
        except Exception as e:
            return Response({'error': f'Drehen fehlgeschlagen: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        with open(file_path, 'wb') as f:
            f.write(pdf_bytes)
        invoice.file_size = len(pdf_bytes)
        invoice.save(update_fields=['file_size'])
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=['post'], url_path='delete-pages')
    def delete_pages(self, request, pk=None):
        """Delete pages from the PDF. Body: {pages: [0, 2]} (0-indexed)."""
        import fitz  # PyMuPDF

        invoice = self.get_object()
        pages_to_delete = request.data.get('pages', [])
        if not isinstance(pages_to_delete, list) or not pages_to_delete:
            return Response({'error': 'Keine Seiten angegeben.'}, status=status.HTTP_400_BAD_REQUEST)

        file_path = invoice.file.path
        if not os.path.exists(file_path):
            return Response({'error': 'PDF-Datei nicht gefunden.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            doc = fitz.open(file_path)
            if len(pages_to_delete) >= len(doc):
                doc.close()
                return Response({'error': 'Kann nicht alle Seiten löschen.'}, status=status.HTTP_400_BAD_REQUEST)
            # Delete in reverse order to preserve indices
            for p in sorted(set(pages_to_delete), reverse=True):
                if 0 <= p < len(doc):
                    doc.delete_page(p)
            pdf_bytes = doc.tobytes(garbage=4, deflate=True)
            doc.close()
        except Exception as e:
            return Response({'error': f'Löschen fehlgeschlagen: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        with open(file_path, 'wb') as f:
            f.write(pdf_bytes)
        invoice.file_size = len(pdf_bytes)
        invoice.save(update_fields=['file_size'])
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=['get'], url_path='detect-blank-pages')
    def detect_blank_pages(self, request, pk=None):
        """Detect blank pages in a PDF. Returns {blank_pages: [0, 2], page_count: 5}."""
        import fitz  # PyMuPDF

        invoice = self.get_object()
        file_path = invoice.file.path

        if not os.path.exists(file_path):
            return Response({'error': 'PDF-Datei nicht gefunden.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            doc = fitz.open(file_path)
        except Exception as e:
            return Response({'error': f'PDF konnte nicht geöffnet werden: {e}'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        blank_pages = []
        mat = fitz.Matrix(0.3, 0.3)  # Small scale for speed

        for i in range(len(doc)):
            page = doc[i]
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
            samples = pix.samples
            if not samples:
                blank_pages.append(i)
                continue
            n = len(samples)
            avg = sum(samples) / n
            # Quick reject: overall too dark to be a blank page
            if avg <= 210:
                continue
            # Compute standard deviation to distinguish "blank with fold lines / scanner
            # noise" (low std dev, uniform brightness) from "page with actual content"
            # (high std dev due to contrast between dark ink and white paper).
            sq_avg = sum(b * b for b in samples) / n
            std_dev = (sq_avg - avg * avg) ** 0.5
            # Blank: bright AND uniform.  Threshold 30 separates:
            #   • blank scanned page with fold marks → std_dev ≈ 10-20 ✓
            #   • page with sparse content (signature, few words) → std_dev ≈ 30-50 ✗
            if std_dev < 30:
                blank_pages.append(i)

        page_count = len(doc)
        doc.close()

        return Response({'blank_pages': blank_pages, 'page_count': page_count})

    @action(detail=True, methods=['post'], url_path='extract-pages')
    def extract_pages(self, request, pk=None):
        """
        Extract selected pages into a new invoice PDF.
        Body: {pages: [0, 2]} (0-indexed page indices to extract).
        Returns the newly created Invoice.
        """
        import fitz  # PyMuPDF
        from django.core.files.base import ContentFile

        invoice = self.get_object()
        pages_to_extract = request.data.get('pages', [])
        delete_originals = bool(request.data.get('delete_originals', True))

        if not isinstance(pages_to_extract, list) or not pages_to_extract:
            return Response({'error': 'Keine Seiten angegeben.'}, status=status.HTTP_400_BAD_REQUEST)

        file_path = invoice.file.path
        if not os.path.exists(file_path):
            return Response({'error': 'PDF-Datei nicht gefunden.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            doc = fitz.open(file_path)
            page_count = len(doc)

            # Validate and deduplicate page indices
            valid_pages = sorted(set(int(p) for p in pages_to_extract if 0 <= int(p) < page_count))
            if not valid_pages:
                doc.close()
                return Response({'error': 'Keine gültigen Seiten angegeben.'}, status=status.HTTP_400_BAD_REQUEST)

            if delete_originals and len(valid_pages) >= page_count:
                doc.close()
                return Response(
                    {'error': 'Kann nicht alle Seiten ausschneiden – mindestens eine Seite muss verbleiben.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Build new PDF containing only the selected pages
            new_doc = fitz.open()
            for p in valid_pages:
                new_doc.insert_pdf(doc, from_page=p, to_page=p)

            pdf_bytes = new_doc.tobytes(garbage=4, deflate=True)
            new_doc.close()

            # Cut mode: remove extracted pages from the original PDF
            if delete_originals:
                for p in sorted(valid_pages, reverse=True):
                    doc.delete_page(p)
                orig_bytes = doc.tobytes(garbage=4, deflate=True)
                doc.close()
                with open(file_path, 'wb') as f:
                    f.write(orig_bytes)
                invoice.file_size = len(orig_bytes)
                invoice.save(update_fields=['file_size'])
            else:
                doc.close()
        except Exception as e:
            return Response(
                {'error': f'Auslagern fehlgeschlagen: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Build filename: <original_base>_Seite_1_3.pdf
        base_name = os.path.splitext(invoice.filename)[0]
        page_label = '_'.join(str(p + 1) for p in valid_pages)
        new_filename = f'{base_name}_Seite_{page_label}.pdf'

        new_invoice = Invoice.objects.create(
            file=ContentFile(pdf_bytes, name=new_filename),
            filename=new_filename,
            file_size=len(pdf_bytes),
            status='pending',
        )

        return Response(InvoiceSerializer(new_invoice).data, status=status.HTTP_201_CREATED)
