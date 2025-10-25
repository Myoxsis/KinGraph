import { z } from "zod";

/**
 * Schema describing the normalized structure of an individual record.
 */
export const IndividualRecordSchema = z.object({
  /**
   * Raw HTML from which the individual record was sourced.
   */
  sourceHtml: z.string(),
  /**
   * URL of the source document, when available.
   */
  sourceUrl: z.string().optional(),
  /**
   * ISO 8601 timestamp capturing when the record was extracted.
   */
  extractedAt: z.string().datetime(),
  /**
   * Given names associated with the individual.
   */
  givenNames: z.array(z.string()),
  /**
   * Primary surname of the individual, if recorded.
   */
  surname: z.string().optional(),
  /**
   * Maiden name for the individual, if different from the surname.
   */
  maidenName: z.string().optional(),
  /**
   * Alternate names or aliases used by the individual.
   */
  aliases: z.array(z.string()),
  /**
   * Reported sex of the individual.
   */
  sex: z.enum(["M", "F", "U"]).optional(),
  /**
   * Recorded birth details for the individual.
   */
  birth: z.object({
    /**
     * Unstructured birth information as captured from the source.
     */
    raw: z.string().optional(),
    /**
     * Four-digit birth year, if known.
     */
    year: z.number().optional(),
    /**
     * Birth month number (1-12), if known.
     */
    month: z.number().optional(),
    /**
     * Birth day of the month (1-31), if known.
     */
    day: z.number().optional(),
    /**
     * Indicates whether the birth date is approximate.
     */
    approx: z.boolean().optional(),
    /**
     * Reported birth place.
     */
    place: z.string().optional(),
  }),
  /**
   * Recorded death details for the individual.
   */
  death: z.object({
    /**
     * Unstructured death information as captured from the source.
     */
    raw: z.string().optional(),
    /**
     * Four-digit death year, if known.
     */
    year: z.number().optional(),
    /**
     * Death month number (1-12), if known.
     */
    month: z.number().optional(),
    /**
     * Death day of the month (1-31), if known.
     */
    day: z.number().optional(),
    /**
     * Indicates whether the death date is approximate.
     */
    approx: z.boolean().optional(),
    /**
     * Reported death place.
     */
    place: z.string().optional(),
  }),
  /**
   * Known residences for the individual over time.
   */
  residences: z.array(
    z.object({
      /**
       * Unstructured residence information.
       */
      raw: z.string().optional(),
      /**
       * Year associated with the residence.
       */
      year: z.number().optional(),
      /**
       * Place name for the residence.
       */
      place: z.string().optional(),
    })
  ),
  /**
   * Parent information for the individual.
   */
  parents: z.object({
    /**
     * Name of the father, if known.
     */
    father: z.string().optional(),
    /**
     * Name of the mother, if known.
     */
    mother: z.string().optional(),
  }),
  /**
   * Names of spouses associated with the individual.
   */
  spouses: z.array(z.string()),
  /**
   * Names of children associated with the individual.
   */
  children: z.array(z.string()),
  /**
   * Names of siblings associated with the individual.
   */
  siblings: z.array(z.string()),
  /**
   * Reported occupation of the individual.
   */
  occupation: z.string().optional(),
  /**
   * Reported religion of the individual.
   */
  religion: z.string().optional(),
  /**
   * Additional notes pertaining to the individual.
   */
  notes: z.string().optional(),
  /**
   * Provenance ranges linking normalized fields to the source HTML.
   */
  provenance: z.array(
    z.object({
      /**
       * Name of the field associated with the provenance span.
       */
      field: z.string(),
      /**
       * Text snippet corresponding to the provenance span.
       */
      text: z.string(),
      /**
       * Starting character offset in the source HTML (inclusive).
       */
      start: z.number(),
      /**
       * Ending character offset in the source HTML (exclusive).
       */
      end: z.number(),
    })
  ),
  /**
   * Free-form source references captured from the page.
   */
  sources: z.array(z.string()),
});

export type IndividualRecord = z.infer<typeof IndividualRecordSchema>;
