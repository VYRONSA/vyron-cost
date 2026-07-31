"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  type DocumentViewerRegions,
  type FitMode,
  type NormalizedBBox,
  type ViewerFocusTarget,
  ZOOM_PRESETS,
  clamp01,
  estimateLineBBox,
} from "@/lib/vyron-document-viewer-types";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type InvoiceDocumentViewerProps = {
  url: string;
  mimeType: string;
  fileName?: string;
  regions?: DocumentViewerRegions;
  focusTarget?: ViewerFocusTarget | null;
  activeLineId?: string | null;
  lineCount?: number;
  className?: string;
  onOpenFullscreen?: () => void;
  isFullscreen?: boolean;
  onCloseFullscreen?: () => void;
};

function isPdfMime(mimeType: string, fileName?: string) {
  const m = mimeType.toLowerCase();
  if (m.includes("pdf")) return true;
  return Boolean(fileName?.toLowerCase().endsWith(".pdf"));
}

function isImageMime(mimeType: string) {
  return mimeType.toLowerCase().startsWith("image/");
}

function RegionOverlay({
  bbox,
  active,
  label,
}: {
  bbox: NormalizedBBox;
  active?: boolean;
  label?: string;
}) {
  return (
    <div
      className={`pointer-events-none absolute rounded-sm border-2 transition-colors ${
        active ? "border-fuchsia-500 bg-fuchsia-400/25 shadow-[0_0_0_2px_rgba(217,70,239,0.35)]" : "border-violet-400/50 bg-violet-400/10"
      }`}
      style={{
        left: `${bbox.x * 100}%`,
        top: `${bbox.y * 100}%`,
        width: `${bbox.width * 100}%`,
        height: `${bbox.height * 100}%`,
      }}
      title={label}
    />
  );
}

export default function InvoiceDocumentViewer({
  url,
  mimeType,
  fileName,
  regions,
  focusTarget,
  activeLineId,
  lineCount = 0,
  className = "",
  onOpenFullscreen,
  isFullscreen = false,
  onCloseFullscreen,
}: InvoiceDocumentViewerProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageJump, setPageJump] = useState("1");
  const [fitMode, setFitMode] = useState<FitMode>("width");
  const [scale, setScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(640);
  const [pageAspect, setPageAspect] = useState(1.414);
  const [pdfError, setPdfError] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const panRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  const isPdf = isPdfMime(mimeType, fileName);
  const isImage = isImageMime(mimeType);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerWidth(Math.max(280, el.clientWidth - 24));
    });
    ro.observe(el);
    setContainerWidth(Math.max(280, el.clientWidth - 24));
    return () => ro.disconnect();
  }, [isFullscreen]);

  const pageWidth = useMemo(() => {
    if (fitMode === "width") return containerWidth;
    if (fitMode === "page") {
      const maxH = isFullscreen ? window.innerHeight - 200 : 560;
      const byHeight = maxH / pageAspect;
      return Math.min(containerWidth, byHeight);
    }
    return containerWidth * scale;
  }, [containerWidth, fitMode, pageAspect, scale, isFullscreen]);

  const imageDisplayWidth = pageWidth;
  const imageDisplayHeight = imageSize.height && imageSize.width ? (imageDisplayWidth * imageSize.height) / imageSize.width : imageDisplayWidth * pageAspect;

  const overlaysForPage = useMemo(() => {
    const page = currentPage;
    const fieldOverlays =
      regions?.fields
        ?.filter((f) => f.page === page)
        .map((f) => ({ id: f.id, bbox: f.bbox, label: f.label, active: focusTarget?.fieldId === f.id })) ?? [];
    const lineOverlays =
      regions?.lines
        ?.filter((l) => l.page === page)
        .map((l) => ({
          id: l.lineId,
          bbox: l.bbox,
          label: "Line",
          active: activeLineId === l.lineId || focusTarget?.lineId === l.lineId,
        })) ?? [];
    return [...fieldOverlays, ...lineOverlays];
  }, [regions, currentPage, focusTarget, activeLineId]);

  const applyZoomPreset = useCallback((preset: number) => {
    setFitMode("custom");
    setScale(preset);
  }, []);

  const zoomIn = useCallback(() => {
    setFitMode("custom");
    setScale((s) => Math.min(4, Math.round((s + 0.25) * 100) / 100));
  }, []);

  const zoomOut = useCallback(() => {
    setFitMode("custom");
    setScale((s) => Math.max(0.35, Math.round((s - 0.25) * 100) / 100));
  }, []);

  const scrollToBBox = useCallback((bbox: NormalizedBBox) => {
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const wrap = pageWrapRef.current;
      if (!viewport || !wrap) return;
      const centerY = bbox.y * wrap.offsetHeight + (bbox.height * wrap.offsetHeight) / 2;
      const centerX = bbox.x * wrap.offsetWidth + (bbox.width * wrap.offsetWidth) / 2;
      viewport.scrollTo({
        top: Math.max(0, centerY - viewport.clientHeight / 2),
        left: Math.max(0, centerX - viewport.clientWidth / 2),
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    if (!focusTarget) return;
    const page = focusTarget.page ?? 1;
    let bbox = focusTarget.bbox;
    if (!bbox && focusTarget.lineId && lineCount > 0) {
      const idx = regions?.lines?.findIndex((l) => l.lineId === focusTarget.lineId) ?? -1;
      const lineIndex = idx >= 0 ? idx : 0;
      bbox = estimateLineBBox(lineIndex, lineCount);
    }
    if (!bbox) return;
    if (page !== currentPage) {
      setCurrentPage(page);
      setPageJump(String(page));
      return;
    }
    scrollToBBox(bbox);
  }, [focusTarget, lineCount, regions?.lines, scrollToBBox, currentPage]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.12 : 0.12;
        setFitMode("custom");
        setScale((s) => Math.min(4, Math.max(0.35, Math.round((s + delta) * 100) / 100)));
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  const onPanStart = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    panRef.current = {
      active: true,
      startX: clientX,
      startY: clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.style.cursor = "grabbing";
  };

  const onPanMove = (clientX: number, clientY: number) => {
    if (!panRef.current.active) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = panRef.current.scrollLeft - (clientX - panRef.current.startX);
    viewport.scrollTop = panRef.current.scrollTop - (clientY - panRef.current.startY);
  };

  const onPanEnd = () => {
    panRef.current.active = false;
    const viewport = viewportRef.current;
    if (viewport) viewport.style.cursor = "grab";
  };

  function goToPage(next: number) {
    const p = Math.min(numPages, Math.max(1, next));
    setCurrentPage(p);
    setPageJump(String(p));
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-2">
      <button type="button" onClick={zoomOut} className="rounded-lg border border-slate-200 bg-white p-1.5 hover:bg-violet-50" title="Zoom out">
        <Minus size={14} />
      </button>
      <button type="button" onClick={zoomIn} className="rounded-lg border border-slate-200 bg-white p-1.5 hover:bg-violet-50" title="Zoom in">
        <Plus size={14} />
      </button>
      <button type="button" onClick={() => setFitMode("width")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black">
        Fit Width
      </button>
      <button type="button" onClick={() => setFitMode("page")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black">
        Fit Page
      </button>
      {ZOOM_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => applyZoomPreset(preset)}
          className={`rounded-lg border px-2 py-1 text-[10px] font-black ${
            fitMode === "custom" && scale === preset ? "border-violet-500 bg-violet-100 text-violet-800" : "border-slate-200 bg-white"
          }`}
        >
          {preset * 100}%
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setFitMode("custom");
          setScale(1);
        }}
        className="rounded-lg border border-slate-200 bg-white p-1.5"
        title="Reset view"
      >
        <RotateCcw size={14} />
      </button>
      <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:inline" />
      {isPdf && numPages > 1 ? (
        <>
          <button type="button" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)} className="rounded-lg border border-slate-200 bg-white p-1.5 disabled:opacity-40">
            <ChevronLeft size={14} />
          </button>
          <span className="text-[10px] font-black text-slate-600">
            Page {currentPage} / {numPages}
          </span>
          <button type="button" disabled={currentPage >= numPages} onClick={() => goToPage(currentPage + 1)} className="rounded-lg border border-slate-200 bg-white p-1.5 disabled:opacity-40">
            <ChevronRight size={14} />
          </button>
          <input
            type="number"
            min={1}
            max={numPages}
            value={pageJump}
            onChange={(e) => setPageJump(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToPage(Number(pageJump) || 1);
            }}
            className="w-12 rounded-lg border border-slate-200 px-1 py-1 text-center text-[10px] font-bold"
            title="Jump to page"
          />
        </>
      ) : null}
      <span className="ml-auto text-[10px] font-semibold text-slate-400">Ctrl+wheel zoom · drag to pan</span>
      {isFullscreen ? (
        <button type="button" onClick={onCloseFullscreen} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-black text-white">
          <Minimize2 size={12} />
          Exit Full Screen
        </button>
      ) : (
        <button type="button" onClick={onOpenFullscreen} className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-2 py-1 text-[10px] font-black text-white">
          <Maximize2 size={12} />
          Open Full Screen
        </button>
      )}
    </div>
  );

  const pageCanvas = (
    <div
      ref={pageWrapRef}
      className="relative inline-block"
      style={isImage ? { width: imageDisplayWidth, height: imageDisplayHeight } : undefined}
    >
      {isPdf ? (
        <Page
          pageNumber={currentPage}
          width={pageWidth}
          renderTextLayer
          renderAnnotationLayer
          onLoadSuccess={(page) => {
            const vp = page.getViewport({ scale: 1 });
            setPageAspect(vp.height / vp.width);
          }}
        />
      ) : isImage ? (
        <img
          src={url}
          alt={fileName || "Invoice"}
          className="block max-w-none select-none"
          style={{ width: imageDisplayWidth, height: imageDisplayHeight }}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
            setPageAspect(img.naturalHeight / img.naturalWidth);
          }}
        />
      ) : (
        <div className="p-6 text-xs font-bold text-fuchsia-700">Unsupported preview type: {mimeType}</div>
      )}
      {overlaysForPage.map((o) => (
        <RegionOverlay key={o.id} bbox={o.bbox} active={o.active} label={o.label} />
      ))}
    </div>
  );

  const pdfShell = isPdf ? (
    <Document
      file={url}
      loading={<div className="p-8 text-xs font-bold text-slate-500">Loading PDF…</div>}
      error={<div className="p-8 text-xs font-bold text-red-600">{pdfError || "Could not load PDF."}</div>}
      onLoadSuccess={({ numPages: n }) => {
        setNumPages(n);
        setPdfError("");
      }}
      onLoadError={(err) => setPdfError(err.message)}
      className="flex min-h-0 flex-1"
    >
      {numPages > 1 ? (
        <div className="flex w-16 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-200 bg-slate-100 p-2">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <button
              key={pageNum}
              type="button"
              onClick={() => goToPage(pageNum)}
              className={`overflow-hidden rounded border-2 bg-white ${currentPage === pageNum ? "border-violet-600" : "border-slate-200"}`}
              title={`Page ${pageNum}`}
            >
              <Page pageNumber={pageNum} width={56} renderTextLayer={false} renderAnnotationLayer={false} />
              <span className="block py-0.5 text-center text-[9px] font-black text-slate-600">{pageNum}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={viewportRef}
        className="min-h-0 flex-1 cursor-grab overflow-auto bg-slate-200/80 p-3"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          onPanStart(e.clientX, e.clientY);
        }}
        onMouseMove={(e) => onPanMove(e.clientX, e.clientY)}
        onMouseUp={onPanEnd}
        onMouseLeave={onPanEnd}
      >
        <div className="inline-flex min-w-full justify-center">{pageCanvas}</div>
      </div>
    </Document>
  ) : (
    <div
      ref={viewportRef}
      className="min-h-0 flex-1 cursor-grab overflow-auto bg-slate-200/80 p-3"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        onPanStart(e.clientX, e.clientY);
      }}
      onMouseMove={(e) => onPanMove(e.clientX, e.clientY)}
      onMouseUp={onPanEnd}
      onMouseLeave={onPanEnd}
    >
      <div className="inline-flex min-w-full justify-center">{pageCanvas}</div>
    </div>
  );

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      {toolbar}
      <div className="flex min-h-0 flex-1">{pdfShell}</div>
    </div>
  );
}
