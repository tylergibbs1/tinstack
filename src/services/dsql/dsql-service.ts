import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface DsqlCluster {
  identifier: string;
  arn: string;
  status: string;
  endpoint: string;
  creationTime: string;
  deletionProtectionEnabled: boolean;
  tags: Record<string, string>;
}

export class DsqlService {
  private clusters: StorageBackend<string, DsqlCluster>;

  constructor(private accountId: string) {
    this.clusters = new InMemoryStorage();
  }

  createCluster(region: string, deletionProtectionEnabled?: boolean, tags?: Record<string, string>): DsqlCluster {
    const id = crypto.randomUUID().slice(0, 20).replace(/-/g, "");
    const cluster: DsqlCluster = {
      identifier: id, arn: buildArn("dsql", region, this.accountId, "cluster/", id),
      status: "ACTIVE", endpoint: `${id}.dsql.${region}.on.aws`,
      creationTime: Math.floor(Date.now() / 1000),
      deletionProtectionEnabled: deletionProtectionEnabled ?? false,
      tags: tags ?? {},
    };
    this.clusters.set(id, cluster);
    return cluster;
  }

  getCluster(id: string): DsqlCluster {
    const c = this.clusters.get(id);
    if (!c) throw new AwsError("ResourceNotFoundException", `Cluster ${id} not found.`, 404);
    return c;
  }

  listClusters(): DsqlCluster[] { return this.clusters.values(); }

  deleteCluster(id: string): DsqlCluster {
    const c = this.clusters.get(id);
    if (!c) throw new AwsError("ResourceNotFoundException", `Cluster ${id} not found.`, 404);
    if (c.deletionProtectionEnabled) throw new AwsError("ValidationException", "Deletion protection is enabled.", 400);
    c.status = "DELETING";
    this.clusters.delete(id);
    return c;
  }

  updateCluster(id: string, deletionProtectionEnabled?: boolean): DsqlCluster {
    const c = this.clusters.get(id);
    if (!c) throw new AwsError("ResourceNotFoundException", `Cluster ${id} not found.`, 404);
    if (deletionProtectionEnabled !== undefined) c.deletionProtectionEnabled = deletionProtectionEnabled;
    this.clusters.set(id, c);
    return c;
  }
}
