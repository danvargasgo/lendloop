import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClerkProvider, Show, SignInButton, UserButton } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LendLoop",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <ClerkProvider>
          <ConvexClientProvider>
            <header>
              <div className="mx-auto flex w-full max-w-5xl items-baseline justify-between gap-4 px-5 py-6">
                <Link href="/" className="text-base font-bold tracking-tight">
                  LendLoop
                </Link>
                <nav className="flex items-center gap-6">
                  <Suspense>
                    <Show when="signed-in">
                      <Link href="/dashboard" className="label hover:text-ink">
                        Dashboard
                      </Link>
                      <UserButton />
                    </Show>
                    <Show when="signed-out">
                      <SignInButton mode="modal" forceRedirectUrl="/dashboard">
                        <button className="label hover:text-ink">Sign in</button>
                      </SignInButton>
                    </Show>
                  </Suspense>
                </nav>
              </div>
            </header>
            <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-32 pt-6">{children}</main>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
