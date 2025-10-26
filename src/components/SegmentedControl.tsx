import React, { type ReactNode } from "react";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>): JSX.Element {
  return (
    <div
      className={`inline-flex rounded-lg bg-slate-800/70 p-0.5 text-xs text-slate-400 ${
        className ?? ""
      }`}
      role="tablist"
      aria-label="View mode"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`rounded-md px-3 py-1 font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              isActive ? "bg-slate-700 text-slate-100 shadow" : "hover:text-slate-200"
            }`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
