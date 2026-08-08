# Mero Basket — Padhai Yatra

> Learn Anytime, Anywhere.

Mero Basket is the hackathon project repository for Padhai Yatra, a Grade 11 learning companion that explains topics, builds quizzes, finds videos, plans study time, and adapts support to each student’s selected learning preferences. It is an educational accessibility tool for all students and does not provide medical or diagnostic assessments.

## Hackathon team

- Dikshant Shrestha
- Anuj Adhikari
- Sammep Karki

## Demo

- Email: `demo@student.com`
- Password: `demo123`

The current build uses a clearly labeled local Demo AI fallback so the full judging flow works without external credentials.

To activate live AI, copy `.env.example` to `.env.local`, add a valid `OPENAI_API_KEY`, and restart the local server. The key is used only by the server-side `/api/adapt` route and is never sent to the browser. `OPENAI_MODEL` defaults to `gpt-5.6`.

## Supabase setup

Padhai Yatra can use Supabase Auth for real email verification links and Supabase tables for study rooms.

1. Create a Supabase project.
2. In Supabase, open Project Settings → API and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret key → `SUPABASE_SECRET_KEY` for server-side invite sending
3. Put those values in `.env.local`.
4. In Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
5. In Authentication → URL Configuration, add your local URL while testing:
   - `http://localhost:3002`

If Supabase keys are missing, the app falls back to local demo login so the hackathon demo still works.

## Run locally

```bash
npm install
npm run dev -- --port 3002
```

Open [http://localhost:3002](http://localhost:3002).

## Repository structure

The project is separated so judges can review each layer quickly:

```text
frontend/              Student interface and responsive design
backend/               Secure AI endpoints and demo fallback
app/                   Framework entry points connecting both layers
tests/                 Automated application and API checks
public/                Social preview and public assets
```

Start with [`frontend/AdaptEdApp.tsx`](frontend/AdaptEdApp.tsx) for the product experience and [`backend/adapt-route.ts`](backend/adapt-route.ts) for the AI implementation.

## Included experiences

- Personalized learning preference profile
- Lesson simplification and alternative explanations
- Three-question knowledge check with weak-area review
- Assignment breakdown and one-task mode
- Study planner and exam rescue mode
- Flashcards, focus timer, routine support, and progress view
- Teacher communication helper
- Light, dark, and Calm modes
- Responsive and keyboard-accessible interface
- Server-side live AI integration with automatic competition-safe demo fallback

## Safety

Padhai Yatra never diagnoses autism, ADHD, dyslexia, learning disabilities, or medical conditions. Quiz scores are learning-progress indicators only.
