"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { fullView, indexAt, isZoomed, nearestIndex, panView, zoomView, type View } from "@/shared/lib/chart/svg-chart";

/** px of travel before a press becomes a pan */
const DRAG_SLOP = 4;
const WHEEL_ZOOM = 0.0022;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fractionIn = (box: DOMRect, clientX: number) => clamp01((clientX - box.left) / box.width);
const keepZoom = (next: View, count: number) => (isZoomed(next, count) ? next : null);

/** wheel zoom about pointer, drag pan, hover index, dbl-click reset */
export function useChartView(count: number) {
  const plotRef = useRef<HTMLDivElement>(null);
  // null = whole series, so new snapshots stay in frame until user zooms
  const [zoom, setZoom] = useState<View | null>(null);
  const view = zoom ?? fullView(count);
  const [hovered, setHovered] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ x: number; view: View; moved: boolean } | null>(null);
  // wheel listener decides passthrough before it can read state
  const zoomedRef = useRef(false);
  useEffect(() => {
    zoomedRef.current = zoom !== null;
  }, [zoom]);

  // native listener: react's root wheel is passive, can't stop page scroll
  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      const box = node.getBoundingClientRect();
      if (box.width === 0) return;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1;
      const dy = event.deltaY * scale;
      const dx = event.deltaX * scale;
      const sideways = event.shiftKey || Math.abs(dx) > Math.abs(dy);
      // zoom-out at full view: give scroll back to page
      if (!sideways && dy > 0 && !zoomedRef.current) return;
      event.preventDefault();
      const fraction = fractionIn(box, event.clientX);
      setZoom((prev) => {
        const current = prev ?? fullView(count);
        const span = current.end - current.start;
        if (sideways) return keepZoom(panView(current, ((event.shiftKey && dx === 0 ? dy : dx) / box.width) * span, count), count);
        const factor = Math.exp(Math.min(0.5, Math.max(-0.5, dy * WHEEL_ZOOM)));
        return keepZoom(zoomView(current, indexAt(fraction, current), factor, count), count);
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [count]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, view, moved: false };
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0) setHovered(nearestIndex(fractionIn(box, event.clientX), view, count));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const held = drag.current;
    const travel = held ? event.clientX - held.x : 0;
    if (held && (held.moved || Math.abs(travel) > DRAG_SLOP)) {
      held.moved = true;
      setPanning(true);
      setHovered(null);
      // drag left walks forward in time
      setZoom(keepZoom(panView(held.view, (-travel / box.width) * (held.view.end - held.view.start), count), count));
      return;
    }
    setHovered(nearestIndex(fractionIn(box, event.clientX), view, count));
  };

  const endDrag = () => {
    drag.current = null;
    setPanning(false);
  };

  const reset = () => {
    setZoom(null);
    setHovered(null);
  };

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onPointerLeave: () => {
      endDrag();
      setHovered(null);
    },
    onDoubleClick: reset,
  };

  return { plotRef, view, hovered, panning, handlers, zoomed: zoom !== null, reset };
}
