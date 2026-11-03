"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import AdminPanel from "./AdminPanel";
import BrowseTools from "./BrowseTools";
import { IncomingRequests, MyRequests } from "./RequestLists";
import MyListings from "./MyListings";
import { Badge, ErrorNote } from "./ui";
import { errorMessage } from "./lib";

type Tab = "browse" | "listings" | "requests" | "incoming" | "admin";

export default function Dashboard() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("browse");

  // Record the signed in user once. The server never lets this call change a role.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    storeUser()
      .then(() => !cancelled && setReady(true))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, storeUser]);

  const me = useQuery(api.users.me, ready ? {} : "skip");

  if (isLoading || (isAuthenticated && !ready && !error)) return <p className="text-sm text-muted">Loading your dashboard…</p>;
  if (!isAuthenticated) return <p className="text-sm text-muted">Sign in to see your dashboard.</p>;
  if (error) return <ErrorNote message={error} />;
  if (!me) return <p className="text-sm text-muted">Loading your dashboard…</p>;

  const isAdmin = me.role === "admin";
  const tabs: { id: Tab; label: string }[] = [
    { id: "browse", label: "Browse tools" },
    { id: "listings", label: "My listings" },
    { id: "requests", label: "My requests" },
    { id: "incoming", label: "Incoming requests" },
    ...(isAdmin ? [{ id: "admin" as const, label: "Admin" }] : []),
  ];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[clamp(34px,6vw,56px)] font-bold leading-none tracking-[-0.03em]">Hi, {me.name.split(" ")[0]}</h1>
        {isAdmin && <Badge tone="warn">Admin</Badge>}
        {me.trustedLender && <Badge tone="good">Trusted lender</Badge>}
      </div>

      <div role="tablist" aria-label="Dashboard sections" className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`tab -mb-px border-b-2 px-0 py-3 font-medium ${tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "browse" && <BrowseTools isAdmin={isAdmin} />}
        {tab === "listings" && <MyListings />}
        {tab === "requests" && <MyRequests />}
        {tab === "incoming" && <IncomingRequests />}
        {tab === "admin" && isAdmin && <AdminPanel />}
      </div>
    </div>
  );
}
