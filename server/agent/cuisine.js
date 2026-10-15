// Hostwise's own menu library: Qloo tells us which cuisines a table leans towards;
// this file turns a cuisine into a cookable, home-scale menu. Dishes are written by
// Rui Codex for this project (not Qloo data). Dietary needs never leave the server:
// they are matched here against the dish flags and are not sent to Qloo.
//
// Flags: v vegetarian, vg vegan, gf gluten-free, df dairy-free, nf nut-free.

export const DIETS = {
  vegetarian: { label: "Vegetarian", needs: ["v"] },
  vegan: { label: "Vegan", needs: ["v", "vg", "df"] },
  gluten_free: { label: "Gluten-free", needs: ["gf"] },
  dairy_free: { label: "Dairy-free", needs: ["df"] },
  nut_free: { label: "Nut allergy", needs: ["nf"] },
  no_alcohol: { label: "No alcohol", needs: [] },
};

const d = (name, flags) => ({ name, flags: flags.split(" ").filter(Boolean) });

export const CUISINES = [
  {
    key: "french", label: "French bistro", match: /\b(french|bistro|brasserie)\b/,
    mood: "Candlelit Paris side-street: slow courses, butter and herbs.",
    starter: [d("Leek vinaigrette with soft egg and chives", "v gf df nf"), d("Radishes, good butter and flaky salt", "v gf nf"), d("Herbed white bean and leek tartines", "v vg df nf")],
    main: [d("Coq au vin with buttered potatoes", "gf nf"), d("Ratatouille tian with herbed lentils", "v vg gf df nf")],
    dessert: [d("Tarte tatin with crème fraîche", "v nf"), d("Poached pears in spiced red wine", "v vg gf df nf")],
    drink: "Beaujolais or a dry Normandy cider", zeroProof: "Sparkling apple and thyme spritz",
  },
  {
    key: "italian", label: "Italian trattoria", match: /\b(italian|trattoria|pizza|pasta)\b/,
    mood: "Long-table trattoria: everything shared, nothing rushed.",
    starter: [d("Burrata, blistered tomatoes and basil", "v gf nf"), d("Marinated peppers and white bean bruschetta", "v vg df nf")],
    main: [d("Slow-cooked ragù with pappardelle", "nf"), d("Wild mushroom risotto with lemon and herbs", "v vg gf df nf")],
    dessert: [d("Tiramisu", "v nf"), d("Blood-orange granita", "v vg gf df nf")],
    drink: "Chianti Classico", zeroProof: "Blood orange and rosemary soda",
  },
  {
    key: "mediterranean", label: "Mediterranean mezze", match: /\b(mediterranean|greek|lebanese|middle eastern|falafel|turkish|israeli|persian|mezze)\b/,
    mood: "Sunlit mezze spread: lots of small plates, lots of reaching across.",
    starter: [d("Hummus, warm flatbread and za'atar oil", "v vg df nf"), d("Charred aubergine with pomegranate", "v vg gf df nf")],
    main: [d("Lemon-garlic chicken with herby freekeh", "df nf"), d("Spiced chickpea and spinach stew with rice", "v vg gf df nf")],
    dessert: [d("Orange blossom yoghurt with honey and pistachio", "v gf"), d("Dates, oranges and mint", "v vg gf df nf")],
    drink: "A crisp Assyrtiko", zeroProof: "Mint lemonade with orange blossom",
  },
  {
    key: "spanish", label: "Spanish tapas", match: /\b(spanish|tapas|basque|catalan)\b/,
    mood: "Late-night tapas bar: graze, talk, order one more round.",
    starter: [d("Pan con tomate", "v vg df nf"), d("Patatas bravas with smoked paprika", "v vg gf df nf")],
    main: [d("Chicken and chorizo paella", "gf df nf"), d("Saffron vegetable paella", "v vg gf df nf")],
    dessert: [d("Basque burnt cheesecake", "v gf nf"), d("Churros with dark chocolate", "v vg df nf")],
    drink: "Albariño or a young Rioja", zeroProof: "Tinto de verano without the tinto: grape and lemon soda",
  },
  {
    key: "mexican", label: "Mexican cantina", match: /\b(mexican|taco|tex-mex|cantina|burrito)\b/,
    mood: "Build-your-own taco table: loud, colourful, hands-on.",
    starter: [d("Guacamole and charred corn salsa with tortilla chips", "v vg gf df nf"), d("Elote with lime and chilli", "v gf nf")],
    main: [d("Slow-cooked chicken tinga tacos", "gf df nf"), d("Black bean and sweet potato tacos", "v vg gf df nf")],
    dessert: [d("Mexican chocolate pots", "v gf nf"), d("Mango with chilli and lime", "v vg gf df nf")],
    drink: "Paloma or a cold Mexican lager", zeroProof: "Grapefruit and lime agua fresca",
  },
  {
    key: "japanese", label: "Japanese izakaya", match: /\b(japanese|sushi|ramen|izakaya|udon)\b/,
    mood: "Izakaya evening: small plates, quiet precision, warm cups.",
    starter: [d("Edamame with sea salt", "v vg gf df nf"), d("Smashed cucumber with sesame and rice vinegar", "v vg df")],
    main: [d("Teriyaki salmon with steamed rice", "df nf"), d("Miso-glazed aubergine and tofu donburi", "v vg df nf")],
    dessert: [d("Matcha panna cotta", "v gf nf"), d("Sliced Asian pear and yuzu sorbet", "v vg gf df nf")],
    drink: "Cold junmai sake", zeroProof: "Iced genmaicha with yuzu",
  },
  {
    key: "korean", label: "Korean barbecue night", match: /\b(korean|bbq korean|kimchi)\b/,
    mood: "Table-top grill energy: everyone cooks a little.",
    starter: [d("Kimchi pancake", "v df nf"), d("Seasoned spinach and bean sprout banchan", "v vg df")],
    main: [d("Bulgogi lettuce wraps", "df nf"), d("Gochujang tofu and mushroom wraps", "v vg df nf")],
    dessert: [d("Sweet rice cakes with roasted soybean powder", "v vg gf df nf"), d("Pear poached with ginger", "v vg gf df nf")],
    drink: "Cold lager or makgeolli", zeroProof: "Barley tea over ice",
  },
  {
    key: "chinese", label: "Chinese family-style", match: /\b(chinese|dim sum|cantonese|sichuan|szechuan|dumpling)\b/,
    mood: "Lazy-Susan family style: abundance in the middle of the table.",
    starter: [d("Pan-fried pork dumplings", "df nf"), d("Smacked cucumber with chilli oil", "v vg df nf")],
    main: [d("Red-braised pork belly with greens", "df nf"), d("Mapo tofu with mushrooms and rice", "v vg df nf")],
    dessert: [d("Mango pudding", "v gf nf"), d("Sliced oranges with almond biscuits", "v df"), d("Ginger-poached pears with sesame", "v vg gf df nf")],
    drink: "Off-dry Riesling", zeroProof: "Chrysanthemum iced tea",
  },
  {
    key: "thai", label: "Thai street-food table", match: /\b(thai)\b/,
    mood: "Bright, sour, spicy, fresh: a market stall at home.",
    starter: [d("Green papaya salad", "v vg gf df"), d("Fresh rice-paper rolls with herbs", "v vg gf df nf")],
    main: [d("Green curry with chicken and jasmine rice", "gf df nf"), d("Pumpkin and tofu red curry", "v vg gf df nf")],
    dessert: [d("Mango sticky rice", "v vg gf df nf"), d("Coconut and lime sorbet", "v vg gf df nf")],
    drink: "Gewürztraminer", zeroProof: "Lemongrass and lime cooler",
  },
  {
    key: "vietnamese", label: "Vietnamese supper", match: /\b(vietnamese|pho|banh mi)\b/,
    mood: "Herb-heavy and fresh, with a slow bowl at the centre.",
    starter: [d("Summer rolls with peanut dip", "v vg gf df"), d("Pickled vegetable salad with herbs", "v vg gf df nf")],
    main: [d("Lemongrass chicken rice bowls", "gf df nf"), d("Caramelised tofu bún bowls", "v vg gf df nf")],
    dessert: [d("Coconut and pandan pudding", "v vg gf df nf"), d("Vietnamese iced-coffee affogato", "v gf nf")],
    drink: "Dry rosé", zeroProof: "Salted lime soda",
  },
  {
    key: "indian", label: "Indian feast", match: /\b(indian|curry house|punjabi|south indian|tandoori)\b/,
    mood: "Thali-style spread: warmth, spice, second helpings.",
    starter: [d("Onion bhajis with tamarind chutney", "v vg gf df nf"), d("Paneer tikka skewers", "v gf nf")],
    main: [d("Butter chicken with basmati", "gf"), d("Chana masala and dal with basmati", "v vg gf df nf")],
    dessert: [d("Cardamom rice pudding", "v gf"), d("Mango and lime with toasted coconut", "v vg gf df nf")],
    drink: "Off-dry Riesling or a pale ale", zeroProof: "Salted mango lassi or masala soda",
  },
  {
    key: "american", label: "American diner-supper", match: /\b(american|diner|burger|southern|soul food|steakhouse|barbecue|bbq|bar \+ grill|grill)\b/,
    mood: "Generous, nostalgic and loud: comfort food done carefully.",
    starter: [d("Wedge salad with buttermilk dressing", "v gf nf"), d("Charred corn and black-eyed pea salad", "v vg gf df nf")],
    main: [d("Smoky pulled-chicken sliders with slaw", "df nf"), d("Barbecue jackfruit sliders with slaw", "v vg df nf")],
    dessert: [d("Apple pie with vanilla ice cream", "v nf"), d("Grilled peaches with maple", "v vg gf df nf")],
    drink: "Zinfandel or an American IPA", zeroProof: "Iced tea with peach and mint",
  },
  {
    key: "british", label: "Modern British pub supper", match: /\b(british|gastropub|pub|english|irish|scottish)\b/,
    mood: "Gastropub cosy: a roaring-fire sort of meal.",
    starter: [d("Pea and mint soup", "v vg gf df nf"), d("Welsh rarebit toasts", "v nf")],
    main: [d("Chicken, leek and mushroom pie", "nf"), d("Root vegetable and lentil cottage pie", "v vg gf df nf")],
    dessert: [d("Sticky toffee pudding", "v nf"), d("Eton mess", "v gf nf"), d("Apple and blackberry oat crumble", "v vg df nf")],
    drink: "A best bitter or a Rhône red", zeroProof: "Elderflower pressé",
  },
  {
    key: "german", label: "Alpine Stube supper", match: /\b(german|austrian|alpine|swiss|bavarian|beer garden|schnitzel)\b/,
    mood: "Wooden-beamed warmth: hearty, simple, convivial.",
    starter: [d("Pretzels with obatzda", "v nf"), d("Warm potato salad with mustard and chives", "v vg gf df nf")],
    main: [d("Chicken schnitzel with lemon and cucumber salad", "df nf"), d("Käsespätzle with crispy onions", "v nf"), d("Mushroom and paprika goulash with potatoes", "v vg gf df nf")],
    dessert: [d("Apple strudel", "v vg df nf"), d("Baked apples with cinnamon", "v vg gf df nf")],
    drink: "Grüner Veltliner or a Märzen", zeroProof: "Apfelschorle",
  },
  {
    key: "nordic", label: "New Nordic kitchen table", match: /\b(scandinavian|nordic|danish|swedish|norwegian|finnish)\b/,
    mood: "Pale wood, candlelight and hygge: clean flavours.",
    starter: [d("Rye crispbread with beetroot and dill", "v vg df nf"), d("Cured salmon with mustard sauce", "gf nf")],
    main: [d("Roast cod with brown butter and potatoes", "gf nf"), d("Roasted celeriac with barley and herbs", "v vg df nf")],
    dessert: [d("Cardamom buns", "v nf"), d("Lingonberries and whipped oat cream", "v vg gf df nf")],
    drink: "Dry Riesling or a farmhouse ale", zeroProof: "Lingonberry and soda",
  },
  {
    key: "seafood", label: "Coastal seafood supper", match: /\b(seafood|fish|oyster|fish & chips|fish and chips|poke)\b/,
    mood: "Harbour-side and briny: lemons, bread and the sea.",
    starter: [d("Prawns with garlic and chilli", "gf df nf"), d("Grilled courgette with lemon and mint", "v vg gf df nf")],
    main: [d("Whole roasted sea bream with salsa verde", "gf df nf"), d("Fregola with tomatoes and capers", "v vg df nf")],
    dessert: [d("Lemon posset", "v gf nf"), d("Strawberries with balsamic and black pepper", "v vg gf df nf")],
    drink: "Muscadet", zeroProof: "Cucumber and lime tonic",
  },
  {
    key: "caribbean", label: "Caribbean cookout", match: /\b(caribbean|jamaican|cuban|puerto rican|latin american|latin)\b/,
    mood: "Warm, rhythmic and generous: a party that happens to have dinner.",
    starter: [d("Plantain chips with mango salsa", "v vg gf df nf"), d("Black bean soup", "v vg gf df nf")],
    main: [d("Jerk chicken with rice and peas", "gf df nf"), d("Jerk cauliflower with rice and peas", "v vg gf df nf")],
    dessert: [d("Rum-spiced pineapple", "v vg gf df nf"), d("Coconut drops", "v vg gf df")],
    drink: "Rum punch", zeroProof: "Sorrel (hibiscus) punch",
  },
  {
    key: "peruvian", label: "Peruvian Nikkei table", match: /\b(peruvian|ceviche|south american|argentin|brazilian)\b/,
    mood: "Zesty, citrus-bright and a little unexpected.",
    starter: [d("Sea bass ceviche with sweet potato", "gf df nf"), d("Corn and avocado causa", "v vg gf df nf")],
    main: [d("Lomo saltado", "df nf"), d("Quinoa and roasted vegetable saltado", "v vg gf df nf")],
    dessert: [d("Alfajores", "v nf"), d("Passion-fruit mousse", "v gf nf"), d("Mango and lime sorbet", "v vg gf df nf")],
    drink: "Pisco sour", zeroProof: "Chicha morada",
  },
  {
    key: "ethiopian", label: "Ethiopian shared platter", match: /\b(ethiopian|eritrean|african)\b/,
    mood: "One great shared platter: eating together, literally.",
    starter: [d("Lentil sambusas", "v vg df nf"), d("Tomato and green chilli salad", "v vg gf df nf")],
    main: [d("Doro wat with injera", "df nf"), d("Misir wat and gomen with injera", "v vg df nf")],
    dessert: [d("Honey and spiced roasted fruit", "v gf df nf"), d("Fresh fruit with coffee ceremony", "v vg gf df nf")],
    drink: "Honey wine (tej) or a light lager", zeroProof: "Spiced Ethiopian coffee",
  },
  {
    key: "plant", label: "Garden-to-table plant feast", match: /\b(vegan|vegetarian|plant|health food|salad|juice)\b/,
    mood: "Market-fresh and colourful: the vegetables are the stars.",
    starter: [d("Heirloom tomato salad with basil oil", "v vg gf df nf"), d("Roasted beetroot with walnut crumb", "v vg gf df")],
    main: [d("Whole roasted cauliflower with tahini and herbs", "v vg gf df nf"), d("Mushroom and lentil wellington", "v vg df nf")],
    dessert: [d("Dark chocolate and olive oil mousse", "v vg gf df nf"), d("Roasted plums with oat crumble", "v vg df nf")],
    drink: "Natural orange wine", zeroProof: "Kombucha with fresh ginger",
  },
];

// Tags that describe a venue type rather than a cuisine.
const NOT_A_CUISINE = /\b(bar|restaurant|takeout|take-out|fast food|sports|piano|live music|wine bar|cocktail|lounge|night ?club|frozen yogurt|ice cream|dessert|food truck|buffet|deli|cafeteria|catering|delivery|tourist|hotel|family|fine dining|casual|kid)\b/;

export function cuisineForTag(tagName) {
  const n = String(tagName || "").toLowerCase();
  for (const c of CUISINES) if (c.match.test(n)) return c;
  return null;
}

export function isVenueType(tagName) {
  return NOT_A_CUISINE.test(String(tagName || "").toLowerCase());
}

// Pick the best dish of a course that every diet at the table can eat.
export function pickDish(options, needs) {
  const ok = options.find((o) => needs.every((n) => o.flags.includes(n)));
  if (ok) return { dish: ok.name, inclusive: true };
  // Nobody-left-out fallback: serve the dish that covers the most needs, plus the option
  // that best covers what it misses (e.g. a vegan plate beside a gluten-free one).
  const cover = (o, list) => list.filter((n) => o.flags.includes(n)).length;
  const main = [...options].sort((a, b) => cover(b, needs) - cover(a, needs))[0];
  const missing = needs.filter((n) => !main.flags.includes(n));
  const alt = options.filter((o) => o !== main).sort((a, b) => cover(b, missing) - cover(a, missing))[0];
  return { dish: main.name, inclusive: false, alternative: alt && cover(alt, missing) > 0 ? alt.name : undefined };
}

export function dietNeeds(diets) {
  const needs = new Set();
  for (const key of diets) for (const n of DIETS[key]?.needs ?? []) needs.add(n);
  return [...needs];
}

export function buildMenu(cuisine, diets) {
  const needs = dietNeeds(diets);
  const courses = ["starter", "main", "dessert"].map((course) => ({ course, ...pickDish(cuisine[course], needs) }));
  const noAlcohol = diets.includes("no_alcohol");
  return {
    key: cuisine.key,
    label: cuisine.label,
    mood: cuisine.mood,
    courses,
    drink: cuisine.drink,
    zeroProof: cuisine.zeroProof,
    allZeroProof: noAlcohol,
    dietsHonoured: diets.map((k) => DIETS[k]?.label).filter(Boolean),
  };
}
