"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES } from "@/convex/lib/validators";
import { Badge, Button, Empty, ErrorNote, Field, inputClass } from "./ui";
import { errorMessage, todayIso } from "./lib";

type Category = (typeof CATEGORIES)[number];

export default function BrowseTools({ isAdmin }: { isAdmin: boolean }) {
  const [category, setCategory] = useState<Category | "">("");
  const tools = useQuery(api.tools.listAll, category ? { category } : {});

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs">
        <Field label="Category">
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {tools === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : tools.length === 0 ? (
        <Empty>No tools here yet.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} isAdmin={isAdmin} />
          ))}
        </ul>
      )}
    </div>
  );
}

type Tool = NonNullable<ReturnType<typeof useQuery<typeof api.tools.listAll>>>[number];

function ToolCard({ tool, isAdmin }: { tool: Tool; isAdmin: boolean }) {
  const [requesting, setRequesting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removeTool = useMutation(api.tools.remove);

  async function remove() {
    setError(null);
    try {
      await removeTool({ toolId: tool.id });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{tool.name}</h3>
          <p className="text-sm text-muted">
            {tool.isMine ? "Yours" : `Lent by ${tool.ownerName}`}
            {tool.ownerTrusted && " · trusted lender"}
          </p>
        </div>
        <Badge tone={tool.available ? "good" : "warn"}>{tool.available ? "Available" : "On loan"}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>{tool.category}</Badge>
        <Badge>{tool.condition}</Badge>
      </div>
      {tool.description && <p className="text-sm">{tool.description}</p>}

      <div className="flex flex-wrap gap-2">
        {!tool.isMine && !requesting && <Button onClick={() => setRequesting(true)}>Request to borrow</Button>}
        {isAdmin &&
          (confirmRemove ? (
            <>
              <Button variant="danger" onClick={remove}>
                Confirm remove
              </Button>
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setConfirmRemove(true)}>
              Remove listing
            </Button>
          ))}
      </div>
      {requesting && <RequestForm toolId={tool.id} onDone={() => setRequesting(false)} />}
      <ErrorNote message={error} />
    </li>
  );
}

function RequestForm({ toolId, onDone }: { toolId: Id<"tools">; onDone: () => void }) {
  const request = useMutation(api.loans.request);
  const [startDate, setStart] = useState(todayIso());
  const [endDate, setEnd] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await request({ toolId, startDate, endDate });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md bg-soft p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input type="date" required min={todayIso()} className={inputClass} value={startDate} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Until">
          <input type="date" required min={startDate} className={inputClass} value={endDate} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Send request
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
