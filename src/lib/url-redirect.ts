import { getEnv } from "./server";
import { isExpired } from "./ttl";
import { parseUserAgent } from "./ua";

export interface AnalyticsSummary {
  code: string;
  targetUrl: string;
  title: string;
  expiresAt?: string | null;
  createdAt?: string;
  totalClicks: number;
  browsers: Array<{ label: string; count: number }>;
  operatingSystems: Array<{ label: string; count: number }>;
  devices: Array<{ label: string; count: number }>;
  countries: Array<{ label: string; count: number }>;
  days: Array<{ label: string; count: number }>;
}

export async function queryUrlAnalytics(
  db: D1Database,
  urlRow: {
    code: string;
    target_url: string;
    title: string;
    expires_at?: string | null;
    created_at?: string;
  }
): Promise<AnalyticsSummary> {
  const totalRow = await db
    .prepare("SELECT COUNT(*) AS cnt FROM url_clicks WHERE code = ?")
    .bind(urlRow.code)
    .first<{ cnt: number }>();

  const [browsers, operatingSystems, devices, countries, days] = await Promise.all([
    db
      .prepare(
        "SELECT browser AS label, COUNT(*) AS count FROM url_clicks WHERE code = ? GROUP BY browser ORDER BY count DESC LIMIT 12"
      )
      .bind(urlRow.code)
      .all<{ label: string; count: number }>(),
    db
      .prepare(
        "SELECT os AS label, COUNT(*) AS count FROM url_clicks WHERE code = ? GROUP BY os ORDER BY count DESC LIMIT 12"
      )
      .bind(urlRow.code)
      .all<{ label: string; count: number }>(),
    db
      .prepare(
        "SELECT device_type AS label, COUNT(*) AS count FROM url_clicks WHERE code = ? GROUP BY device_type ORDER BY count DESC LIMIT 12"
      )
      .bind(urlRow.code)
      .all<{ label: string; count: number }>(),
    db
      .prepare(
        "SELECT country AS label, COUNT(*) AS count FROM url_clicks WHERE code = ? GROUP BY country ORDER BY count DESC LIMIT 12"
      )
      .bind(urlRow.code)
      .all<{ label: string; count: number }>(),
    db
      .prepare(
        "SELECT substr(clicked_at, 1, 10) AS label, COUNT(*) AS count FROM url_clicks WHERE code = ? GROUP BY substr(clicked_at, 1, 10) ORDER BY label ASC LIMIT 30"
      )
      .bind(urlRow.code)
      .all<{ label: string; count: number }>(),
  ]);

  return {
    code: urlRow.code,
    targetUrl: urlRow.target_url,
    title: urlRow.title,
    expiresAt: urlRow.expires_at ?? null,
    createdAt: urlRow.created_at,
    totalClicks: totalRow?.cnt || 0,
    browsers: browsers.results ?? [],
    operatingSystems: operatingSystems.results ?? [],
    devices: devices.results ?? [],
    countries: countries.results ?? [],
    days: (days.results ?? []).sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export async function resolveShortUrlOrStats(
  rawParam: string,
  request: Request,
  cfContext?: ExecutionContext
): Promise<
  | { action: "redirect"; targetUrl: string }
  | { action: "stats"; stats: AnalyticsSummary }
  | { action: "not_found" }
> {
  const clean = (rawParam || "").trim().toLowerCase();
  if (!clean) return { action: "not_found" };

  const isStats = clean.endsWith("+");
  const code = isStats ? clean.slice(0, -1) : clean;
  if (!code || code.includes(".")) return { action: "not_found" };

  const env = getEnv();
  const row = await env.CLIPBOARD_DB.prepare(
    "SELECT code, target_url, title, expires_at, created_at FROM short_urls WHERE code = ?"
  )
    .bind(code)
    .first<{
      code: string;
      target_url: string;
      title: string;
      expires_at: string | null;
      created_at: string;
    }>();

  if (!row || isExpired(row.expires_at)) {
    return { action: "not_found" };
  }

  if (!isStats) {
    const uaHeader = request.headers.get("user-agent") || "";
    const isPrefetch =
      request.method === "HEAD" ||
      /bot|crawl|spider|slurp|facebookexternalhit|WhatsApp|Slackbot/i.test(uaHeader);

    if (!isPrefetch) {
      const ua = parseUserAgent(uaHeader);
      const cfCountry =
        (request as Request & { cf?: { country?: string } }).cf?.country ||
        request.headers.get("cf-ipcountry") ||
        "XX";
      let refHost = "Direct";
      const ref = request.headers.get("referer");
      if (ref) {
        try {
          refHost = new URL(ref).hostname;
        } catch {
          refHost = "Other";
        }
      }

      const logPromise = env.CLIPBOARD_DB.prepare(
        "INSERT INTO url_clicks (code, browser, os, device_type, country, referrer, clicked_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(
          row.code,
          ua.browser,
          ua.os,
          ua.deviceType,
          cfCountry,
          refHost,
          new Date().toISOString()
        )
        .run()
        .catch(() => {});

      if (cfContext) {
        cfContext.waitUntil(logPromise);
      } else {
        await logPromise;
      }
    }

    return { action: "redirect", targetUrl: row.target_url };
  }

  return {
    action: "stats",
    stats: await queryUrlAnalytics(env.CLIPBOARD_DB, row),
  };
}
