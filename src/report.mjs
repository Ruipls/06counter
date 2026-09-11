import { daySummary, localDate } from "./model.mjs";
import { loadScript, download } from "./utils.mjs";

// Use the saved receipt snapshots, never the current product catalogue.
export function buildSalesWorkbook(XLSX, orders, date) {
  const book = XLSX.utils.book_new();
  const summary = daySummary(orders);
  const time = (value) => {
    const d = new Date(value);
    return `${localDate(d)} ${[d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":")}`;
  };
  const append = (name, rows, widths, moneyColumns) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = widths.map((wch) => ({ wch }));
    sheet["!autofilter"] = { ref: sheet["!ref"] };
    for (let r = 1; r < rows.length; r++) {
      for (const c of moneyColumns) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.z = "0.00";
      }
    }
    XLSX.utils.book_append_sheet(book, sheet, name);
  };
  append(
    "销售汇总",
    [
      ["日期", "销售总额（元）", "成交笔数", "商品总件数"],
      [date, summary.amount / 100, summary.count, summary.quantity],
    ],
    [14, 20, 14, 16],
    [1],
  );
  append(
    "订单流水",
    [
      ["订单编号", "成交时间", "商品总件数", "订单金额（元）"],
      ...orders.map((o) => [
        o.id,
        time(o.createdAt),
        o.totalQuantity,
        o.totalAmount / 100,
      ]),
    ],
    [40, 23, 16, 20],
    [3],
  );
  append(
    "商品明细",
    [
      ["订单编号", "成交时间", "商品名称", "单价（元）", "数量", "小计（元）"],
      ...orders.flatMap((o) =>
        o.items.map((item) => [
          o.id,
          time(o.createdAt),
          item.name,
          item.price / 100,
          item.quantity,
          (item.price * item.quantity) / 100,
        ]),
      ),
    ],
    [40, 23, 32, 16, 10, 18],
    [3, 5],
  );
  return book;
}

export async function exportExcel(orders, date) {
  await loadScript("../vendor/xlsx.full.min.js");
  const XLSX = globalThis.XLSX;
  const book = buildSalesWorkbook(XLSX, orders, date);
  download(
    XLSX.write(book, { type: "array", bookType: "xlsx", compression: true }),
    `06counter-销售流水-${date}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
