import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface ScheduleTarget {
  Arn: string;
  RoleArn: string;
  Input?: string;
}

export interface FlexibleTimeWindow {
  Mode: string;
  MaximumWindowInMinutes?: number;
}

export interface Schedule {
  Name: string;
  GroupName: string;
  Arn: string;
  ScheduleExpression: string;
  ScheduleExpressionTimezone?: string;
  Target: ScheduleTarget;
  State: string;
  FlexibleTimeWindow: FlexibleTimeWindow;
  Description?: string;
  CreationDate: number;
  LastModificationDate: number;
}

export interface ScheduleGroup {
  Name: string;
  Arn: string;
  State: string;
  CreationDate: number;
  LastModificationDate: number;
}

export class SchedulerService {
  private schedules: StorageBackend<string, Schedule>;
  private groups: StorageBackend<string, ScheduleGroup>;
  private tags: StorageBackend<string, Record<string, string>>;

  constructor(private accountId: string) {
    this.schedules = new InMemoryStorage();
    this.groups = new InMemoryStorage();
    this.tags = new InMemoryStorage();

    // Create the default group
    const now = Date.now() / 1000;
    this.groups.set("default", {
      Name: "default",
      Arn: `arn:aws:scheduler:us-east-1:${accountId}:schedule-group/default`,
      State: "ACTIVE",
      CreationDate: now,
      LastModificationDate: now,
    });
  }

  private scheduleKey(groupName: string, name: string): string {
    return `${groupName}/${name}`;
  }

  createSchedule(
    name: string,
    body: any,
    region: string,
  ): Schedule {
    const groupName = body.GroupName ?? "default";
    const key = this.scheduleKey(groupName, name);

    if (this.schedules.has(key)) {
      throw new AwsError("ConflictException", `Schedule ${name} already exists in group ${groupName}.`, 409);
    }

    if (!this.groups.has(groupName)) {
      throw new AwsError("ResourceNotFoundException", `Schedule group ${groupName} does not exist.`, 404);
    }

    const now = Date.now() / 1000;
    const schedule: Schedule = {
      Name: name,
      GroupName: groupName,
      Arn: buildArn("scheduler", region, this.accountId, "schedule/", `${groupName}/${name}`),
      ScheduleExpression: body.ScheduleExpression,
      ScheduleExpressionTimezone: body.ScheduleExpressionTimezone ?? "UTC",
      Target: body.Target,
      State: body.State ?? "ENABLED",
      FlexibleTimeWindow: body.FlexibleTimeWindow ?? { Mode: "OFF" },
      Description: body.Description,
      CreationDate: now,
      LastModificationDate: now,
    };

    this.schedules.set(key, schedule);
    return schedule;
  }

  getSchedule(name: string, groupName: string): Schedule {
    const key = this.scheduleKey(groupName, name);
    const schedule = this.schedules.get(key);
    if (!schedule) {
      throw new AwsError("ResourceNotFoundException", `Schedule ${name} does not exist.`, 404);
    }
    return schedule;
  }

  updateSchedule(
    name: string,
    body: any,
    region: string,
  ): Schedule {
    const groupName = body.GroupName ?? "default";
    const key = this.scheduleKey(groupName, name);
    const existing = this.schedules.get(key);
    if (!existing) {
      throw new AwsError("ResourceNotFoundException", `Schedule ${name} does not exist.`, 404);
    }

    const updated: Schedule = {
      ...existing,
      ScheduleExpression: body.ScheduleExpression ?? existing.ScheduleExpression,
      ScheduleExpressionTimezone: body.ScheduleExpressionTimezone ?? existing.ScheduleExpressionTimezone,
      Target: body.Target ?? existing.Target,
      State: body.State ?? existing.State,
      FlexibleTimeWindow: body.FlexibleTimeWindow ?? existing.FlexibleTimeWindow,
      Description: body.Description ?? existing.Description,
      Arn: buildArn("scheduler", region, this.accountId, "schedule/", `${groupName}/${name}`),
      LastModificationDate: Date.now() / 1000,
    };

    this.schedules.set(key, updated);
    return updated;
  }

  deleteSchedule(name: string, groupName: string): void {
    const key = this.scheduleKey(groupName, name);
    if (!this.schedules.has(key)) {
      throw new AwsError("ResourceNotFoundException", `Schedule ${name} does not exist.`, 404);
    }
    this.schedules.delete(key);
  }

  listSchedules(groupName?: string): Schedule[] {
    const all = this.schedules.values();
    if (groupName) {
      return all.filter((s) => s.GroupName === groupName);
    }
    return all;
  }

  createScheduleGroup(name: string, region: string): ScheduleGroup {
    if (this.groups.has(name)) {
      throw new AwsError("ConflictException", `Schedule group ${name} already exists.`, 409);
    }

    const now = Date.now() / 1000;
    const group: ScheduleGroup = {
      Name: name,
      Arn: buildArn("scheduler", region, this.accountId, "schedule-group/", name),
      State: "ACTIVE",
      CreationDate: now,
      LastModificationDate: now,
    };

    this.groups.set(name, group);
    return group;
  }

  getScheduleGroup(name: string): ScheduleGroup {
    const group = this.groups.get(name);
    if (!group) {
      throw new AwsError("ResourceNotFoundException", `Schedule group ${name} does not exist.`, 404);
    }
    return group;
  }

  deleteScheduleGroup(name: string): void {
    if (name === "default") {
      throw new AwsError("ValidationException", "Cannot delete the default schedule group.", 400);
    }
    if (!this.groups.has(name)) {
      throw new AwsError("ResourceNotFoundException", `Schedule group ${name} does not exist.`, 404);
    }
    // Delete all schedules in this group
    for (const schedule of this.schedules.values()) {
      if (schedule.GroupName === name) {
        this.schedules.delete(this.scheduleKey(name, schedule.Name));
      }
    }
    this.groups.delete(name);
  }

  listScheduleGroups(): ScheduleGroup[] {
    return this.groups.values();
  }

  // --- Tagging ---

  tagResource(arn: string, tags: { Key: string; Value: string }[]): void {
    const existing = this.tags.get(arn) ?? {};
    for (const tag of tags) {
      existing[tag.Key] = tag.Value;
    }
    this.tags.set(arn, existing);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.tags.get(arn);
    if (existing) {
      for (const key of tagKeys) {
        delete existing[key];
      }
      this.tags.set(arn, existing);
    }
  }

  listTagsForResource(arn: string): { Key: string; Value: string }[] {
    const existing = this.tags.get(arn) ?? {};
    return Object.entries(existing).map(([Key, Value]) => ({ Key, Value }));
  }
}
