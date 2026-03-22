import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface LexBot {
  botId: string;
  botName: string;
  description: string;
  roleArn: string;
  botStatus: string;
  creationDateTime: string;
}

export class LexV2Service {
  private bots: StorageBackend<string, LexBot>;

  constructor(private accountId: string) {
    this.bots = new InMemoryStorage();
  }

  createBot(botName: string, description: string, roleArn: string): LexBot {
    const botId = crypto.randomUUID().slice(0, 10).toUpperCase();
    const bot: LexBot = {
      botId,
      botName,
      description: description ?? "",
      roleArn: roleArn ?? `arn:aws:iam::${this.accountId}:role/LexRole`,
      botStatus: "Available",
      creationDateTime: new Date().toISOString(),
    };
    this.bots.set(botId, bot);
    return bot;
  }

  describeBot(botId: string): LexBot {
    const bot = this.bots.get(botId);
    if (!bot) throw new AwsError("ResourceNotFoundException", `Bot ${botId} not found`, 404);
    return bot;
  }

  listBots(): LexBot[] {
    return this.bots.values();
  }

  deleteBot(botId: string): void {
    if (!this.bots.has(botId)) throw new AwsError("ResourceNotFoundException", `Bot ${botId} not found`, 404);
    this.bots.delete(botId);
  }
}
