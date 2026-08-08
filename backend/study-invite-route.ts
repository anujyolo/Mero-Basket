import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type InviteBody = {
  email?: string;
  topic?: string;
  roomCode?: string;
  roomMode?: string;
  inviteLink?: string;
  inviterName?: string;
};

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) return null;
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as InviteBody;
  const email = String(body.email || "").trim().toLowerCase();
  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({
      ok: false,
      error: "Supabase server secret is not configured yet. Add SUPABASE_URL and SUPABASE_SECRET_KEY to .env.local.",
    }, { status: 501 });
  }

  const redirectTo = body.inviteLink || "http://localhost:3002";
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      invited_by: body.inviterName || "Padhai Yatra",
      room_code: body.roomCode || "",
      topic: body.topic || "",
      room_mode: body.roomMode || "Competition",
    },
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: `Invite link sent to ${email}.` });
}

