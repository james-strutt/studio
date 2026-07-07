import { get, set } from "idb-keyval";

export interface StoredSignature {
  id: string;
  name: string;
  bytes: Uint8Array; // PNG
}

const KEY = "studio.signatures";

/** The signature library persists in IndexedDB (local only). */
export async function listSignatures(): Promise<StoredSignature[]> {
  return (await get<StoredSignature[]>(KEY)) ?? [];
}

export async function saveSignature(name: string, bytes: Uint8Array): Promise<StoredSignature> {
  const sig: StoredSignature = { id: crypto.randomUUID(), name, bytes };
  await set(KEY, [...(await listSignatures()), sig]);
  return sig;
}

export async function deleteSignature(id: string): Promise<void> {
  const list = await listSignatures();
  await set(
    KEY,
    list.filter((s) => s.id !== id),
  );
}
