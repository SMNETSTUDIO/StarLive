import { useState } from "react";

/** 后台批量管理通用选择状态：勾选/全选（当前页）/清空 */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** 传入当前页 id 列表：全选中则取消这些，否则全部选上 */
  const toggleAll = (ids: string[]) =>
    setSelected((s) => {
      const allIn = ids.length > 0 && ids.every((i) => s.has(i));
      if (allIn) return new Set([...s].filter((x) => !ids.includes(x)));
      return new Set([...s, ...ids]);
    });

  const clear = () => setSelected(new Set());
  const allChecked = (ids: string[]) => ids.length > 0 && ids.every((i) => selected.has(i));

  return { selected, toggle, toggleAll, clear, allChecked };
}

export interface BatchResult {
  succeeded: number;
  failed: { id: string; error: string }[];
}

export function batchResultText(r: BatchResult): string {
  return r.failed.length === 0
    ? `已完成 ${r.succeeded} 项`
    : `成功 ${r.succeeded} 项，失败 ${r.failed.length} 项：${r.failed
        .slice(0, 3)
        .map((f) => f.error)
        .join("；")}${r.failed.length > 3 ? "…" : ""}`;
}
