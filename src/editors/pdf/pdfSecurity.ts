import type { PDFDocument as MuPDFDocument } from "mupdf";

type Bytes = Uint8Array;

export interface Permissions {
  print: boolean;
  modify: boolean;
  copy: boolean;
  annotate: boolean;
  fillForms: boolean;
  extract: boolean;
  assemble: boolean;
  printHighRes: boolean;
}

export const ALLOW_ALL: Permissions = {
  print: true,
  modify: true,
  copy: true,
  annotate: true,
  fillForms: true,
  extract: true,
  assemble: true,
  printHighRes: true,
};

/** PDF permissions (/P) integer: reserved high bits set, feature bits toggled. */
export function permissionsInt(p: Permissions): number {
  let v = 0xfffff0c0 | 0; // reserved bits set, all feature bits cleared
  if (p.print) v |= 0x4;
  if (p.modify) v |= 0x8;
  if (p.copy) v |= 0x10;
  if (p.annotate) v |= 0x20;
  if (p.fillForms) v |= 0x100;
  if (p.extract) v |= 0x200;
  if (p.assemble) v |= 0x400;
  if (p.printHighRes) v |= 0x800;
  return v;
}

export interface ProtectOptions {
  userPassword?: string;
  ownerPassword?: string;
  permissions?: Permissions;
}

/** Encrypt a PDF with AES-256 (open password, owner/permissions password) via mupdf. */
export async function addPassword(bytes: Bytes, opts: ProtectOptions): Promise<Bytes> {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as MuPDFDocument;
  const parts = ["encrypt=aes-256"];
  if (opts.userPassword) parts.push(`user-password=${opts.userPassword}`);
  if (opts.ownerPassword) parts.push(`owner-password=${opts.ownerPassword}`);
  parts.push(`permissions=${permissionsInt(opts.permissions ?? ALLOW_ALL)}`);
  const buf = doc.saveToBuffer(parts.join(","));
  return buf.asUint8Array();
}

/** Remove encryption from a PDF (requires the current password). */
export async function removePassword(bytes: Bytes, password: string): Promise<Bytes> {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as MuPDFDocument;
  if (doc.needsPassword() && !doc.authenticatePassword(password)) {
    throw new Error("Incorrect password");
  }
  return doc.saveToBuffer("decrypt").asUint8Array();
}

/** Whether a PDF is encrypted / needs a password to open. */
export async function isEncrypted(bytes: Bytes): Promise<boolean> {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as MuPDFDocument;
  return doc.needsPassword();
}
