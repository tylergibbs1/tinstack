import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  SchedulerClient,
  CreateScheduleCommand,
  GetScheduleCommand,
  UpdateScheduleCommand,
  DeleteScheduleCommand,
  ListSchedulesCommand,
  CreateScheduleGroupCommand,
  GetScheduleGroupCommand,
  DeleteScheduleGroupCommand,
  ListScheduleGroupsCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-scheduler";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new SchedulerClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EventBridge Scheduler", () => {
  test("ListScheduleGroups — default group exists", async () => {
    const res = await client.send(new ListScheduleGroupsCommand({}));
    expect(res.ScheduleGroups).toBeDefined();
    expect(res.ScheduleGroups!.some((g) => g.Name === "default")).toBe(true);
  });

  test("CreateScheduleGroup", async () => {
    const res = await client.send(
      new CreateScheduleGroupCommand({ Name: "my-group" }),
    );
    expect(res.ScheduleGroupArn).toContain("schedule-group/my-group");
  });

  test("GetScheduleGroup", async () => {
    const res = await client.send(
      new GetScheduleGroupCommand({ Name: "my-group" }),
    );
    expect(res.Name).toBe("my-group");
    expect(res.State).toBe("ACTIVE");
    expect(res.Arn).toContain("schedule-group/my-group");
  });

  test("CreateSchedule", async () => {
    const res = await client.send(
      new CreateScheduleCommand({
        Name: "test-schedule",
        ScheduleExpression: "rate(5 minutes)",
        Target: {
          Arn: "arn:aws:lambda:us-east-1:000000000000:function:my-func",
          RoleArn: "arn:aws:iam::000000000000:role/scheduler-role",
        },
        FlexibleTimeWindow: { Mode: "OFF" },
      }),
    );
    expect(res.ScheduleArn).toContain("schedule/default/test-schedule");
  });

  test("CreateSchedule — in custom group", async () => {
    const res = await client.send(
      new CreateScheduleCommand({
        Name: "grouped-schedule",
        GroupName: "my-group",
        ScheduleExpression: "cron(0 12 * * ? *)",
        Target: {
          Arn: "arn:aws:sqs:us-east-1:000000000000:my-queue",
          RoleArn: "arn:aws:iam::000000000000:role/scheduler-role",
        },
        FlexibleTimeWindow: { Mode: "FLEXIBLE", MaximumWindowInMinutes: 15 },
        State: "DISABLED",
      }),
    );
    expect(res.ScheduleArn).toContain("schedule/my-group/grouped-schedule");
  });

  test("GetSchedule", async () => {
    const res = await client.send(
      new GetScheduleCommand({ Name: "test-schedule" }),
    );
    expect(res.Name).toBe("test-schedule");
    expect(res.ScheduleExpression).toBe("rate(5 minutes)");
    expect(res.State).toBe("ENABLED");
    expect(res.Target?.Arn).toContain("my-func");
    expect(res.FlexibleTimeWindow?.Mode).toBe("OFF");
  });

  test("GetSchedule — not found", async () => {
    try {
      await client.send(new GetScheduleCommand({ Name: "nonexistent" }));
      expect(true).toBe(false); // should not reach here
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("UpdateSchedule", async () => {
    const res = await client.send(
      new UpdateScheduleCommand({
        Name: "test-schedule",
        ScheduleExpression: "rate(10 minutes)",
        Target: {
          Arn: "arn:aws:lambda:us-east-1:000000000000:function:my-func",
          RoleArn: "arn:aws:iam::000000000000:role/scheduler-role",
        },
        FlexibleTimeWindow: { Mode: "OFF" },
        State: "DISABLED",
      }),
    );
    expect(res.ScheduleArn).toContain("test-schedule");

    const get = await client.send(
      new GetScheduleCommand({ Name: "test-schedule" }),
    );
    expect(get.ScheduleExpression).toBe("rate(10 minutes)");
    expect(get.State).toBe("DISABLED");
  });

  test("ListSchedules", async () => {
    const res = await client.send(new ListSchedulesCommand({}));
    expect(res.Schedules).toBeDefined();
    expect(res.Schedules!.length).toBeGreaterThanOrEqual(2);
    expect(res.Schedules!.some((s) => s.Name === "test-schedule")).toBe(true);
  });

  test("DeleteSchedule", async () => {
    await client.send(
      new DeleteScheduleCommand({ Name: "test-schedule" }),
    );

    try {
      await client.send(new GetScheduleCommand({ Name: "test-schedule" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("DeleteScheduleGroup — cascades schedules", async () => {
    await client.send(
      new DeleteScheduleGroupCommand({ Name: "my-group" }),
    );

    try {
      await client.send(new GetScheduleGroupCommand({ Name: "my-group" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("DeleteScheduleGroup — cannot delete default", async () => {
    try {
      await client.send(new DeleteScheduleGroupCommand({ Name: "default" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ValidationException");
    }
  });

  // --- Tagging ---
  test("TagResource + ListTagsForResource", async () => {
    const tagSchedule = await client.send(
      new CreateScheduleCommand({
        Name: "tag-test-schedule",
        ScheduleExpression: "rate(1 hour)",
        Target: {
          Arn: "arn:aws:lambda:us-east-1:000000000000:function:f",
          RoleArn: "arn:aws:iam::000000000000:role/r",
        },
        FlexibleTimeWindow: { Mode: "OFF" },
      }),
    );
    const arn = tagSchedule.ScheduleArn!;

    await client.send(new TagResourceCommand({
      ResourceArn: arn,
      Tags: [
        { Key: "env", Value: "test" },
        { Key: "team", Value: "platform" },
      ],
    }));

    const tags = await client.send(new ListTagsForResourceCommand({ ResourceArn: arn }));
    expect(tags.Tags).toBeDefined();
    expect(tags.Tags!.length).toBe(2);
    expect(tags.Tags!.some((t) => t.Key === "env" && t.Value === "test")).toBe(true);
  });

  test("UntagResource", async () => {
    const schedule = await client.send(new GetScheduleCommand({ Name: "tag-test-schedule" }));
    const arn = schedule.Arn!;

    await client.send(new UntagResourceCommand({
      ResourceArn: arn,
      TagKeys: ["team"],
    }));

    const tags = await client.send(new ListTagsForResourceCommand({ ResourceArn: arn }));
    expect(tags.Tags!.length).toBe(1);
    expect(tags.Tags![0].Key).toBe("env");

    // Cleanup
    await client.send(new DeleteScheduleCommand({ Name: "tag-test-schedule" }));
  });

  test("CreateSchedule — conflict", async () => {
    await client.send(
      new CreateScheduleCommand({
        Name: "dup-schedule",
        ScheduleExpression: "rate(1 hour)",
        Target: {
          Arn: "arn:aws:lambda:us-east-1:000000000000:function:f",
          RoleArn: "arn:aws:iam::000000000000:role/r",
        },
        FlexibleTimeWindow: { Mode: "OFF" },
      }),
    );

    try {
      await client.send(
        new CreateScheduleCommand({
          Name: "dup-schedule",
          ScheduleExpression: "rate(1 hour)",
          Target: {
            Arn: "arn:aws:lambda:us-east-1:000000000000:function:f",
            RoleArn: "arn:aws:iam::000000000000:role/r",
          },
          FlexibleTimeWindow: { Mode: "OFF" },
        }),
      );
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ConflictException");
    }
  });
});
