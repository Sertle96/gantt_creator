import { PanelRight, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hasOwnStyle, resolveStyle } from '../../domain/styles';
import { depthOf } from '../../domain/tree';
import { levelLabel, setItemStyle } from '../../store/actions';
import { setUi, useStore } from '../../store/projectStore';
import { Popover } from '../common/Popover';
import { StyleEditor } from '../common/StyleEditor';

/** Style controls for one item: shows whether it follows its level and offers a reset. */
export function ItemStyleEditor({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const doc = useStore((s) => s.doc);
  const item = doc?.items[itemId];
  if (!doc || !item) return null;
  const depth = depthOf(doc.items, itemId);
  const own = hasOwnStyle(item);
  return (
    <div>
      <div
        className={`mb-3 rounded-md px-2.5 py-2 text-[12px] ${
          own ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-muted'
        }`}
      >
        <div className="font-semibold">
          {own ? t('style.individual') : t('style.inherited', { level: levelLabel(doc, depth) })}
        </div>
        <div className="text-[11.5px] opacity-90">
          {own ? t('style.individualHint') : t('style.inheritedHint')}
        </div>
      </div>
      <StyleEditor
        value={resolveStyle(doc.project, item, depth)}
        onChange={(patch) => setItemStyle(itemId, patch)}
      />
      <button
        className="btn mt-3 w-full justify-center"
        disabled={!own}
        onClick={() => setItemStyle(itemId, null)}
      >
        <RotateCcw size={14} /> {t('style.reset')}
      </button>
    </div>
  );
}

interface StylePopoverProps {
  itemId: string;
  x: number;
  y: number;
  onClose: () => void;
}

export function StylePopover({ itemId, x, y, onClose }: StylePopoverProps) {
  const { t } = useTranslation();
  const name = useStore((s) => s.doc?.items[itemId]?.name);
  return (
    <Popover x={x} y={y} onClose={onClose} className="w-[290px] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold">{name}</span>
        <button
          className="btn-icon h-7 w-7 shrink-0"
          title={t('style.openDetails')}
          onClick={() => {
            setUi({ panel: 'details', selectedId: itemId });
            onClose();
          }}
        >
          <PanelRight size={14} />
        </button>
      </div>
      <ItemStyleEditor itemId={itemId} />
    </Popover>
  );
}
