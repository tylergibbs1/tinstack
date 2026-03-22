import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { KafkaService } from "./kafka-service";

export class KafkaHandler {
  constructor(private service: KafkaService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- Bootstrap Brokers ---
      const bootstrapMatch = path.match(/^\/v1\/clusters\/([^/]+)\/bootstrap-brokers$/);
      if (bootstrapMatch && method === "GET") {
        const clusterArn = decodeURIComponent(bootstrapMatch[1]);
        const result = this.service.getBootstrapBrokers(clusterArn);
        return this.json({
          bootstrapBrokerString: result.bootstrapBrokerString,
          bootstrapBrokerStringTls: result.bootstrapBrokerStringTls,
        }, ctx);
      }

      // --- Nodes ---
      const nodesMatch = path.match(/^\/v1\/clusters\/([^/]+)\/nodes$/);
      if (nodesMatch && method === "GET") {
        const clusterArn = decodeURIComponent(nodesMatch[1]);
        const nodes = this.service.listNodes(clusterArn);
        return this.json({ nodeInfoList: nodes }, ctx);
      }

      // --- Single Cluster ---
      const clusterMatch = path.match(/^\/v1\/clusters\/([^/]+)$/);
      if (clusterMatch) {
        const clusterArn = decodeURIComponent(clusterMatch[1]);
        if (method === "GET") {
          const cluster = this.service.describeCluster(clusterArn);
          return this.json({
            clusterInfo: {
              clusterArn: cluster.clusterArn,
              clusterName: cluster.clusterName,
              state: cluster.state,
              currentVersion: cluster.currentVersion,
              clusterType: cluster.clusterType,
              brokerNodeGroupInfo: cluster.brokerNodeGroupInfo,
              currentBrokerSoftwareInfo: { kafkaVersion: cluster.kafkaVersion },
              numberOfBrokerNodes: cluster.numberOfBrokerNodes,
              enhancedMonitoring: cluster.enhancedMonitoring,
              encryptionInfo: cluster.encryptionInfo ?? {},
              tags: cluster.tags,
              creationTime: cluster.creationTime,
            },
          }, ctx);
        }
        if (method === "DELETE") {
          const cluster = this.service.deleteCluster(clusterArn);
          return this.json({
            clusterArn: cluster.clusterArn,
            state: cluster.state,
          }, ctx);
        }
      }

      // --- List/Create Clusters ---
      if ((path === "/v1/clusters" || path === "/v1/clusters/") && method === "GET") {
        const clusters = this.service.listClusters();
        return this.json({
          clusterInfoList: clusters.map((c) => ({
            clusterArn: c.clusterArn,
            clusterName: c.clusterName,
            state: c.state,
            clusterType: c.clusterType,
            creationTime: c.creationTime,
          })),
        }, ctx);
      }

      if ((path === "/v1/clusters" || path === "/v1/clusters/") && method === "POST") {
        const body = await req.json();
        const cluster = this.service.createCluster({
          clusterName: body.clusterName,
          kafkaVersion: body.kafkaVersion,
          numberOfBrokerNodes: body.numberOfBrokerNodes,
          brokerNodeGroupInfo: body.brokerNodeGroupInfo,
          encryptionInfo: body.encryptionInfo,
          enhancedMonitoring: body.enhancedMonitoring,
          tags: body.tags,
        });
        return this.json({
          clusterArn: cluster.clusterArn,
          clusterName: cluster.clusterName,
          state: cluster.state,
        }, ctx);
      }

      // --- Update Broker Count ---
      const brokerCountMatch = path.match(/^\/v1\/clusters\/([^/]+)\/nodes\/count$/);
      if (brokerCountMatch && method === "PUT") {
        const clusterArn = decodeURIComponent(brokerCountMatch[1]);
        const body = await req.json();
        const cluster = this.service.updateBrokerCount(clusterArn, body.targetNumberOfBrokerNodes);
        return this.json({
          clusterArn: cluster.clusterArn,
          clusterOperationArn: `arn:aws:kafka:${ctx.region}:${ctx.accountId}:cluster-operation/update/${crypto.randomUUID()}`,
        }, ctx);
      }

      // --- Update Broker Storage ---
      const brokerStorageMatch = path.match(/^\/v1\/clusters\/([^/]+)\/nodes\/storage$/);
      if (brokerStorageMatch && method === "PUT") {
        const clusterArn = decodeURIComponent(brokerStorageMatch[1]);
        const body = await req.json();
        const cluster = this.service.updateBrokerStorage(clusterArn, body.targetBrokerEBSVolumeInfo);
        return this.json({
          clusterArn: cluster.clusterArn,
          clusterOperationArn: `arn:aws:kafka:${ctx.region}:${ctx.accountId}:cluster-operation/update/${crypto.randomUUID()}`,
        }, ctx);
      }

      // --- Configurations ---
      const configMatch = path.match(/^\/v1\/configurations\/([^/]+)$/);
      if (configMatch && method === "GET") {
        const arn = decodeURIComponent(configMatch[1]);
        const config = this.service.describeConfiguration(arn);
        return this.json({
          arn: config.arn,
          name: config.name,
          latestRevision: {
            revision: config.revision,
            description: config.description,
            creationTime: config.creationTime,
          },
          kafkaVersions: config.kafkaVersions,
          state: config.state,
          creationTime: config.creationTime,
        }, ctx);
      }

      if ((path === "/v1/configurations" || path === "/v1/configurations/") && method === "GET") {
        const configs = this.service.listConfigurations();
        return this.json({
          configurations: configs.map((c) => ({
            arn: c.arn,
            name: c.name,
            latestRevision: { revision: c.revision, description: c.description },
            kafkaVersions: c.kafkaVersions,
            state: c.state,
            creationTime: c.creationTime,
          })),
        }, ctx);
      }

      if ((path === "/v1/configurations" || path === "/v1/configurations/") && method === "POST") {
        const body = await req.json();
        const config = this.service.createConfiguration({
          name: body.name,
          kafkaVersions: body.kafkaVersions,
          serverProperties: body.serverProperties ?? "",
          description: body.description,
        });
        return this.json({
          arn: config.arn,
          name: config.name,
          latestRevision: { revision: config.revision, description: config.description },
          state: config.state,
          creationTime: config.creationTime,
        }, ctx);
      }

      // --- Tags ---
      const tagsMatch = path.match(/^\/v1\/tags\/(.+)$/);
      if (tagsMatch) {
        const arn = decodeURIComponent(tagsMatch[1]);
        if (method === "POST") {
          const body = await req.json();
          this.service.tagResource(arn, body.tags ?? {});
          return this.json({}, ctx);
        }
        if (method === "GET") {
          const tags = this.service.listTagsForResource(arn);
          return this.json({ tags }, ctx);
        }
        if (method === "DELETE") {
          const tagKeys = url.searchParams.getAll("tagKeys");
          this.service.untagResource(arn, tagKeys);
          return this.json({}, ctx);
        }
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown Kafka operation: ${method} ${path}`, 400),
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
