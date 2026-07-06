import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("studio", {
  isElectron: true,
  openFile: (opts?: { accept?: string[] }) => ipcRenderer.invoke("file:open", opts),
  openFiles: (opts?: { accept?: string[] }) => ipcRenderer.invoke("file:openMultiple", opts),
  saveFile: (name: string, data: Uint8Array) => ipcRenderer.invoke("file:save", name, data),
  onOpenPath: (cb: (path: string) => void) =>
    ipcRenderer.on("open-path", (_e, path: string) => cb(path)),
});
