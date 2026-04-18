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
      family = "'Noto Sans HK', Helvetica, Arial, sans-serif",
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
      family = "'Noto Sans HK', Helvetica, Arial, sans-serif",
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
      img.src = "./assets/logo.svg";
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
    const quietZone = 3;
    const totalModules = moduleCount + quietZone * 2;
    const cellSize = Math.max(1, Math.floor(size / totalModules));
    const actualSize = cellSize * totalModules;
    const canvas = document.createElement("canvas");
    canvas.width = actualSize;
    canvas.height = actualSize;
    const qctx = canvas.getContext("2d");
    qctx.fillStyle = "#ffffff";
    qctx.fillRect(0, 0, actualSize, actualSize);
    qctx.fillStyle = "#000000";
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        if (!qr.isDark(row, col)) continue;
        qctx.fillRect(
          (col + quietZone) * cellSize,
          (row + quietZone) * cellSize,
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
    {
      from = "rgba(255,255,255,0.72)",
      to = "rgba(214,231,255,0.28)",
      stroke = "rgba(255,255,255,0.66)",
      shadow = "rgba(7,28,58,0.18)",
      shadowBlur = 30,
      gloss = true,
    } = {}
  ) {
    ctx.save();
    const fill = ctx.createLinearGradient(x, y, x + w, y + h);
    fill.addColorStop(0, from);
    fill.addColorStop(1, to);
    ctx.shadowColor = shadow;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetY = 18;
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    roundRectPath(ctx, x, y, w, h, r);
    ctx.stroke();
    if (gloss) {
      const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.55);
      sheen.addColorStop(0, "rgba(255,255,255,0.52)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      roundRectPath(ctx, x + 2, y + 2, w - 4, h * 0.52, Math.max(10, r - 2));
      ctx.fillStyle = sheen;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPosterOrb(ctx, x, y, radius, inner, outer = "rgba(255,255,255,0)") {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPosterPill(
    ctx,
    x,
    y,
    text,
    { fill = "rgba(12,39,80,0.72)", color = "#ffffff", maxWidth = 320, fontSize = 22, minFontSize = 15 } = {}
  ) {
    ctx.save();
    const usableTextWidth = Math.max(44, maxWidth - 36);
    const fit = fitPosterText(ctx, text, usableTextWidth, {
      maxFont: fontSize,
      minFont: minFontSize,
      maxLines: 1,
    });
    ctx.font = `700 ${fit.fontSize}px 'Noto Sans HK', Helvetica, Arial, sans-serif`;
    const padX = 18;
    const h = 42;
    const label = fit.lines[0] || "";
    const w = Math.min(maxWidth, ctx.measureText(label).width + padX * 2);
    roundRectPath(ctx, x, y, w, h, 21);
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
    { accent = "#0f1c2b", valueSize = 32, minValueSize = 18 } = {}
  ) {
    drawGlassPanel(ctx, x, y, w, h, 28, {
      from: "rgba(255,255,255,0.68)",
      to: "rgba(220,235,255,0.24)",
      stroke: "rgba(255,255,255,0.7)",
      shadow: "rgba(8,29,62,0.12)",
      shadowBlur: 18,
    });
    ctx.save();
    ctx.fillStyle = "rgba(26,70,111,0.72)";
    ctx.font = "700 20px 'Noto Sans HK', Helvetica, Arial, sans-serif";
    ctx.fillText(label, x + 24, y + 34);
    ctx.fillStyle = accent;
    const fit = fitPosterSingleLine(ctx, value, w - 48, {
      maxFont: valueSize,
      minFont: minValueSize,
    });
    ctx.font = `700 ${fit.fontSize}px 'Noto Sans HK', Helvetica, Arial, sans-serif`;
    ctx.fillText(fit.text, x + 24, y + 90);
    ctx.restore();
  }

  function drawPlateCard(ctx, x, y, w, h, title, lines) {
    const compact = h < 220;
    drawGlassPanel(ctx, x, y, w, h, 30, {
      from: "rgba(255,255,255,0.72)",
      to: "rgba(214,231,255,0.26)",
      stroke: "rgba(255,255,255,0.72)",
      shadow: "rgba(8,29,60,0.18)",
      shadowBlur: 22,
    });

    drawPosterPill(ctx, x + 14, y + (compact ? 12 : 18), title, {
      fill: "rgba(15,28,43,0.78)",
      color: "#f8fbff",
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
    const plateFill = ctx.createLinearGradient(plateX, plateY, plateX, plateY + plateH);
    plateFill.addColorStop(0, "#ffd95f");
    plateFill.addColorStop(1, "#f0bb17");
    ctx.fillStyle = plateFill;
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 5;
    roundRectPath(ctx, plateX, plateY, plateW, plateH, Math.max(14, plateH * 0.14));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.42)";
    roundRectPath(ctx, plateX + 4, plateY + 4, plateW - 8, Math.max(16, plateH * 0.18), 12);
    ctx.fill();

    ctx.fillStyle = "#111111";
    ctx.textAlign = "center";
    const sharedMaxFont = Math.min(62, plateH * 0.34);
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
        "Helvetica, Arial, sans-serif",
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
        "Helvetica, Arial, sans-serif",
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
        "Helvetica, Arial, sans-serif",
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

    const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, "#edf6ff");
    g.addColorStop(0.5, "#d7ebff");
    g.addColorStop(1, "#eef2fb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawPosterOrb(ctx, 180, 140, 220, "rgba(132,213,255,0.48)");
    drawPosterOrb(ctx, 1010, 170, 250, "rgba(255,222,143,0.42)");
    drawPosterOrb(ctx, 930, 930, 260, "rgba(182,198,255,0.28)");

    const cardX = 34;
    const cardY = 34;
    const cardW = canvas.width - 68;
    const cardH = canvas.height - 68;
    drawGlassPanel(ctx, cardX, cardY, cardW, cardH, 42, {
      from: "rgba(255,255,255,0.64)",
      to: "rgba(222,235,255,0.24)",
      stroke: "rgba(255,255,255,0.82)",
      shadow: "rgba(8,33,69,0.18)",
      shadowBlur: 44,
    });

    const logo = await loadPosterLogo();
    const headerX = cardX + 28;
    const headerY = cardY + 28;
    const headerW = cardW - 56;
    const headerH = 128;
    drawGlassPanel(ctx, headerX, headerY, headerW, headerH, 34, {
      from: "rgba(255,255,255,0.76)",
      to: "rgba(229,241,255,0.28)",
      stroke: "rgba(255,255,255,0.84)",
      shadow: "rgba(8,29,60,0.16)",
      shadowBlur: 20,
    });
    ctx.drawImage(logo, headerX + 22, headerY + 18, 92, 92);
    ctx.fillStyle = "#102b43";
    const zhTitleFit = fitPosterSingleLine(ctx, "香港車牌拍賣結果搜尋", 500, {
      maxFont: 34,
      minFont: 24,
    });
    ctx.font = `700 ${zhTitleFit.fontSize}px 'Noto Sans HK', Helvetica, Arial, sans-serif`;
    ctx.fillText(zhTitleFit.text, headerX + 138, headerY + 54);
    ctx.fillStyle = "#446179";
    const enTitleFit = fitPosterSingleLine(ctx, "Hong Kong Plate Auction Search", 500, {
      maxFont: 20,
      minFont: 16,
      family: "Helvetica, Arial, sans-serif",
      weight: 600,
    });
    ctx.font = `600 ${enTitleFit.fontSize}px Helvetica, Arial, sans-serif`;
    ctx.fillText(enTitleFit.text, headerX + 138, headerY + 90);

    const priceText = formatPriceText(row);
    const priceW = 294;
    const priceH = 94;
    const priceX = headerX + headerW - priceW - 22;
    const priceY = headerY + 17;
    drawGlassPanel(ctx, priceX, priceY, priceW, priceH, 28, {
      from: "rgba(14,44,79,0.78)",
      to: "rgba(24,129,193,0.46)",
      stroke: "rgba(255,255,255,0.38)",
      shadow: "rgba(9,31,61,0.24)",
      shadowBlur: 22,
    });
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "700 18px 'Noto Sans HK', Helvetica, Arial, sans-serif";
    ctx.fillText("成交價 Price", priceX + 22, priceY + 26);
    ctx.fillStyle = "#ffffff";
    const priceFit = fitPosterSingleLine(ctx, priceText, priceW - 44, {
      maxFont: 36,
      minFont: 22,
    });
    ctx.font = `700 ${priceFit.fontSize}px 'Noto Sans HK', Helvetica, Arial, sans-serif`;
    ctx.fillText(priceFit.text, priceX + 22, priceY + 66);

    const singleText = String(row.single_line || "").trim() || "(n/a)";
    const doubleLines = posterDoubleLines(row).filter((x) => !/^\(?n\/a\)?$/i.test(x));
    const showDouble = doubleLines.length > 0;
    const stageX = cardX + 28;
    const stageY = headerY + headerH + 20;
    const stageW = cardW - 56;
    const stageH = 520;
    drawGlassPanel(ctx, stageX, stageY, stageW, stageH, 36, {
      from: "rgba(255,255,255,0.62)",
      to: "rgba(227,239,255,0.2)",
      stroke: "rgba(255,255,255,0.8)",
      shadow: "rgba(11,39,75,0.1)",
      shadowBlur: 16,
    });
    const stageInnerX = stageX + 22;
    const stageInnerY = stageY + 22;
    const stageInnerW = stageW - 44;
    const stageInnerH = stageH - 44;
    const gapW = 18;
    const unifiedCardW = (stageInnerW - gapW) / 2;
    const unifiedCardH = stageInnerH;
    if (showDouble) {
      const singleCardX = stageInnerX;
      const singleCardY = stageInnerY;
      drawPlateCard(
        ctx,
        singleCardX,
        singleCardY,
        unifiedCardW,
        unifiedCardH,
        "單排排列 Single-line",
        [singleText]
      );
      const doubleCardX = singleCardX + unifiedCardW + gapW;
      const doubleCardY = stageInnerY;
      drawPlateCard(
        ctx,
        doubleCardX,
        doubleCardY,
        unifiedCardW,
        unifiedCardH,
        "雙排排列 Double-line",
        doubleLines
      );
    } else {
      const singleCardX = stageInnerX + (stageInnerW - unifiedCardW) / 2;
      drawPlateCard(
        ctx,
        singleCardX,
        stageInnerY,
        unifiedCardW,
        unifiedCardH,
        "單排排列 Single-line",
        [singleText]
      );
    }

    const footerTop = stageY + stageH + 20;
    const leftColX = stageX;
    const leftColW = 620;
    drawPosterMetaCard(ctx, leftColX, footerTop, leftColW, 104, "拍賣日期 Auction Date", formatAuctionDate(row), {
      valueSize: 24,
      minValueSize: 18,
    });
    drawPosterMetaCard(
      ctx,
      leftColX,
      footerTop + 118,
      leftColW,
      104,
      "分類 Category",
      posterCategoryLabelBilingual(row),
      { valueSize: 22, minValueSize: 15 }
    );

    const qrPanelW = 280;
    const qrPanelH = 226;
    const qrPanelX = cardX + cardW - qrPanelW - 28;
    const qrPanelY = footerTop;
    drawGlassPanel(ctx, qrPanelX, qrPanelY, qrPanelW, qrPanelH, 30, {
      from: "rgba(255,255,255,0.74)",
      to: "rgba(224,238,255,0.28)",
      stroke: "rgba(255,255,255,0.76)",
      shadow: "rgba(8,31,63,0.14)",
      shadowBlur: 20,
    });
    const qrSize = 180;
    const qrX = qrPanelX + Math.round((qrPanelW - qrSize) / 2);
    const qrY = qrPanelY + Math.round((qrPanelH - qrSize) / 2);
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 22);
    ctx.fill();
    try {
      const qr = loadPosterQr(shareUrl, qrSize);
      ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
    } catch {
      ctx.fillStyle = "#f1f1f1";
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = "#0f1c2b";
      ctx.font = "600 22px 'Noto Sans HK', Helvetica, Arial, sans-serif";
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
