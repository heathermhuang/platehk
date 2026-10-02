/* Homepage composition: existing search/data logic remains the source of state. */
(() => {
  const controls = document.querySelector('.controls');
  const match = document.querySelector('#matchMode')?.closest('label');
  const filters = document.querySelector('.record-filters');
  const actions = document.querySelector('.control-actions');
  if (controls && match && filters && actions) {
    controls.insertBefore(match, filters);
    controls.append(actions);
  }
  const filterScope = document.querySelector('#filterScope');
  const filterDescription = () => {
    if (!filterScope) return;
    const english = document.documentElement.lang === 'en';
    const labels = {
      date_desc: english ? 'Newest first' : '最新日期',
      amount_desc: english ? 'Highest amount' : '金額高→低',
      amount_asc: english ? 'Lowest amount' : '金額低→高',
      plate_asc: english ? 'Plate A–Z' : '車牌 A–Z',
    };
    const dataset = document.querySelector('#dataset')?.selectedOptions[0]?.textContent;
    const issue = document.querySelector('#issue')?.value ? (english ? 'Selected round' : '已選期數') : '';
    const sort = labels[document.querySelector('#sort')?.value];
    filterScope.textContent = [dataset, issue, sort].filter(Boolean).join(' · ');
  };
  const small = matchMedia('(max-width: 760px)');
  if (filters && actions && controls) {
    const filterLayout = () => {
      filters.open = !small.matches;
      if (small.matches) controls.insertBefore(actions, filters);
      else controls.append(actions);
    };
    filterLayout();
    small.addEventListener('change', filterLayout);
  }
  for (const select of document.querySelectorAll('.controls select')) {
    const title = () => {
      select.title = select.selectedOptions[0]?.textContent || '';
      filterDescription();
    };
    select.addEventListener('change', title);
    new MutationObserver(title).observe(select, { childList: true, subtree: true });
    title();
  }

  function navigation() {
    const english = document.documentElement.lang === 'en';
    const nav = document.querySelector('.ux-task-nav');
    const more = nav?.querySelector('.site-more');
    const menu = more?.querySelector('div');
    if (!nav || !more || !menu) return;
    nav.setAttribute('aria-label', english ? 'Primary navigation' : '主要導覽');
    document.querySelector('.record-pane')?.setAttribute('aria-label', english ? 'Auction records' : '拍賣紀錄');
    document.querySelector('#resultsTableWrap')?.setAttribute('aria-label', english ? 'Plate auction records' : '車牌拍賣紀錄');
    const href = (path) => {
      const url = new URL(path, location.origin);
      if (!url.pathname.startsWith('/auction-results/')) url.searchParams.set('lang', english ? 'en' : 'zh');
      return url.pathname + url.search;
    };
    const anchor = (zh, en, path) => {
      const el = document.createElement('a');
      el.textContent = english ? en : zh;
      el.href = href(path);
      return el;
    };
    menu.replaceChildren(
      anchor('查歷史成交價', 'Historical prices', '/prices.html'),
      anchor('按預算找車牌', 'Discover by budget', '/discover.html'),
      anchor('官方可用號碼及申請', 'Official availability and applications', '/availability.html'),
      anchor('熱門車牌', 'Popular plates', '/plates/index.html'),
      anchor('相機搜尋', 'Camera search', '/camera.html'),
      anchor('資料說明', 'Data guide', '/about.html'),
      anchor('資料審核', 'Data audit', '/audit.html'),
      anchor('開發者', 'Developers', '/api.html'),
    );
    more.querySelector('summary').textContent = english ? 'More' : '更多';
    const records = anchor('拍賣紀錄', 'Records', '/');
    records.setAttribute('aria-current', 'page');
    nav.replaceChildren(
      records,
      anchor('最新拍賣結果', 'Latest auction results', `/auction-results/${english ? 'en/' : ''}index.html`),
      anchor('日程', 'Auctions', '/auctions.html'),
      anchor('收藏', 'Shortlist', '/shortlist.html'),
      more,
    );
    const legacy = document.querySelector('.search-task-links');
    if (legacy) legacy.hidden = true;
    filterDescription();
    sortHeaders();
  }
  navigation();
  for (const button of document.querySelectorAll('#langZh, #langEn')) {
    button.addEventListener('click', () => setTimeout(navigation, 0));
  }
  document.addEventListener('pointerdown', (event) => {
    const menu = document.querySelector('.site-more[open]');
    if (menu && !menu.contains(event.target)) menu.open = false;
  });

  function sortHeaders() {
    const sort = document.querySelector('#sort');
    if (!sort) return;
    const focused = document.activeElement?.closest('th')?.id;
    for (const [id, column, value] of [['thSingle', 'plate', 'plate_asc'], ['thPrice', 'amount', 'amount_desc'], ['thDate', 'date', 'date_desc']]) {
      const th = document.getElementById(id);
      if (!th) continue;
      const label = th.querySelector('button')?.dataset.label || th.textContent.trim();
      const selected = sort.value.startsWith(column + '_');
      const ascending = sort.value.endsWith('_asc');
      th.setAttribute('aria-sort', selected ? (ascending ? 'ascending' : 'descending') : 'none');
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.label = label;
      button.className = 'record-sort'; button.textContent = label;
      if (selected) {
        const direction = document.createElement('span');
        direction.setAttribute('aria-hidden', 'true'); direction.textContent = ascending ? '↑' : '↓';
        button.append(direction);
      }
      button.addEventListener('click', () => {
        sort.value = column === 'amount' && sort.value === 'amount_desc' ? 'amount_asc' : value;
        sort.dispatchEvent(new Event('change', { bubbles: true }));
      });
      th.replaceChildren(button);
      if (focused === id) button.focus({ preventScroll: true });
    }
  }
  document.querySelector('#sort')?.addEventListener('change', sortHeaders);
  new MutationObserver(sortHeaders).observe(document.querySelector('#sort'), { childList: true });
  new MutationObserver(navigation).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  const pagination = document.querySelector('.footer-nav');
  if (pagination) {
    const labels = () => {
      for (const [id, arrow] of [['bottomPrev', '←'], ['bottomNext', '→']]) {
        const button = document.getElementById(id);
        if (button && button.textContent !== arrow) {
          button.title = button.textContent;
          button.setAttribute('aria-label', button.textContent);
          button.textContent = arrow;
        }
      }
    };
    labels();
    new MutationObserver(labels).observe(pagination, { childList: true, subtree: true, characterData: true });
  }

})();
