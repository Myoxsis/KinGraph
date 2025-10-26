import React, { type ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: PanelProps): JSX.Element {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/70 shadow-lg ${
        className ?? ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className={`p-4 ${bodyClassName ?? ""}`}>{children}</div>
    </div>
  );
}
