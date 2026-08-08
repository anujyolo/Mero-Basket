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
    title: "AdaptEd AI — Learning that adapts to you",
    description: "A personalized learning companion that adapts lessons, assignments, quizzes, and study plans to the way each student learns best.",
    applicationName: "AdaptEd AI",
    keywords: ["personalized learning", "education", "study planner", "accessible learning", "AI learning companion"],
    openGraph: {
      title: "AdaptEd AI — One lesson. Different ways to learn.",
      description: "Personalized lessons, manageable assignments, calm focus, and study tools designed around the learner.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1536, height: 906, alt: "AdaptEd AI — One lesson. Different ways to learn." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "AdaptEd AI — One lesson. Different ways to learn.",
      description: "A calm, personalized AI learning companion for every student.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
