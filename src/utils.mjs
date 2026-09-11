export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const scripts = new Map();
export function loadScript(path) {
  const url = new URL(path, import.meta.url).href;
  if (!scripts.has(url))
    scripts.set(
      url,
      new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = url;
        el.onload = resolve;
        el.onerror = () => {
          scripts.delete(url);
          el.remove();
          reject(Error("功能文件加载失败，请联网刷新后重试"));
        };
        document.head.appendChild(el);
      }),
    );
  return scripts.get(url);
}
export function download(data, filename, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
