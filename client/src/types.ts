export interface LoginUser {
    username: string | null | undefined;
    email: string | null | undefined;
    password: string | null | undefined;
}

export interface PublicUser {
    avatarExtention: string | null | undefined;
    email: string | null | undefined;
    id: string;
    publicKey: string;
    username: string;
    passwordSalt: string | null | undefined;
}

export interface UserUpdate {
    type: string;
    newValue: string;
    password: string;
    encryptedPrivateKey?: string | null | undefined;
}
