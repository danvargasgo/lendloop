"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL. Copy .env.example to .env.local and fill it in.");

const convex = new ConvexReactClient(url);

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
