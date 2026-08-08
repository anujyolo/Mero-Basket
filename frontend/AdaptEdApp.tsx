"use client";

/* eslint-disable @next/next/no-img-element -- local homework previews use browser data URLs. */

// Main frontend application: screens, interactions, and accessibility behavior.

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

type View =
  | "dashboard"
  | "learn"
  | "assignments"
  | "quiz"
  | "planner"
  | "flashcards"
  | "focus"
  | "routine"
  | "communicate"
  | "studyroom"
  | "progress"
  | "resources"
  | "preferences"
  | "profile"
  | "settings";

type Preferences = {
  explanation: "Short & Simple" | "Normal" | "Detailed";
  tools: string[];
  interface: "Normal" | "Low distraction" | "One task at a time";
  session: number;
  predictable: boolean;
};

type LessonResult = {
  title: string;
  summary: string;
  needs: string[];
  steps: string[];
  result: string;
  example: string;
  sourceMode?: "TEXTBOOK" | "GENERAL";
  sourceNote?: string;
  sources?: { subject: string; title: string; book: string; pages: string; excerpt: string }[];
};

type LessonAnalysis = {
  mainTopic: string;
  summary: string;
  simpleExplanation: string;
  keyPoints: string[];
  examples: string[];
  learningSteps: string[];
  quiz: QuizQuestion[];
};

type AdaptResponse = {
  result: LessonResult;
  analysis?: LessonAnalysis;
  textbookMode?: "TEXTBOOK" | "GENERAL";
  textbookSources?: { subject: string; title: string; book: string; pages: string; excerpt: string }[];
};

type BookLibraryItem = {
  id: string;
  subject: string;
  title: string;
  status: "Indexed" | "Not Indexed";
  fileUrl: string | null;
  sourceUrl: string | null;
  canOpen: boolean;
  canReplace: boolean;
  canRemove: boolean;
};

type FocusState = {
  mode: "focus" | "break";
  duration: number;
  seconds: number;
  running: boolean;
  savedFocusDuration?: number;
  savedFocusSeconds?: number;
};

type StudySession = {
  id: string;
  subject: string;
  topic: string;
  date: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
};

type RoutineItem = {
  label: string;
  subject: string;
  detail: string;
  time: string;
};

type QuizAttempt = {
  id: string;
  topic: string;
  score: number;
  total: number;
  date: string;
  questions: string[];
};

type StudentAccount = {
  name: string;
  email: string;
  password: string;
  createdAt: string;
};

const ANALYSIS_CACHE_KEY = "adapted-analysis-cache-v4";
const STUDY_SESSIONS_KEY = "adapted-study-sessions-v1";
const ROUTINE_KEY = "adapted-routine-v1";
const QUIZ_ATTEMPTS_KEY = "adapted-quiz-attempts-v1";
const USER_ACCOUNTS_KEY = "padhai-yatra-accounts-v1";
const CURRENT_USER_KEY = "padhai-yatra-current-user-v1";

function readStoredJson<T>(key: string, fallback: T) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function displayNameFromEmail(email: string) {
  const name = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return name ? name.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Student";
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";
}

// Quiz XP drives the student rank shown on the profile and progress pages.
// 20 XP per correct answer, plus a 30 XP bonus for a perfect run.
const XP_PER_CORRECT = 20;
const RANK_TIERS = [
  { name: "Beginner", min: 0, icon: "🌱" },
  { name: "Learner", min: 150, icon: "📗" },
  { name: "Explorer", min: 400, icon: "🧭" },
  { name: "Achiever", min: 800, icon: "⭐" },
  { name: "Scholar", min: 1400, icon: "🎓" },
  { name: "Master", min: 2200, icon: "🏆" },
];

function xpForAttempt(attempt: QuizAttempt) {
  return attempt.score * XP_PER_CORRECT + (attempt.total > 0 && attempt.score === attempt.total ? 30 : 0);
}

function totalXp(attempts: QuizAttempt[]) {
  return attempts.reduce((sum, attempt) => sum + xpForAttempt(attempt), 0);
}

function rankForXp(xp: number) {
  const index = RANK_TIERS.reduce((best, tier, i) => (xp >= tier.min ? i : best), 0);
  const tier = RANK_TIERS[index];
  const next = RANK_TIERS[index + 1] || null;
  const span = next ? next.min - tier.min : 1;
  return {
    ...tier,
    level: index + 1,
    next,
    toNext: next ? next.min - xp : 0,
    percent: next ? Math.min(100, Math.round(((xp - tier.min) / span) * 100)) : 100,
  };
}

// XP earned per day for the last `days` days, oldest first.
function dailyXp(attempts: QuizAttempt[], days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    const key = date.toISOString().slice(0, 10);
    const xp = attempts
      .filter((attempt) => String(attempt.date).slice(0, 10) === key)
      .reduce((sum, attempt) => sum + xpForAttempt(attempt), 0);
    return { key, xp, label: ["S", "M", "T", "W", "T", "F", "S"][date.getDay()] };
  });
}

const focusMotivations = [
  "That is one full block of focus done. Your brain just got stronger.",
  "You showed up and finished. That is the hard part.",
  "Small sessions stack up. This one counted.",
  "Well done. Rest now so the next session is just as good.",
  "Focus is a skill and you just practised it.",
  "Progress, not perfection. You moved forward today.",
];

// Short two-tone chime built with WebAudio so no audio file has to ship.
function playFocusChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    [880, 1318.5].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const start = ctx.currentTime + index * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
    window.setTimeout(() => ctx.close().catch(() => {}), 1400);
  } catch {
    /* audio is a nicety; never let it break the timer */
  }
}

// Supabase auth errors are terse and technical. Rewrite the ones students actually hit.
function friendlyAuthError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "Email or password is incorrect. Create an account first, or use the demo account below.";
  if (text.includes("already registered") || text.includes("already been registered")) return "That email already has an account. Switch to “Log in” instead.";
  if (text.includes("rate limit") || text.includes("for security purposes")) return "Too many email requests just now. Wait about a minute, then try again.";
  if (text.includes("password should be")) return "Supabase requires a password of at least 6 characters.";
  if (text.includes("failed to fetch") || text.includes("networkerror")) return "Could not reach Supabase. Check your internet connection and the Supabase URL in .env.local.";
  return message;
}

// Turn a Supabase session user into the account shape the rest of the app uses.
function accountFromSupabaseUser(user: { email?: string; created_at?: string; user_metadata?: Record<string, unknown> } | null | undefined, fallbackEmail: string): StudentAccount {
  const email = user?.email || fallbackEmail;
  const metaName = typeof user?.user_metadata?.name === "string" ? user.user_metadata.name : "";
  return {
    name: metaName || displayNameFromEmail(email),
    email,
    password: "supabase-auth",
    createdAt: user?.created_at || new Date().toISOString(),
  };
}

// Supabase returns email-link failures in the URL fragment (#error=...&error_description=...).
// Without this the app silently ignores an expired link and the student just sees the login form again.
// An invite link carries the room in the query string. Read it at the app root so
// an invited friend is routed to the room instead of the marketing landing page.
function readRoomFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  if (!room) return null;
  return {
    room,
    topic: params.get("topic") || "",
    mode: params.get("mode") === "Study" ? ("Study" as const) : ("Competition" as const),
  };
}

function readAuthErrorFromUrl() {
  if (typeof window === "undefined") return "";
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromQuery = new URLSearchParams(window.location.search);
  const description = fromHash.get("error_description") || fromQuery.get("error_description");
  const code = fromHash.get("error") || fromQuery.get("error");
  if (!description && !code) return "";
  if (description) window.history.replaceState({}, "", window.location.pathname);
  return description ? description.replace(/\+/g, " ") : `Sign-in link failed (${code}).`;
}

type QuizQuestion = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

type QuizDifficulty = "Easy" | "Normal" | "Hard" | "Extremely hard";
type QuizQuestionType = "Multiple choice" | "Concept check" | "Scenario" | "Exam style";

type AssignmentTask = { title: string; minutes: number; done: boolean };
type AssignmentResponse = { detectedHomework?: string; tasks?: { title: string; minutes: number }[]; answer?: string };

const defaultPreferences: Preferences = {
  explanation: "Short & Simple",
  tools: ["Examples", "Step-by-step explanations", "Visual organization", "Key points", "Real-world examples"],
  interface: "One task at a time",
  session: 20,
  predictable: true,
};

const demoLesson =
  "Photosynthesis is the biochemical process through which green plants transform light energy into chemical energy, using carbon dioxide and water to synthesize glucose while releasing oxygen.";

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "learn", label: "Explain my lesson", icon: "✦" },
  { id: "assignments", label: "Assignments", icon: "☑" },
  { id: "quiz", label: "Quick quiz", icon: "⚡" },
  { id: "planner", label: "Study plan", icon: "▦" },
  { id: "flashcards", label: "Flashcards", icon: "▤" },
  { id: "focus", label: "Focus", icon: "◎" },
  { id: "routine", label: "Routine", icon: "◷" },
  { id: "communicate", label: "Ask for help", icon: "◌" },
  { id: "studyroom", label: "Study Together", icon: "☷" },
  { id: "progress", label: "Progress", icon: "↗" },
  { id: "resources", label: "My Books", icon: "▣" },
  { id: "preferences", label: "Learning style", icon: "⚙" },
];

const demoQuiz: QuizQuestion[] = [
  {
    question: "What is the main purpose of photosynthesis?",
    options: ["To make food for the plant", "To absorb oxygen", "To cool the leaves"],
    answer: 0,
    explanation: "Plants use light energy to make glucose, which stores chemical energy as food.",
  },
  {
    question: "Which gas do leaves take in?",
    options: ["Oxygen", "Carbon dioxide", "Hydrogen"],
    answer: 1,
    explanation: "Leaves take in carbon dioxide through tiny openings called stomata.",
  },
  {
    question: "What captures light energy in a plant?",
    options: ["Roots", "Chlorophyll", "Glucose"],
    answer: 1,
    explanation: "Chlorophyll is the green pigment that captures light energy.",
  },
  {
    question: "What are the main raw materials of photosynthesis?",
    options: ["Water and carbon dioxide", "Oxygen and glucose", "Soil and oxygen"],
    answer: 0,
    explanation: "Plants use water and carbon dioxide, with light energy, to make glucose.",
  },
  {
    question: "What useful gas is released during photosynthesis?",
    options: ["Oxygen", "Nitrogen", "Carbon monoxide"],
    answer: 0,
    explanation: "Oxygen is released as a product of photosynthesis.",
  },
];

const initialTasks: AssignmentTask[] = [
  { title: "Read pages 30–32", minutes: 10, done: false },
  { title: "Answer questions 1–3", minutes: 10, done: false },
  { title: "Take a short break", minutes: 5, done: false },
  { title: "Read pages 33–35", minutes: 10, done: false },
  { title: "Answer questions 4–7", minutes: 10, done: false },
  { title: "Answer questions 8–10", minutes: 10, done: false },
  { title: "Write three important points", minutes: 8, done: false },
  { title: "Create your summary", minutes: 12, done: false },
  { title: "Quick revision", minutes: 10, done: false },
];

const flashcards = [
  { front: "What is photosynthesis?", back: "The process plants use to convert light energy into chemical energy." },
  { front: "What does chlorophyll do?", back: "It captures light energy in the leaves." },
  { front: "What are the inputs?", back: "Sunlight, water, and carbon dioxide." },
  { front: "What are the outputs?", back: "Glucose and oxygen." },
];

const grade11Materials = [
  { subject: "Mathematics", title: "Class 11 Mathematics", kind: "Included PDF", href: "/study_materials/03_Mathematics_Class_11.pdf" },
  { subject: "Biology", title: "Class 11 Biology", kind: "Included PDF", href: "/study_materials/04_Biology_Class_11.pdf" },
  { subject: "Computer Science", title: "Computer Science XI", kind: "Included PDF", href: "/study_materials/Computer_Science_Class_XI_Chapters_1-11.pdf" },
  { subject: "Nepali", title: "Class 11 Nepali", kind: "Included PDF", href: "/study_materials/neb-class-11-compulsory-nepali-book.pdf" },
  { subject: "Physics", title: "Class 11 Physics", kind: "Included PDF", href: "/study_materials/phycics.pdf" },
  { subject: "Chemistry", title: "Class 11 Chemistry", kind: "Included PDF", href: "/study_materials/chemistry.pdf" },
  { subject: "English", title: "Class 11 English", kind: "Included PDF", href: "/study_materials/neb-grade-11-compulsory-english-book.pdf" },
  { subject: "Social Studies", title: "Class 11 Social Studies", kind: "Included PDF", href: "/study_materials/social_grade_11.pdf" },
  { subject: "Law", title: "Law XII reference", kind: "Online source", href: "https://www.scribd.com/document/544136733/Law-xii" },
  { subject: "Economics", title: "Economics", kind: "Online source", href: "https://online.anyflip.com/qfwek/dtwq/mobile/index.html" },
  { subject: "Business Studies", title: "Business Studies 11 Nepali", kind: "Online source", href: "https://asmitapublication.com/product/277/business-studies-11-nepali/10-2" },
];

function cleanText(value: string, fallback = "your lesson") {
  return value.replace(/\s+/g, " ").trim() || fallback;
}

function getLessonTopic(lessonInput: string, result?: LessonResult | null) {
  const title = cleanText(result?.title || "");
  if (title && title !== "your lesson" && title !== "Your adapted lesson") return title;
  const firstLine = cleanText(lessonInput).split(/[.!?]/)[0];
  const contextMatch = firstLine.match(/^(?:in|about|for)\s+([A-Za-z][A-Za-z-]{2,30})\b/i);
  if (contextMatch?.[1]) return contextMatch[1][0].toUpperCase() + contextMatch[1].slice(1);
  const words = firstLine.split(" ").filter(Boolean);
  return words.slice(0, Math.min(words.length, 5)).join(" ") || "your lesson";
}

function isAccountingTopic(value: string) {
  return /\b(accounting|accounts|accountancy|ledger|journal|debit|credit|balance sheet|trial balance|transaction)\b/i.test(value);
}

function isDemandCurveTopic(value: string) {
  return /\b(demand curve|demand schedule|law of demand|quantity demanded|price demand|downward sloping)\b/i.test(value);
}

function accountingQuiz(topic = "Accounting") {
  return {
    title: `${topic} quick quiz`,
    review: "Debit and credit rules",
    questions: [
      {
        question: "What is accounting mainly used for?",
        options: ["Recording and reporting financial transactions", "Drawing pictures", "Measuring plant growth"],
        answer: 0,
        explanation: "Accounting tracks money-related transactions and turns them into useful financial information.",
      },
      {
        question: "In double-entry accounting, every transaction affects how many accounts?",
        options: ["At least two accounts", "Only one account", "No accounts"],
        answer: 0,
        explanation: "Double-entry accounting records every transaction with debit and credit effects.",
      },
      {
        question: "Which statement is correct?",
        options: ["Assets = Liabilities + Capital", "Assets = Expenses only", "Capital = Sales only"],
        answer: 0,
        explanation: "The accounting equation is the base for preparing financial records.",
      },
      {
        question: "What is a ledger used for?",
        options: ["Grouping transactions by account", "Writing poems", "Finding plant species"],
        answer: 0,
        explanation: "A ledger organizes journal entries into individual accounts.",
      },
      {
        question: "What does a journal entry record?",
        options: ["The debit and credit effect of a transaction", "Only the date of an exam", "Only a paragraph summary"],
        answer: 0,
        explanation: "Journal entries show which accounts are debited and credited.",
      },
    ] satisfies QuizQuestion[],
  };
}

function demandCurveQuiz() {
  return {
    title: "Demand curve quick quiz",
    review: "Price and quantity demanded",
    questions: [
      {
        question: "What does a demand curve show?",
        options: ["The relationship between price and quantity demanded", "Only business profit", "The total number of sellers"],
        answer: 0,
        explanation: "A demand curve shows how much consumers are willing to buy at different prices.",
      },
      {
        question: "What usually happens when price rises, assuming other factors stay the same?",
        options: ["Quantity demanded decreases", "Quantity demanded always increases", "Demand disappears completely"],
        answer: 0,
        explanation: "The law of demand says price and quantity demanded usually move in opposite directions.",
      },
      {
        question: "Why does a normal demand curve slope downward?",
        options: ["Lower prices usually encourage more buying", "Higher prices always create more demand", "It shows production cost only"],
        answer: 0,
        explanation: "A downward slope means consumers generally buy more at lower prices and less at higher prices.",
      },
      {
        question: "Which axis usually shows price on a demand curve?",
        options: ["Vertical axis", "Horizontal axis", "No axis"],
        answer: 0,
        explanation: "Price is usually shown on the vertical axis and quantity demanded on the horizontal axis.",
      },
      {
        question: "What does movement along a demand curve usually show?",
        options: ["A change in quantity demanded because price changed", "A change in weather only", "A change in the number of schools"],
        answer: 0,
        explanation: "Movement along the curve happens when price changes and quantity demanded changes.",
      },
    ] satisfies QuizQuestion[],
  };
}

function normalizeFiveQuestionQuiz(questions: QuizQuestion[], topic: string, result?: LessonResult | null) {
  const cleanTopic = cleanText(topic, "this topic");
  const summary = cleanText(result?.summary || `${cleanTopic} is the main concept being checked.`);
  const needs = result?.needs?.length ? result.needs : ["definition", "key feature", "example"];
  const example = cleanText(result?.example || `A useful example should directly show how ${cleanTopic} works.`);
  const extras: QuizQuestion[] = [
    {
      question: `Which statement best explains ${cleanTopic}?`,
      options: [summary.slice(0, 140), `${cleanTopic} is unrelated to the lesson`, `${cleanTopic} has no important parts`],
      answer: 0,
      explanation: `The correct answer explains ${cleanTopic} directly.`,
    },
    {
      question: `Which detail belongs to ${cleanTopic}?`,
      options: [needs[0] || `A key feature of ${cleanTopic}`, `A detail from a different topic`, `A label without meaning`],
      answer: 0,
      explanation: `The correct detail is part of ${cleanTopic}.`,
    },
    {
      question: `Which example supports ${cleanTopic}?`,
      options: [example.slice(0, 140), `An example about a different subject`, `An example that ignores ${cleanTopic}`],
      answer: 0,
      explanation: `A good example must show ${cleanTopic}.`,
    },
    {
      question: `What should be true in an explanation of ${cleanTopic}?`,
      options: [`It should mention the important parts of ${cleanTopic}`, "It should change to another topic", "It should avoid the topic"],
      answer: 0,
      explanation: `A correct explanation stays on ${cleanTopic}.`,
    },
    {
      question: `Which phrase is most connected to ${cleanTopic}?`,
      options: [needs[1] || needs[0] || cleanTopic, "A random unrelated phrase", "Only a page number"],
      answer: 0,
      explanation: `The correct phrase is connected to ${cleanTopic}.`,
    },
  ];
  const uniqueQuestions = [...questions, ...extras].filter((question, index, list) => list.findIndex((item) => item.question === question.question) === index);
  return uniqueQuestions.slice(0, 5);
}

function makeFlashcards(lessonInput: string, result?: LessonResult | null) {
  if (!result && /photosynthesis|chlorophyll/i.test(lessonInput)) return flashcards;
  const topic = getLessonTopic(lessonInput, result);
  const summary = cleanText(result?.summary || lessonInput, `The main idea of ${topic}.`);
  const needs = result?.needs?.length ? result.needs : ["Main idea", "Key details", "Useful example"];
  const steps = result?.steps?.length ? result.steps : ["Read the lesson once.", "Find the key words.", "Explain it in your own words."];
  return [
    { front: `What is the main idea of ${topic}?`, back: summary },
    { front: "What are the key words?", back: needs.join(", ") },
    { front: "What is the first study step?", back: steps[0] },
    { front: "How can you check understanding?", back: result?.example || `Explain ${topic} in three short sentences.` },
  ];
}

function makeQuiz(lessonInput: string, result?: LessonResult | null) {
  if (isDemandCurveTopic(`${lessonInput} ${result?.title || ""} ${result?.summary || ""}`)) {
    return demandCurveQuiz();
  }
  if (isAccountingTopic(`${lessonInput} ${result?.title || ""}`)) {
    return accountingQuiz("Accounting");
  }
  if (!result && /photosynthesis|chlorophyll/i.test(lessonInput)) {
    return { title: "Photosynthesis quick quiz", review: "Role of chlorophyll", questions: demoQuiz };
  }
  const topic = getLessonTopic(lessonInput, result);
  const needs = result?.needs?.length ? result.needs : ["definition", "main parts", "real example"];
  const summary = cleanText(result?.summary || lessonInput, `${topic} is the lesson topic.`);
  const example = cleanText(result?.example || `An example can show how ${topic} works.`);
  const questions: QuizQuestion[] = [
    {
      question: `Which statement best explains ${topic}?`,
      options: [summary.slice(0, 140), `${topic} means there is no relationship between its important parts.`, `${topic} is only a word, not a concept.`],
      answer: 0,
      explanation: `This answer explains the actual meaning of ${topic}.`,
    },
    {
      question: `Which detail belongs with ${topic}?`,
      options: [needs[0] || `A key feature of ${topic}`, `A detail that has no connection to ${topic}`, `A title with no explanation of ${topic}`],
      answer: 0,
      explanation: `The correct option is connected to the concept of ${topic}.`,
    },
    {
      question: `Which example best helps explain ${topic}?`,
      options: [example.slice(0, 140), `An example about a completely different subject`, `An example that ignores ${topic}`],
      answer: 0,
      explanation: `A useful example must directly show how ${topic} works.`,
    },
  ];
  return { title: `${topic} quick quiz`, review: needs[0] || "main idea", questions: normalizeFiveQuestionQuiz(questions, topic, result) };
}

function tuneQuizQuestion(question: QuizQuestion, topic: string, difficulty: QuizDifficulty, questionType: QuizQuestionType, index: number): QuizQuestion {
  if (difficulty === "Normal" && questionType === "Multiple choice") return question;
  const prefix = questionType === "Scenario"
    ? `Scenario ${index + 1}: A Grade 11 student is studying ${topic}. `
    : questionType === "Exam style"
      ? `Exam style ${index + 1}: `
      : questionType === "Concept check"
        ? `Concept check ${index + 1}: `
        : "";
  const difficultyHint = difficulty === "Easy"
    ? "Choose the clearest basic answer."
    : difficulty === "Hard"
      ? "Choose the most accurate answer, not just the familiar one."
      : difficulty === "Extremely hard"
        ? "Choose the answer that best handles the deeper meaning and avoids traps."
        : "";
  const harderDistractor = difficulty === "Extremely hard" ? `A partly true but incomplete idea about ${topic}` : difficulty === "Hard" ? `A confusing detail related to ${topic}` : question.options[1];
  return {
    ...question,
    question: `${prefix}${question.question} ${difficultyHint}`.trim(),
    options: difficulty === "Easy" ? question.options : [question.options[0], harderDistractor, question.options[2] || `An unrelated idea about ${topic}`],
    explanation: `${question.explanation} Difficulty: ${difficulty}. Type: ${questionType}.`,
  };
}

function buildResultFromAnalysis(analysis: LessonAnalysis, action: string) {
  const loweredAction = action.toLowerCase();
  const wantsSimple = /simpl/.test(loweredAction);
  const wantsExample = /example|analogy/.test(loweredAction);
  const wantsDeep = /deep|normal|differently/.test(loweredAction);
  const wantsSteps = /step|break/.test(loweredAction);
  return {
    title: analysis.mainTopic,
    summary: wantsSimple ? analysis.simpleExplanation : wantsDeep ? analysis.summary : analysis.simpleExplanation,
    needs: analysis.keyPoints.slice(0, 6),
    steps: (wantsSteps ? analysis.learningSteps : analysis.learningSteps.slice(0, Math.min(4, analysis.learningSteps.length))),
    result: `You now have a clearer way to study ${analysis.mainTopic}.`,
    example: wantsExample
      ? analysis.examples[0] || `Use one example to explain ${analysis.mainTopic}.`
      : analysis.examples[1] || analysis.examples[0] || `Use one example to explain ${analysis.mainTopic}.`,
  } satisfies LessonResult;
}

function buildEmergencyAnalysis(lessonInput: string): LessonAnalysis {
  const topic = getLessonTopic(lessonInput).replace(/^(in|about|for)\s+/i, "");
  if (isAccountingTopic(`${lessonInput} ${topic}`)) {
    return {
      mainTopic: "Accounting",
      summary: "Accounting records, organizes, and reports financial transactions so a business can understand its money position.",
      simpleExplanation: "Accounting means keeping clear money records: what came in, what went out, what is owned, and what is owed.",
      keyPoints: ["Transactions", "Journal entries", "Ledger", "Debit", "Credit", "Accounting equation"],
      examples: ["If a shop buys goods for cash, goods increase and cash decreases."],
      learningSteps: ["Learn the accounting equation.", "Identify the accounts affected.", "Apply debit and credit rules.", "Write the journal entry."],
      quiz: accountingQuiz("Accounting").questions,
    };
  }
  const cleanTopic = topic || "your lesson";
  const material = cleanText(lessonInput, cleanTopic);
  const firstSentence = material.split(/(?<=[.!?])\s+/)[0] || material;
  const words = material.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [];
  const keyPoints = [...new Set(words.filter((word) => !["about", "answer", "chapter", "explain", "lesson", "question", "that", "this", "with", "your"].includes(word)).slice(0, 6))]
    .map((word) => word[0].toUpperCase() + word.slice(1));
  const points = keyPoints.length >= 3 ? keyPoints : ["Main idea", "Important details", "Useful example"];

  return {
    mainTopic: cleanTopic,
    summary: `${cleanTopic} is the topic to study. Start with the main idea, then connect the important details from your material.`,
    simpleExplanation: `In simple words: ${firstSentence}`,
    keyPoints: points,
    examples: [
      `A useful way to learn ${cleanTopic} is to explain it to a friend in two short sentences.`,
      `Connect ${cleanTopic} to one example from your class notes or textbook.`,
    ],
    learningSteps: [
      `Read the material about ${cleanTopic} once.`,
      `Write the main idea in one short sentence.`,
      `Pick out these key points: ${points.slice(0, 4).join(", ")}.`,
      `Practice one question or example.`,
    ],
    quiz: [
      {
        question: `What should you understand first about ${cleanTopic}?`,
        options: ["The main idea", "Only the page number", "An unrelated fact"],
        answer: 0,
        explanation: "The main idea helps organize the rest of the lesson.",
      },
      {
        question: `Which item is most useful for reviewing ${cleanTopic}?`,
        options: [points[0] || "A key point", "A random word", "Only the title"],
        answer: 0,
        explanation: "Important key points make review faster and clearer.",
      },
      {
        question: "How can you check if you understand?",
        options: ["Explain it in your own words", "Skip practice", "Memorize without meaning"],
        answer: 0,
        explanation: "Explaining in your own words shows real understanding.",
      },
    ],
  };
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo" aria-label="Padhai Yatra home">
      <img className="logo-image" src="/padhai-yatra-logo.png" alt="" />
      {!compact && <span>Padhai <b>Yatra</b></span>}
    </div>
  );
}

function Landing({ onStart, onDemo, theme, toggleTheme }: { onStart: () => void; onDemo: () => void; theme: string; toggleTheme: () => void }) {
  return (
    <main className="landing">
      <header className="landing-nav">
        <Logo />
        <nav aria-label="Landing navigation">
          <a href="#how">How it works</a>
          <a href="#tools">Learning tools</a>
          <a href="#accessibility">Accessibility</a>
        </nav>
        <div className="nav-actions">
          <button className="icon-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
            {theme === "light" ? "☾" : "☀"}
          </button>
          <button className="button small" onClick={onStart}>Sign in</button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><i /> Personalized learning, without the pressure</span>
          <h1>Padhai Yatra.<br /><em>Learn anytime, anywhere.</em></h1>
          <p>A Grade 11 learning companion that explains topics, builds quizzes, finds videos, and plans study time around the way you learn best.</p>
          <div className="hero-actions">
            <button className="button primary large" onClick={onStart}>Start learning <span>→</span></button>
            <button className="button large" onClick={onDemo}>Try Anuj&apos;s demo</button>
          </div>
          <div className="hero-proof">
            <span>✓ No medical labels</span><span>✓ Your preferences</span><span>✓ Calm by design</span>
          </div>
        </div>
        <div className="adapt-visual" aria-label="Example of Padhai Yatra simplifying a lesson">
          <div className="paper original-paper">
            <span className="paper-label">ORIGINAL LESSON</span>
            <p>Evaporation is the process by which molecules in a liquid state acquire sufficient kinetic energy to transition into the gaseous state.</p>
          </div>
          <div className="adapt-bridge"><span>✦</span> Demo adapted lesson</div>
          <div className="paper adapted-paper">
            <span className="paper-label">SHORT + EXAMPLE</span>
            <h3>Evaporation means liquid turns into gas.</h3>
            <div className="mini-example"><b>Try this example</b><p>Wet clothes dry because water slowly goes into the air.</p></div>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-heading"><span>HOW IT WORKS</span><h2>The lesson stays accurate.<br />The experience becomes yours.</h2></div>
        <div className="three-grid">
          {[
            ["01", "Set your learning style", "Choose shorter explanations, examples, visual structure, or one task at a time."],
            ["02", "Add what you are learning", "Paste a lesson, assignment, topic, or notes. You stay in control of the material."],
            ["03", "Learn your way", "Simplify, explore examples, build a quiz, or turn work into manageable steps."],
          ].map(([num, title, copy]) => <article className="feature-card" key={num}><b>{num}</b><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className="split-section" id="tools">
        <div>
          <span className="eyebrow"><i /> Built for real study days</span>
          <h2>One place for understanding, planning, and practicing.</h2>
          <p>Padhai Yatra is more than a chatbot. Each tool uses the same learning preferences, so your study experience stays consistent.</p>
        </div>
        <div className="tool-list">
          {["Understand complex lessons", "Break down assignments", "Generate quick quizzes", "Build focused study plans", "Create and review flashcards", "Communicate what you need"].map((x, i) => <div key={x}><span>{["✦", "☑", "⚡", "▦", "▤", "◌"][i]}</span>{x}<b>→</b></div>)}
        </div>
      </section>

      <section className="section accessibility-section" id="accessibility">
        <div className="quote-mark">“</div>
        <blockquote>Instead of forcing every student to adapt to the same lesson, Padhai Yatra adapts the lesson to the student.</blockquote>
        <p>Educational personalization for every learner—without diagnosis, assumptions, or judgment.</p>
      </section>

      <section className="final-cta">
        <Logo />
        <h2>Learn anytime, anywhere.</h2>
        <p>Start with Anuj&apos;s demo profile and personalize your first lesson in under a minute.</p>
        <button className="button primary large" onClick={onDemo}>Explore the demo <span>→</span></button>
      </section>
      <footer><span>Padhai Yatra · Hackathon 2026</span><span>Educational support, not clinical assessment.</span></footer>
    </main>
  );
}

function Login({ onLogin, onBack, initialError, invitedRoom }: { onLogin: (account: StudentAccount) => void; onBack: () => void; initialError?: string; invitedRoom?: { room: string; topic: string; mode: "Study" | "Competition" } | null }) {
  const [mode, setMode] = useState<"login" | "signup" | "verify">("login");
  const [name, setName] = useState("Anuj Adhikari");
  const [email, setEmail] = useState(() => readStoredJson<StudentAccount | null>(CURRENT_USER_KEY, null)?.email || "demo@student.com");
  const [password, setPassword] = useState("demo123");
  const [verificationCode, setVerificationCode] = useState("");
  const [typedCode, setTypedCode] = useState("");
  const [pendingAccount, setPendingAccount] = useState<StudentAccount | null>(null);
  const [verificationReason, setVerificationReason] = useState<"signup" | "login">("signup");
  const [supabaseNotice, setSupabaseNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || "");
  const accounts = () => readStoredJson<Record<string, StudentAccount>>(USER_ACCOUNTS_KEY, {
    "demo@student.com": { name: "Anuj Adhikari", email: "demo@student.com", password: "demo123", createdAt: new Date().toISOString() },
  });
  const saveAccount = (account: StudentAccount) => {
    localStorage.setItem(USER_ACCOUNTS_KEY, JSON.stringify({ ...accounts(), [account.email.toLowerCase()]: account }));
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(account));
  };
  function beginEmailLinkVerification(account: StudentAccount, reason: "signup" | "login") {
    const token = Math.random().toString(36).slice(2, 10).toUpperCase();
    setVerificationCode(token);
    setTypedCode("");
    setPendingAccount(account);
    setVerificationReason(reason);
    setMode("verify");
    setError("");
  }
  // An invited friend almost never has an account yet, so open on the signup tab.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (invitedRoom) setMode((current) => (current === "login" ? "signup" : current));
  }, [invitedRoom]);

  // Verify screen: ask Supabase whether the emailed link has been opened yet.
  async function checkConfirmedSession() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (user?.email) {
        onLogin(accountFromSupabaseUser(user, user.email));
        return;
      }
      // The link opens in whatever browser handles mail, so the session may live in another tab.
      // Re-running the password check here picks it up without a second email.
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();
      if (cleanEmail && cleanPassword.length >= 6) {
        const { data: retry, error: retryError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword });
        if (!retryError && retry.user) {
          onLogin(accountFromSupabaseUser(retry.user, cleanEmail));
          return;
        }
      }
      setError("Not confirmed yet. Open the link in your inbox in this browser, then press this button again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (!supabase) return;
    const cleanEmail = (pendingAccount?.email || email).trim().toLowerCase();
    setBusy(true);
    setError("");
    try {
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email: cleanEmail });
      if (resendError) {
        setError(friendlyAuthError(resendError.message));
        return;
      }
      setSupabaseNotice(`New confirmation link sent to ${cleanEmail}.`);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mode === "verify") {
      if (isSupabaseConfigured) {
        await checkConfirmedSession();
        return;
      }
      if (!pendingAccount) {
        setMode("signup");
        setError("Please create your account again.");
        return;
      }
      if (typedCode.trim().toUpperCase() !== verificationCode) {
        setError("Verification link was not confirmed.");
        return;
      }
      if (verificationReason === "signup") saveAccount(pendingAccount);
      else localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(pendingAccount));
      onLogin(pendingAccount);
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setError("Enter a valid email address.");
      return;
    }
    // Supabase enforces a 6-character minimum; validating at 4 let signups fail server-side instead.
    const minPassword = isSupabaseConfigured && cleanEmail !== "demo@student.com" ? 6 : 4;
    if (cleanPassword.length < minPassword) {
      setError(`Password must be at least ${minPassword} characters.`);
      return;
    }
    const stored = accounts();
    if (supabase && cleanEmail !== "demo@student.com") {
      const account: StudentAccount = { name: name.trim() || displayNameFromEmail(cleanEmail), email: cleanEmail, password: "supabase-auth", createdAt: new Date().toISOString() };
      setError("");
      setSupabaseNotice("");
      setBusy(true);
      try {
        if (mode === "signup") {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: cleanEmail,
            password: cleanPassword,
            options: {
              data: { name: account.name },
              emailRedirectTo: `${window.location.origin}/`,
            },
          });
          if (signUpError) {
            // Supabase's built-in mailer caps at ~2 messages an hour, so a real signup
            // fails purely because an email could not be sent. That must not stop a
            // student joining — fall back to the device-local account and let them in.
            const message = signUpError.message.toLowerCase();
            const mailerBlocked = message.includes("rate limit")
              || message.includes("for security purposes")
              || message.includes("email")
              || message.includes("smtp")
              || message.includes("sending");
            if (mailerBlocked) {
              const localAccount = { ...account, password: cleanPassword };
              saveAccount(localAccount);
              onLogin(localAccount);
              return;
            }
            setError(friendlyAuthError(signUpError.message));
            return;
          }
          // With "Confirm email" off, Supabase signs the student straight in.
          if (signUpData.session?.user) {
            onLogin(accountFromSupabaseUser(signUpData.session.user, cleanEmail));
            return;
          }
          // Supabase's built-in mailer only delivers to project team members and allows
          // ~2 messages an hour, so the confirmation mail often never arrives. Save a
          // device-local account too, so the student is never locked out waiting for it.
          saveAccount({ ...account, password: cleanPassword });
          setPendingAccount({ ...account, password: cleanPassword });
          setVerificationReason("signup");
          setMode("verify");
          setSupabaseNotice(`Account created for ${cleanEmail}. If the confirmation email does not arrive, use “Continue without email” below.`);
          return;
        }
        // Password sign-in is the whole login. The previous build signed the student back out
        // and mailed a second magic link, which destroyed the session it had just created.
        const { data: signInData, error: passwordError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword });
        if (passwordError) {
          // Fall back to the device-local account so an undelivered confirmation
          // email cannot lock a student out of their own workspace.
          const localMatch = stored[cleanEmail];
          if (localMatch && localMatch.password === cleanPassword) {
            onLogin(localMatch);
            return;
          }
          if (/email not confirmed/i.test(passwordError.message)) {
            setPendingAccount({ ...account, password: cleanPassword });
            setVerificationReason("signup");
            setMode("verify");
            setSupabaseNotice(`${cleanEmail} is not confirmed yet. Open the link in your inbox, or use “Continue without email” below.`);
            return;
          }
          setError(friendlyAuthError(passwordError.message));
          return;
        }
        onLogin(accountFromSupabaseUser(signInData.user, cleanEmail));
        return;
      } finally {
        setBusy(false);
      }
    }
    if (mode === "signup") {
      const account: StudentAccount = { name: name.trim() || displayNameFromEmail(cleanEmail), email: cleanEmail, password: cleanPassword, createdAt: new Date().toISOString() };
      beginEmailLinkVerification(account, "signup");
      return;
    }
    const account = stored[cleanEmail];
    if (!account || account.password !== cleanPassword) {
      setError("Email and password do not match. Create an account first or use the demo account.");
      return;
    }
    if (account.email === "demo@student.com") {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(account));
      onLogin(account);
      return;
    }
    beginEmailLinkVerification(account, "login");
  }
  return (
    <main className="login-page">
      <button className="back-link" onClick={onBack}>← Back to welcome</button>
      <section className="login-shell">
        <aside className="login-brand-panel" aria-label="Padhai Yatra welcome">
          <img src="/padhai-yatra-logo.png" alt="Padhai Yatra logo" />
          <span>Grade 11 learning space</span>
          <h1>Padhai Yatra</h1>
          <p>Explain lessons, practice quizzes, plan study time, and keep your progress in one calm place.</p>
        </aside>
        <div className="login-card">
          <Logo />
          {invitedRoom && <div className="invite-banner"><span>YOU ARE INVITED</span><h3>{invitedRoom.topic || "Study room"}</h3><p>{invitedRoom.mode} room · code {invitedRoom.room}. Create an account or log in below and you will land straight in the room.</p></div>}
          <div className="login-heading"><span className="eyebrow"><i /> STUDENT PORTAL</span><h1>{mode === "login" ? "Welcome back." : mode === "signup" ? "Create account." : "Check your email."}</h1><p>{mode === "login" ? "Enter your email and password. Confirmed accounts go straight in." : mode === "signup" ? "Sign up first. Confirm your email once, then log in with your password." : isSupabaseConfigured ? `Click the Supabase email link sent to ${pendingAccount?.email || email}.` : `A verification link is prepared for ${pendingAccount?.email || email}.`}</p></div>
          {mode !== "verify" && <div className="auth-tabs" role="group" aria-label="Login mode">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Log in</button>
            <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); }}>Create account</button>
          </div>}
          <form onSubmit={submit}>
            {mode === "verify" ? (
              <>
                <div className="verification-card">
                  <span>{isSupabaseConfigured ? "Supabase email sent" : "Email verification link"}</span>
                  {isSupabaseConfigured ? <strong>CHECK EMAIL</strong> : <strong>VERIFY-{verificationCode}</strong>}
                  <p>{isSupabaseConfigured ? supabaseNotice || "Open the confirmation link in your inbox, then press continue below." : "In production this link is sent to Gmail. This local demo shows the link because no email provider is connected."}</p>
                  {!isSupabaseConfigured && <button className="button primary" type="button" onClick={() => setTypedCode(verificationCode)}>Open verification link</button>}
                  {isSupabaseConfigured && <button className="button" type="button" disabled={busy} onClick={resendConfirmation}>Resend confirmation email</button>}
                  {isSupabaseConfigured && <button className="button primary" type="button" onClick={() => {
                    const fallback = pendingAccount || { name: name.trim() || displayNameFromEmail(email), email: email.trim().toLowerCase(), password: password.trim(), createdAt: new Date().toISOString() };
                    saveAccount(fallback);
                    onLogin(fallback);
                  }}>Continue without email →</button>}
                </div>
                {!isSupabaseConfigured && <label>Verification token<input value={typedCode} onChange={(e) => setTypedCode(e.target.value.toUpperCase())} placeholder="Click the email link or paste token" /></label>}
              </>
            ) : (
              <>
                {mode === "signup" && <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} type="text" autoComplete="name" /></label>}
                <label>Email address<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" /></label>
                <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
              </>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary large full" type="submit" disabled={busy}>{busy ? "Working…" : mode === "login" ? "Log in →" : mode === "signup" ? "Create account →" : isSupabaseConfigured ? "I confirmed my email — continue →" : "Verify and enter →"}</button>
            {mode === "verify" && <button className="button full" type="button" onClick={() => { setMode("login"); setPendingAccount(null); setTypedCode(""); setSupabaseNotice(""); setError(""); }}>Back to log in</button>}
            <button className="button full" type="button" onClick={() => { setMode("login"); setEmail("demo@student.com"); setPassword("demo123"); setSupabaseNotice(""); setError(""); }}>Use demo account</button>
          </form>
          <div className="demo-credentials"><b>Demo login</b><span>demo@student.com</span><span>Password: demo123</span></div>
          <p className="privacy-note">{isSupabaseConfigured ? "Supabase Auth is connected for real email verification links." : "Supabase keys are missing, so local demo verification is active."}</p>
        </div>
      </section>
    </main>
  );
}

function Header({ title, calm, setCalm, theme, toggleTheme, onMenu, aiMode, onProfile, currentUser }: { title: string; calm: boolean; setCalm: (v: boolean) => void; theme: string; toggleTheme: () => void; onMenu: () => void; aiMode: "checking" | "live" | "demo"; onProfile: () => void; currentUser: StudentAccount }) {
  return (
    <header className="app-header">
      <button className="icon-button mobile-menu" onClick={onMenu} aria-label="Open navigation">☰</button>
      <div><span className="breadcrumb">WORKSPACE /</span><h1>{title}</h1></div>
      <div className="header-actions">
        <span className={`demo-badge ${aiMode === "live" ? "live" : ""}`}><i /> {aiMode === "checking" ? "Checking Padhai Yatra…" : aiMode === "live" ? "Padhai Yatra AI live" : "Padhai Yatra demo ready"}</span>
        <label className="calm-toggle"><input type="checkbox" checked={calm} onChange={(e) => setCalm(e.target.checked)} /><span className="switch" /><b>Calm mode</b></label>
        <button className="icon-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? "☾" : "☀"}</button>
        <button className="avatar profile-button" onClick={onProfile} aria-label={`Open ${currentUser.name} profile`}>{initialsFor(currentUser.name)}</button>
      </div>
    </header>
  );
}

function HistoryPanel({ open, onClose, quizAttempts, studySessions, setView, currentUser }: { open: boolean; onClose: () => void; quizAttempts: QuizAttempt[]; studySessions: StudySession[]; setView: (view: View) => void; currentUser: StudentAccount }) {
  if (!open) return null;
  const totalQuizzes = quizAttempts.length;
  const averageScore = totalQuizzes ? Math.round((quizAttempts.reduce((sum, attempt) => sum + attempt.score / attempt.total, 0) / totalQuizzes) * 100) : 0;
  const totalStudySeconds = studySessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  return (
    <div className="history-layer" role="dialog" aria-modal="true" aria-label="Anuj learning history">
      <button className="history-backdrop" onClick={onClose} aria-label="Close history" />
      <aside className="history-panel">
        <div className="history-head">
          <div><span className="eyebrow"><i /> {currentUser.name.toUpperCase()} HISTORY</span><h2>All activity</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close history">×</button>
        </div>
        <div className="history-stats">
          <div><b>{totalQuizzes}</b><span>Quizzes</span></div>
          <div><b>{averageScore}%</b><span>Average</span></div>
          <div><b>{formatDuration(totalStudySeconds)}</b><span>Focus time</span></div>
        </div>
        <section>
          <div className="history-title"><h3>Quiz history</h3><button onClick={() => { setView("quiz"); onClose(); }}>Open quiz</button></div>
          <div className="history-list">
            {quizAttempts.length ? quizAttempts.slice(0, 12).map((attempt) => <article key={attempt.id}><b>{attempt.topic}</b><span>{attempt.score}/{attempt.total} · {new Date(attempt.date).toLocaleString()}</span><small>{attempt.questions.slice(0, 2).join(" • ")}</small></article>) : <p>No quiz attempts yet. Complete a 5-question quiz and it will appear here.</p>}
          </div>
        </section>
        <section>
          <div className="history-title"><h3>Study history</h3><button onClick={() => { setView("progress"); onClose(); }}>Open progress</button></div>
          <div className="history-list">
            {studySessions.length ? studySessions.slice(0, 10).map((session) => <article key={session.id}><b>{session.topic}</b><span>{formatDuration(session.durationSeconds)} · {session.date}</span><small>{session.startedAt ? new Date(session.startedAt).toLocaleTimeString() : "Focus session"}</small></article>) : <p>No focus sessions tracked yet. Finish a Focus timer to add study history.</p>}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Sidebar({ view, setView, calm, open, close, logout, currentUser }: { view: View; setView: (v: View) => void; calm: boolean; open: boolean; close: () => void; logout: () => void; currentUser: StudentAccount }) {
  const visibleItems = calm ? navItems.filter((n) => ["dashboard", "learn", "assignments", "focus", "resources"].includes(n.id)) : navItems;
  const essentials = visibleItems.filter((n) => ["dashboard", "learn", "assignments", "quiz", "planner", "focus"].includes(n.id));
  const extras = visibleItems.filter((n) => !essentials.includes(n));
  const navButton = (item: (typeof navItems)[number]) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); close(); }}><span>{item.icon}</span>{item.label}</button>;
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="side-top"><Logo /><button className="icon-button sidebar-close" onClick={close} aria-label="Close navigation">×</button></div>
      <nav aria-label="Main application navigation">
        <small className="nav-label">START HERE</small>
        {essentials.map(navButton)}
        {extras.length > 0 && <small className="nav-label second">MORE TOOLS</small>}
        {extras.map(navButton)}
      </nav>
      <div className="side-bottom">
        <button onClick={() => setView("settings")}><span>⚙</span>Settings</button>
        <button onClick={logout}><span>↪</span>Log out</button>
        <button className={`profile-mini ${view === "profile" ? "active" : ""}`} onClick={() => { setView("profile"); close(); }} aria-label={`Open ${currentUser.name} profile`}><div className="avatar">{initialsFor(currentUser.name)}</div><div><b>{currentUser.name}</b><span>Student · Local account</span></div></button>
      </div>
    </aside>
  );
}

function StatCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: string }) {
  return <article className="stat-card"><div className="stat-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function Dashboard({ setView, lessonInput, setLessonInput, adapt, lessonResult, currentUser }: { setView: (v: View) => void; lessonInput: string; setLessonInput: (v: string) => void; adapt: () => void; lessonResult: LessonResult | null; currentUser: StudentAccount }) {
  const topic = getLessonTopic(lessonInput, lessonResult);
  const choices: [View, string, string, string, string][] = [
    ["learn", "1", "Help me understand", "Paste a lesson and get a clearer explanation.", "mint"],
    ["assignments", "2", "Break down my work", "Turn a big assignment into small steps.", "sun"],
    ["quiz", "3", "Practice with a quiz", "Check what you know without pressure.", "lilac"],
    ["focus", "4", "Focus on one task", "Use a calm timer with fewer distractions.", "sky"],
  ];
  return (
    <div className="page-content dashboard-page">
      <section className="welcome-row simple-welcome"><div><p className="date-label">YOUR LEARNING SPACE</p><h2>Hi {currentUser.name.split(" ")[0] || "Student"}, what can we make easier? <span>👋</span></h2><p>Choose one thing. Padhai Yatra will guide you step by step.</p></div><button className="streak-pill" onClick={() => setView("progress")}><span>◇</span><div><b>5 day streak</b><small>See your progress →</small></div></button></section>

      <section className="start-guide calm-hide" aria-label="Three simple steps">
        <div><b>1</b><span><strong>Choose a goal</strong><small>Pick one card below</small></span></div>
        <i>→</i>
        <div><b>2</b><span><strong>Add your work</strong><small>Paste notes or a task</small></span></div>
        <i>→</i>
        <div><b>3</b><span><strong>Learn your way</strong><small>Padhai Yatra follows your style</small></span></div>
      </section>

      <section className="easy-dashboard">
        <div className="choice-zone">
          <div className="choice-heading"><div><span className="eyebrow"><i /> START HERE</span><h3>What do you want to do?</h3></div><span>One choice is enough.</span></div>
          <div className="big-choice-grid">
            {choices.map(([id, number, title, copy, color]) => <button className={`big-choice ${color}`} onClick={() => setView(id)} key={id}><span>{number}</span><div><b>{title}</b><small>{copy}</small></div><i>→</i></button>)}
          </div>
          <div className="secondary-actions calm-hide">
            <button onClick={() => setView("planner")}><span>▦</span><b>Make a study plan</b></button>
            <button onClick={() => setView("studyroom")}><span>☷</span><b>Study with friends</b></button>
            <button onClick={() => setView("communicate")}><span>◌</span><b>Help me ask a teacher</b></button>
            <button onClick={() => setView("resources")}><span>▣</span><b>Open My Books</b></button>
          </div>
        </div>

        <aside className="now-card">
          <span className="eyebrow"><i /> RIGHT NOW</span>
          <div className="now-illustration">A</div>
          <small>CURRENT LESSON · 15 MIN</small>
          <h3>{topic}</h3>
          <p>Continue the lesson you started.</p>
          <button className="button primary full" onClick={() => setView("learn")}>Continue learning →</button>
          <button className="quiet-link" onClick={() => setView("routine")}>See today&apos;s routine</button>
        </aside>
      </section>

      <section className="quick-paste calm-hide">
        <div><span className="quick-icon">✦</span><div><b>Already know what you need?</b><small>Paste a topic or lesson here and Padhai Yatra will begin.</small></div></div>
        <textarea value={lessonInput} onChange={(e) => setLessonInput(e.target.value)} placeholder="Paste a topic or lesson…" aria-label="Quick learning material" />
        <button className="button primary" onClick={adapt}>Explain it for me →</button>
      </section>
    </div>
  );
}

function LoadingPanel({ stage }: { stage: number }) {
  const labels = ["Understanding your material…", "Adapting it to your preferences…", "Preparing your explanation…"];
  return <div className="loading-panel" role="status"><div className="spinner">✦</div><b>{labels[stage] || labels[2]}</b><div className="loading-lines"><i /><i /><i /></div></div>;
}

function LessonResultCard({ result, action, onAction, onQuiz }: { result: LessonResult; action: string; onAction: (a: string) => void; onQuiz: () => void }) {
  const videoSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${result.title} grade 11 explanation`)}`;
  return (
    <article className="result-card">
      <div className="result-head"><div><span className="eyebrow"><i /> ADAPTED · {action.toUpperCase()}</span><h2>{result.title}</h2></div><span className="preference-chip">Short + visual + example</span></div>
      <p className="result-summary">{result.summary}</p>
      {result.needs.length > 0 && <div className="needs-grid">{result.needs.map((n) => <span key={n}>{n}</span>)}</div>}
      {result.steps.length > 0 && <div className="step-list">{result.steps.map((s, i) => <div key={s}><b>STEP {i + 1}</b><p>{s}</p></div>)}</div>}
      <div className="result-outcome"><span>RESULT</span><p>{result.result}</p></div>
      <div className="analogy-box"><span>Think of it this way</span><p>{result.example}</p></div>
      <div className="video-box"><span>Video help</span><p>Find a YouTube explanation for <b>{result.title}</b>.</p><a className="button primary" href={videoSearchUrl} target="_blank" rel="noreferrer">Open related YouTube videos →</a></div>
      {(result.sourceNote || result.sources?.length) && <div className={`source-panel ${result.sourceMode === "GENERAL" ? "general" : "textbook"}`}><span>{result.sourceNote || "Source"}</span>{result.sources?.length ? <div className="source-list">{result.sources.map((source) => <div key={`${source.subject}-${source.pages}`}><b>{source.subject}</b><small>{source.title}</small><p>{source.pages}</p></div>)}</div> : <p>{result.sourceMode === "GENERAL" ? "This answer was not matched to a textbook page." : "Based on your textbook."}</p>}</div>}
      <div className="result-actions">
        {["Make simpler", "Explain normally", "Explain deeply", "Give example", "Use an analogy", "Show step-by-step"].map((a) => <button onClick={() => onAction(a)} key={a}>{a}</button>)}
        <a className="button" href={videoSearchUrl} target="_blank" rel="noreferrer">Video ▶</a>
        <button className="quiz-action" onClick={onQuiz}>Quiz me ⚡</button>
      </div>
    </article>
  );
}

function QuizCard({ lessonInput, lessonResult, lessonAnalysis, onReview, onComplete }: { lessonInput: string; lessonResult: LessonResult | null; lessonAnalysis: LessonAnalysis | null; onReview: () => void; onComplete: (attempt: QuizAttempt) => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("Normal");
  const [questionType, setQuestionType] = useState<QuizQuestionType>("Multiple choice");
  const quiz = useMemo(() => {
    const build = (baseQuiz: { title: string; review: string; questions: QuizQuestion[] }) => {
      const topic = baseQuiz.title.replace(/\s+quick quiz$/i, "");
      return { ...baseQuiz, questions: baseQuiz.questions.map((question, index) => tuneQuizQuestion(question, topic, difficulty, questionType, index)) };
    };
    if (lessonAnalysis?.quiz?.length) {
      const topic = lessonAnalysis.mainTopic;
      return build({
        title: `${topic} quick quiz`,
        review: lessonAnalysis.keyPoints[0] || "main idea",
        questions: normalizeFiveQuestionQuiz(lessonAnalysis.quiz, topic, lessonResult),
      });
    }
    return build(makeQuiz(lessonInput, lessonResult));
  }, [difficulty, lessonAnalysis, lessonInput, lessonResult, questionType]);
  const score = quiz.questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  const perfectScore = score === quiz.questions.length;
  function submitQuiz() {
    setSubmitted(true);
    onComplete({
      id: `${new Date().toISOString()}-${quiz.title}`,
      topic: quiz.title.replace(/\s+quick quiz$/i, ""),
      score,
      total: quiz.questions.length,
      date: new Date().toISOString(),
      questions: quiz.questions.map((question) => question.question),
    });
  }
  return (
    <section className="quiz-card">
      <div className="card-title"><div><span className="eyebrow"><i /> 5 QUESTION CHECK</span><h2>{quiz.title}</h2></div><span className="preference-chip">{difficulty} · {questionType}</span></div>
      {!submitted && <div className="quiz-controls">
        <div><span>Difficulty</span>{(["Easy", "Normal", "Hard", "Extremely hard"] as QuizDifficulty[]).map((level) => <button type="button" className={difficulty === level ? "active" : ""} onClick={() => { setDifficulty(level); setAnswers({}); }} key={level}>{level}</button>)}</div>
        <div><span>Question type</span>{(["Multiple choice", "Concept check", "Scenario", "Exam style"] as QuizQuestionType[]).map((type) => <button type="button" className={questionType === type ? "active" : ""} onClick={() => { setQuestionType(type); setAnswers({}); }} key={type}>{type}</button>)}</div>
      </div>}
      {quiz.questions.map((q, i) => <fieldset key={q.question} className="question"><legend><span>{i + 1}</span>{q.question}</legend>{q.options.map((option, oi) => <label className={`${submitted ? oi === q.answer ? "correct" : answers[i] === oi ? "incorrect" : "" : ""}`} key={option}><input type="radio" name={`q-${i}`} checked={answers[i] === oi} onChange={() => !submitted && setAnswers((a) => ({ ...a, [i]: oi }))} />{option}{submitted && oi === q.answer && <b>Correct</b>}</label>)}{submitted && <p className="explanation">{q.explanation}</p>}</fieldset>)}
      {!submitted ? <button type="button" className="button primary" disabled={Object.keys(answers).length < quiz.questions.length} onClick={submitQuiz}>Check my answers</button> : <div className="score-panel"><span>SCORE</span><strong>{score} / {quiz.questions.length}</strong><p>{perfectScore ? "🎉 Great work! You answered all questions correctly. No weak area was detected in this quiz." : `Good start. Review ${quiz.review} next.`}</p><div className="knowledge-row"><b>{quiz.title.replace(/\s+quick quiz$/i, "")} · Check</b>{perfectScore ? <b>No weak area detected</b> : <b>{quiz.review} · Review</b>}</div>{!perfectScore && <button type="button" className="button primary" onClick={onReview}>Review weak area →</button>}<button type="button" className="button primary" onClick={() => { setAnswers({}); setSubmitted(false); }}>{perfectScore ? "Practice harder questions" : "Try again"}</button><button type="button" className="button" onClick={onReview}>{perfectScore ? "Review key points" : "Explain differently"}</button></div>}
    </section>
  );
}

function LearnPage({ lessonInput, setLessonInput, result, lessonAnalysis, loading, stage, runAction, showQuiz, setShowQuiz, onQuizComplete }: { lessonInput: string; setLessonInput: (v: string) => void; result: LessonResult | null; lessonAnalysis: LessonAnalysis | null; loading: boolean; stage: number; runAction: (a: string) => void; showQuiz: boolean; setShowQuiz: (v: boolean) => void; onQuizComplete: (attempt: QuizAttempt) => void }) {
  const [action, setAction] = useState("Simplify");
  const run = (a = action) => { setAction(a); runAction(a); setShowQuiz(false); };
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> CORE LEARNING TOOL</span><h2>Explain my lesson</h2><p>Paste a question, paragraph, or topic. Padhai Yatra first checks your books, then gives a clear explanation that matches your learning style.</p></section><section className="composer-card"><label htmlFor="lesson-material">Your learning material</label><textarea id="lesson-material" value={lessonInput} onChange={(e) => setLessonInput(e.target.value)} placeholder="Paste a lesson, notes, textbook paragraph, or topic here…" /><div className="sample-row"><button onClick={() => setLessonInput(demoLesson)}>Use photosynthesis example</button><span>{lessonInput.length} characters</span></div><div className="action-tabs" role="group" aria-label="Explanation style">{["Simplify", "Explain differently", "Give example", "Show key points", "Break into steps"].map((a) => <button className={action === a ? "active" : ""} onClick={() => setAction(a)} key={a}>{a}</button>)}</div><button className="button primary large" disabled={!lessonInput.trim() || loading} onClick={() => run()}>Explain for me</button></section>{loading && <LoadingPanel stage={stage} />}{result && !loading && !showQuiz && <LessonResultCard result={result} action={action} onAction={run} onQuiz={() => setShowQuiz(true)} />}{showQuiz && <QuizCard lessonInput={lessonInput} lessonResult={result} lessonAnalysis={lessonAnalysis} onReview={() => { setShowQuiz(false); run("Explain deeply"); }} onComplete={onQuizComplete} />}</div>;
}

function AssignmentsPage({ calm }: { calm: boolean }) {
  const [text, setText] = useState("");
  const [tasks, setTasks] = useState<AssignmentTask[]>([]);
  const [photo, setPhoto] = useState<{ name: string; dataUrl: string } | null>(null);
  const [detectedHomework, setDetectedHomework] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [oneTask, setOneTask] = useState(false);
  const current = Math.max(0, tasks.findIndex((t) => !t.done));
  const completed = tasks.filter((t) => t.done).length;
  async function addPhoto(file?: File) {
    if (!file) return;
    setPhoto({ name: file.name, dataUrl: await readFileAsDataUrl(file) });
    setTasks([]);
    setAnswer("");
    setDetectedHomework("");
  }
  async function generate() {
    setLoading(true);
    setOneTask(false);
    try {
      const response = await fetch("/api/assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, imageData: photo?.dataUrl }),
      });
      if (!response.ok) throw new Error("Assignment failed");
      const data = await response.json() as AssignmentResponse;
      setDetectedHomework(data.detectedHomework || "");
      setAnswer(data.answer || "");
      setTasks((data.tasks || []).map((task) => ({ ...task, done: false })));
    } catch {
      setDetectedHomework(text || (photo ? "Homework photo attached" : ""));
      setAnswer("Padhai Yatra could not read this assignment yet. Try typing the question or retaking a clearer photo.");
      setTasks(initialTasks);
    } finally {
      setLoading(false);
    }
  }
  function toggle(i: number) { setTasks((list) => list.map((t, ti) => ti === i ? { ...t, done: !t.done } : t)); }
  if ((oneTask || calm) && tasks.length) {
    const task = tasks[current] || tasks[tasks.length - 1];
    return <div className="page-content one-task-page"><span className="eyebrow"><i /> ONE TASK MODE</span><div className="one-task-card"><span>CURRENT TASK · {Math.min(current + 1, tasks.length)} OF {tasks.length}</span><div className="one-icon">{task.done ? "✓" : "▤"}</div><h2>{task.done ? "All tasks complete" : task.title}</h2><p>Estimated time: <b>{task.minutes} minutes</b></p><div className="one-progress"><i style={{ width: `${(completed / tasks.length) * 100}%` }} /></div><small>{completed} of {tasks.length} complete</small><div className="one-actions"><button className="button" onClick={() => setOneTask(false)}>See full plan</button><button className="button">Need help</button><button className="button">Take break</button>{!task.done && <button className="button primary" onClick={() => toggle(current)}>Complete task ✓</button>}</div></div></div>;
  }
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> ASSIGNMENT SUPPORT</span><h2>Break my assignment</h2><p>Turn a large instruction into clear, manageable steps with realistic time estimates.</p></section><section className="composer-card"><label htmlFor="assignment">Paste your assignment</label><textarea id="assignment" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the homework, project instructions, or study task here..." /><div className="photo-upload-row"><label className="photo-upload"><input type="file" accept="image/*" onChange={(e) => addPhoto(e.target.files?.[0])} /><span>Attach homework photo</span></label>{photo && <div className="photo-preview"><img src={photo.dataUrl} alt={`Attached homework photo: ${photo.name}`} /><div><b>{photo.name}</b><button onClick={() => { setPhoto(null); setAnswer(""); setDetectedHomework(""); }}>Remove photo</button></div></div>}</div><button className="button primary large" disabled={(!text.trim() && !photo) || loading} onClick={generate}>{loading ? "Reading homework…" : photo ? "Read photo and create plan →" : "Create step-by-step plan →"}</button></section>{(detectedHomework || answer) && !loading && <section className="assignment-answer"><span className="eyebrow"><i /> HOMEWORK READ</span>{detectedHomework && <p>{detectedHomework}</p>}{answer && <b>{answer}</b>}</section>}{tasks.length > 0 && !loading && <section className="assignment-plan"><div className="card-title"><div><span className="eyebrow"><i /> YOUR ASSIGNMENT PLAN</span><h2>{completed} / {tasks.length} completed</h2></div><button className="button" onClick={() => setOneTask(true)}>Enter one task mode</button></div><div className="progress-track"><i style={{ width: `${(completed / tasks.length) * 100}%` }} /></div><div className="task-list">{tasks.map((task, i) => <label className={task.done ? "done" : ""} key={`${task.title}-${i}`}><input type="checkbox" checked={task.done} onChange={() => toggle(i)} /><span>{task.done ? "✓" : i + 1}</span><div><b>{task.title}</b><small>{task.minutes} minutes</small></div></label>)}</div></section>}</div>;
}

function PlannerPage() {
  const [subject, setSubject] = useState("");
  const [timeAmount, setTimeAmount] = useState(60);
  const [timeUnit, setTimeUnit] = useState<"minutes" | "hours" | "days" | "weeks">("minutes");
  const [exam, setExam] = useState("Tomorrow");
  const [topics, setTopics] = useState("");
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState<number[]>([]);
  const topicList = (topics || subject || "Main topic").split(/,|\n/).map((topic) => topic.trim()).filter(Boolean);
  const focusTopics = topicList.length ? topicList : [subject || "Main topic"];
  const planSubject = subject.trim() || focusTopics[0] || "Study plan";
  const totalMinutes = timeUnit === "minutes" ? timeAmount : timeUnit === "hours" ? timeAmount * 60 : timeUnit === "days" ? timeAmount * 120 : timeAmount * 5 * 120;
  const planLabel = `${timeAmount} ${timeUnit}`;
  const slots = totalMinutes <= 180
    ? [["0-15 min", focusTopics[0], "Review foundations"], ["15-35 min", focusTopics[1] || focusTopics[0], "Practice examples"], ["35-40 min", "Short break", "Reset"], ["40-55 min", focusTopics[2] || focusTopics[0], "Solve questions"], ["55-60 min", "Mini quiz", "Check understanding"]]
    : [["Day 1", focusTopics[0], "Learn the basics"], ["Day 2", focusTopics[1] || focusTopics[0], "Practice core questions"], ["Middle", focusTopics[2] || focusTopics[0], "Fix weak areas"], ["Before exam", "Mock quiz", "Check speed and accuracy"], ["Final review", "Key points", "Revise lightly"]];
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> STUDY PLANNER</span><h2>Plan around the time you have.</h2><p>A focused plan with breaks, priorities, and a clear finish line.</p></section><section className="planner-grid"><form className="form-card" onSubmit={(e) => { e.preventDefault(); setDone([]); setReady(true); }}><label>What are you studying?<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Maths, accounting, science..." /></label><label>How much time do you have?<div className="time-picker"><input type="number" min="1" value={timeAmount} onChange={(e) => setTimeAmount(Math.max(1, Number(e.target.value) || 1))} /><select value={timeUnit} onChange={(e) => setTimeUnit(e.target.value as "minutes" | "hours" | "days" | "weeks")}><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option></select></div></label><label>When is your exam?<select value={exam} onChange={(e) => setExam(e.target.value)}><option>Tomorrow</option><option>This week</option><option>Next week</option><option>In a few weeks</option></select></label><label>Topics<textarea value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="Algebra, fractions, word problems..." /></label><button className="button primary large" type="submit">Build my plan →</button></form><aside className="rescue-card"><span>SMART TIME PLAN</span><h3>{planLabel}</h3><p>Padhai Yatra will spread work based on whether you have minutes, hours, days, or weeks.</p>{focusTopics.slice(0, 3).map((topic, i) => <div key={`${topic}-${i}`}><b>{topic}</b><small>{i === 0 ? "Focus first" : i === 1 ? "Practice next" : "Quick refresh"}</small></div>)}</aside></section>{ready && <section className="generated-plan"><div className="card-title"><div><span className="eyebrow"><i /> {planLabel.toUpperCase()} PLAN</span><h2>{planSubject} · {exam}</h2></div><span className="preference-chip">Based on your learning style</span></div>{slots.map((s, i) => <button type="button" className={done.includes(i) ? "done" : ""} onClick={() => setDone((d) => d.includes(i) ? d.filter((x) => x !== i) : [...d, i])} key={`${s[0]}-${s[1]}`}><span>{done.includes(i) ? "✓" : i + 1}</span><b>{s[0]}</b><div><strong>{s[1]}</strong><small>{s[2]}</small></div></button>)}</section>}</div>;
}

function FlashcardsPage({ lessonInput, lessonResult }: { lessonInput: string; lessonResult: LessonResult | null }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [review, setReview] = useState<number[]>([]);
  const cards = useMemo(() => makeFlashcards(lessonInput, lessonResult), [lessonInput, lessonResult]);
  const topic = getLessonTopic(lessonInput, lessonResult);
  const card = cards[index] || cards[0];
  function go(next: number) { setIndex((next + cards.length) % cards.length); setFlipped(false); }
  return <div className="page-content center-page"><section className="page-intro"><span className="eyebrow"><i /> FLASHCARDS</span><h2>{topic} essentials</h2><p>Card {index + 1} of {cards.length} · {review.length} marked for review</p></section><button className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)} aria-label="Flip flashcard"><span>{flipped ? "ANSWER" : "QUESTION"}</span><h2>{flipped ? card.back : card.front}</h2><small>Click to {flipped ? "see question" : "flip"}</small></button><div className="flash-actions"><button className="button" onClick={() => go(index - 1)}>Previous</button><button className="button" onClick={() => setReview((r) => r.includes(index) ? r : [...r, index])}>Review again</button><button className="button primary" onClick={() => go(index + 1)}>Know it · Next</button></div></div>;
}

function FocusPage({ lessonInput, lessonResult, focusState, setFocusState, onSessionComplete }: { lessonInput: string; lessonResult: LessonResult | null; focusState: FocusState; setFocusState: (value: FocusState | ((current: FocusState) => FocusState)) => void; onSessionComplete: (session: StudySession) => void }) {
  const topic = getLessonTopic(lessonInput, lessonResult);
  const [motivation, setMotivation] = useState("");
  useEffect(() => {
    if (!focusState.running || focusState.seconds <= 0) return;
    const timer = window.setInterval(() => {
      setFocusState((current) => {
        if (!current.running || current.seconds <= 1) {
          // Chime and a line of encouragement the moment the timer lands on zero.
          playFocusChime();
          setMotivation(focusMotivations[Math.floor(Math.random() * focusMotivations.length)]);
          if (current.mode === "focus") {
            const endedAt = new Date();
            const durationSeconds = current.duration * 60;
            onSessionComplete({
              id: `${endedAt.toISOString()}-${topic}`,
              subject: topic.split(/\s+/)[0] || "Study",
              topic,
              date: endedAt.toISOString().slice(0, 10),
              startedAt: new Date(endedAt.getTime() - durationSeconds * 1000).toISOString(),
              endedAt: endedAt.toISOString(),
              durationSeconds,
            });
          }
          return { ...current, seconds: 0, running: false };
        }
        return { ...current, seconds: current.seconds - 1 };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusState.running, focusState.seconds, onSessionComplete, setFocusState, topic]);
  function select(n: number) { setFocusState({ mode: "focus", duration: n, seconds: n * 60, running: false, savedFocusDuration: undefined, savedFocusSeconds: undefined }); }
  const display = `${String(Math.floor(focusState.seconds / 60)).padStart(2, "0")}:${String(focusState.seconds % 60).padStart(2, "0")}`;
  const label = focusState.mode === "break" ? "BREAK" : "CURRENT TASK";
  const title = focusState.mode === "break" ? "Take a break" : `Learn ${topic}`;
  return <div className="page-content focus-page"><span className="eyebrow"><i /> FOCUS MODE</span><section className="focus-card"><span>{label}</span><h2>{title}</h2><div className="timer-ring" style={{ "--progress": `${(focusState.seconds / (focusState.duration * 60 || 1)) * 360}deg` } as React.CSSProperties}><div><strong>{display}</strong><small>{focusState.running ? "You are doing well" : focusState.seconds === 0 ? "Session complete" : "Ready when you are"}</small></div></div><div className="duration-row">{[10, 15, 20, 25].map((n) => <button className={focusState.mode === "focus" && focusState.duration === n ? "active" : ""} onClick={() => select(n)} key={n}>{n} min</button>)}</div><div className="focus-actions"><button className="button" onClick={() => setFocusState((current) => current.mode === "break" ? { ...current, running: false, seconds: current.duration * 60 } : { ...current, running: false, seconds: current.duration * 60, savedFocusDuration: undefined, savedFocusSeconds: undefined })}>Reset</button><button className="button primary large" onClick={() => setFocusState((current) => ({ ...current, running: !current.running }))}>{focusState.running ? "Pause" : focusState.seconds === 0 ? "Start again" : focusState.mode === "break" ? "Resume break" : "Start focus"}</button><button className="button" onClick={() => setFocusState((current) => current.mode === "break" ? { mode: "focus", duration: current.savedFocusDuration || 15, seconds: current.savedFocusSeconds || (current.savedFocusDuration || 15) * 60, running: false } : { mode: "break", duration: 5, seconds: 5 * 60, running: false, savedFocusDuration: current.duration, savedFocusSeconds: current.seconds })}>{focusState.mode === "break" ? "Resume focus" : "Take break"}</button></div>{focusState.seconds === 0 && <p className="gentle-message">🔔 {motivation || "Nice work. Would you like to continue or take a break?"}</p>}</section></div>;
}

function RoutinePage() {
  const defaultRoutine: RoutineItem[] = [
    { label: "DONE", subject: "Mathematics", time: "9:00 AM", detail: "Linear equations" },
    { label: "NOW", subject: "Science", time: "10:00 AM", detail: "Photosynthesis" },
    { label: "NEXT", subject: "Break", time: "10:45 AM", detail: "15 minutes" },
    { label: "LATER", subject: "English", time: "11:00 AM", detail: "Essay outline" },
  ];
  const [routine, setRoutine] = useState<RoutineItem[]>(() => readStoredJson(ROUTINE_KEY, defaultRoutine));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    localStorage.setItem(ROUTINE_KEY, JSON.stringify(routine));
  }, [routine]);
  function updateRoutine(index: number, key: keyof RoutineItem, value: string) {
    setRoutine((items) => items.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> TODAY’S ROUTINE</span><h2>Know what&apos;s now and what&apos;s next.</h2><p>Edit the routine for Anuj&apos;s real day. It is saved on this browser.</p></section><section className="routine-layout"><div className="routine-card">{routine.map((item, index) => <div className={`routine-item ${item.label.toLowerCase()}`} key={`${item.label}-${index}`}>{editing ? <><input value={item.label} onChange={(e) => updateRoutine(index, "label", e.target.value)} aria-label="Routine label" /><input value={item.subject} onChange={(e) => updateRoutine(index, "subject", e.target.value)} aria-label="Routine subject" /><input value={item.time} onChange={(e) => updateRoutine(index, "time", e.target.value)} aria-label="Routine time" /><input value={item.detail} onChange={(e) => updateRoutine(index, "detail", e.target.value)} aria-label="Routine detail" /></> : <><span>{item.label}</span><b>{item.subject}</b><small>{item.time} · {item.detail}</small></>}</div>)}</div><aside className="change-card"><span>EDITABLE ROUTINE</span><h3>{editing ? "Editing schedule" : "Need to change the plan?"}</h3><p>{editing ? "Change subject, time, and details. Your edits save automatically." : "Use edit mode to make this match Anuj’s real school or hackathon day."}</p><button className="button primary" onClick={() => setEditing((value) => !value)}>{editing ? "Done editing" : "Edit routine"}</button><button className="button" onClick={() => setRoutine(defaultRoutine)}>Reset demo routine</button></aside></section></div>;
}

function CommunicatePage() {
  const choices = [
    { label: "I don’t understand", icon: "😕", short: "I’m stuck. Can you explain this another way?", clear: "I’m having trouble understanding this part. Could you explain it another way with an example?", formal: "I am having difficulty understanding this part. Would you please explain it again using a clear example?" },
    { label: "Please explain differently", icon: "🔁", short: "Can you explain it differently?", clear: "The first explanation did not click for me. Could you explain it in a different way?", formal: "The current explanation is not clear to me yet. Would you please explain it using a different approach?" },
    { label: "Please go slower", icon: "🐢", short: "Can we go slower?", clear: "Could we go through this more slowly, one step at a time?", formal: "Would it be possible to go through this more slowly and step by step?" },
    { label: "I need help with this question", icon: "❓", short: "Can you help me with this question?", clear: "I tried this question, but I’m not sure what to do next. Could you guide me through the first step?", formal: "I attempted this question, but I am unsure how to continue. Would you please help me with the first step?" },
    { label: "I need a short break", icon: "⏸", short: "Can I take a short break?", clear: "I need a short break so I can come back and focus better.", formal: "May I take a short break and then continue the task?" },
    { label: "It’s hard to focus right now", icon: "◌", short: "I’m finding it hard to focus.", clear: "I’m finding it hard to focus right now. Could you help me choose one small thing to start with?", formal: "I am finding it difficult to focus right now. Would you please help me identify one manageable first step?" },
    { label: "This task feels too big", icon: "▦", short: "This task feels too big.", clear: "This task feels too big right now. Could you help me break it into smaller steps?", formal: "This task feels overwhelming to me. Would you please help me divide it into smaller steps?" },
    { label: "I don’t know where to start", icon: "▶", short: "I don’t know where to start.", clear: "I don’t know where to start. Could you tell me the first step I should do?", formal: "I am unsure where to begin. Would you please tell me the first step I should complete?" },
    { label: "I’m feeling overwhelmed", icon: "🌿", short: "I’m overwhelmed. I need a smaller step.", clear: "I’m feeling overwhelmed. Could we make this into one small next step?", formal: "I am feeling overwhelmed. Would you please help me focus on one small next step?" },
  ];
  const [choice, setChoice] = useState(choices[0].label);
  const [tone, setTone] = useState<"Short" | "Clear" | "Formal">("Clear");
  const [copied, setCopied] = useState(false);
  const selected = choices.find((item) => item.label === choice) || choices[0];
  const message = tone === "Short" ? selected.short : tone === "Formal" ? selected.formal : selected.clear;
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> HELP ME COMMUNICATE</span><h2>Find the words for what you need.</h2><p>Choose what fits right now. Padhai Yatra will help you create a respectful message for a teacher.</p></section><section className="communication-grid"><div className="choice-list">{choices.map((item) => <button className={choice === item.label ? "active" : ""} onClick={() => setChoice(item.label)} key={item.label}><span>{item.icon}</span>{item.label}<i>→</i></button>)}</div><article className="message-card"><span className="eyebrow"><i /> SUGGESTED MESSAGE</span><h3>{choice}</h3><blockquote>“{message}”</blockquote><div className="tone-row">{["Short", "Clear", "Formal"].map((t) => <button className={tone === t ? "active" : ""} onClick={() => setTone(t as "Short" | "Clear" | "Formal")} key={t}>{t === "Short" ? "Make shorter" : t === "Formal" ? "Make more formal" : "Make simpler"}</button>)}</div><button className="button primary" onClick={async () => { await navigator.clipboard?.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied ✓" : "Copy message"}</button></article></section></div>;
}

function StudyTogetherPage({ currentUser, setView, setLessonInput }: { currentUser: StudentAccount; setView: (view: View) => void; setLessonInput: (value: string) => void }) {
  // A friend arriving on an invite link lands straight in that room.
  const joinedRoom = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (!room) return null;
    return { room, topic: params.get("topic") || "", mode: params.get("mode") === "Study" ? "Study" as const : "Competition" as const };
  }, []);
  const [topic, setTopic] = useState(joinedRoom?.topic || "Accounting basics");
  const [roomMode, setRoomMode] = useState<"Study" | "Competition">(joinedRoom?.mode || "Competition");
  const [friendEmail, setFriendEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [friends, setFriends] = useState<string[]>(() => readStoredJson("padhai-yatra-study-friends-v1", []));
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<{ id: string; from: string; text: string; time: string }[]>(() => readStoredJson("padhai-yatra-study-messages-v1", [
    { id: "welcome", from: "Padhai Yatra", text: "Create a topic, invite friends, then start a group quiz together.", time: new Date().toISOString() },
  ]));
  const [participants, setParticipants] = useState<{ name: string; email: string }[]>([]);
  const [roomLive, setRoomLive] = useState(false);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  // The room code identifies the shared channel, so it must be identical for everyone
  // in it. The old code folded in friends.length, which changed as people were added
  // and silently put the host and the guest in two different rooms.
  const roomCode = useMemo(() => {
    if (joinedRoom?.room) return joinedRoom.room;
    const slug = (topic || "ROOM").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "ROOM";
    return `PY-${slug}`;
  }, [joinedRoom, topic]);
  // Point at the running app, not the source repo — a friend opening this needs the room.
  const appOrigin = typeof window === "undefined" ? "http://localhost:3002" : window.location.origin;
  const inviteLink = `${appOrigin}/?room=${encodeURIComponent(roomCode)}&topic=${encodeURIComponent(topic || "study-room")}&mode=${encodeURIComponent(roomMode)}`;
  useEffect(() => { localStorage.setItem("padhai-yatra-study-friends-v1", JSON.stringify(friends)); }, [friends]);
  useEffect(() => { localStorage.setItem("padhai-yatra-study-messages-v1", JSON.stringify(messages)); }, [messages]);

  // Live room over Supabase Realtime. Presence gives a real "who is here" list and
  // broadcast shares chat, so both people see the same room. This uses only the
  // publishable key — no server secret, no RLS, and no Supabase session required,
  // which matters because accounts fall back to device-local when email is down.
  useEffect(() => {
    const client = supabase;
    if (!client || !roomCode) return;
    const channel = client.channel(`study-room-${roomCode}`, {
      config: { presence: { key: currentUser.email || currentUser.name } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string; email: string }>();
        const people = Object.values(state)
          .flat()
          .map((entry) => ({ name: entry.name, email: entry.email }));
        // De-duplicate: the same person in two tabs is still one participant.
        const unique = new Map(people.map((person) => [person.email || person.name, person]));
        setParticipants([...unique.values()]);
      })
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const incoming = payload as { from: string; text: string; time: string; id: string };
        setMessages((current) => current.some((m) => m.id === incoming.id)
          ? current
          : [incoming, ...current].slice(0, 40));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setRoomLive(true);
          await channel.track({ name: currentUser.name, email: currentUser.email });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRoomLive(false);
        }
      });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      setRoomLive(false);
      client.removeChannel(channel);
    };
  }, [roomCode, currentUser.email, currentUser.name]);
  const invite = async () => {
    const clean = friendEmail.trim().toLowerCase();
    if (!clean.includes("@")) {
      setInviteStatus("Enter a valid friend email first.");
      return;
    }
    setFriends((current) => current.includes(clean) ? current : [clean, ...current].slice(0, 12));
    setMessages((current) => [{ id: `invite-${clean}-${new Date().toISOString()}`, from: currentUser.name, text: `Invited ${clean} to ${roomMode.toLowerCase()} room "${topic}".`, time: new Date().toISOString() }, ...current].slice(0, 40));
    setFriendEmail("");

    // The friend is in the room the moment they have the link, so put it on the
    // clipboard first. Email delivery is a bonus, never the thing that blocks an invite.
    let copied = false;
    try {
      await navigator.clipboard?.writeText(inviteLink);
      copied = true;
    } catch {
      /* clipboard can need a user gesture; the link is shown on screen regardless */
    }
    setInviteStatus(copied
      ? `Invite link for ${clean} copied — paste it to them on WhatsApp, Messenger, or email.`
      : `Invite ready for ${clean}. Use “Copy invite link” below and send it to them.`);

    // Best-effort extras: record the room server-side and try the mailer.
    if (!supabase) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (userId) {
        const { data: room } = await supabase
          .from("study_rooms")
          .upsert({ owner_id: userId, room_code: roomCode, topic, mode: roomMode }, { onConflict: "room_code" })
          .select("id")
          .single();
        if (room?.id) {
          await supabase.from("study_invites").insert({ room_id: room.id, inviter_id: userId, invitee_email: clean });
        }
      }
      const { data: functionData, error: functionError } = await supabase.functions.invoke("send-study-invite", {
        body: { email: clean, topic, roomCode, roomMode, inviteLink, inviterName: currentUser.name },
      });
      const result = functionData as { ok?: boolean; message?: string } | null;
      if (!functionError && result?.ok) {
        setInviteStatus(`Invite emailed to ${clean} — the link is also on your clipboard.`);
      }
      // A mailer failure is expected until SUPABASE_SECRET_KEY is filled in. The link
      // above already works, so don't replace it with an edge-function error.
    } catch {
      /* the shareable link is the invite; server-side extras are optional */
    }
  };
  const send = () => {
    if (!message.trim()) return;
    const entry = {
      id: `${currentUser.email || currentUser.name}-${new Date().toISOString()}-${message.trim().slice(0, 12)}`,
      from: currentUser.name,
      text: message.trim(),
      time: new Date().toISOString(),
    };
    setMessages((current) => [entry, ...current].slice(0, 40));
    setMessage("");
    // Push to everyone else in the room. Falls back to a local-only message if the
    // channel is not connected, so chat still works offline.
    channelRef.current?.send({ type: "broadcast", event: "chat", payload: entry });
  };
  const startQuiz = () => {
    setLessonInput(`${topic.trim() || "Grade 11 study topic"} group ${roomMode.toLowerCase()} quiz`);
    setView("quiz");
  };
  // People actually connected to the room right now, then anyone invited but not yet here.
  const liveEmails = new Set(participants.map((person) => person.email));
  const roster = [
    ...participants.map((person) => ({ player: person.name || person.email, detail: person.email, status: "In room" })),
    ...friends.filter((email) => !liveEmails.has(email)).map((email) => ({ player: email, detail: "", status: "Invited" })),
  ].slice(0, 8);
  return (
    <div className="page-content work-page">
      <section className="page-intro">
        <span className="eyebrow"><i /> STUDY TOGETHER</span>
        <h2>Invite friends and learn as a group.</h2>
        <p>Create a shared study topic, invite classmates, chat about what to cover, and jump into a quiz together.</p>
      </section>
      <section className="study-room-grid">
        <article className="study-room-card main">
          <span className="eyebrow"><i /> ROOM SETUP</span>
          <label>Study topic<input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Accounting basics, demand curve, chemistry..." /></label>
          <div className="room-mode" role="group" aria-label="Room mode">{(["Competition", "Study"] as const).map((mode) => <button type="button" className={roomMode === mode ? "active" : ""} onClick={() => setRoomMode(mode)} key={mode}>{mode}</button>)}</div>
          <label>Invite friend by email<div className="inline-form"><input value={friendEmail} onChange={(e) => setFriendEmail(e.target.value)} type="email" placeholder="friend@email.com" /><button className="button primary" type="button" onClick={invite}>Send invite</button></div></label>
          {inviteStatus && <p className="invite-status">{inviteStatus}</p>}
          <div className="invite-link-box"><span>Room code: {joinedRoom?.room || roomCode}</span><code>{inviteLink}</code><button className="button" onClick={async () => { await navigator.clipboard?.writeText(inviteLink); setInviteStatus("Invite link copied. Send it to your friend."); }}>Copy invite link</button></div>
          <div className="room-actions"><button className="button primary large" onClick={startQuiz}>Start same quiz for everyone →</button><button className="button large" onClick={() => setView("focus")}>Start group focus</button></div>
        </article>
        <article className="study-room-card">
          <span className="eyebrow"><i /> IN THIS ROOM {roomLive && <em className="live-dot" title="Live room connected" />}</span>
          <div className="friend-list">
            {roster.length ? roster.map((person) => <div key={`${person.player}-${person.status}`}><span className="avatar">{(person.player || "?")[0]?.toUpperCase()}</span><b>{person.player}</b><small>{person.status === "In room" ? "● In room now" : "Invited"}</small></div>) : <p>No one here yet. Invite a friend and they will appear the moment they open the link.</p>}
          </div>
        </article>
        <article className="study-room-card chat">
          <span className="eyebrow"><i /> GROUP CONVERSATION</span>
          <div className="inline-form"><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a study message..." /><button className="button primary" onClick={send}>Send</button></div>
          <div className="message-list">
            {messages.map((item, index) => <div key={item.id || `${item.time}-${index}`}><b>{item.from}</b><p>{item.text}</p><small>{new Date(item.time).toLocaleTimeString()}</small></div>)}
          </div>
        </article>
        <article className="study-room-card">
          <span className="eyebrow"><i /> LIVE SCOREBOARD</span>
          <div className="leaderboard-list">
            {roster.map((row, index) => <div key={`${row.player}-score`}><b>#{index + 1}</b><span>{row.player}</span><strong>{row.status === "In room" ? "Ready" : "—"}</strong><small>{row.status}</small></div>)}
          </div>
        </article>
      </section>
    </div>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!minutes) return "0m";
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

function ProgressPage({ sessions, quizAttempts }: { sessions: StudySession[]; quizAttempts: QuizAttempt[] }) {
  const xp = totalXp(quizAttempts);
  const rank = rankForXp(xp);
  const xpDays = dailyXp(quizAttempts, 7);
  const maxXpBar = Math.max(1, ...xpDays.map((day) => day.xp));
  const todayXp = xpDays[xpDays.length - 1]?.xp || 0;
  const yesterdayXp = xpDays[xpDays.length - 2]?.xp || 0;
  const growth = todayXp - yesterdayXp;
  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((session) => session.date === today);
  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const todaySeconds = todaySessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const topics = [...new Set(sessions.map((session) => session.topic))];
  const weekBars = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return sessions.filter((session) => session.date === key).reduce((sum, session) => sum + Math.round(session.durationSeconds / 60), 0);
  });
  const maxBar = Math.max(1, ...weekBars);
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> REAL STUDY TRACKING</span><h2>Track Anuj&apos;s real focus time.</h2><p>These numbers come from completed Focus sessions and quizzes on this browser. No fake demo progress is shown.</p></section>
    <section className="rank-card">
      <div className="rank-badge"><span>{rank.icon}</span><div><span className="eyebrow"><i /> STUDENT LEVEL {rank.level}</span><h2>{rank.name}</h2><p>{xp} XP earned from {quizAttempts.length} quiz{quizAttempts.length === 1 ? "" : "zes"}</p></div></div>
      <div className="rank-track"><i><em style={{ width: `${rank.percent}%` }} /></i><small>{rank.next ? `${rank.toNext} XP to ${rank.next.name} ${rank.next.icon}` : "Top rank reached 🏆"}</small></div>
      <div className="rank-growth"><b>{growth > 0 ? `▲ +${growth} XP` : growth < 0 ? `▼ ${growth} XP` : "No change"}</b><small>vs yesterday · {todayXp} XP today</small></div>
    </section>
    <section className="xp-week-card"><span className="eyebrow"><i /> DAILY GROWTH</span><h3>XP earned each day</h3><div className="bars">{xpDays.map((day, i) => <i style={{ height: `${Math.max(6, (day.xp / maxXpBar) * 100)}%` }} key={`${day.key}-${i}`} title={`${day.xp} XP on ${day.key}`}><small>{day.label}</small></i>)}</div><p>{quizAttempts.length ? "Each correct answer is 20 XP. A perfect quiz adds 30 bonus XP." : "Finish a quiz to start earning XP and climbing ranks."}</p></section>
    <section className="stats-grid"><StatCard label="Total XP" value={String(xp)} note={`${rank.name} · level ${rank.level}`} icon="✦" /><StatCard label="Topics studied" value={String(topics.length)} note="From focus sessions" icon="▤" /><StatCard label="Study time" value={formatDuration(totalSeconds)} note={`Today: ${formatDuration(todaySeconds)}`} icon="◷" /><StatCard label="Sessions completed" value={String(sessions.length)} note="Completed timers" icon="⚡" /><StatCard label="Today" value={formatDuration(todaySeconds)} note="Tracked today" icon="✓" /></section><section className="progress-layout"><article className="topic-progress"><div className="card-title"><div><span className="eyebrow"><i /> STUDY HISTORY</span><h2>Recent tracked sessions</h2></div></div>{sessions.length ? sessions.slice(0, 8).map((session) => <div key={session.id}><span><b>{session.subject}</b><small>{session.topic} · {session.date}</small></span><strong>{formatDuration(session.durationSeconds)}</strong><i><em style={{ width: `${Math.min(100, Math.max(8, Math.round(session.durationSeconds / 60)))}%` }} /></i></div>) : <div><span><b>No real study time tracked yet</b><small>Complete a Focus session to add history.</small></span><strong>0m</strong><i><em style={{ width: "0%" }} /></i></div>}</article><article className="week-card"><span>LAST 7 DAYS</span><h3>{formatDuration(weekBars.reduce((sum, minutes) => sum + minutes * 60, 0))}</h3><div className="bars">{weekBars.map((minutes, i) => <i style={{ height: `${Math.max(6, (minutes / maxBar) * 100)}%` }} key={`${minutes}-${i}`} title={`${minutes} minutes`}><small>{["S", "M", "T", "W", "T", "F", "S"][i]}</small></i>)}</div><p>{sessions.length ? "Tap/hover bars to see minutes for each day." : "Start and finish a Focus timer to begin tracking."}</p></article></section></div>;
}

function ResourcesPage({ setLessonInput, setView }: { setLessonInput: (v: string) => void; setView: (v: View) => void }) {
  const [books, setBooks] = useState<BookLibraryItem[]>(
    grade11Materials.map((material) => ({
      id: material.subject,
      subject: material.subject,
      title: material.title,
      status: material.kind === "Included PDF" ? "Indexed" : "Not Indexed",
      fileUrl: material.kind === "Included PDF" ? material.href : null,
      sourceUrl: material.kind === "Included PDF" ? material.href : material.href,
      canOpen: true,
      canReplace: true,
      canRemove: material.kind === "Included PDF",
    })),
  );
  const [message, setMessage] = useState("Upload a PDF to index a subject, or open a source to start reading.");
  const [busySubject, setBusySubject] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/books")
      .then((response) => response.json())
      .then((data: { books?: BookLibraryItem[] }) => {
        if (cancelled || !data.books) return;
        const bySubject = new Map(data.books.map((book) => [book.subject.toLowerCase(), book]));
        setBooks((current) => current.map((book) => {
          const serverBook = bySubject.get(book.subject.toLowerCase());
          if (!serverBook) return book;
          const bundledPdf = book.fileUrl?.startsWith("/study_materials/");
          if (bundledPdf && serverBook.status === "Not Indexed") return book;
          return serverBook;
        }));
      })
      .catch(() => {
        if (!cancelled) setMessage("The book list is ready, but the local index endpoint could not be reached.");
      });
    return () => { cancelled = true; };
  }, []);

  function handleMaterial(subject: string, title: string) {
    setLessonInput(`Use the ${subject} textbook (${title}) as the reference. Paste a topic, paragraph, or homework question from this book and Padhai Yatra will answer from the book first.`);
    setView("learn");
  }

  async function refreshBooks() {
    const response = await fetch("/api/books");
    if (!response.ok) throw new Error("Unable to refresh books");
    const data = await response.json() as { books?: BookLibraryItem[] };
    if (data.books) {
      setBooks((current) => {
        const bySubject = new Map(data.books!.map((book) => [book.subject.toLowerCase(), book]));
        return current.map((book) => {
          const serverBook = bySubject.get(book.subject.toLowerCase());
          if (!serverBook) return book;
          const bundledPdf = book.fileUrl?.startsWith("/study_materials/");
          if (bundledPdf && serverBook.status === "Not Indexed") return book;
          return serverBook;
        });
      });
    }
  }

  async function uploadBook(book: BookLibraryItem, file?: File) {
    if (!file) return;
    setBusySubject(book.subject);
    setMessage(`Indexing ${book.subject}...`);
    try {
      const formData = new FormData();
      formData.append("subject", book.subject);
      formData.append("title", book.title);
      formData.append("file", file);
      const response = await fetch("/api/books", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Upload failed");
      await refreshBooks();
      setMessage(`${book.subject} is now indexed and ready for textbook-backed answers.`);
    } catch {
      setMessage(`Could not index ${book.subject} yet. Try a clearer PDF or upload it again.`);
    } finally {
      setBusySubject(null);
    }
  }

  async function removeBook(book: BookLibraryItem) {
    setBusySubject(book.subject);
    setMessage(`Removing ${book.subject} from local books...`);
    try {
      const response = await fetch(`/api/books?subject=${encodeURIComponent(book.subject)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Remove failed");
      await refreshBooks();
      setMessage(`${book.subject} was removed from the local textbook index.`);
    } catch {
      setMessage(`Could not remove ${book.subject} right now.`);
    } finally {
      setBusySubject(null);
    }
  }

  return (
    <div className="page-content work-page">
      <section className="page-intro">
        <span className="eyebrow"><i /> MY BOOKS</span>
        <h2>Textbooks connected to Padhai Yatra.</h2>
        <p>Upload a PDF to index it, open a source, or jump straight into a textbook-backed explanation.</p>
      </section>

      <section className="safety-card books-safety">
        <b>Book-first answering</b>
        <p>Padhai Yatra searches your textbook first. If a page match is found, the answer will say which book and pages were used. If not, it will clearly label the answer as general AI help.</p>
      </section>

      <section className="resource-grid">
        {books.map((book) => {
          const openHref = book.fileUrl || book.sourceUrl;
          return (
            <article className="resource-card" key={book.id}>
              <div>
                <span>{book.status}</span>
                <h3>{book.subject}</h3>
                <p>{book.title}</p>
              </div>
              <div className="resource-actions">
                {book.canOpen && openHref ? <a className="button" href={openHref} target="_blank" rel="noreferrer">Open Book</a> : <button className="button" disabled>Not indexed</button>}
                <button className="button primary" onClick={() => handleMaterial(book.subject, book.title)}>Use in Padhai Yatra</button>
                <label className={`button book-upload ${busySubject === book.subject ? "disabled" : ""}`}>
                  {busySubject === book.subject ? "Working…" : book.status === "Indexed" ? "Replace PDF" : "Add PDF"}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => uploadBook(book, e.target.files?.[0])}
                    disabled={busySubject === book.subject}
                  />
                </label>
                {book.canRemove && <button className="button" onClick={() => removeBook(book)} disabled={busySubject === book.subject}>Remove Book</button>}
              </div>
            </article>
          );
        })}
      </section>

      <div className="safety-card">
        <b>{message}</b>
        <p>Students can open books, upload PDFs, or paste a question from the book into Padhai Yatra. The app will try textbook pages first before falling back to general AI help.</p>
      </div>
    </div>
  );
}

function PreferencesPage({ preferences, setPreferences }: { preferences: Preferences; setPreferences: (p: Preferences) => void }) {
  const tools = ["Examples", "Step-by-step explanations", "Visual organization", "Practice questions", "Key points", "Flashcards", "Real-world examples"];
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreferences({ ...preferences, [key]: value });
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> MY LEARNING STYLE</span><h2>Choose what helps you learn.</h2><p>No medical questions. No labels. You can change these preferences at any time.</p></section><section className="preferences-form"><fieldset><legend>How do you prefer explanations?</legend><div className="segmented">{["Short & Simple", "Normal", "Detailed"].map((x) => <label className={preferences.explanation === x ? "selected" : ""} key={x}><input type="radio" name="explanation" checked={preferences.explanation === x} onChange={() => update("explanation", x as Preferences["explanation"])} />{x}</label>)}</div></fieldset><fieldset><legend>Which learning tools help you?</legend><div className="check-grid">{tools.map((tool) => <label className={preferences.tools.includes(tool) ? "selected" : ""} key={tool}><input type="checkbox" checked={preferences.tools.includes(tool)} onChange={() => update("tools", preferences.tools.includes(tool) ? preferences.tools.filter((t) => t !== tool) : [...preferences.tools, tool])} /><span>✓</span>{tool}</label>)}</div></fieldset><fieldset><legend>Study interface</legend><div className="segmented">{["Normal", "Low distraction", "One task at a time"].map((x) => <label className={preferences.interface === x ? "selected" : ""} key={x}><input type="radio" name="interface" checked={preferences.interface === x} onChange={() => update("interface", x as Preferences["interface"])} />{x}</label>)}</div></fieldset><fieldset><legend>Preferred study session</legend><div className="segmented compact">{[10, 15, 20, 25, 30].map((n) => <label className={preferences.session === n ? "selected" : ""} key={n}><input type="radio" name="session" checked={preferences.session === n} onChange={() => update("session", n)} />{n} min</label>)}</div></fieldset><fieldset><legend>Do you prefer predictable task sequences?</legend><div className="segmented compact"><label className={preferences.predictable ? "selected" : ""}><input type="radio" name="predictable" checked={preferences.predictable} onChange={() => update("predictable", true)} />Yes</label><label className={!preferences.predictable ? "selected" : ""}><input type="radio" name="predictable" checked={!preferences.predictable} onChange={() => update("predictable", false)} />No</label></div></fieldset><div className="saved-note"><span>✓</span><div><b>Preferences saved automatically</b><small>Every demo AI response will use these choices.</small></div></div></section></div>;
}

function ProfilePage({ currentUser, preferences, quizAttempts, studySessions, setView, openHistory }: { currentUser: StudentAccount; preferences: Preferences; quizAttempts: QuizAttempt[]; studySessions: StudySession[]; setView: (view: View) => void; openHistory: () => void }) {
  const totalStudySeconds = studySessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const averageScore = quizAttempts.length ? Math.round((quizAttempts.reduce((sum, attempt) => sum + attempt.score / attempt.total, 0) / quizAttempts.length) * 100) : 0;
  return (
    <div className="page-content work-page">
      <section className="profile-hero">
        <div className="profile-avatar-large">{initialsFor(currentUser.name)}</div>
        <div>
          <span className="eyebrow"><i /> MY PROFILE</span>
          <h2>{currentUser.name}</h2>
          <p>{currentUser.email} · Grade 11 focus</p>
        </div>
        <button className="button primary" onClick={openHistory}>View full history</button>
      </section>

      <section className="stats-grid">
        <StatCard label="Student level" value={`${rankForXp(totalXp(quizAttempts)).icon} ${rankForXp(totalXp(quizAttempts)).name}`} note={`${totalXp(quizAttempts)} XP total`} icon="✦" />
        <StatCard label="Quizzes done" value={String(quizAttempts.length)} note={`${averageScore}% average`} icon="⚡" />
        <StatCard label="Study time" value={formatDuration(totalStudySeconds)} note="From Focus sessions" icon="◷" />
        <StatCard label="Preferred session" value={`${preferences.session}m`} note={preferences.interface} icon="◎" />
        <StatCard label="Tools selected" value={String(preferences.tools.length)} note={preferences.explanation} icon="✓" />
      </section>

      <section className="profile-grid">
        <article className="settings-card">
          <div><span><b>Learning style</b><small>{preferences.explanation} · {preferences.interface}</small></span><button className="button" onClick={() => setView("preferences")}>Edit</button></div>
          <div><span><b>Helpful tools</b><small>{preferences.tools.slice(0, 4).join(", ") || "No tools selected"}</small></span><button className="button" onClick={() => setView("learn")}>Study</button></div>
          <div><span><b>Books</b><small>Grade 11 reference materials connected locally.</small></span><button className="button" onClick={() => setView("resources")}>Open books</button></div>
        </article>
        <article className="topic-progress">
          <div className="card-title"><div><span className="eyebrow"><i /> RECENT QUIZZES</span><h2>Quiz attempts</h2></div><button className="button" onClick={() => setView("quiz")}>Take quiz</button></div>
          {quizAttempts.length ? quizAttempts.slice(0, 5).map((attempt) => <div key={attempt.id}><span><b>{attempt.topic}</b><small>{new Date(attempt.date).toLocaleString()}</small></span><strong>{attempt.score}/{attempt.total}</strong><i><em style={{ width: `${Math.round((attempt.score / attempt.total) * 100)}%` }} /></i></div>) : <div><span><b>No quizzes yet</b><small>Complete a quiz to start profile history.</small></span><strong>0/5</strong><i><em style={{ width: "0%" }} /></i></div>}
        </article>
      </section>
    </div>
  );
}

function AdaptHelper({ open, setOpen, setView }: { open: boolean; setOpen: (v: boolean) => void; setView: (v: View) => void }) {
  return <div className={`adapt-helper ${open ? "open" : ""}`}><button className="adapt-launcher" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close Padhai Yatra helper" : "Open Padhai Yatra helper"}><span>✦</span><b>{open ? "Close" : "Ask Padhai"}</b></button>{open && <aside className="adapt-popover" aria-label="Padhai Yatra learning helper"><div className="adapt-helper-head"><div className="adapt-face">A</div><div><b>Hi, I&apos;m Padhai Yatra.</b><small>What would help right now?</small></div></div><div className="helper-actions"><button onClick={() => { setView("learn"); setOpen(false); }}>✦ Explain something</button><button onClick={() => { setView("assignments"); setOpen(false); }}>☑ Make work smaller</button><button onClick={() => { setView("communicate"); setOpen(false); }}>◌ Help me ask for help</button><button onClick={() => { setView("focus"); setOpen(false); }}>◎ Help me focus</button></div><p>Padhai Yatra supports learning. It does not diagnose or judge students.</p></aside>}</div>;
}

function SettingsPage({ theme, toggleTheme, calm, setCalm, aiMode }: { theme: string; toggleTheme: () => void; calm: boolean; setCalm: (v: boolean) => void; aiMode: "checking" | "live" | "demo" }) {
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> SETTINGS</span><h2>Make Padhai Yatra comfortable for you.</h2></section><section className="settings-card"><div><span><b>Appearance</b><small>Current: {theme} mode</small></span><button className="button" onClick={toggleTheme}>Use {theme === "light" ? "dark" : "light"} mode</button></div><div><span><b>Calm Mode</b><small>Reduce motion, navigation, and secondary details.</small></span><label className="calm-toggle"><input type="checkbox" checked={calm} onChange={(e) => setCalm(e.target.checked)} /><span className="switch" /></label></div><div><span><b>AI mode</b><small>{aiMode === "live" ? "Secure server-side OpenAI responses are active." : "Competition-safe demo responses are active until an API key is configured."}</small></span><span className={`demo-badge ${aiMode === "live" ? "live" : ""}`}><i /> {aiMode === "live" ? "Live AI active" : "Demo AI ready"}</span></div><div><span><b>Data</b><small>Learning preferences are stored only in this browser.</small></span><button className="button" onClick={() => { localStorage.removeItem("adapted-preferences"); window.location.reload(); }}>Reset local data</button></div></section><div className="safety-card"><b>Educational personalization, not diagnosis</b><p>Padhai Yatra never diagnoses autism, ADHD, dyslexia, learning disabilities, or medical conditions. Quiz results are learning-progress indicators only.</p></div></div>;
}

export default function Home() {
  const [screen, setScreen] = useState<"landing" | "login" | "app">("landing");
  const [view, setView] = useState<View>("dashboard");
  const [currentUser, setCurrentUser] = useState<StudentAccount>(() => readStoredJson<StudentAccount>(CURRENT_USER_KEY, { name: "Anuj Adhikari", email: "demo@student.com", password: "demo123", createdAt: new Date().toISOString() }));
  const [theme, setTheme] = useState("light");
  const [calm, setCalm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [lessonInput, setLessonInput] = useState("");
  const [lessonResult, setLessonResult] = useState<LessonResult | null>(null);
  const [lessonAnalysis, setLessonAnalysis] = useState<LessonAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [aiMode, setAiMode] = useState<"checking" | "live" | "demo">("checking");
  const [helperOpen, setHelperOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [analysisCache, setAnalysisCache] = useState<Record<string, LessonAnalysis>>(() => readStoredJson(ANALYSIS_CACHE_KEY, {}));
  const [focusState, setFocusState] = useState<FocusState>(() => readStoredJson("adapted-focus-state", { mode: "focus", duration: 15, seconds: 15 * 60, running: false }));
  const [studySessions, setStudySessions] = useState<StudySession[]>(() => readStoredJson(STUDY_SESSIONS_KEY, []));
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>(() => readStoredJson(QUIZ_ATTEMPTS_KEY, []));
  const [authError, setAuthError] = useState("");
  const [invitedRoom, setInvitedRoom] = useState<{ room: string; topic: string; mode: "Study" | "Competition" } | null>(null);

  const login = useCallback((account: StudentAccount) => {
    setCurrentUser(account);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(account));
    setAuthError("");
    setScreen("app");
    // An invited friend should land in the room they were sent to, not the dashboard.
    setView(readRoomFromUrl() ? "studyroom" : "dashboard");
  }, []);
  // Clearing the screen is not a logout: without signOut() the Supabase session survives
  // in localStorage and the next reload silently signs the student back in.
  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem(CURRENT_USER_KEY);
    setMenuOpen(false);
    setView("dashboard");
    setScreen("landing");
  }, []);

  useEffect(() => {
    const storedTheme = localStorage.getItem("adapted-theme");
    const storedPrefs = localStorage.getItem("adapted-preferences");
    // Restore device-local preferences after hydration; the server cannot read browser storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (storedTheme) setTheme(storedTheme);
    if (storedPrefs) { try { setPreferences(JSON.parse(storedPrefs)); } catch { /* use demo defaults */ } }
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("adapted-theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("adapted-preferences", JSON.stringify(preferences)); }, [preferences]);
  useEffect(() => { fetch("/api/status").then((r) => r.json()).then((data: { mode?: string }) => setAiMode(data.mode === "LIVE_AI" ? "live" : "demo")).catch(() => setAiMode("demo")); }, []);
  useEffect(() => {
    // An expired or reused email link comes back as a URL fragment, not a session.
    // Surface it on the login screen instead of dropping the student on the landing page.
    const linkError = readAuthErrorFromUrl();
    if (linkError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAuthError(linkError);
      setScreen("login");
    }
    // Arriving on an invite link: skip the marketing page and go straight to sign-in,
    // so the friend sees the invitation instead of a homepage they have to decode.
    const room = readRoomFromUrl();
    if (room) {
      setInvitedRoom(room);
      setScreen("login");
    }
    if (!supabase) return;
    const applySupabaseSession = (user: { email?: string; created_at?: string; user_metadata?: Record<string, unknown> } | undefined) => {
      if (!user?.email) return;
      login(accountFromSupabaseUser(user, user.email));
    };
    supabase.auth.getSession().then(({ data }) => applySupabaseSession(data.session?.user));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_OUT must not re-enter the app; logout() already moved us to the landing screen.
      if (event === "SIGNED_OUT") return;
      applySupabaseSession(session?.user);
    });
    return () => data.subscription.unsubscribe();
  }, [login]);
  useEffect(() => {
    localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(analysisCache));
  }, [analysisCache]);
  useEffect(() => {
    localStorage.setItem("adapted-focus-state", JSON.stringify(focusState));
  }, [focusState]);
  useEffect(() => {
    localStorage.setItem(STUDY_SESSIONS_KEY, JSON.stringify(studySessions));
  }, [studySessions]);
  useEffect(() => {
    localStorage.setItem(QUIZ_ATTEMPTS_KEY, JSON.stringify(quizAttempts));
  }, [quizAttempts]);

  const title = useMemo(() => navItems.find((n) => n.id === view)?.label || (view === "settings" ? "Settings" : view === "profile" ? "My profile" : "Padhai Yatra"), [view]);
  const toggleTheme = () => setTheme((t) => t === "light" ? "dark" : "light");
  const recordStudySession = useCallback((session: StudySession) => {
    setStudySessions((current) => current.some((item) => item.id === session.id) ? current : [session, ...current].slice(0, 100));
  }, []);
  const recordQuizAttempt = useCallback((attempt: QuizAttempt) => {
    setQuizAttempts((current) => current.some((item) => item.id === attempt.id) ? current : [attempt, ...current].slice(0, 100));
  }, []);
  function quickDemo() { login({ name: "Anuj Adhikari", email: "demo@student.com", password: "demo123", createdAt: new Date().toISOString() }); }
  async function runLearningAction(action: string) {
    const normalizedLesson = lessonInput.trim();
    if (!normalizedLesson) return;
    setLoading(true); setStage(0); setShowQuiz(false); setView("learn");
    const stages = window.setInterval(() => setStage((s) => Math.min(2, s + 1)), 480);
    try {
      const cachedAnalysis = analysisCache[normalizedLesson];
      if (cachedAnalysis) {
        setLessonAnalysis(cachedAnalysis);
        setLessonResult(buildResultFromAnalysis(cachedAnalysis, action));
      } else {
        const response = await fetch("/api/adapt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, content: normalizedLesson, preferences }) });
        if (!response.ok) throw new Error("Learning request failed");
        const data = await response.json() as AdaptResponse;
        setLessonResult(data.result);
        if (data.analysis) {
          setLessonAnalysis(data.analysis);
          setAnalysisCache((current) => ({ ...current, [normalizedLesson]: data.analysis! }));
        } else {
          setLessonAnalysis(null);
        }
      }
    } catch {
      const fallbackAnalysis = buildEmergencyAnalysis(normalizedLesson);
      setLessonAnalysis(fallbackAnalysis);
      setLessonResult({
        ...buildResultFromAnalysis(fallbackAnalysis, action),
        sourceMode: "GENERAL",
        sourceNote: "Offline backup explanation — no extra AI credit used",
        sources: [],
      });
    } finally { window.clearInterval(stages); setStage(2); setLoading(false); }
  }
  const dashboardLearningAction = () => runLearningAction("Simplify");

  if (screen === "landing") return <Landing onStart={() => setScreen("login")} onDemo={quickDemo} theme={theme} toggleTheme={toggleTheme} />;
  if (screen === "login") return <Login onLogin={login} onBack={() => { setAuthError(""); setScreen("landing"); }} initialError={authError} invitedRoom={invitedRoom} />;

  return (
    <div className={`app-shell ${calm ? "calm" : ""}`}>
      <Sidebar view={view} setView={setView} calm={calm} open={menuOpen} close={() => setMenuOpen(false)} logout={logout} currentUser={currentUser} />
      {menuOpen && <button className="nav-overlay" onClick={() => setMenuOpen(false)} aria-label="Close navigation overlay" />}
      <div className="app-main">
        <Header title={title} calm={calm} setCalm={setCalm} theme={theme} toggleTheme={toggleTheme} onMenu={() => setMenuOpen(true)} aiMode={aiMode} onProfile={() => setView("profile")} currentUser={currentUser} />
        {view === "dashboard" && <Dashboard setView={setView} lessonInput={lessonInput} setLessonInput={setLessonInput} adapt={dashboardLearningAction} lessonResult={lessonResult} currentUser={currentUser} />}
        {view === "learn" && <LearnPage lessonInput={lessonInput} setLessonInput={setLessonInput} result={lessonResult} lessonAnalysis={lessonAnalysis} loading={loading} stage={stage} runAction={runLearningAction} showQuiz={showQuiz} setShowQuiz={setShowQuiz} onQuizComplete={recordQuizAttempt} />}
        {view === "assignments" && <AssignmentsPage calm={calm} />}
        {view === "quiz" && <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> KNOWLEDGE CHECK</span><h2>Quick quiz</h2><p>A low-pressure check to see what is strong and what to review.</p></section><QuizCard lessonInput={lessonInput} lessonResult={lessonResult} lessonAnalysis={lessonAnalysis} onReview={() => runLearningAction("Explain deeply")} onComplete={recordQuizAttempt} /></div>}
        {view === "planner" && <PlannerPage />}
        {view === "flashcards" && <FlashcardsPage lessonInput={lessonInput} lessonResult={lessonResult} />}
        {view === "focus" && <FocusPage lessonInput={lessonInput} lessonResult={lessonResult} focusState={focusState} setFocusState={setFocusState} onSessionComplete={recordStudySession} />}
        {view === "routine" && <RoutinePage />}
        {view === "communicate" && <CommunicatePage />}
        {view === "studyroom" && <StudyTogetherPage currentUser={currentUser} setView={setView} setLessonInput={setLessonInput} />}
        {view === "progress" && <ProgressPage sessions={studySessions} quizAttempts={quizAttempts} />}
        {view === "resources" && <ResourcesPage setLessonInput={setLessonInput} setView={setView} />}
        {view === "preferences" && <PreferencesPage preferences={preferences} setPreferences={setPreferences} />}
        {view === "profile" && <ProfilePage currentUser={currentUser} preferences={preferences} quizAttempts={quizAttempts} studySessions={studySessions} setView={setView} openHistory={() => setHistoryOpen(true)} />}
        {view === "settings" && <SettingsPage theme={theme} toggleTheme={toggleTheme} calm={calm} setCalm={setCalm} aiMode={aiMode} />}
      </div>
      <AdaptHelper open={helperOpen} setOpen={setHelperOpen} setView={setView} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} quizAttempts={quizAttempts} studySessions={studySessions} setView={setView} currentUser={currentUser} />
    </div>
  );
}
