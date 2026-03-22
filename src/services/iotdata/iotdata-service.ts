import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface ThingShadow {
  thingName: string;
  shadowName: string;
  payload: string;
  version: number;
}

export class IoTDataService {
  private shadows: StorageBackend<string, ThingShadow>;
  private publishedMessages: { topic: string; payload: string }[] = [];

  constructor(private accountId: string) {
    this.shadows = new InMemoryStorage();
  }

  publish(topic: string, payload: string): void {
    this.publishedMessages.push({ topic, payload });
  }

  getThingShadow(thingName: string, shadowName?: string): ThingShadow {
    const key = `${thingName}:${shadowName ?? "classic"}`;
    const shadow = this.shadows.get(key);
    if (!shadow) throw new AwsError("ResourceNotFoundException", `No shadow for thing ${thingName}`, 404);
    return shadow;
  }

  updateThingShadow(thingName: string, payload: string, shadowName?: string): ThingShadow {
    const key = `${thingName}:${shadowName ?? "classic"}`;
    const existing = this.shadows.get(key);
    const shadow: ThingShadow = {
      thingName,
      shadowName: shadowName ?? "classic",
      payload,
      version: (existing?.version ?? 0) + 1,
    };
    this.shadows.set(key, shadow);
    return shadow;
  }

  deleteThingShadow(thingName: string, shadowName?: string): ThingShadow {
    const key = `${thingName}:${shadowName ?? "classic"}`;
    const shadow = this.shadows.get(key);
    if (!shadow) throw new AwsError("ResourceNotFoundException", `No shadow for thing ${thingName}`, 404);
    this.shadows.delete(key);
    return shadow;
  }

  listNamedShadowsForThing(thingName: string): string[] {
    return this.shadows.values()
      .filter((s) => s.thingName === thingName)
      .map((s) => s.shadowName);
  }
}
