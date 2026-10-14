/** Excel entry point; loaded lazily so ExcelJS stays out of the main bundle. */
import type { ProjectDoc } from '../domain/types';
import { parsePlan, type ParseResult } from './importRows';
import { LABELS, type ExcelLang } from './labels';
import { buildExportWorkbook, buildTemplateWorkbook, readPlanWorkbook } from './workbook';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function toBlob(wb: { xlsx: { writeBuffer(): Promise<ArrayBuffer> } }): Promise<Blob> {
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE });
}

export function exportWorkbook(doc: ProjectDoc, lang: ExcelLang): Promise<Blob> {
  return toBlob(buildExportWorkbook(doc, LABELS[lang]));
}

export function templateWorkbook(levelNames: string[], lang: ExcelLang): Promise<Blob> {
  return toBlob(buildTemplateWorkbook(levelNames, LABELS[lang]));
}

export async function readExcelFile(file: Blob): Promise<ParseResult> {
  const read = await readPlanWorkbook(await file.arrayBuffer());
  return read.ok ? parsePlan(read.rows) : read;
}
