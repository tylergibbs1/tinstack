import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { PollyService } from "./polly-service";

function toEpoch(ts: string): number {
  return Math.floor(new Date(ts).getTime() / 1000);
}

export class PollyHandler {
  constructor(private service: PollyService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // GET /v1/voices
      if (path === "/v1/voices" && method === "GET") {
        const languageCode = url.searchParams.get("LanguageCode") ?? undefined;
        const voices = this.service.describeVoices(languageCode);
        return this.json({ Voices: voices }, ctx);
      }

      // POST /v1/speech
      if (path === "/v1/speech" && method === "POST") {
        const body = await req.json();
        const result = this.service.synthesizeSpeech(body.Text, body.VoiceId, body.OutputFormat ?? "mp3");
        return new Response(result.audioData, {
          headers: {
            "Content-Type": result.contentType,
            "x-amzn-RequestId": ctx.requestId,
          },
        });
      }

      // --- Lexicons ---
      const lexiconMatch = path.match(/^\/v1\/lexicons\/([^/]+)$/);
      if (lexiconMatch) {
        const name = decodeURIComponent(lexiconMatch[1]);
        if (method === "PUT") {
          const body = await req.json();
          this.service.putLexicon(name, body.Content ?? "");
          return this.json({}, ctx);
        }
        if (method === "GET") {
          const lexicon = this.service.getLexicon(name);
          return this.json({
            Lexicon: { Name: lexicon.name, Content: lexicon.content },
            LexiconAttributes: {
              Alphabet: "ipa",
              LanguageCode: lexicon.languageCode,
              LastModified: toEpoch(lexicon.lastModified),
              LexemesCount: lexicon.lexemesCount,
              LexiconArn: lexicon.arn,
              Size: lexicon.size,
            },
          }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteLexicon(name);
          return this.json({}, ctx);
        }
      }

      // GET /v1/lexicons
      if (path === "/v1/lexicons" && method === "GET") {
        const lexicons = this.service.listLexicons();
        return this.json({
          Lexicons: lexicons.map((l) => ({
            Name: l.name,
            Attributes: {
              LanguageCode: l.languageCode,
              LastModified: toEpoch(l.lastModified),
              LexiconArn: l.arn,
              LexemesCount: l.lexemesCount,
              Size: l.size,
            },
          })),
        }, ctx);
      }

      // --- Speech Synthesis Tasks ---
      if (path === "/v1/synthesisTasks" && method === "POST") {
        const body = await req.json();
        const task = this.service.startSpeechSynthesisTask(body);
        return this.json({ SynthesisTask: this.taskToJson(task) }, ctx);
      }

      const taskMatch = path.match(/^\/v1\/synthesisTasks\/([^/]+)$/);
      if (taskMatch && method === "GET") {
        const taskId = decodeURIComponent(taskMatch[1]);
        const task = this.service.getSpeechSynthesisTask(taskId);
        return this.json({ SynthesisTask: this.taskToJson(task) }, ctx);
      }

      if (path === "/v1/synthesisTasks" && method === "GET") {
        const tasks = this.service.listSpeechSynthesisTasks();
        return this.json({ SynthesisTasks: tasks.map((t) => this.taskToJson(t)) }, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown Polly operation: ${method} ${path}`, 400),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private taskToJson(task: any): any {
    return {
      TaskId: task.taskId,
      TaskStatus: task.taskStatus,
      OutputUri: task.outputUri,
      CreationTime: toEpoch(task.creationTime),
      Engine: task.engine,
      LanguageCode: task.languageCode,
      OutputFormat: task.outputFormat,
      TextType: task.textType,
      VoiceId: task.voiceId,
    };
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
