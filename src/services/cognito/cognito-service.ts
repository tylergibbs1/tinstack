import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface UserPool {
  id: string;
  name: string;
  arn: string;
  creationDate: number;
  lastModifiedDate: number;
  status: string;
  policies?: { PasswordPolicy?: PasswordPolicy };
  schema?: SchemaAttribute[];
  autoVerifiedAttributes?: string[];
  usernameAttributes?: string[];
  mfaConfiguration?: string;
}

export interface PasswordPolicy {
  MinimumLength?: number;
  RequireUppercase?: boolean;
  RequireLowercase?: boolean;
  RequireNumbers?: boolean;
  RequireSymbols?: boolean;
}

export interface SchemaAttribute {
  Name: string;
  AttributeDataType: string;
  Required?: boolean;
  Mutable?: boolean;
}

export interface UserPoolClient {
  clientId: string;
  clientName: string;
  userPoolId: string;
  clientSecret?: string;
  explicitAuthFlows?: string[];
  allowedOAuthFlows?: string[];
  allowedOAuthScopes?: string[];
  callbackURLs?: string[];
  logoutURLs?: string[];
  creationDate: number;
  lastModifiedDate: number;
}

export interface CognitoUser {
  username: string;
  userPoolId: string;
  attributes: Record<string, string>;
  enabled: boolean;
  userStatus: string;
  createdDate: number;
  lastModifiedDate: number;
  password?: string;
  confirmed: boolean;
  mfaEnabled: boolean;
}

export interface AuthResult {
  AccessToken: string;
  IdToken: string;
  RefreshToken: string;
  ExpiresIn: number;
  TokenType: string;
}

export class CognitoService {
  private pools: StorageBackend<string, UserPool>;
  private clients: StorageBackend<string, UserPoolClient>;
  private users: StorageBackend<string, CognitoUser>;
  private poolCounter = 0;
  private clientIdToPoolId: Map<string, string> = new Map();
  private refreshTokenToUsername: Map<string, { username: string; userPoolId: string }> = new Map();
  private confirmationCodes: Map<string, string> = new Map(); // "poolId#username" -> code
  private accessTokenToUser: Map<string, { username: string; userPoolId: string }> = new Map();
  private invalidatedRefreshTokens: Set<string> = new Set();

  constructor(private accountId: string) {
    this.pools = new InMemoryStorage();
    this.clients = new InMemoryStorage();
    this.users = new InMemoryStorage();
  }

  private regionKey(region: string, id: string): string {
    return `${region}#${id}`;
  }

  createUserPool(poolName: string, policies: any, schema: any[], autoVerifiedAttributes: string[] | undefined, region: string): UserPool {
    const id = `${region}_${crypto.randomUUID().replace(/-/g, "").slice(0, 9)}`;
    const now = Date.now() / 1000;
    const pool: UserPool = {
      id,
      name: poolName,
      arn: buildArn("cognito-idp", region, this.accountId, "userpool/", id),
      creationDate: now,
      lastModifiedDate: now,
      status: "Enabled",
      policies,
      schema,
      autoVerifiedAttributes,
      mfaConfiguration: "OFF",
    };
    this.pools.set(this.regionKey(region, id), pool);
    return pool;
  }

  describeUserPool(userPoolId: string, region: string): UserPool {
    const pool = this.pools.get(this.regionKey(region, userPoolId));
    if (!pool) throw new AwsError("ResourceNotFoundException", `User pool ${userPoolId} not found.`, 400);
    return pool;
  }

  deleteUserPool(userPoolId: string, region: string): void {
    const key = this.regionKey(region, userPoolId);
    if (!this.pools.has(key)) throw new AwsError("ResourceNotFoundException", `User pool ${userPoolId} not found.`, 400);
    this.pools.delete(key);
    // Clean up users and clients
    for (const k of this.users.keys()) {
      if (k.includes(userPoolId)) this.users.delete(k);
    }
    for (const k of this.clients.keys()) {
      if (k.includes(userPoolId)) this.clients.delete(k);
    }
  }

  listUserPools(region: string, maxResults?: number): UserPool[] {
    const pools = this.pools.values().filter((p) => p.arn.includes(`:${region}:`));
    return pools.slice(0, maxResults ?? 60);
  }

  updateUserPool(userPoolId: string, updates: Partial<UserPool>, region: string): UserPool {
    const pool = this.describeUserPool(userPoolId, region);
    Object.assign(pool, updates, { lastModifiedDate: Date.now() / 1000 });
    return pool;
  }

  createUserPoolClient(userPoolId: string, clientName: string, explicitAuthFlows: string[] | undefined, region: string): UserPoolClient {
    this.describeUserPool(userPoolId, region); // Verify pool exists
    const clientId = crypto.randomUUID().replace(/-/g, "").slice(0, 26);
    const now = Date.now() / 1000;
    const client: UserPoolClient = {
      clientId,
      clientName,
      userPoolId,
      explicitAuthFlows,
      creationDate: now,
      lastModifiedDate: now,
    };
    this.clients.set(`${userPoolId}#${clientId}`, client);
    this.clientIdToPoolId.set(clientId, userPoolId);
    return client;
  }

  describeUserPoolClient(userPoolId: string, clientId: string, region: string): UserPoolClient {
    const client = this.clients.get(`${userPoolId}#${clientId}`);
    if (!client) throw new AwsError("ResourceNotFoundException", `Client ${clientId} not found.`, 400);
    return client;
  }

  resolvePoolIdFromClientId(clientId: string): string {
    const poolId = this.clientIdToPoolId.get(clientId);
    if (!poolId) throw new AwsError("ResourceNotFoundException", `Client ${clientId} not found.`, 400);
    return poolId;
  }

  deleteUserPoolClient(userPoolId: string, clientId: string, region: string): void {
    this.clients.delete(`${userPoolId}#${clientId}`);
    this.clientIdToPoolId.delete(clientId);
  }

  listUserPoolClients(userPoolId: string, region: string): UserPoolClient[] {
    return this.clients.values().filter((c) => c.userPoolId === userPoolId);
  }

  signUp(userPoolId: string, username: string, password: string, userAttributes: { Name: string; Value: string }[], region: string): CognitoUser {
    this.describeUserPool(userPoolId, region);
    const key = `${userPoolId}#${username}`;
    if (this.users.has(key)) throw new AwsError("UsernameExistsException", `User already exists.`, 400);

    const attrs: Record<string, string> = {};
    for (const a of userAttributes ?? []) attrs[a.Name] = a.Value;
    if (!attrs.sub) attrs.sub = crypto.randomUUID();

    const now = Date.now() / 1000;
    const user: CognitoUser = {
      username,
      userPoolId,
      attributes: attrs,
      enabled: true,
      userStatus: "UNCONFIRMED",
      createdDate: now,
      lastModifiedDate: now,
      password,
      confirmed: false,
      mfaEnabled: false,
    };
    this.users.set(key, user);
    return user;
  }

  confirmSignUp(userPoolId: string, username: string, region: string): void {
    const user = this.getUser(userPoolId, username);
    user.userStatus = "CONFIRMED";
    user.confirmed = true;
    user.lastModifiedDate = Date.now() / 1000;
  }

  adminCreateUser(userPoolId: string, username: string, temporaryPassword: string | undefined, userAttributes: { Name: string; Value: string }[], region: string): CognitoUser {
    this.describeUserPool(userPoolId, region);
    const key = `${userPoolId}#${username}`;
    if (this.users.has(key)) throw new AwsError("UsernameExistsException", `User already exists.`, 400);

    const attrs: Record<string, string> = {};
    for (const a of userAttributes ?? []) attrs[a.Name] = a.Value;
    if (!attrs.sub) attrs.sub = crypto.randomUUID();

    const now = Date.now() / 1000;
    const user: CognitoUser = {
      username,
      userPoolId,
      attributes: attrs,
      enabled: true,
      userStatus: "FORCE_CHANGE_PASSWORD",
      createdDate: now,
      lastModifiedDate: now,
      password: temporaryPassword,
      confirmed: true,
      mfaEnabled: false,
    };
    this.users.set(key, user);
    return user;
  }

  adminGetUser(userPoolId: string, username: string, region: string): CognitoUser {
    return this.getUser(userPoolId, username);
  }

  adminDeleteUser(userPoolId: string, username: string, region: string): void {
    const key = `${userPoolId}#${username}`;
    if (!this.users.has(key)) throw new AwsError("UserNotFoundException", `User ${username} not found.`, 400);
    this.users.delete(key);
  }

  adminDisableUser(userPoolId: string, username: string, region: string): void {
    const user = this.getUser(userPoolId, username);
    user.enabled = false;
  }

  adminEnableUser(userPoolId: string, username: string, region: string): void {
    const user = this.getUser(userPoolId, username);
    user.enabled = true;
  }

  adminUpdateUserAttributes(userPoolId: string, username: string, attributes: { Name: string; Value: string }[], region: string): void {
    const user = this.getUser(userPoolId, username);
    for (const a of attributes) user.attributes[a.Name] = a.Value;
    user.lastModifiedDate = Date.now() / 1000;
  }

  listUsers(userPoolId: string, region: string, limit?: number, filter?: string): CognitoUser[] {
    const users = this.users.values().filter((u) => u.userPoolId === userPoolId);
    return users.slice(0, limit ?? 60);
  }

  initiateAuth(userPoolId: string, clientId: string, authFlow: string, authParameters: Record<string, string>, region: string): { AuthenticationResult?: AuthResult; ChallengeName?: string; Session?: string; ChallengeParameters?: Record<string, string> } {
    this.describeUserPool(userPoolId, region);

    if (authFlow === "USER_PASSWORD_AUTH" || authFlow === "ADMIN_USER_PASSWORD_AUTH") {
      const username = authParameters.USERNAME;
      const password = authParameters.PASSWORD;
      const user = this.getUser(userPoolId, username);

      if (!user.enabled) throw new AwsError("NotAuthorizedException", "User is disabled.", 400);
      if (user.password !== password) throw new AwsError("NotAuthorizedException", "Incorrect username or password.", 400);
      if (!user.confirmed) throw new AwsError("UserNotConfirmedException", "User is not confirmed.", 400);

      // If user is in FORCE_CHANGE_PASSWORD status, issue challenge
      if (user.userStatus === "FORCE_CHANGE_PASSWORD") {
        const session = Buffer.from(crypto.randomUUID()).toString("base64");
        return {
          ChallengeName: "NEW_PASSWORD_REQUIRED",
          Session: session,
          ChallengeParameters: {
            USER_ID_FOR_SRP: username,
            userAttributes: JSON.stringify(Object.entries(user.attributes).map(([Name, Value]) => ({ Name, Value }))),
          },
        };
      }

      return { AuthenticationResult: this.generateTokens(user, userPoolId, clientId, region) };
    }

    if (authFlow === "REFRESH_TOKEN_AUTH" || authFlow === "REFRESH_TOKEN") {
      const refreshToken = authParameters.REFRESH_TOKEN;
      if (this.invalidatedRefreshTokens.has(refreshToken)) {
        throw new AwsError("NotAuthorizedException", "Refresh token has been revoked.", 400);
      }
      const tokenInfo = this.refreshTokenToUsername.get(refreshToken);
      let sub: string;
      let username: string;
      let email: string | undefined;
      if (tokenInfo) {
        const user = this.getUser(tokenInfo.userPoolId, tokenInfo.username);
        sub = user.attributes.sub ?? crypto.randomUUID();
        username = user.username;
        email = user.attributes.email;
      } else {
        sub = crypto.randomUUID();
        username = "unknown";
      }
      return {
        AuthenticationResult: {
          AccessToken: this.generateJwt({ sub, username, token_use: "access", client_id: clientId }, region, userPoolId),
          IdToken: this.generateJwt({ sub, username, token_use: "id", email }, region, userPoolId),
          ExpiresIn: 3600,
          TokenType: "Bearer",
        } as any,
      };
    }

    throw new AwsError("InvalidParameterException", `Auth flow ${authFlow} is not supported.`, 400);
  }

  forgotPassword(clientId: string, username: string, region: string): { CodeDeliveryDetails: any } {
    const poolId = this.resolvePoolIdFromClientId(clientId);
    const user = this.getUser(poolId, username);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.confirmationCodes.set(`${poolId}#${username}`, code);

    const email = user.attributes.email ?? "u***@e***.com";
    const masked = email.replace(/^(.).*(@.).*(\..*)$/, "$1***$2***$3");
    return {
      CodeDeliveryDetails: {
        Destination: masked,
        DeliveryMedium: "EMAIL",
        AttributeName: "email",
      },
    };
  }

  confirmForgotPassword(clientId: string, username: string, confirmationCode: string, password: string, region: string): void {
    const poolId = this.resolvePoolIdFromClientId(clientId);
    const key = `${poolId}#${username}`;
    const storedCode = this.confirmationCodes.get(key);
    if (!storedCode || storedCode !== confirmationCode) {
      throw new AwsError("CodeMismatchException", "Invalid verification code provided.", 400);
    }
    const user = this.getUser(poolId, username);
    user.password = password;
    user.lastModifiedDate = Date.now() / 1000;
    this.confirmationCodes.delete(key);
  }

  changePassword(accessToken: string, previousPassword: string, proposedPassword: string): void {
    const userInfo = this.resolveUserFromAccessToken(accessToken);
    const user = this.getUser(userInfo.userPoolId, userInfo.username);
    if (user.password !== previousPassword) {
      throw new AwsError("NotAuthorizedException", "Incorrect username or password.", 400);
    }
    user.password = proposedPassword;
    user.lastModifiedDate = Date.now() / 1000;
  }

  adminSetUserPassword(userPoolId: string, username: string, password: string, permanent: boolean, region: string): void {
    const user = this.getUser(userPoolId, username);
    user.password = password;
    if (permanent) {
      user.userStatus = "CONFIRMED";
    } else {
      user.userStatus = "FORCE_CHANGE_PASSWORD";
    }
    user.lastModifiedDate = Date.now() / 1000;
  }

  adminConfirmSignUp(userPoolId: string, username: string, region: string): void {
    const user = this.getUser(userPoolId, username);
    user.userStatus = "CONFIRMED";
    user.confirmed = true;
    user.lastModifiedDate = Date.now() / 1000;
  }

  getUserByAccessToken(accessToken: string): CognitoUser {
    const userInfo = this.resolveUserFromAccessToken(accessToken);
    return this.getUser(userInfo.userPoolId, userInfo.username);
  }

  respondToAuthChallenge(clientId: string, challengeName: string, challengeResponses: Record<string, string>, region: string): { AuthenticationResult?: AuthResult } {
    const poolId = this.resolvePoolIdFromClientId(clientId);

    if (challengeName === "NEW_PASSWORD_REQUIRED") {
      const username = challengeResponses.USERNAME;
      const newPassword = challengeResponses.NEW_PASSWORD;
      if (!username || !newPassword) {
        throw new AwsError("InvalidParameterException", "USERNAME and NEW_PASSWORD are required.", 400);
      }
      const user = this.getUser(poolId, username);
      user.password = newPassword;
      user.userStatus = "CONFIRMED";
      user.lastModifiedDate = Date.now() / 1000;
      return { AuthenticationResult: this.generateTokens(user, poolId, clientId, region) };
    }

    throw new AwsError("InvalidParameterException", `Challenge ${challengeName} is not supported.`, 400);
  }

  globalSignOut(accessToken: string): void {
    const userInfo = this.resolveUserFromAccessToken(accessToken);
    // Invalidate all refresh tokens for this user
    for (const [token, info] of this.refreshTokenToUsername.entries()) {
      if (info.username === userInfo.username && info.userPoolId === userInfo.userPoolId) {
        this.invalidatedRefreshTokens.add(token);
      }
    }
  }

  private resolveUserFromAccessToken(accessToken: string): { username: string; userPoolId: string } {
    // Try the cached mapping first
    const cached = this.accessTokenToUser.get(accessToken);
    if (cached) return cached;
    // Decode the JWT to find the username
    try {
      const parts = accessToken.split(".");
      if (parts.length !== 3) throw new Error("Invalid token");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      if (!payload.username) throw new Error("No username in token");
      // Extract pool ID from iss: https://cognito-idp.{region}.amazonaws.com/{poolId}
      const iss = payload.iss ?? "";
      const poolId = iss.split("/").pop() ?? "";
      if (!poolId) throw new Error("No pool ID in token");
      return { username: payload.username, userPoolId: poolId };
    } catch {
      throw new AwsError("NotAuthorizedException", "Invalid access token.", 400);
    }
  }

  private getUser(userPoolId: string, username: string): CognitoUser {
    const key = `${userPoolId}#${username}`;
    const user = this.users.get(key);
    if (!user) throw new AwsError("UserNotFoundException", `User ${username} not found.`, 400);
    return user;
  }

  private generateTokens(user: CognitoUser, userPoolId: string, clientId: string, region: string): AuthResult {
    const sub = user.attributes.sub ?? crypto.randomUUID();
    const refreshToken = Buffer.from(crypto.randomUUID()).toString("base64");
    this.refreshTokenToUsername.set(refreshToken, { username: user.username, userPoolId });
    const accessToken = this.generateJwt({ sub, username: user.username, token_use: "access", client_id: clientId }, region, userPoolId);
    this.accessTokenToUser.set(accessToken, { username: user.username, userPoolId });
    return {
      AccessToken: accessToken,
      IdToken: this.generateJwt({ sub, username: user.username, token_use: "id", email: user.attributes.email, ...user.attributes }, region, userPoolId),
      RefreshToken: refreshToken,
      ExpiresIn: 3600,
      TokenType: "Bearer",
    };
  }

  private generateJwt(payload: Record<string, any>, region: string, userPoolId: string): string {
    const header = { alg: "RS256", typ: "JWT", kid: "tinstack-key-1" };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      iss: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
      iat: now,
      exp: now + 3600,
      auth_time: now,
    };
    const h = Buffer.from(JSON.stringify(header)).toString("base64url");
    const p = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
    // Fake signature — sufficient for local testing
    const sig = Buffer.from("tinstack-signature").toString("base64url");
    return `${h}.${p}.${sig}`;
  }
}
