import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ConfigServiceClient,
  PutConfigurationRecorderCommand,
  DescribeConfigurationRecordersCommand,
  DeleteConfigurationRecorderCommand,
  PutDeliveryChannelCommand,
  DescribeDeliveryChannelsCommand,
  DeleteDeliveryChannelCommand,
  StartConfigurationRecorderCommand,
  StopConfigurationRecorderCommand,
  PutConfigRuleCommand,
  DescribeConfigRulesCommand,
  DeleteConfigRuleCommand,
  PutEvaluationsCommand,
  GetComplianceDetailsByConfigRuleCommand,
  DescribeComplianceByConfigRuleCommand,
} from "@aws-sdk/client-config-service";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ConfigServiceClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Config", () => {
  const recorderName = "default";
  const channelName = "default";
  const ruleName = "test-rule";

  test("PutConfigurationRecorder", async () => {
    await client.send(new PutConfigurationRecorderCommand({
      ConfigurationRecorder: {
        name: recorderName,
        roleARN: "arn:aws:iam::000000000000:role/config-role",
        recordingGroup: {
          allSupported: true,
          includeGlobalResourceTypes: false,
        },
      },
    }));
  });

  test("DescribeConfigurationRecorders", async () => {
    const res = await client.send(new DescribeConfigurationRecordersCommand({}));
    expect(res.ConfigurationRecorders!.length).toBe(1);
    expect(res.ConfigurationRecorders![0].name).toBe(recorderName);
  });

  test("PutDeliveryChannel", async () => {
    await client.send(new PutDeliveryChannelCommand({
      DeliveryChannel: {
        name: channelName,
        s3BucketName: "config-bucket",
      },
    }));
  });

  test("DescribeDeliveryChannels", async () => {
    const res = await client.send(new DescribeDeliveryChannelsCommand({}));
    expect(res.DeliveryChannels!.length).toBe(1);
    expect(res.DeliveryChannels![0].s3BucketName).toBe("config-bucket");
  });

  test("StartConfigurationRecorder", async () => {
    await client.send(new StartConfigurationRecorderCommand({
      ConfigurationRecorderName: recorderName,
    }));
  });

  test("StopConfigurationRecorder", async () => {
    await client.send(new StopConfigurationRecorderCommand({
      ConfigurationRecorderName: recorderName,
    }));
  });

  test("PutConfigRule", async () => {
    await client.send(new PutConfigRuleCommand({
      ConfigRule: {
        ConfigRuleName: ruleName,
        Source: {
          Owner: "AWS",
          SourceIdentifier: "S3_BUCKET_VERSIONING_ENABLED",
        },
        Description: "Check S3 bucket versioning",
      },
    }));
  });

  test("DescribeConfigRules", async () => {
    const res = await client.send(new DescribeConfigRulesCommand({
      ConfigRuleNames: [ruleName],
    }));
    expect(res.ConfigRules!.length).toBe(1);
    expect(res.ConfigRules![0].ConfigRuleName).toBe(ruleName);
    expect(res.ConfigRules![0].ConfigRuleState).toBe("ACTIVE");
  });

  test("PutEvaluations", async () => {
    const res = await client.send(new PutEvaluationsCommand({
      ResultToken: "test-token",
      Evaluations: [{
        ComplianceResourceType: "AWS::S3::Bucket",
        ComplianceResourceId: "my-bucket",
        ComplianceType: "COMPLIANT",
        OrderingTimestamp: new Date(),
      }],
    }));
    expect(res.FailedEvaluations!.length).toBe(0);
  });

  test("GetComplianceDetailsByConfigRule", async () => {
    const res = await client.send(new GetComplianceDetailsByConfigRuleCommand({
      ConfigRuleName: ruleName,
    }));
    expect(res.EvaluationResults).toBeDefined();
  });

  test("DescribeComplianceByConfigRule", async () => {
    const res = await client.send(new DescribeComplianceByConfigRuleCommand({
      ConfigRuleNames: [ruleName],
    }));
    expect(res.ComplianceByConfigRules!.length).toBe(1);
    expect(res.ComplianceByConfigRules![0].ConfigRuleName).toBe(ruleName);
  });

  test("DeleteConfigRule", async () => {
    await client.send(new DeleteConfigRuleCommand({ ConfigRuleName: ruleName }));
    const res = await client.send(new DescribeConfigRulesCommand({}));
    expect(res.ConfigRules!.some((r) => r.ConfigRuleName === ruleName)).toBe(false);
  });

  test("DeleteDeliveryChannel", async () => {
    await client.send(new DeleteDeliveryChannelCommand({ DeliveryChannelName: channelName }));
  });

  test("DeleteConfigurationRecorder", async () => {
    await client.send(new DeleteConfigurationRecorderCommand({ ConfigurationRecorderName: recorderName }));
    const res = await client.send(new DescribeConfigurationRecordersCommand({}));
    expect(res.ConfigurationRecorders!.length).toBe(0);
  });
});
