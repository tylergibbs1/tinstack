import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  KafkaClient,
  CreateClusterCommand,
  DescribeClusterCommand,
  ListClustersCommand,
  DeleteClusterCommand,
  UpdateBrokerCountCommand,
  ListNodesCommand,
  GetBootstrapBrokersCommand,
  CreateConfigurationCommand,
  DescribeConfigurationCommand,
  ListConfigurationsCommand,
  TagResourceCommand,
  UntagResourceCommand,
  ListTagsForResourceCommand,
} from "@aws-sdk/client-kafka";
import { startServer, stopServer, clientConfig } from "./helpers";

const kafka = new KafkaClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("MSK (Kafka)", () => {
  let clusterArn: string;

  test("CreateCluster", async () => {
    const res = await kafka.send(
      new CreateClusterCommand({
        ClusterName: "test-cluster",
        KafkaVersion: "3.5.1",
        NumberOfBrokerNodes: 3,
        BrokerNodeGroupInfo: {
          InstanceType: "kafka.m5.large",
          ClientSubnets: ["subnet-1", "subnet-2", "subnet-3"],
        },
      }),
    );
    expect(res.ClusterArn).toBeDefined();
    expect(res.ClusterName).toBe("test-cluster");
    expect(res.State).toBe("ACTIVE");
    clusterArn = res.ClusterArn!;
  });

  test("DescribeCluster", async () => {
    const res = await kafka.send(
      new DescribeClusterCommand({ ClusterArn: clusterArn }),
    );
    expect(res.ClusterInfo?.ClusterName).toBe("test-cluster");
    expect(res.ClusterInfo?.NumberOfBrokerNodes).toBe(3);
    expect(res.ClusterInfo?.State).toBe("ACTIVE");
  });

  test("ListClusters", async () => {
    const res = await kafka.send(new ListClustersCommand({}));
    expect(res.ClusterInfoList!.length).toBeGreaterThanOrEqual(1);
  });

  test("UpdateBrokerCount", async () => {
    const res = await kafka.send(
      new UpdateBrokerCountCommand({
        ClusterArn: clusterArn,
        CurrentVersion: "K1",
        TargetNumberOfBrokerNodes: 6,
      }),
    );
    expect(res.ClusterArn).toBe(clusterArn);
    expect(res.ClusterOperationArn).toBeDefined();
  });

  test("ListNodes", async () => {
    const res = await kafka.send(
      new ListNodesCommand({ ClusterArn: clusterArn }),
    );
    expect(res.NodeInfoList!.length).toBe(6);
  });

  test("GetBootstrapBrokers", async () => {
    const res = await kafka.send(
      new GetBootstrapBrokersCommand({ ClusterArn: clusterArn }),
    );
    expect(res.BootstrapBrokerString).toContain("9092");
    expect(res.BootstrapBrokerStringTls).toContain("9094");
  });

  // --- Configurations ---

  let configArn: string;

  test("CreateConfiguration", async () => {
    const res = await kafka.send(
      new CreateConfigurationCommand({
        Name: "test-config",
        KafkaVersions: ["3.5.1"],
        ServerProperties: Buffer.from("auto.create.topics.enable=true"),
      }),
    );
    expect(res.Arn).toBeDefined();
    expect(res.Name).toBe("test-config");
    configArn = res.Arn!;
  });

  test("DescribeConfiguration", async () => {
    const res = await kafka.send(
      new DescribeConfigurationCommand({ Arn: configArn }),
    );
    expect(res.Name).toBe("test-config");
    expect(res.State).toBe("ACTIVE");
  });

  test("ListConfigurations", async () => {
    const res = await kafka.send(new ListConfigurationsCommand({}));
    expect(res.Configurations!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Tags ---

  test("TagResource", async () => {
    await kafka.send(
      new TagResourceCommand({
        ResourceArn: clusterArn,
        Tags: { env: "test" },
      }),
    );
  });

  test("ListTagsForResource", async () => {
    const res = await kafka.send(
      new ListTagsForResourceCommand({ ResourceArn: clusterArn }),
    );
    expect(res.Tags?.env).toBe("test");
  });

  test("UntagResource", async () => {
    await kafka.send(
      new UntagResourceCommand({
        ResourceArn: clusterArn,
        TagKeys: ["env"],
      }),
    );
    const res = await kafka.send(
      new ListTagsForResourceCommand({ ResourceArn: clusterArn }),
    );
    expect(res.Tags?.env).toBeUndefined();
  });

  // --- Cleanup ---

  test("DeleteCluster", async () => {
    const res = await kafka.send(
      new DeleteClusterCommand({ ClusterArn: clusterArn }),
    );
    expect(res.ClusterArn).toBe(clusterArn);
    expect(res.State).toBe("DELETING");
  });
});
