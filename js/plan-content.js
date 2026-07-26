/* ===========================================================
   MUSCLE TONIK — Plan content (diet + workout)
   The actual plan text, keyed by BMI band. Shared by the BMI
   calculator, the post-payment delivery screen, and My Plans,
   so a re-download years later renders identically.

   Content only — no DOM, no network. Rendering and export live
   elsewhere (plan-export.js).
   =========================================================== */
window.MTPlanContent = (function () {
  "use strict";

  var BANDS = [
    { id: "underweight", label: "Underweight", min: 0, max: 18.5, color: "#3b82f6" },
    { id: "normal", label: "Healthy weight", min: 18.5, max: 25, color: "#16a34a" },
    { id: "overweight", label: "Overweight", min: 25, max: 30, color: "#f59e0b" },
    { id: "obese", label: "Obese", min: 30, max: Infinity, color: "#e23b3b" }
  ];

  function bandFor(bmi) {
    for (var i = 0; i < BANDS.length; i++) {
      if (bmi >= BANDS[i].min && bmi < BANDS[i].max) return BANDS[i];
    }
    return BANDS[BANDS.length - 1];
  }

  function bandById(id) {
    for (var i = 0; i < BANDS.length; i++) if (BANDS[i].id === id) return BANDS[i];
    return BANDS[1];
  }

  /* ---------------- DIET ---------------- */

  var DIET = {
    underweight: {
      headline: "Build up with a calorie surplus",
      calories: "+300 to +500 kcal above maintenance",
      protein: "1.6–2.2 g per kg bodyweight",
      focus: [
        "Eat 5–6 times a day; don't skip breakfast.",
        "Add calorie-dense whole foods: nuts, nut butter, whole milk, oats, bananas, olive oil.",
        "Strength train 3–4× a week so the gain is muscle, not just fat.",
        "Liquid calories (smoothies, mass gainers) help if solid food fills you up too fast."
      ],
      meals: [
        ["Breakfast", "Oats cooked in milk + banana + 2 tbsp peanut butter + whey scoop"],
        ["Mid-morning", "Handful of almonds/walnuts + a fruit + glass of milk"],
        ["Lunch", "2–3 rotis or rice + dal + paneer/chicken + vegetables + curd"],
        ["Pre-workout", "Banana + black coffee (or pre-workout)"],
        ["Post-workout", "Mass gainer or whey + milk"],
        ["Dinner", "Rice/roti + protein (eggs, fish, chicken, soya) + salad + ghee"],
        ["Before bed", "Casein or a glass of warm milk"]
      ],
      categories: ["mass-gainer", "whey-protein", "peanut-butter", "oats", "casein"]
    },
    normal: {
      headline: "Maintain and build lean strength",
      calories: "Maintenance, ±200 kcal depending on your goal",
      protein: "1.4–2.0 g per kg bodyweight",
      focus: [
        "Keep protein steady across the day — roughly 25–40 g per meal.",
        "Fill half the plate with vegetables and fruit.",
        "Train 4–5× a week mixing resistance work and cardio.",
        "Hydrate: 3–4 litres a day, more on training days."
      ],
      meals: [
        ["Breakfast", "Eggs or besan chilla + whole-grain toast + fruit"],
        ["Mid-morning", "Greek yoghurt or a protein bar"],
        ["Lunch", "Roti/brown rice + dal + lean protein + big salad"],
        ["Pre-workout", "Coffee + banana or a light carb snack"],
        ["Post-workout", "Whey protein + creatine"],
        ["Dinner", "Grilled protein + quinoa/rice + sautéed vegetables"],
        ["Before bed", "Curd or a handful of nuts"]
      ],
      categories: ["whey-protein", "creatine", "pre-workout", "vitamins", "bcaa"]
    },
    overweight: {
      headline: "Gentle deficit, high protein",
      calories: "−300 to −500 kcal below maintenance",
      protein: "1.6–2.2 g per kg bodyweight (protects muscle while cutting)",
      focus: [
        "Protein and fibre at every meal — they keep you full on fewer calories.",
        "Cut liquid sugar first: soft drinks, packaged juice, sweetened coffee.",
        "Walk 8,000–10,000 steps daily on top of training.",
        "Aim for 0.5–0.75 kg loss per week. Faster usually costs you muscle."
      ],
      meals: [
        ["Breakfast", "Vegetable omelette or moong dal chilla + black coffee/green tea"],
        ["Mid-morning", "Apple or guava + a few almonds"],
        ["Lunch", "1–2 rotis + dal + grilled protein + large salad"],
        ["Pre-workout", "Green tea or black coffee"],
        ["Post-workout", "Whey isolate with water"],
        ["Dinner", "Soup + grilled protein + stir-fried vegetables (light on grains)"],
        ["Before bed", "Low-fat curd if hungry"]
      ],
      categories: ["fat-burner", "whey-protein", "greens", "plant-protein", "electrolytes"]
    },
    obese: {
      headline: "Sustainable fat loss, medically guided",
      calories: "−500 kcal below maintenance, adjusted by a professional",
      protein: "1.6–2.2 g per kg of target bodyweight",
      focus: [
        "Please involve a doctor or dietitian — this range carries real health risk.",
        "Start with walking and low-impact cardio to protect knees and joints.",
        "Build meals around protein, vegetables and fibre; minimise fried and packaged food.",
        "Track intake for 2 weeks — most people underestimate by 20–30%.",
        "Get blood work done: sugar, thyroid, lipids and vitamin D all matter here."
      ],
      meals: [
        ["Breakfast", "Egg whites or sprouts + a small bowl of oats"],
        ["Mid-morning", "Seasonal fruit or buttermilk"],
        ["Lunch", "1 roti + dal + grilled protein + double vegetables"],
        ["Evening", "Green tea + roasted chana"],
        ["Post-workout", "Whey isolate with water"],
        ["Dinner", "Clear soup + grilled protein + salad (no grains)"],
        ["Before bed", "Warm water with lemon if hungry"]
      ],
      categories: ["fat-burner", "greens", "wellness", "fish-oil", "plant-protein"]
    }
  };

  /* ---------------- WORKOUT ---------------- */

  var WORKOUT = {
    underweight: {
      headline: "Heavy, low-volume strength — grow, don't burn",
      split: "4 days a week — Upper / Lower / Upper / Lower",
      cardio: "Minimal. 10 min brisk walk to warm up. Avoid long cardio — it eats your surplus.",
      focus: [
        "Compound lifts first, every session: squat, deadlift, bench, row, overhead press.",
        "Sets of 5–8 reps with 2–3 min rest. You are training for strength, not a sweat.",
        "Add 2.5 kg to a lift the moment you hit the top of the rep range.",
        "Sleep 8 hours. Muscle is built while you rest, not while you train.",
        "Keep sessions under 60 minutes — more is not better in a surplus."
      ],
      days: [
        ["Day 1 — Upper", "Bench press 4×6 · Barbell row 4×6 · Overhead press 3×8 · Lat pulldown 3×8 · Barbell curl 3×10"],
        ["Day 2 — Lower", "Squat 4×6 · Romanian deadlift 3×8 · Leg press 3×10 · Calf raise 3×15 · Plank 3×45s"],
        ["Day 3 — Rest", "Full rest or an easy walk. Eat well."],
        ["Day 4 — Upper", "Incline dumbbell press 4×8 · Weighted pull-up or assisted 4×6 · Dumbbell shoulder press 3×10 · Cable row 3×10 · Skull crusher 3×10"],
        ["Day 5 — Lower", "Deadlift 4×5 · Front squat 3×8 · Walking lunge 3×12/leg · Leg curl 3×12 · Hanging knee raise 3×12"],
        ["Day 6 — Rest", "Full rest."],
        ["Day 7 — Rest", "Full rest or light mobility work."]
      ]
    },
    normal: {
      headline: "Balanced strength and conditioning",
      split: "5 days a week — Push / Pull / Legs / Upper / Lower",
      cardio: "2–3 × 20–30 min moderate cardio, or 10–15 min HIIT after lifting.",
      focus: [
        "Compounds first, isolation after. 6–12 reps is your working range.",
        "Progress by adding weight or a rep each week — track it or you won't know.",
        "Rest 90 s on compounds, 60 s on isolation.",
        "Train each muscle roughly twice a week; that's what the split is for.",
        "Take a lighter week every 6–8 weeks so joints and CNS catch up."
      ],
      days: [
        ["Day 1 — Push", "Bench press 4×8 · Overhead press 3×10 · Incline dumbbell press 3×10 · Lateral raise 3×15 · Triceps pushdown 3×12"],
        ["Day 2 — Pull", "Deadlift 4×6 · Pull-up 4×8 · Barbell row 3×10 · Face pull 3×15 · Barbell curl 3×12"],
        ["Day 3 — Legs", "Squat 4×8 · Romanian deadlift 3×10 · Leg press 3×12 · Leg curl 3×12 · Calf raise 4×15"],
        ["Day 4 — Rest", "Rest or 30 min easy cardio / mobility."],
        ["Day 5 — Upper", "Incline bench 4×8 · Cable row 4×10 · Dumbbell shoulder press 3×10 · Lat pulldown 3×12 · Superset curls/pushdowns 3×12"],
        ["Day 6 — Lower + core", "Front squat 4×8 · Hip thrust 3×12 · Bulgarian split squat 3×10/leg · Hanging leg raise 3×15 · Plank 3×60s"],
        ["Day 7 — Rest", "Full rest."]
      ]
    },
    overweight: {
      headline: "Lift to keep muscle, move to burn fat",
      split: "4 lifting days (Full body ×2 + Upper + Lower) with daily steps",
      cardio: "8,000–10,000 steps daily, plus 3 × 25–30 min moderate cardio. Low-impact if joints ache.",
      focus: [
        "Keep lifting. In a deficit, resistance training is what stops the loss coming from muscle.",
        "8–12 reps, 60–90 s rest — enough volume to burn, enough load to hold muscle.",
        "Walking is the highest-return cardio here: joint-friendly and easy to sustain.",
        "Finish sessions with 10 min incline walking rather than sprints at first.",
        "Don't add more cardio to speed things up — fix the diet instead."
      ],
      days: [
        ["Day 1 — Full body", "Goblet squat 3×12 · Dumbbell bench 3×12 · Lat pulldown 3×12 · Leg curl 3×12 · Plank 3×45s"],
        ["Day 2 — Cardio + core", "30 min brisk walk or cycle · Dead bug 3×12 · Side plank 3×30s/side"],
        ["Day 3 — Upper", "Incline dumbbell press 3×12 · Seated cable row 3×12 · Shoulder press 3×12 · Face pull 3×15 · Triceps pushdown 3×15"],
        ["Day 4 — Rest", "Rest + steps."],
        ["Day 5 — Lower", "Leg press 3×12 · Romanian deadlift 3×12 · Walking lunge 3×10/leg · Calf raise 3×20 · Glute bridge 3×15"],
        ["Day 6 — Full body + cardio", "Squat 3×10 · Push-up 3×max · Cable row 3×12 · 15 min incline walk"],
        ["Day 7 — Rest", "Rest or an easy long walk."]
      ]
    },
    obese: {
      headline: "Start low-impact, build the habit first",
      split: "3 lifting days + daily walking. Consistency beats intensity here.",
      cardio: "Start at 15–20 min walking daily, build to 30–45 min. Cycling and swimming spare the joints.",
      focus: [
        "Get cleared by a doctor before starting, especially with BP, sugar or joint issues.",
        "Machines and supported movements first — they're safer while you build control.",
        "Avoid jumping, running and high-impact HIIT until weight is down and joints adapt.",
        "12–15 reps, light-to-moderate load, 60 s rest. Stop 2–3 reps short of failure.",
        "The win in month one is showing up 3× a week — not how much you lifted.",
        "Stop and seek help for chest pain, dizziness or breathlessness beyond normal effort."
      ],
      days: [
        ["Day 1 — Full body (machines)", "Leg press 3×15 · Chest press machine 3×15 · Lat pulldown 3×15 · Seated leg curl 3×15 · Seated march 3×30s"],
        ["Day 2 — Walk", "20–30 min steady walk. Conversational pace."],
        ["Day 3 — Full body (machines)", "Goblet squat to box 3×12 · Incline push-up 3×10 · Seated row 3×15 · Leg extension 3×15 · Bird dog 3×10/side"],
        ["Day 4 — Walk", "20–30 min walk, or cycling / swimming."],
        ["Day 5 — Full body", "Leg press 3×15 · Shoulder press machine 3×12 · Assisted pull-up 3×10 · Glute bridge 3×15 · Wall sit 3×30s"],
        ["Day 6 — Walk", "30–45 min easy walk."],
        ["Day 7 — Rest", "Full rest. Gentle stretching only."]
      ]
    }
  };

  // Goal overrides the band's default product mix — someone at a healthy BMI
  // may still be cutting or bulking.
  var GOAL_CATEGORIES = {
    gain: ["mass-gainer", "whey-protein", "creatine", "casein", "peanut-butter"],
    lose: ["fat-burner", "whey-protein", "greens", "electrolytes", "plant-protein"],
    maintain: ["whey-protein", "vitamins", "creatine", "greens", "fish-oil"]
  };

  var DISCLAIMER =
    "This plan is general wellness guidance, not medical advice or a diagnosis. BMI does not " +
    "account for muscle mass or body composition. Consult a doctor or registered dietitian " +
    "before changing your diet or starting any supplement or exercise programme, especially if " +
    "you are pregnant, managing a health condition, or taking medication.";

  function healthyRange(heightCm) {
    var m = Number(heightCm) / 100;
    return {
      low: Math.round(18.5 * m * m * 10) / 10,
      high: Math.round(24.9 * m * m * 10) / 10
    };
  }

  function categoriesFor(bandId, goal) {
    if (goal && goal !== "auto" && GOAL_CATEGORIES[goal]) return GOAL_CATEGORIES[goal];
    return (DIET[bandId] || DIET.normal).categories;
  }

  return {
    BANDS: BANDS,
    DIET: DIET,
    WORKOUT: WORKOUT,
    GOAL_CATEGORIES: GOAL_CATEGORIES,
    DISCLAIMER: DISCLAIMER,
    bandFor: bandFor,
    bandById: bandById,
    healthyRange: healthyRange,
    categoriesFor: categoriesFor,
    dietFor: function (bandId) { return DIET[bandId] || DIET.normal; },
    workoutFor: function (bandId) { return WORKOUT[bandId] || WORKOUT.normal; }
  };
})();
