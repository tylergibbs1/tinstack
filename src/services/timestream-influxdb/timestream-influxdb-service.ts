import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface DbInstance { id: string; name: string; arn: string; status: string; dbInstanceType: string; }
export interface DbParameterGroup { id: string; name: string; arn: string; description: string; }

export class TimestreamInfluxDBService {
  private instances: StorageBackend<string, DbInstance>;
  private paramGroups: StorageBackend<string, DbParameterGroup>;

  constructor(private accountId: string) {
    this.instances = new InMemoryStorage();
    this.paramGroups = new InMemoryStorage();
  }

  createDbInstance(name: string, dbInstanceType: string): DbInstance {
    const id = crypto.randomUUID().slice(0, 10);
    const inst: DbInstance = { id, name, arn: `arn:aws:timestream-influxdb:us-east-1:${this.accountId}:db-instance/${id}`, status: "AVAILABLE", dbInstanceType: dbInstanceType ?? "db.influx.medium" };
    this.instances.set(id, inst);
    return inst;
  }

  getDbInstance(id: string): DbInstance {
    const inst = this.instances.get(id);
    if (!inst) throw new AwsError("ResourceNotFoundException", `DB instance ${id} not found`, 404);
    return inst;
  }

  listDbInstances(): DbInstance[] { return this.instances.values(); }

  deleteDbInstance(id: string): DbInstance {
    const inst = this.getDbInstance(id);
    this.instances.delete(id);
    inst.status = "DELETING";
    return inst;
  }

  createDbParameterGroup(name: string, description: string): DbParameterGroup {
    const id = crypto.randomUUID().slice(0, 10);
    const pg: DbParameterGroup = { id, name, arn: `arn:aws:timestream-influxdb:us-east-1:${this.accountId}:db-parameter-group/${id}`, description: description ?? "" };
    this.paramGroups.set(id, pg);
    return pg;
  }

  getDbParameterGroup(id: string): DbParameterGroup {
    const pg = this.paramGroups.get(id);
    if (!pg) throw new AwsError("ResourceNotFoundException", `DB parameter group ${id} not found`, 404);
    return pg;
  }

  listDbParameterGroups(): DbParameterGroup[] { return this.paramGroups.values(); }
}
