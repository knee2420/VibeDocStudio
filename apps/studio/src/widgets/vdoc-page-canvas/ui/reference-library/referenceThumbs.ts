import { useEffect, useRef, useState } from "react";
import { pdfjs } from "react-pdf";

import { referenceApi, type ReferenceItem } from "@/entities/reference-manager";

/** 레퍼런스 썸네일 (첫 쪽 · 원본 이미지 · 웹 캡처 첫 장). 한 번 만든 것은 기억한다. */
const cache = new Map<string, Promise<string | null>>();

async function pdfFirstPage(url: string, width: number): Promise<string | null> {
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  const doc = await pdfjs.getDocument({ url }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width * 2) / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    void doc.destroy();
  }
}

async function webFirstShot(refId: string): Promise<string | null> {
  const manifest = await referenceApi.shots(refId);
  const first = manifest.shots?.[0];
  return first?.file ? referenceApi.shotUrl(refId, first.file, manifest.capturedAt) : null;
}

function loadThumb(item: ReferenceItem): Promise<string | null> {
  const key = `${item.refId}:${item.updatedAt}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = (
      item.kind === "image"
        ? Promise.resolve(referenceApi.sourceUrl(item.refId))
        : item.kind === "pdf"
          ? pdfFirstPage(referenceApi.sourceUrl(item.refId), 180)
          : webFirstShot(item.refId)
    ).catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

/** 화면에 들어올 때만 썸네일을 만든다 (목록이 길어도 한꺼번에 PDF 를 열지 않게). */
export function useReferenceThumb(item: ReferenceItem): { ref: React.RefObject<HTMLDivElement | null>; src: string | null; loading: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || item.status === "failed") return;
    let alive = true;
    setLoading(true);
    void loadThumb(item).then((url) => {
      if (!alive) return;
      setSrc(url);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [visible, item]);

  return { ref, src, loading };
}
