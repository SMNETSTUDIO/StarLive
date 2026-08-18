/** 前端生成并下载 CSV（带 BOM，Excel 打开中文不乱码） */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | undefined)[][],
): void {
  const esc = (v: string | number | undefined): string => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv =
    "﻿" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
