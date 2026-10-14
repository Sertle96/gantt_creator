import {
  ChevronDown,
  FilePlus2,
  FolderOpen,
  LayoutGrid,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renameProject } from '../../store/actions';
import {
  closeProject,
  deleteProject,
  newProject,
  newSampleProject,
  openProject,
} from '../../store/projectActions';
import { useStore } from '../../store/projectStore';
import { Popover } from '../common/Popover';

export function ProjectMenu() {
  const { t } = useTranslation();
  const doc = useStore((s) => s.doc);
  const projects = useStore((s) => s.projects);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (!doc) return null;

  const close = () => setAnchor(null);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const others = projects.filter((p) => p.id !== doc.project.id).slice(0, 8);

  return (
    <>
      <button
        ref={buttonRef}
        className="btn max-w-[280px] font-semibold"
        onClick={() => {
          const r = buttonRef.current!.getBoundingClientRect();
          setAnchor(anchor ? null : { x: r.left, y: r.bottom - 4 });
        }}
        title={t('toolbar.projects')}
      >
        <span className="truncate">{doc.project.name}</span>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </button>
      {anchor && (
        <Popover x={anchor.x} y={anchor.y} onClose={close} className="w-[260px]">
          <button
            className="menu-item"
            onClick={run(() => {
              const name = window.prompt(t('projectMenu.renamePrompt'), doc.project.name);
              if (name) renameProject(name);
            })}
          >
            <Pencil size={14} /> {t('projectMenu.rename')}
          </button>
          <div className="my-1 border-t border-border" />
          <button
            className="menu-item"
            onClick={run(() => {
              const name = window.prompt(t('projectMenu.newPrompt'), t('projectMenu.newDefault'));
              if (name !== null) void newProject(name);
            })}
          >
            <FilePlus2 size={14} /> {t('projectMenu.newProject')}
          </button>
          <button className="menu-item" onClick={run(() => void newSampleProject())}>
            <Sparkles size={14} /> {t('projectMenu.sample')}
          </button>
          {others.length > 0 && (
            <>
              <div className="my-1 border-t border-border" />
              {others.map((p) => (
                <button
                  key={p.id}
                  className="menu-item"
                  onClick={run(() => void openProject(p.id))}
                >
                  <FolderOpen size={14} className="shrink-0" />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </>
          )}
          <button className="menu-item" onClick={run(closeProject)}>
            <LayoutGrid size={14} /> {t('toolbar.projects')}
          </button>
          <div className="my-1 border-t border-border" />
          <button
            className="menu-item text-danger"
            onClick={run(() => {
              if (window.confirm(t('projectMenu.deleteConfirm', { name: doc.project.name }))) {
                void deleteProject(doc.project.id);
              }
            })}
          >
            <Trash2 size={14} /> {t('projectMenu.delete')}
          </button>
        </Popover>
      )}
    </>
  );
}
