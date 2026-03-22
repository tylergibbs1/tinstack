import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface MediaStoreObject {
  path: string;
  contentType: string;
  contentLength: number;
  lastModified: string;
  eTag: string;
  data: Uint8Array;
}

export class MediaStoreDataService {
  private objects: StorageBackend<string, MediaStoreObject>;

  constructor(private accountId: string) {
    this.objects = new InMemoryStorage();
  }

  putObject(path: string, data: Uint8Array, contentType: string): MediaStoreObject {
    const obj: MediaStoreObject = {
      path, contentType: contentType ?? "application/octet-stream",
      contentLength: data.length, lastModified: new Date().toISOString(),
      eTag: crypto.randomUUID().slice(0, 8), data,
    };
    this.objects.set(path, obj);
    return obj;
  }

  getObject(path: string): MediaStoreObject {
    const obj = this.objects.get(path);
    if (!obj) throw new AwsError("ObjectNotFoundException", `Object ${path} not found`, 404);
    return obj;
  }

  deleteObject(path: string): void {
    this.objects.delete(path);
  }

  describeObject(path: string): Omit<MediaStoreObject, "data"> {
    const obj = this.getObject(path);
    const { data: _, ...meta } = obj;
    return meta;
  }

  listItems(path?: string): Omit<MediaStoreObject, "data">[] {
    const prefix = path ?? "/";
    return this.objects.values()
      .filter((o) => o.path.startsWith(prefix))
      .map(({ data: _, ...meta }) => meta);
  }
}
