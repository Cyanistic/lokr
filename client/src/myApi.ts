/* eslint-disable */
/* tslint:disable */
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface AvatarResponse {
  extension: string;
}

/** @format binary */
export type BinaryFile = File;

/** A struct representing a new user to be created */
export interface CreateUser {
  /**
   * Optional email for the user
   * @example "sussyman@amogus.com"
   */
  email?: string | null;
  /**
   * The user's private key encrypted using their password
   * @example "38ZP4XEKLikREzyy9ttdaKLZ8WiWCd2i8ptTCwRwMlc="
   */
  encryptedPrivateKey: string;
  /**
   * The initialization vector for the AES encrypted user's private key
   * @example "l+EEL/mHKlkxlEG0"
   */
  iv: string;
  /**
   * The new user's password
   * Should be hashed using Argon2 before being sent to the backend
   * @minLength 8
   * @maxLength 64
   * @example "$argon2id$v=19$m=16,t=2,p=1$aUtKY1JKZjdmd3RPNmVzdA$/XFnfdBI9vbMEPNeCqlGbw"
   */
  password: string;
  /**
   * The user's public key
   * @example "d4Ogp+CI5mkdCCfXxDmmxor9FKMTQ5dq4gAvCECgcFs="
   */
  publicKey: string;
  /**
   * The salt for the PBKDF2 key derivation function
   * @example "iKJcRJf7fwtO6est"
   */
  salt: string;
  /**
   * The name of the user to create
   * @minLength 3
   * @maxLength 20
   * @example "sussyman"
   */
  username: string;
}

/**
 * A JSON response for errors that includes the error type and message
 * Used in HTTP responses to notify the client of errors
 */
export interface ErrorResponse {
  /** @example "UserError" */
  errorType: string;
  /** @example "Something went wrong" */
  message: string;
}

/** Metadata of a file or directory */
export type FileMetadata = UploadMetadata & {
  /**
   * The children of the directory.
   * Only present if the file is a directory.
   */
  children?: string[];
  /** @format date-time */
  createdAt: string;
  /**
   * The id of the file or directory
   * @format uuid
   */
  id: string;
  /** @format date-time */
  modifiedAt: string;
  /** @format uuid */
  ownerId?: string | null;
  /** @format uuid */
  uploaderId?: string | null;
};

export interface FileResponse {
  ancestors?: any[] | null;
  /** @example {"123e4567-e89b-12d3-a456-426614174000":{"children":["21f981a7-d21f-4aa5-9f6b-09005235236a"],"createdAt":"2025-03-23T02:05:34.492955664Z","encryptedFileName":"encryptedFileName","encryptedKey":"encryptedKey","encryptedMimeType":"encryptedMimeType","id":"123e4567-e89b-12d3-a456-426614174000","isDirectory":true,"modifiedAt":"2025-03-23T02:05:34.492955664Z","nonce":"exampleNonce","ownerId":"dae2b0f0-d84b-42c8-aebd-58a71ee1fb86","uploaderId":"dae2b0f0-d84b-42c8-aebd-58a71ee1fb86"},"21f981a7-d21f-4aa5-9f6b-09005235236a":{"createdAt":"2025-03-23T02:05:34.492955664Z","encryptedFileName":"encryptedFileName","encryptedKey":"encryptedKey","encryptedMimeType":"encryptedMimeType","id":"21f981a7-d21f-4aa5-9f6b-09005235236a","isDirectory":false,"modifiedAt":"2025-03-23T02:05:34.492955664Z","nonce":"exampleNonce","ownerId":"dae2b0f0-d84b-42c8-aebd-58a71ee1fb86","parentId":"123e4567-e89b-12d3-a456-426614174000","uploaderId":"dae2b0f0-d84b-42c8-aebd-58a71ee1fb86"}} */
  files: Record<string, FileMetadata>;
  /** @example "123e4567-e89b-12d3-a456-426614174000" */
  root: string[];
  /** @example "same kind of thing as files, but with `PublicUser` schema..." */
  users: Record<string, PublicUser>;
}

export enum FileSortOrder {
  Name = "name",
  Modified = "modified",
  Created = "created",
}

/** A successful login response */
export interface LoginResponse {
  /**
   * The user's private key encrypted using their password
   * @example "9WNx5GS9CSaqesguryWS-jiY8Vb0VMMjMtV5JJECk9A"
   */
  encryptedPrivateKey: string;
  /**
   * The initialization vector for the AES encrypted user's private key
   * @example "BukSfO6yaQ"
   */
  iv: string;
  /**
   * The user's public key
   * @example "QQe22k5wy-88PUFIW1P7MkgxoyMyalmjnffAuUNgMuE"
   */
  publicKey: string;
  /**
   * The salt for the PBKDF2 key derivation function
   * @example "iKJcRJf7fwtO6est"
   */
  salt: string;
}

/** A struct representing a user logging in */
export interface LoginUser {
  /** @example "$argon2id$v=19$m=16,t=2,p=1$aUtKY1JKZjdmd3RPNmVzdA$/XFnfdBI9vbMEPNeCqlGbw" */
  password: string;
  /**
   * The totp code provided by the user. Should always be exactly 6 digits
   * @example "696969"
   */
  totpCode?: string | null;
  /** @example "sussyman" */
  username: string;
}

export interface Preferences {
  gridView: boolean;
  sortOrder: FileSortOrder;
  theme: Theme;
}

export interface PublicUser {
  /** The file extension for the user's avatar */
  avatarExtension?: string | null;
  /**
   * Optional email for the user
   * @example "sussyman@amogus.com"
   */
  email?: string | null;
  /**
   * The id of the user
   * @format uuid
   */
  id: string;
  /** The password salt used when registering */
  passwordSalt?: string | null;
  /**
   * The user's public key
   * @example "QQe22k5wy-88PUFIW1P7MkgxoyMyalmjnffAuUNgMuE"
   */
  publicKey: string;
  /**
   * The name of the user
   * @example "sussyman"
   */
  username: string;
}

export interface Session {
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  lastUsedAt: string;
  /**
   * The session number. This is unique on a per-user basis.
   * @format int64
   */
  number: number;
  userAgent?: string | null;
}

/** A struct representing the currently logged in user */
export interface SessionUser {
  /** The file extension for the user's avatar */
  avatarExtension?: string | null;
  /**
   * Optional email for the user
   * @example "sussyman@amogus.com"
   */
  email?: string | null;
  /**
   * The user's private key encrypted using their password
   * @example "9WNx5GS9CSaqesguryWS-jiY8Vb0VMMjMtV5JJECk9A"
   */
  encryptedPrivateKey: string;
  /**
   * Whether the user prefers a grid view for files
   * @example true
   */
  gridView: boolean;
  /** @format uuid */
  id: string;
  /**
   * The initialization vector for the AES encrypted user's private key
   * @example "BukSfO6yaQ"
   */
  iv: string;
  /**
   * The user's public key
   * @example "QQe22k5wy-88PUFIW1P7MkgxoyMyalmjnffAuUNgMuE"
   */
  publicKey: string;
  /**
   * The salt for the PBKDF2 key derivation function
   * @example "iKJcRJf7fwtO6est"
   */
  salt: string;
  /** Default sort order for files */
  sortOrder: FileSortOrder;
  /** The theme preference of the user */
  theme: Theme;
  /**
   * The total amount of space available to the user
   * @format int64
   * @example 1000000000
   */
  totalSpace: number;
  /** Whether the user has TOTP enabled */
  totpEnabled: boolean;
  /** Whether the user has verified their TOTP key */
  totpVerified: boolean;
  /**
   * The amount of space used by the user
   * @format int64
   * @example 0
   */
  usedSpace: number;
  /**
   * The name of the user
   * @example "sussyman"
   */
  username: string;
}

export type ShareIdentifier =
  | {
      /** @format uuid */
      fileId: string;
      type: "user";
      /** @format uuid */
      userId: string;
    }
  | {
      /** @format uuid */
      linkId: string;
      /**
       * If this is NULL, this is assumed to not be changing.
       * An empty string means remove the password
       */
      password?: string | null;
      type: "link";
    };

/** A request to share a file with a user or generate a link */
export type ShareRequest = ShareRequestType & {
  /** Whether the user/link should have editing permissions */
  edit: boolean;
  /** @format uuid */
  id: string;
};

/** An enum representing the type of sharing */
export type ShareRequestType =
  | {
      encryptedKey: string;
      type: "user";
      /** @format uuid */
      userId: string;
    }
  | {
      /**
       * @format int64
       * @min 0
       */
      expires: number;
      password?: string | null;
      type: "link";
    };

export type ShareResponse = ShareResponseType & {
  /** @format date-time */
  createdAt: string;
  editPermission: boolean;
  /** @format date-time */
  modifiedAt: string;
};

export type ShareResponseType =
  | {
      type: "user";
      /** @format uuid */
      userId: string;
    }
  | {
      /** @format date-time */
      expiresAt?: string | null;
      /** @format uuid */
      linkId: string;
      passwordProtected: boolean;
      type: "link";
    };

export type ShareUpdateRequest = ShareIdentifier & {
  edit: boolean;
};

export interface SuccessResponse {
  /** @example "Yay! It worked!" */
  message: string;
}

/** Request an update to the currently authenticated user's TOTP settings */
export type TOTPRequest =
  | {
      enable: boolean;
      /** @example "$argon2id$v=19$m=16,t=2,p=1$aUtKY1JKZjdmd3RPNmVzdA$/XFnfdBI9vbMEPNeCqlGbw" */
      password: string;
      type: "enable";
    }
  | {
      /** @example "$argon2id$v=19$m=16,t=2,p=1$aUtKY1JKZjdmd3RPNmVzdA$/XFnfdBI9vbMEPNeCqlGbw" */
      password: string;
      type: "regenerate";
    }
  | {
      /** @example "696969" */
      code: string;
      type: "verify";
    };

export interface TOTPResponse {
  /**
   * The base64 encoded QR code for the TOTP secret.
   * Encoded as a PNG image to allow for easy presentation to the user.
   * @example "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0N"
   */
  qrCode: string;
}

export enum Theme {
  System = "system",
  Dark = "dark",
  Light = "light",
}

/** Move the file to a new parent */
export type UpdateFile =
  | {
      /** @example "38ZP4XEKLikREzyy9ttdaKLZ8WiWCd2i8ptTCwRwMlc=" */
      encryptedKey: string;
      /**
       * The new parent id of the file
       * @format uuid
       */
      parentId?: string | null;
      type: "move";
    }
  | {
      /**
       * The new encrypted name of the file
       * @example "38ZP4XEKLikREzyy9ttdaKLZ8WiWCd2i8ptTCwRwMlc="
       */
      encryptedName: string;
      type: "rename";
    };

/**
 * All data for the uploaded file.
 * All encrypted fields are expected to be encrypted
 * by the provided key, except for the key itself
 * which is expected to be encrypted by the user's public key
 */
export interface UploadMetadata {
  /** The encrypted name of the file to be uploaded */
  encryptedFileName: string;
  /**
   * The key used to encrypt the file
   * Should be encrypted by the user's public key
   */
  encryptedKey: string;
  /**
   * The encrypted mime type of the file to be uploaded
   * Optional in case the mime type is not known
   */
  encryptedMimeType?: string | null;
  /** Whether the file is a directory */
  isDirectory?: boolean;
  /** The nonce for the file (not encrypted) */
  nonce: string;
  /**
   * The direct parent id of the file
   * Should be null if in the root directory
   * @format uuid
   */
  parentId?: string | null;
}

/** A request to upload a file */
export interface UploadRequest {
  /**
   * The encrypted file data as bytes
   * @format binary
   */
  file?: File;
  /** @example "" */
  linkId?: string | null;
  /**
   * All data for the uploaded file.
   * All encrypted fields are expected to be encrypted
   * by the provided key, except for the key itself
   * which is expected to be encrypted by the user's public key
   */
  metadata: UploadMetadata;
}

/**
 * The size and id of the uploaded file
 * Also has a flag to indicate if the file is a directory
 */
export interface UploadResponse {
  /** @format uuid */
  id: string;
  isDirectory: boolean;
  /**
   * Used to handle the case where the file is uploaded
   * by an anonymous user.
   */
  link?: null | ShareResponse;
  /** @format int64 */
  size: number;
}

/** Update the currently authenticated user's profile */
export type UserUpdate = UserUpdateField & {
  /**
   * The new value for the field
   * @example "sussyman2"
   */
  newValue: string;
  /**
   * The user's current password to prevent accidental or
   * malicious updates
   * @example "$argon2id$v=19$m=16,t=2,p=1$aUtKY1JKZjdmd3RPNmVzdA$/XFnfdBI9vbMEPNeCqlGbw"
   */
  password: string;
};

/**
 * Update the user's password
 * Requires a new encrypted private key to be provided since
 * the password is used to derive the key for the AES encryption
 */
export type UserUpdateField =
  | {
      type: "username";
    }
  | {
      type: "email";
    }
  | {
      encryptedPrivateKey: string;
      type: "password";
    };

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<FullRequestParams, "body" | "method" | "query" | "path">;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (securityData: SecurityDataType | null) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown> extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) => fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter((key) => "undefined" !== typeof query[key]);
    return keys
      .map((key) => (Array.isArray(query[key]) ? this.addArrayQueryParam(query, key) : this.addQueryParam(query, key)))
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string") ? JSON.stringify(input) : input,
    [ContentType.Text]: (input: any) => (input !== null && typeof input !== "string" ? JSON.stringify(input) : input),
    [ContentType.FormData]: (input: any) =>
      Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData()),
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(params1: RequestParams, params2?: RequestParams): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (cancelToken: CancelToken): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(`${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`, {
      ...requestParams,
      headers: {
        ...(requestParams.headers || {}),
        ...(type && type !== ContentType.FormData ? { "Content-Type": type } : {}),
      },
      signal: (cancelToken ? this.createAbortSignal(cancelToken) : requestParams.signal) || null,
      body: typeof body === "undefined" || body === null ? null : payloadFormatter(body),
    }).then(async (response) => {
      const r = response.clone() as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const data = !responseFormat
        ? r
        : await response[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data;
    });
  };
}

/**
 * @title lokr-api
 * @version 0.1.0
 * @license AGPL-3.0-or-later
 * @contact Cyanism <github@cyan.slmail.me>
 */
export class Api<SecurityDataType extends unknown> extends HttpClient<SecurityDataType> {
  api = {
    /**
     * @description Get the avatar of a user from their id. For now, all uploaded images are converted into 256x256.
     *
     * @tags users
     * @name GetAvatar
     * @request GET:/api/avatars/{id}.{ext}
     */
    getAvatar: (id: string, ext: string, params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/api/avatars/${id}.${ext}`,
        method: "GET",
        ...params,
      }),

    /**
     * @description Check if a username or email (or both at once) is already in use
     *
     * @tags users
     * @name CheckUsage
     * @request GET:/api/check
     * @secure
     */
    checkUsage: (
      query?: {
        username?: string | null;
        email?: string | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, ErrorResponse | ErrorResponse[]>({
        path: `/api/check`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get the metadata of a file or directory. Also returns the children of a directory.
     *
     * @tags upload
     * @name GetFileMetadata
     * @request GET:/api/file
     * @secure
     */
    getFileMetadata: (
      query: {
        /**
         * The id of the file or directory to get.
         * If not provided, the root of the currently
         * authorized user directory is returned
         * @format uuid
         */
        id?: string | null;
        /**
         * The maximum depth to return children for
         * @format int32
         * @min 0
         * @max 20
         * @default 1
         */
        depth: number;
        /**
         * The offset to start returning children from
         * @format int32
         * @min 0
         * @default 0
         */
        offset: number;
        /**
         * The maximum number of children to return
         * @format int32
         * @min 0
         * @default 50
         */
        limit: number;
        /**
         * Whether to include the ancestors of the
         * chain of the file in the response
         */
        includeAncestors?: boolean;
      },
      params: RequestParams = {},
    ) =>
      this.request<FileResponse, ErrorResponse | void>({
        path: `/api/file`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get the raw contents of a file
     *
     * @tags upload
     * @name GetFile
     * @request GET:/api/file/data/{id}
     */
    getFile: (id: string, params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/api/file/data/${id}`,
        method: "GET",
        ...params,
      }),

    /**
     * @description Update a file or directory. Can be used to move or rename a file
     *
     * @tags upload
     * @name UpdateFile
     * @request PUT:/api/file/{id}
     * @secure
     */
    updateFile: (
      id: string,
      data: UpdateFile,
      query?: {
        /** @format uuid */
        linkId?: string | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, ErrorResponse>({
        path: `/api/file/${id}`,
        method: "PUT",
        query: query,
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete a file. Recursively deletes all children if the file is a directory
     *
     * @tags upload
     * @name DeleteFile
     * @request DELETE:/api/file/{id}
     * @secure
     */
    deleteFile: (
      id: string,
      query?: {
        /** @format uuid */
        linkId?: string | null;
      },
      params: RequestParams = {},
    ) =>
      this.request<SuccessResponse, ErrorResponse>({
        path: `/api/file/${id}`,
        method: "DELETE",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Authenticate a user with the backend
     *
     * @tags users
     * @name AuthenticateUser
     * @request POST:/api/login
     */
    authenticateUser: (data: LoginUser, params: RequestParams = {}) =>
      this.request<LoginResponse, LoginUser | ErrorResponse>({
        path: `/api/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Logout a user from the backend
     *
     * @tags users
     * @name Logout
     * @request POST:/api/logout
     */
    logout: (params: RequestParams = {}) =>
      this.request<LoginResponse, ErrorResponse>({
        path: `/api/logout`,
        method: "POST",
        format: "json",
        ...params,
      }),

    /**
     * @description Get the currently authenticated user
     *
     * @tags users
     * @name GetLoggedInUser
     * @request GET:/api/profile
     * @secure
     */
    getLoggedInUser: (params: RequestParams = {}) =>
      this.request<SessionUser, ErrorResponse>({
        path: `/api/profile`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Update the currently authenticated user
     *
     * @tags users
     * @name UpdateUser
     * @request PUT:/api/profile
     * @secure
     */
    updateUser: (data: UserUpdate, params: RequestParams = {}) =>
      this.request<SuccessResponse, ErrorResponse>({
        path: `/api/profile`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Update the currently authenticated user's preferences
     *
     * @tags users
     * @name UpdatePreferences
     * @request PUT:/api/profile/preferences
     */
    updatePreferences: (data: Preferences, params: RequestParams = {}) =>
      this.request<SuccessResponse, any>({
        path: `/api/profile/preferences`,
        method: "PUT",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Upload a profile image
     *
     * @tags users
     * @name UploadAvatar
     * @request PUT:/api/profile/upload
     * @secure
     */
    uploadAvatar: (data: BinaryFile, params: RequestParams = {}) =>
      this.request<AvatarResponse, ErrorResponse>({
        path: `/api/profile/upload`,
        method: "PUT",
        body: data,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Register a new user to the database
     *
     * @tags users
     * @name CreateUser
     * @request POST:/api/register
     */
    createUser: (data: CreateUser, params: RequestParams = {}) =>
      this.request<SuccessResponse, ErrorResponse>({
        path: `/api/register`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete an active session for the currently authenticated user. Requires a session number rather than a session id for security reasons.
     *
     * @tags session
     * @name DeleteSession
     * @request DELETE:/api/session/{number}
     * @secure
     */
    deleteSession: (number: number, params: RequestParams = {}) =>
      this.request<SuccessResponse, ErrorResponse>({
        path: `/api/session/${number}`,
        method: "DELETE",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get all sessions for the currently authenticated user. The list is sorted by the `lastUsedAt` field, therefore the first session in the list will always be the current session.
     *
     * @tags session
     * @name GetSessions
     * @request GET:/api/sessions
     * @secure
     */
    getSessions: (params: RequestParams = {}) =>
      this.request<Session[], ErrorResponse>({
        path: `/api/sessions`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Update permissions for a directly shared file or link.
     *
     * @tags share
     * @name UpdateSharePermission
     * @request PUT:/api/share
     * @secure
     */
    updateSharePermission: (data: ShareUpdateRequest, params: RequestParams = {}) =>
      this.request<SuccessResponse, ErrorResponse>({
        path: `/api/share`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Share a file with a user or generate a link
     *
     * @tags share
     * @name ShareFile
     * @request POST:/api/share
     */
    shareFile: (data: ShareRequest, params: RequestParams = {}) =>
      this.request<ShareResponse, ErrorResponse>({
        path: `/api/share`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Get files shared with the user
     *
     * @tags share
     * @name GetUserSharedFile
     * @request GET:/api/shared
     * @secure
     */
    getUserSharedFile: (
      query: {
        /**
         * The id of the file or directory to get.
         * If not provided, the root of the currently
         * authorized user directory is returned
         * @format uuid
         */
        id?: string | null;
        /**
         * The maximum depth to return children for
         * @format int32
         * @min 0
         * @max 20
         * @default 1
         */
        depth: number;
        /**
         * The offset to start returning children from
         * @format int32
         * @min 0
         * @default 0
         */
        offset: number;
        /**
         * The maximum number of children to return
         * @format int32
         * @min 0
         * @default 50
         */
        limit: number;
        /**
         * Whether to include the ancestors of the
         * chain of the file in the response
         */
        includeAncestors?: boolean;
      },
      params: RequestParams = {},
    ) =>
      this.request<FileResponse, ErrorResponse>({
        path: `/api/shared`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Delete an active share link or revoke user permissions for a file
     *
     * @tags share
     * @name DeleteSharePermission
     * @request DELETE:/api/shared
     * @secure
     */
    deleteSharePermission: (data: ShareIdentifier, params: RequestParams = {}) =>
      this.request<SuccessResponse, ErrorResponse>({
        path: `/api/shared`,
        method: "DELETE",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Get active links for a file
     *
     * @tags share
     * @name GetSharedLinks
     * @request GET:/api/shared/{file_id}/links
     * @secure
     */
    getSharedLinks: (fileId: string, params: RequestParams = {}) =>
      this.request<ShareResponse, ErrorResponse>({
        path: `/api/shared/${fileId}/links`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get a list of users that have permissions to a file
     *
     * @tags share
     * @name GetSharedUsers
     * @request GET:/api/shared/{file_id}/users
     * @secure
     */
    getSharedUsers: (fileId: string, params: RequestParams = {}) =>
      this.request<ShareResponse, ErrorResponse>({
        path: `/api/shared/${fileId}/users`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get information on an active link
     *
     * @tags share
     * @name GetLinkInfo
     * @request GET:/api/shared/{link_id}
     * @secure
     */
    getLinkInfo: (linkId: string, params: RequestParams = {}) =>
      this.request<SuccessResponse, ErrorResponse>({
        path: `/api/shared/${linkId}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Get files shared with the user. This is a POST request because the password is sent in the body, GET requests should not have a body.
     *
     * @tags share
     * @name GetLinkSharedFile
     * @request POST:/api/shared/{link_id}
     * @secure
     */
    getLinkSharedFile: (
      linkId: string,
      query: {
        /**
         * The id of the file or directory to get.
         * If not provided, the root of the currently
         * authorized user directory is returned
         * @format uuid
         */
        id?: string | null;
        /**
         * The maximum depth to return children for
         * @format int32
         * @min 0
         * @max 20
         * @default 1
         */
        depth: number;
        /**
         * The offset to start returning children from
         * @format int32
         * @min 0
         * @default 0
         */
        offset: number;
        /**
         * The maximum number of children to return
         * @format int32
         * @min 0
         * @default 50
         */
        limit: number;
        /**
         * Whether to include the ancestors of the
         * chain of the file in the response
         */
        includeAncestors?: boolean;
      },
      data: string | null,
      params: RequestParams = {},
    ) =>
      this.request<FileResponse, ErrorResponse>({
        path: `/api/shared/${linkId}`,
        method: "POST",
        query: query,
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Update the currently authenticated user's TOTP settings
     *
     * @tags users
     * @name UpdateTotp
     * @request PUT:/api/totp
     * @secure
     */
    updateTotp: (data: TOTPRequest, params: RequestParams = {}) =>
      this.request<SuccessResponse, ErrorResponse>({
        path: `/api/totp`,
        method: "PUT",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags upload
     * @name UploadFile
     * @request POST:/api/upload
     * @secure
     */
    uploadFile: (data: UploadRequest, params: RequestParams = {}) =>
      this.request<UploadResponse, ErrorResponse>({
        path: `/api/upload`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.FormData,
        format: "json",
        ...params,
      }),

    /**
     * @description Get information about a specific user
     *
     * @tags users
     * @name GetUser
     * @request GET:/api/user/{id}
     * @secure
     */
    getUser: (id: string, params: RequestParams = {}) =>
      this.request<PublicUser, ErrorResponse>({
        path: `/api/user/${id}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Search for users
     *
     * @tags users
     * @name SearchUsers
     * @request GET:/api/users/search/{query}
     */
    searchUsers: (
      query: string,
      queryParams: {
        sort?: "bestMatch" | "alphabetical" | "shortest";
        /**
         * @format int32
         * @min 0
         */
        limit: number;
        /**
         * @format int32
         * @min 0
         */
        offset: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<PublicUser[], ErrorResponse>({
        path: `/api/users/search/${query}`,
        method: "GET",
        query: queryParams,
        format: "json",
        ...params,
      }),
  };
}
