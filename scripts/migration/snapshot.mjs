import { createHash, randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const snapshotDigest = snapshot => sha256(canonicalJson(snapshot));
const normalized = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const sensitive = value => /^(passcode|pin|password|secret|token|api[ _-]?key|.*[ _-]token)$/.test(normalized(value));
const staffColumns = new Set(['name', 'status', 'last login', 'last active']);

export function cellValue(cell) {
  if (!cell || cell.redacted) return null;
  const value = cell.effective ?? cell.entered;
  if (!value || value.errorValue || value.formulaValue) return null;
  return value.numberValue ?? value.stringValue ?? value.boolValue ?? null;
}

function gridRows(sheet) {
  const rows = new Map();
  for (const grid of sheet.data ?? []) {
    for (const [offset, row] of (grid.rowData ?? []).entries()) {
      const rowNumber = (grid.startRow ?? 0) + offset + 1;
      const cells = rows.get(rowNumber) ?? [];
      for (const [columnOffset, cell] of (row.values ?? []).entries()) {
        const column = (grid.startColumn ?? 0) + columnOffset;
        if (cells[column]) throw new Error('Overlapping grid ranges cannot be normalized safely');
        cells[column] = {
          entered: cell.userEnteredValue ?? null,
          effective: cell.effectiveValue ?? null,
          formatted: cell.formattedValue ?? null,
        };
      }
      if (cells.some(cell => cell && (cell.entered !== null || cell.effective !== null || cell.formatted !== null))) {
        rows.set(rowNumber, cells);
      }
    }
  }
  return [...rows].sort((a, b) => a[0] - b[0]).map(([rowNumber, cells]) => ({ rowNumber, cells: Array.from(cells, c => c ?? null) }));
}

// Redact known credential columns even when their header isn't on the first row.
// The encrypted archive retains the original response for controlled recovery.
export function redactSheet(sheet) {
  const headers = sheet.rows.find(row => row.rowNumber === 1)?.cells ?? [];
  const sensitiveColumns = new Set();
  for (const row of sheet.rows) {
    row.cells.forEach((cell, column) => { if (sensitive(cellValue(cell))) sensitiveColumns.add(column); });
  }
  return { ...sheet, rows: sheet.rows.map(row => ({ ...row, cells: row.cells.map((cell, column) => {
    if (!cell) return null;
    const formula = cell.entered?.formulaValue ?? '';
    const isStaffSecret = normalized(sheet.title) === 'cashiers' && row.rowNumber > 1
      && !staffColumns.has(normalized(cellValue(headers[column])));
    if (isStaffSecret || (sensitiveColumns.has(column) && !sensitive(cellValue(cell))) || /cashiers\s*'?\s*!/i.test(formula)) {
      return { redacted: true };
    }
    return cell;
  }) })) };
}

export function snapshotFromSpreadsheet(workbook, capturedAt = new Date().toISOString()) {
  if (!workbook.spreadsheetId || !Array.isArray(workbook.sheets)) throw new Error('Incomplete workbook response');
  const snapshot = {
    version: 1,
    workbookId: workbook.spreadsheetId,
    capturedAt,
    timeZone: workbook.properties?.timeZone ?? null,
    locale: workbook.properties?.locale ?? null,
    sheets: workbook.sheets.map((sheet, position) => redactSheet({
      sheetId: sheet.properties?.sheetId,
      title: sheet.properties?.title,
      position,
      gridProperties: sheet.properties?.gridProperties ?? {},
      rows: gridRows(sheet),
    })),
  };
  validateSnapshot(snapshot);
  return snapshot;
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function validateValue(value) {
  if (value === null) return;
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Invalid cell value');
  const keys = Object.keys(value);
  assert(keys.length === 1, 'Invalid extended value');
  const key = keys[0];
  const content = value[key];
  assert((['stringValue', 'formulaValue'].includes(key) && typeof content === 'string')
    || (key === 'numberValue' && Number.isFinite(content))
    || (key === 'boolValue' && typeof content === 'boolean')
    || (key === 'errorValue' && content && typeof content.type === 'string'
      && (content.message === undefined || typeof content.message === 'string')),
  'Unsupported cell value');
}

export function validateSnapshot(snapshot) {
  assert(snapshot?.version === 1 && typeof snapshot.workbookId === 'string' && snapshot.workbookId.length > 0, 'Invalid snapshot');
  assert(typeof snapshot.capturedAt === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(snapshot.capturedAt)
    && Number.isFinite(Date.parse(snapshot.capturedAt)), 'Invalid capture time');
  assert(Array.isArray(snapshot.sheets) && snapshot.sheets.length > 0, 'Snapshot has no sheets');
  const sheetIds = new Set();
  for (const sheet of snapshot.sheets) {
    assert(Number.isSafeInteger(sheet.sheetId) && sheet.sheetId >= 0 && !sheetIds.has(sheet.sheetId), 'Invalid or duplicate sheet ID');
    sheetIds.add(sheet.sheetId);
    assert(typeof sheet.title === 'string' && sheet.title.length > 0 && Number.isSafeInteger(sheet.position)
      && sheet.position >= 0 && Array.isArray(sheet.rows), 'Invalid sheet metadata');
    const rowNumbers = new Set();
    for (const row of sheet.rows) {
      assert(Number.isSafeInteger(row.rowNumber) && row.rowNumber > 0 && !rowNumbers.has(row.rowNumber), 'Invalid or duplicate row number');
      rowNumbers.add(row.rowNumber);
      assert(Array.isArray(row.cells), 'Invalid cells');
      for (const cell of row.cells) {
        if (cell === null) continue;
        assert(typeof cell === 'object' && !Array.isArray(cell), 'Invalid cell');
        if (cell.redacted === true) { assert(Object.keys(cell).length === 1, 'Redacted cell contains extra data'); continue; }
        assert(Object.keys(cell).every(key => ['entered', 'effective', 'formatted'].includes(key)), 'Unexpected cell metadata');
        validateValue(cell.entered);
        validateValue(cell.effective);
        assert(cell.formatted === null || typeof cell.formatted === 'string', 'Invalid formatted value');
      }
    }
    assert(canonicalJson(redactSheet(sheet)) === canonicalJson(sheet), 'Snapshot contains unredacted credential columns');
  }
  return snapshot;
}

// Explicit half-up rounding to kobo using decimal strings, never binary arithmetic.
export function moneyToKobo(value) {
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)) {
    throw new Error('Unsafe numeric amount');
  }
  let input = String(value ?? '').replace(/[₦\s]/g, '');
  // Sheets formulas can return tiny floating-point residuals in scientific
  // notation. Expand numeric values as decimal text before rounding to kobo.
  // Do not reinterpret manually entered text such as "1e3" as an amount.
  if (typeof value === 'number' && /e/i.test(input)) {
    const [coefficient, exponentText] = input.toLowerCase().split('e');
    const negative = coefficient.startsWith('-');
    const unsigned = negative ? coefficient.slice(1) : coefficient;
    const digits = unsigned.replace('.', '');
    const decimalPosition = unsigned.split('.')[0].length + Number(exponentText);
    const expanded = decimalPosition <= 0 ? `0.${'0'.repeat(-decimalPosition)}${digits}`
      : decimalPosition >= digits.length ? digits + '0'.repeat(decimalPosition - digits.length)
        : `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
    input = (negative ? '-' : '') + expanded;
  }
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(input)) throw new Error('Unrecognized money value');
  const text = input.replaceAll(',', '');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error('Unrecognized money value');
  const fractional = (match[3] ?? '').padEnd(3, '0');
  let result = BigInt(match[2]) * 100n + BigInt(fractional.slice(0, 2));
  if (fractional[2] >= '5') result += 1n;
  if (match[1]) result = -result;
  if (result < -9223372036854775808n || result > 9223372036854775807n) throw new Error('Amount exceeds bigint capacity');
  return result.toString();
}

export function inspectSnapshot(snapshot) {
  validateSnapshot(snapshot);
  const keyHeaders = { Sales: ['sales id', 'transaction id', 'timestamp'], Payments: ['payment id'], Expenses: ['expense id', 'timestamp'] };
  const reports = [];
  const dispositions = new Map();
  for (const sheet of snapshot.sheets) {
    const headers = sheet.rows.find(row => row.rowNumber === 1)?.cells.map(cell => normalized(cellValue(cell))) ?? [];
    const required = Object.hasOwn(keyHeaders, sheet.title) ? keyHeaders[sheet.title] : [];
    const duplicates = new Map();
    const issues = [];
    /** @type {Record<string, string>} */
    const totals = {};
    const namedHeaders = headers.filter(Boolean);
    const duplicateHeaders = new Set(namedHeaders).size !== namedHeaders.length;
    for (const row of sheet.rows) {
      const codes = [];
      if (row.rowNumber === 1) { dispositions.set(`${sheet.sheetId}:1`, { disposition: 'header', codes }); continue; }
      if (headers.length === 0) codes.push('missing_header_row');
      if (duplicateHeaders) codes.push('duplicate_headers');
      for (const header of required) {
        const column = headers.indexOf(header);
        const value = column < 0 ? null : cellValue(row.cells[column]);
        if (value === null || String(value).trim() === '') codes.push(`missing_${header.replaceAll(' ', '_')}`);
        else {
          const key = `${header}:${String(value)}`;
          const seen = duplicates.get(key) ?? [];
          seen.push(row.rowNumber);
          duplicates.set(key, seen);
        }
      }
      if (row.cells.some(cell => cell?.effective?.errorValue)) codes.push('formula_error');
      for (const header of ['amount (₦)', 'initial payment (₦)', 'additional payment 1', 'additional payment 2', 'amount']) {
        const column = headers.indexOf(header);
        if (column < 0) continue;
        const value = cellValue(row.cells[column]);
        if (value === null || value === '') {
          if (header === 'amount' || header === 'amount (₦)') codes.push(`missing_money_column_${column + 1}`);
          continue;
        }
        try { totals[header] = (BigInt(totals[header] ?? '0') + BigInt(moneyToKobo(value))).toString(); }
        catch { codes.push(`invalid_money_column_${column + 1}`); }
      }
      const entry = { disposition: required.length ? 'pending' : 'reference', codes };
      dispositions.set(`${sheet.sheetId}:${row.rowNumber}`, entry);
      issues.push({ rowNumber: row.rowNumber, codes });
    }
    for (const [key, rows] of duplicates) {
      if (rows.length < 2) continue;
      const code = `repeated_${key.split(':')[0].replaceAll(' ', '_')}`;
      for (const rowNumber of rows) dispositions.get(`${sheet.sheetId}:${rowNumber}`).codes.push(code);
    }
    for (const row of sheet.rows) {
      const entry = dispositions.get(`${sheet.sheetId}:${row.rowNumber}`);
      if (entry.codes.length) entry.disposition = 'quarantined';
    }
    reports.push({ sheetId: sheet.sheetId, title: sheet.title, rows: sheet.rows.length,
      // These are independent column totals, NOT certified revenue/debt totals.
      columnTotalsKobo: totals, issues: issues.filter(issue => issue.codes.length) });
  }
  return { report: { version: 1, snapshotSha256: snapshotDigest(snapshot), sheets: reports, financialReconciliation: 'not_performed' }, dispositions };
}

export function encryptArchive(workbook, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 32) throw new Error('Archive passphrase must contain at least 32 characters');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
  cipher.setAAD(Buffer.from('bomedia-workbook-archive-v1'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(workbook), 'utf8'), cipher.final()]);
  return { version: 1, algorithm: 'aes-256-gcm', kdf: 'scrypt', salt: salt.toString('base64'),
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

export function decryptArchive(archive, passphrase) {
  if (archive.version !== 1 || archive.algorithm !== 'aes-256-gcm' || archive.kdf !== 'scrypt') throw new Error('Unsupported archive');
  const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, Buffer.from(archive.salt, 'base64'), 32), Buffer.from(archive.iv, 'base64'));
  decipher.setAAD(Buffer.from('bomedia-workbook-archive-v1'));
  decipher.setAuthTag(Buffer.from(archive.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(archive.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}
