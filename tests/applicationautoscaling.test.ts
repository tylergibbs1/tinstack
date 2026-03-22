import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ApplicationAutoScalingClient,
  RegisterScalableTargetCommand,
  DescribeScalableTargetsCommand,
  DeregisterScalableTargetCommand,
  PutScalingPolicyCommand,
  DescribeScalingPoliciesCommand,
  DeleteScalingPolicyCommand,
  DescribeScalingActivitiesCommand,
} from "@aws-sdk/client-application-auto-scaling";
import { startServer, stopServer, clientConfig } from "./helpers";

const appAutoscaling = new ApplicationAutoScalingClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Application Auto Scaling", () => {
  // --- Scalable Targets ---

  test("RegisterScalableTarget", async () => {
    const res = await appAutoscaling.send(new RegisterScalableTargetCommand({
      ServiceNamespace: "ecs",
      ResourceId: "service/my-cluster/my-service",
      ScalableDimension: "ecs:service:DesiredCount",
      MinCapacity: 1,
      MaxCapacity: 10,
    }));
    expect(res.ScalableTargetARN).toBeDefined();
  });

  test("RegisterScalableTarget - update existing", async () => {
    await appAutoscaling.send(new RegisterScalableTargetCommand({
      ServiceNamespace: "ecs",
      ResourceId: "service/my-cluster/my-service",
      ScalableDimension: "ecs:service:DesiredCount",
      MinCapacity: 2,
      MaxCapacity: 20,
    }));

    const res = await appAutoscaling.send(new DescribeScalableTargetsCommand({
      ServiceNamespace: "ecs",
      ResourceIds: ["service/my-cluster/my-service"],
    }));
    expect(res.ScalableTargets!.length).toBe(1);
    expect(res.ScalableTargets![0].MinCapacity).toBe(2);
    expect(res.ScalableTargets![0].MaxCapacity).toBe(20);
  });

  test("DescribeScalableTargets - by namespace", async () => {
    const res = await appAutoscaling.send(new DescribeScalableTargetsCommand({
      ServiceNamespace: "ecs",
    }));
    expect(res.ScalableTargets!.length).toBeGreaterThanOrEqual(1);
    expect(res.ScalableTargets![0].ServiceNamespace).toBe("ecs");
    expect(res.ScalableTargets![0].ResourceId).toBe("service/my-cluster/my-service");
    expect(res.ScalableTargets![0].ScalableDimension).toBe("ecs:service:DesiredCount");
  });

  test("DescribeScalableTargets - by dimension", async () => {
    const res = await appAutoscaling.send(new DescribeScalableTargetsCommand({
      ServiceNamespace: "ecs",
      ScalableDimension: "ecs:service:DesiredCount",
    }));
    expect(res.ScalableTargets!.length).toBe(1);
  });

  test("DescribeScalableTargets - empty namespace", async () => {
    const res = await appAutoscaling.send(new DescribeScalableTargetsCommand({
      ServiceNamespace: "dynamodb",
    }));
    expect(res.ScalableTargets!.length).toBe(0);
  });

  // --- Scaling Policies ---

  test("PutScalingPolicy - target tracking", async () => {
    const res = await appAutoscaling.send(new PutScalingPolicyCommand({
      PolicyName: "cpu-scaling",
      ServiceNamespace: "ecs",
      ResourceId: "service/my-cluster/my-service",
      ScalableDimension: "ecs:service:DesiredCount",
      PolicyType: "TargetTrackingScaling",
      TargetTrackingScalingPolicyConfiguration: {
        TargetValue: 75,
        PredefinedMetricSpecification: {
          PredefinedMetricType: "ECSServiceAverageCPUUtilization",
        },
        ScaleInCooldown: 60,
        ScaleOutCooldown: 60,
      },
    }));
    expect(res.PolicyARN).toBeDefined();
    expect(res.Alarms).toBeDefined();
  });

  test("DescribeScalingPolicies", async () => {
    const res = await appAutoscaling.send(new DescribeScalingPoliciesCommand({
      ServiceNamespace: "ecs",
      ResourceId: "service/my-cluster/my-service",
    }));
    expect(res.ScalingPolicies!.length).toBe(1);
    const policy = res.ScalingPolicies![0];
    expect(policy.PolicyName).toBe("cpu-scaling");
    expect(policy.PolicyType).toBe("TargetTrackingScaling");
    expect(policy.TargetTrackingScalingPolicyConfiguration!.TargetValue).toBe(75);
  });

  test("DescribeScalingPolicies - by policy name", async () => {
    const res = await appAutoscaling.send(new DescribeScalingPoliciesCommand({
      ServiceNamespace: "ecs",
      PolicyNames: ["cpu-scaling"],
    }));
    expect(res.ScalingPolicies!.length).toBe(1);
  });

  test("DeleteScalingPolicy", async () => {
    await appAutoscaling.send(new DeleteScalingPolicyCommand({
      PolicyName: "cpu-scaling",
      ServiceNamespace: "ecs",
      ResourceId: "service/my-cluster/my-service",
      ScalableDimension: "ecs:service:DesiredCount",
    }));

    const res = await appAutoscaling.send(new DescribeScalingPoliciesCommand({
      ServiceNamespace: "ecs",
    }));
    expect(res.ScalingPolicies!.length).toBe(0);
  });

  test("DeleteScalingPolicy - not found fails", async () => {
    try {
      await appAutoscaling.send(new DeleteScalingPolicyCommand({
        PolicyName: "nonexistent",
        ServiceNamespace: "ecs",
        ResourceId: "service/my-cluster/my-service",
        ScalableDimension: "ecs:service:DesiredCount",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ObjectNotFoundException");
    }
  });

  // --- Scaling Activities ---

  test("DescribeScalingActivities", async () => {
    const res = await appAutoscaling.send(new DescribeScalingActivitiesCommand({
      ServiceNamespace: "ecs",
    }));
    expect(res.ScalingActivities).toBeDefined();
    // May be empty since we haven't triggered any actual scaling
    expect(Array.isArray(res.ScalingActivities)).toBe(true);
  });

  // --- Cleanup ---

  test("DeregisterScalableTarget", async () => {
    await appAutoscaling.send(new DeregisterScalableTargetCommand({
      ServiceNamespace: "ecs",
      ResourceId: "service/my-cluster/my-service",
      ScalableDimension: "ecs:service:DesiredCount",
    }));

    const res = await appAutoscaling.send(new DescribeScalableTargetsCommand({
      ServiceNamespace: "ecs",
    }));
    expect(res.ScalableTargets!.length).toBe(0);
  });

  test("DeregisterScalableTarget - not found fails", async () => {
    try {
      await appAutoscaling.send(new DeregisterScalableTargetCommand({
        ServiceNamespace: "ecs",
        ResourceId: "service/nonexistent/nonexistent",
        ScalableDimension: "ecs:service:DesiredCount",
      }));
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.name).toBe("ObjectNotFoundException");
    }
  });

  // --- Multiple targets ---

  test("Register multiple scalable targets", async () => {
    await appAutoscaling.send(new RegisterScalableTargetCommand({
      ServiceNamespace: "dynamodb",
      ResourceId: "table/my-table",
      ScalableDimension: "dynamodb:table:ReadCapacityUnits",
      MinCapacity: 5,
      MaxCapacity: 100,
    }));

    await appAutoscaling.send(new RegisterScalableTargetCommand({
      ServiceNamespace: "dynamodb",
      ResourceId: "table/my-table",
      ScalableDimension: "dynamodb:table:WriteCapacityUnits",
      MinCapacity: 5,
      MaxCapacity: 50,
    }));

    const res = await appAutoscaling.send(new DescribeScalableTargetsCommand({
      ServiceNamespace: "dynamodb",
    }));
    expect(res.ScalableTargets!.length).toBe(2);

    // Cleanup
    await appAutoscaling.send(new DeregisterScalableTargetCommand({
      ServiceNamespace: "dynamodb",
      ResourceId: "table/my-table",
      ScalableDimension: "dynamodb:table:ReadCapacityUnits",
    }));
    await appAutoscaling.send(new DeregisterScalableTargetCommand({
      ServiceNamespace: "dynamodb",
      ResourceId: "table/my-table",
      ScalableDimension: "dynamodb:table:WriteCapacityUnits",
    }));
  });
});
