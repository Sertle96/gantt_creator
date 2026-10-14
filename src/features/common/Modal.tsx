import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export function Modal({ title, onClose, children, width = 560 }: ModalProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[84vh] w-full flex-col rounded-xl border border-border bg-surface shadow-pop"
        style={{ maxWidth: width }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
