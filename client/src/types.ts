import { FileMetadata as ApiFileMetadata } from "./myApi";

export interface LoginUser {
  username: string | null | undefined;
  email: string | null | undefined;
  password: string | null | undefined;
  confirmPassword?: string; // Only used for registration
}

export interface PublicUser {
  type: "user";
  avatarExtension: string | null | undefined;
  email: string | null | undefined;
  id: string;
  publicKey: string;
  username: string;
  passwordSalt: string | null | undefined;
  edit?: boolean;
}

export interface ShareLink {
  type: "link";
  id: string;
  passwordProtected: boolean;
  expiresAt?: Date | null;
  editPermission: boolean;
  createdAt: Date;
  modifiedAt: Date;
}

export interface UserUpdate {
  type: string;
  newValue: string;
  password: string;
  encryptedPrivateKey?: string | null | undefined;
}

export type FileMetadata = Omit<ApiFileMetadata, "editPermission"> & {
  mimeType?: string;
  key?: CryptoKey;
  name?: string;
  createdAtDate?: Date;
  modifiedAtDate?: Date;
  editPermission?: boolean | "children";
  blobUrl?: string;
}

export interface FileResponse {
  users: Record<string, PublicUser>;
  files: Record<string, FileMetadata>;
  root: string[];
  ancestors?: FileMetadata[];
}
