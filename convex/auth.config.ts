import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // The Clerk Frontend API URL, set as CLERK_JWT_ISSUER_DOMAIN on the Convex deployment.
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
