import test from "node:test";
import assert from "node:assert/strict";
const M = await import("../src/model.mjs").catch(() => ({}));
const memory = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
};
test("金额以分精确计算且拒绝非法值", () => {
  assert.equal(typeof M.cents, "function");
  assert.equal(M.cents("0.10") + M.cents("0.20"), 30);
  assert.equal(M.cents("￥1,286.50"), 128650);
  for (const value of ["", null, -1, "1.234", "abc", Infinity, "1e3", "1,2"])
    assert.throws(() => M.cents(value));
});
test("重复点击、临时项、数量减少和收款快照", () => {
  assert.equal(typeof M.createStore, "function");
  const store = M.createStore(memory());
  const a = store.addProduct("贴纸套装", "15"),
    b = store.addProduct("手帐 A", "56");
  store.addItem(a.id);
  store.addItem(a.id);
  store.addItem(b.id);
  assert.deepEqual(M.totals(store.state.cart), { quantity: 3, amount: 8600 });
  store.addTemporary("25");
  assert.equal(M.totals(store.state.cart).amount, 11100);
  store.changeQuantity(store.state.cart.at(-1).id, -1);
  const order = store.complete();
  assert.equal(order.totalAmount, 8600);
  assert.equal(order.totalQuantity, 3);
  assert.equal(store.state.cart.length, 0);
  assert.equal(store.state.orders.length, 1);
  assert.throws(() => store.complete());
  assert.equal(store.state.orders.length, 1);
  store.updateProduct(a.id, "新贴纸", "20");
  assert.equal(order.items[0].price, 1500);
});
test("刷新恢复未完成订单，删除商品不改变订单快照", () => {
  assert.equal(typeof M.createStore, "function");
  const storage = memory(),
    store = M.createStore(storage);
  const p = store.addProduct("A", "0.10");
  store.addItem(p.id);
  store.deleteProduct(p.id);
  const reloaded = M.createStore(storage);
  assert.equal(reloaded.state.cart[0].name, "A");
  assert.equal(reloaded.complete().totalAmount, 10);
});
test("持久化失败不清空当前订单也不产生成功流水", () => {
  assert.equal(typeof M.createStore, "function");
  const storage = memory(),
    store = M.createStore(storage);
  const p = store.addProduct("A", "10");
  store.addItem(p.id);
  storage.setItem = () => {
    throw Error("quota");
  };
  assert.throws(() => store.complete(), /保存/);
  assert.equal(store.state.cart.length, 1);
  assert.equal(store.state.orders.length, 0);
});
test("旧版仅迁移商品/尺寸，旧记录和激活键不变", () => {
  assert.equal(typeof M.createStore, "function");
  const storage = memory(),
    legacy = JSON.stringify({
      products: [
        { id: "p1", name: "原商品", price: 15, rowSpan: 2, colSpan: 2 },
      ],
      history: { yesterday: {} },
      todayCounts: { p1: 5 },
    });
  storage.setItem("counter-app-v1", legacy);
  storage.setItem("counter-pro-activated", "true");
  const store = M.createStore(storage);
  assert.equal(store.state.products[0].price, 1500);
  assert.equal(store.state.products[0].rowSpan, 2);
  assert.equal(store.state.orders.length, 0);
  assert.equal(storage.getItem("counter-app-v1"), legacy);
  assert.equal(storage.getItem("counter-pro-activated"), "true");
});
test("导入预览逐行报告错误且不丢弃 0 元", () => {
  assert.equal(typeof M.previewRows, "function");
  const r = M.previewRows(
    [
      ["品名", "售价"],
      ["贴纸", 15],
      ["赠品", 0],
      ["缺价", ""],
      ["负值", -1],
      ["", 10],
      ["", ""],
    ],
    0,
    0,
    1,
  );
  assert.equal(r.valid.length, 2);
  assert.equal(r.errors.length, 3);
  assert.equal(r.valid[1].price, 0);
  assert.throws(() => M.previewRows([["a"]], 0, 0, 0));
});
test("日期筛选、备份恢复验证和无效存储保护", () => {
  assert.equal(typeof M.createStore, "function");
  const storage = memory(),
    store = M.createStore(storage);
  store.addProduct("A", 1);
  const backup = JSON.parse(JSON.stringify(store.state));
  store.clear("products");
  store.restore(backup);
  assert.equal(store.state.products.length, 1);
  assert.throws(() => store.restore({ version: 3, products: [] }));
  assert.equal(M.localDate(new Date(2026, 8, 11, 0, 1)), "2026-09-11");
  storage.setItem(M.STORAGE_KEY, "broken");
  assert.throws(() => M.createStore(storage));
});
test("无表头多行表格仍提供第三列和第四列映射", async () => {
  const I = await import("../src/import.mjs");
  assert.equal(typeof I.columnCount, "function");
  assert.equal(
    I.columnCount(
      Array.from({ length: 30 }, () => ["a", "b", "品名", 15]),
      -1,
    ),
    4,
  );
});

test("删除单笔流水持久化且不影响其他订单和当前购物车", () => {
  const storage = memory(),
    store = M.createStore(storage);
  store.addTemporary("15");
  const first = store.complete();
  store.addTemporary("56");
  const second = store.complete();
  store.addTemporary("25");
  assert.equal(typeof store.deleteOrder, "function");
  store.deleteOrder(first.id);
  const restored = M.createStore(storage);
  assert.deepEqual(
    restored.state.orders.map((o) => o.id),
    [second.id],
  );
  assert.deepEqual(M.daySummary(restored.state.orders), {
    amount: 5600,
    count: 1,
    quantity: 1,
  });
  assert.equal(restored.state.cart[0].price, 2500);
  storage.setItem = () => {
    throw Error("quota");
  };
  assert.throws(() => store.deleteOrder(second.id), /保存/);
  assert.equal(store.state.orders.length, 1);
});
