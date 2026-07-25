import React, { useState, useEffect, useMemo, createContext, useContext } from "react";


// ==== constants/fonts.js ====
const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* Visible keyboard focus everywhere. Mouse/touch clicks don't trigger
   :focus-visible, so this only appears for keyboard navigation, tabbing,
   without adding a ring around every mouse click. */
button:focus-visible,
input:focus-visible,
a:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid #9E7E3D;
  outline-offset: 2px;
  border-radius: 4px;
}
`;

// ==== constants/tabs.js ====
const TABS = [
  { id: "synthesis", label: "Your Pattern" },
  { id: "evidence", label: "The Evidence" },
  { id: "nowwhat", label: "Now What" },
  { id: "engine1", label: "Birth Chart" },
  { id: "engine2", label: "Your Answers" },
];

// ==== constants/colors.js ====
const COLORS = {
  INK: "#22242A",
  MUTED: "#424035",
  FAINT: "#787261",
  PAPER: "#FAF6EC",
  CARD: "#FFFFFF",
  LINE: "#E8E1CE",
  GOLD: "#9E7E3D",
  RED: "#A63A3A",
};

// Soft, borderless separation for nested/repeated cards, letting spacing and
// shadow carry the boundary instead of a hard line. Primary containers
// (SubSystem cards, the hero, the closing synthesis) keep real borders since
// those benefit from a firmer edge; this is for the cards inside them.
const SOFT_SHADOW = "0 1px 2px rgba(34,36,42,0.04), 0 2px 8px rgba(34,36,42,0.06)";

// ---- Swiss Ephemeris precision backend (the same pyswisseph setup running
// Three Skies One Self on PythonAnywhere). Paste the base URL of your
// PythonAnywhere app below, e.g. "https://YOURUSERNAME.pythonanywhere.com",
// after registering convergence_precision_api.py in your Flask app. When the
// URL is set and the server answers, every longitude, true Placidus houses,
// the Ascendant, Midheaven, Vertex, Chiron, Lilith, and the true North Node
// come from Swiss Ephemeris. When it's blank or unreachable, the built-in
// verified math takes over automatically, nothing breaks. ----
const PRECISION_BACKEND_URL = "";

// Ask the backend to resolve a place name into coordinates plus the true
// historical UTC offset for that date. This is what removes any need to type
// coordinates: the server has a real geocoder and the full historical
// timezone database, which a browser doesn't. Returns null if the backend
// isn't connected or doesn't recognize the place, and the built-in city
// table takes over from there.
async function fetchGeocode(locationStr, birthDate, birthTime) {
  if (!PRECISION_BACKEND_URL || !locationStr) return null;
  const params = new URLSearchParams({ q: locationStr, date: birthDate || "", time: birthTime || "" });
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;
  try {
    const res = await fetch(`${PRECISION_BACKEND_URL}/api/convergence/geocode?${params}`, controller ? { signal: controller.signal } : undefined);
    if (timeoutId) clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.found) return null;
    return data;
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId);
    return null;
  }
}

async function fetchPrecision(birthDate, utHours, lat, lon) {
  if (!PRECISION_BACKEND_URL || !birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  const params = new URLSearchParams({ year: y, month: m, day: d, ut_hours: utHours, lat, lon });
  // A hanging backend shouldn't stall someone's report. If it doesn't answer
  // within 4 seconds, abort and let the verified built-in math take over,
  // exactly the same path used when the URL is blank or the server is down.
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;
  try {
    const res = await fetch(`${PRECISION_BACKEND_URL}/api/convergence/positions?${params}`, controller ? { signal: controller.signal } : undefined);
    if (timeoutId) clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId);
    return null;
  }
}


// One accent color per system, used on section cards, eyebrows, and jump
// chips so each system is recognizable at a glance without reading labels.
// All chosen to sit naturally in the existing paper/ink/gold world.
const SYSTEM_COLORS = {
  tropical: "#9E7E3D",   // gold, the anchor
  vedic: "#B0562F",      // terracotta
  draconic: "#6E4A7E",   // plum
  numerology: "#2F6F6A", // deep teal
  chinese: "#A63A3A",    // brick red
  humanDesign: "#7C5CB0",// violet
  mbti: "#46628A",       // slate blue
  enneagram: "#A63A3A",  // brick red
};

// The three relationships between independent observations. Not "these
// systems agree or disagree", these are three distinct, meaningful findings
// in their own right: a structural pattern reinforced from two directions, a
// mechanism where independent systems describe the same pattern from
// different angles, behavior and structure, or an adaptation where the
// divergence itself is the evidence, worth investigating rather than
// resolving.
const RELATIONSHIP_TYPES = {
  lineUp: {
    label: "Structural Pattern",
    plain: "Multiple independent systems arrived at the same conclusion.",
    sub: "Reinforcement, they independently point to the same thing",
    color: "#3F7D5C",
  },
  mechanism: {
    label: "Mechanism",
    plain: "One system describes the pattern through behavior. Another describes it through structure.",
    sub: "Two independent descriptions of the same pattern, not one explaining the other",
    color: COLORS.GOLD,
  },
  pullApart: {
    label: "Adaptation",
    plain: "Two independent descriptions of you don't fully match.",
    sub: "The divergence is the evidence, worth investigating, not a conflict to resolve",
    color: COLORS.RED,
  },
};

// ==== constants/quizQuestions.js ====
// Shared question bank for the pre-report intake quiz (QuizIntake) and the
// "Sample Assessment Questions" shown inside the Questionnaire tab. Keeping
// one source of truth means the Questionnaire tab can display the person's
// actual answers instead of a second, disconnected hardcoded copy.
const QUIZ_QUESTIONS = [
  {
    id: "hd_core",
    section: "Human Design",
    q: "Which of these feels closest to how you actually operate?",
    options: [
      { text: "I do best responding to something that genuinely excites me, not starting from a cold, empty plan.", hd: { Generator: 3 } },
      { text: "Same as above, but once I'm in, I move fast and often skip steps other people need.", hd: { "Manifesting Generator": 3 } },
      { text: "I see and guide well, but I burn out when I push to initiate instead of being invited in.", hd: { Projector: 3 } },
      { text: "I start things on my own terms, and I inform people after, not before.", hd: { Manifestor: 3 } },
      { text: "I don't have one consistent pattern, I really do sample and reflect whatever's around me.", hd: { Reflector: 3 } },
    ],
  },
  {
    id: "hd_authority",
    section: "Human Design",
    q: "When you're deciding something real, what actually works?",
    options: [
      { text: "A gut yes or no, felt immediately, right when I'm asked", hd_authority: "Sacral" },
      { text: "Clarity that only shows up after riding out the feeling, not in the moment", hd_authority: "Emotional" },
      { text: "A quiet, instant instinct that speaks once and doesn't repeat itself", hd_authority: "Splenic" },
      { text: "Talking it out loud to someone I trust until it becomes clear", hd_authority: "Self-Projected" },
    ],
  },
  {
    id: "quest_group1",
    section: "Enneagram",
    quest: "I",
    q: "Group I. Which of these has been most true of you, most of your life?",
    options: [
      { text: "I've been fairly independent and assertive. I set my own goals, get involved, and want to make things happen. I don't go looking for confrontation, but I don't let people push me around either.", quest1: "A" },
      { text: "I've been quiet and comfortable on my own. I don't draw much attention to myself socially, and asserting myself forcefully isn't really my style. A lot of what moves me happens in my imagination.", quest1: "B" },
      { text: "I've been extremely responsible and dedicated. I feel terrible if I don't keep my commitments. I've made real sacrifices for other people, and I tend to do what needs doing before I take care of myself.", quest1: "C" },
    ],
  },
  {
    id: "quest_group2",
    section: "Enneagram",
    quest: "II",
    q: "Group II. And which of these?",
    options: [
      { text: "I keep a positive outlook and assume things will work out. I find something to be enthusiastic about, and I like helping other people feel good. Staying positive has sometimes meant putting off my own problems too long.", quest2: "X" },
      { text: "I have strong feelings and people can usually tell when something's wrong. I can be guarded, but I'm more sensitive than I let on. I want to know where I stand, and I want people to meet me at my intensity.", quest2: "Y" },
      { text: "I'm self-controlled and logical, and not that comfortable with feelings. I'm efficient, I prefer working on my own, and I try to keep emotion out of problems. Some people read that as detached.", quest2: "Z" },
    ],
  },
  {
    id: "enn_passion",
    section: "Enneagram",
    q: "Last one. The Enneagram separates types by what pulls you off center, not by behavior. Which of these is most familiar from the inside?",
    options: [
      { text: "Resentment. A low-grade frustration that things, including me, aren't as they should be.", enneagram: { 1: 4 } },
      { text: "Pride. Difficulty admitting my own needs, especially while I'm busy meeting everyone else's.", enneagram: { 2: 4 } },
      { text: "Vanity. Building the version of me that succeeds, sometimes at the cost of the real one.", enneagram: { 3: 4 } },
      { text: "Envy. The sense that something essential is missing in me that others seem to have.", enneagram: { 4: 4 } },
      { text: "Avarice. Holding onto my energy and resources because contact might deplete what little there is.", enneagram: { 5: 4 } },
      { text: "Anxiety. Bracing for what hasn't happened yet, and rarely feeling fully on solid ground.", enneagram: { 6: 4 } },
      { text: "Gluttony. Reaching for the next good thing to stay ahead of any emptiness underneath.", enneagram: { 7: 4 } },
      { text: "Intensity. Pushing hard against everything, because softness has felt unsafe.", enneagram: { 8: 4 } },
      { text: "Sloth. Not laziness, but a reluctance to fully show up and let myself be affected.", enneagram: { 9: 4 } },
    ],
  },
  {
    id: "mbti_tf",
    section: "MBTI",
    q: "When I have to make a tough call, I usually go with:",
    options: [
      { text: "Whatever makes the most sense logically, even if it's not what people want to hear", mbti: { dim: "TF", value: "T" } },
      { text: "Whatever takes care of the people it affects, even if it's not the most efficient option", mbti: { dim: "TF", value: "F" } },
    ],
  },
  {
    id: "mbti_jp",
    section: "MBTI",
    q: "Which sounds more like your actual life?",
    options: [
      { text: "I like knowing the plan ahead of time, loose ends bug me", mbti: { dim: "JP", value: "J" } },
      { text: "I like keeping my options open, a locked-in plan feels confining", mbti: { dim: "JP", value: "P" } },
    ],
  },
];

// ==== utils/helpers.js ====
const TIER_COLOR = { Primary: COLORS.GOLD, Secondary: "#8A7F5C", Supporting: COLORS.FAINT, Real: "#3F7D5C", Generated: "#A63A3A" };

// ==== utils/engine.js ====
// ---------------------------------------------------------------------------
// Convergence personalization engine.
//
// This module turns whatever a person enters (name, birth date, birth time,
// birth location) into a full, self-consistent profile. Three pieces are
// REAL, standard calculations that will be accurate for any input:
//   - Sun sign        (from date, standard tropical zodiac date ranges)
//   - Chinese zodiac   (animal + element, from birth year, standard cycle)
//   - Numerology       (Life Path, Expression, Soul Urge, Gift, standard
//                        Pythagorean letter values + digit reduction)
//
// Everything that would require an ephemeris (planetary positions, houses,
// Vedic dasha timing, Human Design gates) is generated with a seeded random
// number generator: the same inputs always produce the same output, and
// different inputs produce different, internally-consistent output. It is
// NOT astronomically accurate — doing that requires a real ephemeris backend,
// which isn't available in this environment — but it is real per-person data,
// not one fixed sample record. See BirthDataForm's own disclaimer.
// ---------------------------------------------------------------------------

// ---------- seeding ----------

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(name, dateStr, timeStr, location) {
  const key = `${name || ""}|${dateStr || ""}|${timeStr || ""}|${location || ""}`;
  return mulberry32(hashString(key));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted(rng, entries) {
  // entries: [[value, weight], ...]
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, weight] of entries) {
    r -= weight;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function degreeString(rng) {
  const deg = Math.floor(rng() * 30);
  const min = Math.floor(rng() * 60);
  return `${deg}°${String(min).padStart(2, "0")}'`;
}

const ORDINAL_HOUSE = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "8th", 9: "9th", 10: "10th", 11: "11th", 12: "12th" };

// ---------- real: sun sign ----------

const SUN_SIGN_RANGES = [
  { sign: "Capricorn", from: [12, 22], to: [1, 19] },
  { sign: "Aquarius", from: [1, 20], to: [2, 18] },
  { sign: "Pisces", from: [2, 19], to: [3, 20] },
  { sign: "Aries", from: [3, 21], to: [4, 19] },
  { sign: "Taurus", from: [4, 20], to: [5, 20] },
  { sign: "Gemini", from: [5, 21], to: [6, 20] },
  { sign: "Cancer", from: [6, 21], to: [7, 22] },
  { sign: "Leo", from: [7, 23], to: [8, 22] },
  { sign: "Virgo", from: [8, 23], to: [9, 22] },
  { sign: "Libra", from: [9, 23], to: [10, 22] },
  { sign: "Scorpio", from: [10, 23], to: [11, 21] },
  { sign: "Sagittarius", from: [11, 22], to: [12, 21] },
];

function computeSunSign(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  for (const r of SUN_SIGN_RANGES) {
    const [fm, fd] = r.from;
    const [tm, td] = r.to;
    if (fm === tm) {
      if (month === fm && day >= fd && day <= td) return r.sign;
    } else if (fm > tm) {
      // wraps year end (Capricorn: Dec 22 - Jan 19)
      if ((month === fm && day >= fd) || (month === tm && day <= td)) return r.sign;
    } else {
      if ((month === fm && day >= fd) || (month === tm && day <= td) || (month > fm && month < tm)) return r.sign;
    }
  }
  return null;
}

// ---------- real: Chinese zodiac ----------

const CHINESE_ANIMALS = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"];
const CHINESE_ELEMENTS = ["Wood", "Fire", "Earth", "Metal", "Water"];

function computeChineseZodiac(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const animalIdx = (((year - 1924) % 12) + 12) % 12;
  const elementIdx = Math.floor(((((year - 4) % 10) + 10) % 10) / 2);
  const animal = CHINESE_ANIMALS[animalIdx];
  const element = CHINESE_ELEMENTS[elementIdx];
  return { animal, element, sign: `${element} ${animal}` };
}

// ---------- real: numerology ----------

function letterValue(ch) {
  const code = ch.toUpperCase().charCodeAt(0) - 65; // A=0
  if (code < 0 || code > 25) return 0;
  return (code % 9) + 1;
}

function reduceNumber(n) {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
    n = String(n)
      .split("")
      .reduce((s, d) => s + parseInt(d, 10), 0);
  }
  return n;
}

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

function computeNumerology(fullName, dateStr) {
  const name = (fullName || "").replace(/[^a-zA-Z]/g, "");
  const d = dateStr ? new Date(dateStr + "T00:00:00") : null;
  const validDate = d && !isNaN(d.getTime());

  let lifePath = 7;
  if (validDate) {
    const digits = `${d.getMonth() + 1}${d.getDate()}${d.getFullYear()}`.split("").reduce((s, c) => s + parseInt(c, 10), 0);
    lifePath = reduceNumber(digits);
  }

  let expression = 7;
  let soulUrge = 7;
  let gift = 7;
  if (name.length > 0) {
    let expSum = 0;
    let vowelSum = 0;
    let consSum = 0;
    for (const ch of name) {
      const v = letterValue(ch);
      expSum += v;
      if (VOWELS.has(ch.toUpperCase())) vowelSum += v;
      else consSum += v;
    }
    expression = reduceNumber(expSum);
    soulUrge = reduceNumber(vowelSum || expSum);
    gift = reduceNumber(consSum || expSum);
  }

  return { lifePath, expression, soulUrge, gift };
}

// ---------- real: planetary positions ----------
// Based on Paul Schlyter's published low-precision orbital elements method
// (accuracy ~1-2 arcmin for the planets and the Moon with perturbation
// terms included). Source: https://stjarnhimlen.se/comp/ppcomp.html
// Verified against Schlyter's own Jan 1 2000, 12:00 UT worked example
// (Sun ≈ 10°24' Capricorn) before being wired into the app.
// Houses, the Ascendant, and the Midheaven still need a geocoded birth
// location and precise local sidereal time, which this app doesn't collect,
// so those stay generated and clearly labeled as such — see generateChartLayer.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function dayNumber(y, m, dd, utHours) {
  const d = 367 * y - Math.floor((7 * (y + Math.floor((m + 9) / 12))) / 4) + Math.floor((275 * m) / 9) + dd - 730530;
  return d + utHours / 24.0;
}

function normDeg(x) {
  x = x % 360;
  return x < 0 ? x + 360 : x;
}

function solveKepler(Mdeg, e) {
  let E = Mdeg + (e * R2D) * Math.sin(Mdeg * D2R) * (1 + e * Math.cos(Mdeg * D2R));
  for (let i = 0; i < 8; i++) {
    const E0 = E;
    E = E0 - (E0 - (e * R2D) * Math.sin(E0 * D2R) - Mdeg) / (1 - e * Math.cos(E0 * D2R));
    if (Math.abs(E - E0) < 0.0001) break;
  }
  return E;
}

function planetHeliocentric(elements) {
  const { N, i, w, a, e, M } = elements;
  const E = solveKepler(normDeg(M), e);
  const xv = a * (Math.cos(E * D2R) - e);
  const yv = a * (Math.sqrt(1 - e * e) * Math.sin(E * D2R));
  const v = R2D * Math.atan2(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  const Nr = N * D2R, ir = i * D2R, vwr = (v + w) * D2R;
  const xh = r * (Math.cos(Nr) * Math.cos(vwr) - Math.sin(Nr) * Math.sin(vwr) * Math.cos(ir));
  const yh = r * (Math.sin(Nr) * Math.cos(vwr) + Math.cos(Nr) * Math.sin(vwr) * Math.cos(ir));
  return { xh, yh };
}

function sunPosition(d) {
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const M = normDeg(356.047 + 0.9856002585 * d);
  const E = solveKepler(M, e);
  const xv = Math.cos(E * D2R) - e;
  const yv = Math.sqrt(1 - e * e) * Math.sin(E * D2R);
  const v = R2D * Math.atan2(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  return { lonsun: normDeg(v + w), r, M, w };
}

function lonToSignDegree(lon) {
  const L = normDeg(lon);
  const signIdx = Math.floor(L / 30);
  return { lon: L, sign: ZODIAC_SIGNS[signIdx], degree: L - signIdx * 30 };
}

function degMinString(decimalDegreesInSign) {
  let deg = Math.floor(decimalDegreesInSign);
  let min = Math.round((decimalDegreesInSign - deg) * 60);
  if (min === 60) {
    min = 0;
    deg += 1;
  }
  return `${deg}°${String(min).padStart(2, "0")}'`;
}

function calcRealPlanetPositions(dateStr, timeStr, utHoursOverride = null) {
  if (!dateStr) return null;
  const [y, m, dd] = dateStr.split("-").map(Number);
  if (!y || !m || !dd) return null;
  const utHours = utHoursOverride !== null
    ? utHoursOverride
    : timeStr
    ? (() => {
        const [h, mi] = timeStr.split(":").map(Number);
        return h + mi / 60;
      })()
    : 12;
  const d = dayNumber(y, m, dd, utHours);

  const sun = sunPosition(d);
  const xs = sun.r * Math.cos(sun.lonsun * D2R);
  const ys = sun.r * Math.sin(sun.lonsun * D2R);

  const elementsFor = {
    Mercury: { N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.0e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d },
    Venus: { N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d },
    Mars: { N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d },
    Jupiter: { N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.895 + 0.0830853001 * d },
    Saturn: { N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.967 + 0.0334442282 * d },
    Uranus: { N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d, w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d, e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d },
    Neptune: { N: 131.7806 + 3.0173e-5 * d, i: 1.77 - 2.55e-7 * d, w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d, e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d },
  };

  const results = { Sun: lonToSignDegree(sun.lonsun) };
  for (const [name, elements] of Object.entries(elementsFor)) {
    const { xh, yh } = planetHeliocentric(elements);
    const xg = xh + xs, yg = yh + ys;
    results[name] = lonToSignDegree(R2D * Math.atan2(yg, xg));
  }

  // Moon: geocentric orbit, plus the largest ~12 perturbation terms
  // (evection, variation, yearly equation, etc.) per Schlyter section 9.
  const moonEl = { N: normDeg(125.1228 - 0.0529538083 * d), i: 5.1454, w: normDeg(318.0634 + 0.1643573223 * d), a: 60.2666, e: 0.0549, M: normDeg(115.3654 + 13.0649929509 * d) };
  const { xh: xm, yh: ym } = planetHeliocentric(moonEl);
  let moonLon = R2D * Math.atan2(ym, xm);
  const Ms = normDeg(sun.M), Mm = normDeg(moonEl.M);
  const Ls = normDeg(Ms + sun.w), Lm = normDeg(Mm + moonEl.w + moonEl.N);
  const Dd = normDeg(Lm - Ls), F = normDeg(Lm - moonEl.N);
  moonLon +=
    -1.274 * Math.sin((Mm - 2 * Dd) * D2R) + 0.658 * Math.sin(2 * Dd * D2R) - 0.186 * Math.sin(Ms * D2R) -
    0.059 * Math.sin((2 * Mm - 2 * Dd) * D2R) - 0.057 * Math.sin((Mm - 2 * Dd + Ms) * D2R) + 0.053 * Math.sin((Mm + 2 * Dd) * D2R) +
    0.046 * Math.sin((2 * Dd - Ms) * D2R) + 0.041 * Math.sin((Mm - Ms) * D2R) - 0.035 * Math.sin(Dd * D2R) -
    0.031 * Math.sin((Mm + Ms) * D2R) - 0.015 * Math.sin((2 * F - 2 * Dd) * D2R) + 0.011 * Math.sin((Mm - 4 * Dd) * D2R);
  results.Moon = lonToSignDegree(moonLon);

  // Mean lunar North Node — real, from the Moon's own orbital elements above.
  results.NorthNode = lonToSignDegree(moonEl.N);

  return results;
}

// ---------- real: Ascendant, Midheaven, and houses (needs a birth location) ----------
// Formulas verified against RadixPro's fully worked example (Enschede, Nov 2
// 2016, 21:17:30 UT: Ascendant = 3°30' Leo, MC = 9°38' Aries) before being
// wired in. GMST formula is the standard IAU expression. US daylight saving
// time is handled (see effectiveUtcOffset below); non-US entries use their
// standard offset year-round, since this table doesn't yet track every
// country's DST calendar.

const CITY_COORDS = {
  "new york": { lat: 40.7128, lon: -74.006, utc: -5, us: true },
  "brooklyn": { lat: 40.6782, lon: -73.9442, utc: -5, us: true },
  "manhattan": { lat: 40.7831, lon: -73.9712, utc: -5, us: true },
  "los angeles": { lat: 34.0522, lon: -118.2437, utc: -8, us: true },
  "chicago": { lat: 41.8781, lon: -87.6298, utc: -6, us: true },
  "houston": { lat: 29.7604, lon: -95.3698, utc: -6, us: true },
  "phoenix": { lat: 33.4484, lon: -112.074, utc: -7, us: true, observesDST: false },
  "philadelphia": { lat: 39.9526, lon: -75.1652, utc: -5, us: true },
  "san antonio": { lat: 29.4241, lon: -98.4936, utc: -6, us: true },
  "san diego": { lat: 32.7157, lon: -117.1611, utc: -8, us: true },
  "dallas": { lat: 32.7767, lon: -96.797, utc: -6, us: true },
  "san francisco": { lat: 37.7749, lon: -122.4194, utc: -8, us: true },
  "atlanta": { lat: 33.749, lon: -84.388, utc: -5, us: true },
  "boston": { lat: 42.3601, lon: -71.0589, utc: -5, us: true },
  "miami": { lat: 25.7617, lon: -80.1918, utc: -5, us: true },
  "seattle": { lat: 47.6062, lon: -122.3321, utc: -8, us: true },
  "denver": { lat: 39.7392, lon: -104.9903, utc: -7, us: true },
  "detroit": { lat: 42.3314, lon: -83.0458, utc: -5, us: true },
  "washington": { lat: 38.9072, lon: -77.0369, utc: -5, us: true },
  "las vegas": { lat: 36.1699, lon: -115.1398, utc: -8, us: true },
  "nashville": { lat: 36.1627, lon: -86.7816, utc: -6, us: true },
  "new orleans": { lat: 29.9511, lon: -90.0715, utc: -6, us: true },
  "honolulu": { lat: 21.3069, lon: -157.8583, utc: -10, us: true, observesDST: false },
  "anchorage": { lat: 61.2181, lon: -149.9003, utc: -9, us: true },
  "toronto": { lat: 43.6532, lon: -79.3832, utc: -5 },
  "vancouver": { lat: 49.2827, lon: -123.1207, utc: -8 },
  "montreal": { lat: 45.5019, lon: -73.5674, utc: -5 },
  "mexico city": { lat: 19.4326, lon: -99.1332, utc: -6 },
  "london": { lat: 51.5072, lon: -0.1276, utc: 0 },
  "manchester": { lat: 53.4808, lon: -2.2426, utc: 0 },
  "paris": { lat: 48.8566, lon: 2.3522, utc: 1 },
  "berlin": { lat: 52.52, lon: 13.405, utc: 1 },
  "madrid": { lat: 40.4168, lon: -3.7038, utc: 1 },
  "rome": { lat: 41.9028, lon: 12.4964, utc: 1 },
  "amsterdam": { lat: 52.3676, lon: 4.9041, utc: 1 },
  "dublin": { lat: 53.3498, lon: -6.2603, utc: 0 },
  "lisbon": { lat: 38.7223, lon: -9.1393, utc: 0 },
  "vienna": { lat: 48.2082, lon: 16.3738, utc: 1 },
  "zurich": { lat: 47.3769, lon: 8.5417, utc: 1 },
  "brussels": { lat: 50.8503, lon: 4.3517, utc: 1 },
  "stockholm": { lat: 59.3293, lon: 18.0686, utc: 1 },
  "oslo": { lat: 59.9139, lon: 10.7522, utc: 1 },
  "copenhagen": { lat: 55.6761, lon: 12.5683, utc: 1 },
  "athens": { lat: 37.9838, lon: 23.7275, utc: 2 },
  "warsaw": { lat: 52.2297, lon: 21.0122, utc: 1 },
  "moscow": { lat: 55.7558, lon: 37.6173, utc: 3 },
  "istanbul": { lat: 41.0082, lon: 28.9784, utc: 3 },
  "dubai": { lat: 25.2048, lon: 55.2708, utc: 4 },
  "cairo": { lat: 30.0444, lon: 31.2357, utc: 2 },
  "lagos": { lat: 6.5244, lon: 3.3792, utc: 1 },
  "nairobi": { lat: -1.2921, lon: 36.8219, utc: 3 },
  "johannesburg": { lat: -26.2041, lon: 28.0473, utc: 2 },
  "cape town": { lat: -33.9249, lon: 18.4241, utc: 2 },
  "mumbai": { lat: 19.076, lon: 72.8777, utc: 5.5 },
  "delhi": { lat: 28.7041, lon: 77.1025, utc: 5.5 },
  "bangalore": { lat: 12.9716, lon: 77.5946, utc: 5.5 },
  "karachi": { lat: 24.8607, lon: 67.0011, utc: 5 },
  "dhaka": { lat: 23.8103, lon: 90.4125, utc: 6 },
  "bangkok": { lat: 13.7563, lon: 100.5018, utc: 7 },
  "singapore": { lat: 1.3521, lon: 103.8198, utc: 8 },
  "kuala lumpur": { lat: 3.139, lon: 101.6869, utc: 8 },
  "jakarta": { lat: -6.2088, lon: 106.8456, utc: 7 },
  "manila": { lat: 14.5995, lon: 120.9842, utc: 8 },
  "hong kong": { lat: 22.3193, lon: 114.1694, utc: 8 },
  "shanghai": { lat: 31.2304, lon: 121.4737, utc: 8 },
  "beijing": { lat: 39.9042, lon: 116.4074, utc: 8 },
  "seoul": { lat: 37.5665, lon: 126.978, utc: 9 },
  "tokyo": { lat: 35.6762, lon: 139.6503, utc: 9 },
  "osaka": { lat: 34.6937, lon: 135.5023, utc: 9 },
  "sydney": { lat: -33.8688, lon: 151.2093, utc: 10 },
  "melbourne": { lat: -37.8136, lon: 144.9631, utc: 10 },
  "auckland": { lat: -36.8485, lon: 174.7633, utc: 12 },
  "sao paulo": { lat: -23.5505, lon: -46.6333, utc: -3 },
  "rio de janeiro": { lat: -22.9068, lon: -43.1729, utc: -3 },
  "buenos aires": { lat: -34.6037, lon: -58.3816, utc: -3 },
  "bogota": { lat: 4.711, lon: -74.0721, utc: -5 },
  "lima": { lat: -12.0464, lon: -77.0428, utc: -5 },
  "santiago": { lat: -33.4489, lon: -70.6693, utc: -4 },
  "kingston": { lat: 17.9714, lon: -76.7931, utc: -5 },
  "havana": { lat: 23.1136, lon: -82.3666, utc: -5 },
};

// Extra US cities so "City, State" entries compute. Substring matching below
// means "Buffalo, NY", "buffalo new york", and "Buffalo" all resolve the same.
const US_CITY_EXTRA = {
  "buffalo": { lat: 42.8864, lon: -78.8784, utc: -5 },
  "rochester": { lat: 43.1566, lon: -77.6088, utc: -5 },
  "albany": { lat: 42.6526, lon: -73.7562, utc: -5 },
  "syracuse": { lat: 43.0481, lon: -76.1474, utc: -5 },
  "yonkers": { lat: 40.9312, lon: -73.8988, utc: -5 },
  "nyack": { lat: 41.0909, lon: -73.9182, utc: -5 },
  "white plains": { lat: 41.034, lon: -73.7629, utc: -5 },
  "new rochelle": { lat: 40.9115, lon: -73.7824, utc: -5 },
  "mount vernon": { lat: 40.9126, lon: -73.8371, utc: -5 },
  "spring valley": { lat: 41.1132, lon: -74.0437, utc: -5 },
  "suffern": { lat: 41.1148, lon: -74.1496, utc: -5 },
  "poughkeepsie": { lat: 41.7004, lon: -73.9209, utc: -5 },
  "newburgh": { lat: 41.5034, lon: -74.0104, utc: -5 },
  "peekskill": { lat: 41.29, lon: -73.9204, utc: -5 },
  "stamford": { lat: 41.0534, lon: -73.5387, utc: -5 },
  "bridgeport": { lat: 41.1865, lon: -73.1952, utc: -5 },
  "new haven": { lat: 41.3083, lon: -72.9279, utc: -5 },
  "hartford": { lat: 41.7658, lon: -72.6734, utc: -5 },
  "paterson": { lat: 40.9168, lon: -74.1718, utc: -5 },
  "hackensack": { lat: 40.8859, lon: -74.0435, utc: -5 },
  "trenton": { lat: 40.2206, lon: -74.7597, utc: -5 },
  "allentown": { lat: 40.6023, lon: -75.4714, utc: -5 },
  "wilmington": { lat: 39.7391, lon: -75.5398, utc: -5 },
  "providence": { lat: 41.824, lon: -71.4128, utc: -5 },
  "worcester": { lat: 42.2626, lon: -71.8023, utc: -5 },
  "springfield": { lat: 42.1015, lon: -72.5898, utc: -5 },
  "newark": { lat: 40.7357, lon: -74.1724, utc: -5 },
  "jersey city": { lat: 40.7178, lon: -74.0431, utc: -5 },
  "baltimore": { lat: 39.2904, lon: -76.6122, utc: -5 },
  "richmond": { lat: 37.5407, lon: -77.436, utc: -5 },
  "charlotte": { lat: 35.2271, lon: -80.8431, utc: -5 },
  "raleigh": { lat: 35.7796, lon: -78.6382, utc: -5 },
  "charleston": { lat: 32.7765, lon: -79.9311, utc: -5 },
  "columbia": { lat: 34.0007, lon: -81.0348, utc: -5 },
  "savannah": { lat: 32.0809, lon: -81.0912, utc: -5 },
  "jacksonville": { lat: 30.3322, lon: -81.6557, utc: -5 },
  "orlando": { lat: 28.5384, lon: -81.3789, utc: -5 },
  "tampa": { lat: 27.9506, lon: -82.4572, utc: -5 },
  "fort lauderdale": { lat: 26.1224, lon: -80.1373, utc: -5 },
  "pittsburgh": { lat: 40.4406, lon: -79.9959, utc: -5 },
  "cleveland": { lat: 41.4993, lon: -81.6944, utc: -5 },
  "columbus": { lat: 39.9612, lon: -82.9988, utc: -5 },
  "cincinnati": { lat: 39.1031, lon: -84.512, utc: -5 },
  "indianapolis": { lat: 39.7684, lon: -86.1581, utc: -5 },
  "louisville": { lat: 38.2527, lon: -85.7585, utc: -5 },
  "memphis": { lat: 35.1495, lon: -90.049, utc: -6 },
  "birmingham": { lat: 33.5186, lon: -86.8104, utc: -6 },
  "jackson": { lat: 32.2988, lon: -90.1848, utc: -6 },
  "baton rouge": { lat: 30.4515, lon: -91.1871, utc: -6 },
  "little rock": { lat: 34.7465, lon: -92.2896, utc: -6 },
  "st louis": { lat: 38.627, lon: -90.1994, utc: -6 },
  "saint louis": { lat: 38.627, lon: -90.1994, utc: -6 },
  "kansas city": { lat: 39.0997, lon: -94.5786, utc: -6 },
  "minneapolis": { lat: 44.9778, lon: -93.265, utc: -6 },
  "milwaukee": { lat: 43.0389, lon: -87.9065, utc: -6 },
  "oklahoma city": { lat: 35.4676, lon: -97.5164, utc: -6 },
  "tulsa": { lat: 36.154, lon: -95.9928, utc: -6 },
  "austin": { lat: 30.2672, lon: -97.7431, utc: -6 },
  "fort worth": { lat: 32.7555, lon: -97.3308, utc: -6 },
  "el paso": { lat: 31.7619, lon: -106.485, utc: -7 },
  "albuquerque": { lat: 35.0844, lon: -106.6504, utc: -7 },
  "salt lake city": { lat: 40.7608, lon: -111.891, utc: -7 },
  "boise": { lat: 43.615, lon: -116.2023, utc: -7 },
  "tucson": { lat: 32.2226, lon: -110.9747, utc: -7, observesDST: false },
  "portland": { lat: 45.5152, lon: -122.6784, utc: -8 },
  "sacramento": { lat: 38.5816, lon: -121.4944, utc: -8 },
  "san jose": { lat: 37.3382, lon: -121.8863, utc: -8 },
  "oakland": { lat: 37.8044, lon: -122.2712, utc: -8 },
  "fresno": { lat: 36.7378, lon: -119.7871, utc: -8 },
  "long beach": { lat: 33.7701, lon: -118.1937, utc: -8 },
  "bronx": { lat: 40.8448, lon: -73.8648, utc: -5 },
  "queens": { lat: 40.7282, lon: -73.7949, utc: -5 },
  "staten island": { lat: 40.5795, lon: -74.1502, utc: -5 },
};
for (const key of Object.keys(US_CITY_EXTRA)) US_CITY_EXTRA[key].us = true;
Object.assign(CITY_COORDS, US_CITY_EXTRA);

// State-level fallback: when the town isn't in the city table ("Nyack, NY"),
// the state's approximate center still gives a real Ascendant within a
// degree or two of latitude, far closer than not computing at all. Two-letter
// abbreviations are matched as whole tokens only, so words like "in", "or",
// and "me" in a town name can't false-match a state.
const US_STATES = {
  "alabama": { abbr: "al", lat: 32.8, lon: -86.8, utc: -6 },
  "alaska": { abbr: "ak", lat: 64.0, lon: -152.0, utc: -9 },
  "arizona": { abbr: "az", lat: 34.2, lon: -111.6, utc: -7, observesDST: false },
  "arkansas": { abbr: "ar", lat: 34.8, lon: -92.4, utc: -6 },
  "california": { abbr: "ca", lat: 37.2, lon: -119.3, utc: -8 },
  "colorado": { abbr: "co", lat: 39.0, lon: -105.5, utc: -7 },
  "connecticut": { abbr: "ct", lat: 41.6, lon: -72.7, utc: -5 },
  "delaware": { abbr: "de", lat: 39.0, lon: -75.5, utc: -5 },
  "florida": { abbr: "fl", lat: 28.6, lon: -82.4, utc: -5 },
  "georgia": { abbr: "ga", lat: 32.6, lon: -83.4, utc: -5 },
  "hawaii": { abbr: "hi", lat: 20.3, lon: -156.4, utc: -10, observesDST: false },
  "idaho": { abbr: "id", lat: 44.4, lon: -114.6, utc: -7 },
  "illinois": { abbr: "il", lat: 40.0, lon: -89.2, utc: -6 },
  "indiana": { abbr: "in", lat: 39.9, lon: -86.3, utc: -5 },
  "iowa": { abbr: "ia", lat: 42.1, lon: -93.5, utc: -6 },
  "kansas": { abbr: "ks", lat: 38.5, lon: -98.4, utc: -6 },
  "kentucky": { abbr: "ky", lat: 37.5, lon: -85.3, utc: -5 },
  "louisiana": { abbr: "la", lat: 31.1, lon: -92.0, utc: -6 },
  "maine": { abbr: "me", lat: 45.4, lon: -69.2, utc: -5 },
  "maryland": { abbr: "md", lat: 39.0, lon: -76.8, utc: -5 },
  "massachusetts": { abbr: "ma", lat: 42.3, lon: -71.8, utc: -5 },
  "michigan": { abbr: "mi", lat: 44.3, lon: -85.4, utc: -5 },
  "minnesota": { abbr: "mn", lat: 46.3, lon: -94.3, utc: -6 },
  "mississippi": { abbr: "ms", lat: 32.7, lon: -89.7, utc: -6 },
  "missouri": { abbr: "mo", lat: 38.4, lon: -92.5, utc: -6 },
  "montana": { abbr: "mt", lat: 47.0, lon: -109.6, utc: -7 },
  "nebraska": { abbr: "ne", lat: 41.5, lon: -99.8, utc: -6 },
  "nevada": { abbr: "nv", lat: 39.3, lon: -116.6, utc: -8 },
  "new hampshire": { abbr: "nh", lat: 43.7, lon: -71.6, utc: -5 },
  "new jersey": { abbr: "nj", lat: 40.2, lon: -74.7, utc: -5 },
  "new mexico": { abbr: "nm", lat: 34.4, lon: -106.1, utc: -7 },
  "new york": { abbr: "ny", lat: 42.9, lon: -75.5, utc: -5 },
  "north carolina": { abbr: "nc", lat: 35.5, lon: -79.4, utc: -5 },
  "north dakota": { abbr: "nd", lat: 47.4, lon: -100.5, utc: -6 },
  "ohio": { abbr: "oh", lat: 40.3, lon: -82.8, utc: -5 },
  "oklahoma": { abbr: "ok", lat: 35.6, lon: -97.5, utc: -6 },
  "oregon": { abbr: "or", lat: 44.0, lon: -120.5, utc: -8 },
  "pennsylvania": { abbr: "pa", lat: 40.9, lon: -77.8, utc: -5 },
  "rhode island": { abbr: "ri", lat: 41.7, lon: -71.6, utc: -5 },
  "south carolina": { abbr: "sc", lat: 33.9, lon: -80.9, utc: -5 },
  "south dakota": { abbr: "sd", lat: 44.4, lon: -100.2, utc: -6 },
  "tennessee": { abbr: "tn", lat: 35.9, lon: -86.4, utc: -6 },
  "texas": { abbr: "tx", lat: 31.5, lon: -99.3, utc: -6 },
  "utah": { abbr: "ut", lat: 39.3, lon: -111.7, utc: -7 },
  "vermont": { abbr: "vt", lat: 44.1, lon: -72.7, utc: -5 },
  "virginia": { abbr: "va", lat: 37.5, lon: -78.9, utc: -5 },
  "washington state": { abbr: "wa", lat: 47.4, lon: -120.5, utc: -8 },
  "west virginia": { abbr: "wv", lat: 38.6, lon: -80.6, utc: -5 },
  "wisconsin": { abbr: "wi", lat: 44.6, lon: -89.7, utc: -6 },
  "wyoming": { abbr: "wy", lat: 43.0, lon: -107.6, utc: -7 },
};

// Parse a "lat, lon" string into real coordinates. Returns null if it isn't
// two valid numbers in range, so a half-typed entry never silently produces a
// wrong chart. West longitude is negative, south latitude is negative.
function parseExactCoords(str) {
  if (!str) return null;
  const parts = String(str).split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function lookupCity(locationStr) {
  if (!locationStr) return null;
  const norm = locationStr.toLowerCase().trim().replace(/[.]/g, "");
  // 1. Exact city match on the part before a comma.
  const beforeComma = norm.split(",")[0].trim();
  if (CITY_COORDS[beforeComma]) return { ...CITY_COORDS[beforeComma], matchedLabel: beforeComma, level: "city" };
  // 2. Substring city match over the whole entry, longest names first.
  const entries = Object.entries(CITY_COORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [name, coords] of entries) {
    if (norm.includes(name)) return { ...coords, matchedLabel: name, level: "city" };
  }
  // 3. State fallback: full names as substrings, abbreviations as whole tokens.
  const tokens = norm.split(/[\s,]+/).filter(Boolean);
  for (const [stateName, s] of Object.entries(US_STATES)) {
    if (norm.includes(stateName) || tokens.includes(s.abbr)) {
      return { lat: s.lat, lon: s.lon, utc: s.utc, us: true, observesDST: s.observesDST, matchedLabel: stateName === "washington state" ? "washington" : stateName, level: "state" };
    }
  }
  return null;
}

function computeAscMC(dateStr, timeStr, lat, lon, utcOffset) {
  if (!dateStr || !timeStr) return null;
  const [y, m, dd] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const localHours = h + mi / 60;
  const utHours = localHours - utcOffset;
  const d = dayNumber(y, m, dd, utHours);
  const JD = d + 2451543.5;
  const T = (JD - 2451545.0) / 36525;
  let GMST = 280.46061837 + 360.98564736629 * (JD - 2451545.0) + 0.000387933 * T * T;
  GMST = ((GMST % 360) + 360) % 360;
  const LST = ((GMST + lon) % 360 + 360) % 360; // RAMC, in degrees
  const RAMC = LST;

  // Obliquity of the ecliptic, slowly decreasing over time (standard formula).
  const eps = 23.4392911 - 0.0130042 * T;

  const ascY = Math.cos(RAMC * D2R);
  const ascX = -(Math.sin(eps * D2R) * Math.tan(lat * D2R) + Math.cos(eps * D2R) * Math.sin(RAMC * D2R));
  let asc = Math.atan2(ascY, ascX) * R2D;
  asc = ((asc % 360) + 360) % 360;

  let mc = Math.atan2(Math.sin(RAMC * D2R), Math.cos(RAMC * D2R) * Math.cos(eps * D2R)) * R2D;
  mc = ((mc % 360) + 360) % 360;

  return { ascendant: lonToSignDegree(asc), midheaven: lonToSignDegree(mc), ascLon: asc };
}

// Whole Sign: house 1 is the Ascendant's whole sign, houses count forward
// from there one sign at a time. Equal House: identical starting point, but
// each house cusp sits exactly 30 degrees past the last rather than at a
// sign boundary. Both are real, closed-form house systems once the
// Ascendant is known, unlike Placidus which needs iterative solving this
// build doesn't implement yet.
function wholeSignHouseOf(pointLon, ascLon) {
  // Snap to a sign boundary when within floating-point noise, so a planet at
  // exactly 0°00'00" of a sign is counted in that sign, not the previous one.
  const snapSign = (lon) => {
    let L = lon % 360;
    if (L < 0) L += 360;
    const nearest = Math.round(L / 30) * 30;
    return Math.abs(L - nearest) < CUSP_EPSILON ? nearest % 360 : L;
  };
  const ascSignIdx = Math.floor(snapSign(ascLon) / 30);
  const pointSignIdx = Math.floor(snapSign(pointLon) / 30);
  return (((pointSignIdx - ascSignIdx) % 12) + 12) % 12 + 1;
}

// True Placidus: find which cusp interval the longitude falls in. cusps is
// the 12-entry array from Swiss Ephemeris, cusps[0] = 1st house cusp.
// Smallest angular separation between two longitudes, accounting for the
// 0/360 wrap. Used to detect "sitting exactly on a cusp" without being
// defeated by floating-point drift.
function angularDistance(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// One arcsecond is ~0.00028 degrees. This tolerance is far tighter than that,
// so it only ever absorbs floating-point noise, never a real placement.
const CUSP_EPSILON = 1e-9;

function placidusCuspHouseOf(pointLon, cusps) {
  let L = pointLon % 360;
  if (L < 0) L += 360;

  // A planet exactly on a cusp belongs to the house that cusp opens. Without
  // this check, normalizing the longitude can drift it a hair below the cusp
  // and drop it into the previous house.
  for (let h = 0; h < 12; h++) {
    if (angularDistance(L, cusps[h]) < CUSP_EPSILON) return h + 1;
  }

  for (let h = 0; h < 12; h++) {
    const a = cusps[h];
    const b = cusps[(h + 1) % 12];
    if (a <= b ? L >= a && L < b : L >= a || L < b) return h + 1;
  }
  return 1;
}

function equalHouseOf(pointLon, ascLon) {
  const diff = ((((pointLon - ascLon) % 360) + 360) % 360);
  // Same boundary rule: exactly 30° past the Ascendant opens the 2nd house,
  // so nudge past floating-point drift before flooring.
  const snapped = Math.abs(diff - Math.round(diff / 30) * 30) < CUSP_EPSILON
    ? Math.round(diff / 30) * 30
    : diff;
  return (Math.floor(snapped / 30) % 12) + 1;
}



const ZODIAC_SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

const SIGN_FLAVOR = {
  Aries: "acting first, directness, and impatience with waiting for permission",
  Taurus: "steadiness, a preference for the tangible, and real resistance to being rushed",
  Gemini: "curiosity, quick wit, and a need for variety and conversation",
  Cancer: "emotional attunement, protectiveness, and a strong pull toward home and belonging",
  Leo: "warmth, a need to be seen, and natural confidence in front of others",
  Virgo: "precision, service, and a habit of improving whatever isn't yet working",
  Libra: "diplomacy, a strong sense of fairness, and discomfort with open conflict",
  Scorpio: "depth, intensity, and a need to understand what's underneath the surface rather than accept things at face value",
  Sagittarius: "optimism, a hunger for meaning, and restlessness with anything too confining",
  Capricorn: "discipline, patience, and a long-term relationship with responsibility",
  Aquarius: "independence, unconventional thinking, and a pull toward the collective over the personal",
  Pisces: "imagination, empathy, and a tendency to absorb what's around you emotionally",
};

const SIGN_GIST = {
  Aries: "Acting first, fast decisions",
  Taurus: "Steadiness, resisting rushing",
  Gemini: "Curiosity, quick adaptability",
  Cancer: "Emotional attunement, protectiveness",
  Leo: "Confidence, need to be seen",
  Virgo: "Precision, improvement-driven",
  Libra: "Diplomacy, fairness-seeking",
  Scorpio: "Depth & investigation",
  Sagittarius: "Meaning-seeking, restless optimism",
  Capricorn: "Discipline, long-game patience",
  Aquarius: "Independence, unconventional thinking",
  Pisces: "Imagination, emotional absorption",
};

const HOUSE_FLAVOR = {
  1: "this plays out in first impressions and how you show up before anyone knows you",
  2: "this plays out around personal resources, money, and a sense of self-worth",
  3: "this plays out through communication, immediate surroundings, and daily information exchange",
  4: "this plays out in home, family, and the foundation you build your life on",
  5: "this plays out through creative self-expression, romance, and things done for their own sake",
  6: "this plays out in daily work, routine, and health",
  7: "this plays out through one-to-one partnership and committed relationships",
  8: "this plays out around shared resources and deep transformation",
  9: "this plays out through belief systems, philosophy, travel, and higher learning",
  10: "this plays out in career, public reputation, and long-term authority",
  11: "this plays out through community, groups, and long-term goals",
  12: "this plays out privately, often below conscious awareness, before it becomes visible elsewhere",
};

const PLANET_CORE = {
  Sun: "shows core identity, the thing you're fundamentally organized around",
  Moon: "shows emotional needs and instinctive reactions, the part of you that runs on autopilot",
  Mercury: "shows how you think and communicate",
  Venus: "shows what you value in love, beauty, and pleasure",
  Mars: "shows how you assert yourself and handle conflict",
  Jupiter: "shows where growth, luck, and expansion come most naturally",
  Saturn: "shows where discipline, restriction, and long-term responsibility are required, often felt as a lesson rather than a gift",
  Uranus: "shows where change and individuality show up suddenly, often disrupting routine",
  Neptune: "shows where dreams, intuition, spirituality, or illusion operate, often blurring hard edges",
  Pluto: "shows where the deepest, most total transformation in your life takes place, often through crisis or intensity",
  "North Node": "points toward the direction of growth for this lifetime, the skills that don't come naturally but are worth building anyway",
  Chiron: "marks the core wound and, over time, the place where the deepest healing and teaching capacity develops",
  Lilith: "represents the instinct that gets suppressed or considered too much, the part of you that doesn't apologize",
  Vertex: "is a lesser-used point often associated with fated encounters or turning points that feel outside personal control",
};

function planetDef(planet, sign, house, { soul = false } = {}) {
  const core = PLANET_CORE[planet] || "marks a placement in the chart";
  const subject = soul ? `The Draconic ${planet}` : `The ${planet}`;
  const framing = soul
    ? `${subject} shows the soul-level version of what the Tropical ${planet} shows on the surface: ${core.replace(/^shows /, "")}.`
    : `${subject} ${core}.`;
  const signPart = `In ${sign}, ${soul ? "at the soul level, that shows up through" : "that expresses through"} ${SIGN_FLAVOR[sign]}.`;
  const housePart = house ? `In the ${ORDINAL_HOUSE[house]} house, ${HOUSE_FLAVOR[house]}.` : "";
  return `${framing} ${signPart} ${housePart}`.trim();
}

// ---------- generated: full tropical + draconic chart ----------

const CHART_POINTS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "Chiron", "Lilith", "Vertex"];

const REAL_KEY_MAP = { Sun: "Sun", Moon: "Moon", Mercury: "Mercury", Venus: "Venus", Mars: "Mars", Jupiter: "Jupiter", Saturn: "Saturn", Uranus: "Uranus", Neptune: "Neptune", Pluto: "Pluto", "North Node": "NorthNode", Chiron: "Chiron", Lilith: "Lilith", Vertex: "Vertex" };

// real: output of calcRealPlanetPositions, or null if no birth date was given.
// nodeOffset: for the draconic layer, how far (in degrees) to shift every
// real longitude so the North Node lands at 0° Aries — the actual definition
// of a draconic chart, applied to whichever points we have real longitudes for.
function generateChartLayer(rng, sunSign, { soul = false, real = null, nodeOffset = 0, reuseAngles = null, houses = null } = {}) {
  const points = {};
  for (const planet of CHART_POINTS) {
    const realKey = REAL_KEY_MAP[planet];
    let sign, degree, isReal, lonForHouse;
    if (real && realKey && real[realKey]) {
      const lon = soul ? normDeg(real[realKey].lon + nodeOffset) : real[realKey].lon;
      const placed = lonToSignDegree(lon);
      sign = placed.sign;
      degree = degMinString(placed.degree);
      isReal = true;
      lonForHouse = lon;
    } else {
      sign = planet === "Sun" && !soul ? sunSign : pick(rng, ZODIAC_SIGNS);
      degree = degreeString(rng);
      isReal = false;
      lonForHouse = null;
    }

    let placidusHouse, wholeSignHouse, housesReal;
    if (houses && lonForHouse !== null) {
      const ascLonForHouses = soul ? normDeg(houses.ascLon + nodeOffset) : houses.ascLon;
      const natalLon = soul ? normDeg(lonForHouse - nodeOffset) : lonForHouse;
      placidusHouse = houses.cusps ? placidusCuspHouseOf(natalLon, houses.cusps) : equalHouseOf(lonForHouse, ascLonForHouses);
      wholeSignHouse = wholeSignHouseOf(lonForHouse, ascLonForHouses);
      housesReal = true;
    } else {
      placidusHouse = Math.floor(rng() * 12) + 1;
      wholeSignHouse = (placidusHouse % 12) + 1;
      housesReal = false;
    }

    points[planet] = {
      sign,
      placidusHouse,
      wholeSignHouse,
      housesReal,
      degree,
      isReal,
      def: planetDef(planet, sign, placidusHouse, { soul }),
    };
  }
  // Angles need a geocoded birth location and precise sidereal time. When a
  // recognized city and birth time are both given, houses.ascendant/midheaven
  // hold a real calculation (verified against a fully worked reference
  // example, see computeAscMC). Otherwise these stay generated. By
  // convention the angles don't shift between tropical and draconic charts,
  // so the draconic layer reuses the tropical layer's angles exactly.
  let ascendant, midheaven;
  if (reuseAngles) {
    ascendant = reuseAngles.ascendant;
    midheaven = reuseAngles.midheaven;
  } else if (houses) {
    ascendant = { sign: houses.ascendant.sign, degree: degMinString(houses.ascendant.degree), isReal: true };
    midheaven = { sign: houses.midheaven.sign, degree: degMinString(houses.midheaven.degree), isReal: true };
  } else {
    ascendant = { sign: pick(rng, ZODIAC_SIGNS), degree: degreeString(rng), isReal: false };
    midheaven = { sign: pick(rng, ZODIAC_SIGNS), degree: degreeString(rng), isReal: false };
  }
  return {
    points,
    ascendant: { ...ascendant, def: planetDef("Ascendant", ascendant.sign, null, { soul }) },
    midheaven,
  };
}

// ---------- generated: Vedic timing ----------

const GRAHAS = ["Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury", "Ketu", "Venus"];

function generateVedicTiming(rng, birthYear) {
  const mahaGraha = pick(rng, GRAHAS);
  let bhuktiGraha = pick(rng, GRAHAS);
  while (bhuktiGraha === mahaGraha) bhuktiGraha = pick(rng, GRAHAS);
  let nextBhukti = pick(rng, GRAHAS);
  while (nextBhukti === bhuktiGraha) nextBhukti = pick(rng, GRAHAS);
  const closingYear = 2026 + Math.floor(rng() * 3);
  const closingMonth = pick(rng, ["Feb", "Apr", "Jun", "Aug", "Oct", "Dec"]);
  const releaseGraha = pick(rng, GRAHAS.filter((g) => g !== mahaGraha));
  const releaseYear = closingYear + Math.floor(rng() * 2);
  const sadeSatiPhase = Math.floor(rng() * 3) + 1;
  return {
    isReal: false,
    mahaGraha,
    bhuktiGraha,
    nextBhukti,
    closingLabel: `${closingMonth} ${closingYear}`,
    releaseGraha,
    releaseLabel: `${pick(rng, ["Feb", "Apr", "Jun", "Aug", "Oct", "Dec"])} ${releaseYear}`,
    sadeSatiPhase,
    progressPct: 30 + Math.floor(rng() * 55),
  };
}

// ---------- real: Vimshottari dasha timing ----------
// Computed from the Moon's actual longitude: tropical minus Lahiri ayanamsa
// gives the sidereal position, that position's nakshatra sets the starting
// dasha lord and its remaining balance, and the fixed 120-year Vimshottari
// sequence unfolds from there. Verified against independently confirmed
// reference timing (Ashwini pada 1 Moon; Sun Mahadasha ending Oct 2028;
// Sun/Saturn bhukti closing Aug 2026 into Sun/Mercury) before being wired in.
const DASHA_SEQ = [
  ["Ketu", 7], ["Venus", 20], ["Sun", 6], ["Moon", 10], ["Mars", 7],
  ["Rahu", 18], ["Jupiter", 16], ["Saturn", 19], ["Mercury", 17],
];
const NAKSHATRA_SPAN = 360 / 27;
const NAKSHATRA_NAMES = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];

function lahiriAyanamsa(yearFrac) {
  return 23.85 + (yearFrac - 2000) * (50.29 / 3600);
}

function yearFracToLabel(yf) {
  const year = Math.floor(yf);
  const monthIdx = Math.min(11, Math.floor((yf - year) * 12));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[monthIdx]} ${year}`;
}

function computeVedicTiming(tropicalMoonLon, birthDate) {
  if (tropicalMoonLon == null || !birthDate) return null;
  const [y, m, dd] = birthDate.split("-").map(Number);
  const birthYearFrac = y + (m - 1) / 12 + (dd - 1) / 365;
  const nowYearFrac = new Date().getFullYear() + new Date().getMonth() / 12;

  const ayanamsa = lahiriAyanamsa(birthYearFrac);
  const sidereal = ((tropicalMoonLon - ayanamsa) % 360 + 360) % 360;
  const nakIndex = Math.floor(sidereal / NAKSHATRA_SPAN);
  const posInNak = sidereal - nakIndex * NAKSHATRA_SPAN;
  const pada = Math.floor(posInNak / (NAKSHATRA_SPAN / 4)) + 1;
  const fracElapsed = posInNak / NAKSHATRA_SPAN;
  const startLordIdx = nakIndex % 9;

  // Mahadasha timeline from birth, wrapping the 120-year cycle far enough
  // to cover any realistic lifespan.
  const periods = [];
  let t = birthYearFrac;
  const [firstLord, firstYears] = DASHA_SEQ[startLordIdx];
  const balance = firstYears * (1 - fracElapsed);
  periods.push({ lord: firstLord, start: t, end: t + balance, years: firstYears });
  t += balance;
  for (let i = 1; i < 18; i++) {
    const [l, yrs] = DASHA_SEQ[(startLordIdx + i) % 9];
    periods.push({ lord: l, start: t, end: t + yrs, years: yrs });
    t += yrs;
  }

  const current = periods.find((p) => nowYearFrac >= p.start && nowYearFrac < p.end) || periods[0];

  // Bhuktis inside the current mahadasha: same nine-lord sequence starting
  // from the mahadasha lord itself, each scaled by lordYears/120.
  const mahaIdx = DASHA_SEQ.findIndex(([l]) => l === current.lord);
  const bhuktiList = [];
  let bt = current.start;
  for (let i = 0; i < 9; i++) {
    const [l, yrs] = DASHA_SEQ[(mahaIdx + i) % 9];
    const realLen = (current.years * yrs) / 120;
    bhuktiList.push({ lord: l, start: bt, end: bt + realLen });
    bt += realLen;
  }
  const currentBhukti = bhuktiList.find((b) => nowYearFrac >= b.start && nowYearFrac < b.end) || bhuktiList[0];
  const bhuktiIdx = bhuktiList.indexOf(currentBhukti);
  const nextBhukti = bhuktiList[(bhuktiIdx + 1) % 9];

  const progressPct = Math.round(((nowYearFrac - current.start) / (current.end - current.start)) * 100);

  return {
    isReal: true,
    sidereal,
    nakshatra: NAKSHATRA_NAMES[nakIndex],
    pada,
    mahaGraha: current.lord,
    mahaStartLabel: yearFracToLabel(current.start),
    mahaEndLabel: yearFracToLabel(current.end),
    bhuktiGraha: currentBhukti.lord,
    nextBhukti: nextBhukti.lord,
    closingLabel: yearFracToLabel(currentBhukti.end),
    nextMaha: periods[periods.indexOf(current) + 1] ? periods[periods.indexOf(current) + 1].lord : null,
    progressPct: Math.max(0, Math.min(100, progressPct)),
  };
}

// ---------- generated: Human Design ----------

const HD_TYPES = [
  ["Generator", 37],
  ["Manifesting Generator", 33],
  ["Projector", 20],
  ["Manifestor", 9],
  ["Reflector", 1],
];

const HD_AUTHORITY_BY_TYPE = {
  Generator: ["Sacral", "Emotional"],
  "Manifesting Generator": ["Sacral", "Emotional"],
  Projector: ["Splenic", "Self-Projected", "Ego", "Emotional"],
  Manifestor: ["Emotional", "Splenic", "Ego"],
  Reflector: ["Lunar"],
};

const HD_PROFILES = ["1/3", "1/4", "2/4", "2/5", "3/5", "3/6", "4/6", "4/1", "5/1", "5/2", "6/2", "6/3"];

const HD_CROSSES = [
  "Right Angle Cross of The Unexpected",
  "Left Angle Cross of Individualism",
  "Right Angle Cross of Explanation",
  "Juxtaposition Cross of Refinement",
  "Right Angle Cross of Contagion",
  "Left Angle Cross of the Sphinx",
  "Right Angle Cross of Laws",
  "Juxtaposition Cross of Alignment",
];

const HD_DEFINITIONS = [
  ["Split Definition", 45],
  ["Single Definition", 35],
  ["Triple Split Definition", 12],
  ["Quadruple Split Definition", 5],
  ["No Definition", 3],
];

function generateHumanDesign(rng) {
  const type = pickWeighted(rng, HD_TYPES);
  const authority = pick(rng, HD_AUTHORITY_BY_TYPE[type] || ["Sacral"]);
  const profile = pick(rng, HD_PROFILES);
  const incarnationCross = pick(rng, HD_CROSSES);
  const definition = pickWeighted(rng, HD_DEFINITIONS);
  return { type, authority, profile, incarnationCross, definition, basis: "generated" };
}

const HD_TYPE_GIST = {
  Generator: "Sustainable, response-driven energy",
  "Manifesting Generator": "Fast movement once genuinely engaged",
  Projector: "Guidance through recognition, not initiation",
  Manifestor: "Initiating independently, informing after",
  Reflector: "Reflecting and sampling the environment",
};

// ---------- MBTI / Enneagram gist tables (used once quiz answers are scored) ----------

const MBTI_GIST = {
  ISTJ: "Duty through structure",
  ISFJ: "Quiet, steady care",
  INFJ: "Meaning before action",
  INTJ: "Long-range strategy",
  ISTP: "Hands-on problem solving",
  ISFP: "Quiet personal expression",
  INFP: "Values-led idealism",
  INTP: "Theory before application",
  ESTJ: "Order and execution",
  ESFJ: "Warmth through structure",
  ENFJ: "Guiding others forward",
  ENTJ: "Decisive long-range command",
  ESTP: "Action in the moment",
  ESFP: "Spontaneous engagement",
  ENFP: "Enthusiastic possibility",
  ENTP: "Debating the idea itself",
};

const LIFE_PATH_GIST = {
  1: "Leadership, independence",
  2: "Partnership, harmony-seeking",
  3: "Expression, creativity",
  4: "Structure, reliability",
  5: "Freedom, change-seeking",
  6: "Responsibility, care for others",
  7: "Analysis & truth-seeking",
  8: "Ambition, material mastery",
  9: "Compassion, completion",
  11: "Intuition, inspiration",
  22: "Master building, large-scale vision",
  33: "Master teaching, selfless service",
};

// ---------- top-level profile builder ----------

// US daylight saving time has used three different rule sets historically.
// Getting this right matters: a birth date inside the wrong rule era gets a
// UTC offset that's off by exactly one hour, which is enough to shift the
// Ascendant by more than a full sign and throw off every house behind it.
//   2007-present: 2nd Sunday in March to 1st Sunday in November
//   1987-2006:    1st Sunday in April to last Sunday in October
//   1966-1986:    last Sunday in April to last Sunday in October
//     (1974 and 1975 ran on emergency year-round DST during the oil crisis,
//     a rare exception not modeled here)
// Arizona (outside the Navajo Nation) and Hawaii don't observe DST at all.
function nthSunday(year, month, n) {
  // month is 1-12. Returns the day-of-month for the nth Sunday, or the last
  // Sunday if n === "last".
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstSundayDate = 1 + ((7 - first.getUTCDay()) % 7);
  if (n === "last") {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let d = firstSundayDate;
    while (d + 7 <= daysInMonth) d += 7;
    return d;
  }
  return firstSundayDate + 7 * (n - 1);
}

function usObservesDST(year, month, day, observesDST) {
  if (observesDST === false) return false;
  let startMonth, startDay, endMonth, endDay;
  if (year >= 2007) {
    startMonth = 3; startDay = nthSunday(year, 3, 2);
    endMonth = 11; endDay = nthSunday(year, 11, 1);
  } else if (year >= 1987) {
    startMonth = 4; startDay = nthSunday(year, 4, 1);
    endMonth = 10; endDay = nthSunday(year, 10, "last");
  } else {
    startMonth = 4; startDay = nthSunday(year, 4, "last");
    endMonth = 10; endDay = nthSunday(year, 10, "last");
  }
  const md = month * 100 + day;
  return md >= startMonth * 100 + startDay && md < endMonth * 100 + endDay;
}

// Effective UTC offset for a birth date/location: standard offset, plus one
// hour if that date fell inside DST for that region. Scoped to recognized US
// cities and states only, other countries have their own DST rules and dates
// (the EU, for one, doesn't switch on the same days the US does), so this
// deliberately does not guess at those. Regions that don't observe DST at all
// (observesDST: false, e.g. Arizona, Hawaii) never adjust either.
function effectiveUtcOffset(dateStr, cityMatch) {
  if (!cityMatch.us) return cityMatch.utc;
  const [y, m, d] = dateStr.split("-").map(Number);
  const inDST = usObservesDST(y, m, d, cityMatch.observesDST !== false);
  return cityMatch.utc + (inDST ? 1 : 0);
}

function buildProfile({ userName, birthDate, birthTime, birthLocation, exactCoords = null, geocode = null, precision = null }) {
  const rng = makeRng(userName, birthDate, birthTime, birthLocation);

  // Location resolution, best source first:
  //   1. geocode  - backend resolved the place AND its true historical
  //                 timezone for this exact date. Nothing to type, works
  //                 for any town on earth.
  //   2. exact    - coordinates typed by hand, using the matched city's
  //                 timezone rules.
  //   3. city     - built-in city table.
  //   4. state    - built-in state centroid, several degrees of slack.
  const cityLookup = lookupCity(birthLocation);
  const parsedExact = parseExactCoords(exactCoords);
  let cityMatch;
  if (geocode && typeof geocode.lat === "number" && typeof geocode.lon === "number") {
    cityMatch = {
      lat: geocode.lat,
      lon: geocode.lon,
      // A resolved offset already accounts for that year's DST rules, so
      // flag it as non-US to stop effectiveUtcOffset adding a second hour.
      utc: typeof geocode.utc_offset === "number" ? geocode.utc_offset : (cityLookup ? cityLookup.utc : 0),
      us: typeof geocode.utc_offset === "number" ? false : (cityLookup ? cityLookup.us : false),
      observesDST: cityLookup ? cityLookup.observesDST : undefined,
      level: "geocoded",
      matchedLabel: geocode.label || birthLocation,
    };
  } else if (cityLookup && parsedExact) {
    cityMatch = { ...cityLookup, lat: parsedExact.lat, lon: parsedExact.lon, level: "exact", matchedLabel: `${parsedExact.lat}°, ${parsedExact.lon}°` };
  } else {
    cityMatch = cityLookup;
  }
  const locationRecognized = !!cityMatch;

  // If we know the birth location, birthTime is local time there, so convert
  // it to UT once here and use that same UT moment for both the planets and
  // the houses. The hour value passes through unwrapped (it can go past 24
  // or below 0), because dayNumber() folds hours into the day fraction
  // directly, which keeps a birth that crosses midnight UT on the correct
  // date. Without a recognized location, birthTime is treated as UT directly
  // (disclosed in the intake form), since there's no offset to convert with.
  let utHoursOverride = null;
  let usedOffset = null;
  if (cityMatch && birthTime) {
    usedOffset = effectiveUtcOffset(birthDate, cityMatch);
    const [h, mi] = birthTime.split(":").map(Number);
    utHoursOverride = h + mi / 60 - usedOffset;
  }

  let real = calcRealPlanetPositions(birthDate, birthTime, utHoursOverride);
  if (precision && precision.planets) {
    real = {};
    for (const [name, p] of Object.entries(precision.planets)) real[name] = lonToSignDegree(p.lon);
    if (precision.vertex != null) real.Vertex = lonToSignDegree(precision.vertex);
  }
  const sunSign = real ? real.Sun.sign : computeSunSign(birthDate);
  const chineseZodiac = computeChineseZodiac(birthDate);
  const numerology = computeNumerology(userName, birthDate);

  let houses = cityMatch && birthTime ? computeAscMC(birthDate, birthTime, cityMatch.lat, cityMatch.lon, usedOffset) : null;
  if (precision && precision.ascendant != null) {
    houses = {
      ascLon: precision.ascendant,
      ascendant: lonToSignDegree(precision.ascendant),
      midheaven: lonToSignDegree(precision.midheaven),
      cusps: precision.houses && precision.houses.cusps ? precision.houses.cusps : null,
    };
  }

  const tropical = generateChartLayer(rng, sunSign, { soul: false, real, houses });
  const nodeOffset = real ? -real.NorthNode.lon : 0;
  const draconic = generateChartLayer(rng, sunSign, { soul: true, real, nodeOffset, reuseAngles: { ascendant: tropical.ascendant, midheaven: tropical.midheaven } });
  const birthYear = birthDate ? new Date(birthDate + "T00:00:00").getFullYear() : 1996;
  const vedic = (real && real.Moon ? computeVedicTiming(real.Moon.lon, birthDate) : null) || generateVedicTiming(rng, birthYear);
  const humanDesign = generateHumanDesign(rng);

  // Seeded true/false "agreement" flags reused across the UI so a given
  // user's report is internally consistent every time it's viewed.
  const agreementRoll = () => rng() > 0.35;

  return {
    inputs: { userName, birthDate, birthTime, birthLocation },
    sunSign,
    chineseZodiac,
    numerology,
    tropical,
    draconic,
    vedic,
    humanDesign,
    locationRecognized,
    locationMatch: cityMatch,
    precisionBackend: !!precision,
    gists: {
      sign: SIGN_GIST,
      lifePath: LIFE_PATH_GIST[numerology.lifePath] || "A recurring core theme",
      hdType: HD_TYPE_GIST[humanDesign.type] || "A distinct energetic strategy",
      mbti: (type) => MBTI_GIST[type] || "A distinct cognitive style",
    },
    flags: {
      moonMatchesEnneagram: agreementRoll(),
      sacralMatchesIndependence: agreementRoll(),
      saturnMatchesSelfAuthority: agreementRoll(),
    },
  };
}

// ---------- quiz scoring ----------

function scoreMBTI(answers) {
  // answers: { EI: 'E'|'I', SN: 'S'|'N', TF: 'T'|'F', JP: 'J'|'P' }
  const type = `${answers.EI || "I"}${answers.SN || "N"}${answers.TF || "F"}${answers.JP || "J"}`;
  return type;
}

const ENNEAGRAM_NAMES = {
  1: "The Reformer",
  2: "The Helper",
  3: "The Achiever",
  4: "The Individualist",
  5: "The Investigator",
  6: "The Loyalist",
  7: "The Enthusiast",
  8: "The Challenger",
  9: "The Peacemaker",
};

// The Riso-Hudson QUEST mapping. Group I sorts by how a person moves in
// relation to others (assertive / withdrawn / dutiful, the Hornevian triads).
// Group II sorts by how they cope when they don't get what they want
// (positive outlook / reactive / competency, the Harmonic triads). The two
// axes intersect at exactly one type, which is why two questions can do what
// a long inventory does.
const QUEST_MAP = {
  AX: 7, AY: 8, AZ: 3,
  BX: 9, BY: 4, BZ: 5,
  CX: 2, CY: 6, CZ: 1,
};

// Which passion belongs to which type. Used as an independent second method,
// not as scoring weight, so the two can be compared rather than blended.
const TYPE_PASSION = {
  1: "Resentment", 2: "Pride", 3: "Vanity", 4: "Envy", 5: "Avarice",
  6: "Anxiety", 7: "Gluttony", 8: "Intensity", 9: "Sloth",
};

function scoreEnneagram(scores, questCode, passionType) {
  // Primary: the QUEST axes, when both groups were answered.
  const questType = questCode && QUEST_MAP[questCode] ? QUEST_MAP[questCode] : null;

  // Secondary: the passion the person recognized from the inside.
  const passion = passionType || null;

  // If the two independent methods agree, that's a corroborated result.
  // If they diverge, the framework's own logic applies: say so rather than
  // averaging them into something neither method actually found.
  let core;
  let agreement;
  if (questType && passion) {
    core = questType;
    agreement = questType === passion ? "corroborated" : "divergent";
  } else {
    core = questType || passion || (() => {
      const entries = Object.entries(scores || {}).sort((a, b) => b[1] - a[1]);
      return entries.length ? parseInt(entries[0][0], 10) : 2;
    })();
    agreement = "single-method";
  }

  // Wing: the adjacent type that scored higher, falling back to the passion
  // answer when it happens to name a neighbor.
  const low = core === 1 ? 9 : core - 1;
  const high = core === 9 ? 1 : core + 1;
  let wing;
  if (passion === low || passion === high) {
    wing = passion;
  } else {
    wing = (scores && scores[low] || 0) >= (scores && scores[high] || 0) ? low : high;
  }

  return {
    core,
    wing,
    label: `${core}w${wing}`,
    name: ENNEAGRAM_NAMES[core] || "",
    passion: TYPE_PASSION[core],
    questCode: questCode || null,
    questType,
    passionType: passion,
    agreement,
  };
}

// A felt-experience proxy, not a real Human Design calculation. A real chart
// needs planetary gate activations; this just reflects which description the
// person recognized themselves in, one step more honest than pure randomness,
// still not the same thing as being computed from birth data.
function scoreHumanDesignProxy(hdScores, authorityAnswer, existingHD) {
  const entries = Object.entries(hdScores).sort((a, b) => b[1] - a[1]);
  const type = entries.length ? entries[0][0] : "Generator";
  const profile = existingHD ? existingHD.profile : "1/3";
  const definition = existingHD ? existingHD.definition : "Split Definition";
  const incarnationCross = existingHD ? existingHD.incarnationCross : "Right Angle Cross of The Unexpected";
  return { type, authority: authorityAnswer || "Sacral", profile, definition, incarnationCross, basis: "proxy" };
}

// ---------- MBTI dimension definitions (generic, works for either letter) ----------

const MBTI_DIM_DEF = {
  EI: {
    label: "Energy",
    E: { name: "Extraverted", def: "Energy comes from engagement with other people and the outside world rather than solitude. Time spent around others tends to recharge rather than drain, even when it's also demanding." },
    I: { name: "Introverted", def: "Energy is drawn from solitude and internal processing rather than from time spent around other people. Social interaction, even when enjoyable, tends to spend energy that then needs to be replenished alone." },
  },
  SN: {
    label: "Information",
    S: { name: "Sensing", def: "Attention naturally goes toward concrete, present-moment detail rather than abstract pattern or future possibility. This tends to produce a preference for literal, step-by-step facts over theory." },
    N: { name: "Intuitive", def: "Attention naturally goes toward patterns, connections, and future possibility rather than concrete, present-moment detail. This tends to produce a preference for meaning and theory over strictly literal, step-by-step facts." },
  },
  TF: {
    label: "Decisions",
    T: { name: "Thinking", def: "Decisions are weighed first by logical consistency, with impact on the people involved checked second rather than first. Care is still present, just applied after the logic holds up, not before." },
    F: { name: "Feeling", def: "Decisions are weighed first by values and impact on people, with logical analysis checked second rather than first. Logic is still present, just applied after asking who a decision affects and how." },
  },
  JP: {
    label: "Structure",
    J: { name: "Judging", def: "Preference runs toward planning, closure, and settled decisions over staying open-ended and flexible. Unresolved questions or loose plans tend to create real discomfort rather than excitement." },
    P: { name: "Perceiving", def: "Preference runs toward staying open-ended and flexible over settling into a fixed plan. Closure that arrives too early tends to feel constraining rather than comforting." },
  },
};

function mbtiDimensionDetails(mbtiType) {
  const t = (mbtiType || "INFJ").toUpperCase();
  const ei = MBTI_DIM_DEF.EI[t[0]] || MBTI_DIM_DEF.EI.I;
  const sn = MBTI_DIM_DEF.SN[t[1]] || MBTI_DIM_DEF.SN.N;
  const tf = MBTI_DIM_DEF.TF[t[2]] || MBTI_DIM_DEF.TF.F;
  const jp = MBTI_DIM_DEF.JP[t[3]] || MBTI_DIM_DEF.JP.J;
  return { energy: ei, information: sn, decisions: tf, structure: jp };
}

// ---------- Human Design definitions (generic per value, not per-person) ----------

const HD_TYPE_DEF = {
  Generator: "One of five Human Design types, built to respond to what genuinely excites it and generate sustainable energy through consistent engagement, rather than initiating from a cold start. Generators often find satisfaction through mastery built over time, and tend to feel frustrated or tired when initiating instead of responding.",
  "Manifesting Generator": "One of five Human Design types, built to respond to what genuinely excites it and move quickly once it does, rather than initiating from a cold start or waiting passively for life to arrive. Manifesting Generators often skip steps other types need, multitask, and can frustrate themselves trying to slow down and do things in order.",
  Projector: "One of five Human Design types, built to see and guide efficiently rather than generate constant output. Projectors work best when invited or recognized, and tend to burn out when pushing to initiate the way Generators or Manifestors do.",
  Manifestor: "One of five Human Design types, built to initiate and start new things independently. Manifestors move first and inform others after the fact rather than waiting for invitation, and tend to feel the most resistance when asked to explain themselves in advance.",
  Reflector: "The rarest of the five Human Design types, built to sample and reflect the energy of whoever and whatever is around. Reflectors often need a full lunar cycle to make major decisions with real confidence, since this design has no consistent internal authority to check against.",
};

const HD_AUTHORITY_DEF = {
  Sacral: "Authority describes the most reliable decision-making process for this design. Sacral authority is a gut-level, in-the-body yes or no response, felt in real time when a question is asked, rather than something worked out mentally in advance. Decisions made from the head instead of the gut tend to feel worse in hindsight for this authority type.",
  Emotional: "Authority describes the most reliable decision-making process for this design. Emotional authority means clarity doesn't arrive in the moment, it arrives after riding out an emotional wave, so decisions made under pressure in a single moment tend to get revisited later.",
  Splenic: "Authority describes the most reliable decision-making process for this design. Splenic authority is a quiet, in-the-moment instinct that speaks once and doesn't repeat itself, closer to instant intuition than a slowly deliberated gut feeling.",
  Ego: "Authority describes the most reliable decision-making process for this design. Ego authority is based on willpower and what this design genuinely has the resource and desire to commit to, rather than emotional waves or a gut response.",
  "Self-Projected": "Authority describes the most reliable decision-making process for this design. Self-Projected authority becomes clear by talking it out loud to a trusted sounding board, rather than deciding internally in silence.",
  Lunar: "Authority describes the most reliable decision-making process for this design. Lunar authority, unique to Reflectors, traditionally calls for waiting out a full lunar cycle, about 28 days, before making significant decisions with confidence.",
};

const HD_LINE_DEF = {
  1: "The 1 investigates thoroughly and wants a solid foundation before acting or speaking with confidence.",
  2: "The 2 is naturally gifted but needs solitude to recognize and trust that gift before being called out into using it.",
  3: "The 3 learns through trial and error, treating failure as necessary data on the way to what actually works.",
  4: "The 4 influences the world through personal relationships and an established network, rather than broad, impersonal audiences.",
  5: "The 5 is looked to for practical solutions, often projected onto by others in ways that can feel like pressure to perform.",
  6: "The 6 lives in three phases, trial in the first third of life, observation from a distance in the middle third, and role-model authority in the last third.",
};

const HD_CROSS_THEME = {
  "Right Angle Cross of The Unexpected": "disruption, sudden change, and the capacity to adapt when circumstances shift without warning",
  "Left Angle Cross of Individualism": "standing apart from the group and trusting a highly personal, non-transferable process",
  "Right Angle Cross of Explanation": "translating complex, hard-won experience into something others can actually use",
  "Juxtaposition Cross of Refinement": "polishing and perfecting something that already exists rather than starting from scratch",
  "Right Angle Cross of Contagion": "spreading new ideas or ways of doing things simply by embodying them visibly",
  "Left Angle Cross of the Sphinx": "holding a riddle or mystery that resolves slowly, often through other people",
  "Right Angle Cross of Laws": "establishing structure, precedent, and fairness for a wider group",
  "Juxtaposition Cross of Alignment": "bringing disconnected people or ideas into correct relationship with each other",
};

const HD_DEFINITION_DEF = {
  "Single Definition": "Definition describes how the chart's energy centers connect to each other internally. Single Definition means all the defined centers connect into one continuous flow. In practice, this often means feeling fairly consistent and self-contained, without needing another person present to feel whole.",
  "Split Definition": "Definition describes how the chart's energy centers connect to each other internally. Split Definition means the centers form two separate connected clusters rather than one single continuous flow. In practice, this often means feeling most whole and decisive around specific other people or circumstances that happen to bridge the gap, rather than feeling complete alone.",
  "Triple Split Definition": "Definition describes how the chart's energy centers connect to each other internally. Triple Split Definition means the centers form three separate clusters, needing more outside connection than a Single or Split Definition to feel complete, often thriving on variety in who bridges the gaps.",
  "Quadruple Split Definition": "Definition describes how the chart's energy centers connect to each other internally. Quadruple Split Definition, the rarest configuration, means the centers form four separate clusters. This tends toward pulling insight and completeness from a wide range of different people rather than any one relationship.",
  "No Definition": "Definition describes how the chart's energy centers connect to each other internally. No Definition means none of the centers are consistently defined, so this design runs closer to a highly amplified Reflector, deeply sampling and reflecting whatever energy is around, rather than running on a fixed internal circuit.",
};

function humanDesignDetails(hd) {
  const [l1, l2] = hd.profile.split("/").map((n) => parseInt(n, 10));
  return {
    typeDef: HD_TYPE_DEF[hd.type] || "",
    authorityDef: HD_AUTHORITY_DEF[hd.authority] || "",
    profileDef: `${HD_LINE_DEF[l1] || ""} ${HD_LINE_DEF[l2] || ""}`.trim(),
    crossDef: `The Incarnation Cross is a life-theme marker built from four specific chart placements, describing the larger purpose this design is oriented around. The ${hd.incarnationCross} centers on ${HD_CROSS_THEME[hd.incarnationCross] || "a specific life theme"}.`,
    definitionDef: HD_DEFINITION_DEF[hd.definition] || "",
  };
}

// ---------- Enneagram cross-check: real logic against generated chart signs ----------

const ENNEAGRAM_TRAIT = {
  1: "a strict, internalized standard about doing things correctly",
  2: "service-oriented love and care for others",
  3: "image-conscious drive toward visible achievement",
  4: "a pull toward what feels emotionally real, even when it's painful",
  5: "withdrawing to conserve energy and think before engaging",
  6: "scanning for what could go wrong before it happens",
  7: "chasing what's next to avoid sitting in discomfort",
  8: "taking control before someone else can take it from you",
  9: "a pull toward peace and away from confrontation",
};

const ENNEAGRAM_SUPPORTIVE_SIGNS = {
  1: ["Virgo", "Capricorn", "Aries", "Taurus"],
  2: ["Virgo", "Cancer", "Pisces", "Libra"],
  3: ["Leo", "Capricorn", "Aries", "Scorpio"],
  4: ["Scorpio", "Pisces", "Cancer", "Aquarius"],
  5: ["Aquarius", "Virgo", "Capricorn", "Scorpio"],
  6: ["Cancer", "Capricorn", "Virgo", "Taurus"],
  7: ["Sagittarius", "Gemini", "Aries", "Aquarius"],
  8: ["Scorpio", "Aries", "Capricorn", "Leo"],
  9: ["Libra", "Pisces", "Taurus", "Cancer"],
};

// Relationship #2: "One explains the other." The Enneagram names the
// behavior; these placements name where it comes from. Each entry is a
// function so the sentence can cite the person's actual sign, not a
// placeholder, the mechanism only lands when it's specific.
const ENNEAGRAM_MECHANISM = {
  1: (sign, house) => `Self-report describes a behavioral pattern: a strict internal standard about doing things correctly. Saturn in ${sign}, ${ORDINAL_HOUSE[house]} house, describes a symbolic pattern of duty and self-correction, independently pointing toward the same theme.`,
  2: (sign, house) => `Self-report describes a behavioral pattern: showing love through service and care. Venus in ${sign}, ${ORDINAL_HOUSE[house]} house, describes a symbolic pattern of care expressed through action, independently pointing toward the same theme.`,
  3: (sign, house) => `Self-report describes a behavioral pattern: chasing visible, provable achievement. Saturn in ${sign}, ${ORDINAL_HOUSE[house]} house, describes a symbolic pattern oriented toward public proof of worth, independently pointing toward the same theme.`,
  4: (sign, house) => `Self-report describes a behavioral pattern: being drawn to what feels emotionally real. The North Node in ${sign}, ${ORDINAL_HOUSE[house]} house, describes a symbolic pattern oriented toward emotional truth, independently pointing toward the same theme.`,
  5: (sign, house) => `Self-report describes a behavioral pattern: withdrawing to think before engaging. Saturn in ${sign}, ${ORDINAL_HOUSE[house]} house, describes a symbolic pattern of conserving energy until it's genuinely needed, independently pointing toward the same theme.`,
  6: (sign, house) => `Self-report describes a behavioral pattern: scanning for what could go wrong. Saturn in ${sign}, ${ORDINAL_HOUSE[house]} house, describes a symbolic pattern of testing stability before trusting it, independently pointing toward the same theme.`,
  7: (sign, house) => `Self-report describes a behavioral pattern: an appetite for experience, possibility, and forward motion, traditionally read as gluttony, not for food, but for life. The Moon in ${sign}, ${ORDINAL_HOUSE[house]} house, describes a temperament that naturally seeks curiosity, freedom, and learning through direct experience, reinforcing the same theme rather than causing it.`,
  8: (sign, house) => `Self-report describes a behavioral pattern: taking control before it's taken from you. Saturn in ${sign}, ${ORDINAL_HOUSE[house]} house, describes a symbolic pattern of authority built through earning it, independently pointing toward the same theme.`,
  9: (sign, house) => `Self-report describes a behavioral pattern: keeping the peace, avoiding confrontation. Venus in ${sign}, ${ORDINAL_HOUSE[house]} house, describes a symbolic pull toward harmony, independently pointing toward the same theme.`,
};

// The mechanism placement per type: which single placement actually explains
// the "why" behind that type's core behavior. This is relationship #2, one
// engine explains the other, not just agrees with it.
const ENNEAGRAM_MECHANISM_PLANET = { 1: "Saturn", 2: "Venus", 3: "Saturn", 4: "North Node", 5: "Saturn", 6: "Saturn", 7: "Moon", 8: "Saturn", 9: "Venus" };

// ---------- Engine 1 x Engine 2 crossings ----------
// Three real relationships when the astrological record (Engine 1: Tropical,
// Draconic, Vedic) meets the psychological record (Engine 2: Human Design,
// MBTI, Enneagram, self-report): they line up (structural), one explains the
// other (mechanism), or they pull apart (different layers / blind spot).
// This is the actual synthesis mechanic, not a byproduct of it.

const MBTI_ELEMENT_LEAN = { E: "fire", I: "water", S: "earth", N: "air", T: "air", F: "water", J: "earth", P: "fire" };

// ============================================================================
// THE CLAIM ENGINE
// ----------------------------------------------------------------------------
// This is the core of the framework. Instead of comparing system to system
// ("what does astrology say, what does MBTI say"), it states a human pattern
// as a testable claim, then polls every system independently for whether it
// finds evidence of that same pattern.
//
// Each detector reports a `role`:
//   "behavior"  = this system describes WHAT the person does
//   "mechanism" = this system explains WHY that behavior exists
//
// The relationship is then derived from what the evidence actually looks like,
// not assigned in advance:
//   Both engines find it, both describing behavior  -> Structural Pattern
//   Both engines find it, one explaining the other  -> Mechanism
//   One engine finds it, the other contradicts it   -> Adaptation
// ============================================================================

const EARTH = ["Taurus", "Virgo", "Capricorn"];
const WATER = ["Cancer", "Scorpio", "Pisces"];
const FIRE = ["Aries", "Leo", "Sagittarius"];

function has(arr, v) {
  return arr.indexOf(v) !== -1;
}

const CLAIMS = [
  {
    id: "belonging-through-contribution",
    claim: "You seek belonging through contribution.",
    meaning: "Being useful is how you've learned connection gets secured, more than something you simply enjoy doing. That's why rest can feel like risk.",
    detect: (p, h) => {
      const out = [];
      const venusHouse = pointHouse(p.tropical.points.Venus, h).house;
      if (has(EARTH, p.tropical.points.Venus.sign) || has(WATER, p.tropical.points.Venus.sign)) {
        out.push({ system: "Tropical", engine: 1, role: "mechanism", evidence: `Venus in ${p.tropical.points.Venus.sign}, ${ORDINAL_HOUSE[venusHouse]} house, care expressed through practical action rather than declaration` });
      }
      if ([2, 6, 9].indexOf(p.enneagram ? p.enneagram.core : 0) !== -1) {
        out.push({ system: "Enneagram", engine: 2, role: "behavior", evidence: `Type ${p.enneagram.core}, attention runs outward to what others need` });
      }
      if ([2, 6, 9, 33].indexOf(p.numerology.lifePath) !== -1) {
        out.push({ system: "Numerology", engine: 1, role: "behavior", evidence: `Life Path ${p.numerology.lifePath}, service and responsibility as the recurring theme` });
      }
      if (p.humanDesign.type === "Generator" || p.humanDesign.type === "Manifesting Generator" || p.humanDesign.type === "Projector") {
        out.push({ system: "Human Design", engine: 2, role: "behavior", evidence: `${p.humanDesign.type}, built to engage in response to others rather than in isolation` });
      }
      if (p.mbti && p.mbti[2] === "F") {
        out.push({ system: "MBTI", engine: 2, role: "behavior", evidence: `${p.mbti}, decisions weighed by impact on people first` });
      }
      return out;
    },
  },
  {
    id: "autonomy-before-connection",
    claim: "You protect autonomy before you seek connection.",
    meaning: "Self-reliance came first. Closeness has to prove it won't cost you yourself before you'll hand it any weight.",
    detect: (p, h) => {
      const out = [];
      const moonHouse = pointHouse(p.tropical.points.Moon, h).house;
      if (has(FIRE, p.tropical.points.Moon.sign) || p.tropical.points.Moon.sign === "Aquarius" || p.tropical.points.Moon.sign === "Scorpio") {
        out.push({ system: "Tropical", engine: 1, role: "mechanism", evidence: `Moon in ${p.tropical.points.Moon.sign}, ${ORDINAL_HOUSE[moonHouse]} house, emotional self-sufficiency wired in at the instinct level` });
      }
      if ([4, 5, 8].indexOf(p.enneagram ? p.enneagram.core : 0) !== -1) {
        out.push({ system: "Enneagram", engine: 2, role: "behavior", evidence: `Type ${p.enneagram.core}, independence guarded actively` });
      }
      if (p.mbti && p.mbti[0] === "I") {
        out.push({ system: "MBTI", engine: 2, role: "behavior", evidence: `${p.mbti}, energy restored alone rather than in company` });
      }
      if (p.humanDesign.type === "Manifestor" || p.humanDesign.type === "Projector") {
        out.push({ system: "Human Design", engine: 2, role: "behavior", evidence: `${p.humanDesign.type}, operates on its own terms rather than by consensus` });
      }
      if ([1, 5, 7].indexOf(p.numerology.lifePath) !== -1) {
        out.push({ system: "Numerology", engine: 1, role: "behavior", evidence: `Life Path ${p.numerology.lifePath}, independence as the organizing theme` });
      }
      return out;
    },
  },
  {
    id: "process-before-act",
    claim: "You process internally before you move.",
    meaning: "What looks like hesitation from outside is usually completion happening on the inside first. Rushing you skips the part that makes your decisions hold.",
    detect: (p, h) => {
      const out = [];
      if (has(WATER, p.tropical.points.Mercury.sign) || has(EARTH, p.tropical.points.Mercury.sign)) {
        out.push({ system: "Tropical", engine: 1, role: "mechanism", evidence: `Mercury in ${p.tropical.points.Mercury.sign}, thinking that needs to settle before it speaks` });
      }
      if (p.mbti && p.mbti[0] === "I") {
        out.push({ system: "MBTI", engine: 2, role: "behavior", evidence: `${p.mbti}, introverted processing preferred` });
      }
      if (p.humanDesign.authority === "Emotional" || p.humanDesign.authority === "Splenic") {
        out.push({ system: "Human Design", engine: 2, role: "mechanism", evidence: `${p.humanDesign.authority} authority, clarity arrives on its own timeline, not on demand` });
      }
      if ([4, 5, 6, 9].indexOf(p.enneagram ? p.enneagram.core : 0) !== -1) {
        out.push({ system: "Enneagram", engine: 2, role: "behavior", evidence: `Type ${p.enneagram.core}, withdraws to think before engaging` });
      }
      if (has(WATER, p.draconic.points.Moon.sign)) {
        out.push({ system: "Draconic", engine: 1, role: "behavior", evidence: `Draconic Moon in ${p.draconic.points.Moon.sign}, the same inwardness at the soul layer` });
      }
      return out;
    },
  },
  {
    id: "authority-built-slowly",
    claim: "Your authority had to be built, not inherited.",
    meaning: "Credibility here doesn't transfer from anyone else. The years that felt slow were the ones actually constructing it.",
    detect: (p, h) => {
      const out = [];
      const saturnHouse = pointHouse(p.tropical.points.Saturn, h).house;
      if ([1, 6, 8, 10, 11].indexOf(saturnHouse) !== -1) {
        out.push({ system: "Tropical", engine: 1, role: "mechanism", evidence: `Saturn in the ${ORDINAL_HOUSE[saturnHouse]} house, authority earned through sustained effort in exactly this area` });
      }
      if ([4, 8, 22].indexOf(p.numerology.lifePath) !== -1) {
        out.push({ system: "Numerology", engine: 1, role: "behavior", evidence: `Life Path ${p.numerology.lifePath}, structure and mastery as the through-line` });
      }
      if (p.mbti && p.mbti[3] === "J") {
        out.push({ system: "MBTI", engine: 2, role: "behavior", evidence: `${p.mbti}, works toward closure and completion by preference` });
      }
      if ([1, 3, 8].indexOf(p.enneagram ? p.enneagram.core : 0) !== -1) {
        out.push({ system: "Enneagram", engine: 2, role: "behavior", evidence: `Type ${p.enneagram.core}, holds itself to a demanding internal standard` });
      }
      if (p.humanDesign.type === "Manifesting Generator" || p.humanDesign.type === "Manifestor") {
        out.push({ system: "Human Design", engine: 2, role: "behavior", evidence: `${p.humanDesign.type}, builds momentum on its own terms rather than borrowed structure` });
      }
      return out;
    },
  },
  {
    id: "depth-over-breadth",
    claim: "You go deep rather than wide.",
    meaning: "You don't sample things, you submerge in them. Which is why half-committing to something feels worse to you than not starting it.",
    detect: (p, h) => {
      const out = [];
      const fixedSigns = ["Taurus", "Leo", "Scorpio", "Aquarius"];
      if (has(fixedSigns, p.sunSign)) {
        out.push({ system: "Tropical", engine: 1, role: "mechanism", evidence: `Sun in ${p.sunSign}, a fixed sign, sustained focus rather than variety` });
      }
      if (has(WATER, p.tropical.points.Sun.sign) || has(WATER, p.tropical.points.Moon.sign)) {
        out.push({ system: "Tropical", engine: 1, role: "behavior", evidence: `Water emphasis, pulled toward what's beneath the surface` });
      }
      if ([4, 5].indexOf(p.enneagram ? p.enneagram.core : 0) !== -1) {
        out.push({ system: "Enneagram", engine: 2, role: "behavior", evidence: `Type ${p.enneagram.core}, depth of understanding over breadth of exposure` });
      }
      if (p.mbti && p.mbti[1] === "N" && p.mbti[0] === "I") {
        out.push({ system: "MBTI", engine: 2, role: "behavior", evidence: `${p.mbti}, sustained internal pattern-work` });
      }
      if ([7, 11].indexOf(p.numerology.lifePath) !== -1) {
        out.push({ system: "Numerology", engine: 1, role: "behavior", evidence: `Life Path ${p.numerology.lifePath}, investigation as the life theme` });
      }
      return out;
    },
  },
  {
    id: "movement-follows-excitement",
    claim: "You move when something genuinely engages you, not when the plan says to.",
    meaning: "Forcing yourself forward on schedule has a worse track record for you than waiting for the real yes. The mechanics don't care how motivated you sound on paper.",
    detect: (p, h) => {
      const out = [];
      if (p.humanDesign.type === "Generator" || p.humanDesign.type === "Manifesting Generator") {
        out.push({ system: "Human Design", engine: 2, role: "mechanism", evidence: `${p.humanDesign.type} with ${p.humanDesign.authority} authority, designed to respond rather than initiate cold` });
      }
      if (p.mbti && p.mbti[3] === "P") {
        out.push({ system: "MBTI", engine: 2, role: "behavior", evidence: `${p.mbti}, keeps options open rather than locking plans early` });
      }
      if (has(FIRE, p.sunSign) || has(FIRE, p.tropical.points.Mars.sign)) {
        out.push({ system: "Tropical", engine: 1, role: "behavior", evidence: `Fire emphasis (${p.sunSign} Sun, Mars in ${p.tropical.points.Mars.sign}), action follows genuine spark` });
      }
      if ([3, 5].indexOf(p.numerology.lifePath) !== -1) {
        out.push({ system: "Numerology", engine: 1, role: "behavior", evidence: `Life Path ${p.numerology.lifePath}, freedom and expression as the driver` });
      }
      if ([7].indexOf(p.enneagram ? p.enneagram.core : 0) !== -1) {
        out.push({ system: "Enneagram", engine: 2, role: "behavior", evidence: `Type 7, moves toward what's alive and away from what's stagnant` });
      }
      return out;
    },
  },
  {
    id: "responsibility-unassigned",
    claim: "You carry responsibility nobody actually handed you.",
    meaning: "Somewhere it became your job to hold things together. Worth asking who assigned that, and whether they're still around to un-assign it.",
    detect: (p, h) => {
      const out = [];
      const saturnHouse = pointHouse(p.tropical.points.Saturn, h).house;
      if ([4, 6, 10, 12].indexOf(saturnHouse) !== -1) {
        out.push({ system: "Tropical", engine: 1, role: "mechanism", evidence: `Saturn in the ${ORDINAL_HOUSE[saturnHouse]} house, duty absorbed early and privately` });
      }
      if ([1, 2, 6].indexOf(p.enneagram ? p.enneagram.core : 0) !== -1) {
        out.push({ system: "Enneagram", engine: 2, role: "behavior", evidence: `Type ${p.enneagram.core}, takes on what others leave undone` });
      }
      if ([6, 22, 33].indexOf(p.numerology.lifePath) !== -1) {
        out.push({ system: "Numerology", engine: 1, role: "behavior", evidence: `Life Path ${p.numerology.lifePath}, responsibility as the assignment itself` });
      }
      if (has(EARTH, p.tropical.points.Saturn.sign)) {
        out.push({ system: "Tropical", engine: 1, role: "behavior", evidence: `Saturn in ${p.tropical.points.Saturn.sign}, obligation taken literally and seriously` });
      }
      if (p.mbti && p.mbti[2] === "F" && p.mbti[3] === "J") {
        out.push({ system: "MBTI", engine: 2, role: "behavior", evidence: `${p.mbti}, feels accountable for how others land` });
      }
      return out;
    },
  },
];

// Classify the relationship from what the evidence actually looks like.
// The distinction matters: these are three genuinely different findings, so
// the test has to be genuinely different for each, not a coin flip.
function classifyClaim(evidence) {
  const e1 = evidence.filter((e) => e.engine === 1);
  const e2 = evidence.filter((e) => e.engine === 2);
  const systems = Array.from(new Set(evidence.map((e) => e.system)));

  // Only one engine sees this at all. The silence from the other side is the
  // finding: either wiring you haven't recognized in yourself (blind spot),
  // or a strategy you built that the chart never called for (adaptation).
  if (e1.length === 0 || e2.length === 0) {
    return { type: "pullApart", direction: e1.length > 0 ? "wired-not-owned" : "learned-not-wired" };
  }

  // Four or more independent systems landing on the same pattern is
  // reinforcement on its own terms, regardless of how each one got there.
  if (systems.length >= 4) return { type: "lineUp", direction: null };

  // One engine names the behavior, the other explains where it comes from.
  const e1Mechanism = e1.some((e) => e.role === "mechanism");
  const e2Behavior = e2.some((e) => e.role === "behavior");
  const e2Mechanism = e2.some((e) => e.role === "mechanism");
  const e1Behavior = e1.some((e) => e.role === "behavior");
  if ((e1Mechanism && e2Behavior) || (e2Mechanism && e1Behavior)) {
    return { type: "mechanism", direction: e1Mechanism ? "chart-explains" : "design-explains" };
  }

  // Both engines describe the same behavior without either explaining it.
  return { type: "lineUp", direction: null };
}

function evaluateClaims(profile) {
  const h = profile.houseSystem || "placidus";
  const results = [];
  for (const c of CLAIMS) {
    let evidence = [];
    try {
      evidence = c.detect(profile, h) || [];
    } catch (err) {
      // A broken detector shouldn't take down the report, but it also
      // shouldn't disappear without a trace. Skip this claim, log why.
      if (typeof console !== "undefined" && console.warn) {
        console.warn(`Claim detector "${c.id}" failed, claim skipped:`, err);
      }
      evidence = [];
    }
    if (evidence.length < 2) continue; // one lone signal isn't a pattern
    const systems = Array.from(new Set(evidence.map((e) => e.system)));
    const classified = classifyClaim(evidence);
    const strength = systems.length;
    // Confidence is a function of how many independent systems converged,
    // not a label attached after the fact. Same tiers used throughout the
    // app, so "High confidence" means the same thing everywhere it appears.
    const confidenceTier = strength >= 4
      ? { label: "High Confidence", color: "#3F7D5C" }
      : strength === 3
      ? { label: "Moderate Confidence", color: COLORS.GOLD }
      : { label: "Lower Confidence", color: COLORS.RED };
    results.push({
      id: c.id,
      claim: c.claim,
      meaning: c.meaning,
      evidence,
      systems,
      relationship: classified.type,
      direction: classified.direction,
      strength,
      confidenceTier,
    });
  }
  // Strongest first: most independent systems supporting it.
  results.sort((a, b) => b.strength - a.strength);
  return results;
}

// Some claims sit in genuine tension with each other. When both hold, that
// isn't the engine contradicting itself, it's the most human finding in the
// report: two true things that pull opposite directions. Naming it is more
// honest than suppressing one of them.
const CLAIM_TENSIONS = [
  {
    a: "belonging-through-contribution",
    b: "autonomy-before-connection",
    note: "You need connection and you guard your independence, both are real, and they aren't taking turns. The cost of that combination is usually this: you give until you're depleted, then withdraw to recover, and the withdrawal reads to other people as the thing you were never intending to say.",
  },
  {
    a: "movement-follows-excitement",
    b: "authority-built-slowly",
    note: "You're built to move when something genuinely engages you, and you're also built to earn credibility the slow way. That combination is uncomfortable by design: the fast yes and the long build don't run on the same clock, and forcing either one to match the other is where most of your frustration comes from.",
  },
  {
