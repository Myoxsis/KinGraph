import React, { type ReactNode } from "react";

export interface StructuredSectionItem {
  label: string;
  content: ReactNode;
}

export interface StructuredSection {
  title: string;
  items: StructuredSectionItem[];
  badge?: string;
}

interface StructuredSectionsProps {
  sections: StructuredSection[];
}

export function StructuredSections({ sections }: StructuredSectionsProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, index) => (
        <details
          key={section.title}
          className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80"
          defaultOpen={index === 0}
        >
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold uppercase tracking-wider text-slate-300">
            <span>{section.title}</span>
            {section.badge ? (
              <span className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400">
                {section.badge}
              </span>
            ) : null}
          </summary>
          <div className="border-t border-slate-800 px-4 py-3">
            <dl className="grid gap-4">
              {section.items.map((item) => (
                <div key={`${section.title}-${item.label}`} className="space-y-1">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {item.label}
                  </dt>
                  <dd className="text-sm text-slate-200">{item.content}</dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
      ))}
    </div>
  );
}
