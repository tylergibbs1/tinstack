import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  LakeFormationClient,
  RegisterResourceCommand,
  DeregisterResourceCommand,
  ListResourcesCommand,
  GrantPermissionsCommand,
  RevokePermissionsCommand,
  ListPermissionsCommand,
  GetDataLakeSettingsCommand,
  PutDataLakeSettingsCommand,
  CreateLFTagCommand,
  GetLFTagCommand,
  ListLFTagsCommand,
  DeleteLFTagCommand,
  AddLFTagsToResourceCommand,
  GetResourceLFTagsCommand,
  RemoveLFTagsFromResourceCommand,
} from "@aws-sdk/client-lakeformation";
import { startServer, stopServer, clientConfig } from "./helpers";

const lf = new LakeFormationClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Lake Formation", () => {
  const resourceArn = "arn:aws:s3:::my-data-lake-bucket";

  test("RegisterResource + ListResources", async () => {
    await lf.send(new RegisterResourceCommand({
      ResourceArn: resourceArn,
      RoleArn: "arn:aws:iam::000000000000:role/LakeFormationRole",
    }));

    const res = await lf.send(new ListResourcesCommand({}));
    expect(res.ResourceInfoList).toBeDefined();
    expect(res.ResourceInfoList!.length).toBeGreaterThanOrEqual(1);
    expect(res.ResourceInfoList!.some((r) => r.ResourceArn === resourceArn)).toBe(true);
  });

  test("RegisterResource duplicate throws", async () => {
    await expect(
      lf.send(new RegisterResourceCommand({
        ResourceArn: resourceArn,
        RoleArn: "arn:aws:iam::000000000000:role/Other",
      })),
    ).rejects.toThrow();
  });

  test("DeregisterResource", async () => {
    await lf.send(new DeregisterResourceCommand({
      ResourceArn: resourceArn,
    }));

    const res = await lf.send(new ListResourcesCommand({}));
    expect(res.ResourceInfoList!.some((r) => r.ResourceArn === resourceArn)).toBe(false);
  });

  test("GrantPermissions + ListPermissions", async () => {
    await lf.send(new GrantPermissionsCommand({
      Principal: { DataLakePrincipalIdentifier: "arn:aws:iam::000000000000:role/AnalystRole" },
      Resource: { Database: { Name: "test_db" } },
      Permissions: ["ALL"],
    }));

    const res = await lf.send(new ListPermissionsCommand({}));
    expect(res.PrincipalResourcePermissions).toBeDefined();
    expect(res.PrincipalResourcePermissions!.length).toBeGreaterThanOrEqual(1);
  });

  test("RevokePermissions", async () => {
    await lf.send(new RevokePermissionsCommand({
      Principal: { DataLakePrincipalIdentifier: "arn:aws:iam::000000000000:role/AnalystRole" },
      Resource: { Database: { Name: "test_db" } },
      Permissions: ["ALL"],
    }));

    const res = await lf.send(new ListPermissionsCommand({
      Principal: { DataLakePrincipalIdentifier: "arn:aws:iam::000000000000:role/AnalystRole" },
    }));
    expect(res.PrincipalResourcePermissions!.length).toBe(0);
  });

  test("GetDataLakeSettings + PutDataLakeSettings", async () => {
    const getRes = await lf.send(new GetDataLakeSettingsCommand({}));
    expect(getRes.DataLakeSettings).toBeDefined();
    expect(getRes.DataLakeSettings!.DataLakeAdmins).toBeDefined();

    await lf.send(new PutDataLakeSettingsCommand({
      DataLakeSettings: {
        DataLakeAdmins: [
          { DataLakePrincipalIdentifier: "arn:aws:iam::000000000000:role/AdminRole" },
        ],
      },
    }));

    const getRes2 = await lf.send(new GetDataLakeSettingsCommand({}));
    expect(getRes2.DataLakeSettings!.DataLakeAdmins!.length).toBe(1);
  });

  test("CreateLFTag + GetLFTag + ListLFTags", async () => {
    await lf.send(new CreateLFTagCommand({
      TagKey: "department",
      TagValues: ["engineering", "marketing", "sales"],
    }));

    const getRes = await lf.send(new GetLFTagCommand({
      TagKey: "department",
    }));
    expect(getRes.TagKey).toBe("department");
    expect(getRes.TagValues).toEqual(["engineering", "marketing", "sales"]);

    const listRes = await lf.send(new ListLFTagsCommand({}));
    expect(listRes.LFTags!.length).toBeGreaterThanOrEqual(1);
    expect(listRes.LFTags!.some((t) => t.TagKey === "department")).toBe(true);
  });

  test("AddLFTagsToResource + GetResourceLFTags", async () => {
    await lf.send(new AddLFTagsToResourceCommand({
      Resource: { Database: { Name: "analytics_db" } },
      LFTags: [{ TagKey: "department", TagValues: ["engineering"] }],
    }));

    const res = await lf.send(new GetResourceLFTagsCommand({
      Resource: { Database: { Name: "analytics_db" } },
    }));
    expect(res.LFTagOnDatabase).toBeDefined();
    expect(res.LFTagOnDatabase!.length).toBe(1);
    expect(res.LFTagOnDatabase![0].TagKey).toBe("department");
  });

  test("RemoveLFTagsFromResource", async () => {
    await lf.send(new RemoveLFTagsFromResourceCommand({
      Resource: { Database: { Name: "analytics_db" } },
      LFTags: [{ TagKey: "department", TagValues: ["engineering"] }],
    }));

    const res = await lf.send(new GetResourceLFTagsCommand({
      Resource: { Database: { Name: "analytics_db" } },
    }));
    expect(res.LFTagOnDatabase!.length).toBe(0);
  });

  test("DeleteLFTag", async () => {
    await lf.send(new DeleteLFTagCommand({
      TagKey: "department",
    }));

    const res = await lf.send(new ListLFTagsCommand({}));
    expect(res.LFTags!.some((t) => t.TagKey === "department")).toBe(false);
  });
});
