"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Empty } from "./ui";

// Anyone can see this list. The server sends only the name and category of each tool.
export default function PublicTools() {
  const tools = useQuery(api.tools.listPublic);

  if (tools === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (tools.length === 0) return <Empty>Nothing is listed right now. Sign in and be the first to lend something.</Empty>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <li key={tool.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
          <span className="font-medium">{tool.name}</span>
          <Badge>{tool.category}</Badge>
        </li>
      ))}
    </ul>
  );
}
