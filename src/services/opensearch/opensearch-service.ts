import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface OpenSearchDomain {
  domainId: string;
  domainName: string;
  arn: string;
  created: boolean;
  deleted: boolean;
  processing: boolean;
  engineVersion: string;
  endpoint: string;
  clusterConfig: Record<string, any>;
  ebsOptions: Record<string, any>;
  accessPolicies: string;
  snapshotOptions: Record<string, any>;
  advancedOptions: Record<string, string>;
  domainEndpointOptions: Record<string, any>;
  advancedSecurityOptions: Record<string, any>;
  encryptionAtRestOptions: Record<string, any>;
  nodeToNodeEncryptionOptions: Record<string, any>;
  createdAt: number;
}

type TagList = { Key: string; Value: string }[];

export class OpenSearchService {
  private domains: StorageBackend<string, OpenSearchDomain>;
  private tags = new Map<string, TagList>();

  constructor(private accountId: string) {
    this.domains = new InMemoryStorage();
  }

  createDomain(
    domainName: string,
    engineVersion: string | undefined,
    clusterConfig: Record<string, any> | undefined,
    ebsOptions: Record<string, any> | undefined,
    accessPolicies: string | undefined,
    region: string,
    tags?: TagList,
  ): OpenSearchDomain {
    if (this.domains.get(domainName)) {
      throw new AwsError("ResourceAlreadyExistsException", `Domain ${domainName} already exists.`, 409);
    }
    const arn = `arn:aws:es:${region}:${this.accountId}:domain/${domainName}`;
    const domain: OpenSearchDomain = {
      domainId: `${this.accountId}/${domainName}`,
      domainName,
      arn,
      created: true,
      deleted: false,
      processing: false,
      engineVersion: engineVersion ?? "OpenSearch_2.5",
      endpoint: `search-${domainName}-${crypto.randomUUID().substring(0, 8)}.${region}.es.amazonaws.com`,
      clusterConfig: clusterConfig ?? {
        InstanceType: "t3.small.search",
        InstanceCount: 1,
        DedicatedMasterEnabled: false,
        ZoneAwarenessEnabled: false,
        WarmEnabled: false,
      },
      ebsOptions: ebsOptions ?? { EBSEnabled: true, VolumeType: "gp2", VolumeSize: 10 },
      accessPolicies: accessPolicies ?? "",
      snapshotOptions: { AutomatedSnapshotStartHour: 0 },
      advancedOptions: {
        "override_main_response_version": "false",
        "rest.action.multi.allow_explicit_index": "true",
      },
      domainEndpointOptions: { EnforceHTTPS: false, TLSSecurityPolicy: "Policy-Min-TLS-1-0-2019-07" },
      advancedSecurityOptions: { Enabled: false, InternalUserDatabaseEnabled: false },
      encryptionAtRestOptions: { Enabled: false },
      nodeToNodeEncryptionOptions: { Enabled: false },
      createdAt: Date.now(),
    };
    this.domains.set(domainName, domain);
    if (tags && tags.length > 0) this.tags.set(arn, tags);
    return domain;
  }

  describeDomain(domainName: string): OpenSearchDomain {
    const domain = this.domains.get(domainName);
    if (!domain) throw new AwsError("ResourceNotFoundException", `Domain ${domainName} not found.`, 404);
    return domain;
  }

  listDomainNames(): { DomainName: string; EngineType: string }[] {
    return this.domains.values().map((d) => ({
      DomainName: d.domainName,
      EngineType: "OpenSearch",
    }));
  }

  deleteDomain(domainName: string): OpenSearchDomain {
    const domain = this.domains.get(domainName);
    if (!domain) throw new AwsError("ResourceNotFoundException", `Domain ${domainName} not found.`, 404);
    domain.deleted = true;
    domain.processing = true;
    this.domains.delete(domainName);
    return domain;
  }

  updateDomainConfig(
    domainName: string,
    clusterConfig?: Record<string, any>,
    ebsOptions?: Record<string, any>,
    accessPolicies?: string,
    advancedOptions?: Record<string, string>,
    domainEndpointOptions?: Record<string, any>,
    advancedSecurityOptions?: Record<string, any>,
    encryptionAtRestOptions?: Record<string, any>,
    nodeToNodeEncryptionOptions?: Record<string, any>,
  ): OpenSearchDomain {
    const domain = this.describeDomain(domainName);
    if (clusterConfig) domain.clusterConfig = { ...domain.clusterConfig, ...clusterConfig };
    if (ebsOptions) domain.ebsOptions = { ...domain.ebsOptions, ...ebsOptions };
    if (accessPolicies !== undefined) domain.accessPolicies = accessPolicies;
    if (advancedOptions) domain.advancedOptions = { ...domain.advancedOptions, ...advancedOptions };
    if (domainEndpointOptions) domain.domainEndpointOptions = { ...domain.domainEndpointOptions, ...domainEndpointOptions };
    if (advancedSecurityOptions) domain.advancedSecurityOptions = { ...domain.advancedSecurityOptions, ...advancedSecurityOptions };
    if (encryptionAtRestOptions) domain.encryptionAtRestOptions = { ...domain.encryptionAtRestOptions, ...encryptionAtRestOptions };
    if (nodeToNodeEncryptionOptions) domain.nodeToNodeEncryptionOptions = { ...domain.nodeToNodeEncryptionOptions, ...nodeToNodeEncryptionOptions };
    this.domains.set(domainName, domain);
    return domain;
  }

  describeDomainConfig(domainName: string): Record<string, any> {
    const domain = this.describeDomain(domainName);
    const wrap = (options: any) => ({ Options: options, Status: { State: "Active", PendingDeletion: false } });
    return {
      EngineVersion: { Options: domain.engineVersion, Status: { State: "Active", PendingDeletion: false } },
      ClusterConfig: wrap(domain.clusterConfig),
      EBSOptions: wrap(domain.ebsOptions),
      AccessPolicies: wrap(domain.accessPolicies),
      SnapshotOptions: wrap(domain.snapshotOptions),
      AdvancedOptions: wrap(domain.advancedOptions),
      DomainEndpointOptions: wrap(domain.domainEndpointOptions),
      AdvancedSecurityOptions: wrap(domain.advancedSecurityOptions),
      EncryptionAtRestOptions: wrap(domain.encryptionAtRestOptions),
      NodeToNodeEncryptionOptions: wrap(domain.nodeToNodeEncryptionOptions),
    };
  }

  addTags(arn: string, tags: TagList): void {
    const existing = this.tags.get(arn) ?? [];
    const map = new Map(existing.map((t) => [t.Key, t.Value]));
    for (const t of tags) map.set(t.Key, t.Value);
    this.tags.set(arn, Array.from(map.entries()).map(([Key, Value]) => ({ Key, Value })));
  }

  listTags(arn: string): TagList {
    return this.tags.get(arn) ?? [];
  }

  removeTags(arn: string, tagKeys: string[]): void {
    const existing = this.tags.get(arn) ?? [];
    this.tags.set(arn, existing.filter((t) => !tagKeys.includes(t.Key)));
  }
}
