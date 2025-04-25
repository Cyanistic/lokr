import Cookies from "js-cookie";
import { FileMetadata, PublicUser } from "./types";
import { Api, FileSortOrder } from "./myApi";
import { PublicUser as ApiPublicUser } from "./myApi";

// A base URL that changes based on whether the app is in development or production
// In dev this should always be the backend URL, so that `npm run dev` works properly
// but in production this should be a relative URL so that redirects work properly
export const BASE_URL = import.meta.env.DEV ? "http://localhost:6969" : "";
export const NONCE_LENGTH = 12;

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

export function gridToList(inputOrder: FileSortOrder): string {
  switch (inputOrder) {
    case "created":
      return "createdAtDate";
    case "modified":
      return "modifiedAtDate";
    case "uploader":
      return "uploaderId";
    case "owner":
      return "ownerId";
    default:
      return inputOrder;
  }
}

export function listToGrid(inputOrder: string): FileSortOrder {
  switch (inputOrder) {
    case "createdAtDate":
      return "created";
    case "modifiedAtDate":
      return "modified";
    case "uploaderId":
      return "uploader";
    case "ownerId":
      return "owner";
    default:
      return inputOrder as FileSortOrder;
  }
}

export function getExtension(file: FileMetadata | string) {
  let fileName;
  if (typeof file === "string") {
    fileName = file;
  } else {
    fileName = file.name ?? file.encryptedFileName;
  }
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex > 0 ? fileName.slice(lastDotIndex + 1).toLowerCase() : "";
}

export function sortFiles(
  files: FileMetadata[],
  sortBy: FileSortOrder,
  sortOrder: "asc" | "desc",
  users?: Record<string, ApiPublicUser>,
): FileMetadata[] {
  const direction = sortOrder === "asc" ? 1 : -1;

  return [...files].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return (
          direction *
          (a.name ?? a.encryptedFileName).localeCompare(
            b.name ?? b.encryptedFileName,
          )
        );

      case "created": {
        const aCreated = a.createdAtDate!.getTime();
        const bCreated = b.createdAtDate!.getTime();
        return direction * (aCreated - bCreated);
      }

      case "modified": {
        const aModified = a.modifiedAtDate!.getTime();
        const bModified = b.modifiedAtDate!.getTime();
        return direction * (aModified - bModified);
      }

      case "size":
        return direction * ((a.size || 0) - (b.size || 0));

      case "owner":
        return (
          direction *
          (
            (a.ownerId && users?.[a.ownerId]?.username) ||
            "Anonymous"
          ).localeCompare(
            (b.ownerId && users?.[b.ownerId]?.username) || "Anonymous",
          )
        );

      case "uploader":
        return (
          direction *
          (
            (a.uploaderId && users?.[a.uploaderId]?.username) ||
            "Anonymous"
          ).localeCompare(
            (b.uploaderId && users?.[b.uploaderId]?.username) || "Anonymous",
          )
        );

      case "extension": {
        const aExt = getExtension(a);
        const bExt = getExtension(b);

        return direction * aExt.localeCompare(bExt);
      }

      default:
        return (
          direction *
          (a.name ?? a.encryptedFileName).localeCompare(
            b.name ?? b.encryptedFileName,
          )
        );
    }
  });
}

// Generate a share link based on a given link id and key
export function generateShareLink(linkId: string, key?: string | null) {
  return `${window.location.protocol}//${window.location.host}/share?linkId=${linkId}${key ? `#${key}` : ""}`;
}
