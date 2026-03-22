import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface EventBus {
  name: string;
  arn: string;
  state: string;
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
}

export interface EventTarget {
  id: string;
  arn: string;
  input?: string;
  inputPath?: string;
  inputTransformer?: { inputPathsMap?: Record<string, string>; inputTemplate?: string };
}

export class EventBridgeService {
  private buses: StorageBackend<string, EventBus>;
  private rules: StorageBackend<string, EventRule>;
  private events: any[] = []; // stored events for debugging

  constructor(private accountId: string) {
    this.buses = new InMemoryStorage();
    this.rules = new InMemoryStorage();

    // Create default event bus
    this.buses.set("default#default", {
      name: "default",
      arn: buildArn("events", "us-east-1", accountId, "event-bus/", "default"),
      state: "ACTIVE",
    });
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createEventBus(name: string, region: string): EventBus {
    const key = this.regionKey(region, name);
    if (this.buses.has(key)) throw new AwsError("ResourceAlreadyExistsException", `Event bus ${name} already exists.`, 400);
    const bus: EventBus = {
      name,
      arn: buildArn("events", region, this.accountId, "event-bus/", name),
      state: "ACTIVE",
    };
    this.buses.set(key, bus);
    return bus;
  }

  deleteEventBus(name: string, region: string): void {
    if (name === "default") throw new AwsError("ValidationException", "Cannot delete the default event bus.", 400);
    this.buses.delete(this.regionKey(region, name));
  }

  listEventBuses(region: string): EventBus[] {
    return this.buses.values().filter((b) => this.buses.has(this.regionKey(region, b.name)));
  }

  describeEventBus(name: string, region: string): EventBus {
    const bus = this.buses.get(this.regionKey(region, name || "default"));
    if (!bus) throw new AwsError("ResourceNotFoundException", `Event bus ${name} not found.`, 400);
    return bus;
  }

  putRule(name: string, eventBusName: string, eventPattern: string | undefined, scheduleExpression: string | undefined, state: string, description: string | undefined, region: string): EventRule {
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

  putTargets(ruleName: string, eventBusName: string, targets: EventTarget[], region: string): { failedEntryCount: number; failedEntries: any[] } {
    const key = this.regionKey(region, `${eventBusName || "default"}/${ruleName}`);
    const rule = this.rules.get(key);
    if (!rule) throw new AwsError("ResourceNotFoundException", `Rule ${ruleName} not found.`, 400);

    for (const target of targets) {
      const idx = rule.targets.findIndex((t) => t.id === target.id);
      if (idx >= 0) rule.targets[idx] = target;
      else rule.targets.push(target);
    }
    return { failedEntryCount: 0, failedEntries: [] };
  }

  removeTargets(ruleName: string, eventBusName: string, ids: string[], region: string): { failedEntryCount: number; failedEntries: any[] } {
    const key = this.regionKey(region, `${eventBusName || "default"}/${ruleName}`);
    const rule = this.rules.get(key);
    if (!rule) throw new AwsError("ResourceNotFoundException", `Rule ${ruleName} not found.`, 400);
    rule.targets = rule.targets.filter((t) => !ids.includes(t.id));
    return { failedEntryCount: 0, failedEntries: [] };
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
}
