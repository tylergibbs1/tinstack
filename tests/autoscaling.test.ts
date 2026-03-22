import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  AutoScalingClient,
  CreateAutoScalingGroupCommand,
  DescribeAutoScalingGroupsCommand,
  UpdateAutoScalingGroupCommand,
  DeleteAutoScalingGroupCommand,
  CreateLaunchConfigurationCommand,
  DescribeLaunchConfigurationsCommand,
  DeleteLaunchConfigurationCommand,
  SetDesiredCapacityCommand,
  DescribeScalingActivitiesCommand,
  PutScalingPolicyCommand,
  DescribePoliciesCommand,
  DeletePolicyCommand,
  CreateOrUpdateTagsCommand,
  DescribeTagsCommand,
} from "@aws-sdk/client-auto-scaling";
import { startServer, stopServer, clientConfig } from "./helpers";

const autoscaling = new AutoScalingClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Auto Scaling", () => {
  // --- Launch Configurations ---

  test("CreateLaunchConfiguration", async () => {
    await autoscaling.send(new CreateLaunchConfigurationCommand({
      LaunchConfigurationName: "test-lc",
      ImageId: "ami-12345678",
      InstanceType: "t2.micro",
    }));
    // No error means success (returns empty body)
  });

  test("CreateLaunchConfiguration - duplicate fails", async () => {
    try {
      await autoscaling.send(new CreateLaunchConfigurationCommand({
        LaunchConfigurationName: "test-lc",
        ImageId: "ami-12345678",
        InstanceType: "t2.micro",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toMatch(/AlreadyExists/);
    }
  });

  test("DescribeLaunchConfigurations", async () => {
    const res = await autoscaling.send(new DescribeLaunchConfigurationsCommand({
      LaunchConfigurationNames: ["test-lc"],
    }));
    expect(res.LaunchConfigurations!.length).toBe(1);
    expect(res.LaunchConfigurations![0].LaunchConfigurationName).toBe("test-lc");
    expect(res.LaunchConfigurations![0].ImageId).toBe("ami-12345678");
    expect(res.LaunchConfigurations![0].InstanceType).toBe("t2.micro");
  });

  test("DescribeLaunchConfigurations - all", async () => {
    const res = await autoscaling.send(new DescribeLaunchConfigurationsCommand({}));
    expect(res.LaunchConfigurations!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Auto Scaling Groups ---

  test("CreateAutoScalingGroup", async () => {
    await autoscaling.send(new CreateAutoScalingGroupCommand({
      AutoScalingGroupName: "test-asg",
      LaunchConfigurationName: "test-lc",
      MinSize: 1,
      MaxSize: 5,
      DesiredCapacity: 2,
      AvailabilityZones: ["us-east-1a", "us-east-1b"],
    }));
    // No error means success
  });

  test("CreateAutoScalingGroup - duplicate fails", async () => {
    try {
      await autoscaling.send(new CreateAutoScalingGroupCommand({
        AutoScalingGroupName: "test-asg",
        LaunchConfigurationName: "test-lc",
        MinSize: 1,
        MaxSize: 5,
        AvailabilityZones: ["us-east-1a"],
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toMatch(/AlreadyExists/);
    }
  });

  test("DescribeAutoScalingGroups", async () => {
    const res = await autoscaling.send(new DescribeAutoScalingGroupsCommand({
      AutoScalingGroupNames: ["test-asg"],
    }));
    expect(res.AutoScalingGroups!.length).toBe(1);
    const asg = res.AutoScalingGroups![0];
    expect(asg.AutoScalingGroupName).toBe("test-asg");
    expect(asg.MinSize).toBe(1);
    expect(asg.MaxSize).toBe(5);
    expect(asg.DesiredCapacity).toBe(2);
    expect(asg.AvailabilityZones).toEqual(["us-east-1a", "us-east-1b"]);
  });

  test("UpdateAutoScalingGroup", async () => {
    await autoscaling.send(new UpdateAutoScalingGroupCommand({
      AutoScalingGroupName: "test-asg",
      MinSize: 2,
      MaxSize: 10,
      DesiredCapacity: 3,
    }));

    const res = await autoscaling.send(new DescribeAutoScalingGroupsCommand({
      AutoScalingGroupNames: ["test-asg"],
    }));
    expect(res.AutoScalingGroups![0].MinSize).toBe(2);
    expect(res.AutoScalingGroups![0].MaxSize).toBe(10);
    expect(res.AutoScalingGroups![0].DesiredCapacity).toBe(3);
  });

  test("SetDesiredCapacity", async () => {
    await autoscaling.send(new SetDesiredCapacityCommand({
      AutoScalingGroupName: "test-asg",
      DesiredCapacity: 5,
    }));

    const res = await autoscaling.send(new DescribeAutoScalingGroupsCommand({
      AutoScalingGroupNames: ["test-asg"],
    }));
    expect(res.AutoScalingGroups![0].DesiredCapacity).toBe(5);
  });

  test("SetDesiredCapacity - out of range fails", async () => {
    try {
      await autoscaling.send(new SetDesiredCapacityCommand({
        AutoScalingGroupName: "test-asg",
        DesiredCapacity: 100,
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ValidationError");
    }
  });

  // --- Scaling Policies ---

  test("PutScalingPolicy", async () => {
    const res = await autoscaling.send(new PutScalingPolicyCommand({
      AutoScalingGroupName: "test-asg",
      PolicyName: "scale-up",
      PolicyType: "SimpleScaling",
      AdjustmentType: "ChangeInCapacity",
      ScalingAdjustment: 1,
      Cooldown: 60,
    }));
    expect(res.PolicyARN).toBeDefined();
  });

  test("DescribePolicies", async () => {
    const res = await autoscaling.send(new DescribePoliciesCommand({
      AutoScalingGroupName: "test-asg",
    }));
    expect(res.ScalingPolicies!.length).toBeGreaterThanOrEqual(1);
    const policy = res.ScalingPolicies!.find((p) => p.PolicyName === "scale-up");
    expect(policy).toBeDefined();
    expect(policy!.AdjustmentType).toBe("ChangeInCapacity");
    expect(policy!.ScalingAdjustment).toBe(1);
  });

  test("DeletePolicy", async () => {
    await autoscaling.send(new DeletePolicyCommand({
      AutoScalingGroupName: "test-asg",
      PolicyName: "scale-up",
    }));

    const res = await autoscaling.send(new DescribePoliciesCommand({
      AutoScalingGroupName: "test-asg",
    }));
    expect(res.ScalingPolicies!.find((p) => p.PolicyName === "scale-up")).toBeUndefined();
  });

  // --- Activities ---

  test("DescribeScalingActivities", async () => {
    const res = await autoscaling.send(new DescribeScalingActivitiesCommand({
      AutoScalingGroupName: "test-asg",
    }));
    expect(res.Activities!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Tags ---

  test("CreateOrUpdateTags", async () => {
    await autoscaling.send(new CreateOrUpdateTagsCommand({
      Tags: [
        { Key: "env", Value: "test", ResourceId: "test-asg", ResourceType: "auto-scaling-group", PropagateAtLaunch: true },
        { Key: "team", Value: "platform", ResourceId: "test-asg", ResourceType: "auto-scaling-group", PropagateAtLaunch: false },
      ],
    }));

    const res = await autoscaling.send(new DescribeAutoScalingGroupsCommand({
      AutoScalingGroupNames: ["test-asg"],
    }));
    const tags = res.AutoScalingGroups![0].Tags!;
    expect(tags.length).toBeGreaterThanOrEqual(2);
    expect(tags.find((t) => t.Key === "env")!.Value).toBe("test");
  });

  test("DescribeTags", async () => {
    const res = await autoscaling.send(new DescribeTagsCommand({}));
    expect(res.Tags!.length).toBeGreaterThanOrEqual(2);
  });

  // --- Cleanup ---

  test("DeleteAutoScalingGroup", async () => {
    await autoscaling.send(new DeleteAutoScalingGroupCommand({
      AutoScalingGroupName: "test-asg",
    }));

    const res = await autoscaling.send(new DescribeAutoScalingGroupsCommand({
      AutoScalingGroupNames: ["test-asg"],
    }));
    expect(res.AutoScalingGroups!.length).toBe(0);
  });

  test("DeleteLaunchConfiguration", async () => {
    await autoscaling.send(new DeleteLaunchConfigurationCommand({
      LaunchConfigurationName: "test-lc",
    }));

    const res = await autoscaling.send(new DescribeLaunchConfigurationsCommand({
      LaunchConfigurationNames: ["test-lc"],
    }));
    expect(res.LaunchConfigurations!.length).toBe(0);
  });
});
