export type ParsedPlace = {
  place: string;
  tokens: string[];
};

const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\s+/g, " ")
    .trim();

const collapseSpaces = (value: string): string => value.replace(/\s+/g, "");

const COUNTRY_ALIASES = new Map<string, string>([
  ["united states", "United States"],
  ["unitedstates", "United States"],
  ["usa", "United States"],
  ["us", "United States"],
  ["america", "United States"],
  ["canada", "Canada"],
  ["mexico", "Mexico"],
  ["brazil", "Brazil"],
  ["argentina", "Argentina"],
  ["chile", "Chile"],
  ["colombia", "Colombia"],
  ["peru", "Peru"],
  ["united kingdom", "United Kingdom"],
  ["unitedkingdom", "United Kingdom"],
  ["uk", "United Kingdom"],
  ["england", "England"],
  ["scotland", "Scotland"],
  ["wales", "Wales"],
  ["ireland", "Ireland"],
  ["france", "France"],
  ["germany", "Germany"],
  ["italy", "Italy"],
  ["spain", "Spain"],
  ["portugal", "Portugal"],
  ["netherlands", "Netherlands"],
  ["belgium", "Belgium"],
  ["switzerland", "Switzerland"],
  ["sweden", "Sweden"],
  ["norway", "Norway"],
  ["denmark", "Denmark"],
  ["finland", "Finland"],
  ["iceland", "Iceland"],
  ["austria", "Austria"],
  ["poland", "Poland"],
  ["czech republic", "Czech Republic"],
  ["czechrepublic", "Czech Republic"],
  ["hungary", "Hungary"],
  ["romania", "Romania"],
  ["russia", "Russia"],
  ["ukraine", "Ukraine"],
  ["china", "China"],
  ["india", "India"],
  ["japan", "Japan"],
  ["south korea", "South Korea"],
  ["southkorea", "South Korea"],
  ["korea", "South Korea"],
  ["philippines", "Philippines"],
  ["vietnam", "Vietnam"],
  ["thailand", "Thailand"],
  ["indonesia", "Indonesia"],
  ["australia", "Australia"],
  ["new zealand", "New Zealand"],
  ["newzealand", "New Zealand"],
  ["south africa", "South Africa"],
  ["southafrica", "South Africa"],
  ["egypt", "Egypt"],
]);

const STATE_ALIASES = new Map<string, string>([
  ["alabama", "Alabama"],
  ["al", "Alabama"],
  ["alaska", "Alaska"],
  ["ak", "Alaska"],
  ["arizona", "Arizona"],
  ["az", "Arizona"],
  ["arkansas", "Arkansas"],
  ["ar", "Arkansas"],
  ["california", "California"],
  ["ca", "California"],
  ["colorado", "Colorado"],
  ["co", "Colorado"],
  ["connecticut", "Connecticut"],
  ["ct", "Connecticut"],
  ["delaware", "Delaware"],
  ["de", "Delaware"],
  ["florida", "Florida"],
  ["fl", "Florida"],
  ["georgia", "Georgia"],
  ["ga", "Georgia"],
  ["hawaii", "Hawaii"],
  ["hi", "Hawaii"],
  ["idaho", "Idaho"],
  ["id", "Idaho"],
  ["illinois", "Illinois"],
  ["il", "Illinois"],
  ["indiana", "Indiana"],
  ["in", "Indiana"],
  ["iowa", "Iowa"],
  ["ia", "Iowa"],
  ["kansas", "Kansas"],
  ["ks", "Kansas"],
  ["kentucky", "Kentucky"],
  ["ky", "Kentucky"],
  ["louisiana", "Louisiana"],
  ["la", "Louisiana"],
  ["maine", "Maine"],
  ["me", "Maine"],
  ["maryland", "Maryland"],
  ["md", "Maryland"],
  ["massachusetts", "Massachusetts"],
  ["ma", "Massachusetts"],
  ["michigan", "Michigan"],
  ["mi", "Michigan"],
  ["minnesota", "Minnesota"],
  ["mn", "Minnesota"],
  ["mississippi", "Mississippi"],
  ["ms", "Mississippi"],
  ["missouri", "Missouri"],
  ["mo", "Missouri"],
  ["montana", "Montana"],
  ["mt", "Montana"],
  ["nebraska", "Nebraska"],
  ["ne", "Nebraska"],
  ["nevada", "Nevada"],
  ["nv", "Nevada"],
  ["new hampshire", "New Hampshire"],
  ["newhampshire", "New Hampshire"],
  ["nh", "New Hampshire"],
  ["new jersey", "New Jersey"],
  ["newjersey", "New Jersey"],
  ["nj", "New Jersey"],
  ["new mexico", "New Mexico"],
  ["newmexico", "New Mexico"],
  ["nm", "New Mexico"],
  ["new york", "New York"],
  ["newyork", "New York"],
  ["ny", "New York"],
  ["north carolina", "North Carolina"],
  ["northcarolina", "North Carolina"],
  ["nc", "North Carolina"],
  ["north dakota", "North Dakota"],
  ["northdakota", "North Dakota"],
  ["nd", "North Dakota"],
  ["ohio", "Ohio"],
  ["oh", "Ohio"],
  ["oklahoma", "Oklahoma"],
  ["ok", "Oklahoma"],
  ["oregon", "Oregon"],
  ["or", "Oregon"],
  ["pennsylvania", "Pennsylvania"],
  ["pa", "Pennsylvania"],
  ["rhode island", "Rhode Island"],
  ["rhodeisland", "Rhode Island"],
  ["ri", "Rhode Island"],
  ["south carolina", "South Carolina"],
  ["southcarolina", "South Carolina"],
  ["sc", "South Carolina"],
  ["south dakota", "South Dakota"],
  ["southdakota", "South Dakota"],
  ["sd", "South Dakota"],
  ["tennessee", "Tennessee"],
  ["tn", "Tennessee"],
  ["texas", "Texas"],
  ["tx", "Texas"],
  ["utah", "Utah"],
  ["ut", "Utah"],
  ["vermont", "Vermont"],
  ["vt", "Vermont"],
  ["virginia", "Virginia"],
  ["va", "Virginia"],
  ["washington", "Washington"],
  ["wa", "Washington"],
  ["west virginia", "West Virginia"],
  ["westvirginia", "West Virginia"],
  ["wv", "West Virginia"],
  ["wisconsin", "Wisconsin"],
  ["wi", "Wisconsin"],
  ["wyoming", "Wyoming"],
  ["wy", "Wyoming"],
  ["district of columbia", "District of Columbia"],
  ["districtofcolumbia", "District of Columbia"],
  ["dc", "District of Columbia"],
]);

const getCanonicalPlace = (value: string, map: Map<string, string>): string | undefined => {
  const normalized = normalizeToken(value);
  const collapsed = collapseSpaces(normalized);
  return map.get(normalized) ?? map.get(collapsed);
};

export const parsePlace = (text: string): ParsedPlace => {
  const place = text.trim();
  if (!place) {
    return { place, tokens: [] };
  }

  const fragments = place
    .split(/[;,]/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  const tokens: string[] = [];

  for (const fragment of fragments) {
    const country = getCanonicalPlace(fragment, COUNTRY_ALIASES);
    if (country) {
      tokens.push(fragment);
      continue;
    }

    const state = getCanonicalPlace(fragment, STATE_ALIASES);
    if (state) {
      tokens.push(fragment);
    }
  }

  return {
    place,
    tokens,
  };
};
