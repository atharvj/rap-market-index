"use client";

import clsx from "clsx";
import { Info } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipPosition = {
  left: number;
  top: number;
  width: number;
};

export function InfoTooltip({
  label,
  children,
  align = "left",
  className,
  width = 272
}: {
  label: string;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  width?: number;
}) {
  const tooltipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;

    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 12;
    const resolvedWidth = Math.min(width, window.innerWidth - viewportPadding * 2);
    const preferredLeft = align === "right" ? rect.right - resolvedWidth : rect.left;

    setPosition({
      left: Math.min(
        window.innerWidth - resolvedWidth - viewportPadding,
        Math.max(viewportPadding, preferredLeft)
      ),
      top: rect.bottom + 120 <= window.innerHeight
        ? rect.bottom + 8
        : Math.max(viewportPadding, rect.top - 112),
      width: resolvedWidth
    });
  }, [align, width]);

  useEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open, updatePosition]);

  return (
    <span
      ref={anchorRef}
      className={clsx("inline-flex align-middle", className)}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line bg-panel text-paper/45 hover:border-cyan hover:text-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && position && typeof document !== "undefined"
        ? createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              className="rmi-popover pointer-events-none fixed z-[200] p-3 text-left text-xs font-medium normal-case leading-5"
              style={position}
            >
              {children}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
