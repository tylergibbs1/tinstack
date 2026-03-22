import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface LogGroup {
  logGroupName: string;
  arn: string;
  creationTime: number;
  retentionInDays?: number;
  storedBytes: number;
  tags: Record<string, string>;
}

export interface LogStream {
  logStreamName: string;
  creationTime: number;
  firstEventTimestamp?: number;
  lastEventTimestamp?: number;
  lastIngestionTime?: number;
  uploadSequenceToken: string;
  storedBytes: number;
}

export interface LogEvent {
  timestamp: number;
  message: string;
  ingestionTime: number;
}

export class CloudWatchLogsService {
  private logGroups: StorageBackend<string, LogGroup>;
  private logStreams: StorageBackend<string, LogStream>;
  private logEvents: StorageBackend<string, LogEvent[]>;

  constructor(private accountId: string) {
    this.logGroups = new InMemoryStorage();
    this.logStreams = new InMemoryStorage();
    this.logEvents = new InMemoryStorage();
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createLogGroup(logGroupName: string, tags: Record<string, string>, retentionInDays: number | undefined, region: string): void {
    const key = this.regionKey(region, logGroupName);
    if (this.logGroups.has(key)) throw new AwsError("ResourceAlreadyExistsException", `Log group ${logGroupName} already exists.`, 400);
    this.logGroups.set(key, {
      logGroupName,
      arn: buildArn("logs", region, this.accountId, "log-group:", logGroupName) + ":*",
      creationTime: Date.now(),
      retentionInDays,
      storedBytes: 0,
      tags,
    });
  }

  deleteLogGroup(logGroupName: string, region: string): void {
    const key = this.regionKey(region, logGroupName);
    if (!this.logGroups.has(key)) throw new AwsError("ResourceNotFoundException", `Log group ${logGroupName} not found.`, 400);
    // Delete all streams and events
    const prefix = `${key}/`;
    for (const sk of this.logStreams.keys()) {
      if (sk.startsWith(prefix)) {
        this.logEvents.delete(sk);
        this.logStreams.delete(sk);
      }
    }
    this.logGroups.delete(key);
  }

  describeLogGroups(logGroupNamePrefix: string | undefined, region: string): LogGroup[] {
    return this.logGroups.values().filter((g) => {
      if (!this.logGroups.has(this.regionKey(region, g.logGroupName))) return false;
      if (logGroupNamePrefix && !g.logGroupName.startsWith(logGroupNamePrefix)) return false;
      return true;
    });
  }

  putRetentionPolicy(logGroupName: string, retentionInDays: number, region: string): void {
    const key = this.regionKey(region, logGroupName);
    const group = this.logGroups.get(key);
    if (!group) throw new AwsError("ResourceNotFoundException", `Log group ${logGroupName} not found.`, 400);
    group.retentionInDays = retentionInDays;
  }

  createLogStream(logGroupName: string, logStreamName: string, region: string): void {
    const gKey = this.regionKey(region, logGroupName);
    if (!this.logGroups.has(gKey)) throw new AwsError("ResourceNotFoundException", `Log group ${logGroupName} not found.`, 400);

    const sKey = `${gKey}/${logStreamName}`;
    if (this.logStreams.has(sKey)) throw new AwsError("ResourceAlreadyExistsException", `Log stream ${logStreamName} already exists.`, 400);

    this.logStreams.set(sKey, {
      logStreamName,
      creationTime: Date.now(),
      uploadSequenceToken: "1",
      storedBytes: 0,
    });
    this.logEvents.set(sKey, []);
  }

  deleteLogStream(logGroupName: string, logStreamName: string, region: string): void {
    const gKey = this.regionKey(region, logGroupName);
    if (!this.logGroups.has(gKey)) throw new AwsError("ResourceNotFoundException", `Log group ${logGroupName} not found.`, 400);
    const sKey = `${gKey}/${logStreamName}`;
    if (!this.logStreams.has(sKey)) throw new AwsError("ResourceNotFoundException", `Log stream ${logStreamName} not found.`, 400);
    this.logStreams.delete(sKey);
    this.logEvents.delete(sKey);
  }

  describeLogStreams(logGroupName: string, logStreamNamePrefix: string | undefined, region: string): LogStream[] {
    const gKey = this.regionKey(region, logGroupName);
    return this.logStreams.values().filter((s) => {
      const sKey = `${gKey}/${s.logStreamName}`;
      if (!this.logStreams.has(sKey)) return false;
      if (logStreamNamePrefix && !s.logStreamName.startsWith(logStreamNamePrefix)) return false;
      return true;
    });
  }

  putLogEvents(logGroupName: string, logStreamName: string, events: { timestamp: number; message: string }[], region: string): { nextSequenceToken: string } {
    const sKey = `${this.regionKey(region, logGroupName)}/${logStreamName}`;
    const stream = this.logStreams.get(sKey);
    if (!stream) throw new AwsError("ResourceNotFoundException", `Log stream ${logStreamName} not found.`, 400);

    const stored = this.logEvents.get(sKey)!;
    const now = Date.now();
    for (const event of events) {
      stored.push({ timestamp: event.timestamp, message: event.message, ingestionTime: now });
      stream.storedBytes += event.message.length;
      if (!stream.firstEventTimestamp || event.timestamp < stream.firstEventTimestamp) {
        stream.firstEventTimestamp = event.timestamp;
      }
      if (!stream.lastEventTimestamp || event.timestamp > stream.lastEventTimestamp) {
        stream.lastEventTimestamp = event.timestamp;
      }
    }
    stream.lastIngestionTime = now;
    const token = String(parseInt(stream.uploadSequenceToken) + 1);
    stream.uploadSequenceToken = token;

    return { nextSequenceToken: token };
  }

  getLogEvents(logGroupName: string, logStreamName: string, startTime: number | undefined, endTime: number | undefined, limit: number | undefined, nextToken: string | undefined, region: string): { events: LogEvent[]; nextForwardToken: string; nextBackwardToken: string } {
    const sKey = `${this.regionKey(region, logGroupName)}/${logStreamName}`;
    const stored = this.logEvents.get(sKey);
    if (!stored) throw new AwsError("ResourceNotFoundException", `Log stream ${logStreamName} not found.`, 400);

    let filtered = stored;
    if (startTime) filtered = filtered.filter((e) => e.timestamp >= startTime);
    if (endTime) filtered = filtered.filter((e) => e.timestamp <= endTime);
    filtered.sort((a, b) => a.timestamp - b.timestamp);

    let startOffset = 0;
    if (nextToken) {
      const parts = nextToken.split("/");
      if (parts.length === 2) {
        startOffset = parseInt(parts[1], 10) || 0;
      }
    }

    const maxEvents = limit ?? 10000;
    const events = filtered.slice(startOffset, startOffset + maxEvents);

    return {
      events,
      nextForwardToken: `f/${startOffset + events.length}`,
      nextBackwardToken: `b/${startOffset}`,
    };
  }

  filterLogEvents(logGroupName: string, filterPattern: string | undefined, startTime: number | undefined, endTime: number | undefined, limit: number | undefined, region: string): { events: any[] } {
    const gKey = this.regionKey(region, logGroupName);
    const allEvents: any[] = [];

    for (const sKey of this.logEvents.keys()) {
      if (!sKey.startsWith(gKey + "/")) continue;
      const streamName = sKey.slice(gKey.length + 1);
      const events = this.logEvents.get(sKey) ?? [];
      for (const event of events) {
        if (startTime && event.timestamp < startTime) continue;
        if (endTime && event.timestamp > endTime) continue;
        if (filterPattern && !event.message.includes(filterPattern)) continue;
        allEvents.push({
          logStreamName: streamName,
          timestamp: event.timestamp,
          message: event.message,
          ingestionTime: event.ingestionTime,
          eventId: crypto.randomUUID(),
        });
      }
    }

    allEvents.sort((a, b) => a.timestamp - b.timestamp);
    return { events: allEvents.slice(0, limit ?? 10000) };
  }

  tagLogGroup(logGroupName: string, tags: Record<string, string>, region: string): void {
    const key = this.regionKey(region, logGroupName);
    const group = this.logGroups.get(key);
    if (!group) throw new AwsError("ResourceNotFoundException", `Log group ${logGroupName} not found.`, 400);
    Object.assign(group.tags, tags);
  }

  getLogGroupTags(logGroupName: string, region: string): Record<string, string> {
    const key = this.regionKey(region, logGroupName);
    const group = this.logGroups.get(key);
    return group?.tags ?? {};
  }

  untagLogGroup(logGroupName: string, tagKeys: string[], region: string): void {
    const key = this.regionKey(region, logGroupName);
    const group = this.logGroups.get(key);
    if (group) for (const k of tagKeys) delete group.tags[k];
  }
}
