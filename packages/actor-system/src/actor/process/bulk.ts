import { nullLogger } from "@yingyeothon/logger";
import { notifyCompletions } from "../awaiter";
import {
  IActorMessageBulkConsumer,
  IActorOptionalHandler,
  IActorProperty,
  IActorSubsystem
} from "../env";
import { AwaitPolicy, IAwaiterMeta, IUserMessage } from "../message";
import { copyAwaiterMeta, maybeAwait } from "./utils";

export type ActorBulkEnv<T> = IActorProperty &
  Pick<IActorSubsystem, "logger" | "queue" | "awaiter"> &
  IActorMessageBulkConsumer<T> &
  IActorOptionalHandler;

export const processInBulkMode = async <T>(
  env: ActorBulkEnv<T>,
  isAlive: () => boolean
) => {
  const { queue, id, logger = nullLogger, onMessages, onError } = env;
  logger.debug(`actor`, `process-queue-in-bulk`, id);

  // Process messages as possible as it can while alive.
  const messageMetas: IAwaiterMeta[] = [];
  while (isAlive()) {
    const messages: Array<IUserMessage<any>> = await queue.flush(id);
    logger.debug(`actor`, `get-messages`, id, messages.length);
    if (messages.length === 0) {
      break;
    }

    // Step 2. Process messages.
    try {
      logger.debug(`actor`, `process-messages`, id, messages);
      await maybeAwait(onMessages(messages.map(message => message.item)));
    } catch (error) {
      logger.error(`actor`, `process-messages-error`, id, messages, error);
      if (onError) {
        await maybeAwait(onError(error));
      }
    }

    // Copy only meta to reduce memory consumption.
    for (const message of messages) {
      messageMetas.push(copyAwaiterMeta(message));
    }

    // Step 3. Notify completions to awaiters.
    notifyCompletions(
      env,
      messageMetas.filter(meta => meta.awaitPolicy === AwaitPolicy.Act)
    );
  }
  return messageMetas;
};
