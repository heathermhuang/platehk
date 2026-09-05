import { createClient } from "@open-wa/core";
import {
  PlaywrightDriver,
  PlaywrightPage,
} from "@open-wa/driver-playwright";
import qrcode from "qrcode-terminal";
import { normalizeChatId } from "./domain.mjs";
import { normalizeOpenWAMessage } from "./message.mjs";

class PersistentContextBrowser {
  constructor(context, capabilities) {
    this.context = context;
    this.capabilities = capabilities;
    this.closed = false;
    this.claimedInitialPage = false;
    this.name = "playwright";
  }

  wrap(page) {
    return new PlaywrightPage(page, "chromium", this.capabilities);
  }

  async newPage() {
    if (!this.claimedInitialPage) {
      this.claimedInitialPage = true;
      const existing = this.context.pages()[0];
      if (existing) return this.wrap(existing);
    }
    return this.wrap(await this.context.newPage());
  }

  async pages() {
    return this.context.pages().map((page) => this.wrap(page));
  }

  async close() {
    this.closed = true;
    await this.context.close();
  }

  isConnected() {
    return !this.closed && (this.context.browser()?.isConnected() ?? true);
  }

  async versionString() {
    return this.context.browser()?.version() || "playwright-persistent-context";
  }

  unwrap() {
    return this.context;
  }
}

export class PersistentProxyPlaywrightDriver extends PlaywrightDriver {
  constructor(proxy) {
    super("chromium");
    this.proxy = proxy;
  }

  async launch(options = {}) {
    let playwright = this.unwrap();
    if (!playwright?.chromium) {
      await this.init();
      playwright = this.unwrap();
    }
    if (!options.userDataDir) throw new Error("OpenWA requires a persistent userDataDir");
    const context = await playwright.chromium.launchPersistentContext(options.userDataDir, {
      headless: options.headless ?? true,
      executablePath: options.executablePath,
      args: options.args,
      proxy: this.proxy,
      viewport: null,
      timeout: options.timeoutMs,
    });
    return new PersistentContextBrowser(context, this.capabilities);
  }
}

export class OpenWAAdapter {
  constructor(config, { onMessage, onState } = {}) {
    this.config = config;
    this.onMessage = onMessage;
    this.onState = onState;
    this.client = null;
    this.remoteClient = null;
    this.state = "STARTING";
  }

  async start() {
    const bridge = async ({ client }) => {
      this.remoteClient = client;
      return {};
    };
    bridge.meta = {
      name: "platehk-introduction-bridge",
      version: "0.1.0",
      description: "Narrow client bridge for buyer introduction groups",
    };

    this.client = await createClient({
      sessionId: this.config.sessionId,
      driver: new PersistentProxyPlaywrightDriver(this.config.proxy),
      plugins: [bridge],
      sessionDataPath: this.config.dataDir,
      userDataDir: `${this.config.dataDir}/openwa-profile`,
      executablePath: this.config.chromeExecutablePath,
      headless: true,
      qrTimeoutMs: 0,
      authTimeoutMs: 0,
      // OpenWA v5 alpha's Playwright request wrapper cannot continue intercepted
      // requests yet. Keep interception disabled until that upstream contract works.
      blockCrashLogs: false,
      blockAssets: false,
      logConsole: false,
      logConsoleErrors: true,
    });

    this.client.events.on("launch.auth.qr.generated", (event) => {
      const qr = event?.details?.qr;
      console.warn("OpenWA authentication required. Scan this QR from the secondary WhatsApp account.");
      if (qr) qrcode.generate(qr, { small: true }, (ascii) => console.warn(ascii));
    });
    this.client.events.on("session.state.changed", (event) => {
      this.state = String(event?.details?.next || "DISCONNECTED");
      this.onState?.(this.state);
    });
    this.client.events.on("message.received", async ({ message }) => {
      const normalized = normalizeOpenWAMessage(message);
      if (normalized) await this.onMessage?.(normalized);
    });
    this.client.events.on("error", ({ scope, fatal }) => {
      console.error("OpenWA runtime error", { scope, fatal: Boolean(fatal) });
    });

    await this.client.start();
    this.state = this.client.getState();
    const hostNumber = String(await this.call("getHostNumber") || "").replace(/\D/g, "");
    if (hostNumber !== this.config.publicNumber) {
      await this.client.stop("unexpected_host_number");
      this.state = "DISCONNECTED";
      throw new Error("Authenticated WhatsApp number does not match WHATSAPP_PUBLIC_NUMBER");
    }
    return this.state;
  }

  async call(method, args = []) {
    if (!this.remoteClient) throw new Error("OpenWA client bridge is not ready");
    return this.remoteClient.ask(method, args);
  }

  async sendText(chatId, text) {
    return this.call("sendText", [chatId, text]);
  }

  async createGroup({ name, participants }) {
    let groupId = "";
    try {
      const groups = await this.call("getAllGroups");
      const existing = Array.isArray(groups) && groups.find((group) =>
        String(group?.name || group?.formattedTitle || group?.contact?.name || "") === name,
      );
      groupId = normalizeChatId(existing?.id || existing?.chatId);
    } catch {
      // Group lookup is a retry-safety optimization; creation can continue without it.
    }
    if (!groupId) {
      const result = await this.call("createGroup", [name, participants]);
      groupId = normalizeChatId(result?.gid || result?.id || result);
    }
    if (!groupId || !groupId.endsWith("@g.us")) throw new Error("OpenWA did not return a group ID");
    let inviteLink = "";
    try {
      inviteLink = String(await this.call("getGroupInviteLink", [groupId]) || "");
    } catch {
      // Participants may already have been added; absence of an invite link is not fatal.
    }
    return { groupId, inviteLink };
  }

  async leaveGroup(groupId) {
    return this.call("leaveGroup", [groupId]);
  }

  getState() {
    return this.state;
  }

  async stop() {
    await this.client?.stop("service_shutdown");
  }
}
