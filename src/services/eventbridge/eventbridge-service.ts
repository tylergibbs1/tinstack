import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface EventBus {
  name: string;
  arn: string;
  state: string;
  tags: Record<string, string>;
}

export interface EventRule {
  name: string;
  arn: string;
  eventBusName: string;
  eventPattern?: string;
  scheduleExpression?: string;
  state: string;
  description?: string;
  targets: EventTarget[];
  tags: Record<string, string>;
  matchedEvents: number;
}

export interface EventTarget {
  Id: string;
  Arn: string;
  Input?: string;
  InputPath?: string;
  RoleArn?: string;
  InputTransformer?: { InputPathsMap?: Record<string, string>; InputTemplate?: string };
}

export interface Archive {
  archiveName: string;
  arn: string;
  eventSourceArn: string;
  eventPattern?: string;
  description?: string;
  retentionDays?: number;
  state: string;
  creationTime: number;
  eventCount: number;
  sizeBytes: number;
}

export interface Connection {
  name: string;
  arn: string;
  connectionState: string;
  authorizationType: string;
  authParameters: any;
  creationTime: number;
  lastModifiedTime: number;
  lastAuthorizedTime: number;
}

export interface ApiDestination {
  name: string;
  arn: string;
  connectionArn: string;
  invocationEndpoint: string;
  httpMethod: string;
  invocationRateLimitPerSecond: number;
  creationTime: number;
  lastModifiedTime: number;
}

export interface Replay {
  replayName: string;
  arn: string;
  eventSourceArn: string;
  eventStartTime: number;
  eventEndTime: number;
  destination: { Arn: string; FilterArns?: string[] };
  state: string;
  stateReason: string;
  eventLastReplayedTime: number;
  replayStartTime: number;
  replayEndTime: number;
}

export function matchesPattern(event: any, pattern: any): boolean {
  for (const key of Object.keys(pattern)) {
    const patternValue = pattern[key];
    const eventValue = event[key];
    if (eventValue === undefined) return false;
    if (Array.isArray(patternValue)) {
      // Event value must match one of the pattern values
      if (!patternValue.includes(eventValue)) return false;
    } else if (typeof patternValue === "object" && patternValue !== null) {
      // Nested pattern — recurse
      if (!matchesPattern(eventValue, patternValue)) return false;
    }
  }
  return true;
}

export class EventBridgeService {
  private buses: StorageBackend<string, EventBus>;
  private rules: StorageBackend<string, EventRule>;
  private events: any[] = []; // stored events for debugging
  private archives: StorageBackend<string, Archive>;
  private connections: StorageBackend<string, Connection>;
  private apiDestinations: StorageBackend<string, ApiDestination>;
  private busPermissions: StorageBackend<string, Record<string, any>>;
  private replays: StorageBackend<string, Replay>;

  constructor(private accountId: string) {
    this.buses = new InMemoryStorage();
    this.rules = new InMemoryStorage();
    this.archives = new InMemoryStorage();
    this.connections = new InMemoryStorage();
    this.apiDestinations = new InMemoryStorage();
    this.busPermissions = new InMemoryStorage();
    this.replays = new InMemoryStorage();
  }

  private ensureDefaultBus(region: string): void {
    const key = this.regionKey(region, "default");
    if (!this.buses.has(key)) {
      this.buses.set(key, {
        name: "default",
        arn: buildArn("events", region, this.accountId, "event-bus/", "default"),
        state: "ACTIVE",
        tags: {},
      });
    }
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createEventBus(name: string, region: string): EventBus {
    this.ensureDefaultBus(region);
    const key = this.regionKey(region, name);
    if (this.buses.has(key)) throw new AwsError("ResourceAlreadyExistsException", `Event bus ${name} already exists.`, 400);
    const bus: EventBus = {
      name,
      arn: buildArn("events", region, this.accountId, "event-bus/", name),
      state: "ACTIVE",
      tags: {},
    };
    this.buses.set(key, bus);
    return bus;
  }

  deleteEventBus(name: string, region: string): void {
    if (name === "default") throw new AwsError("ValidationException", "Cannot delete the default event bus.", 400);
    this.buses.delete(this.regionKey(region, name));
  }

  listEventBuses(region: string): EventBus[] {
    this.ensureDefaultBus(region);
    return this.buses.values().filter((b) => this.buses.has(this.regionKey(region, b.name)));
  }

  describeEventBus(name: string, region: string): EventBus {
    this.ensureDefaultBus(region);
    const bus = this.buses.get(this.regionKey(region, name || "default"));
    if (!bus) throw new AwsError("ResourceNotFoundException", `Event bus ${name} not found.`, 400);
    return bus;
  }

  putRule(name: string, eventBusName: string, eventPattern: string | undefined, scheduleExpression: string | undefined, state: string, description: string | undefined, region: string, tags?: Record<string, string>): EventRule {
    const busName = eventBusName || "default";
    const key = this.regionKey(region, `${busName}/${name}`);
    const existing = this.rules.get(key);
    const rule: EventRule = {
      name,
      arn: buildArn("events", region, this.accountId, "rule/", `${busName}/${name}`),
      eventBusName: busName,
      eventPattern,
      scheduleExpression,
      state: state || "ENABLED",
      description,
      targets: existing?.targets ?? [],
      tags: tags ?? existing?.tags ?? {},
      matchedEvents: existing?.matchedEvents ?? 0,
    };
    this.rules.set(key, rule);
    return rule;
  }

  deleteRule(name: string, eventBusName: string, region: string): void {
    const key = this.regionKey(region, `${eventBusName || "default"}/${name}`);
    this.rules.delete(key);
  }

  describeRule(name: string, eventBusName: string, region: string): EventRule {
    const key = this.regionKey(region, `${eventBusName || "default"}/${name}`);
    const rule = this.rules.get(key);
    if (!rule) throw new AwsError("ResourceNotFoundException", `Rule ${name} not found.`, 400);
    return rule;
  }

  listRules(eventBusName: string, region: string, namePrefix?: string): EventRule[] {
    const busName = eventBusName || "default";
    return this.rules.values().filter((r) => {
      if (r.eventBusName !== busName) return false;
      if (namePrefix && !r.name.startsWith(namePrefix)) return false;
      return true;
    });
  }

  putTargets(ruleName: string, eventBusName: string, targets: EventTarget[], region: string): { FailedEntryCount: number; FailedEntries: any[] } {
    const key = this.regionKey(region, `${eventBusName || "default"}/${ruleName}`);
    const rule = this.rules.get(key);
    if (!rule) throw new AwsError("ResourceNotFoundException", `Rule ${ruleName} not found.`, 400);

    for (const target of targets) {
      const idx = rule.targets.findIndex((t) => t.Id === target.Id);
      if (idx >= 0) rule.targets[idx] = target;
      else rule.targets.push(target);
    }
    return { FailedEntryCount: 0, FailedEntries: [] };
  }

  removeTargets(ruleName: string, eventBusName: string, ids: string[], region: string): { FailedEntryCount: number; FailedEntries: any[] } {
    const key = this.regionKey(region, `${eventBusName || "default"}/${ruleName}`);
    const rule = this.rules.get(key);
    if (!rule) throw new AwsError("ResourceNotFoundException", `Rule ${ruleName} not found.`, 400);
    rule.targets = rule.targets.filter((t) => !ids.includes(t.Id));
    return { FailedEntryCount: 0, FailedEntries: [] };
  }

  listTargetsByRule(ruleName: string, eventBusName: string, region: string): EventTarget[] {
    const key = this.regionKey(region, `${eventBusName || "default"}/${ruleName}`);
    const rule = this.rules.get(key);
    if (!rule) throw new AwsError("ResourceNotFoundException", `Rule ${ruleName} not found.`, 400);
    return rule.targets;
  }

  putEvents(entries: any[], region: string): { failedEntryCount: number; entries: { eventId: string; errorCode?: string }[] } {
    const results = entries.map((entry) => {
      this.events.push({ ...entry, region, timestamp: Date.now() });

      // Match event against all enabled rules
      const busName = entry.EventBusName || "default";
      for (const rule of this.rules.values()) {
        if (rule.eventBusName !== busName || rule.state !== "ENABLED" || !rule.eventPattern) continue;
        const pattern = JSON.parse(rule.eventPattern);
        const event: Record<string, any> = {
          source: entry.Source,
          "detail-type": entry.DetailType,
          detail: typeof entry.Detail === "string" ? JSON.parse(entry.Detail) : entry.Detail,
        };
        if (matchesPattern(event, pattern)) {
          rule.matchedEvents++;
        }
      }

      return { eventId: crypto.randomUUID() };
    });
    return { failedEntryCount: 0, entries: results };
  }

  listTagsForResource(resourceArn: string): { Key: string; Value: string }[] {
    // Search rules first, then buses
    for (const rule of this.rules.values()) {
      if (rule.arn === resourceArn) {
        return Object.entries(rule.tags).map(([Key, Value]) => ({ Key, Value }));
      }
    }
    for (const bus of this.buses.values()) {
      if (bus.arn === resourceArn) {
        return Object.entries(bus.tags).map(([Key, Value]) => ({ Key, Value }));
      }
    }
    throw new AwsError("ResourceNotFoundException", `Resource ${resourceArn} not found.`, 400);
  }

  tagResource(resourceArn: string, tags: { Key: string; Value: string }[]): void {
    for (const rule of this.rules.values()) {
      if (rule.arn === resourceArn) {
        for (const t of tags) rule.tags[t.Key] = t.Value;
        return;
      }
    }
    for (const bus of this.buses.values()) {
      if (bus.arn === resourceArn) {
        for (const t of tags) bus.tags[t.Key] = t.Value;
        return;
      }
    }
    throw new AwsError("ResourceNotFoundException", `Resource ${resourceArn} not found.`, 400);
  }

  untagResource(resourceArn: string, tagKeys: string[]): void {
    for (const rule of this.rules.values()) {
      if (rule.arn === resourceArn) {
        for (const k of tagKeys) delete rule.tags[k];
        return;
      }
    }
    for (const bus of this.buses.values()) {
      if (bus.arn === resourceArn) {
        for (const k of tagKeys) delete bus.tags[k];
        return;
      }
    }
    throw new AwsError("ResourceNotFoundException", `Resource ${resourceArn} not found.`, 400);
  }

  // --- Archives ---

  createArchive(archiveName: string, eventSourceArn: string, eventPattern: string | undefined, description: string | undefined, retentionDays: number | undefined, region: string): Archive {
    const key = this.regionKey(region, archiveName);
    if (this.archives.has(key)) throw new AwsError("ResourceAlreadyExistsException", `Archive ${archiveName} already exists.`, 400);
    const archive: Archive = {
      archiveName,
      arn: buildArn("events", region, this.accountId, "archive/", archiveName),
      eventSourceArn,
      eventPattern,
      description,
      retentionDays,
      state: "ENABLED",
      creationTime: Date.now() / 1000,
      eventCount: 0,
      sizeBytes: 0,
    };
    this.archives.set(key, archive);
    return archive;
  }

  describeArchive(archiveName: string, region: string): Archive {
    const key = this.regionKey(region, archiveName);
    const archive = this.archives.get(key);
    if (!archive) throw new AwsError("ResourceNotFoundException", `Archive ${archiveName} not found.`, 400);
    return archive;
  }

  listArchives(region: string): Archive[] {
    return this.archives.values().filter((a) => this.archives.has(this.regionKey(region, a.archiveName)));
  }

  updateArchive(archiveName: string, eventPattern: string | undefined, description: string | undefined, retentionDays: number | undefined, region: string): Archive {
    const key = this.regionKey(region, archiveName);
    const archive = this.archives.get(key);
    if (!archive) throw new AwsError("ResourceNotFoundException", `Archive ${archiveName} not found.`, 400);
    if (eventPattern !== undefined) archive.eventPattern = eventPattern;
    if (description !== undefined) archive.description = description;
    if (retentionDays !== undefined) archive.retentionDays = retentionDays;
    return archive;
  }

  deleteArchive(archiveName: string, region: string): void {
    const key = this.regionKey(region, archiveName);
    if (!this.archives.has(key)) throw new AwsError("ResourceNotFoundException", `Archive ${archiveName} not found.`, 400);
    this.archives.delete(key);
  }

  // --- Connections ---

  createConnection(name: string, authorizationType: string, authParameters: any, region: string): Connection {
    const key = this.regionKey(region, name);
    if (this.connections.has(key)) throw new AwsError("ResourceAlreadyExistsException", `Connection ${name} already exists.`, 400);
    const now = Date.now() / 1000;
    const conn: Connection = {
      name,
      arn: buildArn("events", region, this.accountId, "connection/", name),
      connectionState: "AUTHORIZED",
      authorizationType,
      authParameters,
      creationTime: now,
      lastModifiedTime: now,
      lastAuthorizedTime: now,
    };
    this.connections.set(key, conn);
    return conn;
  }

  describeConnection(name: string, region: string): Connection {
    const key = this.regionKey(region, name);
    const conn = this.connections.get(key);
    if (!conn) throw new AwsError("ResourceNotFoundException", `Connection ${name} not found.`, 400);
    return conn;
  }

  listConnections(region: string): Connection[] {
    return this.connections.values().filter((c) => this.connections.has(this.regionKey(region, c.name)));
  }

  deleteConnection(name: string, region: string): Connection {
    const key = this.regionKey(region, name);
    const conn = this.connections.get(key);
    if (!conn) throw new AwsError("ResourceNotFoundException", `Connection ${name} not found.`, 400);
    this.connections.delete(key);
    return conn;
  }

  // --- API Destinations ---

  createApiDestination(name: string, connectionArn: string, invocationEndpoint: string, httpMethod: string, invocationRateLimitPerSecond: number | undefined, region: string): ApiDestination {
    const key = this.regionKey(region, name);
    if (this.apiDestinations.has(key)) throw new AwsError("ResourceAlreadyExistsException", `API destination ${name} already exists.`, 400);
    const now = Date.now() / 1000;
    const dest: ApiDestination = {
      name,
      arn: buildArn("events", region, this.accountId, "api-destination/", name),
      connectionArn,
      invocationEndpoint,
      httpMethod,
      invocationRateLimitPerSecond: invocationRateLimitPerSecond ?? 300,
      creationTime: now,
      lastModifiedTime: now,
    };
    this.apiDestinations.set(key, dest);
    return dest;
  }

  describeApiDestination(name: string, region: string): ApiDestination {
    const key = this.regionKey(region, name);
    const dest = this.apiDestinations.get(key);
    if (!dest) throw new AwsError("ResourceNotFoundException", `API destination ${name} not found.`, 400);
    return dest;
  }

  listApiDestinations(region: string): ApiDestination[] {
    return this.apiDestinations.values().filter((d) => this.apiDestinations.has(this.regionKey(region, d.name)));
  }

  deleteApiDestination(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.apiDestinations.has(key)) throw new AwsError("ResourceNotFoundException", `API destination ${name} not found.`, 400);
    this.apiDestinations.delete(key);
  }

  // --- Permissions ---

  putPermission(eventBusName: string, statementId: string, action: string, principal: string, region: string): void {
    const busName = eventBusName || "default";
    this.ensureDefaultBus(region);
    const busKey = this.regionKey(region, busName);
    if (!this.buses.has(busKey)) throw new AwsError("ResourceNotFoundException", `Event bus ${busName} not found.`, 400);
    const permKey = this.regionKey(region, `perm#${busName}`);
    const statements = this.busPermissions.get(permKey) ?? {};
    statements[statementId] = { Sid: statementId, Effect: "Allow", Principal: principal, Action: action, Resource: this.buses.get(busKey)!.arn };
    this.busPermissions.set(permKey, statements);
  }

  removePermission(eventBusName: string, statementId: string, region: string): void {
    const busName = eventBusName || "default";
    const permKey = this.regionKey(region, `perm#${busName}`);
    const statements = this.busPermissions.get(permKey);
    if (statements) {
      delete statements[statementId];
      this.busPermissions.set(permKey, statements);
    }
  }

  // --- ListRuleNamesByTarget ---

  listRuleNamesByTarget(targetArn: string, eventBusName: string, region: string): string[] {
    const busName = eventBusName || "default";
    return this.rules.values()
      .filter((r) => r.eventBusName === busName && r.targets.some((t) => t.Arn === targetArn))
      .map((r) => r.name);
  }

  // --- EnableRule / DisableRule ---

  enableRule(name: string, eventBusName: string, region: string): void {
    const key = this.regionKey(region, `${eventBusName || "default"}/${name}`);
    const rule = this.rules.get(key);
    if (!rule) throw new AwsError("ResourceNotFoundException", `Rule ${name} not found.`, 400);
    rule.state = "ENABLED";
  }

  disableRule(name: string, eventBusName: string, region: string): void {
    const key = this.regionKey(region, `${eventBusName || "default"}/${name}`);
    const rule = this.rules.get(key);
    if (!rule) throw new AwsError("ResourceNotFoundException", `Rule ${name} not found.`, 400);
    rule.state = "DISABLED";
  }

  // --- Replays ---

  startReplay(replayName: string, eventSourceArn: string, eventStartTime: number, eventEndTime: number, destination: { Arn: string; FilterArns?: string[] }, region: string): Replay {
    const key = this.regionKey(region, replayName);
    if (this.replays.has(key)) throw new AwsError("ResourceAlreadyExistsException", `Replay ${replayName} already exists.`, 400);
    const now = Date.now() / 1000;
    const replay: Replay = {
      replayName,
      arn: buildArn("events", region, this.accountId, "replay/", replayName),
      eventSourceArn,
      eventStartTime,
      eventEndTime,
      destination,
      state: "COMPLETED",
      stateReason: "Replay completed successfully.",
      eventLastReplayedTime: eventEndTime,
      replayStartTime: now,
      replayEndTime: now,
    };
    this.replays.set(key, replay);
    return replay;
  }

  describeReplay(replayName: string, region: string): Replay {
    const key = this.regionKey(region, replayName);
    const replay = this.replays.get(key);
    if (!replay) throw new AwsError("ResourceNotFoundException", `Replay ${replayName} not found.`, 400);
    return replay;
  }

  listReplays(region: string): Replay[] {
    return this.replays.values().filter((r) => this.replays.has(this.regionKey(region, r.replayName)));
  }

  cancelReplay(replayName: string, region: string): Replay {
    const key = this.regionKey(region, replayName);
    const replay = this.replays.get(key);
    if (!replay) throw new AwsError("ResourceNotFoundException", `Replay ${replayName} not found.`, 400);
    replay.state = "CANCELLED";
    replay.stateReason = "Replay cancelled by user.";
    return replay;
  }
}
