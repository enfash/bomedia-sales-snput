import { canonicalJson, inspectSnapshot, snapshotDigest } from './snapshot.mjs';

// db implements query(text, params) and transaction(callback), as PGlite does.
// All workbook rows are staged atomically. Business tables are never written.
export async function stageSnapshot(db, snapshot, archiveReference) {
  const { report, dispositions } = inspectSnapshot(snapshot);
  const digest = snapshotDigest(snapshot);
  if (typeof archiveReference !== 'string' || !archiveReference.trim()) throw new Error('Archive reference is required');
  return db.transaction(async tx => {
    await tx.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`snapshot:${digest}`]);
    await tx.query(`insert into migration.snapshots(workbook_id, sha256, captured_at, archive_reference)
      values ($1, $2, $3, $4) on conflict (sha256) do nothing`, [snapshot.workbookId, digest, snapshot.capturedAt, archiveReference]);
    const snapshotId = (await tx.query('select id from migration.snapshots where sha256 = $1', [digest])).rows[0].id;
    for (const sheet of snapshot.sheets) {
      await tx.query(`insert into migration.source_sheets(snapshot_id, sheet_id, title, position, metadata)
        values ($1, $2, $3, $4, $5::jsonb) on conflict (snapshot_id, sheet_id) do nothing`,
      [snapshotId, sheet.sheetId, sheet.title, sheet.position, JSON.stringify({ gridProperties: sheet.gridProperties,
        timeZone: snapshot.timeZone, locale: snapshot.locale })]);
      const stored = (await tx.query('select id, title, position from migration.source_sheets where snapshot_id = $1 and sheet_id = $2',
        [snapshotId, sheet.sheetId])).rows[0];
      if (stored.title !== sheet.title || stored.position !== sheet.position) throw new Error('Existing snapshot sheet differs; investigate staging integrity');
      for (let offset = 0; offset < sheet.rows.length; offset += 200) {
        const batch = sheet.rows.slice(offset, offset + 200).map(row => {
          const { disposition, codes } = dispositions.get(`${sheet.sheetId}:${row.rowNumber}`);
          return { row_number: row.rowNumber, cells: row.cells, disposition,
            review_notes: codes.length ? codes.join(', ') : null };
        });
        await tx.query(`insert into migration.source_rows(sheet_id, row_number, cells, disposition, review_notes)
          select $1::uuid, row_number, cells, disposition, review_notes
          from jsonb_to_recordset($2::jsonb)
            as input(row_number integer, cells jsonb, disposition text, review_notes text)
          on conflict (sheet_id, row_number) do nothing`, [stored.id, JSON.stringify(batch)]);
      }
      const savedRows = (await tx.query('select row_number, cells from migration.source_rows where sheet_id = $1 order by row_number', [stored.id])).rows;
      if (savedRows.length !== sheet.rows.length) throw new Error('Unexpected rows in staged snapshot');
      const expectedRows = new Map(sheet.rows.map(row => [row.rowNumber, row.cells]));
      for (const saved of savedRows) {
        if (!expectedRows.has(saved.row_number) || canonicalJson(saved.cells) !== canonicalJson(expectedRows.get(saved.row_number))) {
          throw new Error('Existing snapshot row differs; investigate staging integrity');
        }
      }
    }
    const count = (await tx.query('select count(*)::integer as count from migration.source_sheets where snapshot_id = $1', [snapshotId])).rows[0].count;
    if (count !== snapshot.sheets.length) throw new Error('Unexpected sheets in staged snapshot');
    // Each attempt gets its own run record; source rows are never duplicated.
    await tx.query(`insert into migration.import_runs(snapshot_id, importer_version, status, reconciliation, finished_at)
      values ($1, 'staging-v1', 'reconciling', $2::jsonb, now())`, [snapshotId, JSON.stringify(report)]);
    return { snapshotId, sheets: count, rows: snapshot.sheets.reduce((n, sheet) => n + sheet.rows.length, 0),
      quarantined: [...dispositions.values()].filter(entry => entry.disposition === 'quarantined').length };
  });
}
