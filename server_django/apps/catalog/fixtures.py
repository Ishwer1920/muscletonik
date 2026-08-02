"""Fallback reference data — direct port of js/data.js's BRANDS/CATEGORIES/
GOALS/REVIEWS/TRANSFORMATIONS/HERO_SLIDES, used only until DB rows exist."""

BRANDS = [
    {"id": "optimum-nutrition", "name": "Optimum Nutrition", "initials": "ON", "color": "#111111", "desc": "Global whey and recovery leader"},
    {"id": "muscleblaze", "name": "MuscleBlaze", "initials": "MB", "color": "#ff7a00", "desc": "India's training staple"},
    {"id": "gnc", "name": "GNC", "initials": "GN", "color": "#0f766e", "desc": "Wellness and daily nutrition"},
    {"id": "myprotein", "name": "MyProtein", "initials": "MP", "color": "#2563eb", "desc": "Lean sports nutrition"},
    {"id": "nakpro", "name": "Nakpro", "initials": "NK", "color": "#16a34a", "desc": "Performance on a budget"},
    {"id": "asitis", "name": "AS-IT-IS", "initials": "AI", "color": "#7c3aed", "desc": "Clean label ingredients"},
    {"id": "muscletech", "name": "MuscleTech", "initials": "MT", "color": "#b45309", "desc": "Power and mass products"},
    {"id": "bsn", "name": "BSN", "initials": "BS", "color": "#dc2626", "desc": "High energy formulas"},
]

CATEGORIES = [
    {"id": "whey-protein", "name": "Whey Protein", "icon": "flask"},
    {"id": "mass-gainer", "name": "Mass Gainer", "icon": "trend"},
    {"id": "creatine", "name": "Creatine", "icon": "bolt"},
    {"id": "pre-workout", "name": "Pre Workout", "icon": "flame"},
    {"id": "bcaa", "name": "BCAA", "icon": "layers"},
    {"id": "fish-oil", "name": "Fish Oil", "icon": "drop"},
    {"id": "vitamins", "name": "Vitamins", "icon": "shield"},
    {"id": "peanut-butter", "name": "Peanut Butter", "icon": "jar"},
    {"id": "oats", "name": "Oats", "icon": "bowl"},
    {"id": "protein-bars", "name": "Protein Bars", "icon": "bar"},
]

PRODUCTS = [
    {"id": 1, "name": "Gold Standard Whey, Double Rich Chocolate, 2kg", "brand": "optimum-nutrition", "category": "whey-protein", "price": 4499, "oldPrice": 5499, "rating": 4.8, "reviews": 2150, "badge": "Bestseller", "color": "#111111", "featured": True, "deal": True, "short": "24g protein per scoop, fast mixing, 66 servings.", "protein": "24g", "servings": 66, "calories": 120, "flavor": "Chocolate", "desc": "A premium whey blend designed for daily training support with a smooth chocolate profile and reliable mixability.", "ingredients": "Whey Protein Isolate, Whey Protein Concentrate, Cocoa Powder, Flavors, Sucralose, Soy Lecithin."},
    {"id": 2, "name": "Gold Standard Whey, Vanilla Cream, 1kg", "brand": "optimum-nutrition", "category": "whey-protein", "price": 2399, "oldPrice": 2999, "rating": 4.7, "reviews": 1340, "badge": "Sale", "color": "#111111", "featured": True, "deal": False, "short": "Starter pack, low carb, 33 servings.", "protein": "24g", "servings": 33, "calories": 118, "flavor": "Vanilla", "desc": "A compact 1kg pack of the Gold Standard formula for first-time buyers or light daily use.", "ingredients": "Whey Protein Isolate, Whey Protein Concentrate, Natural Vanilla Flavor, Sucralose, Soy Lecithin."},
    {"id": 3, "name": "Raw Whey Concentrate, Unflavored, 1kg", "brand": "asitis", "category": "whey-protein", "price": 1799, "oldPrice": 2199, "rating": 4.5, "reviews": 612, "badge": "New", "color": "#7c3aed", "featured": False, "deal": False, "short": "No additives, ideal for shakes and recipes.", "protein": "21g", "servings": 33, "calories": 110, "flavor": "Unflavored", "desc": "An unflavored concentrate for smoothies, oats and baking with no added sweetness.", "ingredients": "100% Whey Protein Concentrate, Soy Lecithin (emulsifier)."},
    {"id": 4, "name": "Mass Builder Pro, Chocolate, 3kg", "brand": "muscleblaze", "category": "mass-gainer", "price": 2899, "oldPrice": 3599, "rating": 4.6, "reviews": 980, "badge": "Bestseller", "color": "#ff7a00", "featured": True, "deal": True, "short": "1230 kcal and 50g protein per serving.", "protein": "50g", "servings": 20, "calories": 1230, "flavor": "Chocolate", "desc": "A calorie-dense gainer for hard gainers and high-volume training blocks.", "ingredients": "Maltodextrin, Whey Protein Concentrate, Oat Flour, Cocoa, Digestive Enzyme Blend, Flavoring."},
    {"id": 5, "name": "Mass Builder Pro, Vanilla, 5kg", "brand": "muscleblaze", "category": "mass-gainer", "price": 4199, "oldPrice": 4999, "rating": 4.5, "reviews": 540, "badge": "Sale", "color": "#ff7a00", "featured": True, "deal": False, "short": "Bulk pack, 1230 kcal per serving.", "protein": "50g", "servings": 33, "calories": 1230, "flavor": "Vanilla", "desc": "A larger tub of the same high-calorie mass builder for longer bulking phases.", "ingredients": "Maltodextrin, Whey Protein Concentrate, Oat Flour, Vanilla Flavoring, Digestive Enzyme Blend."},
    {"id": 6, "name": "Titan Gainer XL, Chocolate Malt, 4kg", "brand": "muscletech", "category": "mass-gainer", "price": 3299, "oldPrice": 3999, "rating": 4.4, "reviews": 410, "badge": "New", "color": "#b45309", "featured": False, "deal": True, "short": "1450 kcal with added creatine support.", "protein": "42g", "servings": 25, "calories": 1450, "flavor": "Malt", "desc": "A higher-calorie gainer with added creatine for lifters chasing size and power.", "ingredients": "Maltodextrin, Whey Concentrate, Creatine Monohydrate, Cocoa, Digestive Enzymes, Flavoring."},
    {"id": 7, "name": "Creatine Monohydrate, Unflavored, 250g", "brand": "nakpro", "category": "creatine", "price": 899, "oldPrice": 1199, "rating": 4.9, "reviews": 3210, "badge": "Bestseller", "color": "#16a34a", "featured": True, "deal": True, "short": "5g pure creatine per serving, 50 servings.", "protein": "0g", "servings": 50, "calories": 0, "flavor": "Unflavored", "desc": "Micronized creatine monohydrate for strength, power output and lean mass support.", "ingredients": "100% Micronized Creatine Monohydrate."},
    {"id": 8, "name": "Creatine HCL Capsules, 120ct", "brand": "nakpro", "category": "creatine", "price": 1099, "oldPrice": 1399, "rating": 4.6, "reviews": 880, "badge": "New", "color": "#16a34a", "featured": False, "deal": False, "short": "Convenient capsule format, no loading phase.", "protein": "0g", "servings": 60, "calories": 0, "flavor": "Capsules", "desc": "Creatine HCL capsules for people who prefer a measured capsule format on the go.", "ingredients": "Creatine Hydrochloride, Gelatin Capsule, Magnesium Stearate."},
    {"id": 9, "name": "Pre-Ignite Pre-Workout, Blue Razz, 300g", "brand": "gnc", "category": "pre-workout", "price": 1599, "oldPrice": 1999, "rating": 4.5, "reviews": 1450, "badge": "Bestseller", "color": "#0f766e", "featured": True, "deal": False, "short": "200mg caffeine, citrulline and beta-alanine.", "protein": "0g", "servings": 30, "calories": 5, "flavor": "Blue Razz", "desc": "A focus-and-energy pre-workout with citrulline malate, beta-alanine and a moderate caffeine dose.", "ingredients": "Citrulline Malate, Beta-Alanine, Caffeine Anhydrous, Taurine, Flavors, Sucralose."},
    {"id": 10, "name": "Pre-Ignite Pre-Workout, Watermelon, 300g", "brand": "gnc", "category": "pre-workout", "price": 1599, "oldPrice": 1999, "rating": 4.4, "reviews": 760, "badge": "Sale", "color": "#0f766e", "featured": False, "deal": True, "short": "Same formula, watermelon flavor.", "protein": "0g", "servings": 30, "calories": 5, "flavor": "Watermelon", "desc": "The same pre-workout formula in watermelon for a lighter, fruitier profile.", "ingredients": "Citrulline Malate, Beta-Alanine, Caffeine Anhydrous, Taurine, Flavors, Sucralose."},
    {"id": 11, "name": "BCAA 2:1:1 Recovery, Orange, 400g", "brand": "myprotein", "category": "bcaa", "price": 1299, "oldPrice": 1699, "rating": 4.5, "reviews": 920, "badge": "Sale", "color": "#2563eb", "featured": True, "deal": False, "short": "7g BCAA per serving, 40 servings.", "protein": "7g", "servings": 40, "calories": 15, "flavor": "Orange", "desc": "Branched-chain aminos in a 2:1:1 ratio for recovery support between sessions.", "ingredients": "L-Leucine, L-Isoleucine, L-Valine, Citric Acid, Electrolyte Blend, Flavors, Sucralose."},
    {"id": 12, "name": "BCAA 2:1:1 Recovery, Green Apple, 400g", "brand": "myprotein", "category": "bcaa", "price": 1299, "oldPrice": 1699, "rating": 4.3, "reviews": 540, "badge": "New", "color": "#2563eb", "featured": False, "deal": False, "short": "Same ratio, green apple flavor.", "protein": "7g", "servings": 40, "calories": 15, "flavor": "Green Apple", "desc": "A green apple version of the BCAA blend for intra-workout sipping.", "ingredients": "L-Leucine, L-Isoleucine, L-Valine, Citric Acid, Electrolyte Blend, Flavors, Sucralose."},
    {"id": 13, "name": "Omega-3 Fish Oil, 1000mg, 90 Softgels", "brand": "gnc", "category": "fish-oil", "price": 699, "oldPrice": 949, "rating": 4.6, "reviews": 1870, "badge": "Bestseller", "color": "#0f766e", "featured": True, "deal": True, "short": "EPA + DHA for heart and joint support.", "protein": "0g", "servings": 90, "calories": 10, "flavor": "Softgels", "desc": "Purified fish oil softgels to support cardiovascular and joint health as part of your daily routine.", "ingredients": "Fish Oil Concentrate, Gelatin, Glycerin, Vitamin E."},
    {"id": 14, "name": "Multivitamin Daily Capsules, 60ct", "brand": "gnc", "category": "vitamins", "price": 649, "oldPrice": 899, "rating": 4.6, "reviews": 2040, "badge": "Bestseller", "color": "#0f766e", "featured": True, "deal": False, "short": "23 vitamins and minerals for daily wellness.", "protein": "0g", "servings": 60, "calories": 5, "flavor": "Capsules", "desc": "A broad-spectrum daily multivitamin for energy, immunity and everyday nutrition support.", "ingredients": "Vitamin A, C, D3, E, B-Complex, Zinc, Magnesium, Selenium, Microcrystalline Cellulose."},
    {"id": 15, "name": "Women's Multivitamin, 60ct", "brand": "myprotein", "category": "vitamins", "price": 699, "oldPrice": 949, "rating": 4.5, "reviews": 1120, "badge": "New", "color": "#2563eb", "featured": False, "deal": False, "short": "Iron, folic acid and biotin added.", "protein": "0g", "servings": 60, "calories": 5, "flavor": "Capsules", "desc": "A multivitamin formulated for women's daily needs with added iron, folic acid and biotin.", "ingredients": "Vitamin A, C, D3, E, B-Complex, Iron, Folic Acid, Biotin, Zinc."},
    {"id": 16, "name": "Natural Peanut Butter, Crunchy, 1kg", "brand": "asitis", "category": "peanut-butter", "price": 449, "oldPrice": 599, "rating": 4.7, "reviews": 2780, "badge": "Bestseller", "color": "#7c3aed", "featured": True, "deal": False, "short": "7g protein per serving, no added sugar.", "protein": "7g", "servings": 33, "calories": 190, "flavor": "Crunchy", "desc": "Ground from roasted peanuts only with no added sugar or palm oil.", "ingredients": "Roasted Peanuts (100%)."},
    {"id": 17, "name": "Natural Peanut Butter, Creamy, 1kg", "brand": "asitis", "category": "peanut-butter", "price": 449, "oldPrice": 599, "rating": 4.6, "reviews": 1990, "badge": "Sale", "color": "#7c3aed", "featured": False, "deal": False, "short": "Same recipe, smooth texture.", "protein": "7g", "servings": 33, "calories": 190, "flavor": "Creamy", "desc": "The same single-ingredient peanut butter, ground smooth for an easy spread.", "ingredients": "Roasted Peanuts (100%)."},
    {"id": 18, "name": "Rolled Oats, 2kg", "brand": "muscletech", "category": "oats", "price": 349, "oldPrice": 449, "rating": 4.7, "reviews": 1430, "badge": "Bestseller", "color": "#b45309", "featured": True, "deal": False, "short": "High fiber breakfast staple.", "protein": "13g", "servings": 20, "calories": 380, "flavor": "Plain", "desc": "Whole-grain rolled oats for a high-fiber, slow-release breakfast.", "ingredients": "100% Whole Grain Rolled Oats."},
    {"id": 19, "name": "Steel Cut Oats, 1kg", "brand": "muscletech", "category": "oats", "price": 299, "oldPrice": 399, "rating": 4.5, "reviews": 610, "badge": "New", "color": "#b45309", "featured": False, "deal": False, "short": "Coarser texture, lower glycemic profile.", "protein": "12g", "servings": 14, "calories": 370, "flavor": "Plain", "desc": "Coarsely cut oats with a chewier bite than instant oats.", "ingredients": "100% Whole Grain Steel Cut Oats."},
    {"id": 20, "name": "Protein Bar, Choco Brownie, Box of 6", "brand": "muscleblaze", "category": "protein-bars", "price": 899, "oldPrice": 1099, "rating": 4.4, "reviews": 1340, "badge": "Sale", "color": "#ff7a00", "featured": True, "deal": True, "short": "20g protein per bar, low sugar.", "protein": "20g", "servings": 6, "calories": 210, "flavor": "Choco Brownie", "desc": "A soft-baked protein bar for on-the-go snacking with a brownie-style profile.", "ingredients": "Whey Protein Isolate, Almonds, Cocoa, Dates, Sea Salt, Stevia."},
    {"id": 21, "name": "Protein Bar, Peanut Crunch, Box of 6", "brand": "muscleblaze", "category": "protein-bars", "price": 899, "oldPrice": 1099, "rating": 4.5, "reviews": 980, "badge": "New", "color": "#ff7a00", "featured": False, "deal": False, "short": "20g protein with crunchy peanut topping.", "protein": "20g", "servings": 6, "calories": 215, "flavor": "Peanut Crunch", "desc": "Peanut Crunch flavor of the protein bar line with a crunchy topping.", "ingredients": "Whey Protein Isolate, Peanuts, Cocoa, Dates, Sea Salt, Stevia."},
    {"id": 22, "name": "Stainless Steel Shaker Bottle, 700ml", "brand": "nakpro", "category": "protein-bars", "price": 549, "oldPrice": 699, "rating": 4.6, "reviews": 870, "badge": "New", "color": "#16a34a", "featured": False, "deal": False, "short": "Leak-proof, built-in mixing blade.", "protein": "-", "servings": 1, "calories": 0, "flavor": "Accessory", "desc": "A double-wall steel shaker with a built-in mixing blade and leak-proof lid.", "ingredients": "304 Food-Grade Stainless Steel, BPA-Free Plastic Lid."},
]

GOALS = [
    {"id": "build-muscle", "name": "Build Muscle", "icon": "bolt"},
    {"id": "gain-weight", "name": "Gain Weight", "icon": "trend"},
    {"id": "lose-fat", "name": "Lose Fat", "icon": "flame"},
    {"id": "strength", "name": "Improve Strength", "icon": "cart"},
    {"id": "wellness", "name": "General Wellness", "icon": "shield"},
]

REVIEWS = [
    {"name": "Rohit M.", "tag": "Strength training, 2 yrs", "rating": 5, "text": "Switched to the ON whey three months ago. It mixes clean and I feel better recovery after back days."},
    {"name": "Ananya K.", "tag": "Daily wellness", "rating": 5, "text": "The multivitamin has been easy on my stomach and the pack feels premium from the first unboxing."},
    {"name": "Vikram S.", "tag": "Powerlifting", "rating": 4, "text": "Creatine dissolves properly and the flavourless format is exactly what I wanted."},
    {"name": "Sana T.", "tag": "Marathon training", "rating": 5, "text": "The BCAA orange flavor tastes natural and it has become part of my long-run setup."},
    {"name": "Aditya R.", "tag": "Bulking phase", "rating": 4, "text": "The gainer helped me gain steadily without the heavy stomach feeling I had with other brands."},
    {"name": "Priya N.", "tag": "Office worker, gym 4x/week", "rating": 5, "text": "The peanut butter and protein bars both taste like real food. That is the reason I keep reordering."},
]

TRANSFORMATIONS = [
    {"name": "Rahul", "change": "72kg to 85kg", "story": "Bulking with whey, gainer and creatine for 16 weeks.", "imageTone": "#ff7a00"},
    {"name": "Ankit", "change": "90kg to 74kg", "story": "Cutting with protein, oats and daily cardio support.", "imageTone": "#111111"},
    {"name": "Meera", "change": "Low energy to consistent training", "story": "Built a sustainable routine with vitamins and pre-workout.", "imageTone": "#0f766e"},
]

HERO_SLIDES = [
    {
        "eyebrow": "Premium supplements for real routines",
        "title": "Fuel Your Strength\nBuild Your Legacy",
        "copy": "Buy authentic Whey Protein, Creatine, Mass Gainers, Vitamins and Fitness Supplements at unbeatable prices.",
        "cta1": {"label": "Shop Now", "href": "marketplace.html"},
        "cta2": {"label": "Explore Categories", "href": "category.html"},
        "accent": "orange",
    },
    {
        "eyebrow": "Fast delivery and authentic stock",
        "title": "Train hard.\nRecover smarter.",
        "copy": "Discover best sellers, deal picks and goal-based bundles built for faster buying decisions.",
        "cta1": {"label": "See Best Sellers", "href": "marketplace.html?sort=popularity"},
        "cta2": {"label": "Today's Deals", "href": "offers.html"},
        "accent": "dark",
    },
]


def discount_pct(price, old_price):
    if not old_price:
        return 0
    return round(((old_price - price) / old_price) * 100)
