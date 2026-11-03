import { Suspense } from "react";
import { Show, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import PublicTools from "@/components/PublicTools";

const cta = "btn inline-block bg-accent text-accent-ink transition hover:opacity-80";

export default function Home() {
  return (
    <div className="flex flex-col gap-24 pt-10">
      <section className="hero flex flex-col items-start gap-8">
        <h1 className="rise max-w-[14ch] text-[clamp(44px,9.5vw,104px)] font-bold leading-[0.98] tracking-[-0.04em] [--delay:80ms]">
          Borrow what you need. <span className="text-muted">Lend what you don&apos;t.</span>
        </h1>
        <div className="rise [--delay:180ms]">
          <Suspense>
            <Show when="signed-out">
              <SignInButton mode="modal" forceRedirectUrl="/dashboard">
                <button className={cta}>Sign in to lend or borrow</button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard" className={cta}>
                Open your dashboard
              </Link>
            </Show>
          </Suspense>
        </div>
      </section>

      <section aria-labelledby="available" className="flex max-w-3xl flex-col gap-4">
        <h2 id="available" className="label">
          Available in your neighborhood
        </h2>
        <PublicTools />
      </section>
    </div>
  );
}
