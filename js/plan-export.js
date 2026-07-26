/* ===========================================================
   MUSCLE TONIK — Plan export (PNG + PDF)

   Both exporters are written from scratch on purpose: the page's
   CSP blocks third-party scripts, so html2canvas / jsPDF can't be
   loaded. Canvas 2D and hand-assembled PDF syntax only — no
   dependencies, no network requests.

   Renders a normalised "plan document" (see buildDoc) so diet,
   workout and the combo all share one layout engine. Diet and
   workout have the same shape: headline + two stats + bullets +
   labelled rows.

   Saving to a phone's gallery is not something a web page can do
   directly (no browser API exposes it). On mobile we hand the file
   to the native share sheet, where "Save Image" puts it in the
   gallery; everywhere else we fall back to a normal download.
   =========================================================== */
window.MTPlanExport = (function () {
  "use strict";

  var COLORS = {
    primary: "#ff7a00", dark: "#111111", text: "#222222",
    light: "#6f6f6f", border: "#e9e9e9", gray: "#f5f5f5", white: "#ffffff"
  };

  var BAND_COLORS = {
    underweight: "#3b82f6", normal: "#16a34a",
    overweight: "#f59e0b", obese: "#e23b3b"
  };

  var BRAND = "MUSCLE TONIK";
  var YEAR = new Date().getFullYear();
  var COPYRIGHT = "© " + YEAR + " Muscle Tonik. All rights reserved. For personal use only.";

  // Content panels are slightly translucent so the background watermark stays
  // visible through them instead of being punched out in blocks.
  var PANEL = "rgba(245,245,245,0.86)";

  var measureCanvas = document.createElement("canvas");
  var measureCtx = measureCanvas.getContext("2d");

  function wrapText(text, font, maxWidth) {
    measureCtx.font = font;
    var words = String(text).split(/\s+/);
    var lines = [], line = "";
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (measureCtx.measureText(test).width > maxWidth && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function planDate(d) {
    return new Date(d || Date.now()).toLocaleDateString("en-IN",
      { day: "numeric", month: "long", year: "numeric" });
  }

  /* =========================================================
     Document model — one shape for every plan kind.
     snapshot: { height, weight, bmi, bandId, bandLabel, goal, rangeLow, rangeHigh }
     kinds:    ["diet"] | ["workout"] | ["diet","workout"]
     ========================================================= */
  function buildDoc(snapshot, kinds, products, purchasedAt) {
    var C = window.MTPlanContent;
    var band = C.bandById(snapshot.bandId);
    var sections = [];

    if (kinds.indexOf("diet") !== -1) {
      var d = C.dietFor(band.id);
      sections.push({
        title: "Diet Plan",
        headline: d.headline,
        stats: [["CALORIES", d.calories], ["PROTEIN", d.protein]],
        focusTitle: "WHAT TO FOCUS ON",
        focus: d.focus,
        rowsTitle: "A DAY OF EATING",
        rows: d.meals
      });
    }
    if (kinds.indexOf("workout") !== -1) {
      var w = C.workoutFor(band.id);
      sections.push({
        title: "Workout Plan",
        headline: w.headline,
        stats: [["SPLIT", w.split], ["CARDIO", w.cardio]],
        focusTitle: "TRAINING PRINCIPLES",
        focus: w.focus,
        rowsTitle: "YOUR WEEKLY PLAN",
        rows: w.days
      });
    }

    var label = kinds.length > 1 ? "Diet & Workout Plan"
      : (kinds[0] === "workout" ? "Workout Plan" : "Diet Plan");

    return {
      kindLabel: label,
      date: planDate(purchasedAt),
      height: snapshot.height, weight: snapshot.weight,
      bmi: Number(snapshot.bmi) || 0,
      band: band,
      bandColor: BAND_COLORS[band.id] || COLORS.primary,
      range: { low: snapshot.rangeLow, high: snapshot.rangeHigh },
      sections: sections,
      products: products || [],
      disclaimer: C.DISCLAIMER
    };
  }

  /* =========================================================
     PNG export
     ========================================================= */

  var IMG = { w: 860, pad: 44 };

  function drawWatermark(ctx, W, H) {
    var text = BRAND + " ©", size = 24;
    ctx.save();
    ctx.font = "800 " + size + "px Inter, Arial, sans-serif";
    ctx.fillStyle = "#eeeeee";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    var stepX = ctx.measureText(text).width + 46, stepY = 62, row = 0;
    for (var y = 40; y < H + stepY; y += stepY) {
      var offset = (row % 2) * (stepX / 2);
      for (var x = -stepX + offset; x < W; x += stepX) ctx.fillText(text, x, y);
      row++;
    }
    ctx.restore();
  }

  function renderImage(doc, ctx) {
    var draw = !!ctx, W = IMG.w, pad = IMG.pad, inner = W - pad * 2, y = 0;

    function box(x, yy, w, h, fill, radius) {
      if (!draw) return;
      ctx.fillStyle = fill;
      if (radius && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, yy, w, h, radius); ctx.fill(); }
      else ctx.fillRect(x, yy, w, h);
    }
    function text(str, x, yy, font, color, align) {
      if (!draw) return;
      ctx.font = font; ctx.fillStyle = color;
      ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(str, x, yy);
    }

    // header
    box(0, 0, W, 108, COLORS.dark);
    text(BRAND, pad, 46, "700 22px Inter, Arial, sans-serif", COLORS.white);
    text("Personal " + doc.kindLabel, pad, 74, "400 15px Inter, Arial, sans-serif", "#bdbdbd");
    text(doc.date, W - pad, 74, "400 12px Inter, Arial, sans-serif", "#8f8f8f", "right");
    y = 144;

    // score + band
    text(doc.bmi.toFixed(1), pad, y + 40, "800 56px Inter, Arial, sans-serif", doc.bandColor);
    measureCtx.font = "800 56px Inter, Arial, sans-serif";
    var scoreW = measureCtx.measureText(doc.bmi.toFixed(1)).width;
    var pillX = pad + scoreW + 20;
    measureCtx.font = "700 13px Inter, Arial, sans-serif";
    var pillW = measureCtx.measureText(doc.band.label).width + 26;
    box(pillX, y + 8, pillW, 28, doc.bandColor, 14);
    text(doc.band.label, pillX + 13, y + 27, "700 13px Inter, Arial, sans-serif", COLORS.white);
    text("Height " + doc.height + " cm  ·  Weight " + doc.weight + " kg",
      pillX, y + 52, "400 13px Inter, Arial, sans-serif", COLORS.light);
    text("Healthy range for your height: " + doc.range.low + "–" + doc.range.high + " kg",
      pillX, y + 72, "600 13px Inter, Arial, sans-serif", COLORS.text);
    y += 100;

    // meter
    var segs = [[15, 18.5, "#3b82f6"], [18.5, 25, "#16a34a"], [25, 30, "#f59e0b"], [30, 40, "#e23b3b"]];
    var x = pad;
    segs.forEach(function (s) { var w = ((s[1] - s[0]) / 25) * inner; box(x, y, w, 12, s[2]); x += w; });
    var pct = Math.max(0, Math.min(1, (doc.bmi - 15) / 25));
    if (draw) {
      ctx.beginPath(); ctx.arc(pad + pct * inner, y + 6, 11, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.white; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = COLORS.dark; ctx.stroke();
    }
    [15, 18.5, 25, 30, 40].forEach(function (v, i) {
      text(String(v), pad + (v - 15) / 25 * inner, y + 34, "400 11px Inter, Arial, sans-serif",
        COLORS.light, i === 0 ? "left" : (i === 4 ? "right" : "center"));
    });
    y += 62;

    // sections
    doc.sections.forEach(function (sec, si) {
      if (si > 0) {
        box(pad, y, inner, 1, COLORS.border);
        y += 26;
      }
      if (doc.sections.length > 1) {
        text(sec.title.toUpperCase(), pad, y, "700 12px Inter, Arial, sans-serif", COLORS.primary);
        y += 22;
      }
      text(sec.headline, pad, y, "700 21px Inter, Arial, sans-serif", COLORS.text);
      y += 30;

      var statW = (inner - 12) / 2;
      var statLines = 0;
      sec.stats.forEach(function (s, i) {
        var sx = pad + i * (statW + 12);
        var lines = wrapText(s[1], "700 13px Inter, Arial, sans-serif", statW - 26);
        statLines = Math.max(statLines, lines.length);
        box(sx, y, statW, 34 + lines.length * 18, PANEL, 10);
        text(s[0], sx + 13, y + 21, "600 10px Inter, Arial, sans-serif", COLORS.light);
        lines.forEach(function (ln, li) {
          text(ln, sx + 13, y + 40 + li * 18, "700 13px Inter, Arial, sans-serif", COLORS.text);
        });
      });
      y += 34 + statLines * 18 + 26;

      text(sec.focusTitle, pad, y, "600 11px Inter, Arial, sans-serif", COLORS.light);
      y += 20;
      sec.focus.forEach(function (f) {
        var lines = wrapText(f, "400 14px Inter, Arial, sans-serif", inner - 22);
        if (draw) {
          ctx.beginPath(); ctx.arc(pad + 4, y - 5, 3, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.primary; ctx.fill();
        }
        lines.forEach(function (ln, li) {
          text(ln, pad + 20, y + li * 20, "400 14px Inter, Arial, sans-serif", COLORS.text);
        });
        y += lines.length * 20 + 8;
      });
      y += 14;

      text(sec.rowsTitle, pad, y, "600 11px Inter, Arial, sans-serif", COLORS.light);
      y += 18;
      sec.rows.forEach(function (m) {
        var lines = wrapText(m[1], "400 13.5px Inter, Arial, sans-serif", inner - 150);
        var rowH = Math.max(30, lines.length * 19 + 12);
        box(pad, y, inner, rowH, PANEL, 8);
        text(m[0], pad + 13, y + 21, "700 12.5px Inter, Arial, sans-serif", COLORS.primary);
        lines.forEach(function (ln, li) {
          text(ln, pad + 140, y + 21 + li * 19, "400 13.5px Inter, Arial, sans-serif", COLORS.text);
        });
        y += rowH + 6;
      });
      y += 16;
    });

    // products
    if (doc.products.length) {
      text("SUGGESTED SUPPLEMENTS", pad, y, "600 11px Inter, Arial, sans-serif", COLORS.light);
      y += 20;
      doc.products.slice(0, 6).forEach(function (p) {
        var nameLines = wrapText(p.name, "400 13px Inter, Arial, sans-serif", inner - 90);
        text(nameLines[0] + (nameLines.length > 1 ? "…" : ""), pad, y,
          "400 13px Inter, Arial, sans-serif", COLORS.text);
        text("Rs " + p.price, pad + inner, y, "700 13px Inter, Arial, sans-serif", COLORS.text, "right");
        y += 22;
      });
      y += 12;
    }

    // disclaimer + footer
    var dLines = wrapText(doc.disclaimer, "400 11px Inter, Arial, sans-serif", inner - 26);
    var dH = dLines.length * 16 + 24;
    box(pad, y, inner, dH, "#fff6ed", 10);
    dLines.forEach(function (ln, i) {
      text(ln, pad + 13, y + 20 + i * 16, "400 11px Inter, Arial, sans-serif", COLORS.light);
    });
    y += dH + 34;

    box(0, y - 16, W, 52, COLORS.dark);
    text(COPYRIGHT, W / 2, y + 14, "400 12px Inter, Arial, sans-serif", "#c9c9c9", "center");
    y += 52;

    return y;
  }

  function exportPng(doc) {
    var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return ready.then(function () {
      var height = renderImage(doc, null);
      var scale = 2;
      var canvas = document.createElement("canvas");
      canvas.width = IMG.w * scale;
      canvas.height = height * scale;
      var ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.fillStyle = COLORS.white;
      ctx.fillRect(0, 0, IMG.w, height);
      drawWatermark(ctx, IMG.w, height);
      renderImage(doc, ctx);
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error("Could not create the image.")); }, "image/png");
      });
    });
  }

  /* =========================================================
     PDF export
     ========================================================= */

  var PDF = { w: 595.28, h: 841.89, margin: 48 };

  function ascii(str) {
    return String(str)
      .replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/×/g, "x").replace(/·/g, "-").replace(/…/g, "...")
      .replace(/₹/g, "Rs ").replace(/é/g, "e").replace(/©/g, "(c)")
      .replace(/±/g, "+/-").replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=")
      .replace(/[^\x20-\x7E]/g, "");
  }
  function pdfEscape(s) {
    return ascii(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }
  function hexToRgb(hex) {
    var h = hex.replace("#", "");
    return [parseInt(h.substring(0, 2), 16) / 255, parseInt(h.substring(2, 4), 16) / 255, parseInt(h.substring(4, 6), 16) / 255];
  }
  function pdfFont(size, bold) {
    return (bold ? "700 " : "400 ") + size + "px Helvetica, Arial, sans-serif";
  }

  function textOp(str, opts) {
    opts = opts || {};
    var size = opts.size || 10;
    var font = opts.bold ? "/F2" : "/F1";
    var color = hexToRgb(opts.color || COLORS.text);
    var x = PDF.margin + (opts.indent || 0);
    return {
      h: opts.h === undefined ? size * 1.45 : opts.h,
      emit: function (top) {
        return "BT " + font + " " + size + " Tf " +
          color[0].toFixed(3) + " " + color[1].toFixed(3) + " " + color[2].toFixed(3) + " rg " +
          "1 0 0 1 " + x.toFixed(2) + " " + (PDF.h - top - size).toFixed(2) +
          " Tm (" + pdfEscape(str) + ") Tj ET\n";
      }
    };
  }
  function spacer(h) { return { h: h, emit: function () { return ""; } }; }

  function wrappedOps(str, opts) {
    opts = opts || {};
    var size = opts.size || 10;
    var width = (PDF.w - PDF.margin * 2) - (opts.indent || 0);
    return wrapText(ascii(str), pdfFont(size, opts.bold), width).map(function (ln) {
      return textOp(ln, opts);
    });
  }

  function buildPdfOps(doc) {
    var ops = [];
    var inner = PDF.w - PDF.margin * 2;

    ops.push({
      h: 0, emit: function () {
        var c = hexToRgb(COLORS.dark);
        return c[0].toFixed(3) + " " + c[1].toFixed(3) + " " + c[2].toFixed(3) + " rg 0 " +
          (PDF.h - 76).toFixed(2) + " " + PDF.w.toFixed(2) + " 76 re f\n";
      }
    });
    ops.push(textOp(BRAND, { size: 16, bold: true, color: "#ffffff", h: 0 }));
    ops.push(spacer(24));
    ops.push(textOp("Personal " + doc.kindLabel + "  -  " + doc.date, { size: 10, color: "#bdbdbd", h: 0 }));
    ops.push(spacer(60));

    ops.push(textOp("BMI " + doc.bmi.toFixed(1) + "  (" + doc.band.label + ")",
      { size: 20, bold: true, color: doc.bandColor }));
    ops.push(spacer(6));
    ops.push(textOp("Height " + doc.height + " cm   Weight " + doc.weight + " kg", { size: 10, color: COLORS.light }));
    ops.push(textOp("Healthy range for your height: " + doc.range.low + "-" + doc.range.high + " kg", { size: 10, bold: true }));
    ops.push(spacer(14));

    var segs = [[15, 18.5, "#3b82f6"], [18.5, 25, "#16a34a"], [25, 30, "#f59e0b"], [30, 40, "#e23b3b"]];
    var bars = [], xc = PDF.margin;
    segs.forEach(function (s) { var w = ((s[1] - s[0]) / 25) * inner; bars.push({ x: xc, w: w, c: s[2] }); xc += w; });
    var mp = Math.max(0, Math.min(1, (doc.bmi - 15) / 25));
    ops.push({
      h: 10, emit: function (top) {
        var out = "";
        bars.forEach(function (b) {
          var c = hexToRgb(b.c);
          out += c[0].toFixed(3) + " " + c[1].toFixed(3) + " " + c[2].toFixed(3) + " rg " +
            b.x.toFixed(2) + " " + (PDF.h - top - 8).toFixed(2) + " " + b.w.toFixed(2) + " 8 re f\n";
        });
        out += "0.067 0.067 0.067 rg " + (PDF.margin + mp * inner - 1.5).toFixed(2) + " " +
          (PDF.h - top - 12).toFixed(2) + " 3 16 re f\n";
        return out;
      }
    });
    ops.push(spacer(8));
    ops.push(textOp("15        18.5              25              30              40", { size: 8, color: COLORS.light }));
    ops.push(spacer(20));

    doc.sections.forEach(function (sec, si) {
      if (si > 0) ops.push(spacer(16));
      if (doc.sections.length > 1) {
        ops.push(textOp(sec.title.toUpperCase(), { size: 11, bold: true, color: COLORS.primary }));
        ops.push(spacer(6));
      }
      ops = ops.concat(wrappedOps(sec.headline, { size: 14, bold: true }));
      ops.push(spacer(10));
      sec.stats.forEach(function (s) {
        ops = ops.concat(wrappedOps(s[0].charAt(0) + s[0].slice(1).toLowerCase() + ": " + s[1], { size: 10 }));
      });
      ops.push(spacer(18));

      ops.push(textOp(sec.focusTitle, { size: 9, bold: true, color: COLORS.light }));
      ops.push(spacer(8));
      sec.focus.forEach(function (f) {
        ops = ops.concat(wrappedOps("-  " + f, { size: 10, indent: 6 }));
        ops.push(spacer(4));
      });
      ops.push(spacer(14));

      ops.push(textOp(sec.rowsTitle, { size: 9, bold: true, color: COLORS.light }));
      ops.push(spacer(8));
      sec.rows.forEach(function (m) {
        ops.push(textOp(m[0], { size: 10, bold: true, color: COLORS.primary }));
        ops = ops.concat(wrappedOps(m[1], { size: 10, indent: 14 }));
        ops.push(spacer(7));
      });
      ops.push(spacer(10));
    });

    if (doc.products.length) {
      ops.push(textOp("SUGGESTED SUPPLEMENTS", { size: 9, bold: true, color: COLORS.light }));
      ops.push(spacer(8));
      doc.products.slice(0, 6).forEach(function (p) {
        var n = ascii(p.name);
        if (n.length > 62) n = n.substring(0, 61) + "...";
        ops.push(textOp("-  " + n + "   (Rs " + p.price + ")", { size: 10, indent: 6 }));
      });
      ops.push(spacer(16));
    }

    ops.push(textOp("DISCLAIMER", { size: 9, bold: true, color: COLORS.light }));
    ops.push(spacer(6));
    ops = ops.concat(wrappedOps(doc.disclaimer, { size: 9, color: COLORS.light }));
    return ops;
  }

  // \251 is the WinAnsi octal for ©, written directly so it survives the ASCII
  // transliteration applied to ordinary strings.
  function watermarkStream() {
    var size = 15;
    measureCtx.font = pdfFont(size, true);
    var stepX = measureCtx.measureText(BRAND + " (c)").width + 40, stepY = 52;
    var out = "0.933 0.933 0.933 rg\n", row = 0;
    for (var y = PDF.h - 46; y > 30; y -= stepY) {
      var offset = (row % 2) * (stepX / 2);
      for (var x = -stepX + offset; x < PDF.w; x += stepX) {
        out += "BT /F2 " + size + " Tf 1 0 0 1 " + x.toFixed(2) + " " + y.toFixed(2) +
          " Tm (" + BRAND + " \\251) Tj ET\n";
      }
      row++;
    }
    return out;
  }

  function footerStream(pageNo, pageTotal) {
    var c = hexToRgb(COLORS.light);
    var rgb = c[0].toFixed(3) + " " + c[1].toFixed(3) + " " + c[2].toFixed(3) + " rg ";
    var out = "0.898 0.898 0.898 rg " + PDF.margin + " 44 " + (PDF.w - PDF.margin * 2).toFixed(2) + " 0.7 re f\n";
    out += "BT /F1 8 Tf " + rgb + "1 0 0 1 " + PDF.margin + " 30 Tm (" + pdfEscape(COPYRIGHT) + ") Tj ET\n";
    measureCtx.font = pdfFont(8, false);
    var label = "Page " + pageNo + " of " + pageTotal;
    out += "BT /F1 8 Tf " + rgb + "1 0 0 1 " +
      (PDF.w - PDF.margin - measureCtx.measureText(label).width).toFixed(2) +
      " 30 Tm (" + pdfEscape(label) + ") Tj ET\n";
    return out;
  }

  function paginate(ops) {
    var pages = [], current = "", top = PDF.margin;
    var limit = PDF.h - PDF.margin - 26;
    ops.forEach(function (op) {
      if (top + op.h > limit && current) { pages.push(current); current = ""; top = PDF.margin; }
      current += op.emit(top);
      top += op.h;
    });
    if (current) pages.push(current);
    return pages.map(function (c, i) {
      return watermarkStream() + c + footerStream(i + 1, pages.length);
    });
  }

  function assemblePdf(pageStreams) {
    var objects = [], pageCount = pageStreams.length, first = 5, kids = [];
    for (var i = 0; i < pageCount; i++) kids.push((first + i * 2) + " 0 R");
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pageCount + " >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    for (var p = 0; p < pageCount; p++) {
      var pageObj = first + p * 2, contentObj = pageObj + 1;
      objects[pageObj] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PDF.w.toFixed(2) + " " + PDF.h.toFixed(2) +
        "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + contentObj + " 0 R >>";
      objects[contentObj] = "<< /Length " + pageStreams[p].length + " >>\nstream\n" + pageStreams[p] + "endstream";
    }
    var out = "%PDF-1.4\n", offsets = [];
    for (var n = 1; n < objects.length; n++) {
      offsets[n] = out.length;
      out += n + " 0 obj\n" + objects[n] + "\nendobj\n";
    }
    var xrefPos = out.length;
    out += "xref\n0 " + objects.length + "\n0000000000 65535 f \n";
    for (var k = 1; k < objects.length; k++) out += ("0000000000" + offsets[k]).slice(-10) + " 00000 n \n";
    out += "trailer\n<< /Size " + objects.length + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF";
    // Latin-1 bytes so xref offsets match string offsets exactly.
    var bytes = new Uint8Array(out.length);
    for (var b = 0; b < out.length; b++) bytes[b] = out.charCodeAt(b) & 0xff;
    return new Blob([bytes], { type: "application/pdf" });
  }

  function exportPdf(doc) {
    return Promise.resolve(assemblePdf(paginate(buildPdfOps(doc))));
  }

  /* ========================= delivery ========================= */

  function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""); }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return "downloaded";
  }

  function saveOrShare(blob, filename, title) {
    var file;
    try { file = new File([blob], filename, { type: blob.type }); } catch (e) { file = null; }
    if (file && isMobile() && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: title })
        .then(function () { return "shared"; })
        .catch(function (err) {
          if (err && err.name === "AbortError") return "cancelled";
          return download(blob, filename);
        });
    }
    return Promise.resolve(download(blob, filename));
  }

  return {
    buildDoc: buildDoc,
    exportPng: exportPng,
    exportPdf: exportPdf,
    saveOrShare: saveOrShare,
    canShareFiles: function () { return !!(isMobile() && navigator.share && navigator.canShare); }
  };
})();
