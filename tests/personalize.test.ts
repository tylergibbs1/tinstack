import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  PersonalizeClient,
  CreateDatasetGroupCommand,
  DescribeDatasetGroupCommand,
  ListDatasetGroupsCommand,
  DeleteDatasetGroupCommand,
  CreateSolutionCommand,
  ListSolutionsCommand,
} from "@aws-sdk/client-personalize";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new PersonalizeClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Personalize", () => {
  let datasetGroupArn: string;

  test("CreateDatasetGroup", async () => {
    const res = await client.send(new CreateDatasetGroupCommand({ name: "test-dsg" }));
    datasetGroupArn = res.datasetGroupArn!;
    expect(datasetGroupArn).toContain("test-dsg");
  });

  test("DescribeDatasetGroup", async () => {
    const res = await client.send(new DescribeDatasetGroupCommand({ datasetGroupArn }));
    expect(res.datasetGroup!.name).toBe("test-dsg");
    expect(res.datasetGroup!.status).toBe("ACTIVE");
  });

  test("ListDatasetGroups", async () => {
    const res = await client.send(new ListDatasetGroupsCommand({}));
    expect(res.datasetGroups!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateSolution", async () => {
    const res = await client.send(new CreateSolutionCommand({ name: "test-solution", datasetGroupArn }));
    expect(res.solutionArn).toContain("test-solution");
  });

  test("DeleteDatasetGroup", async () => {
    await client.send(new DeleteDatasetGroupCommand({ datasetGroupArn }));
    await expect(client.send(new DescribeDatasetGroupCommand({ datasetGroupArn }))).rejects.toThrow();
  });
});
