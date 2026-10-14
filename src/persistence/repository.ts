import type { ProjectDoc } from '../domain/types';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  itemCount: number;
}

/**
 * Storage backend for whole project documents. The browser implementation uses IndexedDB;
 * a later folder-sync backend (SharePoint/OneDrive folder) can implement the same contract.
 */
export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<ProjectDoc | null>;
  save(doc: ProjectDoc): Promise<void>;
  remove(id: string): Promise<void>;
}

export function summarize(doc: ProjectDoc): ProjectSummary {
  return {
    id: doc.project.id,
    name: doc.project.name,
    updatedAt: doc.project.updatedAt,
    itemCount: Object.keys(doc.items).length,
  };
}
