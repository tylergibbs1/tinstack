import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface AppRegistryApp {
  id: string; arn: string; name: string; description: string; creationTime: string;
  resources: { name: string; arn: string }[];
}

export class ServiceCatalogAppRegistryService {
  private apps: StorageBackend<string, AppRegistryApp>;

  constructor(private accountId: string) {
    this.apps = new InMemoryStorage();
  }

  createApplication(name: string, description: string): AppRegistryApp {
    const id = crypto.randomUUID().slice(0, 12);
    const app: AppRegistryApp = { id, arn: `arn:aws:servicecatalog:us-east-1:${this.accountId}:/applications/${id}`, name, description: description ?? "", creationTime: new Date().toISOString(), resources: [] };
    this.apps.set(id, app);
    return app;
  }

  getApplication(id: string): AppRegistryApp {
    const app = this.apps.get(id);
    if (!app) throw new AwsError("ResourceNotFoundException", `Application ${id} not found`, 404);
    return app;
  }

  listApplications(): AppRegistryApp[] { return this.apps.values(); }

  deleteApplication(id: string): void {
    if (!this.apps.has(id)) throw new AwsError("ResourceNotFoundException", `Application ${id} not found`, 404);
    this.apps.delete(id);
  }

  associateResource(appId: string, resourceType: string, resource: string): void {
    const app = this.getApplication(appId);
    app.resources.push({ name: resourceType, arn: resource });
  }

  listAssociatedResources(appId: string): { name: string; arn: string }[] {
    return this.getApplication(appId).resources;
  }
}
