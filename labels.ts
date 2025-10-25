const LABELS = {
  name: ["name", "full name", "person", "individual"],
  given: ["given", "forename", "first name", "prénom", "vorname"],
  surname: ["surname", "last name", "nom", "nachname"],
  maiden: ["maiden", "née", "nee"],
  birth: ["birth", "born", "geburt", "naissance"],
  death: ["death", "died", "décès", "tod"],
  residence: ["residence", "address", "domicile"],
  father: ["father", "dad", "père", "vater"],
  mother: ["mother", "mom", "mère", "mutter"],
  spouse: ["spouse", "husband", "wife", "époux", "épouse"],
  child: ["child", "son", "daughter", "enfant", "kind"],
  occupation: ["occupation", "profession", "emploi", "beruf"],
  religion: ["religion", "confession"],
} as const;

export type LabelKey = keyof typeof LABELS;

export default LABELS;
