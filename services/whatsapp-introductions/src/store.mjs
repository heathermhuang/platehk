import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function emptyState() {
  return {
    version: 1,
    leads: {},
    matches: {},
    payments: {},
    introductions: {},
    outbox: {},
    processedMessages: {},
    processedStripeEvents: {},
  };
}

function parseKey(value) {
  const secret = String(value || "");
  if (secret.length < 32) throw new Error("STATE_ENCRYPTION_KEY must contain at least 32 characters");
  const decoded = Buffer.from(secret, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(secret).digest();
}

function seal(state, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(state));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

function open(envelope, key) {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted state format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  const state = JSON.parse(plaintext.toString("utf8"));
  return state && state.version === 1 ? state : emptyState();
}

export class EncryptedFileStore {
  constructor(path, encryptionKey) {
    this.path = path;
    this.key = parseKey(encryptionKey);
    this.state = emptyState();
    this.loaded = false;
    this.queue = Promise.resolve();
  }

  async load() {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      const envelope = JSON.parse(await readFile(this.path, "utf8"));
      this.state = open(envelope, this.key);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await this.persist();
    }
    this.loaded = true;
  }

  async persist() {
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${seal(this.state, this.key)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.path);
  }

  async transact(callback) {
    const run = async () => {
      if (!this.loaded) await this.load();
      const result = await callback(this.state);
      await this.persist();
      return result;
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async read(callback) {
    const run = async () => {
      if (!this.loaded) await this.load();
      return callback(structuredClone(this.state));
    };
    const pending = this.queue.then(run, run);
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }
}

export class MemoryStore {
  constructor(seed = emptyState()) {
    this.state = structuredClone(seed);
  }

  async load() {}

  async transact(callback) {
    return callback(this.state);
  }

  async read(callback) {
    return callback(structuredClone(this.state));
  }
}

export function initialState() {
  return emptyState();
}
