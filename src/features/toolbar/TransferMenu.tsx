import { ArrowDownUp, Download, FileDown, FileSpreadsheet, FileUp, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  downloadExcelTemplate,
  exportExcel,
  exportProject,
  pickAndImport,
  pickExcelImport,
} from '../../store/projectActions';
import { IconMenu, MenuEntry, MenuHeading } from './IconMenu';

/** Excel export / template / import and the JSON backup. */
export function TransferMenu() {
  const { t } = useTranslation();
  return (
    <IconMenu
      icon={<ArrowDownUp size={16} />}
      label={t('toolbar.transfer')}
      menuClassName="w-[270px]"
      menuWidth={270}
    >
      {(close) => {
        const run = (fn: () => void) => () => {
          close();
          fn();
        };
        return (
          <>
            <MenuHeading>{t('excel.excel')}</MenuHeading>
            <MenuEntry
              icon={<FileDown size={15} />}
              title={t('excel.export')}
              hint={t('excel.exportHint')}
              onClick={run(() => void exportExcel())}
            />
            <MenuEntry
              icon={<FileSpreadsheet size={15} />}
              title={t('excel.template')}
              hint={t('excel.templateHint')}
              onClick={run(() => void downloadExcelTemplate())}
            />
            <MenuEntry
              icon={<FileUp size={15} />}
              title={t('excel.import')}
              hint={t('excel.importHint')}
              onClick={run(pickExcelImport)}
            />
            <div className="my-1 border-t border-border" />
            <MenuHeading>{t('excel.json')}</MenuHeading>
            <MenuEntry
              icon={<Download size={15} />}
              title={t('projectMenu.export')}
              onClick={run(exportProject)}
            />
            <MenuEntry
              icon={<Upload size={15} />}
              title={t('projectMenu.import')}
              onClick={run(pickAndImport)}
            />
          </>
        );
      }}
    </IconMenu>
  );
}
