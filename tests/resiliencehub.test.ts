import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ResiliencehubClient,
  CreateAppCommand,
  DescribeAppCommand,
  ListAppsCommand,
  DeleteAppCommand,
  CreateResiliencyPolicyCommand,
  ListResiliencyPoliciesCommand,
} from "@aws-sdk/client-resiliencehub";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new ResiliencehubClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("ResilienceHub", () => {
  let appArn: string;

  test("CreateApp", async () => {
    const res = await client.send(new CreateAppCommand({ name: "test-app", description: "test" }));
    expect(res.app).toBeDefined();
    expect(res.app!.name).toBe("test-app");
    appArn = res.app!.appArn!;
  });

  test("DescribeApp", async () => {
    const res = await client.send(new DescribeAppCommand({ appArn }));
    expect(res.app).toBeDefined();
    expect(res.app!.name).toBe("test-app");
  });

  test("ListApps", async () => {
    const res = await client.send(new ListAppsCommand({}));
    expect(res.appSummaries).toBeDefined();
    expect(res.appSummaries!.length).toBeGreaterThanOrEqual(1);
  });

  test("CreateResiliencyPolicy", async () => {
    const res = await client.send(new CreateResiliencyPolicyCommand({
      policyName: "test-policy",
      tier: "NonCritical",
      policy: {
        Software: { rtoInSecs: 3600, rpoInSecs: 3600 },
        Hardware: { rtoInSecs: 3600, rpoInSecs: 3600 },
        AZ: { rtoInSecs: 3600, rpoInSecs: 3600 },
      },
    }));
    expect(res.policy).toBeDefined();
    expect(res.policy!.policyName).toBe("test-policy");
  });

  test("DeleteApp", async () => {
    await client.send(new DeleteAppCommand({ appArn }));
    const res = await client.send(new ListAppsCommand({}));
    expect(res.appSummaries!.some((a: any) => a.appArn === appArn)).toBe(false);
  });
});
