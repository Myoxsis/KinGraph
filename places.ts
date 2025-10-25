export type PlaceCategory =
  | "country"
  | "state"
  | "region"
  | "department"
  | "city"
  | "territory";

export type PlaceDefinition = {
  label: string;
  aliases?: string[];
  category?: PlaceCategory;
};

export type PlaceMatch = {
  fragment: string;
  canonical: string;
  category?: PlaceCategory;
};

export type ParsedPlace = {
  place: string;
  tokens: string[];
  matches: PlaceMatch[];
};

const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’]/g, "")
    .replace(/[-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const collapseSpaces = (value: string): string => value.replace(/\s+/g, "");

const FRENCH_COUNTRIES: readonly PlaceDefinition[] = [
  {
    label: "France",
    aliases: [
      "République française",
      "Republique francaise",
      "French Republic",
      "FR",
      "FRA",
    ],
    category: "country",
  },
  {
    label: "Belgique",
    aliases: ["Belgium", "Royaume de Belgique", "BE"],
    category: "country",
  },
  {
    label: "Suisse",
    aliases: ["Switzerland", "Confédération suisse", "Confederation suisse", "CH"],
    category: "country",
  },
  {
    label: "Allemagne",
    aliases: ["Germany", "DE", "Bundesrepublik Deutschland"],
    category: "country",
  },
  {
    label: "Italie",
    aliases: ["Italy", "IT", "Repubblica Italiana"],
    category: "country",
  },
  {
    label: "Espagne",
    aliases: ["Spain", "ES", "Reino de España", "Reino de Espana"],
    category: "country",
  },
  {
    label: "Luxembourg",
    aliases: ["Grand-Duché de Luxembourg", "Grand Duche de Luxembourg", "LU"],
    category: "country",
  },
  {
    label: "Royaume-Uni",
    aliases: [
      "Royaume Uni",
      "United Kingdom",
      "UK",
      "Grande-Bretagne",
      "Great Britain",
      "Angleterre",
      "England",
    ],
    category: "country",
  },
  {
    label: "Irlande",
    aliases: ["Ireland", "Éire", "Eire", "IE"],
    category: "country",
  },
  {
    label: "Pays-Bas",
    aliases: ["Pays Bas", "Netherlands", "Hollande", "NL"],
    category: "country",
  },
  {
    label: "Portugal",
    aliases: ["PT", "República Portuguesa", "Republica Portuguesa"],
    category: "country",
  },
  {
    label: "États-Unis",
    aliases: [
      "Etats Unis",
      "United States",
      "USA",
      "US",
      "America",
      "États-Unis d'Amérique",
      "Etats Unis d Amerique",
    ],
    category: "country",
  },
  {
    label: "Canada",
    aliases: ["CA", "Dominion of Canada"],
    category: "country",
  },
  {
    label: "Algérie",
    aliases: ["Algerie", "Algeria", "DZ", "Algérie française", "Algerie francaise"],
    category: "country",
  },
  {
    label: "Maroc",
    aliases: ["Morocco", "MA", "Royaume du Maroc"],
    category: "country",
  },
  {
    label: "Tunisie",
    aliases: ["Tunisia", "TN", "République tunisienne", "Republique tunisienne"],
    category: "country",
  },
];

const FRENCH_REGIONS: readonly PlaceDefinition[] = [
  {
    label: "Auvergne-Rhône-Alpes",
    aliases: ["Auvergne", "Rhône-Alpes", "Rhone-Alpes", "Auvergne Rhone Alpes"],
    category: "region",
  },
  {
    label: "Bourgogne-Franche-Comté",
    aliases: ["Bourgogne", "Franche-Comté", "Franche Comte"],
    category: "region",
  },
  {
    label: "Bretagne",
    aliases: ["Brittany", "Breizh"],
    category: "region",
  },
  {
    label: "Centre-Val de Loire",
    aliases: ["Centre", "Centre Val de Loire", "Région Centre", "Region Centre"],
    category: "region",
  },
  {
    label: "Corse",
    aliases: ["Corsica", "Île de Beauté", "Ile de Beaute"],
    category: "region",
  },
  {
    label: "Grand Est",
    aliases: ["Alsace", "Lorraine", "Champagne-Ardenne", "Champagne Ardenne"],
    category: "region",
  },
  {
    label: "Hauts-de-France",
    aliases: [
      "Hauts de France",
      "Nord-Pas-de-Calais",
      "Nord Pas de Calais",
      "Picardie",
    ],
    category: "region",
  },
  {
    label: "Île-de-France",
    aliases: ["Ile de France", "Île de France", "Region parisienne", "Région parisienne", "IDF"],
    category: "region",
  },
  {
    label: "Normandie",
    aliases: ["Normandy", "Haute-Normandie", "Basse-Normandie", "Haute Normandie", "Basse Normandie"],
    category: "region",
  },
  {
    label: "Nouvelle-Aquitaine",
    aliases: ["Aquitaine", "Limousin", "Poitou-Charentes", "Poitou Charentes"],
    category: "region",
  },
  {
    label: "Occitanie",
    aliases: [
      "Midi-Pyrénées",
      "Midi Pyrenees",
      "Languedoc-Roussillon",
      "Languedoc Roussillon",
      "Occitania",
    ],
    category: "region",
  },
  {
    label: "Pays de la Loire",
    aliases: ["Pays de Loire", "Pays Loire"],
    category: "region",
  },
  {
    label: "Provence-Alpes-Côte d'Azur",
    aliases: ["Provence", "PACA", "Provence Alpes Cote d Azur"],
    category: "region",
  },
];

const FRENCH_DEPARTMENTS: readonly PlaceDefinition[] = [
  { label: "Ain", aliases: ["01", "1", "Ain (01)", "01 Ain"], category: "department" },
  { label: "Aisne", aliases: ["02", "2", "Aisne (02)", "02 Aisne"], category: "department" },
  { label: "Allier", aliases: ["03", "3", "Allier (03)", "03 Allier"], category: "department" },
  {
    label: "Alpes-de-Haute-Provence",
    aliases: ["04", "4", "Alpes-de-Haute-Provence (04)", "04 Alpes-de-Haute-Provence"],
    category: "department",
  },
  { label: "Hautes-Alpes", aliases: ["05", "5", "Hautes-Alpes (05)", "05 Hautes-Alpes"], category: "department" },
  { label: "Alpes-Maritimes", aliases: ["06", "6", "Alpes-Maritimes (06)", "06 Alpes-Maritimes"], category: "department" },
  { label: "Ardèche", aliases: ["07", "7", "Ardèche (07)", "07 Ardèche"], category: "department" },
  { label: "Ardennes", aliases: ["08", "8", "Ardennes (08)", "08 Ardennes"], category: "department" },
  { label: "Ariège", aliases: ["09", "9", "Ariège (09)", "09 Ariège"], category: "department" },
  { label: "Aube", aliases: ["10", "Aube (10)", "10 Aube"], category: "department" },
  { label: "Aude", aliases: ["11", "Aude (11)", "11 Aude"], category: "department" },
  { label: "Aveyron", aliases: ["12", "Aveyron (12)", "12 Aveyron"], category: "department" },
  {
    label: "Bouches-du-Rhône",
    aliases: ["13", "Bouches-du-Rhône (13)", "13 Bouches-du-Rhône"],
    category: "department",
  },
  { label: "Calvados", aliases: ["14", "Calvados (14)", "14 Calvados"], category: "department" },
  { label: "Cantal", aliases: ["15", "Cantal (15)", "15 Cantal"], category: "department" },
  { label: "Charente", aliases: ["16", "Charente (16)", "16 Charente"], category: "department" },
  {
    label: "Charente-Maritime",
    aliases: ["17", "Charente-Maritime (17)", "17 Charente-Maritime"],
    category: "department",
  },
  { label: "Cher", aliases: ["18", "Cher (18)", "18 Cher"], category: "department" },
  { label: "Corrèze", aliases: ["19", "Corrèze (19)", "19 Corrèze"], category: "department" },
  {
    label: "Corse-du-Sud",
    aliases: ["2A", "Corse-du-Sud (2A)", "2A Corse-du-Sud", "20A", "Corse du Sud"],
    category: "department",
  },
  {
    label: "Haute-Corse",
    aliases: ["2B", "Haute-Corse (2B)", "2B Haute-Corse", "20B", "Haute Corse"],
    category: "department",
  },
  { label: "Côte-d'Or", aliases: ["21", "Côte-d'Or (21)", "21 Côte-d'Or"], category: "department" },
  {
    label: "Côtes-d'Armor",
    aliases: ["22", "Côtes-d'Armor (22)", "22 Côtes-d'Armor"],
    category: "department",
  },
  { label: "Creuse", aliases: ["23", "Creuse (23)", "23 Creuse"], category: "department" },
  { label: "Dordogne", aliases: ["24", "Dordogne (24)", "24 Dordogne"], category: "department" },
  { label: "Doubs", aliases: ["25", "Doubs (25)", "25 Doubs"], category: "department" },
  { label: "Drôme", aliases: ["26", "Drôme (26)", "26 Drôme"], category: "department" },
  { label: "Eure", aliases: ["27", "Eure (27)", "27 Eure"], category: "department" },
  { label: "Eure-et-Loir", aliases: ["28", "Eure-et-Loir (28)", "28 Eure-et-Loir"], category: "department" },
  { label: "Finistère", aliases: ["29", "Finistère (29)", "29 Finistère"], category: "department" },
  { label: "Gard", aliases: ["30", "Gard (30)", "30 Gard"], category: "department" },
  {
    label: "Haute-Garonne",
    aliases: ["31", "Haute-Garonne (31)", "31 Haute-Garonne"],
    category: "department",
  },
  { label: "Gers", aliases: ["32", "Gers (32)", "32 Gers"], category: "department" },
  { label: "Gironde", aliases: ["33", "Gironde (33)", "33 Gironde"], category: "department" },
  { label: "Hérault", aliases: ["34", "Hérault (34)", "34 Hérault"], category: "department" },
  {
    label: "Ille-et-Vilaine",
    aliases: ["35", "Ille-et-Vilaine (35)", "35 Ille-et-Vilaine"],
    category: "department",
  },
  { label: "Indre", aliases: ["36", "Indre (36)", "36 Indre"], category: "department" },
  {
    label: "Indre-et-Loire",
    aliases: ["37", "Indre-et-Loire (37)", "37 Indre-et-Loire"],
    category: "department",
  },
  { label: "Isère", aliases: ["38", "Isère (38)", "38 Isère"], category: "department" },
  { label: "Jura", aliases: ["39", "Jura (39)", "39 Jura"], category: "department" },
  { label: "Landes", aliases: ["40", "Landes (40)", "40 Landes"], category: "department" },
  { label: "Loir-et-Cher", aliases: ["41", "Loir-et-Cher (41)", "41 Loir-et-Cher"], category: "department" },
  { label: "Loire", aliases: ["42", "Loire (42)", "42 Loire"], category: "department" },
  { label: "Haute-Loire", aliases: ["43", "Haute-Loire (43)", "43 Haute-Loire"], category: "department" },
  {
    label: "Loire-Atlantique",
    aliases: ["44", "Loire-Atlantique (44)", "44 Loire-Atlantique"],
    category: "department",
  },
  { label: "Loiret", aliases: ["45", "Loiret (45)", "45 Loiret"], category: "department" },
  { label: "Lot", aliases: ["46", "Lot (46)", "46 Lot"], category: "department" },
  {
    label: "Lot-et-Garonne",
    aliases: ["47", "Lot-et-Garonne (47)", "47 Lot-et-Garonne"],
    category: "department",
  },
  { label: "Lozère", aliases: ["48", "Lozère (48)", "48 Lozère"], category: "department" },
  {
    label: "Maine-et-Loire",
    aliases: ["49", "Maine-et-Loire (49)", "49 Maine-et-Loire"],
    category: "department",
  },
  { label: "Manche", aliases: ["50", "Manche (50)", "50 Manche"], category: "department" },
  { label: "Marne", aliases: ["51", "Marne (51)", "51 Marne"], category: "department" },
  {
    label: "Haute-Marne",
    aliases: ["52", "Haute-Marne (52)", "52 Haute-Marne"],
    category: "department",
  },
  { label: "Mayenne", aliases: ["53", "Mayenne (53)", "53 Mayenne"], category: "department" },
  {
    label: "Meurthe-et-Moselle",
    aliases: ["54", "Meurthe-et-Moselle (54)", "54 Meurthe-et-Moselle"],
    category: "department",
  },
  { label: "Meuse", aliases: ["55", "Meuse (55)", "55 Meuse"], category: "department" },
  { label: "Morbihan", aliases: ["56", "Morbihan (56)", "56 Morbihan"], category: "department" },
  { label: "Moselle", aliases: ["57", "Moselle (57)", "57 Moselle"], category: "department" },
  { label: "Nièvre", aliases: ["58", "Nièvre (58)", "58 Nièvre"], category: "department" },
  { label: "Nord", aliases: ["59", "Nord (59)", "59 Nord"], category: "department" },
  { label: "Oise", aliases: ["60", "Oise (60)", "60 Oise"], category: "department" },
  { label: "Orne", aliases: ["61", "Orne (61)", "61 Orne"], category: "department" },
  {
    label: "Pas-de-Calais",
    aliases: ["62", "Pas-de-Calais (62)", "62 Pas-de-Calais"],
    category: "department",
  },
  {
    label: "Puy-de-Dôme",
    aliases: ["63", "Puy-de-Dôme (63)", "63 Puy-de-Dôme"],
    category: "department",
  },
  {
    label: "Pyrénées-Atlantiques",
    aliases: ["64", "Pyrénées-Atlantiques (64)", "64 Pyrénées-Atlantiques"],
    category: "department",
  },
  {
    label: "Hautes-Pyrénées",
    aliases: ["65", "Hautes-Pyrénées (65)", "65 Hautes-Pyrénées"],
    category: "department",
  },
  {
    label: "Pyrénées-Orientales",
    aliases: ["66", "Pyrénées-Orientales (66)", "66 Pyrénées-Orientales"],
    category: "department",
  },
  { label: "Bas-Rhin", aliases: ["67", "Bas-Rhin (67)", "67 Bas-Rhin"], category: "department" },
  { label: "Haut-Rhin", aliases: ["68", "Haut-Rhin (68)", "68 Haut-Rhin"], category: "department" },
  {
    label: "Rhône",
    aliases: ["69", "Rhône (69)", "69 Rhône", "Rhône-Alpes", "Rhone", "Departement du Rhone"],
    category: "department",
  },
  { label: "Haute-Saône", aliases: ["70", "Haute-Saône (70)", "70 Haute-Saône"], category: "department" },
  {
    label: "Saône-et-Loire",
    aliases: ["71", "Saône-et-Loire (71)", "71 Saône-et-Loire"],
    category: "department",
  },
  { label: "Sarthe", aliases: ["72", "Sarthe (72)", "72 Sarthe"], category: "department" },
  { label: "Savoie", aliases: ["73", "Savoie (73)", "73 Savoie"], category: "department" },
  {
    label: "Haute-Savoie",
    aliases: ["74", "Haute-Savoie (74)", "74 Haute-Savoie"],
    category: "department",
  },
  {
    label: "Seine-Maritime",
    aliases: ["76", "Seine-Maritime (76)", "76 Seine-Maritime"],
    category: "department",
  },
  {
    label: "Seine-et-Marne",
    aliases: ["77", "Seine-et-Marne (77)", "77 Seine-et-Marne"],
    category: "department",
  },
  { label: "Yvelines", aliases: ["78", "Yvelines (78)", "78 Yvelines"], category: "department" },
  {
    label: "Deux-Sèvres",
    aliases: ["79", "Deux-Sèvres (79)", "79 Deux-Sèvres"],
    category: "department",
  },
  { label: "Somme", aliases: ["80", "Somme (80)", "80 Somme"], category: "department" },
  { label: "Tarn", aliases: ["81", "Tarn (81)", "81 Tarn"], category: "department" },
  {
    label: "Tarn-et-Garonne",
    aliases: ["82", "Tarn-et-Garonne (82)", "82 Tarn-et-Garonne"],
    category: "department",
  },
  { label: "Var", aliases: ["83", "Var (83)", "83 Var"], category: "department" },
  { label: "Vaucluse", aliases: ["84", "Vaucluse (84)", "84 Vaucluse"], category: "department" },
  { label: "Vendée", aliases: ["85", "Vendée (85)", "85 Vendée"], category: "department" },
  { label: "Vienne", aliases: ["86", "Vienne (86)", "86 Vienne"], category: "department" },
  {
    label: "Haute-Vienne",
    aliases: ["87", "Haute-Vienne (87)", "87 Haute-Vienne"],
    category: "department",
  },
  { label: "Vosges", aliases: ["88", "Vosges (88)", "88 Vosges"], category: "department" },
  { label: "Yonne", aliases: ["89", "Yonne (89)", "89 Yonne"], category: "department" },
  {
    label: "Territoire de Belfort",
    aliases: ["90", "Territoire de Belfort (90)", "90 Territoire de Belfort"],
    category: "department",
  },
  { label: "Essonne", aliases: ["91", "Essonne (91)", "91 Essonne"], category: "department" },
  {
    label: "Hauts-de-Seine",
    aliases: ["92", "Hauts-de-Seine (92)", "92 Hauts-de-Seine", "Departement des Hauts de Seine"],
    category: "department",
  },
  {
    label: "Seine-Saint-Denis",
    aliases: [
      "93",
      "Seine-Saint-Denis (93)",
      "93 Seine-Saint-Denis",
      "Departement de la Seine Saint Denis",
    ],
    category: "department",
  },
  {
    label: "Val-de-Marne",
    aliases: [
      "94",
      "Val-de-Marne (94)",
      "94 Val-de-Marne",
      "Departement du Val de Marne",
    ],
    category: "department",
  },
  {
    label: "Val-d'Oise",
    aliases: [
      "95",
      "Val-d'Oise (95)",
      "95 Val-d'Oise",
      "Departement du Val d Oise",
    ],
    category: "department",
  },
  {
    label: "Guadeloupe",
    aliases: ["971", "Guadeloupe (971)", "971 Guadeloupe", "971e", "Departement de la Guadeloupe"],
    category: "department",
  },
  {
    label: "Martinique",
    aliases: ["972", "Martinique (972)", "972 Martinique", "972e", "Departement de la Martinique"],
    category: "department",
  },
  {
    label: "Guyane",
    aliases: ["973", "Guyane (973)", "973 Guyane", "973e", "Departement de la Guyane"],
    category: "department",
  },
  {
    label: "La Réunion",
    aliases: ["974", "La Réunion (974)", "974 La Réunion", "974e", "Departement de la Reunion"],
    category: "department",
  },
  {
    label: "Saint-Pierre-et-Miquelon",
    aliases: ["975", "Saint-Pierre-et-Miquelon (975)", "975 Saint-Pierre-et-Miquelon"],
    category: "territory",
  },
  {
    label: "Mayotte",
    aliases: ["976", "Mayotte (976)", "976 Mayotte", "976e", "Departement de Mayotte"],
    category: "department",
  },
  {
    label: "Saint-Barthélemy",
    aliases: ["977", "Saint-Barthélemy (977)", "977 Saint-Barthélemy"],
    category: "territory",
  },
  {
    label: "Saint-Martin",
    aliases: ["978", "Saint-Martin (978)", "978 Saint-Martin"],
    category: "territory",
  },
  {
    label: "Terres australes et antarctiques françaises",
    aliases: [
      "984",
      "Terres australes et antarctiques françaises (984)",
      "984 Terres australes et antarctiques françaises",
    ],
    category: "territory",
  },
  {
    label: "Wallis-et-Futuna",
    aliases: ["986", "Wallis-et-Futuna (986)", "986 Wallis-et-Futuna"],
    category: "territory",
  },
  {
    label: "Polynésie française",
    aliases: ["987", "Polynésie française (987)", "987 Polynésie française"],
    category: "territory",
  },
  {
    label: "Nouvelle-Calédonie",
    aliases: ["988", "Nouvelle-Calédonie (988)", "988 Nouvelle-Calédonie"],
    category: "territory",
  },
  {
    label: "Île de Clipperton",
    aliases: ["989", "Île de Clipperton (989)", "989 Île de Clipperton"],
    category: "territory",
  },
];

const FRENCH_CITIES: readonly PlaceDefinition[] = [
  {
    label: "Paris",
    aliases: ["75", "Paris (75)", "75 Paris", "Ville de Paris", "Paris, France", "Departement de Paris", "75e"],
    category: "city",
  },
  { label: "Marseille", aliases: ["Marseille, France", "Ville de Marseille"], category: "city" },
  { label: "Lyon", aliases: ["Lyon, France", "Ville de Lyon"], category: "city" },
  { label: "Toulouse", aliases: ["Toulouse, France", "Ville de Toulouse"], category: "city" },
  { label: "Nice", aliases: ["Nice, France", "Ville de Nice"], category: "city" },
  { label: "Nantes", aliases: ["Nantes, France", "Ville de Nantes"], category: "city" },
  { label: "Strasbourg", aliases: ["Strasbourg, France", "Ville de Strasbourg"], category: "city" },
  { label: "Montpellier", aliases: ["Montpellier, France", "Ville de Montpellier"], category: "city" },
  { label: "Bordeaux", aliases: ["Bordeaux, France", "Ville de Bordeaux"], category: "city" },
  { label: "Lille", aliases: ["Lille, France", "Ville de Lille"], category: "city" },
  { label: "Rennes", aliases: ["Rennes, France", "Ville de Rennes"], category: "city" },
  { label: "Grenoble", aliases: ["Grenoble, France", "Ville de Grenoble"], category: "city" },
];

export const TEMPLATE_PLACES: readonly PlaceDefinition[] = [
  ...FRENCH_COUNTRIES,
  ...FRENCH_REGIONS,
  ...FRENCH_DEPARTMENTS,
  ...FRENCH_CITIES,
];

type AliasEntry = { label: string; category?: PlaceCategory };

const createAliasMap = (
  definitions: readonly PlaceDefinition[],
): Map<string, AliasEntry> => {
  const map = new Map<string, AliasEntry>();

  for (const definition of definitions) {
    const normalizedLabel = normalizeToken(definition.label);
    const entry: AliasEntry = { label: definition.label, category: definition.category };
    map.set(normalizedLabel, entry);
    map.set(collapseSpaces(normalizedLabel), entry);

    if (!definition.aliases) {
      continue;
    }

    for (const alias of definition.aliases) {
      const normalizedAlias = normalizeToken(alias);
      if (!normalizedAlias) {
        continue;
      }

      map.set(normalizedAlias, entry);
      map.set(collapseSpaces(normalizedAlias), entry);
    }
  }

  return map;
};

const getCanonicalPlace = (
  value: string,
  map: Map<string, AliasEntry>,
): AliasEntry | undefined => {
  const normalized = normalizeToken(value);
  const collapsed = collapseSpaces(normalized);
  return map.get(normalized) ?? map.get(collapsed);
};

export const parsePlace = (
  text: string,
  definitions: readonly PlaceDefinition[] = TEMPLATE_PLACES,
): ParsedPlace => {
  const place = text.trim();
  if (!place) {
    return { place: "", tokens: [], matches: [] };
  }

  const fragments = place
    .split(/[;,]/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  const aliasMap = createAliasMap(definitions);
  const tokens: string[] = [];
  const matches: PlaceMatch[] = [];

  for (const fragment of fragments) {
    const canonical = getCanonicalPlace(fragment, aliasMap);
    if (!canonical) {
      continue;
    }

    if (!tokens.includes(canonical.label)) {
      tokens.push(canonical.label);
    }

    matches.push({
      fragment,
      canonical: canonical.label,
      category: canonical.category,
    });
  }

  return {
    place,
    tokens,
    matches,
  };
};
