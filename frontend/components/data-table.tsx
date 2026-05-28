import type { QueryCell } from "../lib/types";

interface DataTableProps {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: QueryCell[][];
}

export function DataTable({ title, subtitle, columns, rows }: DataTableProps) {
  function formatCell(value: QueryCell): string {
    return value === null ? "NULL" : String(value);
  }

  return (
    <div className="panel rounded-3xl p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-800">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-950/85 text-slate-200">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="border-b border-slate-800 px-4 py-3 font-semibold uppercase tracking-[0.18em] text-slate-400"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length || 1}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No rows returned.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIndex) => (
                  <tr
                    key={`${title}-${rowIndex}`}
                    className="border-b border-slate-900/70 text-slate-100 last:border-b-0"
                  >
                    {row.map((value, columnIndex) => (
                      <td key={`${title}-${rowIndex}-${columnIndex}`} className="px-4 py-3 align-top">
                        {formatCell(value)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
