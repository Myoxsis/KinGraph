export type IndividualRoleDefinition = {
  /**
   * Label shown in the UI when selecting an individual's role.
   */
  label: string;
};

export const TEMPLATE_INDIVIDUAL_ROLES: readonly IndividualRoleDefinition[] = [
  { label: "Research target" },
  { label: "Confirmed relative" },
  { label: "Candidate match" },
];
