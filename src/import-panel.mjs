import { readWorkbook, columnCount } from "./import.mjs";
import {
  analyzeWorkbook,
  analyzeSheet,
  extractEntries,
  validateEntry,
} from "./import-detect.mjs";
import { money } from "./model.mjs";
import { escapeHTML as esc } from "./utils.mjs";
export class ImportPanel {
  constructor(callbacks) {
    Object.assign(this, callbacks);
    this.request = 0;
    this.reset();
  }
  reset() {
    this.request++;
    this.workbook = null;
    this.busy = false;
    this.analysis = null;
    this.entries = [];
    this.pageIndex = 0;
    this.advanced = false;
    this.sheetConfirmed = false;
  }
  async load(file) {
    const request = ++this.request;
    this.busy = true;
    this.refresh();
    try {
      const workbook = await readWorkbook(file);
      if (request !== this.request) return;
      this.workbook = workbook;
      const result = analyzeWorkbook(workbook);
      this.sheetOptions = result.sheetOptions;
      this.sheetConfirmed = this.sheetOptions.length <= 1;
      this.apply(result);
    } catch (error) {
      if (request === this.request) this.toast(error.message);
    } finally {
      if (request === this.request) {
        this.busy = false;
        this.refresh();
      }
    }
  }
  apply(analysis) {
    this.analysis = analysis;
    this.entries = analysis.entries;
    this.pageIndex = 0;
    this.priceConfirmed = !analysis.needsPriceChoice;
    this.nameConfirmed = !analysis.needsNameChoice;
  }
  remap(preserve = false) {
    const previous = new Map(this.entries.map((e) => [e.row, e]));
    const a = this.analysis;
    Object.assign(
      a,
      extractEntries(
        this.workbook.sheets[a.sheetIndex].rows,
        a.header,
        a.nameCol,
        a.priceCol,
      ),
    );
    this.entries = a.entries;
    if (preserve)
      this.entries.forEach((entry) => {
        const old = previous.get(entry.row);
        if (!old) return;
        entry.excluded = old.excluded;
        if (old.nameEdited) {
          entry.name = old.name;
          entry.nameEdited = true;
          try {
            const valid = validateEntry(entry);
            Object.assign(entry, valid, { error: null });
          } catch (error) {
            entry.error = error.message;
          }
        }
      });
    this.pageIndex = 0;
  }
  validEntries() {
    return this.entries.filter((e) => !e.excluded).map(validateEntry);
  }
  ready() {
    return (
      this.sheetConfirmed &&
      this.priceConfirmed &&
      this.nameConfirmed &&
      this.analysis.nameCol !== this.analysis.priceCol &&
      this.entries.some((e) => !e.excluded) &&
      !this.entries.some((e) => !e.excluded && e.error)
    );
  }
  render() {
    const { button, icon } = this;
    if (!this.workbook)
      return `<main class="page"><div class="import-steps"><div class="import-step active"><b>1</b>选择文件</div><div class="import-step"><b>2</b>确认商品</div></div>${button(icon("upload") + `<strong>${this.busy ? "正在识别商品…" : "选择 Excel 文件"}</strong><span>.xlsx / .xls / .csv · 最大 10 MB</span>`, "choose-excel", "upload-zone", this.busy ? "disabled" : "")}<p class="upload-help">自动寻找商品名称和售价，跳过标题、说明与合计行。识别后直接核对商品清单。<br>全部在本机处理，无需联网或上传文件。</p><div class="table-wrap"><table><thead><tr><th>商品名称</th><th>价格</th></tr></thead><tbody><tr><td>贴纸套装</td><td>15</td></tr><tr><td>手帐本 A</td><td>56</td></tr></tbody></table></div></main>`;
    const a = this.analysis,
      rows = this.workbook.sheets[a.sheetIndex].rows,
      labels = rows[a.header] || [],
      count = columnCount(rows, a.header),
      active = this.entries.filter((e) => !e.excluded),
      errors = active.filter((e) => e.error),
      excluded = this.entries.length - active.length;
    const options = (selected) =>
      Array.from(
        { length: count },
        (_, i) =>
          `<option value="${i}" ${selected === i ? "selected" : ""}>${esc(labels[i] || "第 " + (i + 1) + " 列")}</option>`,
      ).join("");
    let choices = "";
    if (this.sheetOptions.length > 1)
      choices += `<label class="field import-choice"><span>文件里有多张商品表，这次导入哪张？</span><select id="importSheet"><option value="" ${this.sheetConfirmed ? "" : "selected"} disabled>选择商品表</option>${this.sheetOptions.map((s) => `<option value="${s.index}" ${this.sheetConfirmed && s.index === a.sheetIndex ? "selected" : ""}>${esc(s.name)} · ${s.count} 项</option>`).join("")}</select></label>`;
    if (a.needsPriceChoice)
      choices += `<fieldset class="import-choice"><legend>${a.priceOptions.length > 1 ? "你要用哪个价格收银？" : "请确认这列作为收银价格"}</legend>${a.priceOptions.map((p) => `<label class="price-choice"><input type="radio" name="importPriceChoice" value="${p.column}" ${this.priceConfirmed && a.priceCol === p.column ? "checked" : ""}><span><strong>${esc(p.label)}</strong><small>例如：${esc(p.examples.join("、"))}</small></span></label>`).join("")}</fieldset>`;
    if (a.needsNameChoice)
      choices += `<label class="field import-choice"><span>请确认商品名称所在列</span><select id="importNameChoice"><option value="" disabled ${this.nameConfirmed ? "" : "selected"}>选择商品名称</option>${Array.from({ length: count }, (_, i) => `<option value="${i}" ${this.nameConfirmed && a.nameCol === i ? "selected" : ""}>${esc(labels[i] || rows[a.header + 1]?.[i] || "第 " + (i + 1) + " 列")}</option>`).join("")}</select></label>`;
    const start = this.pageIndex * 50,
      visible = this.entries.slice(start, start + 50),
      pages = Math.max(1, Math.ceil(this.entries.length / 50));
    const table = visible.length
      ? `<div class="table-wrap smart-preview"><table><thead><tr><th>商品名称</th><th>价格</th><th>调整</th></tr></thead><tbody>${visible.map((e, index) => `<tr class="${e.excluded ? "excluded" : e.error ? "invalid" : ""}"><td><strong>${esc(e.name || "名称待补充")}</strong><small>原表第 ${e.row} 行${e.excluded ? " · 已跳过" : ""}</small>${e.error && !e.excluded ? `<small class="danger">${esc(e.error)}</small>` : ""}</td><td>${e.error ? esc(e.priceText || "待补充") : "¥" + money(e.price)}</td><td>${button("修改", "import-edit", "text-btn blue", `data-index="${start + index}" aria-label="修改第 ${e.row} 行"`)}${button(e.excluded ? "恢复" : "跳过", "import-toggle", "text-btn muted", `data-index="${start + index}" aria-label="${e.excluded ? "恢复" : "跳过"}第 ${e.row} 行"`)}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="notice">没有找到商品，请展开下方选项调整识别范围。</p>';
    return `<main class="page smart-import"><div class="import-steps"><div class="import-step active"><b>✓</b>选择文件</div><div class="import-step active"><b>2</b>确认商品</div></div><div class="file-tag">${icon("excel")}<span>${esc(this.workbook.name)}<small>${esc(this.workbook.sheets[a.sheetIndex].name)}</small></span>${button("重选", "import-restart", "text-btn blue")}</div>${choices}<div class="notice"><strong>识别出 ${active.length} 件商品${errors.length ? `，${errors.length} 项待修正` : ""}</strong>${errors.length ? "直接点「修改」补充信息，无需返回 Excel。" : "核对下方名称与价格，确认后加入收银宫格。"}${excluded ? ` 已手动跳过 ${excluded} 项。` : ""}</div>${errors.length ? '<p class="error-box">修正或明确跳过标红商品后，即可导入。</p>' : ""}${table}${pages > 1 ? `<div class="preview-pagination">${button("上一页", "import-prev", "text-btn blue", this.pageIndex === 0 ? "disabled" : "")}<span>${this.pageIndex + 1} / ${pages}</span>${button("下一页", "import-next", "text-btn blue", this.pageIndex + 1 === pages ? "disabled" : "")}</div>` : ""}${a.skipped.length ? `<details class="import-skipped"><summary>已自动跳过 ${a.skipped.length} 行标题、说明或合计</summary><p>${a.skipped.map((s) => `第 ${s.row} 行：${s.reason}`).join("；")}</p></details>` : ""}<details class="import-advanced" ${this.advanced ? "open" : ""}><summary>识别不对？调整识别范围</summary><p class="small muted">调整范围会重新识别，并重置本次预览的修改。</p><label class="field"><span>工作表</span><select id="sheetSelect">${this.workbook.sheets.map((s, i) => `<option value="${i}" ${a.sheetIndex === i ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label><label class="field"><span>表头所在行</span><select id="headerSelect"><option value="-1" ${a.header === -1 ? "selected" : ""}>没有表头</option>${rows
      .slice(0, 40)
      .map(
        (r, i) =>
          `<option value="${i}" ${a.header === i ? "selected" : ""}>第 ${i + 1} 行：${esc(r.slice(0, 3).join(" / "))}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="field-pair"><label class="field"><span>商品名称</span><select id="nameColumn">${options(a.nameCol)}</select></label><label class="field"><span>价格</span><select id="priceColumn">${options(a.priceCol)}</select></label></div>${a.nameCol === a.priceCol ? '<p class="error-box">名称和价格不能选择同一列。</p>' : ""}</details></main><footer class="import-confirm-bar">${button(`确认导入 ${active.length} 件商品`, "import-confirm", "btn btn-primary full", this.ready() ? "" : "disabled")}</footer>`;
  }
  action(action, target) {
    if (action === "import-restart") {
      this.reset();
      this.refresh();
      return;
    }
    if (action === "import-confirm") {
      if (!this.workbook || !this.ready()) return;
      const values = this.validEntries();
      this.onImport(values);
      this.reset();
      return;
    }
    if (action === "import-prev" || action === "import-next") {
      this.pageIndex += action === "import-prev" ? -1 : 1;
      this.refresh();
      return;
    }
    const index = Number(target.dataset.index),
      entry = this.entries[index];
    if (action === "import-toggle" && entry) {
      entry.excluded = !entry.excluded;
      this.refresh();
    }
    if (action === "import-edit" && entry) {
      this.openDialog(
        "修改导入商品",
        `<p class="dialog-text">原表第 ${entry.row} 行 · 仅修改本次导入内容</p><form><label class="field"><span>商品名称</span><input name="name" value="${esc(entry.name)}" maxlength="80" required></label><label class="field"><span>价格 / 元</span><input name="price" value="${esc(entry.priceText)}" inputmode="decimal" required></label><div class="form-error" role="alert"></div><button class="btn btn-primary full" type="submit">保存修改</button></form>`,
        (data) => {
          const valid = validateEntry({
            name: data.get("name"),
            priceText: data.get("price"),
          });
          Object.assign(entry, valid, {
            priceText: money(valid.price),
            nameEdited: true,
            error: null,
          });
          this.closeDialog();
          this.refresh();
        },
      );
    }
  }
  change(target) {
    if (!this.analysis) return;
    const id = target.id,
      a = this.analysis,
      value = Number(target.value);
    if (["sheetSelect", "importSheet"].includes(id)) {
      this.apply({
        ...analyzeSheet(this.workbook.sheets[value]),
        sheetIndex: value,
      });
      this.sheetConfirmed = true;
    } else if (id === "headerSelect") {
      a.header = value;
      this.remap();
    } else if (id === "nameColumn" || id === "importNameChoice") {
      a.nameCol = value;
      this.nameConfirmed = true;
      this.remap();
    } else if (id === "priceColumn" || target.name === "importPriceChoice") {
      const changed = a.priceCol !== value;
      a.priceCol = value;
      this.priceConfirmed = true;
      if (changed || id === "priceColumn")
        this.remap(target.name === "importPriceChoice");
    } else return;
    this.advanced =
      ["sheetSelect", "headerSelect", "nameColumn", "priceColumn"].includes(
        id,
      ) || this.advanced;
    this.refresh();
  }
}
