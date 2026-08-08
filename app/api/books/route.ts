import { NextRequest, NextResponse } from "next/server";
import { listTextbookLibrary, refreshBookIndex, removeTextbookFile, saveTextbookFile } from "../../../backend/textbooks";

export async function GET() {
  const books = await listTextbookLibrary();
  return NextResponse.json({
    books: books.map((book) => ({
      id: book.id,
      subject: book.subject,
      title: book.title,
      status: book.status,
      fileUrl: book.publicUrl || null,
      sourceUrl: book.sourceUrl || null,
      canOpen: book.canOpen,
      canReplace: book.canReplace,
      canRemove: book.canRemove,
    })),
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const subject = String(formData.get("subject") || "").trim();
  const title = String(formData.get("title") || "").trim() || subject;
  const file = formData.get("file");

  if (!subject || !(file instanceof File)) {
    return NextResponse.json({ error: "Subject and PDF file are required." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await saveTextbookFile(subject, title, buffer);
  await refreshBookIndex();

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const subject = url.searchParams.get("subject")?.trim() || "";
  if (!subject) {
    return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  }

  const removed = await removeTextbookFile(subject);
  await refreshBookIndex();
  return NextResponse.json({ ok: removed });
}

