/// <reference types="vite/client" />

declare module "@fontsource-variable/instrument-sans";
declare module "@fontsource-variable/spline-sans-mono";

interface OpenedNativeFile {
  path: string;
  name: string;
  data: Uint8Array;
}

interface StudioBridge {
  isElectron: true;
  openFile: (opts?: { accept?: string[] }) => Promise<OpenedNativeFile | null>;
  openFiles: (opts?: { accept?: string[] }) => Promise<OpenedNativeFile[]>;
  saveFile: (name: string, data: Uint8Array) => Promise<string | null>;
  onOpenPath: (cb: (path: string) => void) => void;
}

interface Window {
  studio?: StudioBridge;
  studioDev?: {
    openPdf: (name: string, bytes: Uint8Array) => Promise<string>;
    dispatchCommand: (id: string, args: unknown) => Promise<unknown>;
  };
}
