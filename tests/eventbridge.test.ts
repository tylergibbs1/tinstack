import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  EventBridgeClient,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
  ListRulesCommand,
  DescribeRuleCommand,
  RemoveTargetsCommand,
  DeleteRuleCommand,
  CreateEventBusCommand,
  ListEventBusesCommand,
  DeleteEventBusCommand,
  CreateArchiveCommand,
  DescribeArchiveCommand,
  ListArchivesCommand,
  UpdateArchiveCommand,
  DeleteArchiveCommand,
  CreateConnectionCommand,
  DescribeConnectionCommand,
  ListConnectionsCommand,
  DeleteConnectionCommand,
  CreateApiDestinationCommand,
  DescribeApiDestinationCommand,
  ListApiDestinationsCommand,
  DeleteApiDestinationCommand,
  PutPermissionCommand,
  RemovePermissionCommand,
  ListRuleNamesByTargetCommand,
  EnableRuleCommand,
  DisableRuleCommand,
  StartReplayCommand,
  DescribeReplayCommand,
  ListReplaysCommand,
  CancelReplayCommand,
} from "@aws-sdk/client-eventbridge";
import { startServer, stopServer, clientConfig } from "./helpers";

const eb = new EventBridgeClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("EventBridge", () => {
  test("PutEvents", async () => {
    const res = await eb.send(new PutEventsCommand({
      Entries: [
        { Source: "my.app", DetailType: "OrderPlaced", Detail: JSON.stringify({ orderId: "123" }) },
      ],
    }));
    expect(res.FailedEntryCount).toBe(0);
    expect(res.Entries?.length).toBe(1);
    expect(res.Entries![0].EventId).toBeDefined();
  });

  test("PutRule + PutTargets + ListRules", async () => {
    await eb.send(new PutRuleCommand({
      Name: "test-rule",
      EventPattern: JSON.stringify({ source: ["my.app"] }),
      State: "ENABLED",
    }));

    await eb.send(new PutTargetsCommand({
      Rule: "test-rule",
      Targets: [{ Id: "target-1", Arn: "arn:aws:sqs:us-east-1:000000000000:my-queue" }],
    }));

    const rules = await eb.send(new ListRulesCommand({}));
    expect(rules.Rules?.some((r) => r.Name === "test-rule")).toBe(true);

    const rule = await eb.send(new DescribeRuleCommand({ Name: "test-rule" }));
    expect(rule.State).toBe("ENABLED");
  });

  test("CreateEventBus + List + Delete", async () => {
    await eb.send(new CreateEventBusCommand({ Name: "custom-bus" }));
    const buses = await eb.send(new ListEventBusesCommand({}));
    expect(buses.EventBuses?.some((b) => b.Name === "custom-bus")).toBe(true);
    await eb.send(new DeleteEventBusCommand({ Name: "custom-bus" }));
  });

  test("Cleanup rule", async () => {
    await eb.send(new RemoveTargetsCommand({ Rule: "test-rule", Ids: ["target-1"] }));
    await eb.send(new DeleteRuleCommand({ Name: "test-rule" }));
    const rules = await eb.send(new ListRulesCommand({}));
    expect(rules.Rules?.some((r) => r.Name === "test-rule")).toBeFalsy();
  });
});

describe("EventBridge - Event Pattern Matching", () => {
  test("matching events increment rule matchedEvents counter", async () => {
    // Create a rule with an event pattern
    await eb.send(new PutRuleCommand({
      Name: "pattern-match-rule",
      EventPattern: JSON.stringify({ source: ["my.app"], "detail-type": ["OrderPlaced"] }),
      State: "ENABLED",
    }));

    // Put a matching event
    await eb.send(new PutEventsCommand({
      Entries: [
        { Source: "my.app", DetailType: "OrderPlaced", Detail: JSON.stringify({ orderId: "1" }) },
      ],
    }));

    // Put a non-matching event (different source)
    await eb.send(new PutEventsCommand({
      Entries: [
        { Source: "other.app", DetailType: "OrderPlaced", Detail: JSON.stringify({ orderId: "2" }) },
      ],
    }));

    // Put another non-matching event (different detail-type)
    await eb.send(new PutEventsCommand({
      Entries: [
        { Source: "my.app", DetailType: "OrderCancelled", Detail: JSON.stringify({ orderId: "3" }) },
      ],
    }));

    // Put another matching event
    await eb.send(new PutEventsCommand({
      Entries: [
        { Source: "my.app", DetailType: "OrderPlaced", Detail: JSON.stringify({ orderId: "4" }) },
      ],
    }));

    // Verify via DescribeRule that the rule still exists and is ENABLED
    const rule = await eb.send(new DescribeRuleCommand({ Name: "pattern-match-rule" }));
    expect(rule.State).toBe("ENABLED");

    // Cleanup
    await eb.send(new DeleteRuleCommand({ Name: "pattern-match-rule" }));
  });

  test("disabled rules do not match events", async () => {
    await eb.send(new PutRuleCommand({
      Name: "disabled-pattern-rule",
      EventPattern: JSON.stringify({ source: ["my.app"] }),
      State: "DISABLED",
    }));

    const res = await eb.send(new PutEventsCommand({
      Entries: [
        { Source: "my.app", DetailType: "Test", Detail: JSON.stringify({}) },
      ],
    }));
    expect(res.FailedEntryCount).toBe(0);

    // Cleanup
    await eb.send(new DeleteRuleCommand({ Name: "disabled-pattern-rule" }));
  });
});

describe("EventBridge - Archives", () => {
  const archiveName = "test-archive-" + Date.now();

  test("CreateArchive", async () => {
    const res = await eb.send(new CreateArchiveCommand({
      ArchiveName: archiveName,
      EventSourceArn: "arn:aws:events:us-east-1:000000000000:event-bus/default",
      Description: "Test archive",
      RetentionDays: 30,
    }));
    expect(res.ArchiveArn).toContain(archiveName);
    expect(res.State).toBe("ENABLED");
  });

  test("DescribeArchive", async () => {
    const res = await eb.send(new DescribeArchiveCommand({ ArchiveName: archiveName }));
    expect(res.ArchiveName).toBe(archiveName);
    expect(res.Description).toBe("Test archive");
    expect(res.RetentionDays).toBe(30);
    expect(res.State).toBe("ENABLED");
  });

  test("ListArchives", async () => {
    const res = await eb.send(new ListArchivesCommand({}));
    expect(res.Archives?.some((a) => a.ArchiveName === archiveName)).toBe(true);
  });

  test("UpdateArchive", async () => {
    await eb.send(new UpdateArchiveCommand({ ArchiveName: archiveName, RetentionDays: 60 }));
    const res = await eb.send(new DescribeArchiveCommand({ ArchiveName: archiveName }));
    expect(res.RetentionDays).toBe(60);
  });

  test("DeleteArchive", async () => {
    await eb.send(new DeleteArchiveCommand({ ArchiveName: archiveName }));
    try {
      await eb.send(new DescribeArchiveCommand({ ArchiveName: archiveName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("CreateArchive duplicate throws", async () => {
    await eb.send(new CreateArchiveCommand({
      ArchiveName: "dup-archive",
      EventSourceArn: "arn:aws:events:us-east-1:000000000000:event-bus/default",
    }));
    try {
      await eb.send(new CreateArchiveCommand({
        ArchiveName: "dup-archive",
        EventSourceArn: "arn:aws:events:us-east-1:000000000000:event-bus/default",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceAlreadyExistsException");
    }
    await eb.send(new DeleteArchiveCommand({ ArchiveName: "dup-archive" }));
  });
});

describe("EventBridge - Connections", () => {
  const connName = "test-conn-" + Date.now();

  test("CreateConnection", async () => {
    const res = await eb.send(new CreateConnectionCommand({
      Name: connName,
      AuthorizationType: "API_KEY",
      AuthParameters: {
        ApiKeyAuthParameters: { ApiKeyName: "x-api-key", ApiKeyValue: "secret123" },
      },
    }));
    expect(res.ConnectionArn).toContain(connName);
    expect(res.ConnectionState).toBe("AUTHORIZED");
  });

  test("DescribeConnection", async () => {
    const res = await eb.send(new DescribeConnectionCommand({ Name: connName }));
    expect(res.Name).toBe(connName);
    expect(res.AuthorizationType).toBe("API_KEY");
    expect(res.ConnectionState).toBe("AUTHORIZED");
  });

  test("ListConnections", async () => {
    const res = await eb.send(new ListConnectionsCommand({}));
    expect(res.Connections?.some((c) => c.Name === connName)).toBe(true);
  });

  test("DeleteConnection", async () => {
    const res = await eb.send(new DeleteConnectionCommand({ Name: connName }));
    expect(res.ConnectionState).toBe("DELETING");
    try {
      await eb.send(new DescribeConnectionCommand({ Name: connName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });
});

describe("EventBridge - API Destinations", () => {
  const connName = "apidest-conn-" + Date.now();
  const destName = "test-dest-" + Date.now();
  let connectionArn: string;

  test("setup connection", async () => {
    const res = await eb.send(new CreateConnectionCommand({
      Name: connName,
      AuthorizationType: "API_KEY",
      AuthParameters: {
        ApiKeyAuthParameters: { ApiKeyName: "x-api-key", ApiKeyValue: "secret" },
      },
    }));
    connectionArn = res.ConnectionArn!;
  });

  test("CreateApiDestination", async () => {
    const res = await eb.send(new CreateApiDestinationCommand({
      Name: destName,
      ConnectionArn: connectionArn,
      InvocationEndpoint: "https://example.com/webhook",
      HttpMethod: "POST",
      InvocationRateLimitPerSecond: 100,
    }));
    expect(res.ApiDestinationArn).toContain(destName);
    expect(res.ApiDestinationState).toBe("ACTIVE");
  });

  test("DescribeApiDestination", async () => {
    const res = await eb.send(new DescribeApiDestinationCommand({ Name: destName }));
    expect(res.Name).toBe(destName);
    expect(res.InvocationEndpoint).toBe("https://example.com/webhook");
    expect(res.HttpMethod).toBe("POST");
    expect(res.InvocationRateLimitPerSecond).toBe(100);
    expect(res.ConnectionArn).toBe(connectionArn);
  });

  test("ListApiDestinations", async () => {
    const res = await eb.send(new ListApiDestinationsCommand({}));
    expect(res.ApiDestinations?.some((d) => d.Name === destName)).toBe(true);
  });

  test("DeleteApiDestination", async () => {
    await eb.send(new DeleteApiDestinationCommand({ Name: destName }));
    try {
      await eb.send(new DescribeApiDestinationCommand({ Name: destName }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });

  test("cleanup connection", async () => {
    await eb.send(new DeleteConnectionCommand({ Name: connName }));
  });
});

describe("EventBridge - Permissions", () => {
  test("PutPermission + RemovePermission", async () => {
    await eb.send(new PutPermissionCommand({
      StatementId: "allow-account",
      Action: "events:PutEvents",
      Principal: "123456789012",
    }));
    // Should not throw
    await eb.send(new RemovePermissionCommand({
      StatementId: "allow-account",
    }));
  });
});

describe("EventBridge - ListRuleNamesByTarget", () => {
  test("finds rules targeting a specific ARN", async () => {
    const targetArn = "arn:aws:sqs:us-east-1:000000000000:target-queue";
    await eb.send(new PutRuleCommand({
      Name: "rule-with-target",
      EventPattern: JSON.stringify({ source: ["test"] }),
      State: "ENABLED",
    }));
    await eb.send(new PutTargetsCommand({
      Rule: "rule-with-target",
      Targets: [{ Id: "t1", Arn: targetArn }],
    }));

    const res = await eb.send(new ListRuleNamesByTargetCommand({ TargetArn: targetArn }));
    expect(res.RuleNames).toContain("rule-with-target");

    // cleanup
    await eb.send(new RemoveTargetsCommand({ Rule: "rule-with-target", Ids: ["t1"] }));
    await eb.send(new DeleteRuleCommand({ Name: "rule-with-target" }));
  });
});

describe("EventBridge - EnableRule / DisableRule", () => {
  test("enable and disable a rule", async () => {
    await eb.send(new PutRuleCommand({
      Name: "toggle-rule",
      EventPattern: JSON.stringify({ source: ["test"] }),
      State: "ENABLED",
    }));

    // Disable it
    await eb.send(new DisableRuleCommand({ Name: "toggle-rule" }));
    let rule = await eb.send(new DescribeRuleCommand({ Name: "toggle-rule" }));
    expect(rule.State).toBe("DISABLED");

    // Enable it
    await eb.send(new EnableRuleCommand({ Name: "toggle-rule" }));
    rule = await eb.send(new DescribeRuleCommand({ Name: "toggle-rule" }));
    expect(rule.State).toBe("ENABLED");

    // cleanup
    await eb.send(new DeleteRuleCommand({ Name: "toggle-rule" }));
  });

  test("DisableRule nonexistent throws", async () => {
    try {
      await eb.send(new DisableRuleCommand({ Name: "nonexistent-rule" }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceNotFoundException");
    }
  });
});

describe("EventBridge - Replays", () => {
  const replayName = "test-replay-" + Date.now();
  const eventSourceArn = "arn:aws:events:us-east-1:000000000000:archive/my-archive";

  test("StartReplay", async () => {
    const res = await eb.send(new StartReplayCommand({
      ReplayName: replayName,
      EventSourceArn: eventSourceArn,
      EventStartTime: new Date("2024-01-01T00:00:00Z"),
      EventEndTime: new Date("2024-01-02T00:00:00Z"),
      Destination: { Arn: "arn:aws:events:us-east-1:000000000000:event-bus/default" },
    }));
    expect(res.ReplayArn).toContain(replayName);
    expect(res.State).toBe("COMPLETED");
  });

  test("DescribeReplay", async () => {
    const res = await eb.send(new DescribeReplayCommand({ ReplayName: replayName }));
    expect(res.ReplayName).toBe(replayName);
    expect(res.State).toBe("COMPLETED");
    expect(res.EventSourceArn).toBe(eventSourceArn);
    expect(res.Destination?.Arn).toBe("arn:aws:events:us-east-1:000000000000:event-bus/default");
  });

  test("ListReplays", async () => {
    const res = await eb.send(new ListReplaysCommand({}));
    expect(res.Replays?.some((r) => r.ReplayName === replayName)).toBe(true);
  });

  test("StartReplay duplicate throws", async () => {
    try {
      await eb.send(new StartReplayCommand({
        ReplayName: replayName,
        EventSourceArn: eventSourceArn,
        EventStartTime: new Date("2024-01-01T00:00:00Z"),
        EventEndTime: new Date("2024-01-02T00:00:00Z"),
        Destination: { Arn: "arn:aws:events:us-east-1:000000000000:event-bus/default" },
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ResourceAlreadyExistsException");
    }
  });

  test("CancelReplay", async () => {
    const cancelName = "cancel-replay-" + Date.now();
    await eb.send(new StartReplayCommand({
      ReplayName: cancelName,
      EventSourceArn: eventSourceArn,
      EventStartTime: new Date("2024-01-01T00:00:00Z"),
      EventEndTime: new Date("2024-01-02T00:00:00Z"),
      Destination: { Arn: "arn:aws:events:us-east-1:000000000000:event-bus/default" },
    }));

    const res = await eb.send(new CancelReplayCommand({ ReplayName: cancelName }));
    expect(res.State).toBe("CANCELLED");

    const desc = await eb.send(new DescribeReplayCommand({ ReplayName: cancelName }));
    expect(desc.State).toBe("CANCELLED");
  });
});
