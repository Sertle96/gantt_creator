import { openDB, type IDBPDatabase } from 'idb';
import type { ProjectDoc } from '../domain/types';
import { parseProjectDoc } from './jsonTransfer';
import { summarize, type ProjectRepository, type ProjectSummary } from './repository';

const DB_NAME = 'gantt-creator';
const STORE = 'projects';

export class IndexedDbRepository implements ProjectRepository {
  private db: Promise<IDBPDatabase>;

  constructor(name = DB_NAME) {
    this.db = openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore(STORE);
      },
    });
  }

  async list(): Promise<ProjectSummary[]> {
    const all = (await (await this.db).getAll(STORE)) as unknown[];
    return all
      .map((raw) => {
        try {
          return summarize(parseProjectDoc(raw));
        } catch {
          return null;
        }
      })
      .filter((s): s is ProjectSummary => s !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(id: string): Promise<ProjectDoc | null> {
    const raw = await (await this.db).get(STORE, id);
    return raw ? parseProjectDoc(raw) : null;
  }

  async save(doc: ProjectDoc): Promise<void> {
    await (await this.db).put(STORE, doc, doc.project.id);
  }

  async remove(id: string): Promise<void> {
    await (await this.db).delete(STORE, id);
  }
}
