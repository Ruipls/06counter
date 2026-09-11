import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "../vendor/xlsx.full.min.js";
import * as report from "../src/report.mjs";

test("Excel preserves receipt snapshots, decimal prices, temporary amounts and text names", () => {
  assert.equal(typeof report.buildSalesWorkbook, "function");
  const orders = [
    {
      id: "order-1",
      createdAt: "2026-09-12T06:30:00Z",
      totalQuantity: 4,
      totalAmount: 2530,
      items: [
        {
          productId: "deleted-product",
          name: "=1+1",
          price: 10,
          quantity: 3,
          subtotal: 30,
        },
        {
          productId: null,
          name: "临时金额",
          price: 2500,
          quantity: 1,
          subtotal: 2500,
        },
      ],
    },
  ];
  const book = report.buildSalesWorkbook(XLSX, orders, "2026-09-12");
  const decoded = XLSX.read(
    XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
    { type: "buffer" },
  );
  const rows = XLSX.utils.sheet_to_json(decoded.Sheets["商品明细"]);
  assert.deepEqual(
    rows.map((r) => [
      r["商品名称"],
      r["单价（元）"],
      r["数量"],
      r["小计（元）"],
    ]),
    [
      ["=1+1", 0.1, 3, 0.3],
      ["临时金额", 25, 1, 25],
    ],
  );
  assert.equal(decoded.Sheets["商品明细"].C2.t, "s");
  assert.equal(decoded.Sheets["商品明细"].C2.f, undefined);
  assert.equal(
    XLSX.utils.sheet_to_json(decoded.Sheets["销售汇总"])[0]["销售总额（元）"],
    25.3,
  );
});

test("Empty day exports zero summary and readable detail headers", () => {
  assert.equal(typeof report.buildSalesWorkbook, "function");
  const book = report.buildSalesWorkbook(XLSX, [], "2026-09-12");
  assert.equal(
    XLSX.utils.sheet_to_json(book.Sheets["销售汇总"])[0]["成交笔数"],
    0,
  );
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets["商品明细"]).length, 0);
  assert.equal(book.Sheets["商品明细"].C1.v, "商品名称");
});
