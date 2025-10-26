import React, { type ChangeEventHandler } from "react";
import type { IndividualRecord } from "../schema";

interface SourceInputColumnProps {
  htmlInput: string;
  onHtmlInputChange: ChangeEventHandler<HTMLTextAreaElement>;
  onToggleSources: () => void;
  showSources: boolean;
  record: IndividualRecord | null;
  highlightDocument: string;
}

export function SourceInputColumn({
  htmlInput,
  onHtmlInputChange,
  onToggleSources,
  showSources,
  record,
  highlightDocument,
}: SourceInputColumnProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Source HTML
        </label>
        <textarea
          className="h-[24rem] w-full resize-y rounded-lg border border-slate-800 bg-slate-900/60 p-4 font-mono text-sm text-slate-200 shadow-inner outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/50"
          placeholder="Paste HTML here..."
          value={htmlInput}
          onChange={onHtmlInputChange}
        />
      </div>
      <button
        type="button"
        onClick={onToggleSources}
        disabled={!record}
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        Highlight sources
      </button>
      {showSources && record ? (
        <div className="h-80 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
          <iframe
            title="Source preview"
            className="h-full w-full"
            srcDoc={highlightDocument}
          />
        </div>
      ) : null}
    </div>
  );
}
