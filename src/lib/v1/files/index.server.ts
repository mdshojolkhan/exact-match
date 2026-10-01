/**
 * Default workspace implementation: in-process, per-server-instance.
 * No host filesystem access, hard size and count limits.
 */
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  WorkspacePathError,
  normalizeWorkspacePath,
  type WorkspaceFile,
  type WorkspaceStore,
} from "./store";

const files = new Map<string, WorkspaceFile>();

function put(path: string, content: string): WorkspaceFile {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes > MAX_FILE_BYTES) {
    throw new WorkspacePathError(
      `That file is too large (limit ${Math.floor(MAX_FILE_BYTES / 1024)} KB).`,
    );
  }
  if (!files.has(path) && files.size >= MAX_FILES) {
    throw new WorkspacePathError(
      "The workspace is full. Delete a file before creating another.",
    );
  }
  const record: WorkspaceFile = {
    path,
    content,
    bytes,
    updatedAt: new Date().toISOString(),
  };
  files.set(path, record);
  return record;
}

export const workspaceStore: WorkspaceStore = {
  async list() {
    return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  },
  async read(path) {
    return files.get(normalizeWorkspacePath(path)) ?? null;
  },
  async write(path, content) {
    return put(normalizeWorkspacePath(path), content);
  },
  async append(path, content) {
    const key = normalizeWorkspacePath(path);
    const existing = files.get(key);
    return put(key, existing ? `${existing.content}\n${content}` : content);
  },
  async remove(path) {
    return files.delete(normalizeWorkspacePath(path));
  },
};

export type { WorkspaceFile, WorkspaceStore };
