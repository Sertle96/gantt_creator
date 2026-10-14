import { CircleAlert, FilePlus2, FileSpreadsheet, Replace } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RowError } from '../../excel/importRows';
import { importExcelAsNewProject, replaceProjectWithExcel } from '../../store/projectActions';
import { setUi, useStore } from '../../store/projectStore';
import { Modal } from '../common/Modal';

const MAX_ERRORS = 100;

/** Shows the problems of a read Excel file, or asks whether to import as new or replace. */
export function ExcelImportDialog() {
  const { t } = useTranslation();
  const pending = useStore((s) => s.ui.excelImport);
  const doc = useStore((s) => s.doc);
  if (!pending) return null;
  const close = () => setUi({ excelImport: null });
  const { result, fileName } = pending;

  const message = (e: RowError) => {
    const params = { ...e.params };
    if (typeof params.field === 'string') params.field = t(`excel.fields.${params.field}`);
    return t(`excel.errors.${e.code}`, params);
  };

  return (
    <Modal title={t('excel.dialogTitle')} onClose={close} width={600}>
      <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
        <FileSpreadsheet size={16} className="shrink-0 text-ok" />
        <span className="truncate">{fileName}</span>
      </div>

      {!result.ok ? (
        <>
          <div className="mb-1 flex items-center gap-2 font-semibold text-danger">
            <CircleAlert size={16} />
            {t('excel.errorsTitle', { count: result.errors.length })}
          </div>
          <p className="mb-3 text-[13px] text-muted">{t('excel.errorsHint')}</p>
          <ul
            className="scroll-thin max-h-[46vh] overflow-y-auto rounded-lg border border-border text-[13px]"
            data-testid="excel-errors"
          >
            {result.errors.slice(0, MAX_ERRORS).map((e, i) => (
              <li
                key={i}
                className="flex gap-3 border-b border-border/60 px-3 py-1.5 last:border-0"
              >
                <span className="w-16 shrink-0 font-medium tabular-nums">
                  {e.row ? t('excel.row', { row: e.row }) : t('excel.file')}
                </span>
                <span>{message(e)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <button className="btn border border-border" onClick={close}>
              {t('common.close')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
            <Chip>{t('excel.items', { count: result.plan.nodes.length })}</Chip>
            <Chip>{t('excel.links', { count: result.plan.links.length })}</Chip>
            <Chip>
              {t('excel.people', {
                count: new Set(
                  result.plan.nodes.flatMap((n) => n.people.map((p) => p.toLowerCase())),
                ).size,
              })}
            </Chip>
          </div>
          <p className="mb-2 font-semibold">{t('excel.question')}</p>
          <div className="grid gap-2">
            <Choice
              icon={<FilePlus2 size={18} />}
              title={t('excel.asNew')}
              hint={t('excel.asNewHint')}
              onClick={() => void importExcelAsNewProject(result.plan, fileName)}
              primary
            />
            {doc && (
              <Choice
                icon={<Replace size={18} />}
                title={t('excel.replace')}
                hint={t('excel.replaceHint', { name: doc.project.name })}
                onClick={() => replaceProjectWithExcel(result.plan)}
              />
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn border border-border" onClick={close}>
              {t('common.cancel')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-surface-2 px-2.5 py-1">{children}</span>;
}

function Choice(props: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors hover:border-accent hover:bg-accent/5 ${
        props.primary ? 'border-accent/50' : 'border-border'
      }`}
      onClick={props.onClick}
    >
      <span className="mt-0.5 text-accent">{props.icon}</span>
      <span>
        <span className="block font-semibold">{props.title}</span>
        <span className="block text-[12.5px] text-muted">{props.hint}</span>
      </span>
    </button>
  );
}
