import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  MediaConvertClient,
  CreateJobCommand,
  GetJobCommand,
  ListJobsCommand,
  CancelJobCommand,
  CreateQueueCommand,
  GetQueueCommand,
  ListQueuesCommand,
  DeleteQueueCommand,
  CreatePresetCommand,
  GetPresetCommand,
  ListPresetsCommand,
  DeletePresetCommand,
  CreateJobTemplateCommand,
  GetJobTemplateCommand,
  ListJobTemplatesCommand,
  DeleteJobTemplateCommand,
  DescribeEndpointsCommand,
} from "@aws-sdk/client-mediaconvert";
import { startServer, stopServer, clientConfig } from "./helpers";

const mc = new MediaConvertClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("MediaConvert", () => {
  let jobId: string;

  // --- Endpoints ---
  test("DescribeEndpoints", async () => {
    const res = await mc.send(new DescribeEndpointsCommand({}));
    expect(res.Endpoints).toBeDefined();
    expect(res.Endpoints!.length).toBeGreaterThanOrEqual(1);
    expect(res.Endpoints![0].Url).toBeDefined();
  });

  // --- Queues ---
  test("CreateQueue", async () => {
    const res = await mc.send(
      new CreateQueueCommand({
        Name: "test-queue",
        Description: "A test queue",
      }),
    );
    expect(res.Queue).toBeDefined();
    expect(res.Queue!.Name).toBe("test-queue");
    expect(res.Queue!.Status).toBe("ACTIVE");
    expect(res.Queue!.Arn).toContain("mediaconvert");
  });

  test("GetQueue", async () => {
    const res = await mc.send(
      new GetQueueCommand({ Name: "test-queue" }),
    );
    expect(res.Queue!.Name).toBe("test-queue");
    expect(res.Queue!.Description).toBe("A test queue");
  });

  test("ListQueues", async () => {
    const res = await mc.send(new ListQueuesCommand({}));
    expect(res.Queues).toBeDefined();
    // Should have at least Default + test-queue
    expect(res.Queues!.length).toBeGreaterThanOrEqual(2);
  });

  // --- Presets ---
  test("CreatePreset", async () => {
    const res = await mc.send(
      new CreatePresetCommand({
        Name: "test-preset",
        Description: "A test preset",
        Settings: {
          ContainerSettings: {
            Container: "MP4",
          },
        },
      }),
    );
    expect(res.Preset).toBeDefined();
    expect(res.Preset!.Name).toBe("test-preset");
    expect(res.Preset!.Arn).toContain("presets/test-preset");
  });

  test("GetPreset", async () => {
    const res = await mc.send(
      new GetPresetCommand({ Name: "test-preset" }),
    );
    expect(res.Preset!.Name).toBe("test-preset");
    expect(res.Preset!.Description).toBe("A test preset");
  });

  test("ListPresets", async () => {
    const res = await mc.send(new ListPresetsCommand({}));
    expect(res.Presets).toBeDefined();
    expect(res.Presets!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Job Templates ---
  test("CreateJobTemplate", async () => {
    const res = await mc.send(
      new CreateJobTemplateCommand({
        Name: "test-template",
        Description: "A test job template",
        Settings: {
          Inputs: [{ FileInput: "s3://bucket/input.mp4" }],
        },
      }),
    );
    expect(res.JobTemplate).toBeDefined();
    expect(res.JobTemplate!.Name).toBe("test-template");
    expect(res.JobTemplate!.Arn).toContain("jobTemplates/test-template");
  });

  test("GetJobTemplate", async () => {
    const res = await mc.send(
      new GetJobTemplateCommand({ Name: "test-template" }),
    );
    expect(res.JobTemplate!.Name).toBe("test-template");
    expect(res.JobTemplate!.Description).toBe("A test job template");
  });

  test("ListJobTemplates", async () => {
    const res = await mc.send(new ListJobTemplatesCommand({}));
    expect(res.JobTemplates).toBeDefined();
    expect(res.JobTemplates!.length).toBeGreaterThanOrEqual(1);
  });

  // --- Jobs ---
  test("CreateJob", async () => {
    const res = await mc.send(
      new CreateJobCommand({
        Role: "arn:aws:iam::123456789012:role/MediaConvertRole",
        Settings: {
          Inputs: [
            {
              FileInput: "s3://input-bucket/video.mp4",
            },
          ],
          OutputGroups: [
            {
              Name: "File Group",
              OutputGroupSettings: {
                Type: "FILE_GROUP_SETTINGS",
                FileGroupSettings: {
                  Destination: "s3://output-bucket/",
                },
              },
              Outputs: [
                {
                  ContainerSettings: {
                    Container: "MP4",
                  },
                },
              ],
            },
          ],
        },
      }),
    );
    expect(res.Job).toBeDefined();
    expect(res.Job!.Id).toBeDefined();
    expect(res.Job!.Status).toBe("COMPLETE");
    expect(res.Job!.Arn).toContain("jobs/");
    jobId = res.Job!.Id!;
  });

  test("GetJob", async () => {
    const res = await mc.send(
      new GetJobCommand({ Id: jobId }),
    );
    expect(res.Job).toBeDefined();
    expect(res.Job!.Id).toBe(jobId);
    expect(res.Job!.Status).toBe("COMPLETE");
  });

  test("ListJobs", async () => {
    const res = await mc.send(new ListJobsCommand({}));
    expect(res.Jobs).toBeDefined();
    expect(res.Jobs!.length).toBeGreaterThanOrEqual(1);
    expect(res.Jobs!.some((j) => j.Id === jobId)).toBe(true);
  });

  test("CancelJob — already complete fails", async () => {
    try {
      await mc.send(new CancelJobCommand({ Id: jobId }));
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.message).toContain("already complete");
    }
  });

  // --- Cleanup ---
  test("DeleteQueue", async () => {
    await mc.send(new DeleteQueueCommand({ Name: "test-queue" }));

    const res = await mc.send(new ListQueuesCommand({}));
    expect(res.Queues!.some((q) => q.Name === "test-queue")).toBe(false);
  });

  test("DeletePreset", async () => {
    await mc.send(new DeletePresetCommand({ Name: "test-preset" }));

    const res = await mc.send(new ListPresetsCommand({}));
    expect(res.Presets!.some((p) => p.Name === "test-preset")).toBe(false);
  });

  test("DeleteJobTemplate", async () => {
    await mc.send(new DeleteJobTemplateCommand({ Name: "test-template" }));

    const res = await mc.send(new ListJobTemplatesCommand({}));
    expect(res.JobTemplates!.some((t) => t.Name === "test-template")).toBe(false);
  });
});
