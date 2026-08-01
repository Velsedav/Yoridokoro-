/** Convert Tauri/Postgres-style numbered parameters to SQLite anonymous
 * parameters while preserving repeats and out-of-order references. */
export function normalizeSqlStatement(sql: string, params: unknown[] = []) {
  // Bingoals and native SQLite callers already use anonymous placeholders.
  // Keep both the SQL and its parameters intact in that case. Previously the
  // parameters were discarded, making every `WHERE … = ?` query fail.
  if (!/\$\d+/.test(sql)) return { sql, params }

  const orderedParams: unknown[] = []
  const normalizedSql = sql.replace(/\$(\d+)/g, (_placeholder, rawIndex: string) => {
    const index = Number(rawIndex) - 1
    orderedParams.push(params[index] === undefined ? null : params[index])
    return '?'
  })
  return { sql: normalizedSql, params: orderedParams }
}
