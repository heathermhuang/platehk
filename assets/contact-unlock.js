(() => {
  const params = new URLSearchParams(location.search);
  const english = params.get("lang") === "en";
  document.documentElement.lang = english ? "en" : "zh-HK";
  const t = english ? {
    title: "Unlock seller WhatsApp", description: "Pay HK$99 to reveal the seller WhatsApp number for this listing.",
    disclosure: "You are paying for convenient access to contact information. The source listing is free to view on 28car. Payment does not guarantee a seller reply, ownership, sale or transfer.",
    pay: "Pay HK$99 and unlock", ready: "One payment unlocks this listing’s advertised WhatsApp contact. Keep this browser’s cookies to reopen your purchase.",
    checking: "Checking contact availability…", verifying: "Verifying your payment…", paid: "Payment confirmed. Seller WhatsApp: ",
    unavailable: "This contact cannot be unlocked right now. You have not been charged by this page. You can view the source listing for free.",
    failed: "We could not verify this purchase. Retry in the browser you used to pay. If payment completed, keep your Stripe receipt and contact Plate.hk through the feedback link on the home page; do not pay again.",
    pending: "Payment is not confirmed yet. You can check again without paying again.",
    cookies: "Allow cookies and reload before paying. Your purchase is linked to this browser.",
    whatsapp: "Open seller WhatsApp", retry: "Check payment again", source: "View free 28car listing", terms: "Terms", privacy: "Privacy",
  } : {
    title: "解鎖賣方 WhatsApp", description: "付款 HK$99，解鎖此刊登的賣方 WhatsApp 號碼。",
    disclosure: "這是取得聯絡資料的便利服務；28car 原刊登可免費查看。付款不保證賣方回覆、擁有權、成交或轉名。",
    pay: "付款 HK$99 並解鎖", ready: "一次付款解鎖此刊登列明的 WhatsApp 號碼。請保留這個瀏覽器的 Cookie，以便再次查看。",
    checking: "正在檢查聯絡資料…", verifying: "正在核對付款…", paid: "付款已確認。賣方 WhatsApp：",
    unavailable: "暫時未能解鎖此聯絡資料。此頁未向你收費，你可免費查看原刊登。",
    failed: "未能核對這次付款。請在付款時使用的瀏覽器重試。如已付款，請保留 Stripe 收據並透過首頁的反饋連結聯絡 Plate.hk，請勿再次付款。",
    pending: "付款尚未確認。你可重新檢查，毋須再次付款。", cookies: "付款前請允許 Cookie 並重新載入。這次解鎖會連結至此瀏覽器。",
    whatsapp: "開啟賣方 WhatsApp", retry: "重新檢查付款", source: "免費查看 28car 原刊登", terms: "使用條款", privacy: "私隱政策",
  };
  const byId = (id) => document.getElementById(id);
  ["title", "description", "disclosure", "pay", "retry", "whatsapp", "source", "terms", "privacy"].forEach((id) => { byId(id).textContent = t[id]; });
  ["terms", "privacy"].forEach((id) => { byId(id).href += english ? "?lang=en" : ""; });
  const status = byId("status");
  const plate = params.get("plate") || "";
  const listing = params.get("listing_id") || "";
  const storageKey = `platehk-contact-purchase:${plate}:${listing}`;
  let session = params.get("session_id");
  if (!session) { try { session = localStorage.getItem(storageKey); } catch {} }
  async function request(route, body) {
    const response = await fetch(`/api/contact/${route}`, {
      method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "unavailable");
    return data;
  }
  async function reveal() {
    byId("retry").hidden = true;
    status.textContent = t.verifying;
    try {
      const contact = await request("reveal", { session_id: session });
      if (!/^852[456789]\d{7}$/.test(contact.whatsapp_number)) throw new Error("invalid_contact");
      byId("plate").textContent = contact.plate;
      byId("plate").hidden = false;
      byId("price").hidden = true;
      byId("description").hidden = true;
      status.textContent = t.paid + "+" + contact.whatsapp_number;
      byId("whatsapp").href = `https://wa.me/${contact.whatsapp_number}`;
      byId("whatsapp").hidden = false;
      try { localStorage.setItem(`platehk-contact-purchase:${contact.plate}:${contact.listing_id}`, session); } catch {}
      // Remove the session ID from the address bar after successful verification.
      history.replaceState(null, "", `/contact.html?plate=${encodeURIComponent(contact.plate)}&listing_id=${encodeURIComponent(contact.listing_id)}&lang=${english ? "en" : "zh"}`);
    } catch (error) {
      status.textContent = error.message === "payment_pending" ? t.pending : t.failed;
      byId("retry").hidden = false;
    }
  }
  byId("retry").addEventListener("click", reveal);
  byId("pay").addEventListener("click", async () => {
    byId("pay").disabled = true;
    status.textContent = t.verifying;
    try {
      const data = await request("checkout", { plate, listing_id: listing, lang: english ? "en" : "zh" });
      const url = new URL(data.checkout_url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("invalid_checkout");
      location.assign(url.toString());
    } catch (error) {
      status.textContent = error.message === "cookies_required" ? t.cookies : t.unavailable;
      byId("pay").disabled = false;
    }
  });
  if (session) { reveal(); return; }
  status.textContent = t.checking;
  fetch(`/api/market_signal?plate=${encodeURIComponent(plate)}`, { cache: "no-store" })
    .then((response) => response.json())
    .then((signal) => {
      if (signal.listing_id !== listing) return;
      const source = new URL(signal.source_url);
      if (source.protocol === "https:" && source.hostname === "m.28car.com") { byId("source").href = source.toString(); byId("source").hidden = false; }
    }).catch(() => {});
  request("availability", { plate, listing_id: listing })
    .then((data) => {
      byId("plate").textContent = data.plate;
      byId("plate").hidden = false;
      status.textContent = t.ready;
      byId("pay").hidden = false;
    }).catch(() => { status.textContent = t.unavailable; });
})();
