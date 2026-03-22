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
