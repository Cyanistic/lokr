import Cookies from "js-cookie";
import { PublicUser } from "./types";
import { Api } from "./myApi";

// A base URL that changes based on whether the app is in development or production
// In dev this should always be the backend URL, so that `npm run dev` works properly
// but in production this should be a relative URL so that redirects work properly
export const BASE_URL = import.meta.env.DEV ? "http://localhost:6969" : "";

export const API = new Api({
  baseUrl: BASE_URL,
  // Only send credentials (cookies) in development mode to avoid
  // abuse and cross-origin issues in production
  baseApiParams: import.meta.env.DEV ? { credentials: "include" } : {},
});

/* Whether the user is authenticated
 * */
export function isAuthenticated(): boolean {
  const res = Cookies.get("authenticated");
  return Boolean(res);
}

/* Logout from the backend. Returns a boolean indicating whether the logout was successful
 * */
export async function logout(): Promise<boolean> {
  const res = await API.api.logout();
  return res.ok;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function validateEmail(email: string) {
  return EMAIL_REGEX.test(email);
}

// Fetch usernames from the API
export async function fetchUsernames(
  query: string,
  limit: number,
  offset: number,
): Promise<PublicUser> {
  const response = await API.api.searchUsers(query, {
    limit,
    offset,
  });
  if (!response.ok) throw response.error;
  return await response.json();
}

// Check if a value is in a list of valid values
export function isValidValue<T extends string>(
  value: string | null,
  validValues: readonly T[],
): string | null {
  if (validValues.includes(value as T)) {
    return value;
  } else {
    return null;
  }
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (!bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [
    "Bytes",
    "KiB",
    "MiB",
    "GiB",
    "TiB",
    "PiB",
    "EiB",
    "ZiB",
    "YiB",
  ];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
