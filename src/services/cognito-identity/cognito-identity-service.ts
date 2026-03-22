import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface IdentityPool {
  identityPoolId: string;
  identityPoolName: string;
  allowUnauthenticatedIdentities: boolean;
  allowClassicFlow: boolean;
  supportedLoginProviders: Record<string, string>;
  developerProviderName?: string;
  identityPoolTags: Record<string, string>;
  createdAt: number;
}

export interface Identity {
  identityId: string;
  identityPoolId: string;
  logins: string[];
  createdAt: number;
}

export class CognitoIdentityService {
  private pools: StorageBackend<string, IdentityPool>;
  private identities: StorageBackend<string, Identity>;

  constructor(private accountId: string) {
    this.pools = new InMemoryStorage();
    this.identities = new InMemoryStorage();
  }

  createIdentityPool(
    name: string,
    allowUnauthenticated: boolean,
    supportedLoginProviders: Record<string, string>,
    developerProviderName: string | undefined,
    allowClassicFlow: boolean,
    tags: Record<string, string>,
    region: string,
  ): IdentityPool {
    const id = `${region}:${crypto.randomUUID()}`;
    const pool: IdentityPool = {
      identityPoolId: id,
      identityPoolName: name,
      allowUnauthenticatedIdentities: allowUnauthenticated ?? false,
      allowClassicFlow: allowClassicFlow ?? false,
      supportedLoginProviders: supportedLoginProviders ?? {},
      developerProviderName,
      identityPoolTags: tags ?? {},
      createdAt: Date.now(),
    };
    this.pools.set(id, pool);
    return pool;
  }

  describeIdentityPool(poolId: string): IdentityPool {
    const pool = this.pools.get(poolId);
    if (!pool) throw new AwsError("ResourceNotFoundException", `Identity pool ${poolId} not found.`, 400);
    return pool;
  }

  listIdentityPools(maxResults: number): IdentityPool[] {
    return this.pools.values().slice(0, maxResults || 60);
  }

  deleteIdentityPool(poolId: string): void {
    if (!this.pools.get(poolId)) throw new AwsError("ResourceNotFoundException", `Identity pool ${poolId} not found.`, 400);
    this.pools.delete(poolId);
  }

  getId(poolId: string, logins: Record<string, string> | undefined): string {
    this.describeIdentityPool(poolId); // validate pool exists
    const identityId = `${poolId.split(":")[0]}:${crypto.randomUUID()}`;
    const identity: Identity = {
      identityId,
      identityPoolId: poolId,
      logins: logins ? Object.keys(logins) : [],
      createdAt: Date.now(),
    };
    this.identities.set(identityId, identity);
    return identityId;
  }

  getCredentialsForIdentity(identityId: string): {
    identityId: string;
    credentials: { accessKeyId: string; secretKey: string; sessionToken: string; expiration: number };
  } {
    const identity = this.identities.get(identityId);
    if (!identity) throw new AwsError("ResourceNotFoundException", `Identity ${identityId} not found.`, 400);
    return {
      identityId,
      credentials: {
        accessKeyId: `ASIA${crypto.randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase()}`,
        secretKey: crypto.randomUUID().replace(/-/g, ""),
        sessionToken: `FwoGZX${crypto.randomUUID().replace(/-/g, "")}`,
        expiration: Math.floor(Date.now() / 1000) + 3600,
      },
    };
  }
}
