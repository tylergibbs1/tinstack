import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface Workspace {
  workspaceId: string;
  directoryId: string;
  bundleId: string;
  userName: string;
  state: string;
  workspaceProperties: Record<string, any>;
  tags: { Key: string; Value: string }[];
}

export interface WorkspaceBundle {
  bundleId: string;
  name: string;
  owner: string;
  description: string;
  computeType: { Name: string };
  rootStorage: { Capacity: string };
  userStorage: { Capacity: string };
}

export interface WorkspaceDirectory {
  directoryId: string;
  directoryName: string;
  alias: string;
  directoryType: string;
  state: string;
  registrationCode: string;
  subnetIds: string[];
  tags: { Key: string; Value: string }[];
}

export class WorkspacesService {
  private workspaces: StorageBackend<string, Workspace>;
  private bundles: StorageBackend<string, WorkspaceBundle>;
  private directories: StorageBackend<string, WorkspaceDirectory>;
  private resourceTags: StorageBackend<string, { Key: string; Value: string }[]>;

  constructor(private accountId: string) {
    this.workspaces = new InMemoryStorage();
    this.bundles = new InMemoryStorage();
    this.directories = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
  }

  createWorkspaces(
    workspaceRequests: {
      DirectoryId: string;
      BundleId: string;
      UserName: string;
      WorkspaceProperties?: Record<string, any>;
      Tags?: { Key: string; Value: string }[];
    }[],
  ): { PendingRequests: any[]; FailedRequests: any[] } {
    const pending: any[] = [];
    const failed: any[] = [];

    for (const req of workspaceRequests) {
      if (!this.directories.has(req.DirectoryId)) {
        failed.push({
          WorkspaceRequest: req,
          ErrorCode: "ResourceNotFound.Directory",
          ErrorMessage: "The specified directory could not be found.",
        });
        continue;
      }

      const workspaceId = `ws-${crypto.randomUUID().replace(/-/g, "").slice(0, 9)}`;
      const ws: Workspace = {
        workspaceId,
        directoryId: req.DirectoryId,
        bundleId: req.BundleId,
        userName: req.UserName,
        state: "AVAILABLE",
        workspaceProperties: req.WorkspaceProperties ?? { RunningMode: "ALWAYS_ON" },
        tags: req.Tags ?? [],
      };
      this.workspaces.set(workspaceId, ws);
      if (ws.tags.length > 0) {
        this.resourceTags.set(workspaceId, [...ws.tags]);
      }
      pending.push(workspaceToJson(ws));
    }

    return { PendingRequests: pending, FailedRequests: failed };
  }

  describeWorkspaces(workspaceIds?: string[], directoryId?: string): Workspace[] {
    let result = this.workspaces.values();
    if (workspaceIds?.length) {
      result = result.filter((ws) => workspaceIds.includes(ws.workspaceId));
    }
    if (directoryId) {
      result = result.filter((ws) => ws.directoryId === directoryId);
    }
    return result;
  }

  terminateWorkspaces(requests: { WorkspaceId: string }[]): { FailedRequests: any[] } {
    const failed: any[] = [];
    for (const req of requests) {
      if (!this.workspaces.has(req.WorkspaceId)) {
        failed.push({
          WorkspaceId: req.WorkspaceId,
          ErrorCode: "ResourceNotFound",
          ErrorMessage: `WorkSpace ${req.WorkspaceId} not found.`,
        });
        continue;
      }
      this.workspaces.delete(req.WorkspaceId);
    }
    return { FailedRequests: failed };
  }

  startWorkspaces(requests: { WorkspaceId: string }[]): { FailedRequests: any[] } {
    const failed: any[] = [];
    for (const req of requests) {
      const ws = this.workspaces.get(req.WorkspaceId);
      if (!ws) {
        failed.push({ WorkspaceId: req.WorkspaceId, ErrorCode: "ResourceNotFound", ErrorMessage: "Not found." });
        continue;
      }
      ws.state = "AVAILABLE";
      this.workspaces.set(req.WorkspaceId, ws);
    }
    return { FailedRequests: failed };
  }

  stopWorkspaces(requests: { WorkspaceId: string }[]): { FailedRequests: any[] } {
    const failed: any[] = [];
    for (const req of requests) {
      const ws = this.workspaces.get(req.WorkspaceId);
      if (!ws) {
        failed.push({ WorkspaceId: req.WorkspaceId, ErrorCode: "ResourceNotFound", ErrorMessage: "Not found." });
        continue;
      }
      ws.state = "STOPPED";
      this.workspaces.set(req.WorkspaceId, ws);
    }
    return { FailedRequests: failed };
  }

  rebootWorkspaces(requests: { WorkspaceId: string }[]): { FailedRequests: any[] } {
    const failed: any[] = [];
    for (const req of requests) {
      const ws = this.workspaces.get(req.WorkspaceId);
      if (!ws) {
        failed.push({ WorkspaceId: req.WorkspaceId, ErrorCode: "ResourceNotFound", ErrorMessage: "Not found." });
        continue;
      }
      ws.state = "AVAILABLE";
      this.workspaces.set(req.WorkspaceId, ws);
    }
    return { FailedRequests: failed };
  }

  createWorkspaceBundle(
    bundleName: string,
    description: string,
    computeType: string,
    rootStorageCapacity: string,
    userStorageCapacity: string,
  ): WorkspaceBundle {
    const bundleId = `wsb-${crypto.randomUUID().replace(/-/g, "").slice(0, 9)}`;
    const bundle: WorkspaceBundle = {
      bundleId,
      name: bundleName,
      owner: this.accountId,
      description,
      computeType: { Name: computeType ?? "STANDARD" },
      rootStorage: { Capacity: rootStorageCapacity ?? "80" },
      userStorage: { Capacity: userStorageCapacity ?? "50" },
    };
    this.bundles.set(bundleId, bundle);
    return bundle;
  }

  describeWorkspaceBundles(bundleIds?: string[]): WorkspaceBundle[] {
    let result = this.bundles.values();
    if (bundleIds?.length) {
      result = result.filter((b) => bundleIds.includes(b.bundleId));
    }
    return result;
  }

  createWorkspaceDirectory(
    directoryId: string,
    directoryName: string,
    subnetIds: string[],
    tags: { Key: string; Value: string }[],
  ): WorkspaceDirectory {
    if (this.directories.has(directoryId)) {
      throw new AwsError("ResourceAlreadyExistsException", `Directory ${directoryId} is already registered.`, 400);
    }
    const dir: WorkspaceDirectory = {
      directoryId,
      directoryName: directoryName ?? directoryId,
      alias: directoryId,
      directoryType: "SIMPLE_AD",
      state: "REGISTERED",
      registrationCode: `SLiad+${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      subnetIds: subnetIds ?? [],
      tags: tags ?? [],
    };
    this.directories.set(directoryId, dir);
    if (dir.tags.length > 0) {
      this.resourceTags.set(directoryId, [...dir.tags]);
    }
    return dir;
  }

  describeWorkspaceDirectories(directoryIds?: string[]): WorkspaceDirectory[] {
    let result = this.directories.values();
    if (directoryIds?.length) {
      result = result.filter((d) => directoryIds.includes(d.directoryId));
    }
    return result;
  }

  registerWorkspaceDirectory(
    directoryId: string,
    subnetIds: string[],
    enableSelfService: boolean,
    tenancy: string,
    tags: { Key: string; Value: string }[],
  ): void {
    if (this.directories.has(directoryId)) {
      throw new AwsError("ResourceAlreadyExistsException", `Directory ${directoryId} is already registered.`, 400);
    }
    const dir: WorkspaceDirectory = {
      directoryId,
      directoryName: directoryId,
      alias: directoryId,
      directoryType: "SIMPLE_AD",
      state: "REGISTERED",
      registrationCode: `SLiad+${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      subnetIds: subnetIds ?? [],
      tags: tags ?? [],
    };
    this.directories.set(directoryId, dir);
  }

  deregisterWorkspaceDirectory(directoryId: string): void {
    if (!this.directories.has(directoryId)) {
      throw new AwsError("ResourceNotFoundException", `Directory ${directoryId} not found.`, 400);
    }
    this.directories.delete(directoryId);
  }

  createTags(resourceId: string, tags: { Key: string; Value: string }[]): void {
    const existing = this.resourceTags.get(resourceId) ?? [];
    for (const tag of tags) {
      const idx = existing.findIndex((t) => t.Key === tag.Key);
      if (idx >= 0) existing[idx] = tag;
      else existing.push(tag);
    }
    this.resourceTags.set(resourceId, existing);
  }

  describeTags(resourceId: string): { Key: string; Value: string }[] {
    return this.resourceTags.get(resourceId) ?? [];
  }

  deleteTags(resourceId: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(resourceId) ?? [];
    const filtered = existing.filter((t) => !tagKeys.includes(t.Key));
    this.resourceTags.set(resourceId, filtered);
  }
}

function workspaceToJson(ws: Workspace): any {
  return {
    WorkspaceId: ws.workspaceId,
    DirectoryId: ws.directoryId,
    BundleId: ws.bundleId,
    UserName: ws.userName,
    State: ws.state,
    WorkspaceProperties: ws.workspaceProperties,
  };
}
