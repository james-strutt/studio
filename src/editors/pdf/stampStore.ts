import { get, set } from "idb-keyval";

export interface StoredStamp {
  id: string;
  name: string;
  isPng: boolean;
  bytes: Uint8Array;
}

const KEY = "studio.stamps";

/** Custom image stamps live in IndexedDB so they persist across sessions. */
export async function listStamps(): Promise<StoredStamp[]> {
  return (await get<StoredStamp[]>(KEY)) ?? [];
}

export async function saveStamp(name: string, bytes: Uint8Array, isPng: boolean): Promise<StoredStamp> {
  const stamp: StoredStamp = { id: crypto.randomUUID(), name, isPng, bytes };
  const list = await listStamps();
  await set(KEY, [...list, stamp]);
  return stamp;
}

export async function deleteStamp(id: string): Promise<void> {
  const list = await listStamps();
  await set(
    KEY,
    list.filter((s) => s.id !== id),
  );
}
