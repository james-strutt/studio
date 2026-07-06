/** Trigger a browser download of raw bytes. */
export function downloadFile(name: string, data: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(data)]));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
