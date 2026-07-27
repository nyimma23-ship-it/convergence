import React, { useState, useEffect, useMemo, createContext, useContext } from "react";

// ---- fonts ----
const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
button:focus-visible,
input:focus-visible,
a:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid #9E7E3D;
  outline-offset: 2px;
  border-radius: 4px;
}
`;

// ---- tabs ----
const TABS = [
  { id: "synthesis", label: "Your Pattern" },
  { id: "evidence", label: "The Evidence" },
  { id: "nowwhat", label: "Now What" },
  { id: "engine1", label: "Birth Chart" },
  { id: "engine2", label: "Your Answers" },
];

// ---- colors ----
const COLORS = {
  INK: "#22242A",
  MUTED: "#424035",
  FAINT: "#787261",
  PAPER: "#FAF6EC",
  CARD: "#FFFFFF",
  LINE: "#E8E1CE",
  GOLD: "#9E7E3D",
  RED: "#A63A3A",
  BRAND: "#6E4A7E",
};
const SOFT_SHADOW = "0 1px 2px rgba(34,36,42,0.04), 0 2px 8px rgba(34,36,42,0.06)";
const PRECISION_BACKEND_URL = "https://nyimma23.pythonanywhere.com";

// ---- fetchGeocode ----
async function fetchGeocode(locationstr, birthDate, birthTime) {
    if (!PRECISION_BACKEND_URL || !locationstr) return null;
    const params = new URLSearchParams({
        q: locationstr,
        date: birthDate || "",
        time: birthTime || ""
    });
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
        const res = await fetch(
            PRECISION_BACKEND_URL + "/api/convergence/geocode?" + params,
            { signal: controller ? controller.signal : undefined }
        );
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

// ---- fetchPrecision (FIXED: uses URLSearchParams with date) ----
async function fetchPrecision(birthdate, utHours, lat, lon) {
    if (!PRECISION_BACKEND_URL || !birthdate) return null;
    
    // Use EXACTLY the same format that was working before
    const [y, m, d] = birthdate.split("-").map(Number);
    const params = new URLSearchParams({ 
        year: y, 
        month: m, 
        day: d, 
        ut_hours: utHours, 
        lat: lat 
    });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(function() { controller.abort(); }, 4000);
    
    try {
        // First fetch - positions (this was working before)
        const posRes = await fetch(
            PRECISION_BACKEND_URL + "/api/convergence/positions?" + params,
            { signal: controller.signal }
        );
        
        // Second fetch - humanDesign (NEW, but using same params)
        const hdRes = await fetch(
            PRECISION_BACKEND_URL + "/api/convergence/humandesign?" + params,
            { signal: controller.signal }
        );
        
        clearTimeout(timeoutId);
        
        const positions = posRes.ok ? await posRes.json() : null;
        const humanDesign = hdRes.ok ? await hdRes.json() : null;
        
        if (!positions) return null;
        positions.humanDesign = humanDesign;
        return positions;
    } catch (e) {
        clearTimeout(timeoutId);
        return null;
    }
}
// ---- system colors ----
const SYSTEM_COLORS = {
    tropical: "#9E7E3D",
    vedic: "#B0562F",
    draconic: "#6E4A7E",
    numerology: "#2F6F6A",
    chinese: "#A63A3A",
    humanDesign: "#7C5CB0",
    mbti: "#46628A",
    enneagram: "#A63A3A",
};

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

// ---- QUIZ_QUESTIONS (full) ----
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
    q: "First, which of these has been most true of you, most of your life?",
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
    q: "Now a different angle. Which of these feels most familiar?",
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

// ---- helpers ----
const TIER_COLOR = { Primary: COLORS.GOLD, Secondary: "#8A7F5C", Supporting: COLORS.FAINT, Real: "#3F7D5C", Generated: "#A63A3A" };

// ---- seeding ----
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
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function pickWeighted(rng, entries) {
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

// ---- sun sign ----
const SUN_SIGN_RANGES = [
