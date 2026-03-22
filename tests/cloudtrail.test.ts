import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  CloudTrailClient,
  CreateTrailCommand,
  GetTrailCommand,
  DescribeTrailsCommand,
  UpdateTrailCommand,
  DeleteTrailCommand,
  StartLoggingCommand,
  StopLoggingCommand,
  GetTrailStatusCommand,
  PutEventSelectorsCommand,
  GetEventSelectorsCommand,
  LookupEventsCommand,
  ListTrailsCommand,
  AddTagsCommand,
  RemoveTagsCommand,
  ListTagsCommand,
} from "@aws-sdk/client-cloudtrail";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new CloudTrailClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("CloudTrail", () => {
  let trailArn: string;
  const trailName = "test-trail";

  test("CreateTrail", async () => {
    const res = await client.send(new CreateTrailCommand({
      Name: trailName,
      S3BucketName: "my-trail-bucket",
      IsMultiRegionTrail: false,
      EnableLogFileValidation: true,
    }));
    expect(res.Name).toBe(trailName);
    expect(res.S3BucketName).toBe("my-trail-bucket");
    expect(res.LogFileValidationEnabled).toBe(true);
    trailArn = res.TrailARN!;
    expect(trailArn).toContain("cloudtrail");
  });

  test("GetTrail", async () => {
    const res = await client.send(new GetTrailCommand({ Name: trailName }));
    expect(res.Trail!.Name).toBe(trailName);
    expect(res.Trail!.S3BucketName).toBe("my-trail-bucket");
  });

  test("DescribeTrails", async () => {
    const res = await client.send(new DescribeTrailsCommand({}));
    expect(res.trailList!.some((t) => t.Name === trailName)).toBe(true);
  });

  test("UpdateTrail", async () => {
    const res = await client.send(new UpdateTrailCommand({
      Name: trailName,
      S3BucketName: "updated-bucket",
      IsMultiRegionTrail: true,
    }));
    expect(res.S3BucketName).toBe("updated-bucket");
    expect(res.IsMultiRegionTrail).toBe(true);
  });

  test("StartLogging and GetTrailStatus", async () => {
    await client.send(new StartLoggingCommand({ Name: trailName }));
    const res = await client.send(new GetTrailStatusCommand({ Name: trailName }));
    expect(res.IsLogging).toBe(true);
    expect(res.StartLoggingTime).toBeDefined();
  });

  test("StopLogging", async () => {
    await client.send(new StopLoggingCommand({ Name: trailName }));
    const res = await client.send(new GetTrailStatusCommand({ Name: trailName }));
    expect(res.IsLogging).toBe(false);
    expect(res.StopLoggingTime).toBeDefined();
  });

  test("PutEventSelectors and GetEventSelectors", async () => {
    await client.send(new PutEventSelectorsCommand({
      TrailName: trailName,
      EventSelectors: [{
        ReadWriteType: "All",
        IncludeManagementEvents: true,
        DataResources: [],
      }],
    }));
    const res = await client.send(new GetEventSelectorsCommand({ TrailName: trailName }));
    expect(res.EventSelectors!.length).toBe(1);
    expect(res.EventSelectors![0].ReadWriteType).toBe("All");
  });

  test("LookupEvents", async () => {
    const res = await client.send(new LookupEventsCommand({}));
    expect(res.Events).toBeDefined();
    expect(Array.isArray(res.Events)).toBe(true);
  });

  test("ListTrails", async () => {
    const res = await client.send(new ListTrailsCommand({}));
    expect(res.Trails!.some((t) => t.Name === trailName)).toBe(true);
  });

  test("AddTags and ListTags", async () => {
    await client.send(new AddTagsCommand({
      ResourceId: trailArn,
      TagsList: [{ Key: "env", Value: "test" }],
    }));
    const res = await client.send(new ListTagsCommand({ ResourceIdList: [trailArn] }));
    expect(res.ResourceTagList!.length).toBe(1);
    expect(res.ResourceTagList![0].TagsList!.some((t) => t.Key === "env" && t.Value === "test")).toBe(true);
  });

  test("RemoveTags", async () => {
    await client.send(new RemoveTagsCommand({
      ResourceId: trailArn,
      TagsList: [{ Key: "env" }],
    }));
    const res = await client.send(new ListTagsCommand({ ResourceIdList: [trailArn] }));
    expect(res.ResourceTagList![0].TagsList!.length).toBe(0);
  });

  test("DeleteTrail", async () => {
    await client.send(new DeleteTrailCommand({ Name: trailName }));
    const res = await client.send(new ListTrailsCommand({}));
    expect(res.Trails!.some((t) => t.Name === trailName)).toBe(false);
  });
});
