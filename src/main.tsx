import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/spline-sans-mono";
import "@/styles/global.css";
import "@/commands/coreCommands";
import "@/editors/pdf/pdfCommands";
import "@/editors/pdf/pdfPageCommands";
import { App } from "@/App";
import { usePdfStore } from "@/editors/pdf/pdfStore";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// DEV-only seam so automated tests can load a document without an OS file
// picker. Tree-shaken out of production builds.
if (import.meta.env.DEV) {
  window.studioDev = {
    openPdf: (name, bytes) => usePdfStore.getState().openBytes(name, bytes),
  };
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
