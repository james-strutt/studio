import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

let mainWindow: BrowserWindow | null = null;
const pendingPaths: string[] = [];

function pdfArgs(argv: string[]): string[] {
  return argv.slice(1).filter((a) => a.toLowerCase().endsWith(".pdf"));
}

function sendOpenPath(path: string): void {
  if (mainWindow) mainWindow.webContents.send("open-path", path);
  else pendingPaths.push(path);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: { preload: join(__dirname, "../preload/preload.mjs"), sandbox: false },
  });
  mainWindow.on("ready-to-show", () => mainWindow?.show());

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    pdfArgs(argv).forEach(sendOpenPath);
  });

  app.on("open-file", (e, path) => {
    e.preventDefault();
    sendOpenPath(path);
  });

  ipcMain.handle("file:open", async (_e, opts?: { accept?: string[] }) => {
    const filters = opts?.accept?.length
      ? [{ name: "Files", extensions: opts.accept.map((a) => a.replace(/^\./, "")) }]
      : undefined;
    const res = await dialog.showOpenDialog({ properties: ["openFile"], filters });
    const path = res.filePaths[0];
    if (res.canceled || !path) return null;
    const data = await readFile(path);
    return { path, name: path.split(/[\\/]/).pop() ?? path, data: new Uint8Array(data) };
  });

  ipcMain.handle("file:openMultiple", async (_e, opts?: { accept?: string[] }) => {
    const filters = opts?.accept?.length
      ? [{ name: "Files", extensions: opts.accept.map((a) => a.replace(/^\./, "")) }]
      : undefined;
    const res = await dialog.showOpenDialog({ properties: ["openFile", "multiSelections"], filters });
    if (res.canceled) return [];
    return Promise.all(
      res.filePaths.map(async (path) => ({
        path,
        name: path.split(/[\\/]/).pop() ?? path,
        data: new Uint8Array(await readFile(path)),
      })),
    );
  });

  ipcMain.handle("file:save", async (_e, name: string, data: Uint8Array) => {
    const res = await dialog.showSaveDialog({ defaultPath: name });
    if (res.canceled || !res.filePath) return null;
    await writeFile(res.filePath, Buffer.from(data));
    return res.filePath;
  });

  void app.whenReady().then(() => {
    createWindow();
    [...pdfArgs(process.argv), ...pendingPaths].forEach((p) =>
      mainWindow?.webContents.send("open-path", p),
    );
    pendingPaths.length = 0;

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
