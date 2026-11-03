"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS } from "@/convex/lib/validators";
import { Badge, Button, Empty, ErrorNote, Field, inputClass } from "./ui";
import { errorMessage } from "./lib";

type Category = (typeof CATEGORIES)[number];
type Condition = (typeof CONDITIONS)[number];
type Draft = { name: string; category: Category; condition: Condition; description: string };
const blank: Draft = { name: "", category: "power tools", condition: "good", description: "" };

export default function MyListings() {
  const tools = useQuery(api.tools.mine);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-3">
        <h2 className="label">List a tool</h2>
        <ToolForm submitLabel="List tool" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label">Your listings</h2>
        {tools === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : tools.length === 0 ? (
          <Empty>You have not listed anything yet.</Empty>
        ) : (
          <ul className="flex flex-col border-b border-line">
            {tools.map((tool) => (
              <li key={tool.id} className="flex flex-col gap-3 border-t border-line py-5">
                {editing === tool.id ? (
                  <ToolForm toolId={tool.id} initial={tool} submitLabel="Save" onDone={() => setEditing(null)} />
                ) : (
                  <Row tool={tool} onEdit={() => setEditing(tool.id)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ tool, onEdit }: { tool: { id: Id<"tools">; name: string; category: string; condition: string; description: string; available: boolean }; onEdit: () => void }) {
  const removeTool = useMutation(api.tools.remove);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function remove() {
    setError(null);
    try {
      await removeTool({ toolId: tool.id });
    } catch (e) {
      setError(errorMessage(e));
      setConfirm(false);
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">{tool.name}</h3>
          {tool.description && <p className="text-sm text-muted">{tool.description}</p>}
        </div>
        <Badge tone={tool.available ? "good" : "warn"}>{tool.available ? "Available" : "On loan"}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>{tool.category}</Badge>
        <Badge>{tool.condition}</Badge>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        {confirm ? (
          <>
            <Button variant="danger" onClick={remove}>
              Confirm delete
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            Delete
          </Button>
        )}
      </div>
      <ErrorNote message={error} />
    </>
  );
}

function ToolForm({
  toolId,
  initial,
  submitLabel,
  onDone,
}: {
  toolId?: Id<"tools">;
  initial?: Draft;
  submitLabel: string;
  onDone?: () => void;
}) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const [draft, setDraft] = useState<Draft>(
    initial ? { name: initial.name, category: initial.category, condition: initial.condition, description: initial.description } : blank,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (toolId) await update({ toolId, ...draft });
      else {
        await create(draft);
        setDraft(blank);
      }
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 border border-line p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input required maxLength={80} className={inputClass} value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Category">
          <select className={inputClass} value={draft.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Condition">
          <select className={inputClass} value={draft.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
            {CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Short description">
        <textarea rows={2} maxLength={500} className={inputClass} value={draft.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        {onDone && (
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
