// API Configuration
// `VITE_API_URL=auto` makes the frontend use the same public origin that served the app.
const envApiUrl = (import.meta.env.VITE_API_URL || "").trim();

function resolveApiBaseUrl(): string {
  if (!envApiUrl) return "";
  if (envApiUrl === "auto") {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }
  return envApiUrl;
}

export const API_BASE_URL = resolveApiBaseUrl();

// Returns true when a backend API is configured
export function isApiEnabled(): boolean {
  return envApiUrl === "auto" || !!API_BASE_URL;
}
