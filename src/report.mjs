import { money, daySummary } from "./model.mjs";
import { loadScript } from "./utils.mjs";
export async function exportPDF(orders, date) {
  await loadScript("../vendor/jspdf.umd.min.js");
  await document.fonts.ready;
  const { jsPDF } = globalThis.jspdf;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.setProperties({
    title: `06counter 销售流水 ${date}`,
    subject: "每日销售记录",
    creator: "06counter",
  });
  const summary = daySummary(orders),
    perPage = 24,
    pageCount = Math.max(1, Math.ceil(orders.length / perPage));
  for (let page = 0; page < pageCount; page++) {
    const canvas = document.createElement("canvas");
    canvas.width = 1240;
    canvas.height = 1754;
    const c = canvas.getContext("2d");
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 1240, 1754);
    const text = (
      content,
      x,
      y,
      size = 24,
      color = "#172238",
      align = "left",
      weight = 400,
    ) => {
      c.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`;
      c.fillStyle = color;
      c.textAlign = align;
      c.fillText(content, x, y);
    };
    text("06counter", 85, 105, 28, "#1677ff", "left", 700);
    text("销售流水", 85, 175, 44, "#172238", "left", 650);
    text(date.replaceAll("-", " / "), 1155, 175, 24, "#74839b", "right");
    c.fillStyle = "#f1f6ff";
    c.fillRect(85, 215, 1070, 132);
    text("销售总额", 110, 254, 21, "#74839b");
    text(`¥${money(summary.amount)}`, 110, 309, 37, "#0b9b60", "left", 650);
    text("成交笔数", 500, 254, 21, "#74839b");
    text(`${summary.count} 笔`, 500, 309, 37, "#1677ff", "left", 650);
    text("商品总件数", 870, 254, 21, "#74839b");
    text(`${summary.quantity} 件`, 870, 309, 37, "#172238", "left", 650);
    text("时间", 110, 406, 22, "#74839b");
    text("件数", 660, 406, 22, "#74839b", "right");
    text("金额", 1125, 406, 22, "#74839b", "right");
    const slice = orders.slice(page * perPage, (page + 1) * perPage);
    if (!slice.length)
      text("当天暂无销售流水", 620, 525, 25, "#74839b", "center");
    slice.forEach((order, index) => {
      const y = 465 + index * 47;
      c.strokeStyle = "#e9edf4";
      c.beginPath();
      c.moveTo(85, y + 17);
      c.lineTo(1155, y + 17);
      c.stroke();
      text(
        new Date(order.createdAt).toLocaleTimeString("zh-CN", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        110,
        y,
      );
      text(`${order.totalQuantity} 件`, 660, y, 24, "#172238", "right");
      text(
        `¥${money(order.totalAmount)}`,
        1125,
        y,
        25,
        "#172238",
        "right",
        600,
      );
    });
    text("06counter · 市集收银记录", 85, 1680, 19, "#8b98aa");
    text(`${page + 1} / ${pageCount}`, 1155, 1680, 19, "#8b98aa", "right");
    if (page) pdf.addPage();
    pdf.addImage(canvas, "PNG", 0, 0, 210, 297, undefined, "FAST");
    canvas.width = canvas.height = 0;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  pdf.save(`06counter-销售流水-${date}.pdf`);
}
