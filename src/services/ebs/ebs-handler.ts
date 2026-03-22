import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { EbsService } from "./ebs-service";

export class EbsHandler {
  constructor(private service: EbsService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // POST /snapshots/completion/{snapshotId} — CompleteSnapshot
      const completeMatch = path.match(/^\/snapshots\/completion\/([^/]+)$/);
      if (completeMatch && method === "POST") {
        const changedBlocksCount = parseInt(req.headers.get("x-amz-changedblockscount") ?? "0", 10);
        const snap = this.service.completeSnapshot(completeMatch[1], changedBlocksCount);
        return this.json({ Status: snap.status }, ctx, 202);
      }

      // POST /snapshots — StartSnapshot
      if (path === "/snapshots" && method === "POST") {
        const body = await req.json();
        const snap = this.service.startSnapshot(body.VolumeSize, body.Description, body.Tags, body.ParentSnapshotId);
        return this.json(snapshotToJson(snap), ctx, 201);
      }

      // PUT /snapshots/{snapshotId}/blocks/{blockIndex} — PutSnapshotBlock
      const putBlockMatch = path.match(/^\/snapshots\/([^/]+)\/blocks\/(\d+)$/);
      if (putBlockMatch && method === "PUT") {
        const snapshotId = putBlockMatch[1];
        const blockIndex = parseInt(putBlockMatch[2], 10);
        const checksum = req.headers.get("x-amz-Checksum") ?? "";
        const checksumAlgorithm = req.headers.get("x-amz-Checksum-Algorithm") ?? "SHA256";
        const dataLength = parseInt(req.headers.get("x-amz-Data-Length") ?? "0", 10);
        const blockData = await req.text();
        const result = this.service.putSnapshotBlock(snapshotId, blockIndex, blockData, checksum, checksumAlgorithm, dataLength);
        return new Response(JSON.stringify({}), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
            "x-amzn-RequestId": ctx.requestId,
            "x-amz-Checksum": result.checksum,
            "x-amz-Checksum-Algorithm": result.checksumAlgorithm,
          },
        });
      }

      // GET /snapshots/{snapshotId}/blocks/{blockIndex} — GetSnapshotBlock
      const getBlockMatch = path.match(/^\/snapshots\/([^/]+)\/blocks\/(\d+)$/);
      if (getBlockMatch && method === "GET") {
        const block = this.service.getSnapshotBlock(getBlockMatch[1], parseInt(getBlockMatch[2], 10));
        return new Response(block.blockData, {
          headers: {
            "Content-Type": "application/octet-stream",
            "x-amzn-RequestId": ctx.requestId,
            "x-amz-Checksum": block.checksum,
            "x-amz-Checksum-Algorithm": block.checksumAlgorithm,
            "x-amz-Data-Length": String(block.dataLength),
          },
        });
      }

      // GET /snapshots/{snapshotId}/blocks — ListSnapshotBlocks
      const listBlocksMatch = path.match(/^\/snapshots\/([^/]+)\/blocks$/);
      if (listBlocksMatch && method === "GET") {
        const startingBlockIndex = url.searchParams.get("startingBlockIndex");
        const result = this.service.listSnapshotBlocks(
          listBlocksMatch[1],
          startingBlockIndex ? parseInt(startingBlockIndex, 10) : undefined,
        );
        return this.json({
          Blocks: result.blocks,
          VolumeSize: result.volumeSize,
          BlockSize: result.blockSize,
        }, ctx);
      }

      // GET /snapshots/{snapshotId}/changedblocks — ListChangedBlocks
      const changedBlocksMatch = path.match(/^\/snapshots\/([^/]+)\/changedblocks$/);
      if (changedBlocksMatch && method === "GET") {
        const firstSnapshotId = url.searchParams.get("firstSnapshotId") ?? undefined;
        const result = this.service.listChangedBlocks(changedBlocksMatch[1], firstSnapshotId);
        return this.json({
          ChangedBlocks: result.changedBlocks,
          VolumeSize: result.volumeSize,
          BlockSize: result.blockSize,
        }, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown EBS operation: ${method} ${path}`, 404),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}

function snapshotToJson(snap: any): any {
  return {
    SnapshotId: snap.snapshotId,
    OwnerId: snap.ownerId,
    Status: snap.status,
    StartTime: snap.startTime,
    VolumeSize: snap.volumeSize,
    BlockSize: snap.blockSize,
    Description: snap.description,
    Tags: snap.tags,
  };
}
