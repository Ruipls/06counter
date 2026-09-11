import test from "node:test";
import assert from "node:assert/strict";
const I = await import("../src/import-detect.mjs").catch(() => ({}));
function analyze(rows) {
  assert.equal(typeof I.analyzeWorkbook, "function");
  return I.analyzeWorkbook({ sheets: [{ name: "商品表", rows }] });
}
test("自动越过说明工作表和商品表标题行", () => {
  assert.equal(typeof I.analyzeWorkbook, "function");
  const a = I.analyzeWorkbook({
    sheets: [
      { name: "使用说明", rows: [["请使用商品表"]] },
      {
        name: "价格表",
        rows: [
          ["秋季市集价目表"],
          [],
          ["编号", "产品名称", "零售价（元）"],
          [1, "贴纸", 15],
          [2, "本子", 56],
          ["合计", "", 71],
        ],
      },
    ],
  });
  assert.equal(a.sheetIndex, 1);
  assert.equal(a.header, 2);
  assert.equal(a.nameCol, 1);
  assert.equal(a.priceCol, 2);
  assert.equal(a.needsPriceChoice, false);
  assert.equal(a.entries.length, 2);
});
test("识别无表头、非前两列商品及价格", () => {
  const a = analyze(
    Array.from({ length: 30 }, (_, i) => [i + 1, "手帐", "商品" + i, 15 + i]),
  );
  assert.equal(a.header, -1);
  assert.equal(a.nameCol, 2);
  assert.equal(a.priceCol, 3);
  assert.equal(a.entries.length, 30);
});
test("清理常见货币符号、单位、全角和数值浮点尾差", () => {
  assert.equal(typeof I.importCents, "function");
  for (const v of [
    "１５．５０元",
    "人民币 15.50",
    "RMB 15.50",
    "¥ 15.50 / 件",
    "15.50元/个",
  ])
    assert.equal(I.importCents(v), 1550);
  assert.equal(I.importCents(0.1 + 0.2), 30);
  for (const v of ["15-20", "约15元", "1.234", "USD 15", -1])
    assert.throws(() => I.importCents(v));
});
test("零售价与成本价并存时识别零售价", () => {
  const a = analyze([
    ["货品名称", "成本价", "零售价"],
    ["A", 5, 15],
    ["B", 10, 30],
  ]);
  assert.equal(a.priceCol, 2);
  assert.equal(a.needsPriceChoice, false);
});
test("零售价与批发价并存时只要求一次明确选择", () => {
  const a = analyze([
    ["品名", "零售价", "批发价"],
    ["A", 15, 12],
    ["B", 30, 25],
  ]);
  assert.equal(a.needsPriceChoice, true);
  assert.deepEqual(
    a.priceOptions.map((p) => p.column),
    [1, 2],
  );
});
test("只有进价时不自动当售价", () => {
  const a = analyze([
    ["品名", "进价"],
    ["A", 15],
  ]);
  assert.equal(a.needsPriceChoice, true);
});
test("序号库存总金额不作为价格列", () => {
  const a = analyze([
    ["序号", "品名", "库存", "总金额", "售价"],
    [1, "A", 100, 1500, 15],
    [2, "B", 200, 6000, 30],
  ]);
  assert.equal(a.priceCol, 4);
  assert.equal(a.needsPriceChoice, false);
});
test("重复表头、说明和合计行不会进入商品库", () => {
  const a = analyze([
    ["品名", "售价"],
    ["A", 15],
    ["品名", "售价"],
    ["B", 20],
    ["合计", 35],
    ["备注：仅供参考", ""],
  ]);
  assert.deepEqual(
    a.entries.map((e) => e.name),
    ["A", "B"],
  );
  assert.equal(a.skipped.length, 3);
});
test("缺价和负价保留原行便于修正，不丢弃免费商品", () => {
  const a = analyze([
    ["品名", "售价"],
    ["赠品", 0],
    ["缺价", ""],
    ["负值", -1],
  ]);
  assert.equal(a.entries.length, 3);
  assert.equal(a.entries[0].price, 0);
  assert.ok(a.entries[1].error);
  assert.ok(a.entries[2].error);
});
test("名称数字可由明确表头识别", () => {
  const a = analyze([
    ["商品名称", "价格"],
    [2026, 15],
    ["001", 20],
  ]);
  assert.equal(a.entries[0].name, "2026");
  assert.equal(a.entries[1].name, "001");
});
test("只有一件商品也可识别", () => {
  const a = analyze([["贴纸套装", 15]]);
  assert.equal(a.entries.length, 1);
  assert.equal(a.entries[0].price, 1500);
  assert.equal(a.nameCol, 0);
  assert.equal(a.priceCol, 1);
});
test("保留含合计字样的正常商品名", () => {
  const a = analyze([
    ["品名", "售价"],
    ["合计贴纸", 10],
    ["备注便签", 20],
  ]);
  assert.equal(a.entries.length, 2);
});
test("多个有商品的工作表提示选择，说明表不算", () => {
  assert.equal(typeof I.analyzeWorkbook, "function");
  const a = I.analyzeWorkbook({
    sheets: [
      { name: "说明", rows: [["hello"]] },
      {
        name: "贴纸",
        rows: [
          ["品名", "售价"],
          ["A", 15],
        ],
      },
      {
        name: "手帐",
        rows: [
          ["品名", "售价"],
          ["B", 20],
        ],
      },
    ],
  });
  assert.deepEqual(
    a.sheetOptions.map((s) => s.index),
    [1, 2],
  );
});
test("修正预览内容仍执行严格名称和价格验证", () => {
  assert.equal(typeof I.validateEntry, "function");
  assert.deepEqual(I.validateEntry({ name: " 贴纸 ", priceText: "15元" }), {
    name: "贴纸",
    price: 1500,
  });
  assert.throws(() => I.validateEntry({ name: "", priceText: "15" }));
  assert.throws(() => I.validateEntry({ name: "贴纸", priceText: "-1" }));
});
test("商品备注列不应导致整件商品被自动跳过", () => {
  const a = analyze([
    ["品名", "售价", "备注"],
    ["A", 15, "备注：红色"],
    ["B", 20, "合计"],
  ]);
  assert.equal(a.entries.length, 2);
});
test("采购单价和进货价格必须明确确认", () => {
  for (const label of ["采购单价", "进货单价", "进货价格", "供货价"]) {
    const a = analyze([
      ["商品名称", label],
      ["贴纸", 5],
      ["本子", 10],
    ]);
    assert.equal(a.needsPriceChoice, true, label);
  }
});
test("商品叫产品时不能把这一行当表头丢掉前面商品", () => {
  const a = analyze([
    ["贴纸", 15],
    ["产品", 25],
    ["手帐", 56],
  ]);
  assert.equal(a.header, -1);
  assert.deepEqual(
    a.entries.map((e) => e.name),
    ["贴纸", "产品", "手帐"],
  );
});
test("确认或更换价格列保留名称修改与主动跳过", async () => {
  const { ImportPanel } = await import("../src/import-panel.mjs");
  const panel = new ImportPanel({ refresh() {} });
  panel.workbook = {
    sheets: [
      {
        rows: [
          ["品名", "零售价", "批发价"],
          ["A", 15, 12],
          ["B", 20, 18],
        ],
      },
    ],
  };
  panel.apply({ ...I.analyzeSheet(panel.workbook.sheets[0]), sheetIndex: 0 });
  panel.entries[0].name = "新名称";
  panel.entries[0].nameEdited = true;
  panel.entries[1].excluded = true;
  panel.change({ name: "importPriceChoice", value: "2" });
  assert.equal(panel.entries[0].name, "新名称");
  assert.equal(panel.entries[0].price, 1200);
  assert.equal(panel.entries[1].excluded, true);
});
