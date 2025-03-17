export interface LoginUser {
    username: string | null | undefined;
    email: string | null | undefined;
    password: string | null | undefined;
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
    password?: string | null;
    expires: number;
    edit: boolean;
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
    encryptedName: string;
    encryptedMimeType?: string | null;
    encryptedKey: string;
    isDirectory: boolean;
    mimeType?: string | null;
    key?: CryptoKey;
    name?: string;
    ownerId?: string | null;
    uploaderId?: string | null;
}
