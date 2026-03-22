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
    return client;
  }

  describeUserPoolClient(userPoolId: string, clientId: string, region: string): UserPoolClient {
    const client = this.clients.get(`${userPoolId}#${clientId}`);
    if (!client) throw new AwsError("ResourceNotFoundException", `Client ${clientId} not found.`, 400);
    return client;
  }

  deleteUserPoolClient(userPoolId: string, clientId: string, region: string): void {
    this.clients.delete(`${userPoolId}#${clientId}`);
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

  initiateAuth(userPoolId: string, clientId: string, authFlow: string, authParameters: Record<string, string>, region: string): { AuthenticationResult?: AuthResult; ChallengeName?: string } {
    this.describeUserPool(userPoolId, region);

    if (authFlow === "USER_PASSWORD_AUTH" || authFlow === "ADMIN_USER_PASSWORD_AUTH") {
      const username = authParameters.USERNAME;
      const password = authParameters.PASSWORD;
      const user = this.getUser(userPoolId, username);

      if (!user.enabled) throw new AwsError("UserNotConfirmedException", "User is disabled.", 400);
      if (user.password !== password) throw new AwsError("NotAuthorizedException", "Incorrect username or password.", 400);
      if (!user.confirmed) throw new AwsError("UserNotConfirmedException", "User is not confirmed.", 400);

      return { AuthenticationResult: this.generateTokens(user, userPoolId, clientId, region) };
    }

    if (authFlow === "REFRESH_TOKEN_AUTH" || authFlow === "REFRESH_TOKEN") {
      // Just generate new tokens
      const sub = crypto.randomUUID();
      return {
        AuthenticationResult: {
          AccessToken: this.generateJwt({ sub, token_use: "access", client_id: clientId }, region, userPoolId),
          IdToken: this.generateJwt({ sub, token_use: "id", email: "refreshed@example.com" }, region, userPoolId),
          RefreshToken: "",
          ExpiresIn: 3600,
          TokenType: "Bearer",
        },
      };
    }

    throw new AwsError("InvalidParameterException", `Auth flow ${authFlow} is not supported.`, 400);
  }

  private getUser(userPoolId: string, username: string): CognitoUser {
    const key = `${userPoolId}#${username}`;
    const user = this.users.get(key);
    if (!user) throw new AwsError("UserNotFoundException", `User ${username} not found.`, 400);
    return user;
  }

  private generateTokens(user: CognitoUser, userPoolId: string, clientId: string, region: string): AuthResult {
    const sub = user.attributes.sub ?? crypto.randomUUID();
    return {
      AccessToken: this.generateJwt({ sub, username: user.username, token_use: "access", client_id: clientId }, region, userPoolId),
      IdToken: this.generateJwt({ sub, username: user.username, token_use: "id", email: user.attributes.email, ...user.attributes }, region, userPoolId),
      RefreshToken: Buffer.from(crypto.randomUUID()).toString("base64"),
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
