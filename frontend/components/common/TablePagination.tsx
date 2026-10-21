"use client";

/** Shared table page size — every console table pages eight rows at a time. */
export const TABLE_PAGE_SIZE = 8;

type TablePaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Disable both controls while the current page is being fetched. */
  disabled?: boolean;
  /** Plural noun used in the count, e.g. "results" or "entries". */
  itemLabel?: string;
  className?: string;
};

/**
 * The console's shared table footer.
 *
 * Server-paged tables own their page number and call `onPageChange`; tables
 * that already hold every row slice it locally and pass the same props. The
 * controls stay visible on a single page so the row count is always explicit.
 */
export default function TablePagination({
  page,
  totalPages,
  total,
  onPageChange,
  disabled = false,
  itemLabel = "results",
  className = "",
}: TablePaginationProps) {
  const lastPage = Math.max(1, totalPages);
  const currentPage = Math.min(Math.max(1, page), lastPage);

  return (
    <div
      className={`flex flex-wrap items-center gap-3 border-t border-console-line px-5 py-3.5 ${className}`}
    >
      <p className="text-[12px] text-console-muted">
        Showing page {currentPage} of {lastPage} ({total} {itemLabel})
      </p>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          disabled={disabled || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="rounded-lg border border-console-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={disabled || currentPage >= lastPage}
          onClick={() => onPageChange(currentPage + 1)}
          className="rounded-lg border border-console-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
