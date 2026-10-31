import { Suspense } from "react";
import { Show, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import PublicTools from "@/components/PublicTools";

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">LendLoop</h1>
        <p className="max-w-xl text-lg text-muted">Borrow what you need. Lend what you don&apos;t.</p>
        <Suspense>
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/dashboard">
              <button className="rounded-md bg-accent px-4 py-2 font-medium text-accent-ink hover:opacity-90">Sign in to lend or borrow</button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard" className="rounded-md bg-accent px-4 py-2 font-medium text-accent-ink hover:opacity-90">
              Open your dashboard
            </Link>
          </Show>
        </Suspense>
      </section>

      <section aria-labelledby="available" className="flex flex-col gap-3">
        <h2 id="available" className="text-lg font-semibold">
          Available in your neighborhood
        </h2>
        <PublicTools />
      </section>
    </div>
  );
}
