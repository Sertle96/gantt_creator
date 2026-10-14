import { FilePlus2, FileSpreadsheet, FolderOpen, Sparkles, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { currentLanguage, setLanguage } from '../../i18n';
import {
  deleteProject,
  newProject,
  newSampleProject,
  openProject,
  pickAndImport,
  pickExcelImport,
} from '../../store/projectActions';
import { useStore } from '../../store/projectStore';
import { formatISO, MEDIUM } from '../common/format';

export function Welcome() {
  const { t } = useTranslation();
  const projects = useStore((s) => s.projects);
  return (
    <div className="scroll-thin flex h-full flex-col items-center overflow-y-auto bg-bg px-4 py-16">
      <div className="absolute right-4 top-4">
        <button
          className="btn-icon text-[11px] font-bold"
          onClick={() => setLanguage(currentLanguage() === 'de' ? 'en' : 'de')}
        >
          {currentLanguage().toUpperCase()}
        </button>
      </div>
      <img src="/favicon.svg" alt="" className="mb-5 h-14 w-14" />
      <h1 className="mb-2 text-center text-2xl font-bold">{t('welcome.title')}</h1>
      <p className="mb-8 max-w-xl text-center text-muted">{t('welcome.subtitle')}</p>
      <div className="mb-10 flex flex-wrap justify-center gap-2">
        <button
          className="btn-primary h-10 px-4"
          onClick={() => {
            const name = window.prompt(t('projectMenu.newPrompt'), t('projectMenu.newDefault'));
            if (name !== null) void newProject(name);
          }}
        >
          <FilePlus2 size={16} /> {t('welcome.newProject')}
        </button>
        <button
          className="btn h-10 border border-border bg-surface px-4"
          onClick={() => void newSampleProject()}
        >
          <Sparkles size={16} /> {t('welcome.sample')}
        </button>
        <button className="btn h-10 border border-border bg-surface px-4" onClick={pickAndImport}>
          <Upload size={16} /> {t('welcome.import')}
        </button>
        <button className="btn h-10 border border-border bg-surface px-4" onClick={pickExcelImport}>
          <FileSpreadsheet size={16} /> {t('excel.import')}
        </button>
      </div>

      {projects.length > 0 && (
        <div className="w-full max-w-xl">
          <h2 className="label mb-2">{t('welcome.recent')}</h2>
          <ul className="overflow-hidden rounded-xl border border-border bg-surface">
            {projects.map((p) => (
              <li
                key={p.id}
                className="group flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <FolderOpen size={16} className="text-muted" />
                <button className="min-w-0 flex-1 text-left" onClick={() => void openProject(p.id)}>
                  <div className="truncate font-medium group-hover:text-accent">{p.name}</div>
                  <div className="text-[12px] text-muted">
                    {t('projectMenu.items', { count: p.itemCount })}
                    {p.updatedAt && ` · ${formatISO(p.updatedAt.slice(0, 10), MEDIUM)}`}
                  </div>
                </button>
                <button
                  className="btn-icon opacity-0 hover:text-danger group-hover:opacity-100"
                  title={t('projectMenu.delete')}
                  onClick={() =>
                    window.confirm(t('projectMenu.deleteConfirm', { name: p.name })) &&
                    void deleteProject(p.id)
                  }
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-8 max-w-xl text-center text-[12px] text-muted">{t('welcome.local')}</p>
    </div>
  );
}
