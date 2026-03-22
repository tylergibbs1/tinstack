import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  IoTClient,
  CreateThingCommand,
  DescribeThingCommand,
  ListThingsCommand,
  DeleteThingCommand,
  UpdateThingCommand,
  CreateThingTypeCommand,
  ListThingTypesCommand,
  CreateThingGroupCommand,
  ListThingGroupsCommand,
  AddThingToThingGroupCommand,
  CreatePolicyCommand,
  GetPolicyCommand,
  ListPoliciesCommand,
  DeletePolicyCommand,
  AttachPolicyCommand,
  DetachPolicyCommand,
  CreateTopicRuleCommand,
  GetTopicRuleCommand,
  ListTopicRulesCommand,
  DeleteTopicRuleCommand,
  CreateCertificateFromCsrCommand,
  ListCertificatesCommand,
  DescribeEndpointCommand,
} from "@aws-sdk/client-iot";
import { startServer, stopServer, clientConfig } from "./helpers";

const iot = new IoTClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("IoT Core", () => {
  // --- Things ---

  test("CreateThing", async () => {
    const res = await iot.send(
      new CreateThingCommand({
        thingName: "test-thing",
        attributePayload: { attributes: { location: "office" } },
      }),
    );
    expect(res.thingName).toBe("test-thing");
    expect(res.thingArn).toContain("thing/test-thing");
    expect(res.thingId).toBeDefined();
  });

  test("DescribeThing", async () => {
    const res = await iot.send(
      new DescribeThingCommand({ thingName: "test-thing" }),
    );
    expect(res.thingName).toBe("test-thing");
    expect(res.attributes?.location).toBe("office");
    expect(res.version).toBe(1);
  });

  test("ListThings", async () => {
    const res = await iot.send(new ListThingsCommand({}));
    expect(res.things!.length).toBeGreaterThanOrEqual(1);
    expect(res.things!.some((t) => t.thingName === "test-thing")).toBe(true);
  });

  test("UpdateThing", async () => {
    await iot.send(
      new UpdateThingCommand({
        thingName: "test-thing",
        attributePayload: { attributes: { location: "lab" } },
      }),
    );
    const res = await iot.send(
      new DescribeThingCommand({ thingName: "test-thing" }),
    );
    expect(res.attributes?.location).toBe("lab");
    expect(res.version).toBe(2);
  });

  // --- Thing Types ---

  test("CreateThingType", async () => {
    const res = await iot.send(
      new CreateThingTypeCommand({
        thingTypeName: "sensor",
        thingTypeProperties: { thingTypeDescription: "A sensor" },
      }),
    );
    expect(res.thingTypeName).toBe("sensor");
    expect(res.thingTypeArn).toContain("thingtype/sensor");
  });

  test("ListThingTypes", async () => {
    const res = await iot.send(new ListThingTypesCommand({}));
    expect(res.thingTypes!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Thing Groups ---

  test("CreateThingGroup", async () => {
    const res = await iot.send(
      new CreateThingGroupCommand({ thingGroupName: "office-devices" }),
    );
    expect(res.thingGroupName).toBe("office-devices");
    expect(res.thingGroupArn).toContain("thinggroup/office-devices");
  });

  test("ListThingGroups", async () => {
    const res = await iot.send(new ListThingGroupsCommand({}));
    expect(res.thingGroups!.length).toBeGreaterThanOrEqual(1);
  });

  test("AddThingToThingGroup", async () => {
    await iot.send(
      new AddThingToThingGroupCommand({
        thingName: "test-thing",
        thingGroupName: "office-devices",
      }),
    );
    // No error means success
  });

  // --- Policies ---

  test("CreatePolicy (IoT)", async () => {
    const res = await iot.send(
      new CreatePolicyCommand({
        policyName: "test-policy",
        policyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [{ Effect: "Allow", Action: "iot:*", Resource: "*" }],
        }),
      }),
    );
    expect(res.policyName).toBe("test-policy");
    expect(res.policyArn).toContain("policy/test-policy");
  });

  test("GetPolicy", async () => {
    const res = await iot.send(
      new GetPolicyCommand({ policyName: "test-policy" }),
    );
    expect(res.policyName).toBe("test-policy");
    expect(res.policyDocument).toBeDefined();
  });

  test("ListPolicies", async () => {
    const res = await iot.send(new ListPoliciesCommand({}));
    expect(res.policies!.length).toBeGreaterThanOrEqual(1);
  });

  test("AttachPolicy", async () => {
    await iot.send(
      new AttachPolicyCommand({
        policyName: "test-policy",
        target: "arn:aws:iot:us-east-1:000000000000:thing/test-thing",
      }),
    );
    // No error means success
  });

  test("DetachPolicy", async () => {
    await iot.send(
      new DetachPolicyCommand({
        policyName: "test-policy",
        target: "arn:aws:iot:us-east-1:000000000000:thing/test-thing",
      }),
    );
    // No error means success
  });

  // --- Topic Rules ---

  test("CreateTopicRule", async () => {
    await iot.send(
      new CreateTopicRuleCommand({
        ruleName: "test-rule",
        topicRulePayload: {
          sql: "SELECT * FROM 'topic/test'",
          actions: [{ lambda: { functionArn: "arn:aws:lambda:us-east-1:000000000000:function:my-func" } }],
          ruleDisabled: false,
        },
      }),
    );
    // No error means success
  });

  test("GetTopicRule", async () => {
    const res = await iot.send(
      new GetTopicRuleCommand({ ruleName: "test-rule" }),
    );
    expect(res.ruleArn).toContain("rule/test-rule");
    expect(res.rule?.sql).toBe("SELECT * FROM 'topic/test'");
  });

  test("ListTopicRules", async () => {
    const res = await iot.send(new ListTopicRulesCommand({}));
    expect(res.rules!.length).toBeGreaterThanOrEqual(1);
  });

  test("DeleteTopicRule", async () => {
    await iot.send(new DeleteTopicRuleCommand({ ruleName: "test-rule" }));
    const res = await iot.send(new ListTopicRulesCommand({}));
    expect(res.rules!.some((r) => r.ruleName === "test-rule")).toBe(false);
  });

  // --- Certificates ---

  test("CreateCertificateFromCsr", async () => {
    const res = await iot.send(
      new CreateCertificateFromCsrCommand({
        certificateSigningRequest: "-----BEGIN CERTIFICATE REQUEST-----\nMOCK\n-----END CERTIFICATE REQUEST-----",
        setAsActive: true,
      }),
    );
    expect(res.certificateId).toBeDefined();
    expect(res.certificateArn).toContain("cert/");
    expect(res.certificatePem).toBeDefined();
  });

  test("ListCertificates", async () => {
    const res = await iot.send(new ListCertificatesCommand({}));
    expect(res.certificates!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Endpoint ---

  test("DescribeEndpoint", async () => {
    const res = await iot.send(
      new DescribeEndpointCommand({ endpointType: "iot:Data-ATS" }),
    );
    expect(res.endpointAddress).toContain(".iot.us-east-1.amazonaws.com");
  });

  // --- Cleanup ---

  test("DeletePolicy", async () => {
    await iot.send(new DeletePolicyCommand({ policyName: "test-policy" }));
    const res = await iot.send(new ListPoliciesCommand({}));
    expect(res.policies!.some((p) => p.policyName === "test-policy")).toBe(false);
  });

  test("DeleteThing", async () => {
    await iot.send(new DeleteThingCommand({ thingName: "test-thing" }));
    const res = await iot.send(new ListThingsCommand({}));
    expect(res.things!.some((t) => t.thingName === "test-thing")).toBe(false);
  });
});
