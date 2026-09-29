(() => {
  const english = () => document.documentElement.lang === 'en';
  const text = (zh, en) => english() ? en : zh;
  const highlights = document.querySelector('#verifiedAuctionHighlights');
  const query = document.querySelector('#q');
  const issue = document.querySelector('#issue');
  const syncHighlights = () => {
    if (highlights) highlights.hidden = Boolean(query?.value.trim() || issue?.value || new URLSearchParams(location.search).get('q'));
  };
  for (const control of [query, issue]) control?.addEventListener('input', syncHighlights);
  document.querySelector('#reset')?.addEventListener('click', () => requestAnimationFrame(syncHighlights));
  addEventListener('popstate', syncHighlights);
  syncHighlights();

  const dataset = document.body.dataset.auctionDataset;
  if (dataset) window.PlateAnalytics?.track('auction_result_view', {dataset, issue:document.body.dataset.auctionStart});
  document.addEventListener('click', async event => {
    if (event.target.closest('a[data-results-feed]')) {
      window.PlateAnalytics?.track('results_feed_open', {action:english() ? 'en' : 'zh'});
    }
    const button = event.target.closest('[data-feed-copy]');
    if (!button) return;
    const status = document.querySelector('#resultsFeedStatus');
    try {
      await navigator.clipboard.writeText(button.dataset.feedCopy);
      if (status) status.textContent = text('連結已複製。請加入你的 RSS／Atom 閱讀器完成訂閱。', 'Link copied. Add it to your RSS or Atom reader to subscribe.');
      window.PlateAnalytics?.track('results_feed_copy', {action:english() ? 'en' : 'zh'});
    } catch {
      const input = document.querySelector('#resultsFeedUrl');
      input?.focus(); input?.select();
      if (status) status.textContent = text('請複製已選取的連結，再加入你的閱讀器。', 'Copy the selected link, then add it to your reader.');
    }
  });
})();
