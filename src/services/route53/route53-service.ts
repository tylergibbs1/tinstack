import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface HostedZone {
  id: string;
  name: string;
  callerReference: string;
  comment?: string;
  resourceRecordSetCount: number;
  tags: Record<string, string>;
}

export interface ResourceRecordSet {
  name: string;
  type: string;
  ttl?: number;
  resourceRecords: { value: string }[];
}

export class Route53Service {
  private zones: StorageBackend<string, HostedZone>;
  private recordSets: StorageBackend<string, ResourceRecordSet[]>; // zoneId -> records
  private changeCounter = 0;

  constructor(private accountId: string) {
    this.zones = new InMemoryStorage();
    this.recordSets = new InMemoryStorage();
  }

  createHostedZone(name: string, callerReference: string, comment?: string): HostedZone {
    // Check for duplicate caller reference
    for (const zone of this.zones.values()) {
      if (zone.callerReference === callerReference) {
        throw new AwsError("HostedZoneAlreadyExists", `A hosted zone with caller reference ${callerReference} already exists.`, 409);
      }
    }

    const id = crypto.randomUUID().slice(0, 13).toUpperCase().replace(/-/g, "");
    const zone: HostedZone = {
      id,
      name: name.endsWith(".") ? name : name + ".",
      callerReference,
      comment,
      resourceRecordSetCount: 0,
      tags: {},
    };
    this.zones.set(id, zone);
    this.recordSets.set(id, []);
    return zone;
  }

  getHostedZone(id: string): HostedZone {
    const zoneId = id.replace("/hostedzone/", "");
    const zone = this.zones.get(zoneId);
    if (!zone) throw new AwsError("NoSuchHostedZone", `No hosted zone found with ID: ${zoneId}`, 404);
    return zone;
  }

  listHostedZones(): HostedZone[] {
    return this.zones.values();
  }

  deleteHostedZone(id: string): void {
    const zoneId = id.replace("/hostedzone/", "");
    if (!this.zones.get(zoneId)) {
      throw new AwsError("NoSuchHostedZone", `No hosted zone found with ID: ${zoneId}`, 404);
    }
    this.zones.delete(zoneId);
    this.recordSets.delete(zoneId);
  }

  changeResourceRecordSets(zoneId: string, changes: { action: string; recordSet: ResourceRecordSet }[]): string {
    const zone = this.getHostedZone(zoneId);
    let records = this.recordSets.get(zone.id) ?? [];

    for (const change of changes) {
      const { action, recordSet } = change;
      if (action === "CREATE") {
        records.push(recordSet);
      } else if (action === "DELETE") {
        records = records.filter(
          (r) => !(r.name === recordSet.name && r.type === recordSet.type),
        );
      } else if (action === "UPSERT") {
        records = records.filter(
          (r) => !(r.name === recordSet.name && r.type === recordSet.type),
        );
        records.push(recordSet);
      }
    }

    this.recordSets.set(zone.id, records);
    zone.resourceRecordSetCount = records.length;
    this.changeCounter++;
    return `C${String(this.changeCounter).padStart(10, "0")}`;
  }

  listResourceRecordSets(zoneId: string): ResourceRecordSet[] {
    const zone = this.getHostedZone(zoneId);
    return this.recordSets.get(zone.id) ?? [];
  }

  getTagsForResource(zoneId: string): Record<string, string> {
    const zone = this.getHostedZone(zoneId);
    return zone.tags;
  }

  changeTagsForResource(zoneId: string, addTags: { key: string; value: string }[], removeTagKeys: string[]): void {
    const zone = this.getHostedZone(zoneId);
    for (const key of removeTagKeys) {
      delete zone.tags[key];
    }
    for (const tag of addTags) {
      zone.tags[tag.key] = tag.value;
    }
  }
}
