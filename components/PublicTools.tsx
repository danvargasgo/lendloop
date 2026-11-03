"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Empty } from "./ui";

// Anyone can see this list. The server sends only the name and category of each tool.
export default function PublicTools() {
  const tools = useQuery(api.tools.listPublic);

  if (tools === undefined) return <p className="label">Loading…</p>;
  if (tools.length === 0) return <Empty>Nothing is listed right now. Sign in and be the first to lend something.</Empty>;

  return (
    <ul className="list flex flex-col border-b border-line">
      {tools.map((tool) => (
        <li key={tool.id} className="flex items-baseline justify-between gap-6 border-t border-line py-3">
          <span>{tool.name}</span>
          <span className="label">{tool.category}</span>
        </li>
      ))}
    </ul>
  );
}
