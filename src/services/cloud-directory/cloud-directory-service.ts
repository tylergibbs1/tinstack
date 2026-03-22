import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface CloudDir { directoryArn: string; name: string; state: string; schemaArn: string; }
export interface CloudSchema { schemaArn: string; name: string; state: string; }

export class CloudDirectoryService {
  private directories: StorageBackend<string, CloudDir>;
  private schemas: StorageBackend<string, CloudSchema>;

  constructor(private accountId: string) {
    this.directories = new InMemoryStorage();
    this.schemas = new InMemoryStorage();
  }

  createDirectory(name: string, schemaArn: string): CloudDir {
    const id = crypto.randomUUID().slice(0, 12);
    const arn = `arn:aws:clouddirectory:us-east-1:${this.accountId}:directory/${id}`;
    const dir: CloudDir = { directoryArn: arn, name, state: "ENABLED", schemaArn: schemaArn ?? "" };
    this.directories.set(arn, dir);
    return dir;
  }

  listDirectories(): CloudDir[] { return this.directories.values(); }

  getDirectory(directoryArn: string): CloudDir {
    const dir = this.directories.get(directoryArn);
    if (!dir) throw new AwsError("ResourceNotFoundException", `Directory not found`, 404);
    return dir;
  }

  deleteDirectory(directoryArn: string): void {
    if (!this.directories.has(directoryArn)) throw new AwsError("ResourceNotFoundException", `Directory not found`, 404);
    this.directories.delete(directoryArn);
  }

  createSchema(name: string): CloudSchema {
    const arn = `arn:aws:clouddirectory:us-east-1:${this.accountId}:schema/development/${name}`;
    const schema: CloudSchema = { schemaArn: arn, name, state: "DEVELOPMENT" };
    this.schemas.set(arn, schema);
    return schema;
  }

  listSchemas(): CloudSchema[] { return this.schemas.values(); }
}
