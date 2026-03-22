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
        case "CreateTopic": return this.json({ TopicArn: this.service.createTopic(body.Name, body.Attributes ?? {}, body.Tags ?? {}, ctx.region).topicArn }, ctx);
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
          const topic = this.service.createTopic(params.get("Name")!, {}, {}, ctx.region);
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
