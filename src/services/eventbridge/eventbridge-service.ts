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
}

export interface EventTarget {
  Id: string;
  Arn: string;
  Input?: string;
  InputPath?: string;
  RoleArn?: string;
  InputTransformer?: { InputPathsMap?: Record<string, string>; InputTemplate?: string };
}

export class EventBridgeService {
  private buses: StorageBackend<string, EventBus>;
  private rules: StorageBackend<string, EventRule>;
  private events: any[] = []; // stored events for debugging

  constructor(private accountId: string) {
    this.buses = new InMemoryStorage();
    this.rules = new InMemoryStorage();
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
}
