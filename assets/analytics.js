(() => {
  if (window.PlateAnalytics) return;
  const allowed = new Set(['search_complete','search_error','plate_detail','shortlist_save','shortlist_remove','compare_view','official_link','calendar_save','discovery_search']);
  const production = ['plate.hk','www.plate.hk'].includes(location.hostname);
  const dnt = navigator.doNotTrack === '1' || navigator.msDoNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  let enabled = production && !dnt;
  try { if (localStorage.getItem('platehk.analytics') === 'off') enabled = false; } catch {}
  const cleanLocation = location.origin + location.pathname;
  function track(name, values = {}) {
    if (!enabled || !allowed.has(name)) return;
    const data = {page_location:cleanLocation};
    for (const key of ['result_count','duration_ms','exact_match','page_number']) {
      if (typeof values[key] === 'boolean') data[key] = values[key];
      else if (Number.isFinite(values[key])) data[key] = Math.max(0, Math.min(1e9, Math.round(values[key])));
    }
    for (const key of ['dataset','action','source_domain','error_kind']) {
      if (/^[a-zA-Z0-9_.-]{1,60}$/.test(String(values[key] || ''))) data[key] = values[key];
    }
    if (/^[A-HJ-NPR-Z0-9]{1,16}$/.test(values.plate || '')) data.plate = values.plate;
    window.gtag('event',name,data);
  }
  window.PlateAnalytics = {track};
  if (!enabled) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){window.dataLayer.push(arguments);};
  let referrer='';
  try {const u=new URL(document.referrer);referrer=u.origin+u.pathname;} catch {}
  window.gtag('js', new Date());
  window.gtag('config','G-8N8TVEGQHM',{send_page_view:false,page_location:cleanLocation,page_referrer:referrer,allow_google_signals:false,allow_ad_personalization_signals:false});
  window.gtag('event','page_view',{page_location:cleanLocation,page_referrer:referrer});
  const script=document.createElement('script');
  script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id=G-8N8TVEGQHM';
  document.head.appendChild(script);
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');if(!link)return;
    try {const u=new URL(link.href); if (['www.td.gov.hk','www.gov.hk','www.1823.gov.hk','e-auction.td.gov.hk'].includes(u.hostname)) track('official_link',{source_domain:u.hostname});}catch{}
  });
})();
