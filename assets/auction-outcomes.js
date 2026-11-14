// Shared by search, camera, decision cards, shortlist and share text.
(() => {
  const labels = Object.freeze({
    sold: ['拍賣售出', 'Auction sale'],
    assigned_special_fee: ['特別費用分配（無人競投）', 'Special-fee allocation (no bidder)'],
    unsold: ['未售出（U/S）', 'Unsold (U/S)'],
    unknown: ['結果未核實', 'Outcome unverified'],
  });
  const status = row => {
    const value = row?.result_status === 'special_fee' ? 'assigned_special_fee' : row?.result_status;
    return Object.hasOwn(labels, value) ? value : 'unknown';
  };
  const label = (row, lang = 'zh') => labels[status(row)][lang === 'en' ? 1 : 0];
  const amount = row => status(row) === 'unsold' || row?.amount_hkd == null
    ? '—' : `HK$${Number(row.amount_hkd).toLocaleString('en-HK')}`;
  const format = (row, lang = 'zh') => `${amount(row)} · ${label(row, lang)}`;
  globalThis.PlateAuctionOutcomes = Object.freeze({ status, label, amount, format });
})();
