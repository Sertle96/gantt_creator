import { useTranslation } from 'react-i18next';
import { setUi } from '../../store/projectStore';
import { Modal } from '../common/Modal';

export function HelpDialog() {
  const { t } = useTranslation();
  const list = t('shortcuts.list', { returnObjects: true }) as [string, string][];
  return (
    <Modal title={t('shortcuts.title')} onClose={() => setUi({ helpOpen: false })} width={560}>
      <table className="w-full text-[13px]">
        <tbody>
          {list.map(([keys, what]) => (
            <tr key={keys} className="border-b border-border/60 last:border-0">
              <td className="whitespace-nowrap py-1.5 pr-4">
                <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px]">
                  {keys}
                </kbd>
              </td>
              <td className="py-1.5 text-muted">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
