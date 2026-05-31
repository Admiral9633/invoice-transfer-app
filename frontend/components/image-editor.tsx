'use client';

/**
 * Image Editor — adapted from SnapOtter (snapotter-hq/SnapOtter)
 *
 * Original stack: react-konva + konva + zustand/temporal
 * This port uses: react-konva + konva + React useState/useReducer
 *
 * Ported components:
 *  - EditorCanvas   → canvas rendering, tool event handlers
 *  - EditorPage     → overall layout (toolbar + canvas + right panel)
 *  - EditorToolbar  → left tool picker
 *  - AdjustmentsPanel → brightness / contrast / saturation via Konva filters
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Line,
  Rect,
  Ellipse,
  Text as KonvaText,
  Arrow as KonvaArrow,
  Circle as KonvaCircle,
} from 'react-konva';
import Konva from 'konva';
import {
  X,
  Save,
  Loader2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MousePointer,
  Pen,
  Eraser,
  Type,
  Square,
  Circle,
  MoveRight,
  Trash2,
  SlidersHorizontal,
  RotateCw,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FileX2,
  Scissors,
  CheckCircle2,
  ListChecks,
  Copy,
  PanelRight,
  EyeOff,
  PenTool,
  Search,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ApiService } from '@/lib/api';

// ── Types (adapted from SnapOtter editor-store.ts) ─────────────────────────

type ToolType = 'move' | 'brush' | 'eraser' | 'text' | 'rect' | 'ellipse' | 'arrow' | 'redaction' | 'signature';

interface LineObj {
  id: string;
  type: 'line';
  points: number[];
  stroke: string;
  strokeWidth: number;
  globalCompositeOperation: 'source-over' | 'destination-out';
}

interface RectObj {
  id: string;
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
}

interface EllipseObj {
  id: string;
  type: 'ellipse';
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  stroke: string;
  strokeWidth: number;
  fill: string;
}

interface TextObj {
  id: string;
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
}

interface ArrowObj {
  id: string;
  type: 'arrow';
  points: number[];
  stroke: string;
  strokeWidth: number;
  fill: string;
}

interface RedactionObj {
  id: string;
  type: 'redaction';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

type CanvasObj = LineObj | RectObj | EllipseObj | TextObj | ArrowObj | RedactionObj;

interface AdjustmentValues {
  brightness: number;  // -1 .. 1  (Konva.Filters.Brighten)
  contrast: number;   // -100 .. 100 (Konva.Filters.Contrast)
  saturation: number; // -2 .. 2  (Konva.Filters.HSL)
}

// ── Helpers ────────────────────────────────────────────────────────────────

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 5];

// ── Image loading hook (browser-only, avoids SSR issues) ──────────────────

function useHTMLImage(src: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => { if (!cancelled) setImage(img); };
    img.onerror = () => { if (!cancelled) setImage(null); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  return image;
}

// ── Inline text input overlay ──────────────────────────────────────────────

function TextOverlay({
  position,
  onConfirm,
  onCancel,
}: {
  position: { stageX: number; stageY: number };
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Small delay so the canvas mousedown event fully completes before focusing
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  const commit = () => {
    if (value.trim()) onConfirm(value.trim());
    else onCancel();
  };

  return (
    <>
      {/* Transparent backdrop — click outside to confirm */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onMouseDown={(e) => { e.stopPropagation(); commit(); }}
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation(); // prevent canvas keyboard shortcuts
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
        }}
        onMouseDown={(e) => e.stopPropagation()} // prevent backdrop catching input clicks
        style={{
          position: 'fixed',
          left: position.stageX,
          top: position.stageY,
          zIndex: 9999,
          fontSize: 18,
          padding: '2px 8px',
          border: '2px dashed #6366f1',
          borderRadius: 4,
          background: 'rgba(255,255,255,0.95)',
          color: '#111',
          minWidth: 160,
          outline: 'none',
        }}
        placeholder="Text eingeben… (Enter)"
      />
    </>
  );
}

// ── Color Picker ───────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#000000', '#1f2937', '#6b7280', '#d1d5db', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#7f1d1d', '#7c2d12', '#78350f', '#14532d', '#164e63',
  '#1e3a8a', '#312e81', '#4c1d95', '#831843', '#881337',
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setHex(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const dropWidth = 172;
      const left = (r.left + dropWidth > window.innerWidth)
        ? Math.max(0, r.right - dropWidth)
        : r.left;
      setDropPos({ top: r.bottom + 4, left });
    }
    setOpen((o) => !o);
  };

  const handleHex = (raw: string) => {
    setHex(raw);
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) onChange(raw);
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Swatch button */}
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        style={{
          width: 32, height: 32,
          borderRadius: 6,
          background: value,
          border: open ? '2px solid hsl(var(--ring))' : '2px solid hsl(var(--border))',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        aria-label="Farbe auswählen"
      />

      {open && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="bg-popover border border-border rounded-lg shadow-xl"
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            zIndex: 10000,
            padding: 10,
            width: 172,
          }}
        >
          {/* Preset grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 10 }}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => { onChange(c); setHex(c); setOpen(false); }}
                style={{
                  width: 28, height: 28,
                  borderRadius: 5,
                  background: c,
                  border: c.toLowerCase() === value.toLowerCase()
                    ? '2px solid hsl(var(--ring))'
                    : '1px solid hsl(var(--border))',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              />
            ))}
          </div>

          {/* Hex input row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 22, height: 22,
              borderRadius: 4,
              background: value,
              border: '1px solid hsl(var(--border))',
              flexShrink: 0,
            }} />
            <input
              value={hex}
              onChange={(e) => handleHex(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="#000000"
              maxLength={7}
              spellCheck={false}
              className="bg-input text-foreground border border-border rounded"
              style={{
                flex: 1,
                fontSize: 12,
                fontFamily: 'monospace',
                padding: '3px 6px',
                outline: 'none',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Editor ────────────────────────────────────────────────────────────

export function ImageEditor({
  imageUrl,
  filename,
  invoiceId,
  onClose,
  className,
}: {
  imageUrl: string;
  filename: string;
  invoiceId: number;
  onClose: () => void;
  className?: string;
}) {
  const [isSaving, setIsSaving] = useState(false);
  // ── Page state ─────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pageThumbnails, setPageThumbnails] = useState<{ page: number; png_data: string }[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [deletingPage, setDeletingPage] = useState<number | null>(null);
  const [currentHtmlImage, setCurrentHtmlImage] = useState<HTMLImageElement | null>(null);
  const [blankPageIndices, setBlankPageIndices] = useState<Set<number>>(new Set());
  // ── Page selection (extract to new PDF) ───────────────────────────────
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPageSwitching, setIsPageSwitching] = useState(false);
  const isPageSwitchingRef = useRef(false);

  // ── Helper: load an HTMLImageElement from a URL/data-URL ───────────────
  const loadHtmlImage = useCallback((src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
      el.src = src;
    })
  , []);

  // ── Load initial page image ────────────────────────────────────────────
  useEffect(() => {
    if (!imageUrl) return;
    loadHtmlImage(imageUrl).then(setCurrentHtmlImage).catch(() => {});
  }, [imageUrl, loadHtmlImage]);

  // ── Load page thumbnails ───────────────────────────────────────────────
  const loadThumbnails = useCallback(async () => {
    setPagesLoading(true);
    try {
      const [thumbRes, blankRes] = await Promise.all([
        ApiService.getPagesThumbnails(invoiceId),
        ApiService.detectBlankPages(invoiceId),
      ]);
      setPageThumbnails(thumbRes.pages);
      setPageCount(thumbRes.page_count);
      // Only flag blank pages if PDF has more than 1 page
      if (thumbRes.page_count > 1) {
        setBlankPageIndices(new Set(blankRes.blank_pages));
      } else {
        setBlankPageIndices(new Set());
      }
    } catch {
      // silent
    } finally {
      setPagesLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { loadThumbnails(); }, [loadThumbnails]);

  // ── Switch to a different page ─────────────────────────────────────────
  const switchPage = useCallback(async (pageIndex: number) => {
    if (pageIndex === currentPage || isPageSwitchingRef.current) return;
    isPageSwitchingRef.current = true;
    setIsPageSwitching(true);
    try {
      const res = await ApiService.getPdfAsPng(invoiceId, pageIndex);
      const img = await loadHtmlImage(res.png_data);
      setCurrentHtmlImage(img);
      setCurrentPage(pageIndex);
      setObjects([]);
      setHistory([[]]);
      setHistIdx(0);
    } catch (err) {
      toast.error('Seite konnte nicht geladen werden', {
        description: err instanceof Error ? err.message : '',
      });
    } finally {
      isPageSwitchingRef.current = false;
      setIsPageSwitching(false);
    }
  }, [currentPage, invoiceId, loadHtmlImage]);

  // ── Rotate a page ──────────────────────────────────────────────────────
  const handleRotate = useCallback(async (pageIndex: number, angle: 90 | -90) => {
    try {
      await ApiService.rotatePage(invoiceId, pageIndex, angle);
      await loadThumbnails();
      if (pageIndex === currentPage) {
        const res = await ApiService.getPdfAsPng(invoiceId, currentPage);
        const img = await loadHtmlImage(res.png_data);
        setCurrentHtmlImage(img);
      }
    } catch (err) {
      toast.error('Drehen fehlgeschlagen', { description: err instanceof Error ? err.message : '' });
    }
  }, [invoiceId, currentPage, loadThumbnails, loadHtmlImage]);

  // ── Delete a page ──────────────────────────────────────────────────────
  const handleDeletePage = useCallback(async (pageIndex: number) => {
    try {
      await ApiService.deletePages(invoiceId, [pageIndex]);
      const newCount = pageCount - 1;
      const newPage = Math.min(currentPage, newCount - 1);
      const res = await ApiService.getPdfAsPng(invoiceId, newPage);
      const img = await loadHtmlImage(res.png_data);
      setCurrentHtmlImage(img);
      setCurrentPage(newPage);
      setObjects([]);
      setHistory([[]]);
      setHistIdx(0);
      await loadThumbnails();
      toast.success(`Seite ${pageIndex + 1} gelöscht`);
    } catch (err) {
      toast.error('Löschen fehlgeschlagen', { description: err instanceof Error ? err.message : '' });
    } finally {
      setDeletingPage(null);
    }
  }, [invoiceId, currentPage, pageCount, loadThumbnails, loadHtmlImage]);

  // ── Extract selected pages into a new PDF ─────────────────────────────
  const cancelSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectedPages(new Set());
    setKeepOriginal(false);
  }, []);

  const togglePageSelection = useCallback((p: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }, []);

  const handleExtractPages = useCallback(async () => {
    if (selectedPages.size === 0) return;
    setIsExtracting(true);
    try {
      await ApiService.extractPages(invoiceId, Array.from(selectedPages), keepOriginal);
      const n = selectedPages.size;
      const verb = keepOriginal ? 'kopiert' : 'ausgeschnitten';
      toast.success(`${n} Seite${n === 1 ? '' : 'n'} erfolgreich ${verb}`);
      cancelSelection();
      onClose();
    } catch (err) {
      toast.error('Auslagern fehlgeschlagen', { description: err instanceof Error ? err.message : '' });
    } finally {
      setIsExtracting(false);
    }
  }, [invoiceId, selectedPages, keepOriginal, onClose, cancelSelection]);

  // ── Tool / drawing state ───────────────────────────────────────────────
  const [tool, setTool] = useState<ToolType>('move');
  const [strokeColor, setStrokeColor] = useState('#e11d48');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [eraserSize, setEraserSize] = useState(50);
  const [fontSize, setFontSize] = useState(20);

  // ── Objects + history (adapted from SnapOtter editor-store temporal) ──
  const [objects, setObjects] = useState<CanvasObj[]>([]);
  const [history, setHistory] = useState<CanvasObj[][]>([[]]);
  const [histIdx, setHistIdx] = useState(0);

  // ── Adjustments (Konva filters, same as SnapOtter SourceImage) ─────────
  const [adjustments, setAdjustments] = useState<AdjustmentValues>({
    brightness: 0,
    contrast: 0,
    saturation: 0,
  });
  const [showAdjust, setShowAdjust] = useState(true);
  const [showPanel, setShowPanel] = useState(true);

  // ── Zoom + status display ──────────────────────────────────────────────
  const [zoomPct, setZoomPct] = useState(100);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [cursorOnCanvas, setCursorOnCanvas] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  // ── Full-text search ───────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<
    { page: number; x: number; y: number; width: number; height: number; page_width: number }[]
  >([]);
  const [searchActiveIdx, setSearchActiveIdx] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // ── Canvas container size ──────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Refs (Konva internals, drawing state) ──────────────────────────────
  const stageRef = useRef<Konva.Stage>(null);
  const imageRef = useRef<Konva.Image>(null);
  const isDrawing = useRef(false);
  const lastLineId = useRef<string | null>(null);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);

  // ── Live preview for shapes being drawn ───────────────────────────────
  const [previewShape, setPreviewShape] = useState<RectObj | EllipseObj | ArrowObj | RedactionObj | null>(null);

  // ── Text overlay ───────────────────────────────────────────────────────
  const [textInput, setTextInput] = useState<{ canvasX: number; canvasY: number; stageX: number; stageY: number } | null>(null);

  // ── Auto-fit canvas when image changes ────────────────────────────────
  useEffect(() => {
    if (!currentHtmlImage) return;
    setImageSize({ width: currentHtmlImage.width, height: currentHtmlImage.height });

    const stage = stageRef.current;
    if (!stage) return;
    const scaleX = stageSize.width / currentHtmlImage.width;
    const scaleY = stageSize.height / currentHtmlImage.height;
    const fit = Math.min(scaleX, scaleY, 1) * 0.9;
    stage.scale({ x: fit, y: fit });
    stage.position({
      x: (stageSize.width - currentHtmlImage.width * fit) / 2,
      y: (stageSize.height - currentHtmlImage.height * fit) / 2,
    });
    stage.batchDraw();
    setZoomPct(Math.round(fit * 100));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHtmlImage]);

  // ── Apply Konva filters to source image (same as SnapOtter SourceImage) ─
  useEffect(() => {
    const node = imageRef.current;
    if (!node || !currentHtmlImage) return;

    const filters: Konva.Filter[] = [];
    if (adjustments.brightness !== 0) {
      filters.push(Konva.Filters.Brighten);
      node.brightness(adjustments.brightness);
    }
    if (adjustments.contrast !== 0) {
      filters.push(Konva.Filters.Contrast);
      node.contrast(adjustments.contrast);
    }
    if (adjustments.saturation !== 0) {
      filters.push(Konva.Filters.HSL);
      node.saturation(adjustments.saturation);
    }

    node.filters(filters);
    if (filters.length > 0) {
      node.cache();
    } else {
      node.clearCache();
    }
    node.getLayer()?.batchDraw();
  }, [adjustments, currentHtmlImage]);

  // ── History helpers ────────────────────────────────────────────────────
  const pushHistory = useCallback(
    (objs: CanvasObj[]) => {
      setHistory((h) => [...h.slice(0, histIdx + 1), objs]);
      setHistIdx((i) => i + 1);
    },
    [histIdx],
  );

  const undo = useCallback(() => {
    if (histIdx === 0) return;
    const next = histIdx - 1;
    setHistIdx(next);
    setObjects(history[next]);
  }, [histIdx, history]);

  const redo = useCallback(() => {
    if (histIdx >= history.length - 1) return;
    const next = histIdx + 1;
    setHistIdx(next);
    setObjects(history[next]);
  }, [histIdx, history]);

  // ── Canvas coordinate helper ───────────────────────────────────────────
  const getCanvasPos = useCallback((stage: Konva.Stage) => {
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    const scale = stage.scaleX();
    const stagePos = stage.position();
    return {
      x: (pos.x - stagePos.x) / scale,
      y: (pos.y - stagePos.y) / scale,
    };
  }, []);

  // ── Wheel zoom (adapted from SnapOtter useCanvasZoom) ─────────────────
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldZoom = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const newZoom = Math.max(0.05, Math.min(10, oldZoom * (1 + direction * 0.1)));

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldZoom,
      y: (pointer.y - stage.y()) / oldZoom,
    };

    stage.scale({ x: newZoom, y: newZoom });
    stage.position({
      x: pointer.x - mousePointTo.x * newZoom,
      y: pointer.y - mousePointTo.y * newZoom,
    });
    stage.batchDraw();
    setZoomPct(Math.round(newZoom * 100));
  }, []);

  // ── Mouse / touch event handlers (adapted from SnapOtter EditorCanvas) ─

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = getCanvasPos(stage);
      if (!pos) return;

      if (tool === 'move') return; // handled by stage draggable

      if (tool === 'text') {
        const rawPos = stage.getPointerPosition()!;
        const container = stage.container().getBoundingClientRect();
        setTextInput({
          canvasX: pos.x,
          canvasY: pos.y,
          stageX: container.left + rawPos.x,
          stageY: container.top + rawPos.y,
        });
        return;
      }

      isDrawing.current = true;

      if (tool === 'brush' || tool === 'eraser' || tool === 'signature') {
        const id = genId();
        const newLine: LineObj = {
          id,
          type: 'line',
          points: [pos.x, pos.y],
          stroke: tool === 'eraser' ? 'rgba(0,0,0,1)' : tool === 'signature' ? '#0a1a3f' : strokeColor,
          strokeWidth: tool === 'eraser' ? eraserSize : tool === 'signature' ? Math.max(2, Math.round(strokeWidth * 0.75)) : strokeWidth,
          globalCompositeOperation: tool === 'eraser' ? 'destination-out' : 'source-over',
        };
        lastLineId.current = id;
        setObjects((prev) => [...prev, newLine]);
      } else {
        shapeStart.current = pos;

        if (tool === 'rect') {
          setPreviewShape({ id: genId(), type: 'rect', x: pos.x, y: pos.y, width: 0, height: 0, stroke: strokeColor, strokeWidth, fill: 'transparent' });
        } else if (tool === 'redaction') {
          setPreviewShape({ id: genId(), type: 'redaction', x: pos.x, y: pos.y, width: 0, height: 0, fill: '#000000' });
        } else if (tool === 'ellipse') {
          setPreviewShape({ id: genId(), type: 'ellipse', x: pos.x, y: pos.y, radiusX: 0, radiusY: 0, stroke: strokeColor, strokeWidth, fill: 'transparent' });
        } else if (tool === 'arrow') {
          setPreviewShape({ id: genId(), type: 'arrow', points: [pos.x, pos.y, pos.x, pos.y], stroke: strokeColor, strokeWidth, fill: strokeColor });
        }
      }
    },
    [tool, strokeColor, strokeWidth, eraserSize, getCanvasPos],
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = getCanvasPos(stage);
      if (!pos) return;

      setCursorPos({ x: Math.round(pos.x), y: Math.round(pos.y) });

      if (!isDrawing.current) return;

      if ((tool === 'brush' || tool === 'eraser' || tool === 'signature') && lastLineId.current) {
        setObjects((prev) => {
          const idx = prev.findIndex((o) => o.id === lastLineId.current);
          if (idx === -1) return prev;
          const line = prev[idx] as LineObj;
          const updated: LineObj = { ...line, points: [...line.points, pos.x, pos.y] };
          const next = [...prev];
          next[idx] = updated;
          return next;
        });
      } else if (previewShape && shapeStart.current) {
        const sx = shapeStart.current.x;
        const sy = shapeStart.current.y;

        if (previewShape.type === 'rect' || previewShape.type === 'redaction') {
          setPreviewShape({
            ...previewShape,
            x: Math.min(sx, pos.x),
            y: Math.min(sy, pos.y),
            width: Math.abs(pos.x - sx),
            height: Math.abs(pos.y - sy),
          });
        } else if (previewShape.type === 'ellipse') {
          setPreviewShape({
            ...previewShape,
            x: sx + (pos.x - sx) / 2,
            y: sy + (pos.y - sy) / 2,
            radiusX: Math.abs(pos.x - sx) / 2,
            radiusY: Math.abs(pos.y - sy) / 2,
          });
        } else if (previewShape.type === 'arrow') {
          setPreviewShape({ ...previewShape, points: [sx, sy, pos.x, pos.y] });
        }
      }
    },
    [tool, previewShape, getCanvasPos],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (tool === 'brush' || tool === 'eraser' || tool === 'signature') {
      setObjects((current) => {
        pushHistory(current);
        return current;
      });
      lastLineId.current = null;
    } else if (previewShape) {
      const hasSize =
        ((previewShape.type === 'rect' || previewShape.type === 'redaction') && (previewShape.width > 2 || previewShape.height > 2)) ||
        (previewShape.type === 'ellipse' && (previewShape.radiusX > 1 || previewShape.radiusY > 1)) ||
        previewShape.type === 'arrow';

      if (hasSize) {
        setObjects((prev) => {
          const next = [...prev, previewShape];
          pushHistory(next);
          return next;
        });
      }
      setPreviewShape(null);
      shapeStart.current = null;
    }
  }, [tool, previewShape, pushHistory]);

  // ── Text confirmation ──────────────────────────────────────────────────
  const handleTextConfirm = useCallback(
    (text: string) => {
      if (!textInput) return;
      const obj: TextObj = {
        id: genId(),
        type: 'text',
        x: textInput.canvasX,
        y: textInput.canvasY,
        text,
        fontSize,
        fill: strokeColor,
      };
      setObjects((prev) => {
        const next = [...prev, obj];
        pushHistory(next);
        return next;
      });
      setTextInput(null);
    },
    [textInput, fontSize, strokeColor, pushHistory],
  );

  // ── Save as PDF via backend ────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || !currentHtmlImage) return;

    const adjustmentsChanged =
      adjustments.brightness !== 0 || adjustments.contrast !== 0 || adjustments.saturation !== 0;
    const hasEraser = objects.some(
      (o) => o.type === 'line' && o.globalCompositeOperation === 'destination-out',
    );
    const hasRedaction = objects.some((o) => o.type === 'redaction');

    // Nothing changed → keep the PDF native and just close.
    if (objects.length === 0 && !adjustmentsChanged) {
      onClose();
      return;
    }

    // Choose the save strategy:
    //  • Redaction present  → vector path (true content removal via PyMuPDF).
    //  • Eraser / image adjustments → rasterize (no vector equivalent).
    //  • Otherwise          → vector path (keeps text selectable, lossless, small).
    const useVector = hasRedaction || (!hasEraser && !adjustmentsChanged && objects.length > 0);

    setIsSaving(true);
    try {
      if (useVector) {
        // Eraser strokes have no vector representation — drop them.
        const payload = objects.filter(
          (o) => !(o.type === 'line' && o.globalCompositeOperation === 'destination-out'),
        );
        await ApiService.saveAnnotations(invoiceId, currentPage, currentHtmlImage.width, payload);
        toast.success('Rechnung gespeichert', {
          description: hasRedaction
            ? 'Geschwärzte Bereiche wurden dauerhaft entfernt.'
            : 'Vektoriell gespeichert – Text bleibt durchsuchbar.',
        });
      } else {
        // Rasterize: resize stage to exact image dimensions and reset transform
        // so we capture every pixel of the drawing at 1:1 resolution.
        const savedW = stage.width();
        const savedH = stage.height();
        const savedScale = { x: stage.scaleX(), y: stage.scaleY() };
        const savedPos = stage.position();

        stage.width(currentHtmlImage.width);
        stage.height(currentHtmlImage.height);
        stage.scale({ x: 1, y: 1 });
        stage.position({ x: 0, y: 0 });
        stage.batchDraw();

        const pngData = stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });

        // Restore original stage state
        stage.width(savedW);
        stage.height(savedH);
        stage.scale(savedScale);
        stage.position(savedPos);
        stage.batchDraw();

        await ApiService.savePngAsPdf(invoiceId, pngData, currentPage);
        toast.success('Rechnung gespeichert');
      }
      onClose();
    } catch (err) {
      toast.error('Speichern fehlgeschlagen', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setIsSaving(false);
    }
  }, [invoiceId, onClose, currentHtmlImage, objects, currentPage, adjustments]);

  // ── Full-text search ───────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) { setSearchMatches([]); return; }
    setIsSearching(true);
    try {
      const res = await ApiService.searchText(invoiceId, q);
      setSearchMatches(res.matches);
      setSearchActiveIdx(0);
      if (res.matches.length === 0) {
        toast.info('Keine Treffer gefunden');
      } else if (res.matches[0].page !== currentPage) {
        await switchPage(res.matches[0].page);
      }
    } catch (err) {
      toast.error('Suche fehlgeschlagen', { description: err instanceof Error ? err.message : '' });
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, invoiceId, currentPage, switchPage]);

  const goToMatch = useCallback(async (idx: number) => {
    const n = searchMatches.length;
    if (n === 0) return;
    const next = ((idx % n) + n) % n;
    setSearchActiveIdx(next);
    const m = searchMatches[next];
    if (m.page !== currentPage) await switchPage(m.page);
  }, [searchMatches, currentPage, switchPage]);

  // ── Zoom controls ──────────────────────────────────────────────────────
  const applyZoom = useCallback((delta: 1 | -1) => {
    const stage = stageRef.current;
    if (!stage) return;
    const current = stage.scaleX();
    const next =
      delta === 1
        ? ZOOM_STEPS.find((s) => s > current) ?? current
        : [...ZOOM_STEPS].reverse().find((s) => s < current) ?? current;
    const cx = stageSize.width / 2;
    const cy = stageSize.height / 2;
    const mousePointTo = {
      x: (cx - stage.x()) / current,
      y: (cy - stage.y()) / current,
    };
    stage.scale({ x: next, y: next });
    stage.position({ x: cx - mousePointTo.x * next, y: cy - mousePointTo.y * next });
    stage.batchDraw();
    setZoomPct(Math.round(next * 100));
  }, [stageSize.width, stageSize.height]);

  const fitToView = useCallback(() => {
    if (!currentHtmlImage) return;
    const stage = stageRef.current;
    if (!stage) return;
    const fit = Math.min(stageSize.width / currentHtmlImage.width, stageSize.height / currentHtmlImage.height) * 0.9;
    stage.scale({ x: fit, y: fit });
    stage.position({
      x: (stageSize.width - currentHtmlImage.width * fit) / 2,
      y: (stageSize.height - currentHtmlImage.height * fit) / 2,
    });
    stage.batchDraw();
    setZoomPct(Math.round(fit * 100));
  }, [currentHtmlImage, stageSize]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (e.key === 'v') setTool('move');
      if (e.key === 'b') setTool('brush');
      if (e.key === 's') setTool('signature');
      if (e.key === 'e') setTool('eraser');
      if (e.key === 't') setTool('text');
      if (e.key === 'r') setTool('rect');
      if (e.key === 'Escape') { setTextInput(null); setPreviewShape(null); isDrawing.current = false; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // ── Render helpers ─────────────────────────────────────────────────────
  const renderObj = (obj: CanvasObj) => {
    switch (obj.type) {
      case 'line':
        return (
          <Line
            key={obj.id}
            points={obj.points}
            stroke={obj.stroke}
            strokeWidth={obj.strokeWidth}
            tension={0.5}
            lineCap="round"
            lineJoin="round"
            globalCompositeOperation={obj.globalCompositeOperation}
          />
        );
      case 'rect':
        return (
          <Rect
            key={obj.id}
            x={obj.x}
            y={obj.y}
            width={obj.width}
            height={obj.height}
            stroke={obj.stroke}
            strokeWidth={obj.strokeWidth}
            fill={obj.fill}
          />
        );
      case 'ellipse':
        return (
          <Ellipse
            key={obj.id}
            x={obj.x}
            y={obj.y}
            radiusX={obj.radiusX}
            radiusY={obj.radiusY}
            stroke={obj.stroke}
            strokeWidth={obj.strokeWidth}
            fill={obj.fill}
          />
        );
      case 'text':
        return (
          <KonvaText
            key={obj.id}
            x={obj.x}
            y={obj.y}
            text={obj.text}
            fontSize={obj.fontSize}
            fill={obj.fill}
          />
        );
      case 'arrow':
        return (
          <KonvaArrow
            key={obj.id}
            points={obj.points}
            stroke={obj.stroke}
            strokeWidth={obj.strokeWidth}
            fill={obj.fill}
            pointerLength={12}
            pointerWidth={10}
          />
        );
      case 'redaction':
        return (
          <Rect
            key={obj.id}
            x={obj.x}
            y={obj.y}
            width={obj.width}
            height={obj.height}
            fill={obj.fill}
            stroke="#ef4444"
            strokeWidth={1 / (stageRef.current?.scaleX() ?? 1)}
            dash={[6 / (stageRef.current?.scaleX() ?? 1), 4 / (stageRef.current?.scaleX() ?? 1)]}
          />
        );
    }
  };

  const getCursor = () => {
    if (tool === 'move') return 'grab';
    if (tool === 'text') return 'text';
    if (tool === 'eraser') return 'none'; // custom circle cursor
    return 'crosshair';
  };

  const TOOLS: { id: ToolType; Icon: React.ElementType; label: string; shortcut: string }[] = [
    { id: 'move',    Icon: MousePointer, label: 'Verschieben',   shortcut: 'V' },
    { id: 'brush',   Icon: Pen,          label: 'Pinsel',        shortcut: 'B' },
    { id: 'signature', Icon: PenTool,    label: 'Signatur',      shortcut: 'S' },
    { id: 'eraser',  Icon: Eraser,       label: 'Radiergummi',   shortcut: 'E' },
    { id: 'text',    Icon: Type,         label: 'Text',          shortcut: 'T' },
    { id: 'rect',    Icon: Square,       label: 'Rechteck',      shortcut: 'R' },
    { id: 'ellipse', Icon: Circle,       label: 'Ellipse',       shortcut: '' },
    { id: 'arrow',   Icon: MoveRight,    label: 'Pfeil',         shortcut: '' },
    { id: 'redaction', Icon: EyeOff,     label: 'Schwärzen (echt)', shortcut: '' },
  ];

  // ── JSX ────────────────────────────────────────────────────────────────
  return (
    <div className={cn("flex flex-col bg-background text-foreground", className)}>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center h-12 px-3 gap-1 border-b border-border bg-card shrink-0">
        <span className="text-sm font-medium truncate flex-1 min-w-0 mr-2">{filename}</span>

        <div className="flex items-center gap-1 shrink-0">
        <Tooltip>
          <TooltipTrigger
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            onClick={undo}
            disabled={histIdx === 0}
          >
            <Undo2 className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Rückgängig (Ctrl+Z)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            onClick={redo}
            disabled={histIdx >= history.length - 1}
          >
            <Redo2 className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Wiederholen (Ctrl+Shift+Z)</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Tooltip>
          <TooltipTrigger
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            onClick={() => applyZoom(-1)}
          >
            <ZoomOut className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Herauszoomen</TooltipContent>
        </Tooltip>

        <span className="hidden sm:inline text-xs w-12 text-center text-muted-foreground tabular-nums select-none">
          {zoomPct}%
        </span>

        <Tooltip>
          <TooltipTrigger
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            onClick={() => applyZoom(1)}
          >
            <ZoomIn className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Hineinzoomen</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            onClick={fitToView}
          >
            <Maximize2 className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>An Fenster anpassen</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Tooltip>
          <TooltipTrigger
            className={cn(buttonVariants({ variant: showPanel ? 'secondary' : 'ghost', size: 'icon' }))}
            onClick={() => setShowPanel((s) => !s)}
          >
            <PanelRight className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Seitenleiste</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving
            ? 'Speichern…'
            : objects.length === 0 && adjustments.brightness === 0 && adjustments.contrast === 0 && adjustments.saturation === 0
              ? 'Schließen'
              : 'Speichern'}
        </Button>

        <Tooltip>
          <TooltipTrigger
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'ml-1')}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Schließen (Esc)</TooltipContent>
        </Tooltip>
        </div>
      </div>

      {/* ── Main area ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left toolbar ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-1 p-2 w-12 border-r border-border bg-card shrink-0">
          {TOOLS.map(({ id, Icon, label, shortcut }) => (
            <Tooltip key={id}>
              <TooltipTrigger
                className={cn(
                  buttonVariants({ variant: tool === id ? 'secondary' : 'ghost', size: 'icon' }),
                  'h-8 w-8',
                )}
                onClick={() => setTool(id)}
              >
                <Icon className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="right">
                {label}{shortcut ? ` (${shortcut})` : ''}
              </TooltipContent>
            </Tooltip>
          ))}

          <div className="flex-1" />
          <Separator className="my-1 w-6" />

          <Tooltip>
            <TooltipTrigger
              className={cn(
                buttonVariants({ variant: showAdjust ? 'secondary' : 'ghost', size: 'icon' }),
                'h-8 w-8',
              )}
              onClick={() => setShowAdjust((s) => !s)}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Anpassungen</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon' }),
                'h-8 w-8 text-muted-foreground hover:text-destructive',
              )}
              onClick={() => { setObjects([]); pushHistory([]); }}
            >
              <Trash2 className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right">Alles löschen</TooltipContent>
          </Tooltip>
        </div>

        {/* ── Canvas ───────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 overflow-hidden bg-muted/20 relative"
          style={{ cursor: getCursor() }}
        >
          {isPageSwitching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            draggable={tool === 'move'}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseEnter={() => setCursorOnCanvas(true)}
            onMouseLeave={() => setCursorOnCanvas(false)}
          >
            <Layer>
              {currentHtmlImage && (
                <KonvaImage
                  ref={imageRef}
                  image={currentHtmlImage}
                  width={currentHtmlImage.width}
                  height={currentHtmlImage.height}
                />
              )}
              {objects.map(renderObj)}
              {previewShape && renderObj(previewShape)}
            </Layer>

            {/* Search-match highlights (not part of saved objects) */}
            {searchMatches.length > 0 && currentHtmlImage && (
              <Layer listening={false}>
                {searchMatches.map((m, i) => {
                  if (m.page !== currentPage || !m.page_width) return null;
                  const f = currentHtmlImage.width / m.page_width;
                  const active = i === searchActiveIdx;
                  return (
                    <Rect
                      key={i}
                      x={m.x * f}
                      y={m.y * f}
                      width={m.width * f}
                      height={m.height * f}
                      fill={active ? 'rgba(249,115,22,0.45)' : 'rgba(250,204,21,0.4)'}
                      stroke={active ? '#f97316' : '#facc15'}
                      strokeWidth={1 / (stageRef.current?.scaleX() ?? 1)}
                    />
                  );
                })}
              </Layer>
            )}

            {tool === 'eraser' && cursorOnCanvas && (
              <Layer listening={false}>
                <KonvaCircle
                  x={cursorPos.x}
                  y={cursorPos.y}
                  radius={(tool === 'eraser' ? eraserSize : strokeWidth) / 2}
                  stroke="#000"
                  strokeWidth={1 / (stageRef.current?.scaleX() ?? 1)}
                  fill="rgba(255,255,255,0.15)"
                />
              </Layer>
            )}
          </Stage>
        </div>

        {/* ── Right panel ──────────────────────────────────────────── */}
        {showPanel && <div className="w-56 sm:w-64 flex flex-col border-l border-border bg-card shrink-0 overflow-y-auto">

          {/* Search panel */}
          <div className="p-4 space-y-2 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Im PDF suchen
            </p>
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') runSearch(); }}
                  placeholder="Text suchen…"
                  spellCheck={false}
                  className="w-full bg-input text-foreground border border-border rounded pl-7 pr-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <Button
                size="icon-sm"
                variant="secondary"
                onClick={runSearch}
                disabled={isSearching}
                title="Suchen"
              >
                {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </Button>
            </div>
            {searchMatches.length > 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {searchActiveIdx + 1} / {searchMatches.length} Treffer
                </span>
                <div className="flex items-center gap-0.5">
                  <Button size="icon-sm" variant="ghost" onClick={() => goToMatch(searchActiveIdx - 1)} title="Vorheriger Treffer">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => goToMatch(searchActiveIdx + 1)} title="Nächster Treffer">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Pages panel */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                {isSelecting ? 'Auswählen' : `Seiten (${pageCount})`}
              </p>
              <div className="flex items-center gap-0.5">
                {isSelecting ? (
                  <Button
                    size="sm" variant="ghost"
                    onClick={cancelSelection}
                    className="text-xs h-6 px-2"
                  >
                    Abbrechen
                  </Button>
                ) : (
                  <>
                    <Button
                      size="icon-sm" variant="ghost"
                      disabled={currentPage === 0}
                      onClick={() => switchPage(currentPage - 1)}
                      title="Vorherige Seite"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs tabular-nums px-1">{currentPage + 1}</span>
                    <Button
                      size="icon-sm" variant="ghost"
                      disabled={currentPage >= pageCount - 1}
                      onClick={() => switchPage(currentPage + 1)}
                      title="Nächste Seite"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                    {pageCount > 1 && (
                      <Button
                        size="icon-sm" variant="ghost"
                        onClick={() => setIsSelecting(true)}
                        title="Seiten auswählen"
                      >
                        <ListChecks className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {pagesLoading && pageThumbnails.length === 0 ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2 pr-0.5">
                {pageThumbnails.map(({ page: p, png_data }) => {
                  const isSelected = selectedPages.has(p);
                  return (
                    <div
                      key={p}
                      className={cn(
                        'group relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all',
                        isSelecting
                          ? isSelected
                            ? 'border-primary ring-1 ring-primary'
                            : 'border-border hover:border-muted-foreground'
                          : p === currentPage
                            ? 'border-primary ring-1 ring-primary'
                            : 'border-border hover:border-muted-foreground'
                      )}
                      onClick={() => isSelecting ? togglePageSelection(p) : switchPage(p)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={png_data} alt={`Seite ${p + 1}`} className="w-full block" />

                      {/* Page number badge */}
                      <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1 rounded leading-4">
                        {p + 1}
                      </div>

                      {/* Blank page badge */}
                      {blankPageIndices.has(p) && !isSelecting && (
                        <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-amber-500 text-white text-[9px] font-bold px-1 py-0.5 rounded leading-none">
                          <FileX2 className="h-2.5 w-2.5" />
                          Leer
                        </div>
                      )}

                      {/* Selection indicator */}
                      {isSelecting && (
                        <div className="absolute top-1 right-1">
                          {isSelected ? (
                            <CheckCircle2 className="h-5 w-5 text-primary drop-shadow" />
                          ) : (
                            <div className="h-5 w-5 rounded-full border-2 border-white/80 bg-black/30" />
                          )}
                        </div>
                      )}

                      {/* Action buttons — hidden in selection mode */}
                      {!isSelecting && (
                        <div className="absolute top-1 right-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRotate(p, -90); }}
                            className="bg-black/60 hover:bg-black/80 text-white rounded p-0.5"
                            title="Links drehen"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRotate(p, 90); }}
                            className="bg-black/60 hover:bg-black/80 text-white rounded p-0.5"
                            title="Rechts drehen"
                          >
                            <RotateCw className="h-3 w-3" />
                          </button>
                          {pageCount > 1 && (
                            deletingPage === p ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeletePage(p); }}
                                className="bg-red-600 hover:bg-red-700 text-white rounded p-0.5"
                                title="Bestätigen"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeletingPage(p); }}
                                className="bg-black/60 hover:bg-red-600 text-white rounded p-0.5 transition-colors"
                                title="Seite löschen"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Extract action bar */}
            {isSelecting && (
              <div className="pt-1 space-y-2">
                {/* Cut / Copy toggle */}
                <div className="flex rounded-md border border-border overflow-hidden text-[11px]">
                  <button
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 py-1.5 transition-colors',
                      !keepOriginal ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                    )}
                    onClick={() => setKeepOriginal(false)}
                  >
                    <Scissors className="h-3 w-3" />
                    Ausschneiden
                  </button>
                  <button
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 py-1.5 border-l border-border transition-colors',
                      keepOriginal ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                    )}
                    onClick={() => setKeepOriginal(true)}
                  >
                    <Copy className="h-3 w-3" />
                    Kopieren
                  </button>
                </div>

                <Button
                  className="w-full h-8 text-xs gap-1.5"
                  disabled={selectedPages.size === 0 || isExtracting}
                  onClick={handleExtractPages}
                >
                  {isExtracting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : keepOriginal ? (
                    <Copy className="h-3.5 w-3.5" />
                  ) : (
                    <Scissors className="h-3.5 w-3.5" />
                  )}
                  {selectedPages.size === 0
                    ? 'Seiten auswählen'
                    : `${selectedPages.size} Seite${selectedPages.size === 1 ? '' : 'n'} ${keepOriginal ? 'kopieren' : 'ausschneiden'}`}
                </Button>
              </div>
            )}
          </div>

          {tool !== 'move' && <>
          <Separator />

          {/* Tool options */}
          <div className="p-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Optionen
            </p>

            {/* Redaction hint */}
            {tool === 'redaction' && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ziehe ein Rechteck über sensible Daten. Beim Speichern wird der
                darunterliegende Inhalt <span className="text-foreground font-medium">dauerhaft entfernt</span> –
                keine bloße Überdeckung.
              </p>
            )}

            {/* Color */}
            {tool !== 'redaction' && tool !== 'signature' && tool !== 'eraser' && (
              <div className="flex items-center gap-3">
                <Label className="text-xs w-16 shrink-0">Farbe</Label>
                <ColorPicker value={strokeColor} onChange={setStrokeColor} />
                <span className="text-xs font-mono text-muted-foreground">{strokeColor}</span>
              </div>
            )}

            {/* Stroke width */}
            {tool !== 'text' && tool !== 'move' && tool !== 'redaction' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Stärke</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{tool === 'eraser' ? eraserSize : strokeWidth} px</span>
                </div>
                <Slider
                  min={1}
                  max={tool === 'eraser' ? 100 : 40}
                  step={1}
                  value={[tool === 'eraser' ? eraserSize : strokeWidth]}
                  onValueChange={(v) => tool === 'eraser' ? setEraserSize(Array.isArray(v) ? v[0] : v) : setStrokeWidth(Array.isArray(v) ? v[0] : v)}
                />
              </div>
            )}

            {/* Font size */}
            {tool === 'text' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Schriftgröße</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{fontSize} px</span>
                </div>
                <Slider
                  min={8}
                  max={96}
                  step={1}
                  value={[fontSize]}
                  onValueChange={(v) => setFontSize(Array.isArray(v) ? v[0] : v)}
                />
              </div>
            )}
          </div>
          </>}

          {/* Adjustments panel — only for brush, eraser, rect */}
          {showAdjust && (tool === 'brush' || tool === 'eraser' || tool === 'rect') && (
            <>
            <Separator />
            <div className="p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Anpassungen
              </p>

              {(
                [
                  { key: 'brightness' as const, label: 'Helligkeit', min: -1,   max: 1,   step: 0.01 },
                  { key: 'contrast'   as const, label: 'Kontrast',   min: -100, max: 100, step: 1    },
                  { key: 'saturation' as const, label: 'Sättigung',  min: -2,   max: 2,   step: 0.01 },
                ] as const
              ).map(({ key, label, min, max, step }) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{label}</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {adjustments[key].toFixed(key === 'contrast' ? 0 : 2)}
                    </span>
                  </div>
                  <Slider
                    min={min}
                    max={max}
                    step={step}
                    value={[adjustments[key]]}
                    onValueChange={(v) =>
                      setAdjustments((prev) => ({ ...prev, [key]: Array.isArray(v) ? v[0] : v }))
                    }
                  />
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setAdjustments({ brightness: 0, contrast: 0, saturation: 0 })}
              >
                Zurücksetzen
              </Button>
            </div>
            </>
          )}
        </div>}
      </div>

      {/* ── Status bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between h-7 px-4 border-t border-border bg-card text-xs text-muted-foreground shrink-0 select-none">
        <span>X: {cursorPos.x}  Y: {cursorPos.y}</span>
        <span>
          {imageSize.width > 0 && `${imageSize.width} × ${imageSize.height} px  ·  `}
          Zoom: {zoomPct}%
        </span>
      </div>

      {/* ── Text input overlay ───────────────────────────────────────── */}
      {textInput && (
        <TextOverlay
          position={textInput}
          onConfirm={handleTextConfirm}
          onCancel={() => setTextInput(null)}
        />
      )}
    </div>
  );
}
