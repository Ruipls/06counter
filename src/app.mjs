import {
  createStore,
  STORAGE_KEY,
  money,
  totals,
  localDate,
  dayOrders,
  daySummary,
} from "./model.mjs";
import { escapeHTML as esc, download } from "./utils.mjs";
import { ImportPanel } from "./import-panel.mjs";
const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  settings:
    "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  bag: "M5 7h14l1 14H4L5 7z M9 8V6a3 3 0 0 1 6 0v2",
  receipt: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7",
  cash: "M5 3h14v5H5z M7 8v13h10V8 M10 12h4 M10 16h4",
  cart: "M2 3h3l3 13h11l3-9H6 M10 21h.01 M18 21h.01",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  plus: "M12 5v14 M5 12h14",
  close: "M6 6l12 12 M18 6L6 18",
  check: "M5 12l4 4L19 6",
  trash: "M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6",
  more: "M4 12h.01 M12 12h.01 M20 12h.01",
  upload: "M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6",
  download: "M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4",
  excel:
    "M8 3h12v18H8 M8 8h12 M8 13h12 M14 3v18 M2 7h9v11H2z M4 10l5 5 M9 10l-5 5",
  resize: "M9 20h11V9 M14 20h6v-6",
  undo: "M8 4L3 9l5 5 M3 9h11a6 6 0 0 1 0 12",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.bag}"/></svg>`;
const button = (label, action, classes = "btn btn-primary", extra = "") =>
  `<button class="${classes}" data-action="${action}" ${extra}>${label}</button>`;
const iconButton = (name, label, action, extra = "") =>
  button(
    icon(name),
    action,
    "icon-btn",
    `aria-label="${label}" title="${label}" ${extra}`,
  );
const app = document.querySelector("#app"),
  dialog = document.querySelector("#dialog");
let store,
  page = "cash",
  editing = false,
  selectedDate = localDate(),
  lastOrder = null,
  query = "";
let toastTimer;
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4200);
}
function top(title, left = "", right = "") {
  return `<header><div class="header-side">${left}</div><h1>${title}</h1><div class="header-side">${right}</div></header>`;
}
function nav() {
  return `<nav class="bottom-nav" aria-label="主导航">${[
    ["cash", "cash", "收银"],
    ["products", "bag", "商品"],
    ["ledger", "receipt", "流水"],
  ]
    .map(([id, i, name]) =>
      button(
        `${icon(i)}<span>${name}</span>`,
        "navigate",
        "nav-item " +
          (page === id || (page === "success" && id === "cash")
            ? "active"
            : ""),
        `data-page="${id}" ${page === id ? 'aria-current="page"' : ""}`,
      ),
    )
    .join("")}</nav>`;
}
function sizeControl() {
  return `<div class="size-control"><span>宫格大小</span><div class="segments" aria-label="宫格大小">${[
    ["small", "小"],
    ["medium", "中"],
    ["large", "大"],
  ]
    .map(([size, label]) =>
      button(
        label,
        "size",
        store.state.settings.gridSize === size ? "active" : "",
        `data-size="${size}" aria-pressed="${store.state.settings.gridSize === size}"`,
      ),
    )
    .join("")}</div></div>`;
}
function empty(i, title, description, action = "") {
  return `<div class="empty"><div class="empty-icon">${icon(i)}</div><h2>${title}</h2><p>${description}</p>${action}</div>`;
}
function go(next) {
  if (page === "import" && next !== "import") importer.reset();
  page = next;
  if (next !== "cash") editing = false;
  render();
}
function render() {
  if (
    ["order", "bill"].includes(page) &&
    !store.state.cart.length &&
    page === "bill"
  )
    page = "order";
  const renderers = {
    cash: renderCash,
    products: renderProducts,
    order: renderOrder,
    bill: renderBill,
    success: renderSuccess,
    ledger: renderLedger,
    settings: renderSettings,
    import: renderImport,
  };
  app.innerHTML = renderers[page]();
  if (page === "cash" && editing) attachGridGestures();
  requestAnimationFrame(() => {
    fitCartAmount();
    if (page === "bill") fitBill();
  });
}
function cartBar() {
  const t = totals(store.state.cart);
  return t.quantity
    ? `<div class="cart-bar"><div class="cart-symbol">${icon("cart")}<span class="badge">${t.quantity > 99 ? "99+" : t.quantity}</span></div><div class="cart-info"><span class="count">${t.quantity}件</span><strong class="number">¥${money(t.amount)}</strong></div>${button("去结算", "navigate", "btn btn-primary", 'data-page="order"')}</div>`
    : "";
}
function renderCash() {
  const s = store.state.settings.gridSize,
    cols = { small: 4, medium: 3, large: 2 }[s];
  return `<header class="checkout-head">${editing ? "<span></span>" : button(icon("plus") + "临时金额", "temporary", "text-btn muted")}${iconButton("settings", "设置", "navigate", 'data-page="settings"')}</header><main class="page cash-page"><div class="toolbar">${sizeControl()}${button(icon(editing ? "check" : "grid") + (editing ? "完成编辑" : "编辑宫格"), "edit-grid", "text-btn blue")}</div>${editing ? '<p class="edit-note">长按卡片拖动换位，拖动右下角调整大小。<br>轻点卡片也可设置尺寸与位置。</p>' : ""}${store.state.products.length ? `<div class="product-grid ${s} ${editing ? "editing" : ""}" style="--cols:${cols}" id="productGrid">${store.state.products.map((p) => `<button class="product-card" data-action="product-tap" data-id="${esc(p.id)}" style="grid-column:span ${Math.min(cols, p.colSpan)};grid-row:span ${p.rowSpan}" aria-label="${esc(p.name)}，¥${money(p.price)}${editing ? "，编辑布局" : ""}"><span class="product-name">${esc(p.name)}</span><span class="product-price number">¥${money(p.price)}</span>${editing ? `<span class="resize-handle">${icon("resize")}</span>` : ""}</button>`).join("")}</div>` : empty("grid", "把商品表变成收银台", "导入商品和价格，然后像按计算器一样点商品。", button(icon("upload") + "导入 Excel 商品", "start-import") + button("手动添加商品", "add-product", "text-btn blue sub-link"))}</main>${editing ? "" : cartBar()}${nav()}`;
}
function renderOrder() {
  const t = totals(store.state.cart);
  return `${top("当前订单", iconButton("left", "继续加商品", "navigate", 'data-page="cash"'), store.state.cart.length ? iconButton("trash", "清空当前订单", "clear-cart") : "")}<main class="page order-page">${store.state.cart.length ? store.state.cart.map((i) => `<div class="order-row"><div><div class="item-name">${esc(i.name)}</div><div class="item-price">¥${money(i.price)}</div></div><div class="stepper">${button("−", "quantity", "", `data-id="${esc(i.id)}" data-delta="-1" aria-label="减少 ${esc(i.name)}"`)}<b>${i.quantity}</b>${button("＋", "quantity", "", `data-id="${esc(i.id)}" data-delta="1" aria-label="增加 ${esc(i.name)}"`)}</div><div class="row-end"><strong class="number">¥${money(i.price * i.quantity)}</strong>${button("删除", "remove-item", "", `data-id="${esc(i.id)}" aria-label="删除 ${esc(i.name)}"`)}</div></div>`).join("") : empty("cart", "当前订单为空", "返回收银页点击商品，或添加一笔临时金额。")}${button(icon("plus") + "添加临时金额", "temporary", "btn btn-soft full add-temporary")}</main><footer class="order-footer"><div class="total-row"><span>共 ${t.quantity} 件</span><strong class="number">¥${money(t.amount)}</strong></div><div class="button-pair">${button("继续加商品", "navigate", "btn btn-secondary", 'data-page="cash"')}${button("去结算", "navigate", "btn btn-primary", `data-page="bill" ${t.quantity ? "" : "disabled"}`)}</div></footer>`;
}
function renderBill() {
  const t = totals(store.state.cart);
  return `${top("", button(icon("left") + "返回修改", "navigate", "text-btn", 'data-page="order"'), "")}<main class="page bill-page"><div class="bill-unit">应收金额 / 元</div><div class="calculation number" style="margin-top:20px">${store.state.cart.map((i) => `${money(i.price)}${i.quantity > 1 ? " × " + i.quantity : ""}`).join(" + ")}</div><div class="bill-total" aria-label="合计 ${money(t.amount)} 元"><span class="equals">=</span><strong class="bill-value number">${money(t.amount)}</strong></div><div class="receipt">${store.state.cart.map((i) => `<div class="receipt-row"><span>${esc(i.name)}</span><span>¥${money(i.price)} × ${i.quantity}</span><strong class="number">¥${money(i.price * i.quantity)}</strong></div>`).join("")}</div></main><footer class="bill-footer">${button(icon("check") + "完成收款", "complete", "btn btn-green full")}<p>完成后将自动保存本单记录</p></footer>`;
}
function fitBill() {
  const el = document.querySelector(".bill-value"),
    parent = el?.parentElement;
  if (!el) return;
  el.style.fontSize = "";
  const space =
    parent.clientWidth - parent.querySelector(".equals").offsetWidth - 14;
  if (el.scrollWidth > space) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${Math.floor((size * space) / el.scrollWidth)}px`;
  }
}
function renderSuccess() {
  if (!lastOrder) {
    page = "cash";
    return renderCash();
  }
  return `<main class="page success-page"><div class="success-art"><div class="success-icon">${icon("check")}</div></div><h1>收款完成！</h1><div class="success-amount number">¥${money(lastOrder.totalAmount)}</div><p class="muted">共 ${lastOrder.totalQuantity} 件商品<br>${new Date(lastOrder.createdAt).toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p><div class="success-actions">${button("开始下一单", "navigate", "btn btn-primary", 'data-page="cash"')}${button("查看销售流水", "success-ledger", "btn btn-secondary")}</div><p class="success-note">本单已保存，可以放心开始下一单</p></main>${nav()}`;
}
function productRows() {
  const products = store.state.products.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return products.length
    ? `<div class="product-list">${products.map((p) => `<div class="product-list-row"><span class="name">${esc(p.name)}</span><span class="price number">¥${money(p.price)}</span>${iconButton("more", `编辑 ${esc(p.name)}`, "edit-product", `data-id="${esc(p.id)}"`)}</div>`).join("")}</div>`
    : empty(
        "bag",
        query ? "没有找到商品" : "还没有商品",
        query ? "换个关键词试试。" : "从 Excel 导入，或手动添加第一件商品。",
      );
}
function renderProducts() {
  return `${top("商品管理")}<main class="page"><button class="action-card" data-action="start-import"><span class="action-icon excel">${icon("excel")}</span><span class="action-copy"><strong>从 Excel 导入商品</strong><small>支持 .xlsx、.xls 格式，快速批量导入</small></span>${icon("right")}</button><button class="action-card" data-action="add-product"><span class="action-icon">${icon("plus")}</span><span class="action-copy"><strong>手动添加商品</strong><small>填写商品名称和价格，即可开始收银</small></span>${icon("right")}</button><div class="search">${icon("search")}<input type="search" id="productSearch" placeholder="搜索商品名称" aria-label="搜索商品名称" value="${esc(query)}"></div><div class="section-label"><span>全部商品</span><span id="productCount">${store.state.products.length} 件商品</span></div><div id="productRows">${productRows()}</div></main>${nav()}`;
}
function renderLedger() {
  const orders = dayOrders(store.state.orders, selectedDate),
    s = daySummary(orders),
    today = selectedDate === localDate();
  return `${top("销售流水", "", button(icon("excel") + "导出 Excel", "export-excel", "btn btn-outline"))}<main class="page"><div class="date-picker">${iconButton("left", "前一天", "date-prev")}<input type="date" id="ledgerDate" value="${selectedDate}" aria-label="流水日期">${iconButton("right", "后一天", "date-next")}</div><div class="stats"><div class="stat"><strong class="number">¥${money(s.amount)}</strong><small>${today ? "今日" : "当日"}销售额</small></div><div class="stat"><strong class="number">${s.count}</strong><small>成交笔数</small></div><div class="stat"><strong class="number">${s.quantity}</strong><small>商品件数</small></div></div>${orders.length ? `<div class="ledger-list">${orders.map((o) => `<article class="ledger-order"><header class="ledger-heading"><time datetime="${esc(o.createdAt)}">${new Date(o.createdAt).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span>${o.totalQuantity} 件</span><strong class="number">¥${money(o.totalAmount)}</strong></header><ul class="ledger-items">${o.items.map((item) => `<li class="ledger-item"><div><span class="ledger-name">${esc(item.name)}</span><small>¥${money(item.price)} × ${item.quantity}</small></div><strong class="number">¥${money(item.price * item.quantity)}</strong></li>`).join("")}</ul></article>`).join("")}</div><p class="day-caption">${orders.length} 笔已完成收款 · 按时间倒序</p>` : empty("receipt", "这一天还没有流水", "每次完成收款，记录都会自动保存在这里。")}</main>${nav()}`;
}
function settingsAction(i, label, action, extra = "") {
  return button(
    `<span>${icon(i)}${label}</span>${icon("right")}`,
    action,
    "settings-item",
    extra,
  );
}
function renderSettings() {
  return `${top("设置", iconButton("left", "返回收银", "navigate", 'data-page="cash"'))}<main class="page"><section class="settings-group"><h2>收银偏好</h2><div class="settings-item">${sizeControl()}</div>${settingsAction("grid", "编辑宫格", "settings-edit")}${settingsAction("undo", "恢复默认宫格布局", "reset-layout")}</section><section class="settings-group"><h2>数据管理</h2>${settingsAction("download", "导出数据备份", "backup")}${settingsAction("upload", "从备份恢复", "restore")}${settingsAction("trash", "清空商品库", "clear-data", 'data-scope="products"')}${settingsAction("trash", "清空销售流水", "clear-data", 'data-scope="orders"')}${button(`<span>${icon("trash")}清空新版全部数据</span>${icon("right")}`, "clear-data", "settings-item danger", 'data-scope="all"')}</section><div class="settings-info">数据保存在当前设备的浏览器中。活动结束后，建议导出备份和当天流水 Excel。<br>旧版计数记录仍保留，可在旧版中查看。</div><a class="settings-item" href="legacy.html"><span>${icon("receipt")}打开旧版计数记录</span>${icon("right")}</a><div class="brand-foot"><strong>06counter</strong>比计算器快，比 POS 简单。<br><br>市集收银 · v3.0</div></main>`;
}
const importer = new ImportPanel({
  button,
  icon,
  toast,
  openDialog,
  closeDialog: () => dialog.close(),
  refresh: () => {
    if (page === "import") render();
  },
  onImport: (products) => {
    store.importProducts(products);
    query = "";
    go("products");
    toast(`成功导入 ${products.length} 件商品，已加入收银宫格`);
  },
});
function renderImport() {
  return (
    top(
      "导入商品",
      iconButton("left", "返回商品管理", "navigate", 'data-page="products"'),
    ) + importer.render()
  );
}
function openDialog(title, body, onSubmit) {
  dialog.innerHTML = `<div class="dialog-header"><h2 id="dialogTitle">${title}</h2>${iconButton("close", "关闭弹窗", "close-dialog")}</div>${body}`;
  dialog.onclose = null;
  if (!dialog.open) dialog.showModal();
  const form = dialog.querySelector("form");
  if (form)
    form.onsubmit = (e) => {
      e.preventDefault();
      try {
        onSubmit(new FormData(form));
      } catch (error) {
        dialog.querySelector(".form-error").textContent = error.message;
      }
    };
}
function confirmAction(title, text, action, label = "确认清空") {
  openDialog(
    title,
    `<p class="dialog-text">${text}</p><form><div class="form-error" role="alert"></div><div class="button-pair">${button("取消", "close-dialog", "btn btn-secondary", 'type="button"')}<button class="btn btn-danger" type="submit">${label}</button></div></form>`,
    () => {
      action();
      dialog.close();
      render();
    },
  );
}
function productDialog(id) {
  const p = store.state.products.find((p) => p.id === id);
  openDialog(
    p ? "编辑商品" : "添加商品",
    `<form><label class="field"><span>商品名称</span><input name="name" maxlength="80" placeholder="例如：贴纸套装" required value="${esc(p?.name || "")}" autofocus></label><label class="field"><span>价格 / 元</span><input name="price" inputmode="decimal" placeholder="0.00" required value="${p ? money(p.price) : ""}"></label><div class="form-error" role="alert"></div><button class="btn btn-primary full dialog-actions" type="submit">保存商品</button></form>${p ? button("删除这个商品", "delete-product", "delete-product danger", `data-id="${esc(p.id)}"`) : ""}`,
    (data) => {
      if (p) store.updateProduct(p.id, data.get("name"), data.get("price"));
      else store.addProduct(data.get("name"), data.get("price"));
      dialog.close();
      render();
      toast(p ? "商品已保存" : "商品已添加到收银页");
    },
  );
}
function layoutDialog(id) {
  const p = store.state.products.find((p) => p.id === id),
    cols = { small: 4, medium: 3, large: 2 }[store.state.settings.gridSize];
  openDialog(
    "调整宫格",
    `<p class="dialog-text">${esc(p.name)}</p><form><div class="resize-fields"><label class="field"><span>宽度 / 格</span><select name="cols">${[
      1, 2, 3, 4,
    ]
      .filter((n) => n <= cols)
      .map(
        (n) =>
          `<option ${Math.min(p.colSpan, cols) === n ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="field"><span>高度 / 格</span><select name="rows">${[1, 2, 3, 4].map((n) => `<option ${p.rowSpan === n ? "selected" : ""}>${n}</option>`).join("")}</select></label></div><label class="field"><span>与以下商品交换位置</span><select name="swap"><option value="">保持当前位置</option>${store.state.products
      .filter((q) => q.id !== id)
      .map((q) => `<option value="${esc(q.id)}">${esc(q.name)}</option>`)
      .join(
        "",
      )}</select></label><div class="form-error" role="alert"></div><button class="btn btn-primary full" type="submit">保存布局</button></form>`,
    (data) => {
      store.resize(id, Number(data.get("cols")), Number(data.get("rows")));
      if (data.get("swap")) store.swap(id, data.get("swap"));
      dialog.close();
      render();
    },
  );
}
function temporaryDialog() {
  openDialog(
    "添加临时金额",
    `<p class="dialog-text">没有提前录入的商品，也可以直接记一笔。</p><form><label class="field"><span>金额 / 元</span><input name="price" inputmode="decimal" placeholder="0.00" required autofocus></label><div class="form-error" role="alert"></div><button class="btn btn-primary full dialog-actions" type="submit">加入当前订单</button></form>`,
    (data) => {
      store.addTemporary(data.get("price"));
      dialog.close();
      if (page === "cash") go("order");
      else render();
    },
  );
}
function fitCartAmount() {
  const amount = app.querySelector(".cart-info .number");
  if (!amount) return;
  amount.style.fontSize = "";
  const space = amount.parentElement.clientWidth;
  if (amount.scrollWidth > space) {
    const size = parseFloat(getComputedStyle(amount).fontSize);
    amount.style.fontSize = `${Math.max(11, Math.floor((size * space) / amount.scrollWidth))}px`;
  }
}
function updateCashBar() {
  const existing = app.querySelector(".cart-bar");
  if (existing) existing.outerHTML = cartBar();
  else
    app
      .querySelector(".bottom-nav")
      .insertAdjacentHTML("beforebegin", cartBar());
  fitCartAmount();
}
async function action(target) {
  const a = target.dataset.action,
    id = target.dataset.id;
  if (a === "navigate") return go(target.dataset.page);
  if (a === "size") {
    store.setGridSize(target.dataset.size);
    return render();
  }
  if (a === "edit-grid") {
    editing = !editing;
    return render();
  }
  if (a === "product-tap") {
    if (Date.now() < suppressClickUntil) return;
    if (editing) return layoutDialog(id);
    store.addItem(id);
    target.classList.remove("pulse");
    void target.offsetWidth;
    target.classList.add("pulse");
    updateCashBar();
    return;
  }
  if (a === "quantity") {
    store.changeQuantity(id, Number(target.dataset.delta));
    return render();
  }
  if (a === "remove-item") {
    store.removeItem(id);
    return render();
  }
  if (a === "clear-cart")
    return confirmAction(
      "清空当前订单？",
      "本单商品和临时金额将被移除，已完成的销售流水不受影响。",
      () => store.clearCart(),
    );
  if (a === "temporary") return temporaryDialog();
  if (a === "complete") {
    if (page !== "bill") return;
    lastOrder = store.complete();
    return go("success");
  }
  if (a === "success-ledger") {
    selectedDate = localDate(new Date(lastOrder.createdAt));
    return go("ledger");
  }
  if (a === "add-product") return productDialog();
  if (a === "edit-product") return productDialog(id);
  if (a === "delete-product")
    return confirmAction(
      "删除商品？",
      "商品将从商品库和收银宫格移除。当前订单及历史流水仍保留原商品记录。",
      () => store.deleteProduct(id),
      "确认删除",
    );
  if (a === "close-dialog") return dialog.close();
  if (a === "settings-edit") {
    page = "cash";
    editing = true;
    return render();
  }
  if (a === "reset-layout")
    return confirmAction(
      "恢复默认宫格？",
      "所有卡片恢复为 1 × 1，宫格大小设为中。商品顺序不变。",
      () => store.resetLayout(),
      "确认恢复",
    );
  if (a === "backup") {
    download(
      JSON.stringify(store.state, null, 2),
      `06counter-备份-${localDate()}.json`,
    );
    return;
  }
  if (a === "restore") {
    document.querySelector("#backupFile").value = "";
    document.querySelector("#backupFile").click();
    return;
  }
  if (a === "clear-data") {
    const scope = target.dataset.scope;
    return confirmAction(
      "确认清空" +
        { products: "商品库", orders: "销售流水", all: "新版全部数据" }[scope] +
        "？",
      scope === "all"
        ? "商品、当前订单、流水与新版设置将被清空。此操作不可撤销，请先导出数据备份。旧版数据仍保留。"
        : scope === "orders"
          ? "所有日期的已完成流水将被清空，无法撤销。请先导出数据备份。"
          : "所有商品将从收银页移除。当前订单及历史流水不受影响。请先导出数据备份。",
      () => {
        store.clear(scope);
        lastOrder = null;
      },
    );
  }
  if (a === "date-prev" || a === "date-next") {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + (a === "date-prev" ? -1 : 1));
    selectedDate = localDate(d);
    return render();
  }
  if (a === "export-excel") {
    target.disabled = true;
    target.innerHTML = "正在导出…";
    try {
      const { exportExcel } = await import("./report.mjs");
      await exportExcel(
        dayOrders(store.state.orders, selectedDate),
        selectedDate,
      );
      toast("Excel 已生成");
    } finally {
      if (page === "ledger") render();
    }
    return;
  }
  if (a === "start-import") {
    importer.reset();
    return go("import");
  }
  if (a === "choose-excel") {
    const input = document.querySelector("#excelFile");
    input.value = "";
    return input.click();
  }
  if (a.startsWith("import-")) return importer.action(a, target);
}
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (target && !target.disabled)
    action(target).catch((error) => toast(error.message));
});
document.addEventListener("input", (e) => {
  if (e.target.id === "productSearch") {
    query = e.target.value;
    document.querySelector("#productRows").innerHTML = productRows();
  }
});
document.addEventListener("change", (e) => {
  try {
    const id = e.target.id,
      value = Number(e.target.value);
    if (id === "ledgerDate") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
        selectedDate = e.target.value;
        render();
      }
      return;
    }
    importer.change(e.target);
  } catch (error) {
    toast(error.message);
  }
});
document.querySelector("#excelFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importer.load(file);
});
document.querySelector("#backupFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 25 * 1024 * 1024) throw Error("备份文件超过 25 MB");
    const data = JSON.parse(await file.text());
    confirmAction(
      "恢复备份？",
      "备份中的商品、当前订单、流水和设置将替换当前新版数据。建议先导出当前备份。",
      () => {
        store.restore(data);
        lastOrder = null;
        query = "";
      },
      "确认恢复",
    );
  } catch {
    toast("备份无法读取，请选择有效的 JSON 备份文件");
  }
});
let suppressClickUntil = 0;
function attachGridGestures() {
  const grid = document.querySelector("#productGrid");
  if (!grid) return;
  grid.querySelectorAll(".product-card").forEach((card) =>
    card.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const resizing = !!e.target.closest(".resize-handle"),
        startX = e.clientX,
        startY = e.clientY,
        rect = card.getBoundingClientRect(),
        p = store.state.products.find((p) => p.id === card.dataset.id),
        cols = { small: 4, medium: 3, large: 2 }[store.state.settings.gridSize];
      let active = resizing,
        clone = null,
        over = null,
        nextCols = p.colSpan,
        nextRows = p.rowSpan;
      const style = getComputedStyle(grid),
        gap = parseFloat(style.gap),
        cellW = (grid.clientWidth - gap * (cols - 1)) / cols,
        cellH = parseFloat(style.gridAutoRows);
      if (resizing) {
        e.preventDefault();
        card.setPointerCapture(e.pointerId);
      }
      const timer = setTimeout(() => {
        if (resizing) return;
        active = true;
        card.setPointerCapture(e.pointerId);
        clone = card.cloneNode(true);
        clone.classList.add("drag-clone");
        clone.style.width = rect.width + "px";
        clone.style.height = rect.height + "px";
        clone.style.left = rect.left + "px";
        clone.style.top = rect.top + "px";
        document.body.appendChild(clone);
        card.classList.add("drag-source");
        navigator.vibrate?.(15);
      }, 400);
      function move(ev) {
        if (ev.pointerId !== e.pointerId) return;
        if (!active) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10)
            cleanup(false);
          return;
        }
        if (resizing) {
          nextCols = Math.max(
            1,
            Math.min(
              cols,
              Math.round(
                (rect.width + ev.clientX - startX + gap) / (cellW + gap),
              ),
            ),
          );
          nextRows = Math.max(
            1,
            Math.min(
              4,
              Math.round(
                (rect.height + ev.clientY - startY + gap) / (cellH + gap),
              ),
            ),
          );
          card.style.gridColumn = "span " + nextCols;
          card.style.gridRow = "span " + nextRows;
        } else {
          clone.style.left = rect.left + ev.clientX - startX + "px";
          clone.style.top = rect.top + ev.clientY - startY + "px";
          const scroller = grid.closest(".page"),
            bounds = scroller.getBoundingClientRect();
          if (ev.clientY > bounds.bottom - 40) scroller.scrollTop += 14;
          if (ev.clientY < bounds.top + 40) scroller.scrollTop -= 14;
          const target = document
            .elementFromPoint(ev.clientX, ev.clientY)
            ?.closest(".product-card");
          over?.classList.remove("drag-target");
          over =
            target && target !== card && grid.contains(target) ? target : null;
          over?.classList.add("drag-target");
        }
      }
      function cleanup(save) {
        clearTimeout(timer);
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", cancel);
        card.removeEventListener("lostpointercapture", cancel);
        clone?.remove();
        card.classList.remove("drag-source");
        over?.classList.remove("drag-target");
        if (active) {
          suppressClickUntil = Date.now() + 350;
          try {
            if (save) {
              if (resizing) store.resize(p.id, nextCols, nextRows);
              else if (over) store.swap(p.id, over.dataset.id);
            }
          } catch (error) {
            toast(error.message);
          }
          render();
        }
      }
      function up(ev) {
        if (ev.pointerId === e.pointerId) cleanup(true);
      }
      function cancel() {
        cleanup(false);
      }
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", cancel);
      card.addEventListener("lostpointercapture", cancel, { once: true });
    }),
  );
}
window.addEventListener("resize", () => {
  fitCartAmount();
  if (page === "bill") fitBill();
});
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    try {
      store = createStore(localStorage);
      if (page === "success") page = "cash";
      render();
      toast("已同步另一个窗口中的数据");
    } catch (error) {
      toast(error.message);
    }
  }
});
function boot() {
  try {
    store = createStore(localStorage);
    render();
  } catch (error) {
    app.innerHTML = `${top("本地数据需要检查")}<main class="page">${empty("receipt", "暂时无法打开收银台", esc(error.message))}<button class="btn btn-primary full" id="rawBackup">下载原始数据</button><p class="upload-help"><a href="legacy.html">打开旧版</a> · 保留原始数据后，请检查设备存储空间或联系维护者。</p></main>`;
    document.querySelector("#rawBackup").onclick = () => {
      try {
        download(
          JSON.stringify(
            {
              v3: localStorage.getItem(STORAGE_KEY),
              legacy: localStorage.getItem("counter-app-v1"),
            },
            null,
            2,
          ),
          "06counter-原始数据.json",
        );
      } catch {
        toast("浏览器禁止访问本地数据");
      }
    };
  }
}
boot();
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js").catch(() => {});
