import { loadScript } from "./utils.mjs";
export async function readWorkbook(file) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name))
    throw Error("请选择 .xlsx、.xls 或 .csv 文件");
  if (file.size > 10 * 1024 * 1024) throw Error("文件超过 10 MB，请拆分后导入");
  await loadScript("../vendor/xlsx.full.min.js");
  const bytes = await file.arrayBuffer();
  let workbook;
  try {
    workbook = globalThis.XLSX.read(bytes, {
      type: "array",
      cellDates: true,
      sheetRows: 10002,
    });
  } catch {
    throw Error("表格无法读取，请确认文件未损坏、未加密");
  }
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (
      sheet["!fullref"] &&
      globalThis.XLSX.utils.decode_range(sheet["!fullref"]).e.r >= 10001
    )
      throw Error("单张工作表最多支持 10,000 行，请拆分后导入");
    const range = sheet["!ref"]
      ? globalThis.XLSX.utils.decode_range(sheet["!ref"])
      : null;
    if (range && range.e.c >= 100)
      throw Error("工作表列数超过 100 列，请仅保留商品相关列");
    return {
      name,
      rows: globalThis.XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        blankrows: true,
        raw: true,
        range: 0,
      }),
    };
  });
  if (!sheets.length || sheets.every((s) => !s.rows.length))
    throw Error("表格为空，没有可导入的数据");
  return { name: file.name, sheets };
}
export function guessColumns(rows, header) {
  const labels = rows[header] || [];
  let name = labels.findIndex((v) =>
    /商品名称|商品名|品名|名称|product|name/i.test(String(v)),
  );
  let price = labels.findIndex((v) =>
    /价格|售价|单价|金额|price|amount/i.test(String(v)),
  );
  if (name < 0) name = 0;
  if (price < 0) price = name === 0 ? 1 : 0;
  return { name, price };
}
export function columnCount(rows, header) {
  return Math.max(
    2,
    ...rows.slice(Math.max(0, header)).map((row) => row.length),
  );
}
