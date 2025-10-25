export type ProfessionDefinition = {
  /**
   * Canonical label for the profession. This is what will be stored
   * when a fragment matches any of the aliases.
   */
  label: string;
  /**
   * Alternative spellings or localized names that should resolve to the label.
   */
  aliases?: string[];
};

export type ParsedProfession = {
  /**
   * Raw text entered by a user.
   */
  profession: string;
  /**
   * Canonical professions that were recognized within the raw text.
   */
  tokens: string[];
};

const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\s+/g, " ")
    .trim();

const collapseSpaces = (value: string): string => value.replace(/\s+/g, "");

const createAliasMap = (
  definitions: readonly ProfessionDefinition[],
): Map<string, string> => {
  const map = new Map<string, string>();
  for (const definition of definitions) {
    const canonical = definition.label.trim();
    if (!canonical) {
      continue;
    }

    const normalizedCanonical = normalizeToken(canonical);
    map.set(normalizedCanonical, canonical);
    map.set(collapseSpaces(normalizedCanonical), canonical);

    if (!definition.aliases) {
      continue;
    }

    for (const alias of definition.aliases) {
      const normalizedAlias = normalizeToken(alias);
      if (!normalizedAlias) {
        continue;
      }

      map.set(normalizedAlias, canonical);
      map.set(collapseSpaces(normalizedAlias), canonical);
    }
  }

  return map;
};

const getCanonicalProfession = (
  value: string,
  map: Map<string, string>,
): string | undefined => {
  const normalized = normalizeToken(value);
  const collapsed = collapseSpaces(normalized);
  return map.get(normalized) ?? map.get(collapsed);
};

export const parseProfession = (
  text: string,
  definitions: readonly ProfessionDefinition[] = TEMPLATE_PROFESSIONS,
): ParsedProfession => {
  const profession = text.trim();

  if (!profession) {
    return { profession, tokens: [] };
  }

  const aliasMap = createAliasMap(definitions);

  const fragments = profession
    .split(/[;,/]/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  const tokens: string[] = [];

  const pushCanonical = (value: string): boolean => {
    const canonical = getCanonicalProfession(value, aliasMap);
    if (canonical && !tokens.includes(canonical)) {
      tokens.push(canonical);
      return true;
    }

    return Boolean(canonical);
  };

  for (const fragment of fragments) {
    if (pushCanonical(fragment)) {
      continue;
    }

    for (const part of fragment.split(/\s+/)) {
      if (pushCanonical(part)) {
        break;
      }
    }
  }

  return {
    profession,
    tokens,
  };
};

export const TEMPLATE_PROFESSIONS: readonly ProfessionDefinition[] = [
  {
    label: "Agriculteur",
    aliases: ["Agricultrice", "Fermier", "Fermière", "Cultivateur", "Cultivatrice"],
  },
  {
    label: "Artisan",
    aliases: ["Artisane", "Maître artisan", "Maîtresse artisane"],
  },
  {
    label: "Boulanger",
    aliases: ["Boulangère", "Pâtissier", "Pâtissière"],
  },
  {
    label: "Charpentier",
    aliases: ["Charpentière", "Menuisier", "Menuisière"],
  },
  {
    label: "Instituteur",
    aliases: ["Institutrice", "Enseignant", "Enseignante", "Maître d'école", "Maîtresse d'école"],
  },
  {
    label: "Marchand",
    aliases: ["Marchande", "Commerçant", "Commerçante"],
  },
  {
    label: "Médecin",
    aliases: ["Docteur", "Docteure", "Médecin de campagne", "Chirurgien", "Chirurgienne"],
  },
  {
    label: "Notaire",
    aliases: ["Clerc de notaire", "Officier public"],
  },
  {
    label: "Ouvrier",
    aliases: ["Ouvrière", "Manœuvre", "Travailleur", "Travailleuse"],
  },
  {
    label: "Tailleur",
    aliases: ["Tailleur d'habits", "Tailleur de pierre", "Couturier", "Couturière"],
  },
];
