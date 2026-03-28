self.addEventListener('message', async (event) => {
  const msg = event.data || {};
  if (msg.type !== 'search') return;

  const base = String(msg.base || '');
  const q = normalizePlate(msg.q || '');
  const issues = Array.isArray(msg.issues) ? msg.issues : [];
  const sortMode = String(msg.sortMode || 'amount_desc');
  const timeoutMs = Number(msg.timeoutMs || 12000);

  try {
    const matches = [];
    const total = issues.length;

    for (let i = 0; i < issues.length; i += 1) {
      const issue = issues[i] || {};
      const file = String(issue.file || '');
      if (!file) {
        self.postMessage({ type: 'progress', scanned: i + 1, total, matched: matches.length });
        continue;
      }

      try {
        const url = new URL(file, base).href;
        const rows = await fetchJsonWithTimeout(url, timeoutMs);
        for (const row of rows) {
          if (isMatched(row, q)) matches.push(row);
        }
      } catch {
        // Skip broken/slow shard and continue.
      }

      self.postMessage({ type: 'progress', scanned: i + 1, total, matched: matches.length });
      if ((i + 1) % 4 === 0) {
        await pause();
      }
    }

    const sorted = sortRows(matches, sortMode, q);
    self.postMessage({ type: 'done', matches: sorted, total });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
});

function pause() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'force-cache', signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizePlate(v) {
  const raw = Array.isArray(v) ? v.join('') : v == null ? '' : String(v);
  return raw.toUpperCase().replace(/\s+/g, '').replace(/I/g, '1').replace(/O/g, '0').replace(/Q/g, '').trim();
}

function isMatched(row, q) {
  const s = normalizePlate(row && row.single_line);
  const d = normalizePlate(row && row.double_line);
  return s.includes(q) || d.includes(q);
}

function isExactPlateMatch(row, q) {
  const s = normalizePlate(row && row.single_line);
  const d = normalizePlate(row && row.double_line);
  return s === q || d === q;
}

function sortRows(rows, sortMode, q) {
  return rows.slice().sort((a, b) => {
    const aPlate = String(a && a.single_line != null ? a.single_line : '');
    const bPlate = String(b && b.single_line != null ? b.single_line : '');

    if (q) {
      const aExact = isExactPlateMatch(a, q);
      const bExact = isExactPlateMatch(b, q);
      if (aExact !== bExact) return aExact ? -1 : 1;
    }

    if (sortMode === 'amount_desc' || sortMode === 'amount_asc') {
      const av0 = a && a.amount_hkd != null ? Number(a.amount_hkd) : -1;
      const bv0 = b && b.amount_hkd != null ? Number(b.amount_hkd) : -1;
      const av = Number.isFinite(av0) ? av0 : -1;
      const bv = Number.isFinite(bv0) ? bv0 : -1;
      if (av !== bv) return sortMode === 'amount_desc' ? bv - av : av - bv;
    }

    if (sortMode === 'plate_asc') {
      return aPlate.localeCompare(bPlate);
    }

    const aDate = String(a && a.auction_date != null ? a.auction_date : '');
    const bDate = String(b && b.auction_date != null ? b.auction_date : '');
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    return aPlate.localeCompare(bPlate);
  });
}
