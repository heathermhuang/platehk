// Pure shared rules: amounts are historical auction results, never current valuations.
export function normalize(value) {
  return String(value ?? '').normalize('NFKC').toUpperCase().replace(/\s+/g, '').replace(/I/g, '1').replace(/O/g, '0');
}
export function validQuery(value) { return /^[A-HJ-NPR-Z0-9]{1,16}$/.test(normalize(value)); }
export function parseFilters(params) {
  const out = {};
  for (const key of ['prefix', 'suffix']) {
    const value = normalize(params.get(key));
    if (value && !validQuery(value)) throw new Error(`invalid ${key}`);
    out[key] = value;
  }
  for (const key of ['min_amount', 'max_amount', 'digits']) {
    const raw = params.get(key);
    if (raw == null || raw === '') { out[key] = null; continue; }
    if (!/^\d+$/.test(raw)) throw new Error(`invalid ${key}`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value > (key === 'digits' ? 8 : 1e9)) throw new Error(`invalid ${key}`);
    out[key] = value;
  }
  if (out.min_amount != null && out.max_amount != null && out.min_amount > out.max_amount) throw new Error('invalid price range');
  out.pattern = params.get('pattern') || '';
  if (!['', 'repeated', 'palindrome'].includes(out.pattern)) throw new Error('invalid pattern');
  for (const key of ['from', 'to']) {
    const value = params.get(key) || '';
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`invalid ${key}`);
    out[key] = value;
  }
  if (out.from && out.to && out.from > out.to) throw new Error('invalid date range');
  return out;
}
export const filterKeys = ['prefix', 'suffix', 'min_amount', 'max_amount', 'digits', 'pattern', 'from', 'to'];
export function matchesFilters(row, f) {
  const plate = normalize(row.single_line || (row.double_line || []).join(''));
  if (f.prefix && !plate.startsWith(f.prefix)) return false;
  if (f.suffix && !plate.endsWith(f.suffix)) return false;
  const digits = plate.replace(/\D/g, '');
  if (f.digits != null && digits.length !== f.digits) return false;
  if (f.pattern === 'repeated' && (digits.length < 2 || !/^(\d)\1+$/.test(digits))) return false;
  if (f.pattern === 'palindrome' && (digits.length < 2 || digits !== [...digits].reverse().join(''))) return false;
  if (f.min_amount != null || f.max_amount != null) {
    if (row.amount_hkd == null || !Number.isFinite(Number(row.amount_hkd)) || Number(row.amount_hkd) <= 0) return false;
    if (f.min_amount != null && Number(row.amount_hkd) < f.min_amount) return false;
    if (f.max_amount != null && Number(row.amount_hkd) > f.max_amount) return false;
  }
  // A coarse year range cannot satisfy an exact-day filter.
  if (f.from || f.to) {
    if (row.date_precision === 'year_range' || row.year_range || !/^\d{4}-\d{2}-\d{2}$/.test(row.auction_date || '')) return false;
    if (f.from && row.auction_date < f.from) return false;
    if (f.to && row.auction_date > f.to) return false;
  }
  return true;
}
const escapeIcs = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const utc = value => { const d = new Date(value); if (!Number.isFinite(d.getTime())) throw new Error('Invalid event date'); return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); };
export function calendarEvent(event, title, source, stamp = new Date()) {
  if (new Date(event.end_at) <= new Date(event.start_at)) throw new Error('Invalid event range');
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Plate.hk//Auction calendar//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${escapeIcs(event.id)}@plate.hk`,`DTSTAMP:${utc(stamp)}`,`DTSTART:${utc(event.start_at)}`,`DTEND:${utc(event.end_at)}`,`SUMMARY:${escapeIcs(title)}`,`DESCRIPTION:${escapeIcs('Check the official source before applying or bidding. This is a saved snapshot, not a live subscription. ' + source)}`,`URL:${escapeIcs(source)}`,'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:Check the official auction details','END:VALARM','END:VEVENT','END:VCALENDAR'];
  // Fold by UTF-8 byte count, as required by RFC 5545.
  return lines.map(line => { let out='', size=0; for (const c of line) { const n=new TextEncoder().encode(c).length; if(size+n>73){out+='\r\n ';size=1;} out+=c;size+=n;} return out; }).join('\r\n')+'\r\n';
}

export function comparableRows(target, rows, token, limit = 8) {
  const targetPlate=normalize(target.single_line || (target.double_line || []).join(''));
  const shape=p=>p.replace(/[A-Z]/g,'A').replace(/[0-9]/g,'9');
  const byPlate=new Map();
  for(const row of rows) {
    const plate=normalize(row.single_line || (row.double_line || []).join(''));
    if(plate===targetPlate || row.dataset_key!==target.dataset_key || shape(plate)!==shape(targetPlate))continue;
    if(row.amount_hkd==null || !Number.isFinite(Number(row.amount_hkd)) || Number(row.amount_hkd)<=0)continue;
    if(row.year_range || row.date_precision==='year_range' || !row.auction_date)continue;
    if(!plate.includes(token))continue;
    const previous=byPlate.get(plate);
    if(!previous || row.auction_date>previous.auction_date) byPlate.set(plate,{...row,match_text:token,comparison_reason:'same_dataset_shape_fragment'});
  }
  return [...byPlate.values()].sort((a,b)=>String(b.auction_date).localeCompare(String(a.auction_date)) || normalize(a.single_line).localeCompare(normalize(b.single_line))).slice(0,limit);
}

// A historical comparison cohort for two-letter traditional-pattern marks.
// This structural group is not an official legal classification. The number
// must match in full; HK/XX, repeated-letter prefixes, PVRM,
// coarse year ranges, unsold events and the queried mark stay separate.
export function traditionalPatternComparableCohort(query, rows, limit = 8, referenceDate = new Date().toISOString().slice(0, 10), offset = 0) {
  const target = normalize(query);
  const parsed = /^([A-Z]{2})(\d{1,4})$/.exec(target);
  if (!parsed || ['HK', 'XX'].includes(parsed[1])) return null;
  const [, prefix, number] = parsed;
  const repeatedPrefix = prefix[0] === prefix[1];
  const latestByPlate = new Map();
  for (const row of rows) {
    if (!['tvrm_physical', 'tvrm_eauction', 'tvrm_legacy'].includes(row.dataset_key)) continue;
    const plate = normalize(row.single_line || (row.double_line || []).join(''));
    const candidate = /^([A-Z]{2})(\d{1,4})$/.exec(plate);
    if (!candidate || plate === target || candidate[2] !== number) continue;
    if (['HK', 'XX'].includes(candidate[1]) || (candidate[1][0] === candidate[1][1]) !== repeatedPrefix) continue;
    if (row.year_range || row.date_precision === 'year_range' || !/^\d{4}-\d{2}-\d{2}$/.test(row.auction_date || '')) continue;
    if (row.result_status && row.result_status !== 'sold') continue;
    const amount = Number(row.amount_hkd);
    if (!Number.isFinite(amount) || amount <= 0 || !(row.pdf_url || row.source_url)) continue;
    const previous = latestByPlate.get(plate);
    if (!previous || row.auction_date > previous.auction_date) latestByPlate.set(plate, row);
  }
  const all = [...latestByPlate.values()].sort((a, b) => b.auction_date.localeCompare(a.auction_date));
  if (!all.length) return { rows: [], sample_size: 0, window: 'none', statistics: null };
  const cutoffDate = new Date(`${referenceDate}T00:00:00Z`);
  cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 3);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const recent = all.filter(row => row.auction_date >= cutoff);
  const selected = recent.length >= 5 ? recent : all;
  const prices = selected.map(row => Number(row.amount_hkd)).sort((a, b) => a - b);
  const percentile = fraction => {
    const position = fraction * (prices.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return Math.round(prices[lower] + (prices[upper] - prices[lower]) * (position - lower));
  };
  return {
    rows: selected.slice(offset, offset + limit).map(row => ({ ...row, match_text: number, comparison_reason: 'same_number_prefix_tier' })),
    sample_size: selected.length,
    window: recent.length >= 5 ? 'recent_three_years' : 'all_exact_dates',
    date_from: selected.at(-1).auction_date,
    date_to: selected[0].auction_date,
    statistics: selected.length >= 5 ? { p25: percentile(0.25), median: percentile(0.5), p75: percentile(0.75) } : null,
  };
}
