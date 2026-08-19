/**
 * 客户端分页控件：配合 usePagination 使用。
 */
export default function Pagination({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="pagination">
      <span>
        共 {total} 条 · 第 {page}/{pageCount} 页
      </span>
      <button
        className="btn btn-sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="上一页"
      >
        ‹
      </button>
      <button
        className="btn btn-sm"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label="下一页"
      >
        ›
      </button>
    </div>
  );
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  return items.slice((page - 1) * pageSize, page * pageSize);
}

export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
