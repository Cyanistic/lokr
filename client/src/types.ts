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

export interface FileMetadata {
  id: string;
  encryptedFileName: string;
  encryptedMimeType?: string;
  mimeType?: string;
  encryptedKey: string;
  isDirectory: boolean;
  fileNonce?: string | null;
  keyNonce?: string | null;
  mimeTypeNonce?: string | null;
  nameNonce: string;
  parentId?: string | null;
  key?: CryptoKey;
  name?: string;
  ownerId?: string;
  uploaderId?: string;
  children?: string[];
  createdAt: string;
  modifiedAt: string;
  createdAtDate?: Date;
  modifiedAtDate?: Date;
  size: number;
  editPermission?: boolean | "children";
  blobUrl?: string;
}

export interface FileResponse {
  users: Record<string, PublicUser>;
  files: Record<string, FileMetadata>;
  root: string[];
  ancestors?: FileMetadata[];
}
