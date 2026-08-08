import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "../frontend/styles.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3002";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "Padhai Yatra — Learn Anytime, Anywhere",
    description: "A Grade 11 learning companion for topic explanations, quizzes, study planning, focus tracking, textbooks, and video help.",
    applicationName: "Padhai Yatra",
    keywords: ["personalized learning", "education", "study planner", "accessible learning", "AI learning companion"],
    openGraph: {
      title: "Padhai Yatra — Learn Anytime, Anywhere",
      description: "Grade 11 topic explanations, quizzes, study plans, focus tools, textbooks, and video help in one friendly learning space.",
      type: "website",
      images: [{ url: `${origin}/padhai-yatra-logo.png`, width: 561, height: 566, alt: "Padhai Yatra logo" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Padhai Yatra — Learn Anytime, Anywhere",
      description: "A calm Grade 11 learning companion for explanations, quizzes, planning, and video help.",
      images: [`${origin}/padhai-yatra-logo.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
