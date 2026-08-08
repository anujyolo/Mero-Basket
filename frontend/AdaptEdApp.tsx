"use client";

// Main frontend application: screens, interactions, and accessibility behavior.

import { FormEvent, useEffect, useMemo, useState } from "react";

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
  | "progress"
  | "preferences"
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
};

type QuizQuestion = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

type AssignmentTask = { title: string; minutes: number; done: boolean };

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
  { id: "learn", label: "Adapt my lesson", icon: "✦" },
  { id: "assignments", label: "Assignments", icon: "☑" },
  { id: "quiz", label: "Quick quiz", icon: "⚡" },
  { id: "planner", label: "Study plan", icon: "▦" },
  { id: "flashcards", label: "Flashcards", icon: "▤" },
  { id: "focus", label: "Focus", icon: "◎" },
  { id: "routine", label: "Routine", icon: "◷" },
  { id: "communicate", label: "Ask for help", icon: "◌" },
  { id: "progress", label: "Progress", icon: "↗" },
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

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo" aria-label="AdaptEd AI home">
      <span className="logo-mark">A</span>
      {!compact && <span>AdaptEd <b>AI</b></span>}
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
          <h1>One lesson.<br /><em>Different ways</em> to learn.</h1>
          <p>An AI learning companion that adapts explanations, assignments and study plans to the way you learn best.</p>
          <div className="hero-actions">
            <button className="button primary large" onClick={onStart}>Start learning <span>→</span></button>
            <button className="button large" onClick={onDemo}>Try Alex&apos;s demo</button>
          </div>
          <div className="hero-proof">
            <span>✓ No medical labels</span><span>✓ Your preferences</span><span>✓ Calm by design</span>
          </div>
        </div>
        <div className="adapt-visual" aria-label="Example of AdaptEd simplifying a lesson">
          <div className="paper original-paper">
            <span className="paper-label">ORIGINAL LESSON</span>
            <p>Evaporation is the process by which molecules in a liquid state acquire sufficient kinetic energy to transition into the gaseous state.</p>
          </div>
          <div className="adapt-bridge"><span>✦</span> Adapted for Alex</div>
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
          <p>AdaptEd is more than a chatbot. Each tool uses the same learning preferences, so your study experience stays consistent.</p>
        </div>
        <div className="tool-list">
          {["Adapt complex lessons", "Break down assignments", "Generate quick quizzes", "Build focused study plans", "Create and review flashcards", "Communicate what you need"].map((x, i) => <div key={x}><span>{["✦", "☑", "⚡", "▦", "▤", "◌"][i]}</span>{x}<b>→</b></div>)}
        </div>
      </section>

      <section className="section accessibility-section" id="accessibility">
        <div className="quote-mark">“</div>
        <blockquote>Instead of forcing every student to adapt to the same lesson, AdaptEd AI adapts the lesson to the student.</blockquote>
        <p>Educational personalization for every learner—without diagnosis, assumptions, or judgment.</p>
      </section>

      <section className="final-cta">
        <Logo />
        <h2>Learning that adapts to you.</h2>
        <p>Start with Alex&apos;s demo profile and personalize your first lesson in under a minute.</p>
        <button className="button primary large" onClick={onDemo}>Explore the demo <span>→</span></button>
      </section>
      <footer><span>AdaptEd AI · Hackathon 2026</span><span>Educational support, not clinical assessment.</span></footer>
    </main>
  );
}

function Login({ onLogin, onBack }: { onLogin: (email: string, password: string) => void; onBack: () => void }) {
  const [email, setEmail] = useState("demo@student.com");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (email.trim() && password.trim()) onLogin(email, password);
    else setError("Enter your email and password to continue.");
  }
  return (
    <main className="login-page">
      <button className="back-link" onClick={onBack}>← Back to home</button>
      <section className="login-card">
        <Logo />
        <div className="login-heading"><span className="eyebrow"><i /> LOCAL DEMO MODE</span><h1>Welcome back.</h1><p>Continue as Alex and explore the complete learning experience.</p></div>
        <form onSubmit={submit}>
          <label>Email address<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" /></label>
          <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary large full" type="submit">Enter learning space →</button>
        </form>
        <div className="demo-credentials"><b>Student demo</b><span>demo@student.com</span><span>Password: demo123</span></div>
        <p className="privacy-note">Your demo preferences stay on this device. No medical or diagnostic data is collected.</p>
      </section>
    </main>
  );
}

function Header({ title, calm, setCalm, theme, toggleTheme, onMenu, aiMode }: { title: string; calm: boolean; setCalm: (v: boolean) => void; theme: string; toggleTheme: () => void; onMenu: () => void; aiMode: "checking" | "live" | "demo" }) {
  return (
    <header className="app-header">
      <button className="icon-button mobile-menu" onClick={onMenu} aria-label="Open navigation">☰</button>
      <div><span className="breadcrumb">WORKSPACE /</span><h1>{title}</h1></div>
      <div className="header-actions">
        <span className={`demo-badge ${aiMode === "live" ? "live" : ""}`}><i /> {aiMode === "checking" ? "Checking Adapt…" : aiMode === "live" ? "Adapt AI live" : "Adapt demo ready"}</span>
        <label className="calm-toggle"><input type="checkbox" checked={calm} onChange={(e) => setCalm(e.target.checked)} /><span className="switch" /><b>Calm mode</b></label>
        <button className="icon-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? "☾" : "☀"}</button>
        <div className="avatar" aria-label="Profile for Alex">A</div>
      </div>
    </header>
  );
}

function Sidebar({ view, setView, calm, open, close, logout }: { view: View; setView: (v: View) => void; calm: boolean; open: boolean; close: () => void; logout: () => void }) {
  const visibleItems = calm ? navItems.filter((n) => ["dashboard", "learn", "assignments", "focus"].includes(n.id)) : navItems;
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
        <div className="profile-mini"><div className="avatar">A</div><div><b>Alex Morgan</b><span>Student · Demo</span></div></div>
      </div>
    </aside>
  );
}

function StatCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: string }) {
  return <article className="stat-card"><div className="stat-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function Dashboard({ setView, lessonInput, setLessonInput, adapt }: { setView: (v: View) => void; lessonInput: string; setLessonInput: (v: string) => void; adapt: () => void }) {
  const choices: [View, string, string, string, string][] = [
    ["learn", "1", "Help me understand", "Paste a lesson and get a clearer explanation.", "mint"],
    ["assignments", "2", "Break down my work", "Turn a big assignment into small steps.", "sun"],
    ["quiz", "3", "Practice with a quiz", "Check what you know without pressure.", "lilac"],
    ["focus", "4", "Focus on one task", "Use a calm timer with fewer distractions.", "sky"],
  ];
  return (
    <div className="page-content dashboard-page">
      <section className="welcome-row simple-welcome"><div><p className="date-label">YOUR LEARNING SPACE</p><h2>Hi Alex, what can we make easier? <span>👋</span></h2><p>Choose one thing. Adapt will guide you step by step.</p></div><button className="streak-pill" onClick={() => setView("progress")}><span>◇</span><div><b>5 day streak</b><small>See your progress →</small></div></button></section>

      <section className="start-guide calm-hide" aria-label="Three simple steps">
        <div><b>1</b><span><strong>Choose a goal</strong><small>Pick one card below</small></span></div>
        <i>→</i>
        <div><b>2</b><span><strong>Add your work</strong><small>Paste notes or a task</small></span></div>
        <i>→</i>
        <div><b>3</b><span><strong>Learn your way</strong><small>Adapt follows your style</small></span></div>
      </section>

      <section className="easy-dashboard">
        <div className="choice-zone">
          <div className="choice-heading"><div><span className="eyebrow"><i /> START HERE</span><h3>What do you want to do?</h3></div><span>One choice is enough.</span></div>
          <div className="big-choice-grid">
            {choices.map(([id, number, title, copy, color]) => <button className={`big-choice ${color}`} onClick={() => setView(id)} key={id}><span>{number}</span><div><b>{title}</b><small>{copy}</small></div><i>→</i></button>)}
          </div>
          <div className="secondary-actions calm-hide">
            <button onClick={() => setView("planner")}><span>▦</span><b>Make a study plan</b></button>
            <button onClick={() => setView("communicate")}><span>◌</span><b>Help me ask a teacher</b></button>
            <button onClick={() => setView("flashcards")}><span>▤</span><b>Review flashcards</b></button>
          </div>
        </div>

        <aside className="now-card">
          <span className="eyebrow"><i /> RIGHT NOW</span>
          <div className="now-illustration">🌿</div>
          <small>SCIENCE · 15 MIN</small>
          <h3>Photosynthesis</h3>
          <p>Continue the lesson you started.</p>
          <button className="button primary full" onClick={() => setView("learn")}>Continue learning →</button>
          <button className="quiet-link" onClick={() => setView("routine")}>See today&apos;s routine</button>
        </aside>
      </section>

      <section className="quick-paste calm-hide">
        <div><span className="quick-icon">✦</span><div><b>Already know what you need?</b><small>Paste a topic or lesson here and Adapt will begin.</small></div></div>
        <textarea value={lessonInput} onChange={(e) => setLessonInput(e.target.value)} placeholder="Paste a topic or lesson…" aria-label="Quick learning material" />
        <button className="button primary" onClick={adapt}>Adapt it for me →</button>
      </section>
    </div>
  );
}

function LoadingPanel({ stage }: { stage: number }) {
  const labels = ["Understanding your material…", "Adapting it to your preferences…", "Preparing your explanation…"];
  return <div className="loading-panel" role="status"><div className="spinner">✦</div><b>{labels[stage] || labels[2]}</b><div className="loading-lines"><i /><i /><i /></div></div>;
}

function LessonResultCard({ result, action, onAction, onQuiz }: { result: LessonResult; action: string; onAction: (a: string) => void; onQuiz: () => void }) {
  return (
    <article className="result-card">
      <div className="result-head"><div><span className="eyebrow"><i /> ADAPTED · {action.toUpperCase()}</span><h2>{result.title}</h2></div><span className="preference-chip">Short + visual + example</span></div>
      <p className="result-summary">{result.summary}</p>
      {result.needs.length > 0 && <div className="needs-grid">{result.needs.map((n) => <span key={n}>{n}</span>)}</div>}
      {result.steps.length > 0 && <div className="step-list">{result.steps.map((s, i) => <div key={s}><b>STEP {i + 1}</b><p>{s}</p></div>)}</div>}
      <div className="result-outcome"><span>RESULT</span><p>{result.result}</p></div>
      <div className="analogy-box"><span>Think of it this way</span><p>{result.example}</p></div>
      <div className="result-actions">
        {["Make simpler", "Explain normally", "Explain deeply", "Give example", "Use an analogy", "Show step-by-step"].map((a) => <button onClick={() => onAction(a)} key={a}>{a}</button>)}
        <button className="quiz-action" onClick={onQuiz}>Quiz me ⚡</button>
      </div>
    </article>
  );
}

function QuizCard({ onReview }: { onReview: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const score = demoQuiz.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  return (
    <section className="quiz-card">
      <div className="card-title"><div><span className="eyebrow"><i /> 3 QUESTION CHECK</span><h2>Photosynthesis quick quiz</h2></div><span className="preference-chip">No time limit</span></div>
      {demoQuiz.map((q, i) => <fieldset key={q.question} className="question"><legend><span>{i + 1}</span>{q.question}</legend>{q.options.map((option, oi) => <label className={`${submitted ? oi === q.answer ? "correct" : answers[i] === oi ? "incorrect" : "" : ""}`} key={option}><input type="radio" name={`q-${i}`} checked={answers[i] === oi} onChange={() => !submitted && setAnswers((a) => ({ ...a, [i]: oi }))} />{option}{submitted && oi === q.answer && <b>✓ Correct</b>}</label>)}{submitted && <p className="explanation">{q.explanation}</p>}</fieldset>)}
      {!submitted ? <button className="button primary" disabled={Object.keys(answers).length < demoQuiz.length} onClick={() => setSubmitted(true)}>Check my answers</button> : <div className="score-panel"><span>SCORE</span><strong>{score} / {demoQuiz.length}</strong><p>{score === 3 ? "Strong work—you understand the core process." : "You understand the basic process. Chlorophyll is the best area to review next."}</p><div className="knowledge-row"><b>🟢 Photosynthesis basics · Strong</b><b>🟡 Role of chlorophyll · Review</b></div><button className="button primary" onClick={onReview}>Review weak area →</button><button className="button" onClick={() => { setAnswers({}); setSubmitted(false); }}>Try again</button></div>}
    </section>
  );
}

function LearnPage({ lessonInput, setLessonInput, result, loading, stage, runAction, showQuiz, setShowQuiz }: { lessonInput: string; setLessonInput: (v: string) => void; result: LessonResult | null; loading: boolean; stage: number; runAction: (a: string) => void; showQuiz: boolean; setShowQuiz: (v: boolean) => void }) {
  const [action, setAction] = useState("Simplify");
  const run = (a = action) => { setAction(a); runAction(a); setShowQuiz(false); };
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> CORE LEARNING TOOL</span><h2>Adapt my lesson</h2><p>Paste anything you&apos;re learning. Adapt will keep the meaning accurate and change how it is explained.</p></section><section className="composer-card"><label htmlFor="lesson-material">Your learning material</label><textarea id="lesson-material" value={lessonInput} onChange={(e) => setLessonInput(e.target.value)} placeholder="Paste a lesson, notes, textbook paragraph, or topic here…" /><div className="sample-row"><button onClick={() => setLessonInput(demoLesson)}>Use photosynthesis example</button><span>{lessonInput.length} characters</span></div><div className="action-tabs" role="group" aria-label="Adaptation style">{["Simplify", "Explain differently", "Give example", "Show key points", "Break into steps"].map((a) => <button className={action === a ? "active" : ""} onClick={() => setAction(a)} key={a}>{a}</button>)}</div><button className="button primary large" disabled={!lessonInput.trim() || loading} onClick={() => run()}>Adapt for me ✦</button></section>{loading && <LoadingPanel stage={stage} />}{result && !loading && !showQuiz && <LessonResultCard result={result} action={action} onAction={run} onQuiz={() => setShowQuiz(true)} />}{showQuiz && <QuizCard onReview={() => { setShowQuiz(false); run("Explain deeply"); }} />}</div>;
}

function AssignmentsPage({ calm }: { calm: boolean }) {
  const [text, setText] = useState("Read Chapter 4, answer Questions 1–10 and prepare a summary.");
  const [tasks, setTasks] = useState<AssignmentTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [oneTask, setOneTask] = useState(false);
  const current = Math.max(0, tasks.findIndex((t) => !t.done));
  const completed = tasks.filter((t) => t.done).length;
  function generate() { setLoading(true); setTimeout(() => { setTasks(initialTasks); setLoading(false); }, 1100); }
  function toggle(i: number) { setTasks((list) => list.map((t, ti) => ti === i ? { ...t, done: !t.done } : t)); }
  if ((oneTask || calm) && tasks.length) {
    const task = tasks[current] || tasks[tasks.length - 1];
    return <div className="page-content one-task-page"><span className="eyebrow"><i /> ONE TASK MODE</span><div className="one-task-card"><span>CURRENT TASK · {Math.min(current + 1, tasks.length)} OF {tasks.length}</span><div className="one-icon">{task.done ? "✓" : "▤"}</div><h2>{task.done ? "All tasks complete" : task.title}</h2><p>Estimated time: <b>{task.minutes} minutes</b></p><div className="one-progress"><i style={{ width: `${(completed / tasks.length) * 100}%` }} /></div><small>{completed} of {tasks.length} complete</small><div className="one-actions"><button className="button" onClick={() => setOneTask(false)}>See full plan</button><button className="button">Need help</button><button className="button">Take break</button>{!task.done && <button className="button primary" onClick={() => toggle(current)}>Complete task ✓</button>}</div></div></div>;
  }
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> ASSIGNMENT SUPPORT</span><h2>Break my assignment</h2><p>Turn a large instruction into clear, manageable steps with realistic time estimates.</p></section><section className="composer-card"><label htmlFor="assignment">Paste your assignment</label><textarea id="assignment" value={text} onChange={(e) => setText(e.target.value)} /><button className="button primary large" disabled={!text.trim() || loading} onClick={generate}>{loading ? "Building your plan…" : "Create step-by-step plan →"}</button></section>{tasks.length > 0 && !loading && <section className="assignment-plan"><div className="card-title"><div><span className="eyebrow"><i /> YOUR ASSIGNMENT PLAN</span><h2>{completed} / {tasks.length} completed</h2></div><button className="button" onClick={() => setOneTask(true)}>Enter one task mode</button></div><div className="progress-track"><i style={{ width: `${(completed / tasks.length) * 100}%` }} /></div><div className="task-list">{tasks.map((task, i) => <label className={task.done ? "done" : ""} key={`${task.title}-${i}`}><input type="checkbox" checked={task.done} onChange={() => toggle(i)} /><span>{task.done ? "✓" : i + 1}</span><div><b>{task.title}</b><small>{task.minutes} minutes</small></div></label>)}</div></section>}</div>;
}

function PlannerPage() {
  const [subject, setSubject] = useState("Biology");
  const [minutes, setMinutes] = useState(60);
  const [exam, setExam] = useState("Tomorrow");
  const [topics, setTopics] = useState("Cells, Photosynthesis, Respiration");
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState<number[]>([]);
  const slots = [["0–15 min", "Cells", "Review foundations"], ["15–30 min", "Photosynthesis", "Focus topic"], ["30–35 min", "Short break", "Reset"], ["35–50 min", "Respiration", "Practice"], ["50–60 min", "Mini quiz", "Knowledge check"]];
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> STUDY PLANNER</span><h2>Plan around the time you have.</h2><p>A focused plan with breaks, priorities, and a clear finish line.</p></section><section className="planner-grid"><form className="form-card" onSubmit={(e) => { e.preventDefault(); setReady(true); }}><label>What are you studying?<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label>How much time do you have?<select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}><option>30</option><option>45</option><option>60</option><option>90</option><option>120</option></select></label><label>When is your exam?<select value={exam} onChange={(e) => setExam(e.target.value)}><option>Tomorrow</option><option>This week</option><option>Next week</option></select></label><label>Topics<textarea value={topics} onChange={(e) => setTopics(e.target.value)} /></label><button className="button primary large" type="submit">Build my plan →</button></form><aside className="rescue-card"><span>EXAM TOMORROW?</span><h3>Exam Rescue Mode</h3><p>Adapt will prioritize weak areas, protect break time, and keep the plan realistic.</p><div><b>🔴 Photosynthesis</b><small>More time · needs practice</small></div><div><b>🟡 Respiration</b><small>Moderate review</small></div><div><b>🟢 Cell structure</b><small>Quick refresh</small></div></aside></section>{ready && <section className="generated-plan"><div className="card-title"><div><span className="eyebrow"><i /> {minutes}-MINUTE PLAN</span><h2>{subject} · {exam}</h2></div><span className="preference-chip">Based on your learning style</span></div>{slots.map((s, i) => <button className={done.includes(i) ? "done" : ""} onClick={() => setDone((d) => d.includes(i) ? d.filter((x) => x !== i) : [...d, i])} key={s[0]}><span>{done.includes(i) ? "✓" : i + 1}</span><b>{s[0]}</b><div><strong>{s[1]}</strong><small>{s[2]}</small></div></button>)}</section>}</div>;
}

function FlashcardsPage() {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [review, setReview] = useState<number[]>([]);
  const card = flashcards[index];
  function go(next: number) { setIndex((next + flashcards.length) % flashcards.length); setFlipped(false); }
  return <div className="page-content center-page"><section className="page-intro"><span className="eyebrow"><i /> FLASHCARDS</span><h2>Photosynthesis essentials</h2><p>Card {index + 1} of {flashcards.length} · {review.length} marked for review</p></section><button className={`flashcard ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)} aria-label="Flip flashcard"><span>{flipped ? "ANSWER" : "QUESTION"}</span><h2>{flipped ? card.back : card.front}</h2><small>Click to {flipped ? "see question" : "flip"}</small></button><div className="flash-actions"><button className="button" onClick={() => go(index - 1)}>← Previous</button><button className="button" onClick={() => setReview((r) => r.includes(index) ? r : [...r, index])}>Review again</button><button className="button primary" onClick={() => go(index + 1)}>Know it · Next →</button></div></div>;
}

function FocusPage() {
  const [duration, setDuration] = useState(15);
  const [seconds, setSeconds] = useState(15 * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => { if (!running || seconds <= 0) return; const timer = window.setInterval(() => setSeconds((s) => s - 1), 1000); return () => window.clearInterval(timer); }, [running, seconds]);
  function select(n: number) { setDuration(n); setSeconds(n * 60); setRunning(false); }
  const display = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <div className="page-content focus-page"><span className="eyebrow"><i /> FOCUS MODE</span><section className="focus-card"><span>CURRENT TASK</span><h2>Learn photosynthesis</h2><div className="timer-ring" style={{ "--progress": `${(seconds / (duration * 60)) * 360}deg` } as React.CSSProperties}><div><strong>{display}</strong><small>{running ? "You’re doing well" : seconds === 0 ? "Session complete" : "Ready when you are"}</small></div></div><div className="duration-row">{[10, 15, 20, 25].map((n) => <button className={duration === n ? "active" : ""} onClick={() => select(n)} key={n}>{n} min</button>)}</div><div className="focus-actions"><button className="button" onClick={() => { setRunning(false); setSeconds(duration * 60); }}>Reset</button><button className="button primary large" onClick={() => setRunning(!running)}>{running ? "Pause" : seconds === 0 ? "Start again" : "Start focus"}</button><button className="button" onClick={() => { setRunning(false); setSeconds(5 * 60); setDuration(5); }}>Take break</button></div>{seconds === 0 && <p className="gentle-message">Nice work. Would you like to continue or take a break?</p>}</section></div>;
}

function RoutinePage() {
  const [changed, setChanged] = useState(false);
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> TODAY’S ROUTINE</span><h2>Know what&apos;s now and what&apos;s next.</h2><p>A predictable view of your day, with clear support when plans change.</p></section><section className="routine-layout"><div className="routine-card"><div className="routine-item done"><span>DONE</span><b>Mathematics</b><small>9:00 AM · Linear equations</small></div><div className="routine-item now"><span>NOW</span><b>{changed ? "Library" : "Science"}</b><small>10:00 AM · {changed ? "Research session" : "Photosynthesis"}</small></div><div className="routine-item next"><span>NEXT</span><b>Break</b><small>10:45 AM · 15 minutes</small></div><div className="routine-item"><span>LATER</span><b>English</b><small>11:00 AM · Essay outline</small></div></div><aside className="change-card"><span>OPTIONAL CHANGE SUPPORT</span><h3>{changed ? "Small change today" : "Need to change the plan?"}</h3>{changed ? <><div><small>Normally</small><b>Science · 10:00 AM</b></div><div><small>Today</small><b>Library · 10:00 AM</b></div><p>Everything else stays the same.</p><button className="button" onClick={() => setChanged(false)}>Restore normal plan</button></> : <><p>You can preview a schedule change without losing the rest of your routine.</p><button className="button primary" onClick={() => setChanged(true)}>Preview a small change</button></>}</aside></section></div>;
}

function CommunicatePage() {
  const choices = ["I don’t understand", "Please explain differently", "Please go slower", "I need a break", "It is difficult to focus right now", "I need help"];
  const [choice, setChoice] = useState(choices[0]);
  const [tone, setTone] = useState("Clear");
  const [copied, setCopied] = useState(false);
  const message = tone === "Short" ? "I’m confused about the second step. Could you explain it with an example?" : tone === "Formal" ? "I understand the first part, but I am having difficulty with the second step. Would you please explain it again using an example?" : "I understand the first part, but I’m confused about the second step. Could you explain it again using an example?";
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> HELP ME COMMUNICATE</span><h2>Find the words for what you need.</h2><p>Choose what fits right now. Adapt will help you create a respectful message for a teacher.</p></section><section className="communication-grid"><div className="choice-list">{choices.map((c, i) => <button className={choice === c ? "active" : ""} onClick={() => setChoice(c)} key={c}><span>{["😕", "🔁", "🐢", "⏸", "◌", "🙋"][i]}</span>{c}<i>→</i></button>)}</div><article className="message-card"><span className="eyebrow"><i /> SUGGESTED MESSAGE</span><h3>{choice}</h3><blockquote>“{message}”</blockquote><div className="tone-row">{["Short", "Clear", "Formal"].map((t) => <button className={tone === t ? "active" : ""} onClick={() => setTone(t)} key={t}>{t}</button>)}</div><button className="button primary" onClick={async () => { await navigator.clipboard?.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied ✓" : "Copy message"}</button></article></section></div>;
}

function ProgressPage() {
  const topics = [["Python functions", "92%", "🟢 Strong"], ["Photosynthesis", "68%", "🟡 Review"], ["Linear equations", "42%", "🔴 Needs practice"]];
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> LEARNING PROGRESS</span><h2>Your progress, without pressure.</h2><p>These indicators show what to study next. They are not medical or psychological assessments.</p></section><section className="stats-grid"><StatCard label="Topics studied" value="24" note="6 this week" icon="▤" /><StatCard label="Study time" value="6h 45m" note="Steady progress" icon="◷" /><StatCard label="Quizzes completed" value="14" note="Average 78%" icon="⚡" /><StatCard label="Tasks completed" value="38" note="8 this week" icon="✓" /></section><section className="progress-layout"><article className="topic-progress"><div className="card-title"><div><span className="eyebrow"><i /> RECENT TOPICS</span><h2>What to review next</h2></div></div>{topics.map((t) => <div key={t[0]}><span><b>{t[0]}</b><small>{t[2]}</small></span><strong>{t[1]}</strong><i><em style={{ width: t[1] }} /></i></div>)}</article><article className="week-card"><span>THIS WEEK</span><h3>2h 35m</h3><div className="bars">{[35, 60, 42, 78, 55, 88, 30].map((h, i) => <i style={{ height: `${h}%` }} key={i}><small>{["S", "M", "T", "W", "T", "F", "S"][i]}</small></i>)}</div><p>Friday was your most focused day.</p></article></section></div>;
}

function PreferencesPage({ preferences, setPreferences }: { preferences: Preferences; setPreferences: (p: Preferences) => void }) {
  const tools = ["Examples", "Step-by-step explanations", "Visual organization", "Practice questions", "Key points", "Flashcards", "Real-world examples"];
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreferences({ ...preferences, [key]: value });
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> MY LEARNING STYLE</span><h2>Choose what helps you learn.</h2><p>No medical questions. No labels. You can change these preferences at any time.</p></section><section className="preferences-form"><fieldset><legend>How do you prefer explanations?</legend><div className="segmented">{["Short & Simple", "Normal", "Detailed"].map((x) => <label className={preferences.explanation === x ? "selected" : ""} key={x}><input type="radio" name="explanation" checked={preferences.explanation === x} onChange={() => update("explanation", x as Preferences["explanation"])} />{x}</label>)}</div></fieldset><fieldset><legend>Which learning tools help you?</legend><div className="check-grid">{tools.map((tool) => <label className={preferences.tools.includes(tool) ? "selected" : ""} key={tool}><input type="checkbox" checked={preferences.tools.includes(tool)} onChange={() => update("tools", preferences.tools.includes(tool) ? preferences.tools.filter((t) => t !== tool) : [...preferences.tools, tool])} /><span>✓</span>{tool}</label>)}</div></fieldset><fieldset><legend>Study interface</legend><div className="segmented">{["Normal", "Low distraction", "One task at a time"].map((x) => <label className={preferences.interface === x ? "selected" : ""} key={x}><input type="radio" name="interface" checked={preferences.interface === x} onChange={() => update("interface", x as Preferences["interface"])} />{x}</label>)}</div></fieldset><fieldset><legend>Preferred study session</legend><div className="segmented compact">{[10, 15, 20, 25, 30].map((n) => <label className={preferences.session === n ? "selected" : ""} key={n}><input type="radio" name="session" checked={preferences.session === n} onChange={() => update("session", n)} />{n} min</label>)}</div></fieldset><fieldset><legend>Do you prefer predictable task sequences?</legend><div className="segmented compact"><label className={preferences.predictable ? "selected" : ""}><input type="radio" name="predictable" checked={preferences.predictable} onChange={() => update("predictable", true)} />Yes</label><label className={!preferences.predictable ? "selected" : ""}><input type="radio" name="predictable" checked={!preferences.predictable} onChange={() => update("predictable", false)} />No</label></div></fieldset><div className="saved-note"><span>✓</span><div><b>Preferences saved automatically</b><small>Every demo AI response will use these choices.</small></div></div></section></div>;
}

function AdaptHelper({ open, setOpen, setView }: { open: boolean; setOpen: (v: boolean) => void; setView: (v: View) => void }) {
  return <div className={`adapt-helper ${open ? "open" : ""}`}><button className="adapt-launcher" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close Adapt helper" : "Open Adapt helper"}><span>✦</span><b>{open ? "Close" : "Ask Adapt"}</b></button>{open && <aside className="adapt-popover" aria-label="Adapt learning helper"><div className="adapt-helper-head"><div className="adapt-face">A</div><div><b>Hi, I&apos;m Adapt.</b><small>What would help right now?</small></div></div><div className="helper-actions"><button onClick={() => { setView("learn"); setOpen(false); }}>✦ Explain something</button><button onClick={() => { setView("assignments"); setOpen(false); }}>☑ Make work smaller</button><button onClick={() => { setView("communicate"); setOpen(false); }}>◌ Help me ask for help</button><button onClick={() => { setView("focus"); setOpen(false); }}>◎ Help me focus</button></div><p>Adapt supports learning. It does not diagnose or judge students.</p></aside>}</div>;
}

function SettingsPage({ theme, toggleTheme, calm, setCalm, aiMode }: { theme: string; toggleTheme: () => void; calm: boolean; setCalm: (v: boolean) => void; aiMode: "checking" | "live" | "demo" }) {
  return <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> SETTINGS</span><h2>Make AdaptEd comfortable for you.</h2></section><section className="settings-card"><div><span><b>Appearance</b><small>Current: {theme} mode</small></span><button className="button" onClick={toggleTheme}>Use {theme === "light" ? "dark" : "light"} mode</button></div><div><span><b>Calm Mode</b><small>Reduce motion, navigation, and secondary details.</small></span><label className="calm-toggle"><input type="checkbox" checked={calm} onChange={(e) => setCalm(e.target.checked)} /><span className="switch" /></label></div><div><span><b>AI mode</b><small>{aiMode === "live" ? "Secure server-side OpenAI responses are active." : "Competition-safe demo responses are active until an API key is configured."}</small></span><span className={`demo-badge ${aiMode === "live" ? "live" : ""}`}><i /> {aiMode === "live" ? "Live AI active" : "Demo AI ready"}</span></div><div><span><b>Data</b><small>Learning preferences are stored only in this browser.</small></span><button className="button" onClick={() => { localStorage.removeItem("adapted-preferences"); window.location.reload(); }}>Reset local data</button></div></section><div className="safety-card"><b>Educational personalization, not diagnosis</b><p>AdaptEd never diagnoses autism, ADHD, dyslexia, learning disabilities, or medical conditions. Quiz results are learning-progress indicators only.</p></div></div>;
}

export default function Home() {
  const [screen, setScreen] = useState<"landing" | "login" | "app">("landing");
  const [view, setView] = useState<View>("dashboard");
  const [theme, setTheme] = useState("light");
  const [calm, setCalm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [lessonInput, setLessonInput] = useState(demoLesson);
  const [lessonResult, setLessonResult] = useState<LessonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [aiMode, setAiMode] = useState<"checking" | "live" | "demo">("checking");
  const [helperOpen, setHelperOpen] = useState(false);

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

  const title = useMemo(() => navItems.find((n) => n.id === view)?.label || (view === "settings" ? "Settings" : "AdaptEd"), [view]);
  const toggleTheme = () => setTheme((t) => t === "light" ? "dark" : "light");
  function login() { setScreen("app"); setView("dashboard"); }
  function quickDemo() { login(); }
  async function runAdapt(action: string) {
    if (!lessonInput.trim()) return;
    setLoading(true); setStage(0); setView("learn");
    const stages = window.setInterval(() => setStage((s) => Math.min(2, s + 1)), 480);
    try {
      const response = await fetch("/api/adapt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, content: lessonInput, preferences }) });
      if (!response.ok) throw new Error("Adaptation failed");
      const data = await response.json() as { result: LessonResult };
      setLessonResult(data.result);
    } catch {
      setLessonResult({ title: "Let’s try that again", summary: "Adapt could not prepare this explanation yet.", needs: [], steps: [], result: "Your original material is still safe.", example: "Check your connection and try again." });
    } finally { window.clearInterval(stages); setStage(2); setLoading(false); }
  }
  const dashboardAdapt = () => runAdapt("Simplify");

  if (screen === "landing") return <Landing onStart={() => setScreen("login")} onDemo={quickDemo} theme={theme} toggleTheme={toggleTheme} />;
  if (screen === "login") return <Login onLogin={login} onBack={() => setScreen("landing")} />;

  return (
    <div className={`app-shell ${calm ? "calm" : ""}`}>
      <Sidebar view={view} setView={setView} calm={calm} open={menuOpen} close={() => setMenuOpen(false)} logout={() => setScreen("landing")} />
      {menuOpen && <button className="nav-overlay" onClick={() => setMenuOpen(false)} aria-label="Close navigation overlay" />}
      <div className="app-main">
        <Header title={title} calm={calm} setCalm={setCalm} theme={theme} toggleTheme={toggleTheme} onMenu={() => setMenuOpen(true)} aiMode={aiMode} />
        {view === "dashboard" && <Dashboard setView={setView} lessonInput={lessonInput} setLessonInput={setLessonInput} adapt={dashboardAdapt} />}
        {view === "learn" && <LearnPage lessonInput={lessonInput} setLessonInput={setLessonInput} result={lessonResult} loading={loading} stage={stage} runAction={runAdapt} showQuiz={showQuiz} setShowQuiz={setShowQuiz} />}
        {view === "assignments" && <AssignmentsPage calm={calm} />}
        {view === "quiz" && <div className="page-content work-page"><section className="page-intro"><span className="eyebrow"><i /> KNOWLEDGE CHECK</span><h2>Quick quiz</h2><p>A low-pressure check to see what is strong and what to review.</p></section><QuizCard onReview={() => { setLessonInput(demoLesson); runAdapt("Explain deeply"); }} /></div>}
        {view === "planner" && <PlannerPage />}
        {view === "flashcards" && <FlashcardsPage />}
        {view === "focus" && <FocusPage />}
        {view === "routine" && <RoutinePage />}
        {view === "communicate" && <CommunicatePage />}
        {view === "progress" && <ProgressPage />}
        {view === "preferences" && <PreferencesPage preferences={preferences} setPreferences={setPreferences} />}
        {view === "settings" && <SettingsPage theme={theme} toggleTheme={toggleTheme} calm={calm} setCalm={setCalm} aiMode={aiMode} />}
      </div>
      <AdaptHelper open={helperOpen} setOpen={setHelperOpen} setView={setView} />
    </div>
  );
}
