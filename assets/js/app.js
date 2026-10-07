/* ============================================================
   Color Your Day —— 每日颜色（独立版）
   从「憩想 · 个人摄影」站点抽出，配色公式 / 抽色算法 / 交互原样保留。
   依赖：assets/js/colors_data.js（window.QB_COLORS，365 条全文，
         必须先于本文件加载 —— 用 defer 保证顺序）。
   数据没到位时方阵整块收起（见块内 initColorDay 的守卫），不会留空框。
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- 最小 i18n（中 / 英） ----------------
     键名与摄影站一致，方便以后把上游的文案改动同步过来。 */
  var I18N = {
    zh: {
      cdBtn: "每日颜色", cdBtnAria: "翻开今天的颜色",
      cdGridAria: "颜色库随机色块拼成的方阵",
      cdHexLabel: "色号", cdHistLabel: "历史", cdFunLabel: "趣闻",
      cdAria: "每日颜色详情", cdClose: "关闭",
      cdDaily: "每日 00:00 更换",
      uiLangBtn: "EN", uiLangAria: "Switch to English",
      uiThemeAria: "切换明暗主题", uiTitle: "Color Your Day · 每日颜色",
      uiH1: "每日颜色",
      uiSub: "从 365 个有来头的颜色里，每天给你一个",
      uiFoot: "365 个颜色 · 一天一个 · 有历史也有趣闻"
    },
    en: {
      cdBtn: "Today's color", cdBtnAria: "Reveal today's color",
      cdGridAria: "A grid of random colours drawn from the collection",
      cdHexLabel: "Hex", cdHistLabel: "History", cdFunLabel: "Trivia",
      cdAria: "Today's color details", cdClose: "Close",
      cdDaily: "A new color every day at 00:00",
      uiLangBtn: "中文", uiLangAria: "切换到中文",
      uiThemeAria: "Toggle theme", uiTitle: "Color Your Day",
      uiH1: "Color Your Day",
      uiSub: "One color with a story, every day — drawn from 365",
      uiFoot: "365 colors · one a day · each with a story"
    }
  };
  var state = { lang: "zh", theme: "dark" };

  function t(k) {
    var d = I18N[state.lang] || I18N.zh;
    return d[k] != null ? d[k] : (I18N.zh[k] != null ? I18N.zh[k] : k);
  }
  /* 转义：与摄影站同一份 —— 凡是 innerHTML 拼出去的字符串都得过这里 */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------------- DOM 小工具 ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var els = {};
  function collect() {
    els.heroCD = $("#heroCD");
    els.cdGrid = $("#cdGrid");
    els.cdBtn = $("#cdBtn");
    els.cdCap = $("#cdCap");
    els.cdModal = $("#cdModal");
    els.cdSwatch = $("#cdSwatch");
    els.cdSwName = $("#cdSwName");
    els.cdHex = $("#cdHex");
    els.cdRgb = $("#cdRgb");
    els.cdName = $("#cdName");
    els.cdCat = $("#cdCat");
    els.cdAlias = $("#cdAlias");
    els.cdHist = $("#cdHist");
    els.cdFun = $("#cdFun");
  }

  /* ---------------- 焦点助手（弹窗无障碍，照抄摄影站） ----------------
     ⚠ rememberFocus 必须在弹窗**已经显示出来**之后调：
        display:none 的子树上的元素不可聚焦，focus() 会静默失败。 */
  var _focusBack = null;
  function rememberFocus(node) {
    var ae = document.activeElement;
    _focusBack = (ae && ae !== document.body && document.contains(ae)) ? ae : null;
    var first = node && node.querySelector("button, [href], input, [tabindex]:not([tabindex='-1'])");
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) { try { first.focus(); } catch (e2) {} } }
  }
  function restoreFocus() {
    if (_focusBack && document.contains(_focusBack)) {
      try { _focusBack.focus({ preventScroll: true }); } catch (e) {}
    }
    _focusBack = null;
  }
  function trapTab(e, node) {
    var f = node.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------------- 主题（深 / 浅） ----------------
     方阵的斜轴方向跟着 data-theme 走（cdRev()），所以主题系统是功能前提，
     不只是装饰。持久化到 localStorage，回到页面时保持上回的选择。 */
  function setTheme(mode) {
    var root = document.documentElement;
    root.setAttribute("data-theme", mode);
    state.theme = mode;
    try { localStorage.setItem("cyd-theme", mode); } catch (e) {}
  }
  /* 主题换了，方阵得换一个角重铺。唯一要紧的是时机：等交叉淡化收尾再铺。
     token 兜住三种到点方式（finished 回来 / 浏览器不支持 / 超时兜底），
     保证一轮只铺一次 —— 连点时新 token 顶掉旧的，旧定时器到点自己退场。 */
  function planSweep() {
    var token = (switchTheme._s = { done: false });
    var run = function () {
      if (token.done || switchTheme._s !== token) return;
      token.done = true;
      renderCdGrid();
    };
    return {
      now: run,
      soon: function (ms) { setTimeout(run, ms); }
    };
  }
  function switchTheme(mode) {
    var root = document.documentElement;
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches; } catch (e) {}
    var sweep = planSweep();

    if (reduce) {                        // 减弱动效：直接换，方向还是要翻
      setTheme(mode);
      sweep.now();
      return;
    }

    if (typeof document.startViewTransition === "function") {
      root.classList.add("theme-instant");     // 快照里不要过渡态
      var cleanup = function () {
        clearTimeout(switchTheme._c);
        root.classList.remove("theme-instant");
      };
      switchTheme._c = setTimeout(cleanup, 1500);   // 兜底：类名绝不残留
      sweep.soon(1100);                             // 兜底：finished 万一来不了
      try {
        var tr = document.startViewTransition(function () { setTheme(mode); });
        if (tr && tr.finished && tr.finished.then) {
          tr.finished.then(function () { sweep.soon(60); }, function () { sweep.soon(60); });
        } else {
          sweep.soon(320);
        }
        if (tr && tr.ready && tr.ready.then) tr.ready.then(cleanup, cleanup);
        else setTimeout(cleanup, 320);
      } catch (e) {
        cleanup();
        setTheme(mode);
        sweep.soon(80);
      }
      return;
    }

    root.classList.add("theme-cut");     // 降级：逐元素过渡先走一格，方阵随后重铺
    setTheme(mode);
    sweep.soon(200);
    clearTimeout(switchTheme._t);
    switchTheme._t = setTimeout(function () { root.classList.remove("theme-cut"); }, 320);
  }
  function toggleTheme() { switchTheme(state.theme === "dark" ? "light" : "dark"); }

  /* ---------------- 语言切换 / 页面小件 ---------------- */
  function applyI18n() {
    document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
    $$("[data-i18n]").forEach(function (n) {
      n.textContent = t(n.getAttribute("data-i18n"));
    });
    $$("[data-i18n-a]").forEach(function (n) {
      n.setAttribute("aria-label", t(n.getAttribute("data-i18n-a")));
    });
    document.title = t("uiTitle");
  }
  function setLang(l) {
    if (l !== "zh" && l !== "en") l = "zh";
    state.lang = l;
    try { localStorage.setItem("cyd-lang", l); } catch (e) {}
    applyI18n();
    /* 弹窗开着就重填（文案跟语言走）；方阵不重抽 —— 抽到就缓存，
       切语言重抽会让整批颜色都变，看着像页面在抖。 */
    if (els.cdModal && els.cdModal.classList.contains("open")) fillCdCard();
    renderCdCap();
  }
  function bindChrome() {
    var th = $("#themeBtn");
    if (th) th.addEventListener("click", toggleTheme);
    var lg = $("#langBtn");
    if (lg) lg.addEventListener("click", function () {
      setLang(state.lang === "zh" ? "en" : "zh");
    });
  }

    /* =================== 每日颜色方阵（Color Your Day） ===================
     方阵每次载入从颜色库里随机抽 CD_N² 个颜色，沿左下 → 右上逐块变亮；
     浅色主题整条轴镜像成右上 → 左下，切主题时从另一个角重铺一遍（见 cdRev()）——
     它只是个装饰性的色块阵，**不透露**今天是什么颜色；点按钮翻开弹窗才知道。

     「今天」那个颜色不靠随机数、不靠刷新次数，直接由日期算下标 ——
     同一天永远是同一个颜色，跨过 00:00 才换，浏览器缓存和换设备都不影响。

     数据模型（独立版）：**只有一个** window.QB_COLORS，每条就是全文
     （hex + 名称 + 由来 + 趣闻），由 tools/build_colors.py 从 data/*.json 编译。
     摄影站原版为保首屏体积做了「hex 索引层 + 按需全文层」两段式；
     这里没有首屏预算要守，两层并成一层，cdLoadFull() 退化成直接 resolve。
     ⚠ 两条铁律照旧成立（都有真实的翻车记录，别删）：
       · cdToday() 把**下标**贴在对象上带出去，取全文一律 cdRich(c, idx) 按下标取
         —— 库里有两条颜色共用 #0ABAB5，按 hex 反查必错位；
       · 切语言 / 切主题重绘时**不得重抽**（cdPickCache 兜住）。 */

  var CD_N = 8;                 /* 方阵每行几块（总数 = CD_N²） */
  /* 方阵的亮度带，按「相对亮度 Y」定标而不是 HSL 的 L —— 见 cdLForY() */
  var CD_Y_LO = 0.055, CD_Y_HI = 0.70;
  var cdBooted = false;
  var cdPickCache = null;       /* 本次载入抽到的随机色；切语言/重绘都用这一批 */

    /* 独立版：QB_COLORS 本身就是全文对象数组（含 hex），cdList() 原样适用 ——
     它同时认「裸 hex 字符串」与「{hex:...} 对象」两种形状，对象直接放行。
     ⚠ 库里**有两条颜色共用同一个色号**（#0ABAB5，tiffany-blue / tiff-blue，
        作者有意保留），所以「今天是第几个」只能按**下标**算，
        全文也一律 cdRich(c, idx) 按下标取 —— 按 hex 反查必错位。 */

  function cdList() {
    var raw = window.QB_COLORS || [], out = [], i, c;
    for (i = 0; i < raw.length; i++) {
      c = raw[i];
      if (!c) continue;
      /* 索引层是裸的 "#RRGGBB" 字符串。全文层不带 hex，走不到这条路 ——
         真出现 {hex:...} 形状的索引（旧版遗留）也一并兼容。 */
      if (typeof c === "string") { if (c) out.push({ hex: c }); }
      else if (c.hex) { out.push(c); }
    }
    return out;
  }
    /* 弹窗要显示名字与由来。独立版里传进来的对象本身就是全文，
     这里原样返回 —— 但**签名必须保留 (c, idx)**：
     「按下标、不按 hex 反查」是这道 API 的契约，不是实现细节。 */

  function cdRich(c, idx) {
    if (!c) return null;
    var full = window.QB_COLORS_FULL;
    var src = (full && idx != null && idx >= 0 && full[idx]) ? full[idx] : null;
    if (!src && (c.zh || c.en || c.histZh || c.histEn)) return c;  // 本身就是全文
    if (!src) return c;                                            // 全文没到位，先用 hex 顶
    /* 合并：以全文的字段为主，把索引层的 hex 补上（全文里没有这个字段）。 */
    var m = {}, k;
    for (k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) m[k] = src[k]; }
    if (!m.hex && c.hex) m.hex = c.hex;
    return m;
  }
    /* 独立版只有一个数据文件：QB_COLORS 本身就是全文，无需再拉第二层。
     保留同名函数与「返回 Promise」的约定，cdReveal() 里的
     cdLoadFull().then(...) 一个字不用改。 */
  function cdLoadFull() { return Promise.resolve(); }

  /* 按「日历日」算下标。用 Date.UTC 而不是本地午夜：
     本地午夜的时间戳在夏令时切换那天会差 23 或 25 小时，
     拿它除 86400000 会漏掉或重复一天。UTC 只取日历字段，不受影响。 */
  function cdDayIndex(n, dt) {
    var d = dt || new Date();
    var ord = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    return ((ord % n) + n) % n;
  }
  function cdToday() {
    var L = cdList();
    if (!L.length) return null;
    var i = cdDayIndex(L.length);
    /* 把下标**贴到对象上**一起带出去。后来要用全文（名字/由来）时，
       按下标取就行 —— 不能再按 hex 反查，库里有两色共用一个色号。 */
    var c = L[i];
    c.i = i;
    return c;
  }
  function cdText(base, k) {
    return (state.lang === "en" ? (base[k + "En"] || base[k + "Zh"])
                                : (base[k + "Zh"] || base[k + "En"])) || "";
  }

  /* ---- 颜色换算 ---- */
  function cdRgbOf(hex) {
    var s = String(hex).replace("#", "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var v = parseInt(s, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function cdHslOf(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h, s: s, l: l };
  }
  /* HSL → [r,g,b]（0-255）。拆出来是因为反解亮度要反复试算，不能每次都拼字符串 */
  function cdRgbOfHsl(h, s, l) {
    h = ((h % 1) + 1) % 1;
    if (s === 0) { var y = Math.round(l * 255); return [y, y, y]; }
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function ch(t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [h + 1 / 3, h, h - 1 / 3].map(function (t) {
      return Math.round(ch(t) * 255);
    });
  }
  function cdCss(h, s, l) { return "rgb(" + cdRgbOfHsl(h, s, l).join(",") + ")"; }
  /* 方阵的走向：深色主题「左下 → 右上」，浅色主题整条轴镜像成「右上 → 左下」。
     一个走向同时管两件事 —— 每块的入场延迟（--cd-t）和它的落点亮度，
     所以换方向不用另写一套逻辑，把整张网格重铺一遍就行。
     ⚠️ 真源就是 data-theme 属性本身，别另存一份缓存：主题是在 setTheme() 里
        直接写 DOM 的，旁路缓存早晚会和它错开，而错开的后果是方阵往一边走、
        颜色往另一边铺，看着像卡了个中间态。 */
  function cdRev() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }
  /* 块在方阵里的位置 → 0（起点）… 1（终点）。
     row 0 在最上面，所以纵向要倒过来算，梯度才是「左下暗 → 右上亮」；
     浅色主题把整条轴镜像过来（t → 1-t），起点就挪到右上角。 */
  function cdT(col, row, n) {
    var t = (col + (n - 1 - row)) / (2 * (n - 1));
    return cdRev() ? 1 - t : t;
  }
  /* ---- 方阵的随机取色 ----
     载入时抽一次就缓存住：切语言或重绘都不该换一批，那看着像页面在抖。
     整轮整轮地洗牌取 —— 库里比格子多就取前 n 个（不重样）；
     比格子少就取完一轮再洗一次接着取。
     别用「每次独立随机抽」：那样热门的色会一格里挤好几个，
     实测 45 色抽 64 格时有一屏挤了十个粉，一眼就看出不是均匀随机。 */
  function cdShuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function cdGridPicks() {
    if (cdPickCache) return cdPickCache;
    var n = CD_N * CD_N, pool = cdList().map(function (c) {
      var r = cdRgbOf(c.hex);
      return cdHslOf(r.r, r.g, r.b);
    });
    var out = [];
    while (out.length < n && pool.length) {
      cdShuffle(pool);
      for (var k = 0; k < pool.length && out.length < n; k++) out.push(pool[k]);
    }
    cdPickCache = out;
    return out;
  }
  /* 相对亮度（0-1）。方阵要的是「看上去真的越来越亮」，所以定标用 Y，不是 HSL 的 L */
  function cdRelY(r, g, b) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
  /* 反解：给定色相/饱和度，求落在目标相对亮度 y 上的那个 HSL 的 L。
     同样 L=0.5 的蓝和黄，黄看起来亮得多 —— 不做这一步，方阵的对角线就成不了一道亮度坡。
     Y 关于 L 单调递增（HSL→RGB 里 p、q 都随 L 单调），二分 22 次足够。 */
  function cdLForY(h, s, y) {
    var lo = 0, hi = 1, mid, c;
    for (var i = 0; i < 22; i++) {
      mid = (lo + hi) / 2;
      c = cdRgbOfHsl(h, s, mid);
      if (cdRelY(c[0], c[1], c[2]) < y) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  /* 整块铺一遍。每格的「落点亮度」和「入场延迟」共用同一个 t，
     所以换方向 = 整个重跑本函数：新元素必然会重新播一遍入场动画（延迟反向），
     颜色也按新梯度直接算好，不用再补一层颜色过渡。
     ⚠️ 重建会换掉全部格子，磁贴的几何缓存必须一并作废，否则托起效果会认旧位置。 */
  function renderCdGrid() {
    if (!els.cdGrid) return;
    var picks = cdGridPicks(), n = CD_N, out = [], rev = cdRev();
    for (var row = 0; row < n; row++) {
      for (var col = 0; col < n; col++) {
        var t = cdT(col, row, n), p = picks[row * n + col];
        var y = CD_Y_LO + t * (CD_Y_HI - CD_Y_LO);
        out.push('<i class="cd-cell" style="background:' + cdCss(p.h, p.s, cdLForY(p.h, p.s, y)) +
          ';--cd-t:' + t.toFixed(3) + '"></i>');
      }
    }
    els.cdGrid.style.setProperty("--cd-n", String(n));
    els.cdGrid.classList.toggle("cd-rev", rev);   /* 反向铺（浅色主题）时换一套入场手感 */
    cdTileGeo = null;                        /* 重建了格子，缓存的位置作废 */
    els.cdGrid.innerHTML = out.join("");
  }

  /* ---- 方阵磁贴：光标滑过时把格子「托起来」 ----
     滑过时每一块按「到光标的距离」被抬起一点：越近抬得越高，走开就落回去。
     位移 / 缩放 / 投影都写在 CSS 里，由 --cd-f 驱动，这里每帧只改这一个变量。
     两条容易踩的：① 一格都别写死 —— 影响半径按格宽算，换屏换字号都跟着走；
     ② 值没变就 continue，静止时一次 DOM 都不碰（64 个元素逐帧写会让样式重算）。 */
  var CD_TILE_R = 2.1;      /* 影响半径 = 格宽 × 这个数（约 ±2 圈邻居） */
  var cdTileRaf = 0, cdTilePt = null, cdTileGeo = null;

  /* 64 个格子的中心点，存成「相对方阵左上角」的坐标 ——
     存相对值是为了页面滚动时不用重建；只在方阵自身尺寸变了才重算。 */
  function cdTileGeom(gw, gh) {
    if (cdTileGeo && cdTileGeo.w === gw && cdTileGeo.h === gh) return cdTileGeo;
    var cells = els.cdGrid.children;
    if (!cells || !cells.length) return null;
    var g = els.cdGrid.getBoundingClientRect(), pts = [], i, r;
    for (i = 0; i < cells.length; i++) {
      r = cells[i].getBoundingClientRect();
      pts.push(r.left - g.left + r.width / 2, r.top - g.top + r.height / 2, r.width);
    }
    cdTileGeo = { w: gw, h: gh, pts: pts };
    return cdTileGeo;
  }

  function cdTilePaint() {
    cdTileRaf = 0;
    if (!cdTilePt || !els.cdGrid || !els.cdGrid.firstElementChild) return;
    var g = els.cdGrid.getBoundingClientRect();
    if (!g.width) return;                    /* 方阵被藏起来时量不到，别拿 0 去算 */
    var geo = cdTileGeom(g.width, g.height);
    if (!geo) return;
    var x = cdTilePt.x - g.left, y = cdTilePt.y - g.top;
    var cells = els.cdGrid.children, pts = geo.pts;
    for (var i = 0; i < cells.length; i++) {
      var cw = pts[i * 3 + 2], dx = x - pts[i * 3], dy = y - pts[i * 3 + 1];
      var d2 = (dx * dx + dy * dy) / (cw * cw * CD_TILE_R * CD_TILE_R);
      var f = d2 < 1 ? 1 - d2 : 0;
      f = f * f;                             /* 再平方：收得更紧，只有近处那几块跳得出来 */
      if (f < 0.004) f = 0;
      var c = cells[i];
      if (c.__cdF === f) continue;           /* 值没变就别碰 DOM */
      c.__cdF = f;
      if (f) {
        c.style.setProperty("--cd-f", f.toFixed(3));
        c.style.zIndex = String(1 + Math.round(f * 30));   /* 隆起的块压住邻居 */
      } else {
        c.style.removeProperty("--cd-f");
        c.style.zIndex = "";
      }
    }
  }

  function cdTileMove(e) {
    if (e.pointerType === "touch") return;   /* 触屏上这一层留给原生滚动，不接管 */
    cdTilePt = { x: e.clientX, y: e.clientY };
    if (!cdTileRaf) cdTileRaf = window.requestAnimationFrame(cdTilePaint);
  }

  function cdTileOff() {
    cdTilePt = null;
    if (cdTileRaf) { window.cancelAnimationFrame(cdTileRaf); cdTileRaf = 0; }
    if (!els.cdGrid) return;
    var cells = els.cdGrid.children;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.__cdF || c.style.zIndex) {
        c.__cdF = 0;
        c.style.removeProperty("--cd-f");
        c.style.zIndex = "";
      }
    }
  }

  function cdTileOn() {
    /* 只在真有指针（鼠标 / 笔）时开：触屏上没有 hover，滑过去就是滚动，
       这里接过来会把页面手势抢掉。用户要求少动效时也整块不装。 */
    if (!els.cdGrid || !window.matchMedia) return false;
    if (window.matchMedia("(hover:none)").matches) return false;
    if (window.matchMedia("(prefers-reduced-motion:reduce)").matches) return false;
    els.cdGrid.addEventListener("pointermove", cdTileMove);
    els.cdGrid.addEventListener("pointerleave", cdTileOff);
    els.cdGrid.addEventListener("pointercancel", cdTileOff);
    window.addEventListener("blur", cdTileOff);
    /* 滚动会让方阵从光标底下移走，但不会再触发 pointermove ——
       用记下的位置补画一帧（跟自定义指针那段的做法一致）。 */
    window.addEventListener("scroll", function () {
      if (!cdTilePt || cdTileRaf) return;
      cdTileRaf = window.requestAnimationFrame(cdTilePaint);
    }, { passive: true });
    return true;
  }
  /* 「每日 00:00 更换」——首页按钮下面用。
     2026-09-27 应作者要求两次收窄：颜色弹窗底部那句先撤掉（#cdCollect 元素
     一并移除），首页这句再删掉前半句「已收录 n / 365 个颜色」
     （集满后的「已收录 n 个颜色（集满）」一起去掉），只留刷新说明。
     连带清掉死代码：CD_TOTAL、词典里的 cdCollect / cdFull 两个键。 */
  function cdCapHTML() {
    return esc(t("cdDaily"));
  }
  function renderCdCap() {
    var s = cdCapHTML();
    if (els.cdCap) els.cdCap.innerHTML = s;
  }
  /* 色块上的字用黑还是白：按相对亮度挑，别出现蓝底黑字这种看不清的组合 */
  function cdInkOn(hex) {
    var c = cdRgbOf(hex);
    var lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    return lum > 0.55 ? "#141414" : "#f5f4f0";
  }
  function fillCdCard() {
    var t0 = cdToday();                     // 首页/弹窗共用的「今天那个颜色」
    var base = cdRich(t0, t0 && t0.i);      // 弹窗里要显示名字与由来，得用全文那版
    if (!base) return;
    var hex = String(base.hex).toUpperCase(), c = cdRgbOf(hex);
    if (els.cdSwatch) {
      els.cdSwatch.style.background = hex;
      els.cdSwatch.style.color = cdInkOn(hex);
    }
    if (els.cdSwName) els.cdSwName.textContent = cdText(base, "sw");
    if (els.cdHex) els.cdHex.textContent = hex;
    if (els.cdRgb) {
      els.cdRgb.innerHTML = [["R", c.r], ["G", c.g], ["B", c.b]].map(function (p) {
        return "<div><dt>" + p[0] + "</dt><dd>" + p[1] + "</dd></div>";
      }).join("");
    }
    if (els.cdName) els.cdName.textContent = state.lang === "en" ? (base.en || base.zh) : (base.zh || base.en);
    if (els.cdCat) els.cdCat.textContent = cdText(base, "cat");
    if (els.cdAlias) els.cdAlias.textContent = cdText(base, "alias");
    if (els.cdHist) els.cdHist.textContent = cdText(base, "hist");
    if (els.cdFun) els.cdFun.textContent = cdText(base, "fun");
    renderCdCap();
  }

  /* ---- 开关弹窗 ---- */
  function cdOpen() {
    if (!els.cdModal || els.cdModal.classList.contains("open")) return;
    fillCdCard();                     // 先填内容再显形，避免动画里闪一下空卡
    els.cdModal.classList.add("open");
    els.cdModal.setAttribute("aria-hidden", "false");
    /* 顺序不能反：得等弹窗真的显示出来（display 由 none 变 flex）才移得进焦点，
       在 display:none 的子树上调 focus() 是无效的。 */
    rememberFocus(els.cdModal);
  }
  function cdClose() {
    if (!els.cdModal || !els.cdModal.classList.contains("open")) return;
    els.cdModal.classList.remove("open");
    els.cdModal.setAttribute("aria-hidden", "true");
    restoreFocus();
  }

  /* ---- 生日礼花：点「每日颜色」时从按钮炸开 ----
     一次性 canvas，粒子放完自己摘掉；prefers-reduced-motion 直接不画。
     礼花颜色就用颜色库里的色 —— 和这个板块是同一份数据。 */
  var CD_CONF_N = 132;
  var cdConf = null;
  function cdConfettiStop() {
    if (!cdConf) return;
    if (cdConf.raf) window.cancelAnimationFrame(cdConf.raf);
    if (cdConf.cv && cdConf.cv.parentNode) cdConf.cv.parentNode.removeChild(cdConf.cv);
    cdConf = null;
  }
  /* 太暗的色（最黑的黑那种）在深色雾化层上等于看不见，做礼花时先剔掉 */
  function cdConfPalette() {
    var out = cdList().filter(function (c) {
      var r = cdRgbOf(c.hex);
      return cdRelY(r.r, r.g, r.b) >= 0.09;
    }).map(function (c) { return String(c.hex).toUpperCase(); });
    return out.length ? out : ["#f4d271"];
  }
  function cdCelebrate(host) {
    var still = false;
    try { still = window.matchMedia("(prefers-reduced-motion:reduce)").matches; } catch (e) {}
    if (still) return;                      /* 降级：不画，弹窗照常开 */
    cdConfettiStop();                       /* 连点就重开一场，别叠好几层 canvas */
    var r = host && host.getBoundingClientRect ? host.getBoundingClientRect() : null;
    var ox = r ? r.left + r.width / 2 : window.innerWidth / 2;
    var oy = r ? r.top + r.height / 2 : window.innerHeight / 2;
    var pal = cdConfPalette();

    var cv = document.createElement("canvas");
    cv.id = "cdConfetti";
    cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);

    var ps = [];
    /* delay 按「帧」记：两翼比主角晚十几帧到，听感上像两发礼炮先后响 */
    function burst(x, y, ang, spread, num, power, delayMax) {
      for (var i = 0; i < num; i++) {
        var a = ang + (Math.random() - .5) * spread;
        var v = power * (0.5 + Math.random() * 0.85);
        ps.push({
          x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          w: 5 + Math.random() * 7, h: 8 + Math.random() * 11,
          rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .34,
          col: pal[Math.floor(Math.random() * pal.length)],
          age: 0, delay: Math.random() * (delayMax || 0),
          life: 1, decay: .004 + Math.random() * .0038,
          rib: Math.random() < .3              /* 三成做成细长的飘带 */
        });
      }
    }
    /* 主角从按钮的位置向上炸开；两翼从左右下角斜着打进来 */
    burst(ox, oy, -Math.PI / 2, Math.PI * 1.08, Math.round(CD_CONF_N * .42), 12.5, 0);
    burst(0, H + 6, -Math.PI / 3.1, Math.PI * .34, Math.round(CD_CONF_N * .29), 18, 16);
    burst(W, H + 6, -(Math.PI - Math.PI / 3.1), Math.PI * .34, Math.round(CD_CONF_N * .29), 18, 16);

    var start = 0, prev = 0;
    cdConf = { cv: cv, raf: 0 };
    function frame(now) {
      if (!start) { start = now; prev = now; }
      var dt = Math.min(2.6, (now - prev) / 16.67) || 1;   /* 归一化成「60fps 下几帧」 */
      prev = now;
      ctx.clearRect(0, 0, W, H);
      var alive = 0;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (p.life <= 0) continue;
        p.age += dt;
        if (p.age < p.delay) { alive++; continue; }   /* 还没轮到它出场，但别提前收场 */
        p.vy += .24 * dt;                             /* 重力 */
        var drag = Math.pow(.985, dt);
        p.vx *= drag; p.vy *= drag;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = p.life > 1 ? 1 : p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        var hh = p.rib ? p.h * 2.2 : p.h;
        ctx.fillRect(-p.w / 2, -hh / 2, p.w, hh);
        ctx.restore();
      }
      if (alive && now - start < 4000) cdConf.raf = window.requestAnimationFrame(frame);
      else cdConfettiStop();
    }
    cdConf.raf = window.requestAnimationFrame(frame);
  }
  /* 点按钮：翻开弹窗 + 按钮自己弹一下 + 礼花 */
  function cdReveal() {
    var b = els.cdBtn;
    if (b) {
      b.classList.remove("popping");
      void b.offsetWidth;                     /* 强制重排，连点也能重放这段动画 */
      b.classList.add("popping");
      window.setTimeout(function () { b.classList.remove("popping"); }, 560);
    }
    /* 先开弹窗：全文那份（254 KB）是懒加载的，本地盘要几十毫秒、冷网更久，
       让弹窗先在「只有色号、没有名字」的状态下显形，比憋着不动体感快得多。
       全文到位后再填一次，把名字与由来补上。 */
    cdOpen();
    cdLoadFull().then(function () {
      if (els.cdModal && els.cdModal.classList.contains("open")) fillCdCard();
    });
    cdCelebrate(b);
  }

  function initColorDay() {
    var base = cdToday();
    if (!base) {                       // 色卡文件没加载出来就整块收起，别留个空框
      if (els.heroCD) els.heroCD.hidden = true;
      return;
    }
    if (els.heroCD) els.heroCD.hidden = false;
    renderCdGrid();
    renderCdCap();
    if (cdBooted) return;
    cdBooted = true;

    if (els.cdBtn) els.cdBtn.addEventListener("click", cdReveal);
    cdTileOn();                        // 磁贴（真指针 + 非 reduced-motion 才装）
    $$("#cdModal [data-cd-close]").forEach(function (n) {
      n.addEventListener("click", cdClose);
    });
    document.addEventListener("keydown", function (e) {
      if (!els.cdModal || !els.cdModal.classList.contains("open")) return;
      if (e.key === "Tab") { trapTab(e, els.cdModal); return; }
      if (e.key === "Escape") cdClose();
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    var root = document.documentElement;
    var th = "dark", lg = "zh";
    try {
      th = localStorage.getItem("cyd-theme") || th;
      lg = localStorage.getItem("cyd-lang") || lg;
    } catch (e) {}
    if (th !== "light" && th !== "dark") th = "dark";
    if (lg !== "zh" && lg !== "en") lg = "zh";
    root.setAttribute("data-theme", th);
    state.theme = th;
    state.lang = lg;

    collect();
    applyI18n();
    bindChrome();
    initColorDay();      // 块内入口：数据没到位会整块收起，不留空框
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
