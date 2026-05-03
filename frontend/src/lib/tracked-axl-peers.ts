/**
 * Browser-local registry of ENS ↔ axl_peer_id pairs we care about (operator console).
 * Lets us compare published ENS text records to this node's mesh peer id without extra RPC calls.
 */

const ENTRIES_KEY = "sail.trackedAxlPeers.v1";
const LOCAL_PEER_KEY = "sail.localAxlPeerId.v1";
const MAX_ENTRIES = 48;

export type TrackedAxlSource = "ens_subname" | "discover" | "manual";

export type TrackedAxlEntry = {
  ens: string;
  axlPeerId: string;
  source: TrackedAxlSource;
  updatedAt: number;
};

function safeReadEntries(): TrackedAxlEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ENTRIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is TrackedAxlEntry =>
          row &&
          typeof row === "object" &&
          typeof (row as TrackedAxlEntry).ens === "string" &&
          typeof (row as TrackedAxlEntry).axlPeerId === "string",
      )
      .map((row) => ({
        ens: row.ens.trim(),
        axlPeerId: row.axlPeerId.trim(),
        source: (["ens_subname", "discover", "manual"].includes(row.source)
          ? row.source
          : "manual") as TrackedAxlSource,
        updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : Date.now(),
      }))
      .filter((row) => row.ens.length > 0 && row.axlPeerId.length > 0);
  } catch {
    return [];
  }
}

function writeEntries(entries: TrackedAxlEntry[]): void {
  if (typeof window === "undefined") return;
  const trimmed = entries.slice(0, MAX_ENTRIES);
  window.localStorage.setItem(ENTRIES_KEY, JSON.stringify(trimmed));
}

export function loadTrackedAxlEntries(): TrackedAxlEntry[] {
  return safeReadEntries().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertTrackedAxlEntry(
  input: { ens: string; axlPeerId: string; source: TrackedAxlSource },
): TrackedAxlEntry[] {
  const ens = input.ens.trim();
  const axlPeerId = input.axlPeerId.trim();
  if (!ens || !axlPeerId) return loadTrackedAxlEntries();

  const now = Date.now();
  const prev = safeReadEntries().filter((e) => e.ens.toLowerCase() !== ens.toLowerCase());
  const next: TrackedAxlEntry[] = [
    { ens, axlPeerId, source: input.source, updatedAt: now },
    ...prev,
  ].slice(0, MAX_ENTRIES);
  writeEntries(next);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeTrackedAxlEntry(ens: string): TrackedAxlEntry[] {
  const key = ens.trim().toLowerCase();
  const next = safeReadEntries().filter((e) => e.ens.toLowerCase() !== key);
  writeEntries(next);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function setStoredLocalAxlPeerId(peerId: string | null): void {
  if (typeof window === "undefined") return;
  if (!peerId?.trim()) {
    window.localStorage.removeItem(LOCAL_PEER_KEY);
    return;
  }
  window.localStorage.setItem(LOCAL_PEER_KEY, peerId.trim());
}

export function getStoredLocalAxlPeerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LOCAL_PEER_KEY)?.trim();
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Compare libp2p-style peer ids (exact string match after trim). */
export function peerIdsMatch(a: string, b: string): boolean {
  return a.trim() === b.trim();
}
