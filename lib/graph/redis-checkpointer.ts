import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
  PendingWrite,
} from "@langchain/langgraph-checkpoint";
import { RunnableConfig } from "@langchain/core/runnables";
import Redis from "ioredis";

export class RedisSaver extends BaseCheckpointSaver {
  client: Redis;

  constructor(client: Redis) {
    super();
    this.client = client;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? "";
    const checkpoint_id = config.configurable?.checkpoint_id;

    if (!thread_id) return undefined;

    let key: string;
    if (checkpoint_id) {
      key = `checkpoint:${thread_id}:${checkpoint_ns}:${checkpoint_id}`;
    } else {
      const latestKey = `checkpoint_latest:${thread_id}:${checkpoint_ns}`;
      const latestId = await this.client.get(latestKey);
      if (!latestId) return undefined;
      key = `checkpoint:${thread_id}:${checkpoint_ns}:${latestId}`;
    }

    const data = await this.client.get(key);
    if (!data) return undefined;

    const parsed = JSON.parse(data);
    const checkpoint = {
      ...parsed.checkpoint,
      pending_writes: parsed.pending_writes || [],
    };

    // Retrieve pending writes
    const writesPattern = `writes:${thread_id}:${checkpoint_ns}:${checkpoint.id}:*`;
    let writesCursor = "0";
    const pendingWrites: PendingWrite[] = [];

    do {
      const result = await this.client.scan(
        writesCursor,
        "MATCH",
        writesPattern,
      );
      writesCursor = result[0];
      const keys = result[1];

      for (const key of keys) {
        const data = await this.client.get(key);
        if (data) {
          const writes = JSON.parse(data);
          pendingWrites.push(...writes);
        }
      }
    } while (writesCursor !== "0");

    // Deserialize if needed (assuming JSON for now)
    return {
      config,
      checkpoint: parsed.checkpoint,
      metadata: parsed.metadata,
      parentConfig: parsed.parentConfig,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pendingWrites: pendingWrites as any,
    };
  }

  async *list(config: RunnableConfig): AsyncGenerator<CheckpointTuple> {
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? "";

    if (!thread_id) return;

    // Pattern to match checkpoints for this thread
    const pattern = `checkpoint:${thread_id}:${checkpoint_ns}:*`;
    let cursor = "0";

    do {
      const result = await this.client.scan(cursor, "MATCH", pattern);
      cursor = result[0];
      const keys = result[1];

      for (const key of keys) {
        const data = await this.client.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          yield {
            config: {
              configurable: {
                thread_id,
                checkpoint_ns,
                checkpoint_id: parsed.checkpoint.id,
              },
            },
            checkpoint: parsed.checkpoint,
            metadata: parsed.metadata,
            parentConfig: parsed.parentConfig,
            pendingWrites: [],
          };
        }
      }
    } while (cursor !== "0");
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: Record<string, string | number>,
  ): Promise<RunnableConfig> {
    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? "";

    if (!thread_id) {
      throw new Error("thread_id is required for saving checkpoints");
    }

    const key = `checkpoint:${thread_id}:${checkpoint_ns}:${checkpoint.id}`;
    const value = JSON.stringify({
      checkpoint,
      metadata,
      parentConfig: config,
      newVersions, // Store newVersions if needed for conflict resolution, though usually managed by graph
    });

    await this.client.set(key, value);

    // Update latest pointer
    const latestKey = `checkpoint_latest:${thread_id}:${checkpoint_ns}`;
    await this.client.set(latestKey, checkpoint.id);

    return {
      configurable: {
        thread_id,
        checkpoint_ns,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    // This is for persisting pending writes (e.g. valid output from a node before the next checkpoint)
    // For simplicity, we can store them in a separate key or append to the checkpoint structure if we were modifying it in place.
    // Here we'll store them keyed by thread, checkpoint, and task.

    const thread_id = config.configurable?.thread_id;
    const checkpoint_ns = config.configurable?.checkpoint_ns ?? "";
    const checkpoint_id = config.configurable?.checkpoint_id;

    if (!thread_id || !checkpoint_id) return;

    const key = `writes:${thread_id}:${checkpoint_ns}:${checkpoint_id}:${taskId}`;
    await this.client.set(key, JSON.stringify(writes));
  }

  async deleteThread(thread_id: string): Promise<void> {
    // Delete all checkpoints for this thread
    // Note: This assumes default namespace. If namespaces are used, we might need to wildcard that too.
    const pattern = `checkpoint:${thread_id}:*:*`;
    let cursor = "0";

    do {
      const result = await this.client.scan(cursor, "MATCH", pattern);
      cursor = result[0];
      const keys = result[1];

      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== "0");

    // Delete latest pointers
    const latestPattern = `checkpoint_latest:${thread_id}:*`;
    let latestCursor = "0";

    do {
      const result = await this.client.scan(
        latestCursor,
        "MATCH",
        latestPattern,
      );
      latestCursor = result[0];
      const keys = result[1];

      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (latestCursor !== "0");

    // Delete pending writes
    const writesPattern = `writes:${thread_id}:*:*:*`;
    let writesCursor = "0";

    do {
      const result = await this.client.scan(
        writesCursor,
        "MATCH",
        writesPattern,
      );
      writesCursor = result[0];
      const keys = result[1];

      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (writesCursor !== "0");
  }
}
