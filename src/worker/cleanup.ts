export interface CleanupEnv {
  CLIPBOARD_DB: D1Database;
  CLIPBOARD_FILES: R2Bucket;
}

export async function purgeExpiredContent(env: CleanupEnv): Promise<{
  deletedClips: number;
  deletedUrls: number;
  deletedFiles: number;
}> {
  const nowIso = new Date().toISOString();

  const expiredClips = await env.CLIPBOARD_DB.prepare(
    `SELECT id, r2_key FROM clips
     WHERE (expires_at IS NOT NULL AND expires_at <= ?)
        OR (max_views > 0 AND view_count >= max_views)
     LIMIT 1000`
  )
    .bind(nowIso)
    .all<{ id: string; r2_key: string }>();

  const rows = expiredClips.results ?? [];
  const r2Keys = rows.map((r) => r.r2_key).filter(Boolean);
  let deletedFiles = 0;

  if (r2Keys.length > 0) {
    try {
      await env.CLIPBOARD_FILES.delete(r2Keys);
      deletedFiles = r2Keys.length;
    } catch {
      // Continue D1 cleanup for IDs in this batch
    }
  }

  let deletedClips = 0;
  // Delete only the exact IDs fetched in this batch (chunked for SQLite parameter limits)
  for (let i = 0; i < rows.length; i += 90) {
    const chunk = rows.slice(i, i + 90).map((r) => r.id);
    const placeholders = chunk.map(() => "?").join(",");
    const res = await env.CLIPBOARD_DB.prepare(
      `DELETE FROM clips WHERE id IN (${placeholders})`
    )
      .bind(...chunk)
      .run();
    deletedClips += res.meta?.changes ?? 0;
  }

  const urlRes = await env.CLIPBOARD_DB.prepare(
    "DELETE FROM short_urls WHERE expires_at IS NOT NULL AND expires_at <= ?"
  )
    .bind(nowIso)
    .run();

  await env.CLIPBOARD_DB.prepare(
    "DELETE FROM url_clicks WHERE code NOT IN (SELECT code FROM short_urls)"
  ).run();

  return {
    deletedClips,
    deletedUrls: urlRes.meta?.changes ?? 0,
    deletedFiles,
  };
}
