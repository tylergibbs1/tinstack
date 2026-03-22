import { AwsError } from "../../core/errors";

export interface PollyVoice {
  Id: string;
  Name: string;
  Gender: string;
  LanguageCode: string;
  LanguageName: string;
  SupportedEngines: string[];
}

export interface Lexicon {
  name: string;
  content: string;
  size: number;
  languageCode?: string;
  lexemesCount: number;
  lastModified: string;
  arn: string;
}

export interface SpeechSynthesisTask {
  taskId: string;
  taskStatus: string;
  outputUri: string;
  creationTime: string;
  engine: string;
  languageCode: string;
  outputFormat: string;
  textType: string;
  voiceId: string;
}

const MOCK_VOICES: PollyVoice[] = [
  { Id: "Joanna", Name: "Joanna", Gender: "Female", LanguageCode: "en-US", LanguageName: "US English", SupportedEngines: ["standard", "neural"] },
  { Id: "Matthew", Name: "Matthew", Gender: "Male", LanguageCode: "en-US", LanguageName: "US English", SupportedEngines: ["standard", "neural"] },
  { Id: "Amy", Name: "Amy", Gender: "Female", LanguageCode: "en-GB", LanguageName: "British English", SupportedEngines: ["standard", "neural"] },
  { Id: "Brian", Name: "Brian", Gender: "Male", LanguageCode: "en-GB", LanguageName: "British English", SupportedEngines: ["standard", "neural"] },
  { Id: "Lupe", Name: "Lupe", Gender: "Female", LanguageCode: "es-US", LanguageName: "US Spanish", SupportedEngines: ["standard", "neural"] },
  { Id: "Hans", Name: "Hans", Gender: "Male", LanguageCode: "de-DE", LanguageName: "German", SupportedEngines: ["standard"] },
  { Id: "Celine", Name: "Celine", Gender: "Female", LanguageCode: "fr-FR", LanguageName: "French", SupportedEngines: ["standard"] },
  { Id: "Mizuki", Name: "Mizuki", Gender: "Female", LanguageCode: "ja-JP", LanguageName: "Japanese", SupportedEngines: ["standard"] },
];

export class PollyService {
  private lexicons = new Map<string, Lexicon>();
  private tasks = new Map<string, SpeechSynthesisTask>();

  constructor(private accountId: string, private region: string) {}

  describeVoices(languageCode?: string): PollyVoice[] {
    if (!languageCode) return MOCK_VOICES;
    return MOCK_VOICES.filter((v) => v.LanguageCode === languageCode);
  }

  synthesizeSpeech(_text: string, _voiceId: string, outputFormat: string): { audioData: Uint8Array; contentType: string } {
    // Return a minimal mock audio response
    const mockAudio = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    const contentTypes: Record<string, string> = {
      mp3: "audio/mpeg",
      ogg_vorbis: "audio/ogg",
      pcm: "audio/pcm",
      json: "application/x-json-stream",
    };
    return {
      audioData: mockAudio,
      contentType: contentTypes[outputFormat] ?? "audio/mpeg",
    };
  }

  putLexicon(name: string, content: string): void {
    const existing = this.lexicons.get(name);
    const arn = existing?.arn ?? `arn:aws:polly:${this.region}:${this.accountId}:lexicon/${name}`;
    this.lexicons.set(name, {
      name,
      content,
      size: content.length,
      languageCode: "en-US",
      lexemesCount: 1,
      lastModified: new Date().toISOString(),
      arn,
    });
  }

  getLexicon(name: string): Lexicon {
    const lexicon = this.lexicons.get(name);
    if (!lexicon) {
      throw new AwsError("LexiconNotFoundException", `Lexicon ${name} not found.`, 404);
    }
    return lexicon;
  }

  listLexicons(): Lexicon[] {
    return Array.from(this.lexicons.values());
  }

  deleteLexicon(name: string): void {
    if (!this.lexicons.has(name)) {
      throw new AwsError("LexiconNotFoundException", `Lexicon ${name} not found.`, 404);
    }
    this.lexicons.delete(name);
  }

  startSpeechSynthesisTask(body: any): SpeechSynthesisTask {
    const taskId = crypto.randomUUID();
    const task: SpeechSynthesisTask = {
      taskId,
      taskStatus: "completed",
      outputUri: `https://s3.${this.region}.amazonaws.com/${body.OutputS3BucketName ?? "mock-bucket"}/${body.OutputS3KeyPrefix ?? ""}${taskId}.mp3`,
      creationTime: new Date().toISOString(),
      engine: body.Engine ?? "standard",
      languageCode: body.LanguageCode ?? "en-US",
      outputFormat: body.OutputFormat ?? "mp3",
      textType: body.TextType ?? "text",
      voiceId: body.VoiceId ?? "Joanna",
    };
    this.tasks.set(taskId, task);
    return task;
  }

  getSpeechSynthesisTask(taskId: string): SpeechSynthesisTask {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new AwsError("SynthesisTaskNotFoundException", `Task ${taskId} not found.`, 400);
    }
    return task;
  }

  listSpeechSynthesisTasks(): SpeechSynthesisTask[] {
    return Array.from(this.tasks.values());
  }
}
