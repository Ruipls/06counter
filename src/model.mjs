export const STORAGE_KEY = "06counter-checkout-v3";
const MAX_PRICE = 99999999;
const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = () => globalThis.crypto.randomUUID();
const now = () => new Date().toISOString();
export function cents(value) {
  if (value === null || value === undefined || typeof value === "boolean")
    throw Error("请输入价格");
  const text = String(value)
    .trim()
    .replace(/^[¥￥]\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))
    throw Error("价格需为非负数字，最多两位小数");
  const [whole, fraction = ""] = text.replaceAll(",", "").split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > MAX_PRICE)
    throw Error("单价最多为 ¥999,999.99");
  return result;
}
export function money(value) {
  return (value / 100)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function totals(items) {
  const result = items.reduce(
    (sum, i) => ({
      quantity: sum.quantity + i.quantity,
      amount: sum.amount + i.price * i.quantity,
    }),
    { quantity: 0, amount: 0 },
  );
  if (
    !Number.isSafeInteger(result.amount) ||
    !Number.isSafeInteger(result.quantity)
  )
    throw Error("订单金额超出范围");
  return result;
}
function nameValue(value) {
  const name = String(value ?? "").trim();
  if (!name || name.length > 80) throw Error("商品名称需为 1–80 个字");
  return name;
}
export function previewRows(rows, header, nameCol, priceCol) {
  if (nameCol === priceCol || nameCol < 0 || priceCol < 0)
    throw Error("商品名称和价格需选择不同列");
  const valid = [],
    errors = [];
  rows.slice(header + 1).forEach((row, index) => {
    if (
      row.every((v) => v === null || v === undefined || String(v).trim() === "")
    )
      return;
    try {
      valid.push({
        name: nameValue(row[nameCol]),
        price: cents(row[priceCol]),
        row: index + header + 2,
      });
    } catch (error) {
      errors.push({ row: index + header + 2, message: error.message });
    }
  });
  return { valid, errors };
}
function initialState() {
  return {
    version: 3,
    products: [],
    cart: [],
    orders: [],
    settings: { gridSize: "medium" },
    createdAt: now(),
  };
}
function validateState(s) {
  if (
    !s ||
    s.version !== 3 ||
    !Array.isArray(s.products) ||
    !Array.isArray(s.cart) ||
    !Array.isArray(s.orders) ||
    !["small", "medium", "large"].includes(s.settings?.gridSize)
  )
    throw Error("不是有效的新版数据备份");
  const validPrice = (p) => Number.isSafeInteger(p) && p >= 0 && p <= MAX_PRICE;
  const checkItems = (items) => {
    if (!Array.isArray(items)) throw Error("订单数据无效");
    items.forEach((i) => {
      if (
        !i.id ||
        typeof i.id !== "string" ||
        typeof i.name !== "string" ||
        nameValue(i.name) !== i.name ||
        !validPrice(i.price) ||
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > 9999
      )
        throw Error("订单数据无效");
    });
    if (new Set(items.map((i) => i.id)).size !== items.length)
      throw Error("订单商品标识重复");
    totals(items);
  };
  s.products.forEach((p) => {
    if (
      !p.id ||
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      nameValue(p.name) !== p.name ||
      !validPrice(p.price) ||
      !Number.isInteger(p.colSpan) ||
      p.colSpan < 1 ||
      p.colSpan > 4 ||
      !Number.isInteger(p.rowSpan) ||
      p.rowSpan < 1 ||
      p.rowSpan > 4
    )
      throw Error("商品数据无效");
  });
  if (new Set(s.products.map((p) => p.id)).size !== s.products.length)
    throw Error("商品标识重复");
  checkItems(s.cart);
  s.orders.forEach((o) => {
    checkItems(o.items);
    const t = totals(o.items);
    if (
      !o.id ||
      typeof o.id !== "string" ||
      !o.items.length ||
      !Number.isFinite(Date.parse(o.createdAt)) ||
      t.amount !== o.totalAmount ||
      t.quantity !== o.totalQuantity
    )
      throw Error("流水数据无效");
  });
  if (new Set(s.orders.map((o) => o.id)).size !== s.orders.length)
    throw Error("流水标识重复");
  return clone(s);
}
export function createStore(storage) {
  let raw = storage.getItem(STORAGE_KEY),
    state;
  if (raw !== null) {
    try {
      state = validateState(JSON.parse(raw));
    } catch {
      throw Error("本地数据无法读取，原始数据仍已保留。请先下载备份再恢复。");
    }
  } else {
    state = initialState();
    const old = storage.getItem("counter-app-v1");
    if (old) {
      try {
        const legacy = JSON.parse(old);
        state.products = (legacy.products || []).map((p, index) => ({
          id: String(p.id || uid()),
          name: nameValue(p.name),
          price: cents(p.price),
          sortOrder: index,
          createdAt: now(),
          rowSpan: Math.min(4, Math.max(1, Number(p.rowSpan) || 1)),
          colSpan: Math.min(4, Math.max(1, Number(p.colSpan) || 1)),
        }));
      } catch {
        throw Error("旧版商品数据无法迁移，请先在旧版检查或导出备份。");
      }
    }
    try {
      raw = JSON.stringify(state);
      storage.setItem(STORAGE_KEY, raw);
    } catch {
      throw Error("无法保存本地数据，请检查浏览器存储空间或隐私设置");
    }
  }
  function commit(change) {
    if (storage.getItem(STORAGE_KEY) !== raw)
      throw Error("数据已在另一个窗口更新，请刷新后继续");
    const next = clone(state),
      result = change(next);
    const serialized = JSON.stringify(next);
    try {
      storage.setItem(STORAGE_KEY, serialized);
    } catch {
      throw Error("保存失败，订单未清空。请释放设备存储空间后重试");
    }
    state = next;
    raw = serialized;
    return result;
  }
  return {
    get state() {
      return state;
    },
    addProduct(name, price) {
      return this.importProducts([
        { name: nameValue(name), price: cents(price) },
      ])[0];
    },
    importProducts(products) {
      if (!products.length) throw Error("没有可导入的商品");
      return commit((s) =>
        products.map((p) => {
          if (
            !Number.isSafeInteger(p.price) ||
            p.price < 0 ||
            p.price > MAX_PRICE
          )
            throw Error("商品价格无效");
          const product = {
            id: uid(),
            name: nameValue(p.name),
            price: p.price,
            sortOrder: s.products.length,
            createdAt: now(),
            rowSpan: 1,
            colSpan: 1,
          };
          s.products.push(product);
          return product;
        }),
      );
    },
    updateProduct(id, name, price) {
      const n = nameValue(name),
        p = cents(price);
      commit((s) => {
        const product = s.products.find((p) => p.id === id);
        if (!product) throw Error("商品不存在");
        Object.assign(product, { name: n, price: p });
      });
    },
    deleteProduct(id) {
      commit((s) => {
        s.products = s.products.filter((p) => p.id !== id);
      });
    },
    addItem(id) {
      commit((s) => {
        const p = s.products.find((p) => p.id === id);
        if (!p) throw Error("商品不存在");
        const item = s.cart.find(
          (i) => i.productId === id && i.price === p.price && i.name === p.name,
        );
        if (item) {
          if (item.quantity >= 9999) throw Error("单项数量最多为 9999");
          item.quantity++;
        } else
          s.cart.push({
            id: uid(),
            productId: id,
            name: p.name,
            price: p.price,
            quantity: 1,
          });
        totals(s.cart);
      });
    },
    addTemporary(price) {
      const amount = cents(price);
      commit((s) =>
        s.cart.push({
          id: uid(),
          productId: null,
          name: "临时金额",
          price: amount,
          quantity: 1,
        }),
      );
    },
    changeQuantity(id, delta) {
      commit((s) => {
        const i = s.cart.find((i) => i.id === id);
        if (!i) return;
        if (i.quantity + delta > 9999) throw Error("单项数量最多为 9999");
        i.quantity += delta;
        s.cart = s.cart.filter((i) => i.quantity > 0);
        totals(s.cart);
      });
    },
    removeItem(id) {
      commit((s) => {
        s.cart = s.cart.filter((i) => i.id !== id);
      });
    },
    clearCart() {
      commit((s) => {
        s.cart = [];
      });
    },
    complete() {
      return commit((s) => {
        if (!s.cart.length) throw Error("当前订单为空");
        const t = totals(s.cart);
        const order = {
          id: uid(),
          items: s.cart.map((i) => ({ ...i, subtotal: i.price * i.quantity })),
          totalAmount: t.amount,
          totalQuantity: t.quantity,
          createdAt: now(),
        };
        s.orders.unshift(order);
        s.cart = [];
        return order;
      });
    },
    setGridSize(size) {
      if (!["small", "medium", "large"].includes(size)) return;
      commit((s) => {
        s.settings.gridSize = size;
      });
    },
    resize(id, colSpan, rowSpan) {
      commit((s) => {
        const p = s.products.find((p) => p.id === id);
        if (p)
          Object.assign(p, {
            colSpan: Math.max(1, Math.min(4, colSpan)),
            rowSpan: Math.max(1, Math.min(4, rowSpan)),
          });
      });
    },
    swap(a, b) {
      commit((s) => {
        const x = s.products.findIndex((p) => p.id === a),
          y = s.products.findIndex((p) => p.id === b);
        if (x < 0 || y < 0) return;
        [s.products[x], s.products[y]] = [s.products[y], s.products[x]];
        s.products.forEach((p, i) => (p.sortOrder = i));
      });
    },
    resetLayout() {
      commit((s) => {
        s.products.forEach((p) => {
          p.rowSpan = 1;
          p.colSpan = 1;
        });
        s.settings.gridSize = "medium";
      });
    },
    clear(scope) {
      commit((s) => {
        if (scope === "products") s.products = [];
        else if (scope === "orders") s.orders = [];
        else if (scope === "all") Object.assign(s, initialState());
        else throw Error("无效的清空范围");
      });
    },
    restore(data) {
      const valid = validateState(data);
      commit((s) => Object.assign(s, valid));
    },
  };
}
export function dayOrders(orders, date) {
  return orders
    .filter((o) => localDate(new Date(o.createdAt)) === date)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export function daySummary(orders) {
  return orders.reduce(
    (s, o) => ({
      amount: s.amount + o.totalAmount,
      quantity: s.quantity + o.totalQuantity,
      count: s.count + 1,
    }),
    { amount: 0, quantity: 0, count: 0 },
  );
}
