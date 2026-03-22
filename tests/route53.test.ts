import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  Route53Client,
  CreateHostedZoneCommand,
  GetHostedZoneCommand,
  ListHostedZonesCommand,
  DeleteHostedZoneCommand,
  ChangeResourceRecordSetsCommand,
  ListResourceRecordSetsCommand,
  ChangeTagsForResourceCommand,
  ListTagsForResourceCommand,
  GetChangeCommand,
} from "@aws-sdk/client-route-53";
import { startServer, stopServer, clientConfig } from "./helpers";

const route53 = new Route53Client(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Route 53", () => {
  let hostedZoneId: string;

  test("CreateHostedZone", async () => {
    const res = await route53.send(
      new CreateHostedZoneCommand({
        Name: "example.com",
        CallerReference: `ref-${Date.now()}`,
      }),
    );
    expect(res.HostedZone).toBeDefined();
    expect(res.HostedZone!.Name).toBe("example.com.");
    expect(res.DelegationSet?.NameServers).toBeDefined();
    expect(res.DelegationSet!.NameServers!.length).toBeGreaterThan(0);
    hostedZoneId = res.HostedZone!.Id!;
  });

  test("GetHostedZone", async () => {
    const res = await route53.send(new GetHostedZoneCommand({ Id: hostedZoneId }));
    expect(res.HostedZone).toBeDefined();
    expect(res.HostedZone!.Name).toBe("example.com.");
  });

  test("ListHostedZones", async () => {
    const res = await route53.send(new ListHostedZonesCommand({}));
    expect(res.HostedZones!.length).toBeGreaterThan(0);
    expect(res.HostedZones!.some((z) => z.Id === hostedZoneId)).toBe(true);
  });

  test("ChangeResourceRecordSets — CREATE", async () => {
    const res = await route53.send(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "test.example.com",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "1.2.3.4" }],
              },
            },
          ],
        },
      }),
    );
    expect(res.ChangeInfo).toBeDefined();
    expect(res.ChangeInfo!.Status).toBe("INSYNC");
  });

  test("ListResourceRecordSets", async () => {
    const res = await route53.send(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
    );
    expect(res.ResourceRecordSets!.length).toBeGreaterThan(0);
    const record = res.ResourceRecordSets!.find((r) => r.Name === "test.example.com.");
    expect(record).toBeDefined();
    expect(record!.Type).toBe("A");
    expect(record!.TTL).toBe(300);
    expect(record!.ResourceRecords![0].Value).toBe("1.2.3.4");
  });

  test("ChangeResourceRecordSets — UPSERT", async () => {
    await route53.send(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                Name: "test.example.com",
                Type: "A",
                TTL: 600,
                ResourceRecords: [{ Value: "5.6.7.8" }],
              },
            },
          ],
        },
      }),
    );

    const res = await route53.send(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
    );
    const record = res.ResourceRecordSets!.find((r) => r.Name === "test.example.com.");
    expect(record!.TTL).toBe(600);
    expect(record!.ResourceRecords![0].Value).toBe("5.6.7.8");
  });

  test("ChangeTagsForResource and ListTagsForResource", async () => {
    const zoneId = hostedZoneId.replace("/hostedzone/", "");
    await route53.send(
      new ChangeTagsForResourceCommand({
        ResourceType: "hostedzone",
        ResourceId: zoneId,
        AddTags: [
          { Key: "env", Value: "test" },
          { Key: "project", Value: "tinstack" },
        ],
      }),
    );

    const res = await route53.send(
      new ListTagsForResourceCommand({
        ResourceType: "hostedzone",
        ResourceId: zoneId,
      }),
    );
    expect(res.ResourceTagSet?.Tags).toBeDefined();
    expect(res.ResourceTagSet!.Tags!.some((t) => t.Key === "env" && t.Value === "test")).toBe(true);
  });

  test("GetChange", async () => {
    const res = await route53.send(new GetChangeCommand({ Id: "C0000000001" }));
    expect(res.ChangeInfo!.Status).toBe("INSYNC");
  });

  test("DeleteHostedZone", async () => {
    const res = await route53.send(new DeleteHostedZoneCommand({ Id: hostedZoneId }));
    expect(res.ChangeInfo).toBeDefined();

    const list = await route53.send(new ListHostedZonesCommand({}));
    expect(list.HostedZones!.some((z) => z.Id === hostedZoneId)).toBe(false);
  });
});
