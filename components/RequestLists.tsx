"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Empty, ErrorNote } from "./ui";
import { errorMessage, timeAgo } from "./lib";

type Status = "requested" | "approved" | "declined" | "returned" | "cancelled";
type Automation = { kind: "request_notification" | "overdue_reminder"; status: "sent" | "retrying" | "failed"; updatedAt: number }[];

const statusTone = { requested: "warn", approved: "good", declined: "bad", returned: "neutral", cancelled: "neutral" } as const;

// What the automation did for this loan, so a failed or retried run is visible here and not only in n8n.
export function AutomationNote({ events }: { events: Automation }) {
  if (events.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted">
      {events.map((e, i) => {
        const what = e.kind === "overdue_reminder" ? "Reminder" : "Notification";
        if (e.status === "sent") return <li key={i}>{what} sent {timeAgo(e.updatedAt)}</li>;
        if (e.status === "retrying") return <li key={i} className="text-warn">{what} is being retried</li>;
        return <li key={i} className="text-danger">{what} failed {timeAgo(e.updatedAt)}</li>;
      })}
    </ul>
  );
}

function LoanCard({
  toolName,
  counterpart,
  counterpartLabel,
  startDate,
  endDate,
  status,
  automation,
  children,
}: {
  toolName: string;
  counterpart: string;
  counterpartLabel: string;
  startDate: string;
  endDate: string;
  status: Status;
  automation: Automation;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 border-t border-line py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">{toolName}</h3>
          <p className="text-sm text-muted">
            {counterpartLabel} {counterpart} · {startDate} to {endDate}
          </p>
        </div>
        <Badge tone={statusTone[status]}>{status}</Badge>
      </div>
      <AutomationNote events={automation} />
      {children}
    </li>
  );
}

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run };
}

export function MyRequests() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);
  const { error, busy, run } = useAction();

  if (loans === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (loans.length === 0) return <Empty>You have not asked to borrow anything yet.</Empty>;

  return (
    <div className="flex flex-col gap-3">
      <ErrorNote message={error} />
      <ul className="list flex flex-col border-b border-line">
        {loans.map((loan) => (
          <LoanCard
            key={loan.id}
            toolName={loan.toolName}
            counterpart={loan.counterpartName}
            counterpartLabel="Owner:"
            startDate={loan.startDate}
            endDate={loan.endDate}
            status={loan.status}
            automation={loan.automation}
          >
            {loan.status === "requested" && (
              <div>
                <Button variant="secondary" disabled={busy} onClick={() => run(() => cancel({ loanId: loan.id as Id<"loans"> }))}>
                  Cancel request
                </Button>
              </div>
            )}
          </LoanCard>
        ))}
      </ul>
    </div>
  );
}

export function IncomingRequests() {
  const loans = useQuery(api.loans.incoming);
  const decide = useMutation(api.loans.decide);
  const markReturned = useMutation(api.loans.markReturned);
  const { error, busy, run } = useAction();

  if (loans === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (loans.length === 0) return <Empty>Nobody has asked to borrow your tools yet.</Empty>;

  return (
    <div className="flex flex-col gap-3">
      <ErrorNote message={error} />
      <ul className="list flex flex-col border-b border-line">
        {loans.map((loan) => (
          <LoanCard
            key={loan.id}
            toolName={loan.toolName}
            counterpart={loan.counterpartName}
            counterpartLabel="Borrower:"
            startDate={loan.startDate}
            endDate={loan.endDate}
            status={loan.status}
            automation={loan.automation}
          >
            {loan.status === "requested" && (
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => run(() => decide({ loanId: loan.id, decision: "approve" }))}>
                  Approve
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => run(() => decide({ loanId: loan.id, decision: "decline" }))}>
                  Decline
                </Button>
              </div>
            )}
            {loan.status === "approved" && (
              <div>
                <Button variant="secondary" disabled={busy} onClick={() => run(() => markReturned({ loanId: loan.id }))}>
                  Mark as returned
                </Button>
              </div>
            )}
          </LoanCard>
        ))}
      </ul>
    </div>
  );
}
