// Bootstrap reference data for a demo deployment. Everything here is editable from the Admin UI afterwards.
// Footprint factors are indicative literature-range values (FAO / Water Footprint Network / Poore & Nemecek 2018)
// and must be validated for any external disclosure.

const categories = [
  // code, name, cooked, shelf_h@ref, ref°C, q10, kgCO2e/kg, L water/kg, m² land/kg, ₹/kg
  ['cooked_rice_dal', 'Cooked rice & dal', true, 6, 25, 2.5, 2.3, 2200, 2.1, 60],
  ['cooked_curry', 'Cooked curries & sabzi', true, 6, 25, 2.3, 1.3, 600, 1.2, 70],
  ['cooked_bread', 'Rotis & breads', true, 10, 25, 2.0, 1.1, 1600, 1.8, 50],
  ['cooked_dairy', 'Paneer & dairy dishes', true, 4, 25, 3.0, 5.5, 1800, 3.5, 140],
  ['cooked_breakfast', 'Breakfast items (poha, idli, upma)', true, 5, 25, 2.4, 1.4, 1400, 1.5, 45],
  ['bakery', 'Packaged bakery', false, 96, 25, 2.0, 1.3, 1600, 1.8, 90],
  ['fresh_produce', 'Fresh vegetables', false, 144, 10, 2.2, 0.5, 320, 0.4, 35],
  ['fruits', 'Fresh fruits', false, 168, 10, 2.2, 0.6, 900, 0.6, 70],
  ['grains_pulses', 'Dry grains & pulses', false, 4320, 25, 1.5, 1.6, 2200, 2.5, 65],
  ['dairy_raw', 'Milk & raw dairy', false, 72, 4, 3.0, 1.9, 1000, 1.5, 55],
  ['processed_snack', 'Packaged snacks', false, 2160, 25, 1.6, 2.0, 500, 0.8, 180],
  ['fruit_pulp', 'Fruit pulp & juice', false, 336, 4, 2.5, 0.8, 700, 0.6, 80],
];

const ingredients = [
  // name, unit, category, ₹/unit
  ['Basmati rice', 'kg', 'grains_pulses', 72], ['Toor dal', 'kg', 'grains_pulses', 118], ['Wheat flour (atta)', 'kg', 'grains_pulses', 38],
  ['Poha (flattened rice)', 'kg', 'grains_pulses', 55], ['Semolina (rava)', 'kg', 'grains_pulses', 44], ['Potato', 'kg', 'fresh_produce', 28],
  ['Onion', 'kg', 'fresh_produce', 32], ['Tomato', 'kg', 'fresh_produce', 30], ['Mixed vegetables', 'kg', 'fresh_produce', 45],
  ['Paneer', 'kg', 'dairy_raw', 340], ['Milk', 'L', 'dairy_raw', 56], ['Cooking oil', 'L', 'grains_pulses', 150],
  ['Spice mix', 'kg', 'grains_pulses', 420], ['Mango (Totapuri)', 'kg', 'fruits', 34], ['Sugar', 'kg', 'grains_pulses', 44],
  ['Refined flour (maida)', 'kg', 'grains_pulses', 36], ['Chipping potato', 'kg', 'fresh_produce', 22], ['Banana', 'kg', 'fruits', 40],
];

// Menu item → recipe (qty of ingredient per portion)
const menuItems = [
  { name: 'Steamed rice', category: 'cooked_rice_dal', portionKg: 0.18, recipe: { 'Basmati rice': 0.075 } },
  { name: 'Dal tadka', category: 'cooked_rice_dal', portionKg: 0.15, recipe: { 'Toor dal': 0.04, Onion: 0.01, Tomato: 0.012, 'Cooking oil': 0.004, 'Spice mix': 0.002 } },
  { name: 'Chapati', category: 'cooked_bread', portionKg: 0.09, recipe: { 'Wheat flour (atta)': 0.07, 'Cooking oil': 0.002 } },
  { name: 'Mixed veg curry', category: 'cooked_curry', portionKg: 0.13, recipe: { 'Mixed vegetables': 0.1, Onion: 0.015, Tomato: 0.015, 'Cooking oil': 0.006, 'Spice mix': 0.002 } },
  { name: 'Aloo sabzi', category: 'cooked_curry', portionKg: 0.13, recipe: { Potato: 0.11, Onion: 0.01, 'Cooking oil': 0.005, 'Spice mix': 0.002 } },
  { name: 'Paneer butter masala', category: 'cooked_dairy', portionKg: 0.12, recipe: { Paneer: 0.05, Tomato: 0.03, Onion: 0.015, Milk: 0.02, 'Cooking oil': 0.006, 'Spice mix': 0.003 } },
  { name: 'Vegetable poha', category: 'cooked_breakfast', portionKg: 0.17, recipe: { 'Poha (flattened rice)': 0.06, Onion: 0.015, Potato: 0.02, 'Cooking oil': 0.004 } },
  { name: 'Rava upma', category: 'cooked_breakfast', portionKg: 0.17, recipe: { 'Semolina (rava)': 0.055, 'Mixed vegetables': 0.02, 'Cooking oil': 0.005 } },
  { name: 'Masala tea', category: 'dairy_raw', portionKg: 0.15, recipe: { Milk: 0.08, Sugar: 0.01 } },
  { name: 'Banana', category: 'fruits', portionKg: 0.12, recipe: { Banana: 0.12 } },
  { name: 'Samosa', category: 'cooked_breakfast', portionKg: 0.08, recipe: { 'Refined flour (maida)': 0.03, Potato: 0.04, 'Cooking oil': 0.012 } },
];

// Weekly menu rotation per slot (index = day of week, 0 = Sunday)
const menuRotation = {
  breakfast: [['Vegetable poha', 'Masala tea'], ['Rava upma', 'Masala tea', 'Banana'], ['Vegetable poha', 'Masala tea'], ['Rava upma', 'Masala tea'], ['Vegetable poha', 'Masala tea', 'Banana'], ['Rava upma', 'Masala tea'], ['Vegetable poha', 'Masala tea']],
  lunch: [['Steamed rice', 'Dal tadka', 'Paneer butter masala', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Aloo sabzi', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Mixed veg curry', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Aloo sabzi', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Mixed veg curry', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Paneer butter masala', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Mixed veg curry', 'Chapati']],
  snacks: [['Samosa', 'Masala tea'], ['Samosa', 'Masala tea'], ['Banana', 'Masala tea'], ['Samosa', 'Masala tea'], ['Banana', 'Masala tea'], ['Samosa', 'Masala tea'], ['Banana', 'Masala tea']],
  dinner: [['Steamed rice', 'Dal tadka', 'Mixed veg curry', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Mixed veg curry', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Paneer butter masala', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Mixed veg curry', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Aloo sabzi', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Mixed veg curry', 'Chapati'], ['Steamed rice', 'Dal tadka', 'Aloo sabzi', 'Chapati']],
};

// Fixed-date national holidays and dated festivals (2025–2027) used for calendar features.
const fixedHolidays = [['01-26', 'Republic Day'], ['08-15', 'Independence Day'], ['10-02', 'Gandhi Jayanti'], ['12-25', 'Christmas']];
const festivals = [
  ['2025-03-14', 'Holi'], ['2025-03-31', 'Eid al-Fitr'], ['2025-08-27', 'Ganesh Chaturthi'], ['2025-10-02', 'Dussehra'], ['2025-10-20', 'Diwali'],
  ['2026-03-04', 'Holi'], ['2026-03-20', 'Eid al-Fitr'], ['2026-09-14', 'Ganesh Chaturthi'], ['2026-10-20', 'Dussehra'], ['2026-11-08', 'Diwali'],
  ['2027-03-22', 'Holi'], ['2027-03-10', 'Eid al-Fitr'],
];

module.exports = { categories, ingredients, menuItems, menuRotation, fixedHolidays, festivals };
