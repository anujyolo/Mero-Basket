import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type BookDefinition = {
  id: string;
  subject: string;
  title: string;
  fileName?: string;
  sourceUrl?: string;
  aliases: string[];
};

type CatalogBook = BookDefinition & {
  filePath: string;
  publicUrl?: string;
  status: "Indexed" | "Not Indexed";
  canOpen: boolean;
  canReplace: boolean;
  canRemove: boolean;
};

type IndexedPage = {
  page: number;
  text: string;
};

type IndexedBook = {
  id: string;
  subject: string;
  title: string;
  filePath: string;
  pages: IndexedPage[];
};

export type TextbookSource = {
  subject: string;
  title: string;
  book: string;
  pages: string;
  excerpt: string;
};

export type TextbookContext = {
  subjectHint: string | null;
  mode: "TEXTBOOK" | "GENERAL";
  sources: TextbookSource[];
  searchTerms: string[];
};

const rootDir = process.cwd();
const publicBookDir = path.join(rootDir, "public", "study_materials");
const textbookDataDir = path.join(rootDir, "data", "textbooks");
const customIndexPath = path.join(textbookDataDir, "custom-books.json");
const cachedIndexPath = path.join(textbookDataDir, "textbook-index.json");

const bookDefinitions: BookDefinition[] = [
  { id: "mathematics-xi", subject: "Mathematics", title: "Class 11 Mathematics", fileName: "03_Mathematics_Class_11.pdf", aliases: ["math", "maths", "algebra", "geometry", "calculus", "equation", "fraction"] },
  { id: "biology-xi", subject: "Biology", title: "Class 11 Biology", fileName: "04_Biology_Class_11.pdf", aliases: ["biology", "zoology", "cell", "photosynthesis", "respiration", "ecosystem", "plant", "animal"] },
  { id: "computer-science-xi", subject: "Computer Science", title: "Computer Science XI", fileName: "Computer_Science_Class_XI_Chapters_1-11.pdf", aliases: ["computer", "computing", "programming", "algorithm", "data", "python", "javascript", "software"] },
  { id: "nepali-xi", subject: "Nepali", title: "Class 11 Nepali", fileName: "neb-class-11-compulsory-nepali-book.pdf", aliases: ["nepali", "nepalese", "language", "grammar", "literature"] },
  { id: "physics-xi", subject: "Physics", title: "Class 11 Physics", fileName: "phycics.pdf", aliases: ["physics", "force", "motion", "energy", "electricity", "wave", "optics", "mechanics"] },
  { id: "chemistry-xi", subject: "Chemistry", title: "Class 11 Chemistry", fileName: "chemistry.pdf", aliases: ["chemistry", "atom", "molecule", "reaction", "acid", "base", "periodic", "compound"] },
  { id: "english-xi", subject: "English", title: "Class 11 English", fileName: "neb-grade-11-compulsory-english-book.pdf", aliases: ["english", "grammar", "comprehension", "essay", "literature", "poem"] },
  { id: "social-studies-xi", subject: "Social Studies", title: "Class 11 Social Studies", fileName: "social_grade_11.pdf", aliases: ["social", "samajik", "civics", "history", "geography", "economy", "government"] },
  { id: "law-xi", subject: "Law", title: "Law XII reference", sourceUrl: "https://www.scribd.com/document/544136733/Law-xii", aliases: ["law", "legal", "constitution", "rights", "justice"] },
  { id: "economics-xi", subject: "Economics", title: "Economics", sourceUrl: "https://online.anyflip.com/qfwek/dtwq/mobile/index.html", aliases: ["economics", "economy", "market", "demand", "supply", "inflation", "budget"] },
  { id: "business-studies-xi", subject: "Business Studies", title: "Business Studies 11 Nepali", sourceUrl: "https://asmitapublication.com/product/277/business-studies-11-nepali/10-2", aliases: ["business", "management", "trade", "marketing", "entrepreneur", "organization"] },
];

const subjectHints = bookDefinitions.map((book) => ({
  subject: book.subject,
  aliases: [book.subject, book.title, ...book.aliases].map((value) => value.toLowerCase()),
}));

let cachedSignature = "";
let cachedBooks: IndexedBook[] = [];
let indexBuildPromise: Promise<IndexedBook[]> | null = null;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "book";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function tokenize(value: string) {
  return (value.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter((token) => token.length > 2);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function resolveFilePath(book: BookDefinition) {
  const fileName = book.fileName || `${slugify(book.subject)}.pdf`;
  return path.join(publicBookDir, fileName);
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function readCustomIndex() {
  try {
    const raw = await readFile(customIndexPath, "utf8");
    const parsed = JSON.parse(raw) as Array<{ subject: string; title: string }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getCatalogBooks(): Promise<CatalogBook[]> {
  const customEntries = await readCustomIndex();
  const customSubjects = new Map(customEntries.map((entry) => [entry.subject.toLowerCase(), entry]));
  const catalog = bookDefinitions.map((book) => {
    const filePath = resolveFilePath(book);
    const exists = existsSync(filePath);
    return {
      ...book,
      filePath,
      publicUrl: exists ? `/study_materials/${encodeURIComponent(path.basename(filePath))}` : book.sourceUrl,
      status: exists ? "Indexed" : "Not Indexed",
      canOpen: exists || Boolean(book.sourceUrl),
      canReplace: true,
      canRemove: exists,
    } satisfies CatalogBook;
  });

  for (const entry of customEntries) {
    const book = bookDefinitions.find((item) => item.subject.toLowerCase() === entry.subject.toLowerCase());
    if (book) continue;
    const filePath = path.join(publicBookDir, `${slugify(entry.subject)}.pdf`);
    const exists = existsSync(filePath);
    catalog.push({
      id: `custom-${slugify(entry.subject)}`,
      subject: entry.subject,
      title: entry.title,
      aliases: [entry.subject, entry.title].map((value) => value.toLowerCase()),
      filePath,
      publicUrl: exists ? `/study_materials/${encodeURIComponent(path.basename(filePath))}` : undefined,
      status: exists ? "Indexed" : "Not Indexed",
      canOpen: exists,
      canReplace: true,
      canRemove: exists,
    });
  }

  if (customSubjects.size) {
    for (const [subject, entry] of customSubjects) {
      const existing = catalog.find((book) => book.subject.toLowerCase() === subject);
      if (!existing) {
        const filePath = path.join(publicBookDir, `${slugify(entry.subject)}.pdf`);
        const exists = existsSync(filePath);
        catalog.push({
          id: `custom-${slugify(entry.subject)}`,
          subject: entry.subject,
          title: entry.title,
          aliases: [entry.subject, entry.title].map((value) => value.toLowerCase()),
          filePath,
          publicUrl: exists ? `/study_materials/${encodeURIComponent(path.basename(filePath))}` : undefined,
          status: exists ? "Indexed" : "Not Indexed",
          canOpen: exists,
          canReplace: true,
          canRemove: exists,
        });
      }
    }
  }

  return catalog;
}

async function fileSignature(filePath: string) {
  const stats = await stat(filePath);
  return `${stats.size}:${stats.mtimeMs}`;
}

async function computeSignature(catalog: CatalogBook[]) {
  const pieces: string[] = [];
  for (const book of catalog) {
    if (!existsSync(book.filePath)) continue;
    pieces.push(`${book.id}:${await fileSignature(book.filePath)}`);
  }
  const customStats = existsSync(customIndexPath) ? await fileSignature(customIndexPath) : "none";
  return `${pieces.join("|")}::${customStats}`;
}

async function extractPdfPages(filePath: string): Promise<IndexedPage[]> {
  const fileData = await readFile(filePath);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: new Uint8Array(fileData), useWorkerFetch: false, isEvalSupported: false }).promise;
  const pages: IndexedPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => (typeof item === "object" && item && "str" in item ? String((item as { str?: string }).str || "") : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push({ page: pageNumber, text });
  }

  return pages;
}

async function buildBookIndex() {
  await ensureDir(textbookDataDir);
  const catalog = await getCatalogBooks();
  const signature = await computeSignature(catalog);
  if (cachedBooks.length && cachedSignature === signature) return cachedBooks;
  const cached = loadCachedIndexIfFresh(signature);
  if (cached) return cached;

  if (indexBuildPromise) return indexBuildPromise;

  indexBuildPromise = (async () => {
    try {
      const index: IndexedBook[] = [];
      for (const book of catalog) {
        if (!existsSync(book.filePath)) continue;
        const pages = await extractPdfPages(book.filePath);
        index.push({ id: book.id, subject: book.subject, title: book.title, filePath: book.filePath, pages });
      }
      cachedSignature = signature;
      cachedBooks = index;
      await writeFile(cachedIndexPath, JSON.stringify({ signature, books: index }, null, 2), "utf8");
      return index;
    } finally {
      indexBuildPromise = null;
    }
  })();

  return indexBuildPromise;
}

function loadCachedIndexIfFresh(signature: string) {
  if (!existsSync(cachedIndexPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(cachedIndexPath, "utf8")) as { signature?: string; books?: IndexedBook[] };
    if (raw.signature === signature && Array.isArray(raw.books)) {
      cachedSignature = signature;
      cachedBooks = raw.books;
      return raw.books;
    }
  } catch {
    return null;
  }
  return null;
}

function extractTerms(content: string) {
  return unique(
    tokenize(content).filter((term) => !new Set(["about", "after", "also", "answer", "chapter", "class", "define", "explain", "lesson", "question", "topic", "what", "when", "where", "which", "with", "your"]).has(term)),
  );
}

function scoreText(queryTerms: string[], subjectAliases: string[], text: string, bookTitle: string) {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (normalized.includes(term)) score += term.length >= 8 ? 6 : term.length >= 5 ? 4 : 2;
  }
  for (const alias of subjectAliases) {
    if (normalized.includes(alias)) score += alias.length >= 8 ? 5 : 3;
  }
  if (bookTitle && normalized.includes(bookTitle.toLowerCase())) score += 5;
  return score;
}

function detectSubject(content: string) {
  const normalized = content.toLowerCase();
  let best: { subject: string; score: number } | null = null;
  for (const item of subjectHints) {
    const score = item.aliases.reduce((total, alias) => total + (normalized.includes(alias) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { subject: item.subject, score };
  }
  return best?.subject || null;
}

function formatPageRange(pages: number[]) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (!sorted.length) return "";
  if (sorted.length === 1) return `Page ${sorted[0]}`;
  if (sorted.length === 2) return `Pages ${sorted[0]} and ${sorted[1]}`;
  return `pp. ${sorted[0]}–${sorted[sorted.length - 1]}`;
}

function snippetAroundMatch(text: string, terms: string[]) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  let index = -1;
  for (const term of terms) {
    index = lower.indexOf(term.toLowerCase());
    if (index >= 0) break;
  }
  if (index < 0) return normalized.slice(0, 420).trim();
  const start = Math.max(0, index - 160);
  const end = Math.min(normalized.length, index + 260);
  return normalized.slice(start, end).trim();
}

function mergeHits(hits: Array<{ subject: string; title: string; page: number; text: string; score: number }>, terms: string[]) {
  const byBook = new Map<string, Array<{ page: number; text: string; score: number }>>();
  for (const hit of hits) {
    const key = `${hit.subject}::${hit.title}`;
    const list = byBook.get(key) || [];
    list.push({ page: hit.page, text: hit.text, score: hit.score });
    byBook.set(key, list);
  }

  const sources: TextbookSource[] = [];
  for (const [key, list] of byBook) {
    const [subject, title] = key.split("::");
    const sorted = list.sort((a, b) => a.page - b.page);
    const groups: Array<{ pages: number[]; text: string; score: number }> = [];
    for (const hit of sorted) {
      const last = groups[groups.length - 1];
      if (last && hit.page === last.pages[last.pages.length - 1] + 1 && last.pages.length < 3) {
        last.pages.push(hit.page);
        if (hit.score > last.score) last.score = hit.score;
        if (hit.text.length > last.text.length) last.text = hit.text;
      } else {
        groups.push({ pages: [hit.page], text: hit.text, score: hit.score });
      }
    }
    for (const group of groups.sort((a, b) => b.score - a.score).slice(0, 2)) {
      sources.push({
        subject,
        title,
        book: title,
        pages: formatPageRange(group.pages),
        excerpt: snippetAroundMatch(group.text, terms),
      });
    }
  }
  return sources;
}

export async function listTextbookLibrary() {
  return getCatalogBooks();
}

export async function saveTextbookFile(subject: string, title: string, data: Buffer) {
  await ensureDir(publicBookDir);
  const book = bookDefinitions.find((item) => item.subject.toLowerCase() === subject.toLowerCase());
  const filePath = resolveFilePath(book || { id: slugify(subject), subject, title, aliases: [] });
  await writeFile(filePath, data);
  return filePath;
}

export async function removeTextbookFile(subject: string) {
  const book = bookDefinitions.find((item) => item.subject.toLowerCase() === subject.toLowerCase());
  const filePath = resolveFilePath(book || { id: slugify(subject), subject, title: subject, aliases: [] });
  if (!existsSync(filePath)) return false;
  await rm(filePath);
  return true;
}

export async function getBookSearchContext(content: string) {
  const terms = extractTerms(content);
  const subjectHint = detectSubject(content);
  const catalog = await getCatalogBooks();
  const indexedBooks = await buildBookIndex();
  const indexedById = new Map(indexedBooks.map((book) => [book.id, book]));
  const bookLookup = new Map(catalog.map((book) => [book.id, book]));
  const query = terms.join(" ") || normalizeText(content).slice(0, 80);

  const candidateIds = subjectHint
    ? catalog.filter((book) => book.subject === subjectHint && existsSync(book.filePath)).map((book) => book.id)
    : catalog.filter((book) => existsSync(book.filePath)).map((book) => book.id);

  const scoredHits: Array<{ subject: string; title: string; page: number; text: string; score: number }> = [];

  for (const bookId of candidateIds) {
    const book = indexedById.get(bookId);
    const catalogEntry = bookLookup.get(bookId);
    if (!book || !catalogEntry) continue;
    const subjectAliases = subjectHints.find((item) => item.subject === catalogEntry.subject)?.aliases || [];
    for (const page of book.pages) {
      const score = scoreText(terms, subjectAliases, page.text, catalogEntry.title);
      if (score >= 5) scoredHits.push({ subject: catalogEntry.subject, title: catalogEntry.title, page: page.page, text: page.text, score });
    }
  }

  if (!scoredHits.length && !subjectHint) {
    for (const [bookId, book] of indexedById) {
      const catalogEntry = bookLookup.get(bookId);
      if (!catalogEntry) continue;
      const subjectAliases = subjectHints.find((item) => item.subject === catalogEntry.subject)?.aliases || [];
      for (const page of book.pages) {
        const score = scoreText(terms, subjectAliases, page.text, catalogEntry.title);
        if (score >= 7) scoredHits.push({ subject: catalogEntry.subject, title: catalogEntry.title, page: page.page, text: page.text, score });
      }
    }
  }

  scoredHits.sort((a, b) => b.score - a.score || a.page - b.page);
  const sources = mergeHits(scoredHits.slice(0, 8), terms);

  return {
    subjectHint,
    mode: sources.length ? "TEXTBOOK" : "GENERAL",
    searchTerms: terms.length ? terms : [query],
    sources,
  } satisfies TextbookContext;
}

export async function getBookIndexSignature() {
  const catalog = await getCatalogBooks();
  return computeSignature(catalog);
}

export async function refreshBookIndex() {
  cachedSignature = "";
  cachedBooks = [];
  indexBuildPromise = null;
  await buildBookIndex();
}
