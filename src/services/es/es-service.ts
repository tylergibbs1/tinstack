import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface EsDomain {
  domainId: string; domainName: string; arn: string; elasticsearchVersion: string;
  created: boolean; deleted: boolean; processing: boolean;
  endpoint: string;
}

export class ElasticsearchService {
  private domains: StorageBackend<string, EsDomain>;

  constructor(private accountId: string) {
    this.domains = new InMemoryStorage();
  }

  createDomain(domainName: string, elasticsearchVersion: string): EsDomain {
    if (this.domains.has(domainName)) throw new AwsError("ResourceAlreadyExistsException", `Domain ${domainName} already exists`, 409);
    const domain: EsDomain = {
      domainId: `${this.accountId}/${domainName}`,
      domainName,
      arn: `arn:aws:es:us-east-1:${this.accountId}:domain/${domainName}`,
      elasticsearchVersion: elasticsearchVersion ?? "7.10",
      created: true, deleted: false, processing: false,
      endpoint: `search-${domainName}-mock.us-east-1.es.amazonaws.com`,
    };
    this.domains.set(domainName, domain);
    return domain;
  }

  describeDomain(domainName: string): EsDomain {
    const d = this.domains.get(domainName);
    if (!d) throw new AwsError("ResourceNotFoundException", `Domain ${domainName} not found`, 404);
    return d;
  }

  listDomainNames(): { DomainName: string; EngineType: string }[] {
    return this.domains.values().map((d) => ({ DomainName: d.domainName, EngineType: "Elasticsearch" }));
  }

  deleteDomain(domainName: string): EsDomain {
    const d = this.describeDomain(domainName);
    this.domains.delete(domainName);
    d.deleted = true;
    return d;
  }
}
