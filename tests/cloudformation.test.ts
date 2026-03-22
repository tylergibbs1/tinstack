import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  UpdateStackCommand,
  DeleteStackCommand,
  ListStacksCommand,
  GetTemplateCommand,
  DescribeStackResourcesCommand,
  DescribeStackEventsCommand,
  CreateChangeSetCommand,
  DescribeChangeSetCommand,
  ExecuteChangeSetCommand,
  ValidateTemplateCommand,
  GetTemplateSummaryCommand,
  ListStackResourcesCommand,
  CreateStackSetCommand,
  DescribeStackSetCommand,
  ListStackSetsCommand,
  DeleteStackSetCommand,
  CreateStackInstancesCommand,
  ListStackInstancesCommand,
  DeleteStackInstancesCommand,
} from "@aws-sdk/client-cloudformation";
import { startServer, stopServer, clientConfig } from "./helpers";

const cfn = new CloudFormationClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

const TEMPLATE = JSON.stringify({
  AWSTemplateFormatVersion: "2010-09-09",
  Parameters: {
    Env: { Type: "String", Default: "dev", Description: "Environment name" },
  },
  Resources: {
    MyBucket: { Type: "AWS::S3::Bucket", Properties: { BucketName: "my-bucket" } },
    MyQueue: { Type: "AWS::SQS::Queue", Properties: { QueueName: "my-queue" } },
  },
  Outputs: {
    BucketName: { Value: "my-bucket", Description: "The bucket name" },
  },
});

const UPDATED_TEMPLATE = JSON.stringify({
  AWSTemplateFormatVersion: "2010-09-09",
  Resources: {
    MyBucket: { Type: "AWS::S3::Bucket", Properties: { BucketName: "my-bucket-v2" } },
  },
  Outputs: {
    BucketName: { Value: "my-bucket-v2", Description: "The updated bucket name" },
  },
});

describe("CloudFormation", () => {
  let stackId: string;
  let stackName: string;

  test("CreateStack", async () => {
    stackName = `test-stack-${Date.now()}`;
    const res = await cfn.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: TEMPLATE,
      Parameters: [{ ParameterKey: "Env", ParameterValue: "prod" }],
      Tags: [{ Key: "project", Value: "tinstack" }],
    }));
    expect(res.StackId).toBeDefined();
    stackId = res.StackId!;
    expect(stackId).toContain("arn:aws:cloudformation:");
    expect(stackId).toContain(stackName);
  });

  test("CreateStack - duplicate fails", async () => {
    try {
      await cfn.send(new CreateStackCommand({
        StackName: stackName,
        TemplateBody: TEMPLATE,
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("AlreadyExistsException");
    }
  });

  test("DescribeStacks - by name", async () => {
    const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    expect(res.Stacks).toBeDefined();
    expect(res.Stacks!.length).toBe(1);
    const stack = res.Stacks![0];
    expect(stack.StackName).toBe(stackName);
    expect(stack.StackId).toBe(stackId);
    expect(stack.StackStatus).toBe("CREATE_COMPLETE");
    expect(stack.Parameters!.length).toBe(1);
    expect(stack.Parameters![0].ParameterKey).toBe("Env");
    expect(stack.Parameters![0].ParameterValue).toBe("prod");
    expect(stack.Tags!.some((t) => t.Key === "project" && t.Value === "tinstack")).toBe(true);
    expect(stack.Outputs!.length).toBe(1);
    expect(stack.Outputs![0].OutputKey).toBe("BucketName");
    expect(stack.Outputs![0].OutputValue).toBe("my-bucket");
  });

  test("DescribeStacks - all", async () => {
    const res = await cfn.send(new DescribeStacksCommand({}));
    expect(res.Stacks!.length).toBeGreaterThanOrEqual(1);
    expect(res.Stacks!.some((s) => s.StackName === stackName)).toBe(true);
  });

  test("ListStacks", async () => {
    const res = await cfn.send(new ListStacksCommand({}));
    expect(res.StackSummaries).toBeDefined();
    expect(res.StackSummaries!.length).toBeGreaterThanOrEqual(1);
    const summary = res.StackSummaries!.find((s) => s.StackName === stackName);
    expect(summary).toBeDefined();
    expect(summary!.StackStatus).toBe("CREATE_COMPLETE");
    expect(summary!.StackId).toBe(stackId);
  });

  test("GetTemplate", async () => {
    const res = await cfn.send(new GetTemplateCommand({ StackName: stackName }));
    expect(res.TemplateBody).toBeDefined();
    const parsed = JSON.parse(res.TemplateBody!);
    expect(parsed.AWSTemplateFormatVersion).toBe("2010-09-09");
    expect(parsed.Resources.MyBucket).toBeDefined();
  });

  test("DescribeStackResources", async () => {
    const res = await cfn.send(new DescribeStackResourcesCommand({ StackName: stackName }));
    expect(res.StackResources).toBeDefined();
    expect(res.StackResources!.length).toBe(2);
    const types = res.StackResources!.map((r) => r.ResourceType);
    expect(types).toContain("AWS::S3::Bucket");
    expect(types).toContain("AWS::SQS::Queue");
    for (const r of res.StackResources!) {
      expect(r.LogicalResourceId).toBeDefined();
      expect(r.PhysicalResourceId).toBeDefined();
      expect(r.ResourceStatus).toBe("CREATE_COMPLETE");
    }
  });

  test("DescribeStackEvents", async () => {
    const res = await cfn.send(new DescribeStackEventsCommand({ StackName: stackName }));
    expect(res.StackEvents).toBeDefined();
    expect(res.StackEvents!.length).toBeGreaterThanOrEqual(1);
    const event = res.StackEvents![0];
    expect(event.StackId).toBe(stackId);
    expect(event.StackName).toBe(stackName);
    expect(event.ResourceType).toBe("AWS::CloudFormation::Stack");
    expect(event.ResourceStatus).toBe("CREATE_COMPLETE");
  });

  test("UpdateStack", async () => {
    const res = await cfn.send(new UpdateStackCommand({
      StackName: stackName,
      TemplateBody: UPDATED_TEMPLATE,
    }));
    expect(res.StackId).toBe(stackId);

    const desc = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    expect(desc.Stacks![0].StackStatus).toBe("UPDATE_COMPLETE");
    expect(desc.Stacks![0].Outputs![0].OutputValue).toBe("my-bucket-v2");
  });

  test("ValidateTemplate", async () => {
    const res = await cfn.send(new ValidateTemplateCommand({
      TemplateBody: TEMPLATE,
    }));
    expect(res.Parameters).toBeDefined();
    expect(res.Parameters!.length).toBe(1);
    expect(res.Parameters![0].ParameterKey).toBe("Env");
    expect(res.Parameters![0].DefaultValue).toBe("dev");
    expect(res.Parameters![0].Description).toBe("Environment name");
  });

  test("ValidateTemplate - invalid JSON fails", async () => {
    try {
      await cfn.send(new ValidateTemplateCommand({
        TemplateBody: "not valid json",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain("Template format error");
    }
  });

  // Change Set operations
  let changeSetId: string;
  const changeSetName = "my-change-set";

  test("CreateChangeSet", async () => {
    const res = await cfn.send(new CreateChangeSetCommand({
      StackName: stackName,
      ChangeSetName: changeSetName,
      TemplateBody: TEMPLATE,
      Parameters: [{ ParameterKey: "Env", ParameterValue: "staging" }],
    }));
    expect(res.Id).toBeDefined();
    expect(res.StackId).toBe(stackId);
    changeSetId = res.Id!;
  });

  test("DescribeChangeSet", async () => {
    const res = await cfn.send(new DescribeChangeSetCommand({
      ChangeSetName: changeSetId,
    }));
    expect(res.ChangeSetName).toBe(changeSetName);
    expect(res.StackName).toBe(stackName);
    expect(res.Status).toBe("CREATE_COMPLETE");
    expect(res.Parameters!.length).toBe(1);
    expect(res.Parameters![0].ParameterKey).toBe("Env");
    expect(res.Parameters![0].ParameterValue).toBe("staging");
  });

  test("ExecuteChangeSet", async () => {
    await cfn.send(new ExecuteChangeSetCommand({
      ChangeSetName: changeSetId,
    }));

    const desc = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
    expect(desc.Stacks![0].StackStatus).toBe("UPDATE_COMPLETE");
  });

  test("ExecuteChangeSet - already executed fails", async () => {
    try {
      await cfn.send(new ExecuteChangeSetCommand({
        ChangeSetName: changeSetId,
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("InvalidChangeSetStatusException");
    }
  });

  test("DeleteStack", async () => {
    await cfn.send(new DeleteStackCommand({ StackName: stackName }));

    // After deletion, DescribeStacks without name should not include it
    const res = await cfn.send(new DescribeStacksCommand({}));
    expect(res.Stacks!.some((s) => s.StackName === stackName)).toBe(false);

    // But ListStacks should still show it as DELETE_COMPLETE
    const list = await cfn.send(new ListStacksCommand({}));
    const deleted = list.StackSummaries!.find((s) => s.StackName === stackName);
    expect(deleted).toBeDefined();
    expect(deleted!.StackStatus).toBe("DELETE_COMPLETE");
  });

  // --- GetTemplateSummary ---

  test("GetTemplateSummary", async () => {
    const templateWithDesc = JSON.stringify({
      AWSTemplateFormatVersion: "2010-09-09",
      Description: "A test template",
      Parameters: {
        Env: { Type: "String", Default: "dev", Description: "Environment" },
        Port: { Type: "Number", Default: "8080" },
      },
      Resources: {
        MyBucket: { Type: "AWS::S3::Bucket", Properties: {} },
        MyQueue: { Type: "AWS::SQS::Queue", Properties: {} },
      },
    });
    const res = await cfn.send(new GetTemplateSummaryCommand({
      TemplateBody: templateWithDesc,
    }));
    expect(res.Parameters).toBeDefined();
    expect(res.Parameters!.length).toBe(2);
    expect(res.Parameters!.find((p) => p.ParameterKey === "Env")).toBeDefined();
    expect(res.ResourceTypes).toBeDefined();
    expect(res.ResourceTypes!).toContain("AWS::S3::Bucket");
    expect(res.ResourceTypes!).toContain("AWS::SQS::Queue");
    expect(res.Description).toBe("A test template");
  });

  // --- ListStackResources ---

  test("ListStackResources", async () => {
    // Create a fresh stack for this test
    const name = `list-res-stack-${Date.now()}`;
    await cfn.send(new CreateStackCommand({
      StackName: name,
      TemplateBody: TEMPLATE,
    }));

    const res = await cfn.send(new ListStackResourcesCommand({ StackName: name }));
    expect(res.StackResourceSummaries).toBeDefined();
    expect(res.StackResourceSummaries!.length).toBe(2);
    for (const r of res.StackResourceSummaries!) {
      expect(r.LogicalResourceId).toBeDefined();
      expect(r.PhysicalResourceId).toBeDefined();
      expect(r.ResourceType).toBeDefined();
      expect(r.ResourceStatus).toBe("CREATE_COMPLETE");
    }

    // Cleanup
    await cfn.send(new DeleteStackCommand({ StackName: name }));
  });

  // --- Stack Sets ---

  const stackSetName = `test-stack-set-${Date.now()}`;

  test("CreateStackSet", async () => {
    const res = await cfn.send(new CreateStackSetCommand({
      StackSetName: stackSetName,
      TemplateBody: TEMPLATE,
      Parameters: [{ ParameterKey: "Env", ParameterValue: "prod" }],
      Capabilities: ["CAPABILITY_IAM"],
      AdministrationRoleARN: "arn:aws:iam::123456789012:role/Admin",
    }));
    expect(res.StackSetId).toBeDefined();
  });

  test("CreateStackSet - duplicate fails", async () => {
    try {
      await cfn.send(new CreateStackSetCommand({
        StackSetName: stackSetName,
        TemplateBody: TEMPLATE,
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("NameAlreadyExistsException");
    }
  });

  test("DescribeStackSet", async () => {
    const res = await cfn.send(new DescribeStackSetCommand({
      StackSetName: stackSetName,
    }));
    expect(res.StackSet).toBeDefined();
    expect(res.StackSet!.StackSetName).toBe(stackSetName);
    expect(res.StackSet!.Status).toBe("ACTIVE");
    expect(res.StackSet!.AdministrationRoleARN).toBe("arn:aws:iam::123456789012:role/Admin");
  });

  test("ListStackSets", async () => {
    const res = await cfn.send(new ListStackSetsCommand({}));
    expect(res.Summaries).toBeDefined();
    expect(res.Summaries!.some((s) => s.StackSetName === stackSetName)).toBe(true);
  });

  test("CreateStackInstances", async () => {
    const res = await cfn.send(new CreateStackInstancesCommand({
      StackSetName: stackSetName,
      Accounts: ["111111111111", "222222222222"],
      Regions: ["us-east-1", "us-west-2"],
    }));
    expect(res.OperationId).toBeDefined();
  });

  test("ListStackInstances", async () => {
    const res = await cfn.send(new ListStackInstancesCommand({
      StackSetName: stackSetName,
    }));
    expect(res.Summaries).toBeDefined();
    expect(res.Summaries!.length).toBe(4); // 2 accounts x 2 regions
    expect(res.Summaries!.every((s) => s.Status === "CURRENT")).toBe(true);
  });

  test("DeleteStackInstances", async () => {
    const res = await cfn.send(new DeleteStackInstancesCommand({
      StackSetName: stackSetName,
      Accounts: ["111111111111"],
      Regions: ["us-east-1", "us-west-2"],
      RetainStacks: false,
    }));
    expect(res.OperationId).toBeDefined();

    const list = await cfn.send(new ListStackInstancesCommand({
      StackSetName: stackSetName,
    }));
    expect(list.Summaries!.length).toBe(2); // Only account 222222222222 remains
  });

  test("DeleteStackSet - not empty fails", async () => {
    try {
      await cfn.send(new DeleteStackSetCommand({
        StackSetName: stackSetName,
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("StackSetNotEmptyException");
    }
  });

  test("DeleteStackSet - after clearing instances", async () => {
    // Remove remaining instances
    await cfn.send(new DeleteStackInstancesCommand({
      StackSetName: stackSetName,
      Accounts: ["222222222222"],
      Regions: ["us-east-1", "us-west-2"],
      RetainStacks: false,
    }));
    // Now delete should succeed
    await cfn.send(new DeleteStackSetCommand({
      StackSetName: stackSetName,
    }));

    // Should be gone
    const list = await cfn.send(new ListStackSetsCommand({}));
    expect(list.Summaries!.some((s) => s.StackSetName === stackSetName)).toBe(false);
  });

  test("DescribeStackSet - not found", async () => {
    try {
      await cfn.send(new DescribeStackSetCommand({
        StackSetName: "nonexistent-stack-set",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("StackSetNotFoundException");
    }
  });
});
