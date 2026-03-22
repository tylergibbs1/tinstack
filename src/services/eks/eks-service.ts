import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface EksCluster {
  name: string;
  arn: string;
  roleArn: string;
  version: string;
  status: string;
  endpoint: string;
  certificateAuthority: { data: string };
  platformVersion: string;
  kubernetesNetworkConfig: { serviceIpv4Cidr: string };
  resourcesVpcConfig: {
    subnetIds: string[];
    securityGroupIds: string[];
    clusterSecurityGroupId: string;
    vpcId: string;
    endpointPublicAccess: boolean;
    endpointPrivateAccess: boolean;
  };
  logging: { clusterLogging: { types: string[]; enabled: boolean }[] };
  tags: Record<string, string>;
  createdAt: number;
}

export interface EksNodegroup {
  nodegroupName: string;
  nodegroupArn: string;
  clusterName: string;
  status: string;
  scalingConfig: { minSize: number; maxSize: number; desiredSize: number };
  instanceTypes: string[];
  subnets: string[];
  amiType: string;
  nodeRole: string;
  diskSize: number;
  capacityType: string;
  labels: Record<string, string>;
  tags: Record<string, string>;
  createdAt: number;
}

export interface EksFargateProfile {
  fargateProfileName: string;
  fargateProfileArn: string;
  clusterName: string;
  podExecutionRoleArn: string;
  subnets: string[];
  selectors: { namespace: string; labels?: Record<string, string> }[];
  status: string;
  tags: Record<string, string>;
  createdAt: number;
}

export class EksService {
  private clusters: StorageBackend<string, EksCluster>;
  private nodegroups: StorageBackend<string, EksNodegroup>;
  private fargateProfiles: StorageBackend<string, EksFargateProfile>;
  private resourceTags = new Map<string, Record<string, string>>();

  constructor(private accountId: string) {
    this.clusters = new InMemoryStorage();
    this.nodegroups = new InMemoryStorage();
    this.fargateProfiles = new InMemoryStorage();
  }

  private clusterKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  private nodegroupKey(region: string, clusterName: string, ngName: string): string {
    return `${region}#${clusterName}#${ngName}`;
  }

  private fargateKey(region: string, clusterName: string, fpName: string): string {
    return `${region}#${clusterName}#fp#${fpName}`;
  }

  // --- Clusters ---

  createCluster(
    name: string,
    roleArn: string,
    resourcesVpcConfig: any,
    version: string | undefined,
    tags: Record<string, string> | undefined,
    region: string,
  ): EksCluster {
    const key = this.clusterKey(region, name);
    if (this.clusters.has(key)) {
      throw new AwsError("ResourceInUseException", `Cluster already exists with name: ${name}`, 409);
    }

    const arn = buildArn("eks", region, this.accountId, "cluster/", name);
    const cluster: EksCluster = {
      name,
      arn,
      roleArn,
      version: version ?? "1.29",
      status: "ACTIVE",
      endpoint: `https://${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.gr7.${region}.eks.amazonaws.com`,
      certificateAuthority: { data: "LS0tLS1CRUdJTi..." },
      platformVersion: "eks.6",
      kubernetesNetworkConfig: { serviceIpv4Cidr: "172.20.0.0/16" },
      resourcesVpcConfig: {
        subnetIds: resourcesVpcConfig?.subnetIds ?? [],
        securityGroupIds: resourcesVpcConfig?.securityGroupIds ?? [],
        clusterSecurityGroupId: `sg-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
        vpcId: resourcesVpcConfig?.vpcId ?? `vpc-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
        endpointPublicAccess: resourcesVpcConfig?.endpointPublicAccess ?? true,
        endpointPrivateAccess: resourcesVpcConfig?.endpointPrivateAccess ?? false,
      },
      logging: {
        clusterLogging: [
          { types: ["api", "audit", "authenticator", "controllerManager", "scheduler"], enabled: false },
        ],
      },
      tags: tags ?? {},
      createdAt: Date.now() / 1000,
    };

    this.clusters.set(key, cluster);
    if (Object.keys(cluster.tags).length > 0) {
      this.resourceTags.set(arn, cluster.tags);
    }
    return cluster;
  }

  describeCluster(name: string, region: string): EksCluster {
    const key = this.clusterKey(region, name);
    const cluster = this.clusters.get(key);
    if (!cluster) {
      throw new AwsError("ResourceNotFoundException", `No cluster found for name: ${name}.`, 404);
    }
    return cluster;
  }

  listClusters(region: string): string[] {
    return this.clusters.values()
      .filter((c) => c.arn.includes(`:${region}:`))
      .map((c) => c.name);
  }

  deleteCluster(name: string, region: string): EksCluster {
    const key = this.clusterKey(region, name);
    const cluster = this.clusters.get(key);
    if (!cluster) {
      throw new AwsError("ResourceNotFoundException", `No cluster found for name: ${name}.`, 404);
    }
    // Check for attached nodegroups
    const ngs = this.nodegroups.values().filter(
      (ng) => ng.clusterName === name && ng.nodegroupArn.includes(`:${region}:`),
    );
    if (ngs.length > 0) {
      throw new AwsError("ResourceInUseException", "Cluster has nodegroups attached", 409);
    }
    cluster.status = "DELETING";
    this.clusters.delete(key);
    return cluster;
  }

  updateClusterConfig(
    name: string,
    resourcesVpcConfig: any | undefined,
    logging: any | undefined,
    region: string,
  ): EksCluster {
    const cluster = this.describeCluster(name, region);
    if (resourcesVpcConfig) {
      if (resourcesVpcConfig.endpointPublicAccess !== undefined)
        cluster.resourcesVpcConfig.endpointPublicAccess = resourcesVpcConfig.endpointPublicAccess;
      if (resourcesVpcConfig.endpointPrivateAccess !== undefined)
        cluster.resourcesVpcConfig.endpointPrivateAccess = resourcesVpcConfig.endpointPrivateAccess;
    }
    if (logging) {
      cluster.logging = logging;
    }
    return cluster;
  }

  // --- Nodegroups ---

  createNodegroup(
    clusterName: string,
    nodegroupName: string,
    nodeRole: string,
    subnets: string[],
    scalingConfig: any | undefined,
    instanceTypes: string[] | undefined,
    amiType: string | undefined,
    diskSize: number | undefined,
    capacityType: string | undefined,
    labels: Record<string, string> | undefined,
    tags: Record<string, string> | undefined,
    region: string,
  ): EksNodegroup {
    this.describeCluster(clusterName, region); // ensure cluster exists
    const key = this.nodegroupKey(region, clusterName, nodegroupName);
    if (this.nodegroups.has(key)) {
      throw new AwsError("ResourceInUseException", `NodeGroup already exists with name ${nodegroupName} and cluster name ${clusterName}`, 409);
    }

    const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const arn = buildArn("eks", region, this.accountId, `nodegroup/${clusterName}/${nodegroupName}/`, uuid);
    const ng: EksNodegroup = {
      nodegroupName,
      nodegroupArn: arn,
      clusterName,
      status: "ACTIVE",
      scalingConfig: scalingConfig ?? { minSize: 2, maxSize: 2, desiredSize: 2 },
      instanceTypes: instanceTypes ?? ["t3.medium"],
      subnets,
      amiType: amiType ?? "AL2_x86_64",
      nodeRole,
      diskSize: diskSize ?? 20,
      capacityType: capacityType ?? "ON_DEMAND",
      labels: labels ?? {},
      tags: tags ?? {},
      createdAt: Date.now() / 1000,
    };

    this.nodegroups.set(key, ng);
    return ng;
  }

  describeNodegroup(clusterName: string, nodegroupName: string, region: string): EksNodegroup {
    this.describeCluster(clusterName, region);
    const key = this.nodegroupKey(region, clusterName, nodegroupName);
    const ng = this.nodegroups.get(key);
    if (!ng) {
      throw new AwsError("ResourceNotFoundException", `No node group found for name: ${nodegroupName}.`, 404);
    }
    return ng;
  }

  listNodegroups(clusterName: string, region: string): string[] {
    this.describeCluster(clusterName, region);
    return this.nodegroups.values()
      .filter((ng) => ng.clusterName === clusterName && ng.nodegroupArn.includes(`:${region}:`))
      .map((ng) => ng.nodegroupName);
  }

  deleteNodegroup(clusterName: string, nodegroupName: string, region: string): EksNodegroup {
    const ng = this.describeNodegroup(clusterName, nodegroupName, region);
    ng.status = "DELETING";
    const key = this.nodegroupKey(region, clusterName, nodegroupName);
    this.nodegroups.delete(key);
    return ng;
  }

  // --- Fargate Profiles ---

  createFargateProfile(
    clusterName: string,
    fargateProfileName: string,
    podExecutionRoleArn: string,
    subnets: string[] | undefined,
    selectors: { namespace: string; labels?: Record<string, string> }[],
    tags: Record<string, string> | undefined,
    region: string,
  ): EksFargateProfile {
    this.describeCluster(clusterName, region);
    const key = this.fargateKey(region, clusterName, fargateProfileName);
    if (this.fargateProfiles.has(key)) {
      throw new AwsError("ResourceInUseException", "A Fargate Profile already exists with this name in this cluster.", 409);
    }

    const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const arn = buildArn("eks", region, this.accountId, `fargateprofile/${clusterName}/${fargateProfileName}/`, uuid);
    const fp: EksFargateProfile = {
      fargateProfileName,
      fargateProfileArn: arn,
      clusterName,
      podExecutionRoleArn,
      subnets: subnets ?? [],
      selectors,
      status: "ACTIVE",
      tags: tags ?? {},
      createdAt: Date.now() / 1000,
    };

    this.fargateProfiles.set(key, fp);
    return fp;
  }

  describeFargateProfile(clusterName: string, fargateProfileName: string, region: string): EksFargateProfile {
    this.describeCluster(clusterName, region);
    const key = this.fargateKey(region, clusterName, fargateProfileName);
    const fp = this.fargateProfiles.get(key);
    if (!fp) {
      throw new AwsError("ResourceNotFoundException", `No Fargate Profile found with name: ${fargateProfileName}.`, 404);
    }
    return fp;
  }

  listFargateProfiles(clusterName: string, region: string): string[] {
    this.describeCluster(clusterName, region);
    return this.fargateProfiles.values()
      .filter((fp) => fp.clusterName === clusterName && fp.fargateProfileArn.includes(`:${region}:`))
      .map((fp) => fp.fargateProfileName);
  }

  deleteFargateProfile(clusterName: string, fargateProfileName: string, region: string): EksFargateProfile {
    const fp = this.describeFargateProfile(clusterName, fargateProfileName, region);
    fp.status = "DELETING";
    const key = this.fargateKey(region, clusterName, fargateProfileName);
    this.fargateProfiles.delete(key);
    return fp;
  }

  // --- Tagging ---

  tagResource(resourceArn: string, tags: Record<string, string>): void {
    const existing = this.resourceTags.get(resourceArn) ?? {};
    for (const [k, v] of Object.entries(tags)) {
      existing[k] = v;
    }
    this.resourceTags.set(resourceArn, existing);
    // Update inline tags on cluster/nodegroup/fargate
    this.syncTagsToResource(resourceArn, existing);
  }

  untagResource(resourceArn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? {};
    for (const k of tagKeys) {
      delete existing[k];
    }
    this.resourceTags.set(resourceArn, existing);
    this.syncTagsToResource(resourceArn, existing);
  }

  listTagsForResource(resourceArn: string): Record<string, string> {
    return this.resourceTags.get(resourceArn) ?? {};
  }

  private syncTagsToResource(arn: string, tags: Record<string, string>): void {
    for (const c of this.clusters.values()) {
      if (c.arn === arn) { c.tags = { ...tags }; return; }
    }
    for (const ng of this.nodegroups.values()) {
      if (ng.nodegroupArn === arn) { ng.tags = { ...tags }; return; }
    }
    for (const fp of this.fargateProfiles.values()) {
      if (fp.fargateProfileArn === arn) { fp.tags = { ...tags }; return; }
    }
  }
}
