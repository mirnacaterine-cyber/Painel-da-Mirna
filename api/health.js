import { healthResponse } from "../server/handlers.js";

export function GET() {
  const database = Boolean(process.env.DATABASE_URL);
  const files = database && Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
  return healthResponse({
    mode: "vercel",
    database,
    files,
    news: true,
    calendar: true,
    requiresToken: true
  });
}
