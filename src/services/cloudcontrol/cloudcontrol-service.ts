import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface CloudControlResource {
  typeName: string;
  identifier: string;
  properties: string; // JSON string
  createdAt: number;
}

export interface ResourceRequestStatus {
  requestToken: string;
  operationStatus: string;
  typeName: string;
  identifier?: string;
  operation: string;
  statusMessage?: string;
  eventTime: number;
}

export class CloudControlService {
  private resources: StorageBackend<string, CloudControlResource>;
  private requests: StorageBackend<string, ResourceRequestStatus>;

  constructor(private accountId: string) {
    this.resources = new InMemoryStorage();
    this.requests = new InMemoryStorage();
  }

  private resourceKey(typeName: string, identifier: string): string {
    return `${typeName}|${identifier}`;
  }

  createResource(typeName: string, desiredState: string): ResourceRequestStatus {
    const props = JSON.parse(desiredState);
    const identifier = props.Id ?? props.Name ?? crypto.randomUUID();
    const resource: CloudControlResource = {
      typeName, identifier,
      properties: JSON.stringify({ ...props, Id: identifier }),
      createdAt: Date.now() / 1000,
    };
    this.resources.set(this.resourceKey(typeName, identifier), resource);

    const status: ResourceRequestStatus = {
      requestToken: crypto.randomUUID(),
      operationStatus: "SUCCESS",
      typeName, identifier,
      operation: "CREATE",
      eventTime: Date.now() / 1000,
    };
    this.requests.set(status.requestToken, status);
    return status;
  }

  getResource(typeName: string, identifier: string): CloudControlResource {
    const resource = this.resources.get(this.resourceKey(typeName, identifier));
    if (!resource) throw new AwsError("ResourceNotFoundException", `Resource ${typeName}/${identifier} not found.`, 404);
    return resource;
  }

  listResources(typeName: string): CloudControlResource[] {
    return this.resources.values().filter((r) => r.typeName === typeName);
  }

  updateResource(typeName: string, identifier: string, patchDocument: string): ResourceRequestStatus {
    const resource = this.getResource(typeName, identifier);
    const patches = JSON.parse(patchDocument);
    const props = JSON.parse(resource.properties);
    for (const patch of patches) {
      if (patch.op === "replace" || patch.op === "add") {
        const key = patch.path.replace(/^\//, "");
        props[key] = patch.value;
      } else if (patch.op === "remove") {
        const key = patch.path.replace(/^\//, "");
        delete props[key];
      }
    }
    resource.properties = JSON.stringify(props);

    const status: ResourceRequestStatus = {
      requestToken: crypto.randomUUID(),
      operationStatus: "SUCCESS",
      typeName, identifier,
      operation: "UPDATE",
      eventTime: Date.now() / 1000,
    };
    this.requests.set(status.requestToken, status);
    return status;
  }

  deleteResource(typeName: string, identifier: string): ResourceRequestStatus {
    const key = this.resourceKey(typeName, identifier);
    if (!this.resources.get(key)) throw new AwsError("ResourceNotFoundException", `Resource ${typeName}/${identifier} not found.`, 404);
    this.resources.delete(key);

    const status: ResourceRequestStatus = {
      requestToken: crypto.randomUUID(),
      operationStatus: "SUCCESS",
      typeName, identifier,
      operation: "DELETE",
      eventTime: Date.now() / 1000,
    };
    this.requests.set(status.requestToken, status);
    return status;
  }

  getResourceRequestStatus(requestToken: string): ResourceRequestStatus {
    const status = this.requests.get(requestToken);
    if (!status) throw new AwsError("RequestTokenNotFoundException", `Request token ${requestToken} not found.`, 404);
    return status;
  }
}
