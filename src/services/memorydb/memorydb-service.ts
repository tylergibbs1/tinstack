import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface Cluster { name: string; arn: string; status: string; nodeType: string; engineVersion: string; numberOfShards: number; subnetGroupName?: string; parameterGroupName?: string; aclName: string; createdAt: number; tags: { Key: string; Value: string }[]; }
interface SubnetGroup { name: string; arn: string; description: string; subnetIds: string[]; vpcId: string; }
interface ParameterGroup { name: string; arn: string; family: string; description: string; }
interface MemoryDBUser { name: string; arn: string; status: string; accessString: string; authentication: { type: string }; }
interface ACL { name: string; arn: string; status: string; userNames: string[]; }

export class MemoryDBService {
  private clusters: StorageBackend<string, Cluster>;
  private subnetGroups: StorageBackend<string, SubnetGroup>;
  private parameterGroups: StorageBackend<string, ParameterGroup>;
  private users: StorageBackend<string, MemoryDBUser>;
  private acls: StorageBackend<string, ACL>;

  constructor(private accountId: string) {
    this.clusters = new InMemoryStorage();
    this.subnetGroups = new InMemoryStorage();
    this.parameterGroups = new InMemoryStorage();
    this.users = new InMemoryStorage();
    this.acls = new InMemoryStorage();
  }

  private rk(region: string, name: string): string { return `${region}#${name}`; }

  createCluster(name: string, nodeType: string, aclName: string, engineVersion: string | undefined, numberOfShards: number | undefined, subnetGroupName: string | undefined, parameterGroupName: string | undefined, tags: { Key: string; Value: string }[] | undefined, region: string): Cluster {
    const key = this.rk(region, name);
    if (this.clusters.has(key)) throw new AwsError("ClusterAlreadyExistsFault", `Cluster ${name} already exists.`, 400);
    const arn = buildArn("memorydb", region, this.accountId, "cluster/", name);
    const cluster: Cluster = { name, arn, status: "available", nodeType: nodeType ?? "db.t4g.small", engineVersion: engineVersion ?? "7.0", numberOfShards: numberOfShards ?? 1, subnetGroupName, parameterGroupName, aclName: aclName ?? "open-access", createdAt: Date.now() / 1000, tags: tags ?? [] };
    this.clusters.set(key, cluster);
    return cluster;
  }

  describeClusters(clusterName: string | undefined, region: string): Cluster[] {
    if (clusterName) {
      const c = this.clusters.get(this.rk(region, clusterName));
      if (!c) throw new AwsError("ClusterNotFoundFault", `Cluster ${clusterName} not found.`, 400);
      return [c];
    }
    return this.clusters.values().filter((c) => c.arn.includes(`:${region}:`));
  }

  deleteCluster(name: string, region: string): Cluster {
    const key = this.rk(region, name);
    const c = this.clusters.get(key);
    if (!c) throw new AwsError("ClusterNotFoundFault", `Cluster ${name} not found.`, 400);
    this.clusters.delete(key);
    c.status = "deleting";
    return c;
  }

  updateCluster(name: string, updates: any, region: string): Cluster {
    const key = this.rk(region, name);
    const c = this.clusters.get(key);
    if (!c) throw new AwsError("ClusterNotFoundFault", `Cluster ${name} not found.`, 400);
    if (updates.NodeType) c.nodeType = updates.NodeType;
    if (updates.EngineVersion) c.engineVersion = updates.EngineVersion;
    return c;
  }

  createSubnetGroup(name: string, subnetIds: string[], description: string | undefined, region: string): SubnetGroup {
    const key = this.rk(region, name);
    if (this.subnetGroups.has(key)) throw new AwsError("SubnetGroupAlreadyExistsFault", `Subnet group ${name} already exists.`, 400);
    const sg: SubnetGroup = { name, arn: buildArn("memorydb", region, this.accountId, "subnetgroup/", name), description: description ?? "", subnetIds, vpcId: "vpc-" + crypto.randomUUID().slice(0, 8) };
    this.subnetGroups.set(key, sg);
    return sg;
  }

  describeSubnetGroups(name: string | undefined, region: string): SubnetGroup[] {
    if (name) { const sg = this.subnetGroups.get(this.rk(region, name)); return sg ? [sg] : []; }
    return this.subnetGroups.values().filter((sg) => sg.arn.includes(`:${region}:`));
  }

  deleteSubnetGroup(name: string, region: string): void {
    const key = this.rk(region, name);
    if (!this.subnetGroups.has(key)) throw new AwsError("SubnetGroupNotFoundFault", `Subnet group ${name} not found.`, 400);
    this.subnetGroups.delete(key);
  }

  createParameterGroup(name: string, family: string, description: string | undefined, region: string): ParameterGroup {
    const key = this.rk(region, name);
    if (this.parameterGroups.has(key)) throw new AwsError("ParameterGroupAlreadyExistsFault", `Parameter group ${name} already exists.`, 400);
    const pg: ParameterGroup = { name, arn: buildArn("memorydb", region, this.accountId, "parametergroup/", name), family: family ?? "memorydb_redis7", description: description ?? "" };
    this.parameterGroups.set(key, pg);
    return pg;
  }

  describeParameterGroups(name: string | undefined, region: string): ParameterGroup[] {
    if (name) { const pg = this.parameterGroups.get(this.rk(region, name)); return pg ? [pg] : []; }
    return this.parameterGroups.values().filter((pg) => pg.arn.includes(`:${region}:`));
  }

  createUser(name: string, accessString: string, authType: string | undefined, region: string): MemoryDBUser {
    const key = this.rk(region, name);
    if (this.users.has(key)) throw new AwsError("UserAlreadyExistsFault", `User ${name} already exists.`, 400);
    const user: MemoryDBUser = { name, arn: buildArn("memorydb", region, this.accountId, "user/", name), status: "active", accessString: accessString ?? "on ~* +@all", authentication: { type: authType ?? "no-password-required" } };
    this.users.set(key, user);
    return user;
  }

  describeUsers(name: string | undefined, region: string): MemoryDBUser[] {
    if (name) { const u = this.users.get(this.rk(region, name)); return u ? [u] : []; }
    return this.users.values().filter((u) => u.arn.includes(`:${region}:`));
  }

  createACL(name: string, userNames: string[] | undefined, region: string): ACL {
    const key = this.rk(region, name);
    if (this.acls.has(key)) throw new AwsError("ACLAlreadyExistsFault", `ACL ${name} already exists.`, 400);
    const acl: ACL = { name, arn: buildArn("memorydb", region, this.accountId, "acl/", name), status: "active", userNames: userNames ?? [] };
    this.acls.set(key, acl);
    return acl;
  }

  describeACLs(name: string | undefined, region: string): ACL[] {
    if (name) { const a = this.acls.get(this.rk(region, name)); return a ? [a] : []; }
    return this.acls.values().filter((a) => a.arn.includes(`:${region}:`));
  }

  tagResource(arn: string, tags: { Key: string; Value: string }[]): { Key: string; Value: string }[] {
    const cluster = this.clusters.values().find((c) => c.arn === arn);
    if (cluster) { for (const t of tags) { const idx = cluster.tags.findIndex((x) => x.Key === t.Key); if (idx >= 0) cluster.tags[idx] = t; else cluster.tags.push(t); } return cluster.tags; }
    throw new AwsError("InvalidARNFault", `Resource ${arn} not found.`, 400);
  }

  untagResource(arn: string, tagKeys: string[]): { Key: string; Value: string }[] {
    const cluster = this.clusters.values().find((c) => c.arn === arn);
    if (cluster) { cluster.tags = cluster.tags.filter((t) => !tagKeys.includes(t.Key)); return cluster.tags; }
    throw new AwsError("InvalidARNFault", `Resource ${arn} not found.`, 400);
  }

  listTags(arn: string): { Key: string; Value: string }[] {
    const cluster = this.clusters.values().find((c) => c.arn === arn);
    if (cluster) return cluster.tags;
    throw new AwsError("InvalidARNFault", `Resource ${arn} not found.`, 400);
  }
}
