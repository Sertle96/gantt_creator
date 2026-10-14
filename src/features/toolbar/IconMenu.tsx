import { useRef, useState, type ReactNode } from 'react';
import { Popover } from '../common/Popover';

interface IconMenuProps {
  icon: ReactNode;
  /** Tooltip and accessible name of the button. */
  label: string;
  /** Width class of the menu, e.g. `w-[260px]`. */
  menuClassName?: string;
  menuWidth?: number;
  children: (close: () => void) => ReactNode;
}

/** Icon button in the toolbar that opens a menu right-aligned below it. */
export function IconMenu({
  icon,
  label,
  menuClassName = 'w-[260px]',
  menuWidth = 260,
  children,
}: IconMenuProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const close = () => setAnchor(null);
  // A click outside closes the menu before the button's own click arrives; remember it so
  // clicking the button of an open menu closes it instead of reopening it.
  const dismissedAt = useRef(0);
  const dismiss = () => {
    dismissedAt.current = Date.now();
    close();
  };

  return (
    <>
      <button
        ref={ref}
        className={`btn-icon ${anchor ? 'bg-surface-2 text-text' : ''}`}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={() => {
          if (anchor || Date.now() - dismissedAt.current < 250) return close();
          const r = ref.current!.getBoundingClientRect();
          setAnchor({ x: r.right - menuWidth, y: r.bottom - 4 });
        }}
      >
        {icon}
      </button>
      {anchor && (
        <Popover x={anchor.x} y={anchor.y} onClose={dismiss} className={menuClassName}>
          {children(close)}
        </Popover>
      )}
    </>
  );
}

/** Menu entry with an icon, a title and an optional muted hint line. */
export function MenuEntry(props: {
  icon: ReactNode;
  title: string;
  hint?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button className={`menu-item items-start ${props.className ?? ''}`} onClick={props.onClick}>
      <span className="mt-0.5 shrink-0 text-muted">{props.icon}</span>
      <span className="min-w-0">
        <span className="block">{props.title}</span>
        {props.hint && <span className="block text-[11.5px] text-muted">{props.hint}</span>}
      </span>
    </button>
  );
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className="label mb-0 px-3 pb-1 pt-2">{children}</div>;
}
