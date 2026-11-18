export type ExpiryOption = "1h" | "1d" | "7d" | "30d" | "never";

const MS_MAP: Record<Exclude<ExpiryOption, "never">, number> = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function calculateExpiresAt(option: string | null | undefined, now = new Date()): string | null {
  if (!option || option === "never") return null;
  const delta = MS_MAP[option as Exclude<ExpiryOption, "never">];
  if (!delta) return new Date(now.getTime() + MS_MAP["7d"]).toISOString();
  return new Date(now.getTime() + delta).toISOString();
}

export function isExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return false;
  return now.getTime() >= ts;
}

export function formatRemainingTtl(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "Never expires";
  const diff = Date.parse(expiresAt) - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return "Expired";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h left`;
  const days = Math.floor(hrs / 24);
  return `${days}d left`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}
