"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Empty, ErrorNote } from "./ui";
import { AutomationNote } from "./RequestLists";
import { errorMessage } from "./lib";

// The server checks the admin role on every call here. Hiding this tab is only a convenience.
export default function AdminPanel() {
  const users = useQuery(api.users.adminList);
  const loans = useQuery(api.loans.adminAll);
  const setTrusted = useMutation(api.users.setTrustedLender);
  const [error, setError] = useState<string | null>(null);

  async function toggle(userId: NonNullable<typeof users>[number]["id"], trusted: boolean) {
    setError(null);
    try {
      await setTrusted({ userId, trusted });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <ErrorNote message={error} />

      <section className="flex flex-col gap-3">
        <h2 className="label">Lenders</h2>
        {users === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <ul className="list flex flex-col border-b border-line">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 border-t border-line py-3">
                <span className="flex items-center gap-2">
                  {u.name}
                  {u.role === "admin" && <Badge tone="warn">admin</Badge>}
                  {u.trustedLender && <Badge tone="good">trusted</Badge>}
                </span>
                <Button variant="secondary" onClick={() => toggle(u.id, !u.trustedLender)}>
                  {u.trustedLender ? "Remove trusted status" : "Mark as trusted lender"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label">All loans</h2>
        {loans === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : loans.length === 0 ? (
          <Empty>No loans yet.</Empty>
        ) : (
          <div className="overflow-x-auto border-y border-line">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr>
                  <th className="label px-3 py-3 font-normal">Tool</th>
                  <th className="label px-3 py-3 font-normal">Lender</th>
                  <th className="label px-3 py-3 font-normal">Borrower</th>
                  <th className="label px-3 py-3 font-normal">Dates</th>
                  <th className="label px-3 py-3 font-normal">Status</th>
                  <th className="label px-3 py-3 font-normal">Automation</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id} className="border-t border-line align-top">
                    <td className="px-3 py-2">{l.toolName}</td>
                    <td className="px-3 py-2">{l.lenderName}</td>
                    <td className="px-3 py-2">{l.borrowerName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {l.startDate} to {l.endDate}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        <Badge>{l.status}</Badge>
                        {l.overdue && <Badge tone="bad">overdue</Badge>}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <AutomationNote events={l.automation} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
