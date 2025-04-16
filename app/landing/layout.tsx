import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Document Q&A System",
  description: "Upload and ask questions about your documents with AI",
};

export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
