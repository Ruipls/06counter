import { cents, money } from "./model.mjs";
const text = (value) =>
  value instanceof Date
    ? ""
    : String(value ?? "")
        .normalize("NFKC")
        .trim();
const label = (value) =>
  text(value)
    .toLowerCase()
    .replace(/[\s_\-:：()（）/¥￥]/g, "")
    .replace(/(?:人民币|rmb|cny|元)$/, "");
function nameRole(value) {
  return /^(?:商品名称|商品名|产品名称|产品名|货品名称|货品名|货品|商品|产品|品名|名称|宝贝名称|物品名称|项目名称|productname|itemname|description|product|item|name)$/.test(
    label(value),
  );
}
function priceRole(value) {
  const s = label(value);
  if (/成本|进价|采购|进货|供货|拿货|cost|purchase/.test(s)) return "cost";
  if (
    /库存|数量|序号|编号|条码|货号|sku|数量|总价|总金额|合计|小计|销售额|成交金额|折扣|折后|优惠|会员|活动价|促销|编号|quantity|stock|total|amount|discount|code|^id$/.test(
      s,
    )
  )
    return "excluded";
  if (/零售|建议售价|建议零售|retail|rrp/.test(s)) return "retail";
  if (/批发|wholesale/.test(s)) return "wholesale";
  if (
    /^(?:价格|售价|单价|销售价|销售单价|售卖价|售卖单价|定价|price|unitprice|saleprice|sellingprice)$/.test(
      s,
    )
  )
    return "sale";
  return "";
}
export function importCents(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    const rounded = Math.round(value * 100);
    if (Math.abs(value * 100 - rounded) < 1e-7)
      return cents((rounded / 100).toFixed(2));
  }
  const s = text(value)
    .replace(/^(?:人民币|RMB|CNY)\s*/i, "")
    .replace(/\s*(?:元)?\s*[/／]\s*(?:件|个|本|套|张|份|盒|包|枚|卷)$/, "")
    .replace(/\s*元$/, "")
    .trim();
  return cents(s);
}
export function validateEntry(entry) {
  const name = String(entry.name ?? "").trim();
  if (!name || name.length > 80) throw Error("商品名称需为 1–80 个字");
  return { name, price: importCents(entry.priceText) };
}
const parsed = (value) => {
  try {
    return importCents(value);
  } catch {
    return null;
  }
};
function profiles(rows, start) {
  const sample = rows
      .slice(start)
      .filter((row) => row.some((v) => text(v)))
      .slice(0, 150),
    width = Math.max(2, ...sample.map((r) => r.length));
  return Array.from({ length: width }, (_, column) => {
    const values = sample
        .map((row) => row[column])
        .filter((v) => text(v) !== ""),
      n = values.length || 1,
      numeric = values.filter((v) => parsed(v) !== null),
      words = values.filter(
        (v) => parsed(v) === null && !/^\d+$/.test(text(v)),
      );
    const sequential =
      numeric.length > 2 &&
      [0, 100].includes(parsed(numeric[0])) &&
      numeric
        .slice(1)
        .every((v, i) => parsed(v) === parsed(numeric[0]) + (i + 1) * 100);
    return {
      column,
      valid: numeric.length,
      nameScore:
        (words.length / n) * 30 + (new Set(words.map(text)).size / n) * 20,
      priceScore: (numeric.length / n) * 50 - (sequential ? 35 : 0),
      examples: values.slice(0, 3).map(text),
    };
  });
}
export function extractEntries(rows, header, nameCol, priceCol) {
  const entries = [],
    skipped = [];
  rows.slice(header + 1).forEach((row, i) => {
    const rowNumber = i + header + 2,
      values = row.map(text),
      name = String(row[nameCol] ?? "").trim(),
      rawPrice = row[priceCol],
      priceText = text(rawPrice);
    let reason = "";
    if (values.every((v) => !v)) reason = "空行";
    else if (nameRole(name) && priceRole(rawPrice)) reason = "重复表头";
    else if (
      [name || values.find(Boolean) || ""].some((v) =>
        /^(?:合计|小计|总计|总金额|总数量|总件数|总额|total|subtotal)(?:\s*[:：]\s*.*)?$/i.test(
          v,
        ),
      )
    )
      reason = "合计行";
    else if (
      [name || values.find(Boolean) || ""].some((v) =>
        /^(?:备注|说明|温馨提示|注意事项|注)\s*[:：]/.test(v),
      )
    )
      reason = "说明行";
    else if (
      values.filter(Boolean).length === 1 &&
      /价目表|价格表|商品清单/.test(values.find(Boolean))
    )
      reason = "标题行";
    if (reason) {
      skipped.push({ row: rowNumber, reason });
      return;
    }
    const entry = { row: rowNumber, name, priceText, excluded: false };
    try {
      const result = validateEntry({ ...entry, priceText: rawPrice });
      entry.name = result.name;
      entry.price = result.price;
      entry.priceText = money(result.price);
    } catch (error) {
      entry.error = error.message;
    }
    entries.push(entry);
  });
  return { entries, skipped };
}
export function analyzeSheet(sheet) {
  const rows = sheet.rows;
  let header = -1,
    headerScore = 0;
  rows.slice(0, 40).forEach((row, index) => {
    const hasName = row.some(nameRole),
      hasPrice = row.some((v) =>
        ["sale", "retail", "wholesale", "cost"].includes(priceRole(v)),
      );
    const score = (hasName ? 100 : 0) + (hasPrice ? 50 : 0);
    if (hasName && hasPrice && score > headerScore) {
      header = index;
      headerScore = score;
    }
  });
  const labels = header >= 0 ? rows[header] : [],
    stats = profiles(rows, header + 1);
  const names = stats
    .map((s) => ({
      ...s,
      score:
        s.nameScore +
        (nameRole(labels[s.column]) ? 100 : 0) -
        (priceRole(labels[s.column]) ? 100 : 0) -
        (/序号|货号|编号|条码|sku|code|^id$/i.test(label(labels[s.column]))
          ? 80
          : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const nameCol = names[0]?.column ?? 0;
  const prices = stats
    .filter((s) => s.column !== nameCol)
    .map((s) => ({
      ...s,
      role: priceRole(labels[s.column]),
      label: text(labels[s.column]) || `第 ${s.column + 1} 列`,
      score:
        s.priceScore +
        (["sale", "retail", "wholesale"].includes(priceRole(labels[s.column]))
          ? 100
          : 0) -
        (priceRole(labels[s.column]) === "excluded" ? 200 : 0) -
        (priceRole(labels[s.column]) === "cost" ? 20 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  let priceOptions = prices.filter((s) =>
    ["sale", "retail", "wholesale"].includes(s.role),
  );
  if (!priceOptions.length)
    priceOptions = prices.filter(
      (s) => s.role !== "excluded" && (s.valid > 0 || s.role === "cost"),
    );
  if (!priceOptions.length) priceOptions = prices.slice(0, 1);
  // Nearby unlabeled numeric candidates remain a choice, never silently use stock as price.
  if (priceOptions.length > 1 && !priceOptions.some((s) => s.role))
    priceOptions = priceOptions.filter(
      (s) => priceOptions[0].score - s.score < 20,
    );
  const choice = priceOptions[0],
    priceCol = choice?.column ?? (nameCol === 0 ? 1 : 0);
  const { entries, skipped } = extractEntries(rows, header, nameCol, priceCol);
  const validCount = entries.filter((e) => !e.error).length;
  return {
    header,
    nameCol,
    priceCol,
    priceOptions,
    entries,
    skipped,
    needsPriceChoice:
      priceOptions.length > 1 ||
      choice?.role === "cost" ||
      !choice ||
      choice.role === "excluded" ||
      choice.valid === 0,
    needsNameChoice:
      !nameRole(labels[nameCol]) &&
      (names[0]?.score < 35 ||
        (names[1] && names[0].score - names[1].score < 8)),
    rank: validCount
      ? headerScore +
        Math.min(validCount, 100) +
        Math.max(0, names[0]?.score || 0)
      : 0,
  };
}
export function analyzeWorkbook(workbook) {
  const analyses = workbook.sheets.map((sheet, index) => ({
    ...analyzeSheet(sheet),
    sheetIndex: index,
  }));
  const candidates = analyses
    .filter((a) => a.rank > 0)
    .sort((a, b) => b.rank - a.rank);
  const best = candidates[0] || analyses[0];
  return {
    ...best,
    sheetOptions: candidates
      .map((a) => ({
        index: a.sheetIndex,
        name: workbook.sheets[a.sheetIndex].name,
        count: a.entries.length,
      }))
      .sort((a, b) => a.index - b.index),
  };
}
