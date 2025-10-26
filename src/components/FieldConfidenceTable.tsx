import React from "react";

export interface FieldRow {
  label: string;
  value: string;
  confidence?: number;
}

interface FieldConfidenceTableProps {
  rows: FieldRow[];
}

export function FieldConfidenceTable({ rows }: FieldConfidenceTableProps): JSX.Element {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No extracted fields yet.</p>;
  }

  return (
    <table className="min-w-full divide-y divide-slate-800 text-sm">
      <tbody className="divide-y divide-slate-800">
        {rows.map((row) => {
          const percent =
            row.confidence !== undefined ? Math.round(row.confidence * 100) : null;
          return (
            <tr key={`${row.label}-${row.value}`} className="align-top">
              <th className="w-36 whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                {row.label}
              </th>
              <td className="px-4 py-3">
                <div className="whitespace-pre-wrap text-sm text-slate-200">{row.value}</div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 w-full rounded-full bg-slate-800">
                    {percent !== null ? (
                      <div
                        className="h-2 rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    ) : null}
                  </div>
                  <span className="text-xs text-slate-400">
                    {percent !== null ? `${percent}%` : "—"}
                  </span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
