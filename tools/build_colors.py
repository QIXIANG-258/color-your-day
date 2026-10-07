# -*- coding: utf-8 -*-
"""把 data/*.json 编译成 assets/js/colors_data.js（Color Your Day · 独立版）

站点只读编译产物，所以**改颜色改 json，别改 colors_data.js**。

源：    data/*.json（一个分类一个文件，共四个；人改的源）
产物：  assets/js/colors_data.js —— 单文件、365 条**全文**（含 hex 与全部文案）

为什么独立版只有一个产物文件：
  摄影站做「索引层 + 按需全文」两段式，是为了保住**首屏**体积（首页还有
  照片墙、字体、色卡之外的一堆东西要抢带宽）。这个独立页只有方阵一个内容，
  数据就是全部，没有"首屏预算"要守 —— 两层只会白白增加复杂度。
  所以这里编译出**一份全文数组**，window.QB_COLORS 直接就是它。

编译：  python tools/build_colors.py
体检：  python tools/build_colors.py --check     （产物与源不一致时退出码 1）
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "data")
OUT = os.path.join(ROOT, "assets", "js", "colors_data.js")

# 编译顺序 = 首页每日轮换的顺序
FILES = [
    "western_pigments.json",
    "chinese_traditional.json",
    "brand_named.json",
    "story_colors.json",
]

# 允许出现的字段（写错字段名会被拦下来，免得写了半天不生效）
ITEM_KEYS = [
    "id", "zh", "en", "hex",
    "swZh", "swEn", "aliasZh", "aliasEn",
    "histZh", "histEn", "funZh", "funEn",
]
# 输出时保留这个顺序（catZh / catEn 由分类文件统一注入）
ITEM_ORDER = ITEM_KEYS + ["catZh", "catEn"]

HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

HEAD = """/* 「Color Your Day」每日颜色 —— 色卡数据
   ================================================================
   ⚠ 本文件由脚本生成，不要手改 —— 下次编译会整份覆盖。

   源数据：data/*.json（一个分类一个文件，共四个）
   编译：  python tools/build_colors.py
   加颜色：改 json 里的 items 数组，再跑一次编译。数组顺序 = 每日轮换顺序。

   一条颜色支持这些字段，除 id / zh / en / hex 外都可省：
     zh / en            中文名 / 英文名（详情页大标题）
     hex                色号 #RRGGBB，唯一必填。方阵的明暗、RGB 都从它算出来
     swZh / swEn        压在色块里的那行小字（别名 / 年份这类短标签）
     aliasZh / aliasEn  名字下面那行补充说明
     histZh / histEn    历史
     funZh / funEn      趣闻
     catZh / catEn      分类名，由分类文件统一注入

   换色规则：按「日历日」轮，顺序就是这里的书写顺序。
   同一天永远是同一个颜色（刷新、换设备都一样），跨过 00:00 才换下一个。

   ⚠⚠ 库里的条数不得少于 64：方阵每格是「整轮洗牌抽出来的」，
      库不足 64 时必有格子重复、还可能挨在一起。
      现库 365 条，「一年 365 天一天一个不重样」也成立。
   ================================================================ */
window.QB_COLORS = [
"""


def js_str(s):
    """JSON 字符串就是合法的 JS 字符串；只需把 JS 里非法的行分隔符转掉。"""
    out = json.dumps(s, ensure_ascii=False)
    return out.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def load():
    """读出四个分类文件，返回 (items, errors, warnings)。"""
    items, errors, warnings = [], [], []
    for fn in FILES:
        p = os.path.join(SRC_DIR, fn)
        if not os.path.exists(p):
            errors.append("%s：文件不存在" % fn)
            continue
        with io.open(p, encoding="utf-8") as fh:
            try:
                doc = json.load(fh)
            except ValueError as e:
                errors.append("%s：JSON 语法错误 — %s" % (fn, e))
                continue

        cat = doc.get("cat")
        cat_zh, cat_en = doc.get("catZh"), doc.get("catEn")
        if not (cat and cat_zh and cat_en):
            errors.append("%s：缺 cat / catZh / catEn" % fn)
            continue

        rows = doc.get("items")
        if not isinstance(rows, list) or not rows:
            errors.append("%s：items 不是非空数组" % fn)
            continue

        for i, raw in enumerate(rows):
            where = "%s[%d]" % (fn, i)
            it = dict(raw)
            bad = [k for k in it if k not in ITEM_KEYS]
            if bad:
                errors.append("%s：不认识的字段 %s（对照 ITEM_KEYS）" % (where, ", ".join(bad)))
                continue
            miss = [k for k in ("id", "zh", "en", "hex") if not it.get(k)]
            if miss:
                errors.append("%s：缺必填 %s" % (where, ", ".join(miss)))
                continue
            if not ID_RE.match(it["id"]):
                errors.append("%s：id 只能用小写字母/数字/短横线（%s）" % (where, it["id"]))
                continue
            if not HEX_RE.match(it["hex"]):
                errors.append("%s：hex 得是 #RRGGBB 形式（%s）" % (where, it["hex"]))
                continue
            it["hex"] = it["hex"].upper()
            it["catZh"], it["catEn"] = cat_zh, cat_en
            items.append((cat, where, it))

    # 跨文件查重
    seen_id, seen_hex, seen_zh, seen_en = {}, {}, {}, {}
    for cat, where, it in items:
        if it["id"] in seen_id:
            errors.append("id 重复：%s 在 %s 和 %s 都出现了" % (it["id"], seen_id[it["id"]], where))
        else:
            seen_id[it["id"]] = where
        if it["zh"] in seen_zh:
            errors.append("中文名重复：%s 在 %s 和 %s 都出现了" % (it["zh"], seen_zh[it["zh"]], where))
        else:
            seen_zh[it["zh"]] = where
        if it["en"] in seen_en:
            warnings.append("英文名重复：%s（%s / %s）—— 故意的话没问题"
                            % (it["en"], seen_en[it["en"]], where))
        else:
            seen_en[it["en"]] = where
        seen_hex.setdefault(it["hex"], []).append(it["id"])

    for hexv, ids in seen_hex.items():
        if len(ids) > 1:
            warnings.append("%s 被两条颜色共用（%s）—— 故意的话没问题" % (hexv, "、".join(ids)))

    return items, errors, warnings


def render(items):
    """单文件全文：全部字段按固定顺序输出（hex 就地保留，不再分两层）。"""
    parts = []
    for cat, where, it in items:
        lines = []
        for k in ITEM_ORDER:
            v = it.get(k)
            if v:
                lines.append("    %s: %s" % (k, js_str(v)))
        parts.append("  {\n" + ",\n".join(lines) + "\n  }")
    return HEAD + ",\n".join(parts) + "\n];\n"


def kb(s):
    return len(s.encode("utf-8")) / 1024.0


def write_if_changed(path, text):
    """内容没变就不碰文件 —— 避免每次编译都无谓地改 mtime。"""
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    old = ""
    if os.path.exists(path):
        with io.open(path, encoding="utf-8") as fh:
            old = fh.read()
    if old == text:
        return False
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    return True


def check_app_contract(text):
    """app.js 契约自检 —— 编译器必须立一道机器判据，拦住「静默少一块」这类错。

    独立版里 QB_COLORS 是**全文对象数组**（与摄影站的两层不同），
    所以这里查的契约也随之变化。
    """
    path = os.path.join(ROOT, "assets", "js", "app.js")
    if not os.path.exists(path):
        return []
    src = io.open(path, encoding="utf-8").read()
    problems = []

    # cdList 必须认「对象数组」这个形状（有 hex 就收）
    if "else if (c.hex)" not in src:
        problems.append('cdList() 似乎不认对象形状（找不到 else if (c.hex)）')
    # 「今天是第几个」必须按下标走到底 —— 库里有两条颜色共用 #0ABAB5（作者有意保留），
    # 按 hex 反查永远命中靠前那个，弹窗名字会错位。
    if "function cdRich(c, idx)" not in src:
        problems.append("cdRich() 不是按下标取全文（签名应为 cdRich(c, idx)）")
    if "function cdIndexOf" in src:
        problems.append("还有 cdIndexOf() —— 按 hex 反查会在重复色号上错位，应改成按下标")
    # 调用点兼容：cdReveal() 里的 cdLoadFull().then(...) 必须有人接
    if "function cdLoadFull" not in src:
        problems.append("缺 cdLoadFull() —— cdReveal() 还在调它，删了会直接抛错")
    # 库必须够 64：方阵一格一色的前提
    if len(items_for_contract) < 64:
        problems.append("色库只有 %d 条 —— 不足 64，方阵必然有格子重复" % len(items_for_contract))
    return problems


items_for_contract = []


def main():
    global items_for_contract
    want_check = "--check" in sys.argv
    items, errors, warnings = load()
    items_for_contract = [it for _c, _w, it in items]

    print("== 数据体检 ==")
    for w in warnings:
        print("  ! " + w)
    if errors:
        for e in errors:
            print("  x " + e)
        print("\n%d 个问题，未写盘。" % len(errors))
        return 1
    if not warnings:
        print("  (无告警)")

    js = render(items)

    counts = {}
    for cat, where, it in items:
        counts.setdefault(cat, []).append(it)

    print("\n== 分类统计 ==")
    for fn in FILES:
        with io.open(os.path.join(SRC_DIR, fn), encoding="utf-8") as fh:
            doc = json.load(fh)
        n = len(counts.get(doc["cat"], []))
        print("  %-26s %-14s %2d 条" % (fn, doc["catZh"], n))
    print("  %-26s %-14s %2d 条" % ("合计", "", len(items)))

    if want_check:
        old = ""
        if os.path.exists(OUT):
            old = io.open(OUT, encoding="utf-8").read()
        if old == js:
            print("\n--check：产物与源数据一致。")
            return 0
        print("\n--check：产物与源数据不一致，需要重新编译。")
        return 1

    # 顺序一致性自检：hex 条数必须等于条目数（方阵的「今日色」按下标算）
    assert len(re.findall(r'"#[0-9A-F]{6}"', js)) >= len(items), "产物里 hex 条数不对"
    assert js.count("\n  {") == len(items), "产物条数不对"

    problems = check_app_contract(js)
    if problems:
        print("\n!! app.js 契约对不上：")
        for p in problems:
            print("   x " + p)
        print("   未写盘。")
        return 2

    changed = write_if_changed(OUT, js)
    print("\n%s %s（%.1f KB）" % ("已写出" if changed else "未变化",
                                  os.path.relpath(OUT, ROOT), kb(js)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
