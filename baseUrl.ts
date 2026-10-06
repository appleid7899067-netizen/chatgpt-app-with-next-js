const isDevelopment = process.env.NODE_ENV === "development";
const configuredBaseURL = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
const renderExternalURL = process.env.RENDER_EXTERNAL_URL;
const deploymentHost =
  process.env.VERCEL_ENV === "production"
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
    : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;

const candidateBaseURL = isDevelopment
  ? configuredBaseURL || "http://localhost:3000"
  : configuredBaseURL || renderExternalURL || (deploymentHost ? `https://${deploymentHost}` : undefined);

if (!candidateBaseURL) {
  throw new Error(
    "Production app URL is not configured. Set APP_BASE_URL (or NEXT_PUBLIC_APP_URL) to the HTTPS app origin."
  );
}

let parsedBaseURL: URL;
try {
  parsedBaseURL = new URL(candidateBaseURL);
} catch {
  throw new Error("App base URL must be an absolute URL, for example https://example.com");
}

if (
  (parsedBaseURL.protocol !== "https:" && !(isDevelopment && parsedBaseURL.protocol === "http:")) ||
  parsedBaseURL.hostname === "undefined" ||
  parsedBaseURL.username ||
  parsedBaseURL.password ||
  parsedBaseURL.pathname !== "/" ||
  parsedBaseURL.search ||
  parsedBaseURL.hash
) {
  throw new Error(
    isDevelopment
      ? "App base URL must be an HTTP(S) origin without credentials, path, query, or fragment."
      : "Production app base URL must be an HTTPS origin without credentials, path, query, or fragment."
  );
}

export const baseURL = parsedBaseURL.origin;
