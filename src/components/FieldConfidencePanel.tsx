import React from "react";
import { Panel } from "./Panel";
import { FieldConfidenceTable, type FieldRow } from "./FieldConfidenceTable";

interface FieldConfidencePanelProps {
  rows: FieldRow[];
}

export function FieldConfidencePanel({ rows }: FieldConfidencePanelProps): JSX.Element {
  return (
    <Panel title="Field confidence" bodyClassName="max-h-[22rem] overflow-auto">
      <FieldConfidenceTable rows={rows} />
    </Panel>
  );
}
