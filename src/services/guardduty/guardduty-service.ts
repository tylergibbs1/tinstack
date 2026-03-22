import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface Detector {
  detectorId: string;
  createdAt: string;
  findingPublishingFrequency: string;
  serviceRole: string;
  status: string;
  updatedAt: string;
  dataSources: Record<string, any>;
  tags: Record<string, string>;
  features: any[];
  filters: Map<string, DetectorFilter>;
  ipSets: Map<string, IPSet>;
  threatIntelSets: Map<string, ThreatIntelSet>;
  findings: Finding[];
}

export interface DetectorFilter {
  name: string;
  action: string;
  description: string;
  findingCriteria: Record<string, any>;
  rank: number;
}

export interface IPSet {
  ipSetId: string;
  name: string;
  format: string;
  location: string;
  activate: boolean;
  status: string;
  tags: Record<string, string>;
}

export interface ThreatIntelSet {
  threatIntelSetId: string;
  name: string;
  format: string;
  location: string;
  activate: boolean;
  status: string;
  tags: Record<string, string>;
}

export interface Finding {
  id: string;
  type: string;
  severity: number;
  title: string;
  description: string;
  accountId: string;
  region: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export class GuardDutyService {
  private detectors: StorageBackend<string, Detector>;

  constructor(private accountId: string) {
    this.detectors = new InMemoryStorage();
  }

  createDetector(
    enable: boolean,
    findingPublishingFrequency: string | undefined,
    dataSources: Record<string, any> | undefined,
    tags: Record<string, string> | undefined,
    features: any[] | undefined,
    region: string,
  ): string {
    const validFreqs = ["FIFTEEN_MINUTES", "ONE_HOUR", "SIX_HOURS"];
    const freq = validFreqs.includes(findingPublishingFrequency ?? "") ? findingPublishingFrequency! : "SIX_HOURS";

    const detectorId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const now = new Date().toISOString();

    const detector: Detector = {
      detectorId,
      createdAt: now,
      findingPublishingFrequency: freq,
      serviceRole: `arn:aws:iam::${this.accountId}:role/aws-service-role/guardduty.amazonaws.com/AWSServiceRoleForAmazonGuardDuty`,
      status: enable ? "ENABLED" : "DISABLED",
      updatedAt: now,
      dataSources: dataSources ?? {},
      tags: tags ?? {},
      features: features ?? [],
      filters: new Map(),
      ipSets: new Map(),
      threatIntelSets: new Map(),
      findings: [],
    };

    this.detectors.set(detectorId, detector);
    return detectorId;
  }

  getDetector(detectorId: string): Detector {
    const detector = this.detectors.get(detectorId);
    if (!detector) {
      throw new AwsError("BadRequestException", `The request is rejected because the input detectorId is not owned by the current account.`, 400);
    }
    return detector;
  }

  listDetectors(): string[] {
    return this.detectors.values().map((d) => d.detectorId);
  }

  deleteDetector(detectorId: string): void {
    if (!this.detectors.has(detectorId)) {
      throw new AwsError("BadRequestException", `The request is rejected because the input detectorId is not owned by the current account.`, 400);
    }
    this.detectors.delete(detectorId);
  }

  updateDetector(
    detectorId: string,
    enable: boolean | undefined,
    findingPublishingFrequency: string | undefined,
    dataSources: Record<string, any> | undefined,
    features: any[] | undefined,
  ): void {
    const detector = this.getDetector(detectorId);
    if (enable !== undefined) detector.status = enable ? "ENABLED" : "DISABLED";
    if (findingPublishingFrequency !== undefined) detector.findingPublishingFrequency = findingPublishingFrequency;
    if (dataSources !== undefined) detector.dataSources = dataSources;
    if (features !== undefined) detector.features = features;
    detector.updatedAt = new Date().toISOString();
  }

  // --- Filters ---

  createFilter(
    detectorId: string,
    name: string,
    action: string,
    description: string,
    findingCriteria: Record<string, any>,
    rank: number,
  ): string {
    const detector = this.getDetector(detectorId);
    const filter: DetectorFilter = {
      name,
      action: action ?? "NOOP",
      description: description ?? "",
      findingCriteria: findingCriteria ?? {},
      rank: rank ?? 1,
    };
    detector.filters.set(name, filter);
    return name;
  }

  getFilter(detectorId: string, filterName: string): DetectorFilter {
    const detector = this.getDetector(detectorId);
    const filter = detector.filters.get(filterName);
    if (!filter) {
      throw new AwsError("BadRequestException", `The filter name ${filterName} does not exist.`, 400);
    }
    return filter;
  }

  listFilters(detectorId: string): string[] {
    const detector = this.getDetector(detectorId);
    return Array.from(detector.filters.keys());
  }

  deleteFilter(detectorId: string, filterName: string): void {
    const detector = this.getDetector(detectorId);
    detector.filters.delete(filterName);
  }

  // --- IPSets ---

  createIPSet(
    detectorId: string,
    name: string,
    format: string,
    location: string,
    activate: boolean,
    tags: Record<string, string> | undefined,
  ): string {
    const detector = this.getDetector(detectorId);
    const ipSetId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const ipSet: IPSet = {
      ipSetId,
      name,
      format: format ?? "TXT",
      location,
      activate: activate ?? false,
      status: activate ? "ACTIVE" : "INACTIVE",
      tags: tags ?? {},
    };
    detector.ipSets.set(ipSetId, ipSet);
    return ipSetId;
  }

  getIPSet(detectorId: string, ipSetId: string): IPSet {
    const detector = this.getDetector(detectorId);
    const ipSet = detector.ipSets.get(ipSetId);
    if (!ipSet) {
      throw new AwsError("BadRequestException", `The ipSet ${ipSetId} does not exist.`, 400);
    }
    return ipSet;
  }

  listIPSets(detectorId: string): string[] {
    const detector = this.getDetector(detectorId);
    return Array.from(detector.ipSets.keys());
  }

  deleteIPSet(detectorId: string, ipSetId: string): void {
    const detector = this.getDetector(detectorId);
    detector.ipSets.delete(ipSetId);
  }

  // --- ThreatIntelSets ---

  createThreatIntelSet(
    detectorId: string,
    name: string,
    format: string,
    location: string,
    activate: boolean,
    tags: Record<string, string> | undefined,
  ): string {
    const detector = this.getDetector(detectorId);
    const tisId = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    const tis: ThreatIntelSet = {
      threatIntelSetId: tisId,
      name,
      format: format ?? "TXT",
      location,
      activate: activate ?? false,
      status: activate ? "ACTIVE" : "INACTIVE",
      tags: tags ?? {},
    };
    detector.threatIntelSets.set(tisId, tis);
    return tisId;
  }

  // --- Findings ---

  listFindings(detectorId: string): string[] {
    const detector = this.getDetector(detectorId);
    return detector.findings.filter((f) => !f.archived).map((f) => f.id);
  }

  getFindings(detectorId: string, findingIds: string[]): Finding[] {
    const detector = this.getDetector(detectorId);
    return detector.findings.filter((f) => findingIds.includes(f.id));
  }

  archiveFindings(detectorId: string, findingIds: string[]): void {
    const detector = this.getDetector(detectorId);
    for (const f of detector.findings) {
      if (findingIds.includes(f.id)) f.archived = true;
    }
  }

  unarchiveFindings(detectorId: string, findingIds: string[]): void {
    const detector = this.getDetector(detectorId);
    for (const f of detector.findings) {
      if (findingIds.includes(f.id)) f.archived = false;
    }
  }
}
