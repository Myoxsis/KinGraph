import React, { type ReactNode } from "react";
import type { IndividualRecord } from "../schema";
import { Panel } from "./Panel";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";
import { StructuredSections, type StructuredSection } from "./StructuredSections";

export type RecordViewMode = "modular" | "json";

interface StructuredRecordPanelProps {
  record: IndividualRecord | null;
  sections: StructuredSection[];
  viewMode: RecordViewMode;
  onViewModeChange: (mode: RecordViewMode) => void;
  highlightedJson: string;
  error: string | null;
}

const viewOptions: SegmentedControlOption<RecordViewMode>[] = [
  { value: "modular", label: "Modular" },
  { value: "json", label: "JSON" },
];

export function StructuredRecordPanel({
  record,
  sections,
  viewMode,
  onViewModeChange,
  highlightedJson,
  error,
}: StructuredRecordPanelProps): JSX.Element {
  const headerActions: ReactNode = record ? (
    <>
      <span className="hidden rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400 sm:inline-flex">
        {record.provenance.length} provenance span{record.provenance.length === 1 ? "" : "s"}
      </span>
      <SegmentedControl
        value={viewMode}
        options={viewOptions}
        onChange={onViewModeChange}
      />
    </>
  ) : null;

  return (
    <Panel
      title="Structured record"
      actions={headerActions}
      bodyClassName="max-h-[22rem] overflow-auto"
    >
      {error ? (
        <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {!error && !record ? (
        <p className="text-sm text-slate-400">
          Paste HTML into the left pane to see the extracted record.
        </p>
      ) : null}

      {!error && record && viewMode === "json" ? (
        <pre
          className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-200"
          dangerouslySetInnerHTML={{ __html: highlightedJson }}
        />
      ) : null}

      {!error && record && viewMode === "modular" ? (
        sections.length === 0 ? (
          <p className="text-sm text-slate-400">
            No structured fields were extracted from this record.
          </p>
        ) : (
          <StructuredSections sections={sections} />
        )
      ) : null}
    </Panel>
  );
}
