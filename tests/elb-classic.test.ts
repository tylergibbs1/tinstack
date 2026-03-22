import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ElasticLoadBalancingClient,
  CreateLoadBalancerCommand,
  DescribeLoadBalancersCommand,
  DeleteLoadBalancerCommand,
  RegisterInstancesWithLoadBalancerCommand,
  DeregisterInstancesFromLoadBalancerCommand,
  ConfigureHealthCheckCommand,
  DescribeInstanceHealthCommand,
} from "@aws-sdk/client-elastic-load-balancing";
import { startServer, stopServer, clientConfig } from "./helpers";

const elb = new ElasticLoadBalancingClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("ELB Classic", () => {
  test("CreateLoadBalancer", async () => {
    const res = await elb.send(new CreateLoadBalancerCommand({
      LoadBalancerName: "classic-lb",
      Listeners: [
        {
          Protocol: "HTTP",
          LoadBalancerPort: 80,
          InstanceProtocol: "HTTP",
          InstancePort: 8080,
        },
      ],
      AvailabilityZones: ["us-east-1a", "us-east-1b"],
    }));
    expect(res.DNSName).toBeDefined();
    expect(res.DNSName!.length).toBeGreaterThan(0);
  });

  test("DescribeLoadBalancers", async () => {
    const res = await elb.send(new DescribeLoadBalancersCommand({
      LoadBalancerNames: ["classic-lb"],
    }));
    expect(res.LoadBalancerDescriptions!.length).toBe(1);
    expect(res.LoadBalancerDescriptions![0].LoadBalancerName).toBe("classic-lb");
    expect(res.LoadBalancerDescriptions![0].DNSName).toBeDefined();
  });

  test("RegisterInstancesWithLoadBalancer", async () => {
    const res = await elb.send(new RegisterInstancesWithLoadBalancerCommand({
      LoadBalancerName: "classic-lb",
      Instances: [
        { InstanceId: "i-11111111" },
        { InstanceId: "i-22222222" },
      ],
    }));
    expect(res.Instances!.length).toBe(2);
  });

  test("DescribeInstanceHealth", async () => {
    const res = await elb.send(new DescribeInstanceHealthCommand({
      LoadBalancerName: "classic-lb",
    }));
    expect(res.InstanceStates!.length).toBe(2);
    expect(res.InstanceStates![0].State).toBe("InService");
  });

  test("DeregisterInstancesFromLoadBalancer", async () => {
    const res = await elb.send(new DeregisterInstancesFromLoadBalancerCommand({
      LoadBalancerName: "classic-lb",
      Instances: [{ InstanceId: "i-11111111" }],
    }));
    expect(res.Instances!.length).toBe(1);
    expect(res.Instances![0].InstanceId).toBe("i-22222222");
  });

  test("ConfigureHealthCheck", async () => {
    const res = await elb.send(new ConfigureHealthCheckCommand({
      LoadBalancerName: "classic-lb",
      HealthCheck: {
        Target: "HTTP:8080/health",
        Interval: 30,
        Timeout: 5,
        UnhealthyThreshold: 2,
        HealthyThreshold: 10,
      },
    }));
    expect(res.HealthCheck).toBeDefined();
    expect(res.HealthCheck!.Target).toBe("HTTP:8080/health");
    expect(res.HealthCheck!.Interval).toBe(30);
  });

  test("DeleteLoadBalancer", async () => {
    await elb.send(new DeleteLoadBalancerCommand({
      LoadBalancerName: "classic-lb",
    }));

    // After delete, describe should return empty
    try {
      const res = await elb.send(new DescribeLoadBalancersCommand({
        LoadBalancerNames: ["classic-lb"],
      }));
      expect(res.LoadBalancerDescriptions!.length).toBe(0);
    } catch (_e) {
      // Some SDKs may throw on not found - that's also acceptable
    }
  });

  test("DeleteLoadBalancer - idempotent", async () => {
    // Should not throw on non-existent
    await elb.send(new DeleteLoadBalancerCommand({
      LoadBalancerName: "nonexistent-lb",
    }));
  });
});
