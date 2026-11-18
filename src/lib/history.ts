export interface RecentClipItem {
  id: string;
  kind: "text" | "markdown" | "code" | "image" | "file" | "url";
  preview: string;
  url: string;
  hasPassword?: boolean;
  isE2EE?: boolean;
  expiresAt?: string | null;
  createdAt: string;
}

const HISTORY_KEY = "cb_recent_history_v1";
const MAX_ITEMS = 30;

export function getRecentHistory(): RecentClipItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushRecentHistory(item: RecentClipItem): void {
  if (typeof window === "undefined") return;
  try {
    const list = getRecentHistory().filter((x) => x.id !== item.id);
    list.unshift(item);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    // Ignore storage quota errors
  }
}

export function removeRecentHistory(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getRecentHistory().filter((x) => x.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // Ignore
  }
}

export function clearRecentHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
}
