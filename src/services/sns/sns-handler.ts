import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import { xmlErrorResponse } from "../../core/errors";
import { XmlBuilder, xmlEnvelope, xmlEnvelopeNoResult, xmlResponse, AWS_NAMESPACES } from "../../core/xml";
import type { SnsService } from "./sns-service";

const NS = AWS_NAMESPACES.SNS;

export class SnsJsonHandler {
  constructor(private service: SnsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateTopic": {
          const tags: Record<string, string> = {};
          if (Array.isArray(body.Tags)) {
            for (const tag of body.Tags) tags[tag.Key] = tag.Value;
          } else if (body.Tags) {
            Object.assign(tags, body.Tags);
          }
          return this.json({ TopicArn: this.service.createTopic(body.Name, body.Attributes ?? {}, tags, ctx.region).topicArn }, ctx);
        }
        case "DeleteTopic": this.service.deleteTopic(body.TopicArn, ctx.region); return this.json({}, ctx);
        case "ListTopics": return this.json({ Topics: this.service.listTopics(ctx.region).map((t) => ({ TopicArn: t.topicArn })) }, ctx);
        case "Publish": return this.json({ MessageId: this.service.publish(body.TopicArn, body.Message, body.Subject, body.MessageAttributes, ctx.region).messageId }, ctx);
        case "Subscribe": {
          const sub = this.service.subscribe(body.TopicArn, body.Protocol, body.Endpoint, ctx.region, body.Attributes);
          return this.json({ SubscriptionArn: sub.subscriptionArn }, ctx);
        }
        case "Unsubscribe": this.service.unsubscribe(body.SubscriptionArn, ctx.region); return this.json({}, ctx);
        case "GetTopicAttributes": return this.json({ Attributes: this.service.getTopicAttributes(body.TopicArn, ctx.region) }, ctx);
        case "SetTopicAttributes": this.service.setTopicAttributes(body.TopicArn, body.AttributeName, body.AttributeValue, ctx.region); return this.json({}, ctx);
        case "ListSubscriptions": return this.json({ Subscriptions: this.service.listSubscriptions(ctx.region).map(subToJson) }, ctx);
        case "ListSubscriptionsByTopic": return this.json({ Subscriptions: this.service.listSubscriptionsByTopic(body.TopicArn, ctx.region).map(subToJson) }, ctx);
        case "GetSubscriptionAttributes": {
          const sub = this.service.getSubscription(body.SubscriptionArn, ctx.region);
          return this.json({ Attributes: subAttrsToJson(sub) }, ctx);
        }
        case "SetSubscriptionAttributes": {
          this.service.setSubscriptionAttribute(body.SubscriptionArn, body.AttributeName, body.AttributeValue, ctx.region);
          return this.json({}, ctx);
        }
        case "ListTagsForResource": {
          const tags = this.service.listTagsForResource(body.ResourceArn, ctx.region);
          return this.json({ Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) }, ctx);
        }
        case "TagResource": {
          const tagsToSet: Record<string, string> = {};
          if (Array.isArray(body.Tags)) {
            for (const tag of body.Tags) tagsToSet[tag.Key] = tag.Value;
          }
          this.service.tagResource(body.ResourceArn, tagsToSet, ctx.region);
          return this.json({}, ctx);
        }
        case "UntagResource": {
          this.service.untagResource(body.ResourceArn, body.TagKeys ?? [], ctx.region);
          return this.json({}, ctx);
        }
        case "PublishBatch": {
          const entries = (body.PublishBatchRequestEntries ?? []).map((e: any) => ({
            id: e.Id,
            message: e.Message,
            subject: e.Subject,
            messageAttributes: e.MessageAttributes,
          }));
          const result = this.service.publishBatch(body.TopicArn, entries, ctx.region);
          return this.json({
            Successful: result.successful.map((s) => ({ Id: s.id, MessageId: s.messageId })),
            Failed: result.failed.map((f) => ({ Id: f.id, Code: f.code, Message: f.message, SenderFault: f.senderFault })),
          }, ctx);
        }
        case "ConfirmSubscription": {
          const sub = this.service.confirmSubscription(body.TopicArn, body.Token, ctx.region);
          return this.json({ SubscriptionArn: sub.subscriptionArn }, ctx);
        }
        case "CreatePlatformApplication": {
          const app = this.service.createPlatformApplication(body.Name, body.Platform, body.Attributes ?? {}, ctx.region);
          return this.json({ PlatformApplicationArn: app.platformApplicationArn }, ctx);
        }
        case "GetPlatformApplicationAttributes": {
          const attrs = this.service.getPlatformApplicationAttributes(body.PlatformApplicationArn, ctx.region);
          return this.json({ Attributes: attrs }, ctx);
        }
        case "SetPlatformApplicationAttributes": {
          this.service.setPlatformApplicationAttributes(body.PlatformApplicationArn, body.Attributes ?? {}, ctx.region);
          return this.json({}, ctx);
        }
        case "ListPlatformApplications": {
          const apps = this.service.listPlatformApplications(ctx.region);
          return this.json({ PlatformApplications: apps.map((a) => ({ PlatformApplicationArn: a.platformApplicationArn, Attributes: a.attributes })) }, ctx);
        }
        case "DeletePlatformApplication": {
          this.service.deletePlatformApplication(body.PlatformApplicationArn, ctx.region);
          return this.json({}, ctx);
        }
        case "CreatePlatformEndpoint": {
          const ep = this.service.createPlatformEndpoint(body.PlatformApplicationArn, body.Token, body.Attributes ?? {}, ctx.region);
          return this.json({ EndpointArn: ep.endpointArn }, ctx);
        }
        case "ListEndpointsByPlatformApplication": {
          const eps = this.service.listEndpointsByPlatformApplication(body.PlatformApplicationArn, ctx.region);
          return this.json({ Endpoints: eps.map((ep) => ({ EndpointArn: ep.endpointArn, Attributes: ep.attributes })) }, ctx);
        }
        case "DeleteEndpoint": {
          this.service.deleteEndpoint(body.EndpointArn, ctx.region);
          return this.json({}, ctx);
        }
        case "GetEndpointAttributes": {
          const attrs = this.service.getEndpointAttributes(body.EndpointArn, ctx.region);
          return this.json({ Attributes: attrs }, ctx);
        }
        case "SetEndpointAttributes": {
          this.service.setEndpointAttributes(body.EndpointArn, body.Attributes ?? {}, ctx.region);
          return this.json({}, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId },
    });
  }
}

export class SnsQueryHandler {
  constructor(private service: SnsService) {}

  handle(action: string, params: URLSearchParams, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateTopic": {
          const tags: Record<string, string> = {};
          for (let i = 1; ; i++) {
            const key = params.get(`Tags.member.${i}.Key`);
            const value = params.get(`Tags.member.${i}.Value`);
            if (!key) break;
            tags[key] = value ?? "";
          }
          const attributes: Record<string, string> = {};
          for (let i = 1; ; i++) {
            const key = params.get(`Attributes.entry.${i}.key`);
            const value = params.get(`Attributes.entry.${i}.value`);
            if (!key) break;
            attributes[key] = value ?? "";
          }
          const topic = this.service.createTopic(params.get("Name")!, attributes, tags, ctx.region);
          return xmlResponse(xmlEnvelope("CreateTopic", ctx.requestId, new XmlBuilder().elem("TopicArn", topic.topicArn).build(), NS), ctx.requestId);
        }
        case "DeleteTopic":
          this.service.deleteTopic(params.get("TopicArn")!, ctx.region);
          return xmlResponse(xmlEnvelopeNoResult("DeleteTopic", ctx.requestId, NS), ctx.requestId);
        case "ListTopics": {
          const topics = this.service.listTopics(ctx.region);
          const xml = new XmlBuilder().start("Topics");
          for (const t of topics) xml.start("member").elem("TopicArn", t.topicArn).end("member");
          xml.end("Topics");
          return xmlResponse(xmlEnvelope("ListTopics", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "Publish": {
          const result = this.service.publish(params.get("TopicArn")!, params.get("Message")!, params.get("Subject") ?? undefined, undefined, ctx.region);
          return xmlResponse(xmlEnvelope("Publish", ctx.requestId, new XmlBuilder().elem("MessageId", result.messageId).build(), NS), ctx.requestId);
        }
        case "Subscribe": {
          const sub = this.service.subscribe(params.get("TopicArn")!, params.get("Protocol")!, params.get("Endpoint")!, ctx.region);
          return xmlResponse(xmlEnvelope("Subscribe", ctx.requestId, new XmlBuilder().elem("SubscriptionArn", sub.subscriptionArn).build(), NS), ctx.requestId);
        }
        case "Unsubscribe":
          this.service.unsubscribe(params.get("SubscriptionArn")!, ctx.region);
          return xmlResponse(xmlEnvelopeNoResult("Unsubscribe", ctx.requestId, NS), ctx.requestId);
        case "GetTopicAttributes": {
          const attrs = this.service.getTopicAttributes(params.get("TopicArn")!, ctx.region);
          const xml = new XmlBuilder().start("Attributes");
          for (const [k, v] of Object.entries(attrs)) {
            xml.start("entry").elem("key", k).elem("value", v).end("entry");
          }
          xml.end("Attributes");
          return xmlResponse(xmlEnvelope("GetTopicAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "SetTopicAttributes":
          this.service.setTopicAttributes(params.get("TopicArn")!, params.get("AttributeName")!, params.get("AttributeValue")!, ctx.region);
          return xmlResponse(xmlEnvelopeNoResult("SetTopicAttributes", ctx.requestId, NS), ctx.requestId);
        case "ListSubscriptions": {
          const subs = this.service.listSubscriptions(ctx.region);
          const xml = new XmlBuilder().start("Subscriptions");
          for (const s of subs) xml.start("member").elem("SubscriptionArn", s.subscriptionArn).elem("TopicArn", s.topicArn).elem("Protocol", s.protocol).elem("Endpoint", s.endpoint).elem("Owner", s.owner).end("member");
          xml.end("Subscriptions");
          return xmlResponse(xmlEnvelope("ListSubscriptions", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "ListSubscriptionsByTopic": {
          const subs = this.service.listSubscriptionsByTopic(params.get("TopicArn")!, ctx.region);
          const xml = new XmlBuilder().start("Subscriptions");
          for (const s of subs) xml.start("member").elem("SubscriptionArn", s.subscriptionArn).elem("TopicArn", s.topicArn).elem("Protocol", s.protocol).elem("Endpoint", s.endpoint).elem("Owner", s.owner).end("member");
          xml.end("Subscriptions");
          return xmlResponse(xmlEnvelope("ListSubscriptionsByTopic", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "GetSubscriptionAttributes": {
          const sub = this.service.getSubscription(params.get("SubscriptionArn")!, ctx.region);
          const attrs = subAttrsToJson(sub);
          const xml = new XmlBuilder().start("Attributes");
          for (const [k, v] of Object.entries(attrs)) {
            xml.start("entry").elem("key", k).elem("value", v).end("entry");
          }
          xml.end("Attributes");
          return xmlResponse(xmlEnvelope("GetSubscriptionAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "ListTagsForResource": {
          const tags = this.service.listTagsForResource(params.get("ResourceArn")!, ctx.region);
          const xml = new XmlBuilder().start("Tags");
          for (const [k, v] of Object.entries(tags)) {
            xml.start("member").elem("Key", k).elem("Value", v).end("member");
          }
          xml.end("Tags");
          return xmlResponse(xmlEnvelope("ListTagsForResource", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "TagResource": {
          const resourceArn = params.get("ResourceArn")!;
          const tags: Record<string, string> = {};
          for (let i = 1; ; i++) {
            const key = params.get(`Tags.member.${i}.Key`);
            const value = params.get(`Tags.member.${i}.Value`);
            if (!key) break;
            tags[key] = value ?? "";
          }
          this.service.tagResource(resourceArn, tags, ctx.region);
          return xmlResponse(xmlEnvelopeNoResult("TagResource", ctx.requestId, NS), ctx.requestId);
        }
        case "UntagResource": {
          const resourceArn = params.get("ResourceArn")!;
          const tagKeys: string[] = [];
          for (let i = 1; ; i++) {
            const key = params.get(`TagKeys.member.${i}`);
            if (!key) break;
            tagKeys.push(key);
          }
          this.service.untagResource(resourceArn, tagKeys, ctx.region);
          return xmlResponse(xmlEnvelopeNoResult("UntagResource", ctx.requestId, NS), ctx.requestId);
        }
        case "PublishBatch": {
          const topicArn = params.get("TopicArn")!;
          const entries: { id: string; message: string; subject?: string }[] = [];
          for (let i = 1; ; i++) {
            const id = params.get(`PublishBatchRequestEntries.member.${i}.Id`);
            if (!id) break;
            entries.push({
              id,
              message: params.get(`PublishBatchRequestEntries.member.${i}.Message`) ?? "",
              subject: params.get(`PublishBatchRequestEntries.member.${i}.Subject`) ?? undefined,
            });
          }
          const result = this.service.publishBatch(topicArn, entries, ctx.region);
          const xml = new XmlBuilder();
          xml.start("Successful");
          for (const s of result.successful) {
            xml.start("member").elem("Id", s.id).elem("MessageId", s.messageId).end("member");
          }
          xml.end("Successful");
          xml.start("Failed");
          for (const f of result.failed) {
            xml.start("member").elem("Id", f.id).elem("Code", f.code).elem("Message", f.message).elem("SenderFault", String(f.senderFault)).end("member");
          }
          xml.end("Failed");
          return xmlResponse(xmlEnvelope("PublishBatch", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "ConfirmSubscription": {
          const sub = this.service.confirmSubscription(params.get("TopicArn")!, params.get("Token")!, ctx.region);
          return xmlResponse(xmlEnvelope("ConfirmSubscription", ctx.requestId, new XmlBuilder().elem("SubscriptionArn", sub.subscriptionArn).build(), NS), ctx.requestId);
        }
        case "CreatePlatformApplication": {
          const attributes: Record<string, string> = {};
          for (let i = 1; ; i++) {
            const key = params.get(`Attributes.entry.${i}.key`);
            const value = params.get(`Attributes.entry.${i}.value`);
            if (!key) break;
            attributes[key] = value ?? "";
          }
          const app = this.service.createPlatformApplication(params.get("Name")!, params.get("Platform")!, attributes, ctx.region);
          return xmlResponse(xmlEnvelope("CreatePlatformApplication", ctx.requestId, new XmlBuilder().elem("PlatformApplicationArn", app.platformApplicationArn).build(), NS), ctx.requestId);
        }
        case "GetPlatformApplicationAttributes": {
          const attrs = this.service.getPlatformApplicationAttributes(params.get("PlatformApplicationArn")!, ctx.region);
          const xml = new XmlBuilder().start("Attributes");
          for (const [k, v] of Object.entries(attrs)) {
            xml.start("entry").elem("key", k).elem("value", v).end("entry");
          }
          xml.end("Attributes");
          return xmlResponse(xmlEnvelope("GetPlatformApplicationAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "SetPlatformApplicationAttributes": {
          const attrs: Record<string, string> = {};
          for (let i = 1; ; i++) {
            const key = params.get(`Attributes.entry.${i}.key`);
            const value = params.get(`Attributes.entry.${i}.value`);
            if (!key) break;
            attrs[key] = value ?? "";
          }
          this.service.setPlatformApplicationAttributes(params.get("PlatformApplicationArn")!, attrs, ctx.region);
          return xmlResponse(xmlEnvelopeNoResult("SetPlatformApplicationAttributes", ctx.requestId, NS), ctx.requestId);
        }
        case "ListPlatformApplications": {
          const apps = this.service.listPlatformApplications(ctx.region);
          const xml = new XmlBuilder().start("PlatformApplications");
          for (const a of apps) {
            xml.start("member").elem("PlatformApplicationArn", a.platformApplicationArn);
            xml.start("Attributes");
            for (const [k, v] of Object.entries(a.attributes)) {
              xml.start("entry").elem("key", k).elem("value", v).end("entry");
            }
            xml.end("Attributes").end("member");
          }
          xml.end("PlatformApplications");
          return xmlResponse(xmlEnvelope("ListPlatformApplications", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "DeletePlatformApplication": {
          this.service.deletePlatformApplication(params.get("PlatformApplicationArn")!, ctx.region);
          return xmlResponse(xmlEnvelopeNoResult("DeletePlatformApplication", ctx.requestId, NS), ctx.requestId);
        }
        case "CreatePlatformEndpoint": {
          const attrs: Record<string, string> = {};
          for (let i = 1; ; i++) {
            const key = params.get(`Attributes.entry.${i}.key`);
            const value = params.get(`Attributes.entry.${i}.value`);
            if (!key) break;
            attrs[key] = value ?? "";
          }
          const ep = this.service.createPlatformEndpoint(params.get("PlatformApplicationArn")!, params.get("Token")!, attrs, ctx.region);
          return xmlResponse(xmlEnvelope("CreatePlatformEndpoint", ctx.requestId, new XmlBuilder().elem("EndpointArn", ep.endpointArn).build(), NS), ctx.requestId);
        }
        case "ListEndpointsByPlatformApplication": {
          const eps = this.service.listEndpointsByPlatformApplication(params.get("PlatformApplicationArn")!, ctx.region);
          const xml = new XmlBuilder().start("Endpoints");
          for (const ep of eps) {
            xml.start("member").elem("EndpointArn", ep.endpointArn);
            xml.start("Attributes");
            for (const [k, v] of Object.entries(ep.attributes)) {
              xml.start("entry").elem("key", k).elem("value", v).end("entry");
            }
            xml.end("Attributes").end("member");
          }
          xml.end("Endpoints");
          return xmlResponse(xmlEnvelope("ListEndpointsByPlatformApplication", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "DeleteEndpoint": {
          this.service.deleteEndpoint(params.get("EndpointArn")!, ctx.region);
          return xmlResponse(xmlEnvelopeNoResult("DeleteEndpoint", ctx.requestId, NS), ctx.requestId);
        }
        case "GetEndpointAttributes": {
          const attrs = this.service.getEndpointAttributes(params.get("EndpointArn")!, ctx.region);
          const xml = new XmlBuilder().start("Attributes");
          for (const [k, v] of Object.entries(attrs)) {
            xml.start("entry").elem("key", k).elem("value", v).end("entry");
          }
          xml.end("Attributes");
          return xmlResponse(xmlEnvelope("GetEndpointAttributes", ctx.requestId, xml.build(), NS), ctx.requestId);
        }
        case "SetEndpointAttributes": {
          const attrs: Record<string, string> = {};
          for (let i = 1; ; i++) {
            const key = params.get(`Attributes.entry.${i}.key`);
            const value = params.get(`Attributes.entry.${i}.value`);
            if (!key) break;
            attrs[key] = value ?? "";
          }
          this.service.setEndpointAttributes(params.get("EndpointArn")!, attrs, ctx.region);
          return xmlResponse(xmlEnvelopeNoResult("SetEndpointAttributes", ctx.requestId, NS), ctx.requestId);
        }
        default:
          return xmlErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }
}

function subToJson(s: any) {
  return { SubscriptionArn: s.subscriptionArn, TopicArn: s.topicArn, Protocol: s.protocol, Endpoint: s.endpoint, Owner: s.owner };
}

function subAttrsToJson(s: any): Record<string, string> {
  return {
    SubscriptionArn: s.subscriptionArn,
    TopicArn: s.topicArn,
    Protocol: s.protocol,
    Endpoint: s.endpoint,
    Owner: s.owner,
    RawMessageDelivery: String(s.rawMessageDelivery ?? false),
    ConfirmationWasAuthenticated: "true",
    PendingConfirmation: "false",
  };
}
