import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface PopoverProps {
  /** Viewport coordinates of the anchor point. */
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/** Fixed-position popover that stays inside the viewport and closes on outside click / Escape. */
export function Popover({ x, y, onClose, children, className = '' }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const top = y + r.height + 8 > window.innerHeight ? Math.max(8, y - r.height - 8) : y + 8;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={`menu fixed z-50 ${className}`} style={pos}>
      {children}
    </div>
  );
}
