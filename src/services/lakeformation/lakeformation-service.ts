import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface LfResource {
  resourceArn: string;
  roleArn: string;
}

export interface LfPermission {
  principal: { DataLakePrincipalIdentifier: string };
  resource: Record<string, any>;
  permissions: string[];
  permissionsWithGrantOption: string[];
}

export interface LfTag {
  catalogId: string;
  tagKey: string;
  tagValues: string[];
}

export interface DataLakeSettings {
  DataLakeAdmins: { DataLakePrincipalIdentifier: string }[];
  CreateDatabaseDefaultPermissions: any[];
  CreateTableDefaultPermissions: any[];
  TrustedResourceOwners: string[];
  AllowExternalDataFiltering: boolean;
  ExternalDataFilteringAllowList: any[];
}

function defaultSettings(): DataLakeSettings {
  return {
    DataLakeAdmins: [],
    CreateDatabaseDefaultPermissions: [
      { Principal: { DataLakePrincipalIdentifier: "IAM_ALLOWED_PRINCIPALS" }, Permissions: ["ALL"] },
    ],
    CreateTableDefaultPermissions: [
      { Principal: { DataLakePrincipalIdentifier: "IAM_ALLOWED_PRINCIPALS" }, Permissions: ["ALL"] },
    ],
    TrustedResourceOwners: [],
    AllowExternalDataFiltering: false,
    ExternalDataFilteringAllowList: [],
  };
}

export class LakeFormationService {
  private resources: StorageBackend<string, LfResource>;
  private permissions: LfPermission[];
  private settings: Map<string, DataLakeSettings>;
  private lfTags: StorageBackend<string, LfTag>;
  private resourceLfTags: Map<string, { TagKey: string; TagValues: string[] }[]>;

  constructor(private accountId: string) {
    this.resources = new InMemoryStorage();
    this.permissions = [];
    this.settings = new Map();
    this.lfTags = new InMemoryStorage();
    this.resourceLfTags = new Map();
  }

  registerResource(resourceArn: string, roleArn: string): void {
    if (this.resources.has(resourceArn)) {
      throw new AwsError("AlreadyExistsException", "Resource is already registered.", 400);
    }
    this.resources.set(resourceArn, { resourceArn, roleArn: roleArn ?? "" });
  }

  deregisterResource(resourceArn: string): void {
    if (!this.resources.has(resourceArn)) {
      throw new AwsError("EntityNotFoundException", "Resource not found.", 400);
    }
    this.resources.delete(resourceArn);
  }

  listResources(): LfResource[] {
    return this.resources.values();
  }

  grantPermissions(
    principal: { DataLakePrincipalIdentifier: string },
    resource: Record<string, any>,
    permissions: string[],
    permissionsWithGrantOption: string[],
  ): void {
    const existing = this.permissions.find(
      (p) =>
        p.principal.DataLakePrincipalIdentifier === principal.DataLakePrincipalIdentifier &&
        JSON.stringify(p.resource) === JSON.stringify(resource),
    );
    if (existing) {
      const merged = new Set([...existing.permissions, ...permissions]);
      existing.permissions = [...merged];
      const mergedGrant = new Set([...existing.permissionsWithGrantOption, ...(permissionsWithGrantOption ?? [])]);
      existing.permissionsWithGrantOption = [...mergedGrant];
    } else {
      this.permissions.push({
        principal,
        resource,
        permissions: permissions ?? [],
        permissionsWithGrantOption: permissionsWithGrantOption ?? [],
      });
    }
  }

  revokePermissions(
    principal: { DataLakePrincipalIdentifier: string },
    resource: Record<string, any>,
    permissionsToRevoke: string[],
    permissionsWithGrantOptionToRevoke: string[],
  ): void {
    const existing = this.permissions.find(
      (p) =>
        p.principal.DataLakePrincipalIdentifier === principal.DataLakePrincipalIdentifier &&
        JSON.stringify(p.resource) === JSON.stringify(resource),
    );
    if (existing) {
      existing.permissions = existing.permissions.filter((p) => !permissionsToRevoke.includes(p));
      existing.permissionsWithGrantOption = existing.permissionsWithGrantOption.filter(
        (p) => !(permissionsWithGrantOptionToRevoke ?? []).includes(p),
      );
      if (existing.permissions.length === 0 && existing.permissionsWithGrantOption.length === 0) {
        const idx = this.permissions.indexOf(existing);
        this.permissions.splice(idx, 1);
      }
    }
  }

  listPermissions(
    principal?: { DataLakePrincipalIdentifier: string },
    resource?: Record<string, any>,
  ): LfPermission[] {
    let result = [...this.permissions];
    if (principal) {
      result = result.filter(
        (p) => p.principal.DataLakePrincipalIdentifier === principal.DataLakePrincipalIdentifier,
      );
    }
    if (resource) {
      result = result.filter((p) => {
        const pResource = p.resource;
        for (const key of Object.keys(resource)) {
          if (!(key in pResource)) return false;
        }
        return true;
      });
    }
    return result;
  }

  getDataLakeSettings(catalogId: string): DataLakeSettings {
    return this.settings.get(catalogId) ?? defaultSettings();
  }

  putDataLakeSettings(catalogId: string, settings: DataLakeSettings): void {
    this.settings.set(catalogId, settings);
  }

  createLFTag(catalogId: string, tagKey: string, tagValues: string[]): void {
    const key = `${catalogId}:${tagKey}`;
    if (this.lfTags.has(key)) {
      throw new AwsError("AlreadyExistsException", `Tag ${tagKey} already exists.`, 400);
    }
    this.lfTags.set(key, { catalogId, tagKey, tagValues });
  }

  getLFTag(catalogId: string, tagKey: string): LfTag {
    const key = `${catalogId}:${tagKey}`;
    const tag = this.lfTags.get(key);
    if (!tag) throw new AwsError("EntityNotFoundException", `Tag ${tagKey} not found.`, 400);
    return tag;
  }

  listLFTags(catalogId: string): LfTag[] {
    return this.lfTags.values().filter((t) => t.catalogId === catalogId);
  }

  deleteLFTag(catalogId: string, tagKey: string): void {
    const key = `${catalogId}:${tagKey}`;
    if (!this.lfTags.has(key)) {
      throw new AwsError("EntityNotFoundException", `Tag ${tagKey} not found.`, 400);
    }
    this.lfTags.delete(key);
  }

  addLFTagsToResource(
    resource: Record<string, any>,
    lfTags: { TagKey: string; TagValues: string[] }[],
  ): { Failures: any[] } {
    const resourceKey = JSON.stringify(resource);
    const existing = this.resourceLfTags.get(resourceKey) ?? [];
    for (const tag of lfTags) {
      const idx = existing.findIndex((t) => t.TagKey === tag.TagKey);
      if (idx >= 0) existing[idx] = tag;
      else existing.push(tag);
    }
    this.resourceLfTags.set(resourceKey, existing);
    return { Failures: [] };
  }

  getResourceLFTags(resource: Record<string, any>): { TagKey: string; TagValues: string[] }[] {
    const resourceKey = JSON.stringify(resource);
    return this.resourceLfTags.get(resourceKey) ?? [];
  }

  removeLFTagsFromResource(
    resource: Record<string, any>,
    lfTags: { TagKey: string; TagValues: string[] }[],
  ): { Failures: any[] } {
    const resourceKey = JSON.stringify(resource);
    const existing = this.resourceLfTags.get(resourceKey) ?? [];
    const tagKeysToRemove = lfTags.map((t) => t.TagKey);
    this.resourceLfTags.set(
      resourceKey,
      existing.filter((t) => !tagKeysToRemove.includes(t.TagKey)),
    );
    return { Failures: [] };
  }
}
