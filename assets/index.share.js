window.createPlateIndexShareModal = function createPlateIndexShareModal({
  t,
  normalizePlate,
  formatAuctionDate,
  formatPriceText,
  getCurrentLang,
  getCurrentDataset,
  shareModalEl,
  shareCloseEl,
  shareTitleEl,
  sharePreviewEl,
  shareDownloadEl,
  shareSiteUrl,
}) {
  let currentPosterDataUrl = "";
  const POSTER = Object.freeze({
    page: "#f4f1e8",
    surface: "#fffaf0",
    surfaceMuted: "#e9e3d5",
    surfaceSoft: "#f8f4ea",
    ink: "#1d1b17",
    muted: "#5f594d",
    line: "#c9c0ad",
    lineStrong: "#373127",
    accent: "#3a5d4b",
    accentSoft: "#f7df78",
    plate: "#f0c94d",
    plateInk: "#171612",
  });
  const POSTER_UI_FONT = "'Space Grotesk', 'Noto Sans HK', 'Avenir Next', Helvetica, Arial, sans-serif";
  const POSTER_MONO_FONT = "'SFMono-Regular', 'Roboto Mono', Consolas, 'Liberation Mono', monospace";

  function posterCategoryLabelBilingual(row) {
    const key = row && row.dataset_key ? row.dataset_key : getCurrentDataset();
    if (key === "pvrm") return "自訂車牌 Personalized";
    if (key === "tvrm_physical") return "實體拍賣 Physical";
    if (key === "tvrm_eauction") return "拍牌易 E-Auction";
    if (key === "tvrm_legacy") return "1973-2006 年歷史分段 Historical";
    return "全部車牌 All Plates";
  }

  function posterPlateText(row) {
    const single = String(row.single_line || "").trim();
    if (single) return single;
    const dbl = Array.isArray(row.double_line) ? row.double_line : String(row.double_line || "").split(/\n+/);
    return dbl.map((x) => String(x || "").trim()).filter(Boolean).join(" ");
  }

  function posterDoubleLines(row) {
    const dbl = Array.isArray(row.double_line) ? row.double_line : String(row.double_line || "").split(/\n+/);
    return dbl.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 2);
  }

  function wrapText(ctx, text, maxWidth) {
    const out = [];
    let line = "";
    for (const ch of String(text || "")) {
      const candidate = line + ch;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        out.push(line);
        line = ch;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
    return out;
  }

  function ellipsizeToWidth(ctx, text, maxWidth) {
    const value = String(text || "");
    if (!value) return "";
    if (ctx.measureText(value).width <= maxWidth) return value;
    let out = value;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
      out = out.slice(0, -1);
    }
    return `${out}…`;
  }

  function fitPosterText(
    ctx,
    text,
    maxWidth,
    {
      maxFont = 32,
      minFont = 16,
      maxLines = 2,
      family = POSTER_UI_FONT,
      weight = 700,
    } = {}
  ) {
    const raw = String(text || "").trim();
    if (!raw) {
      return { fontSize: maxFont, lines: [""] };
    }
    for (let size = maxFont; size >= minFont; size -= 1) {
      ctx.font = `${weight} ${size}px ${family}`;
      const lines = wrapText(ctx, raw, maxWidth);
      if (lines.length <= maxLines) {
        return { fontSize: size, lines };
      }
    }
    ctx.font = `${weight} ${minFont}px ${family}`;
    const lines = wrapText(ctx, raw, maxWidth).slice(0, maxLines);
    if (!lines.length) return { fontSize: minFont, lines: [""] };
    lines[lines.length - 1] = ellipsizeToWidth(ctx, lines[lines.length - 1], maxWidth);
    return { fontSize: minFont, lines };
  }

  function fitPosterSingleLine(
    ctx,
    text,
    maxWidth,
    {
      maxFont = 32,
      minFont = 16,
      family = POSTER_UI_FONT,
      weight = 700,
    } = {}
  ) {
    const raw = String(text || "").trim();
    if (!raw) return { fontSize: maxFont, text: "" };
    for (let size = maxFont; size >= minFont; size -= 1) {
      ctx.font = `${weight} ${size}px ${family}`;
      if (ctx.measureText(raw).width <= maxWidth) {
        return { fontSize: size, text: raw };
      }
    }
    ctx.font = `${weight} ${minFont}px ${family}`;
    return { fontSize: minFont, text: ellipsizeToWidth(ctx, raw, maxWidth) };
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPlateLineFit(ctx, text, centerX, baselineY, maxWidth, maxFont, minFont, family, weight, scaleX = 1) {
    let size = maxFont;
    const content = String(text || "");
    while (size > minFont) {
      ctx.font = `${weight} ${size}px ${family}`;
      const w = ctx.measureText(content).width * scaleX;
      if (w <= maxWidth) break;
      size -= 1;
    }
    ctx.save();
    ctx.translate(centerX, 0);
    ctx.scale(scaleX, 1);
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillText(content, 0, baselineY);
    ctx.restore();
  }

  async function loadPosterLogo() {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("logo load failed"));
      img.src = "./assets/logo.svg?v=20260827-04";
    });
  }

  function loadPosterQr(url, size = 360) {
    if (typeof qrcode !== "function") {
      throw new Error("qr generator unavailable");
    }
    const qr = qrcode(0, "M");
    qr.addData(String(url || ""));
    qr.make();
    const moduleCount = qr.getModuleCount();
    const quietZone = 4;
    const totalModules = moduleCount + quietZone * 2;
    const cellSize = Math.max(1, Math.floor(size / totalModules));
    const actualSize = Math.max(size, cellSize * totalModules);
    const offset = Math.floor((actualSize - cellSize * totalModules) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = actualSize;
    canvas.height = actualSize;
    const qctx = canvas.getContext("2d");
    qctx.fillStyle = "#ffffff";
    qctx.fillRect(0, 0, actualSize, actualSize);
    qctx.fillStyle = POSTER.plateInk;
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        if (!qr.isDark(row, col)) continue;
        qctx.fillRect(
          offset + (col + quietZone) * cellSize,
          offset + (row + quietZone) * cellSize,
          cellSize,
          cellSize
        );
      }
    }
    return canvas;
  }

  function drawGlassPanel(
    ctx,
    x,
    y,
    w,
    h,
    r,
    { from = POSTER.surface, stroke = POSTER.lineStrong } = {}
  ) {
    ctx.save();
    const radius = Math.min(r, 8);
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = from;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.stroke();
    ctx.restore();
  }

  function drawPosterPill(
    ctx,
    x,
    y,
    text,
    { fill = POSTER.lineStrong, color = POSTER.surface, maxWidth = 320, fontSize = 22, minFontSize = 15 } = {}
  ) {
    ctx.save();
    const usableTextWidth = Math.max(44, maxWidth - 28);
    const fit = fitPosterText(ctx, text, usableTextWidth, {
      maxFont: fontSize,
      minFont: minFontSize,
      maxLines: 1,
    });
    ctx.font = `800 ${fit.fontSize}px ${POSTER_UI_FONT}`;
    const padX = 14;
    const h = 38;
    const label = fit.lines[0] || "";
    const w = Math.min(maxWidth, ctx.measureText(label).width + padX * 2);
    roundRectPath(ctx, x, y, w, h, 4);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + padX, y + h / 2);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
    return w;
  }

  function drawPosterMetaCard(
    ctx,
    x,
    y,
    w,
    h,
    label,
    value,
    { accent = POSTER.ink, valueSize = 32, minValueSize = 18 } = {}
  ) {
    drawGlassPanel(ctx, x, y, w, h, 4, { from: POSTER.surface, stroke: POSTER.lineStrong });
    ctx.save();
    ctx.fillStyle = POSTER.muted;
    ctx.font = `800 20px ${POSTER_UI_FONT}`;
    ctx.fillText(label, x + 24, y + 34);
    ctx.fillStyle = accent;
    const fit = fitPosterSingleLine(ctx, value, w - 48, {
      maxFont: valueSize,
      minFont: minValueSize,
    });
    ctx.font = `800 ${fit.fontSize}px ${POSTER_UI_FONT}`;
    ctx.fillText(fit.text, x + 24, y + 90);
    ctx.restore();
  }

  function drawPlateCard(ctx, x, y, w, h, title, lines) {
    const compact = h < 220;
    drawGlassPanel(ctx, x, y, w, h, 4, { from: POSTER.surface, stroke: POSTER.lineStrong });

    drawPosterPill(ctx, x + 14, y + (compact ? 12 : 18), title, {
      fill: POSTER.lineStrong,
      color: POSTER.surface,
      fontSize: compact ? 18 : 22,
      minFontSize: 13,
      maxWidth: compact ? 220 : 280,
    });

    const plateZoneX = x + 18;
    const plateZoneY = y + (compact ? 54 : 66);
    const plateZoneW = w - 36;
    const plateZoneH = h - (compact ? 68 : 84);
    const clean = (lines || []).map((v) => String(v || "").trim()).filter(Boolean);
    if (!clean.length) clean.push("(n/a)");
    const isDouble = clean.length > 1;
    const plateRatio = 2.75;
    let plateH = Math.min(plateZoneH - 12, plateZoneW / plateRatio);
    plateH = Math.max(104, plateH);
    let plateW = Math.min(plateZoneW - 8, plateH * plateRatio);
    if (plateW > plateZoneW - 8) {
      plateW = plateZoneW - 8;
      plateH = plateW / plateRatio;
    }
    if (plateH > plateZoneH - 10) {
      plateH = plateZoneH - 10;
      plateW = plateH * plateRatio;
    }
    const plateX = plateZoneX + (plateZoneW - plateW) / 2;
    const plateY = plateZoneY + (plateZoneH - plateH) / 2 + 8;
    ctx.fillStyle = POSTER.plate;
    ctx.strokeStyle = POSTER.plateInk;
    ctx.lineWidth = 5;
    roundRectPath(ctx, plateX, plateY, plateW, plateH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = POSTER.plateInk;
    ctx.textAlign = "center";
    const sharedMaxFont = isDouble ? Math.min(96, plateH * 0.34) : Math.min(160, plateH * 0.5);
    const sharedMinFont = 22;
    if (!isDouble) {
      drawPlateLineFit(
        ctx,
        clean[0].toUpperCase(),
        plateX + plateW / 2,
        plateY + plateH * 0.66,
        plateW - 42,
        sharedMaxFont,
        sharedMinFont,
        POSTER_MONO_FONT,
        700,
        1.06
      );
    } else {
      const line1 = clean[0].toUpperCase();
      const line2 = clean[1].toUpperCase();
      const centerX = plateX + plateW / 2;
      const maxTextW = plateW - 44;
      const topY = plateY + plateH * 0.42;
      const bottomY = plateY + plateH * 0.75;
      drawPlateLineFit(
        ctx,
        line1,
        centerX,
        topY,
        maxTextW,
        sharedMaxFont,
        sharedMinFont,
        POSTER_MONO_FONT,
        700,
        1.06
      );
      drawPlateLineFit(
        ctx,
        line2,
        centerX,
        bottomY,
        maxTextW,
        sharedMaxFont,
        sharedMinFont,
        POSTER_MONO_FONT,
        700,
        1.06
      );
    }
    ctx.textAlign = "start";
  }

  async function buildPosterDataUrl(row) {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");

    const shareUrl = (() => {
      try {
        const params = new URLSearchParams();
        params.set("lang", getCurrentLang() === "en" ? "en" : "zh");
        params.set("q", normalizePlate(posterPlateText(row)));
        return new URL(`/?${params.toString()}`, `${shareSiteUrl}/`).toString();
      } catch {
        return shareSiteUrl;
      }
    })();

    ctx.fillStyle = POSTER.page;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cardX = 34;
    const cardY = 34;
    const cardW = canvas.width - 68;
    const cardH = canvas.height - 68;
    drawGlassPanel(ctx, cardX, cardY, cardW, cardH, 4, { from: POSTER.surface, stroke: POSTER.lineStrong });
    ctx.fillStyle = POSTER.accent;
    ctx.fillRect(cardX, cardY, 16, cardH);
    ctx.fillStyle = POSTER.plate;
    ctx.fillRect(cardX + 16, cardY, 6, cardH);

    const logo = await loadPosterLogo();
    const headerX = cardX + 48;
    const headerY = cardY + 34;
    const headerW = cardW - 96;
    const headerH = 128;
    ctx.drawImage(logo, headerX, headerY + 5, 96, 96);
    ctx.fillStyle = POSTER.ink;
    const zhTitleFit = fitPosterSingleLine(ctx, "香港車牌拍賣資料庫", 560, {
      maxFont: 38,
      minFont: 24,
    });
    ctx.font = `800 ${zhTitleFit.fontSize}px ${POSTER_UI_FONT}`;
    ctx.fillText(zhTitleFit.text, headerX + 122, headerY + 43);
    ctx.fillStyle = POSTER.muted;
    const enTitleFit = fitPosterSingleLine(ctx, "HK Vehicle Registration Marks Database", 560, {
      maxFont: 22,
      minFont: 16,
      family: POSTER_UI_FONT,
      weight: 600,
    });
    ctx.font = `700 ${enTitleFit.fontSize}px ${POSTER_UI_FONT}`;
    ctx.fillText(enTitleFit.text, headerX + 122, headerY + 78);

    const priceText = formatPriceText(row);
    const priceW = 306;
    const priceH = 106;
    const priceX = headerX + headerW - priceW;
    const priceY = headerY + 2;
    drawGlassPanel(ctx, priceX, priceY, priceW, priceH, 4, { from: POSTER.accentSoft, stroke: POSTER.lineStrong });
    ctx.fillStyle = POSTER.muted;
    ctx.font = `800 18px ${POSTER_UI_FONT}`;
    ctx.fillText("成交價 Price", priceX + 22, priceY + 30);
    ctx.fillStyle = POSTER.ink;
    const priceFit = fitPosterSingleLine(ctx, priceText, priceW - 44, {
      maxFont: 38,
      minFont: 22,
      family: POSTER_MONO_FONT,
    });
    ctx.font = `800 ${priceFit.fontSize}px ${POSTER_MONO_FONT}`;
    ctx.fillText(priceFit.text, priceX + 22, priceY + 74);

    ctx.strokeStyle = POSTER.lineStrong;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headerX, headerY + headerH + 2);
    ctx.lineTo(headerX + headerW, headerY + headerH + 2);
    ctx.stroke();

    const singleText = String(row.single_line || "").trim() || "(n/a)";
    const doubleLines = posterDoubleLines(row).filter((x) => !/^\(?n\/a\)?$/i.test(x));
    const showDouble = doubleLines.length > 0;
    const stageX = cardX + 56;
    const stageY = headerY + headerH + 42;
    const stageW = cardW - 112;
    const stageH = 460;
    if (showDouble) {
      const gapW = 24;
      const unifiedCardW = (stageW - gapW) / 2;
      drawPlateCard(
        ctx,
        stageX,
        stageY,
        unifiedCardW,
        stageH,
        "單排排列 Single-line",
        [singleText]
      );
      drawPlateCard(
        ctx,
        stageX + unifiedCardW + gapW,
        stageY,
        unifiedCardW,
        stageH,
        "雙排排列 Double-line",
        doubleLines
      );
    } else {
      drawPlateCard(
        ctx,
        stageX,
        stageY,
        stageW,
        stageH,
        "單排排列 Single-line",
        [singleText]
      );
    }

    const footerTop = stageY + stageH + 28;
    const leftColX = stageX;
    const leftColW = 650;
    drawPosterMetaCard(ctx, leftColX, footerTop, leftColW, 112, "拍賣日期 Auction Date", formatAuctionDate(row), {
      valueSize: 24,
      minValueSize: 18,
    });
    drawPosterMetaCard(
      ctx,
      leftColX,
      footerTop + 126,
      leftColW,
      112,
      "分類 Category",
      posterCategoryLabelBilingual(row),
      { valueSize: 22, minValueSize: 15 }
    );

    const qrPanelW = 272;
    const qrPanelH = 250;
    const qrPanelX = cardX + cardW - qrPanelW - 56;
    const qrPanelY = footerTop;
    drawGlassPanel(ctx, qrPanelX, qrPanelY, qrPanelW, qrPanelH, 4, { from: POSTER.surface, stroke: POSTER.lineStrong });
    const qrSize = 180;
    const qrX = qrPanelX + Math.round((qrPanelW - qrSize) / 2);
    const qrY = qrPanelY + Math.round((qrPanelH - qrSize) / 2);
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 4);
    ctx.fill();
    ctx.strokeStyle = POSTER.lineStrong;
    ctx.lineWidth = 2;
    roundRectPath(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 4);
    ctx.stroke();
    try {
      const qr = loadPosterQr(shareUrl, qrSize);
      ctx.drawImage(qr, qrX, qrY);
    } catch {
      ctx.fillStyle = POSTER.surfaceMuted;
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = POSTER.ink;
      ctx.font = `700 22px ${POSTER_UI_FONT}`;
      const lines = wrapText(ctx, shareUrl, qrSize - 24);
      let y = qrY + 90;
      for (const ln of lines.slice(0, 3)) {
        ctx.fillText(ln, qrX + 12, y);
        y += 30;
      }
    }
    return canvas.toDataURL("image/png");
  }

  async function openShareModal(row) {
    shareTitleEl.textContent = t("sharePosterTitle");
    shareDownloadEl.textContent = t("downloadPoster");
    sharePreviewEl.removeAttribute("src");
    shareModalEl.classList.add("open");
    shareModalEl.setAttribute("aria-hidden", "false");
    currentPosterDataUrl = await buildPosterDataUrl(row);
    sharePreviewEl.src = currentPosterDataUrl;
  }

  function closeShareModal() {
    shareModalEl.classList.remove("open");
    shareModalEl.setAttribute("aria-hidden", "true");
  }

  function downloadCurrentPoster() {
    if (!currentPosterDataUrl) return;
    const a = document.createElement("a");
    a.href = currentPosterDataUrl;
    a.download = `platehk-${Date.now()}.png`;
    a.click();
  }

  function attachShareModalEvents() {
    shareCloseEl.addEventListener("click", closeShareModal);
    shareModalEl.addEventListener("click", (ev) => {
      if (ev.target === shareModalEl) closeShareModal();
    });
    shareDownloadEl.addEventListener("click", downloadCurrentPoster);
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && shareModalEl.classList.contains("open")) closeShareModal();
    });
  }

  return {
    attachShareModalEvents,
    openShareModal,
    closeShareModal,
  };
};
