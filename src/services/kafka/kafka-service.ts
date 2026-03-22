import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface KafkaCluster {
  clusterArn: string;
  clusterName: string;
  clusterType: string;
  state: string;
  currentVersion: string;
  kafkaVersion: string;
  numberOfBrokerNodes: number;
  brokerNodeGroupInfo: Record<string, any>;
  encryptionInfo?: Record<string, any>;
  enhancedMonitoring: string;
  tags: Record<string, string>;
  creationTime: string;
}

export interface KafkaConfiguration {
  arn: string;
  name: string;
  revision: number;
  kafkaVersions: string[];
  serverProperties: string;
  description: string;
  state: string;
  creationTime: string;
}

export class KafkaService {
  private clusters: StorageBackend<string, KafkaCluster>;
  private configurations: StorageBackend<string, KafkaConfiguration>;
  private tags = new Map<string, Record<string, string>>();

  constructor(
    private accountId: string,
    private region: string,
  ) {
    this.clusters = new InMemoryStorage();
    this.configurations = new InMemoryStorage();
  }

  // --- Clusters ---

  createCluster(params: {
    clusterName: string;
    kafkaVersion?: string;
    numberOfBrokerNodes?: number;
    brokerNodeGroupInfo?: Record<string, any>;
    encryptionInfo?: Record<string, any>;
    enhancedMonitoring?: string;
    tags?: Record<string, string>;
  }): KafkaCluster {
    const clusterId = crypto.randomUUID();
    const clusterArn = `arn:aws:kafka:${this.region}:${this.accountId}:cluster/${params.clusterName}/${clusterId}`;

    const cluster: KafkaCluster = {
      clusterArn,
      clusterName: params.clusterName,
      clusterType: "PROVISIONED",
      state: "ACTIVE",
      currentVersion: "K1",
      kafkaVersion: params.kafkaVersion ?? "2.8.1",
      numberOfBrokerNodes: params.numberOfBrokerNodes ?? 3,
      brokerNodeGroupInfo: params.brokerNodeGroupInfo ?? {
        instanceType: "kafka.m5.large",
        clientSubnets: ["subnet-1"],
      },
      encryptionInfo: params.encryptionInfo,
      enhancedMonitoring: params.enhancedMonitoring ?? "DEFAULT",
      tags: params.tags ?? {},
      creationTime: new Date().toISOString(),
    };

    this.clusters.set(clusterArn, cluster);
    if (params.tags) this.tags.set(clusterArn, { ...params.tags });
    return cluster;
  }

  describeCluster(clusterArn: string): KafkaCluster {
    const cluster = this.clusters.get(clusterArn);
    if (!cluster) throw new AwsError("NotFoundException", `Cluster ${clusterArn} does not exist.`, 404);
    return cluster;
  }

  listClusters(): KafkaCluster[] {
    return this.clusters.values();
  }

  deleteCluster(clusterArn: string): KafkaCluster {
    const cluster = this.describeCluster(clusterArn);
    this.clusters.delete(clusterArn);
    cluster.state = "DELETING";
    return cluster;
  }

  updateBrokerCount(clusterArn: string, targetNumberOfBrokerNodes: number): KafkaCluster {
    const cluster = this.describeCluster(clusterArn);
    cluster.numberOfBrokerNodes = targetNumberOfBrokerNodes;
    cluster.currentVersion = `K${parseInt(cluster.currentVersion.substring(1)) + 1}`;
    this.clusters.set(clusterArn, cluster);
    return cluster;
  }

  updateBrokerStorage(clusterArn: string, targetBrokerEBSVolumeInfo: any[]): KafkaCluster {
    const cluster = this.describeCluster(clusterArn);
    cluster.currentVersion = `K${parseInt(cluster.currentVersion.substring(1)) + 1}`;
    this.clusters.set(clusterArn, cluster);
    return cluster;
  }

  listNodes(clusterArn: string): any[] {
    const cluster = this.describeCluster(clusterArn);
    const nodes = [];
    for (let i = 0; i < cluster.numberOfBrokerNodes; i++) {
      nodes.push({
        nodeType: "BROKER",
        brokerNodeInfo: {
          brokerId: i + 1,
          clientSubnet: cluster.brokerNodeGroupInfo.clientSubnets?.[0] ?? "subnet-1",
          endpoints: [`b-${i + 1}.kafka.${this.region}.amazonaws.com`],
        },
      });
    }
    return nodes;
  }

  getBootstrapBrokers(clusterArn: string): { bootstrapBrokerString: string; bootstrapBrokerStringTls: string } {
    this.describeCluster(clusterArn); // validate existence
    return {
      bootstrapBrokerString: `b-1.kafka.${this.region}.amazonaws.com:9092,b-2.kafka.${this.region}.amazonaws.com:9092`,
      bootstrapBrokerStringTls: `b-1.kafka.${this.region}.amazonaws.com:9094,b-2.kafka.${this.region}.amazonaws.com:9094`,
    };
  }

  // --- Configurations ---

  createConfiguration(params: {
    name: string;
    kafkaVersions?: string[];
    serverProperties: string;
    description?: string;
  }): KafkaConfiguration {
    const configArn = `arn:aws:kafka:${this.region}:${this.accountId}:configuration/${params.name}/${crypto.randomUUID()}`;

    const config: KafkaConfiguration = {
      arn: configArn,
      name: params.name,
      revision: 1,
      kafkaVersions: params.kafkaVersions ?? ["2.8.1"],
      serverProperties: params.serverProperties,
      description: params.description ?? "",
      state: "ACTIVE",
      creationTime: new Date().toISOString(),
    };

    this.configurations.set(configArn, config);
    return config;
  }

  describeConfiguration(arn: string): KafkaConfiguration {
    const config = this.configurations.get(arn);
    if (!config) throw new AwsError("NotFoundException", `Configuration ${arn} does not exist.`, 404);
    return config;
  }

  listConfigurations(): KafkaConfiguration[] {
    return this.configurations.values();
  }

  // --- Tags ---

  tagResource(arn: string, tags: Record<string, string>): void {
    const existing = this.tags.get(arn) ?? {};
    this.tags.set(arn, { ...existing, ...tags });
    // Also update cluster tags if it's a cluster
    const cluster = this.clusters.get(arn);
    if (cluster) {
      cluster.tags = { ...cluster.tags, ...tags };
    }
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.tags.get(arn);
    if (existing) {
      for (const key of tagKeys) delete existing[key];
    }
    const cluster = this.clusters.get(arn);
    if (cluster) {
      for (const key of tagKeys) delete cluster.tags[key];
    }
  }

  listTagsForResource(arn: string): Record<string, string> {
    return this.tags.get(arn) ?? {};
  }
}
