import { get, set } from "idb-keyval";

export interface OpenedFile {
  name: string;
  data: Uint8Array;
  path?: string;
}

export interface RecentFile {
  name: string;
  path?: string;
  at: number;
}

export interface FileService {
  open(opts?: { accept?: string[] }): Promise<OpenedFile | null>;
  openMultiple(opts?: { accept?: string[] }): Promise<OpenedFile[]>;
  save(name: string, data: Uint8Array): Promise<string | null>;
  recents(): Promise<RecentFile[]>;
}

/* ---- recent-files list (shared by both implementations) ---- */
const RECENTS_KEY = "studio.recentFiles";

async function recents(): Promise<RecentFile[]> {
  return (await get<RecentFile[]>(RECENTS_KEY)) ?? [];
}

async function pushRecent(name: string, path?: string): Promise<void> {
  const list = await recents();
  const next = [{ name, path, at: Date.now() }, ...list.filter((r) => r.name !== name)].slice(
    0,
    10,
  );
  await set(RECENTS_KEY, next);
}

/* ---- File System Access API (Chromium) with graceful fallback ---- */
interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}
interface FsAccessWindow {
  showOpenFilePicker?: (opts?: {
    multiple?: boolean;
    types?: { accept: Record<string, string[]> }[];
  }) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (opts?: { suggestedName?: string }) => Promise<FileHandleLike>;
}

function fsWindow(): FsAccessWindow {
  return window as unknown as FsAccessWindow;
}

async function readFile(file: File): Promise<OpenedFile> {
  return { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };
}

async function pickWithInput(accept?: string[], multiple = false): Promise<OpenedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    if (accept?.length) input.accept = accept.join(",");
    input.style.display = "none";
    const cleanup = (): void => input.remove();
    input.addEventListener("cancel", () => {
      cleanup();
      resolve([]);
    });
    input.addEventListener("change", async () => {
      const files = Array.from(input.files ?? []);
      cleanup();
      resolve(await Promise.all(files.map(readFile)));
    });
    document.body.appendChild(input);
    input.click();
  });
}

function downloadBlob(name: string, data: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(data)]));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function pickerTypes(accept?: string[]): { types?: { accept: Record<string, string[]> }[] } {
  return accept?.length ? { types: [{ accept: { "application/octet-stream": accept } }] } : {};
}

const webFileService: FileService = {
  async open(opts) {
    const w = fsWindow();
    if (w.showOpenFilePicker) {
      try {
        const [handle] = await w.showOpenFilePicker(pickerTypes(opts?.accept));
        const opened = await readFile(await handle.getFile());
        await pushRecent(opened.name);
        return opened;
      } catch {
        return null; // user dismissed the picker
      }
    }
    const [opened] = await pickWithInput(opts?.accept);
    if (opened) await pushRecent(opened.name);
    return opened ?? null;
  },

  async openMultiple(opts) {
    const w = fsWindow();
    if (w.showOpenFilePicker) {
      try {
        const handles = await w.showOpenFilePicker({ multiple: true, ...pickerTypes(opts?.accept) });
        const files = await Promise.all(handles.map(async (h) => readFile(await h.getFile())));
        for (const f of files) await pushRecent(f.name);
        return files;
      } catch {
        return [];
      }
    }
    const files = await pickWithInput(opts?.accept, true);
    for (const f of files) await pushRecent(f.name);
    return files;
  },

  async save(name, data) {
    const w = fsWindow();
    if (w.showSaveFilePicker) {
      try {
        const handle = await w.showSaveFilePicker({ suggestedName: name });
        const writable = await handle.createWritable();
        await writable.write(new Blob([Uint8Array.from(data)]));
        await writable.close();
        await pushRecent(handle.name);
        return handle.name;
      } catch {
        return null;
      }
    }
    downloadBlob(name, data);
    await pushRecent(name);
    return name;
  },

  recents,
};

/* ---- Electron: native dialogs via the preload bridge ---- */
const electronFileService: FileService = {
  async open(opts) {
    const result = await window.studio!.openFile(opts);
    if (result) await pushRecent(result.name, result.path);
    return result;
  },
  async openMultiple(opts) {
    const results = await window.studio!.openFiles(opts);
    for (const r of results) await pushRecent(r.name, r.path);
    return results;
  },
  async save(name, data) {
    const path = await window.studio!.saveFile(name, data);
    if (path) await pushRecent(name, path);
    return path;
  },
  recents,
};

export function getFileService(): FileService {
  return window.studio?.isElectron ? electronFileService : webFileService;
}
