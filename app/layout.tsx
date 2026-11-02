import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist } from "next/font/google";
import { ClerkProvider, Show, SignInButton, UserButton } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LendLoop",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ClerkProvider>
          <ConvexClientProvider>
            <header className="border-b border-line">
              <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
                <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                  <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full border-2 border-accent text-accent">
                    ↻
                  </span>
                  LendLoop
                </Link>
                <nav className="flex items-center gap-3 text-sm">
                  <Suspense>
                    <Show when="signed-in">
                      <Link href="/dashboard" className="text-muted hover:text-ink">
                        Dashboard
                      </Link>
                      <UserButton />
                    </Show>
                    <Show when="signed-out">
                      <SignInButton mode="modal" forceRedirectUrl="/dashboard">
                        <button className="rounded-md border border-line px-3 py-1.5 hover:bg-soft">Sign in</button>
                      </SignInButton>
                    </Show>
                  </Suspense>
                </nav>
              </div>
            </header>
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
