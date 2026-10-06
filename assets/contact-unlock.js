(() => {
  const params = new URLSearchParams(location.search);
  const english = params.get("lang") === "en";
  const lang = english ? "en" : "zh";
  const t = english ? {
    eyebrow: "Contact the seller", title: "Get the seller’s WhatsApp", description: "Unlock the WhatsApp number on this listing and speak to the seller directly.",
    back: "Back to search", priceLabel: "WhatsApp contact unlock", oneTime: "One-time payment · No account needed · Not the plate price",
    pay: "Continue to payment — HK$99", paymentNote: "Secure checkout by Stripe. Pay by card, or Apple Pay / Google Pay where available.",
    sourceIntro: "You can also go directly to the source:", source: "View this 28car listing for free",
    detailsLabel: "What to know before paying", disclosure: "HK$99 buys convenient access to one listing’s contact. It is not a subscription or a plate deposit. The original listing is free to view. A seller reply, ownership and transfer eligibility are not guaranteed.",
    recovery: "Reopen your contact in the browser you used to pay. If you change devices or clear browser data, keep your Stripe receipt so we can help recover your purchase.",
    help: "Need help with payment or this contact?", helpNote: "If the number is incorrect or you paid but could not get it, keep your Stripe receipt and contact us for verification and a refund.",
    terms: "Terms", privacy: "Privacy", footerNote: "Contact access provided by Plate.hk",
    checking: "Checking the advertised contact…", ready: "The listing advertises a WhatsApp contact. You’ll see the number after payment.",
    asking: "Seller’s asking price: ", priceRequest: "Price on enquiry", observed: "Last seen on 28car: ",
    opening: "Opening secure checkout…", cancelled: "Checkout cancelled. Continue whenever you’re ready.",
    unavailableTitle: "Contact temporarily unavailable", unavailable: "We can’t offer this unlock right now. You can still check the original listing for free.",
    checkoutFailed: "We couldn’t open checkout. Please try again. If you have already paid, use your receipt to get help below.",
    cookies: "To reopen your purchase, this browser needs to allow site storage. Update your browser settings and reload before paying.",
    verifyingTitle: "Checking your payment", verifyingDescription: "We’re checking the payment before showing your contact. You don’t need to pay again.", verifying: "Checking payment with Stripe…",
    pending: "Payment isn’t confirmed yet. We’ll check again shortly; you can also retry below.",
    pendingStopped: "Payment still isn’t confirmed. Check again below, or get help with your receipt. You don’t need to pay again.",
    failed: "We couldn’t confirm this purchase yet. Check again, or get help below with your Stripe receipt. Please don’t pay again.",
    originalBrowser: "Open this page in the browser you used to pay. If that isn’t possible, get help below with your Stripe receipt.",
    retry: "Check again", paidTitle: "Your seller contact is ready", paidDescription: "Open a WhatsApp draft to ask about the plate, or copy the number to save it.", paid: "Payment confirmed · Contact unlocked",
    phoneLabel: "Seller’s WhatsApp number", whatsapp: "Contact seller on WhatsApp", copy: "Copy number", copied: "Number copied", copyFallback: "The number is selected. Use your device’s Copy action.",
    reopenNote: "You can reopen this contact in this browser. Copy the number if you’d like to keep it elsewhere.", paidDetails: "About this contact",
    draft: (plate) => `Hi, I’m interested in plate ${plate}. Is it still available?`,
  } : {
    eyebrow: "聯絡賣家", title: "取得賣家的 WhatsApp", description: "一次付款，取得這則刊登的 WhatsApp 號碼，直接與賣家傾談。",
    back: "返回搜尋", priceLabel: "WhatsApp 聯絡資料", oneTime: "一次付款 · 不用登記 · 並非車牌售價",
    pay: "繼續付款 — HK$99", paymentNote: "由 Stripe 安全處理付款。支援信用卡，以及適用裝置上的 Apple Pay 或 Google Pay。",
    sourceIntro: "你亦可直接到來源網站：", source: "免費查看 28car 原刊登",
    detailsLabel: "付款前須知", disclosure: "HK$99 是取得一則刊登聯絡資料的便利服務費，並非訂閱或車牌訂金。原刊登可免費查看；賣家是否回覆、車牌擁有權及能否轉名，均須另行確認。",
    recovery: "你可在付款時使用的瀏覽器再次查看聯絡資料。換裝置或清除瀏覽器資料後，請保留 Stripe 收據以便我們協助核對。",
    help: "付款或聯絡資料有問題？聯絡我們", helpNote: "如號碼有誤或付款後未能取得資料，請保留 Stripe 收據，聯絡我們核對及安排退款。",
    terms: "使用條款", privacy: "私隱政策", footerNote: "由 Plate.hk 提供聯絡資料服務",
    checking: "正在檢查刊登的聯絡資料…", ready: "刊登列明可透過 WhatsApp 聯絡。付款後即可查看號碼。",
    asking: "賣家叫價：", priceRequest: "價格另議", observed: "最近在 28car 見到：",
    opening: "正在開啟安全付款頁…", cancelled: "已取消這次付款流程。準備好後可再繼續。",
    unavailableTitle: "暫時未能提供聯絡資料", unavailable: "現在未能提供解鎖服務，你仍可免費查看原刊登。",
    checkoutFailed: "暫時未能開啟付款頁，請再試一次。如你已付款，請保留收據並透過下方連結聯絡我們。",
    cookies: "為方便你再次查看已購聯絡資料，瀏覽器需要允許儲存網站資料。請調整瀏覽器設定，重新載入後再付款。",
    verifyingTitle: "正在核對付款", verifyingDescription: "核對付款後就會顯示聯絡資料，你不用再次付款。", verifying: "正在向 Stripe 核對付款…",
    pending: "付款尚未確認，我們會稍後再檢查。你亦可按下方按鈕重試。",
    pendingStopped: "付款仍未確認。請按下方按鈕重新檢查，或保留收據並聯絡我們協助核對。你不用再次付款。",
    failed: "暫時未能確認這次付款。請重新檢查，或保留 Stripe 收據並透過下方連結聯絡我們。請勿再次付款。",
    originalBrowser: "請在付款時使用的瀏覽器開啟此頁。如無法使用該瀏覽器，請保留 Stripe 收據並透過下方連結聯絡我們。",
    retry: "重新檢查", paidTitle: "賣家聯絡資料已準備好", paidDescription: "開啟 WhatsApp 草稿查詢車牌，或複製號碼自行保存。", paid: "付款已確認 · 聯絡資料已解鎖",
    phoneLabel: "賣家 WhatsApp 號碼", whatsapp: "在 WhatsApp 聯絡賣家", copy: "複製號碼", copied: "已複製號碼", copyFallback: "已選取號碼，請使用裝置的「複製」功能。",
    reopenNote: "你可在這個瀏覽器再次查看，也可複製號碼自行保存。", paidDetails: "關於這則聯絡資料",
    draft: (plate) => `你好，我對車牌 ${plate} 有興趣。請問現在仍有放售嗎？`,
  };
  const el = (id) => document.getElementById(id);
  const keys = { eyebrow:"eyebrow", title:"title", description:"description", back:"back", "price-label":"priceLabel", "one-time":"oneTime", pay:"pay", "payment-note":"paymentNote", "source-intro":"sourceIntro", source:"source", "details-label":"detailsLabel", disclosure:"disclosure", recovery:"recovery", help:"help", "help-note":"helpNote", terms:"terms", privacy:"privacy", "footer-note":"footerNote", retry:"retry", "phone-label":"phoneLabel", whatsapp:"whatsapp", copy:"copy", "reopen-note":"reopenNote" };
  Object.entries(keys).forEach(([id,key]) => { el(id).textContent = t[key]; });
  document.documentElement.lang = english ? "en" : "zh-HK";
  document.title = `${t.eyebrow} | Plate.hk`;
  document.querySelector("nav").setAttribute("aria-label", english ? "Navigation" : "導覽");
  ["terms","privacy"].forEach((id) => { el(id).href += english ? "?lang=en" : ""; });
  let plate = params.get("plate") || "";
  let listing = params.get("listing_id") || "";
  let session = params.get("session_id");
  let phone = "";
  let checking = false;
  let pendingChecks = 0;
  let pendingTimer;
  const storageKey = () => `platehk-contact-purchase:${plate}:${listing}`;
  if (!session) { try { session = localStorage.getItem(storageKey()); } catch {} }
  const card = document.querySelector(".contact-card");
  const status = el("status");
  function showState(state) {
    card.dataset.state = state;
    ["pay","retry","whatsapp","copy","payment-note","reopen-note","number-panel"].forEach(id => { el(id).hidden = true; });
    el("pay").disabled = false;
    el("purchase").hidden = Boolean(session);
  }
  function setListing(data) {
    if (/^[A-Z0-9]{1,16}$/.test(data.plate || "")) {
      plate = data.plate;
      el("plate").textContent = plate;
      el("plate").hidden = false;
      el("back").href = `/?q=${encodeURIComponent(plate)}&lang=${lang}`;
    }
    if (/^n\d+$/.test(data.listing_id || "")) listing = data.listing_id;
    if (Object.hasOwn(data,"asking_price_hkd")) {
      el("asking").textContent = t.asking + (Number.isSafeInteger(data.asking_price_hkd) && data.asking_price_hkd > 0 ? `HK$${data.asking_price_hkd.toLocaleString("en-HK")}` : t.priceRequest);
      el("asking").hidden = false;
    }
    const observed = new Date(data.observed_at || "");
    if (Number.isFinite(observed.getTime())) {
      el("observed").textContent = t.observed + new Intl.DateTimeFormat(english ? "en-HK" : "zh-HK",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Hong_Kong"}).format(observed);
      el("observed").hidden = false;
    }
    try {
      const source = new URL(data.source_url);
      if (source.protocol === "https:" && source.hostname === "m.28car.com" && source.pathname === "/num_dsp.php") {
        el("source").href = source.toString();
        el("source-row").hidden = false;
      }
    } catch {}
  }
  async function request(route, body) {
    const response = await fetch(`/api/contact/${route}`,{
      method:"POST",cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(20000),
      headers:{"content-type":"application/json"},body:JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "unavailable");
    return data;
  }
  async function reveal(automatic = false) {
    if (checking) return;
    clearTimeout(pendingTimer);
    checking = true;
    if (automatic !== true) {
      pendingChecks = 0;
      showState("checking-payment");
      el("title").textContent = t.verifyingTitle;
      el("description").textContent = t.verifyingDescription;
      status.textContent = t.verifying;
    }
    try {
      const contact = await request("reveal",{session_id:session});
      if (!/^852[456789]\d{7}$/.test(contact.whatsapp_number || "")) throw new Error("invalid_contact");
      setListing(contact);
      phone = contact.whatsapp_number;
      showState("paid");
      el("title").textContent = t.paidTitle;
      el("description").textContent = t.paidDescription;
      status.textContent = t.paid;
      el("phone").value = `+852 ${phone.slice(3,7)} ${phone.slice(7)}`;
      el("number-panel").hidden = false;
      el("whatsapp").href = `https://wa.me/${phone}?text=${encodeURIComponent(t.draft(plate))}`;
      ["whatsapp","copy","reopen-note"].forEach(id => { el(id).hidden = false; });
      el("details-label").textContent = t.paidDetails;
      let remembered = false;
      try {
        localStorage.setItem(storageKey(),session);
        remembered = localStorage.getItem(storageKey()) === session;
      } catch {}
      // Keep the return URL usable when site storage is blocked; the server still requires the buyer cookie.
      try { if (remembered) history.replaceState(null,"",`/contact.html?plate=${encodeURIComponent(plate)}&listing_id=${encodeURIComponent(listing)}&lang=${lang}`); } catch {}
    } catch (error) {
      showState(error.message === "payment_pending" ? "pending" : "error");
      el("retry").hidden = false;
      status.textContent = error.message === "payment_pending" ? t.pending : error.message === "original_browser_required" ? t.originalBrowser : t.failed;
      if (error.message === "payment_pending") {
        pendingChecks++;
        if (pendingChecks < 3 && document.visibilityState === "visible") pendingTimer = setTimeout(() => reveal(true),3000);
        else status.textContent = t.pendingStopped;
      }
    } finally { checking = false; }
  }
  el("retry").addEventListener("click",() => reveal());
  el("copy").addEventListener("click",async () => {
    try {
      await navigator.clipboard.writeText(`+${phone}`);
      el("copy-status").textContent = t.copied;
    } catch {
      el("phone").focus(); el("phone").select();
      el("copy-status").textContent = t.copyFallback;
    }
  });
  el("pay").addEventListener("click",async () => {
    el("pay").disabled = true;
    el("pay").textContent = t.opening;
    status.textContent = t.opening;
    try {
      const data = await request("checkout",{plate,listing_id:listing,lang});
      const url = new URL(data.checkout_url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("invalid_checkout");
      location.assign(url.toString());
    } catch (error) {
      status.textContent = error.message === "cookies_required" ? t.cookies : t.checkoutFailed;
      el("pay").textContent = t.pay;
      el("pay").disabled = false;
    }
  });
  setListing({plate,listing_id:listing});
  if (session) { reveal(); return; }
  showState("checking");
  status.textContent = t.checking;
  request("availability",{plate,listing_id:listing}).then(data => {
    setListing(data);
    showState("ready");
    status.textContent = params.get("cancelled") === "1" ? t.cancelled : t.ready;
    el("pay").hidden = false;
    el("payment-note").hidden = false;
  }).catch(() => {
    showState("unavailable");
    el("purchase").hidden = true;
    el("title").textContent = t.unavailableTitle;
    el("description").textContent = t.unavailable;
    status.textContent = "";
    fetch(`/api/market_signal?plate=${encodeURIComponent(plate)}`,{cache:"no-store"})
      .then(response => response.json()).then(signal => { if (signal.listing_id === listing) setListing(signal); }).catch(() => {});
  });
})();
