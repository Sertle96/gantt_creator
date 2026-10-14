import { Ellipsis, Keyboard, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { currentLanguage, LANGUAGES, setLanguage } from '../../i18n';
import { setUi, useStore, type Theme } from '../../store/projectStore';
import { IconMenu, MenuEntry, MenuHeading } from './IconMenu';

const THEMES: Array<{ theme: Theme; Icon: typeof Sun }> = [
  { theme: 'system', Icon: Monitor },
  { theme: 'light', Icon: Sun },
  { theme: 'dark', Icon: Moon },
];

/** Rarely used options: project settings, shortcuts, language and colour scheme. */
export function MoreMenu() {
  const { t } = useTranslation();
  const theme = useStore((s) => s.ui.theme);
  const lang = currentLanguage();
  return (
    <IconMenu
      icon={<Ellipsis size={17} />}
      label={t('toolbar.more')}
      menuClassName="w-[240px]"
      menuWidth={240}
    >
      {(close) => (
        <>
          <MenuEntry
            icon={<Settings size={15} />}
            title={t('toolbar.settings')}
            onClick={() => {
              close();
              setUi({ settingsOpen: true });
            }}
          />
          <MenuEntry
            icon={<Keyboard size={15} />}
            title={t('toolbar.help')}
            onClick={() => {
              close();
              setUi({ helpOpen: true });
            }}
          />
          <div className="my-1 border-t border-border" />
          <MenuHeading>{t('toolbar.language')}</MenuHeading>
          <div className="px-3 pb-2">
            <div className="seg w-full" role="group" aria-label={t('toolbar.language')}>
              {LANGUAGES.map((l) => (
                <button
                  key={l}
                  className="flex-1"
                  aria-pressed={lang === l}
                  onClick={() => setLanguage(l)}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <MenuHeading>{t('toolbar.theme')}</MenuHeading>
          <div className="px-3 pb-2">
            <div className="seg w-full" role="group" aria-label={t('toolbar.theme')}>
              {THEMES.map(({ theme: value, Icon }) => (
                <button
                  key={value}
                  className="inline-flex flex-1 items-center justify-center gap-1"
                  aria-pressed={theme === value}
                  onClick={() => setUi({ theme: value })}
                >
                  <Icon size={12} /> {t(`toolbar.themes.${value}`)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </IconMenu>
  );
}
