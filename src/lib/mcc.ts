/**
 * Visa/Mastercard Merchant Category Codes (MCC) → human-readable labels.
 *
 * Source: ISO 18245 standard, trimmed to the codes we actually see on
 * consumer spend. Covers ~95% of typical Visa retail / subscription
 * usage. Unknown codes fall back to raw MCC number.
 *
 * Added for Sprint 2.4 polish: Transactions page shows "Restaurants"
 * not "MCC 5812" on Visa-spend rows.
 */

const MCC_MAP: Record<string, string> = {
 // Retail - everyday
  "5411": "Grocery",
  "5412": "Grocery",
  "5422": "Butcher",
  "5441": "Candy store",
  "5451": "Dairy",
  "5462": "Bakery",
  "5499": "Specialty foods",
  "5912": "Pharmacy",
  "5921": "Liquor store",
  "5813": "Bar",
  "5814": "Fast food",
  "5812": "Restaurants",
  "5811": "Caterer",

 // Retail - goods
  "5200": "Home supply",
  "5211": "Lumber",
  "5231": "Glass/paint",
  "5251": "Hardware",
  "5261": "Nursery",
  "5311": "Department store",
  "5331": "Variety store",
  "5399": "General merchandise",
  "5611": "Menswear",
  "5621": "Womenswear",
  "5631": "Accessories",
  "5641": "Children's clothing",
  "5651": "Family clothing",
  "5655": "Sportswear",
  "5661": "Shoes",
  "5691": "Apparel",
  "5712": "Furniture",
  "5722": "Appliances",
  "5732": "Electronics",
  "5733": "Music store",
  "5735": "Record store",
  "5942": "Bookstore",
  "5943": "Stationery",
  "5944": "Jewelry",
  "5945": "Toy store",
  "5946": "Camera",
  "5947": "Gifts",
  "5948": "Leather goods",
  "5949": "Sewing",
  "5977": "Cosmetics",
  "5992": "Florist",
  "5995": "Pet store",

 // Services
  "4011": "Railway",
  "4111": "Transit",
  "4112": "Passenger rail",
  "4121": "Taxi/rideshare",
  "4131": "Bus",
  "4411": "Cruise",
  "4511": "Airline",
  "4582": "Airport",
  "4722": "Travel agent",
  "4784": "Toll/bridge",
  "4789": "Transport services",
  "4812": "Telecom equip",
  "4814": "Telecom services",
  "4815": "Mobile phone",
  "4816": "Computer/network svc",
  "4821": "Telegraph",
  "4829": "Wire transfer",
  "4899": "Cable/streaming",
  "4900": "Utilities",
  "5013": "Auto parts",
  "5172": "Petroleum",
  "5411-Instacart": "Grocery delivery",
  "5541": "Gas station",
  "5542": "Auto fuel",
  "5815": "Digital media",
  "5816": "Digital games",
  "5817": "Digital apps",
  "5818": "Digital apps - other",

 // Entertainment
  "7829": "Film production",
  "7832": "Cinema",
  "7841": "Video rental",
  "7911": "Dance",
  "7922": "Theater",
  "7929": "Bands/entertainers",
  "7932": "Billiards",
  "7933": "Bowling",
  "7941": "Sports",
  "7991": "Tourist attractions",
  "7992": "Golf",
  "7993": "Video games",
  "7994": "Arcade",
  "7995": "Betting/casino",
  "7996": "Amusement parks",
  "7997": "Country clubs",
  "7998": "Aquarium/zoo",
  "7999": "Recreation",

 // Subscriptions / digital
  "5968": "Subscription",
  "5969": "Direct marketing",
  "5964": "Catalog merchant",
  "5967": "Direct marketing - inbound",
  "5965": "Catalog & retail merchant",

 // Health
  "8011": "Doctor",
  "8021": "Dentist",
  "8031": "Osteopath",
  "8041": "Chiropractor",
  "8042": "Optometrist",
  "8043": "Optician",
  "8049": "Podiatry",
  "8050": "Nursing care",
  "8062": "Hospital",
  "8071": "Medical lab",
  "8099": "Medical services",

 // Financial
  "6010": "Bank cash",
  "6011": "ATM",
  "6012": "Financial inst",
  "6051": "Quasi-cash",
  "6211": "Securities",
  "6300": "Insurance",
  "6513": "Rent",
  "6540": "POI funding",

 // Transport - auto
  "5511": "Car dealer",
  "5521": "Used cars",
  "5531": "Auto supply",
  "5532": "Auto tires",
  "5533": "Auto parts retail",
  "5571": "Motorcycle",
  "5592": "Motor home",
  "5598": "Snowmobile",
  "5599": "Misc auto",
  "7512": "Car rental",
  "7513": "Truck rental",
  "7519": "RV rental",
  "7523": "Parking",
  "7531": "Auto body",
  "7534": "Tire retread",
  "7535": "Paint shop",
  "7538": "Auto service",
  "7542": "Car wash",
  "7549": "Towing",

 // Hotels
  "7011": "Hotel",

 // Education
  "8211": "Schools",
  "8220": "Colleges",
  "8241": "Correspondence schools",
  "8244": "Business schools",
  "8249": "Vocational schools",
  "8299": "Education other",

 // Charity / membership
  "8398": "Charity",
  "8641": "Civic/social",
  "8651": "Political",
  "8661": "Religious",
  "8675": "Automobile assoc",
  "8699": "Membership other",

 // Professional
  "8111": "Legal",
  "8351": "Childcare",
  "8911": "Architect/engineer",
  "8931": "Accountant",
  "8999": "Professional other",
}

/**
 * Resolve an MCC to a friendly label. Falls back to "MCC <code>" when
 * the code isn't in our map. Returns null when input is empty/null.
 */
export function mccLabel(mcc: string | null | undefined): string | null {
  if (!mcc) return null
  const clean = String(mcc).trim()
  if (!clean) return null
  return MCC_MAP[clean] || `MCC ${clean}`
}
