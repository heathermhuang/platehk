import assert from "node:assert/strict";
import { test } from "node:test";
import { OpenWAAdapter, PersistentProxyPlaywrightDriver } from "../src/openwa-adapter.mjs";

test("custom Playwright driver passes the fixed proxy and persistent profile", async () => {
  const observed = {};
  const fakeContext = {
    pages() { return []; },
    async newPage() { return {}; },
    async close() {},
    browser() { return { isConnected: () => true, version: () => "test" }; },
  };
  const driver = new PersistentProxyPlaywrightDriver({
    server: "http://hk.example:8080",
    username: "proxy-user",
    password: "proxy-password",
  });
  driver.unwrap = () => ({
    chromium: {
      async launchPersistentContext(path, options) {
        observed.path = path;
        observed.options = options;
        return fakeContext;
      },
    },
  });
  const browser = await driver.launch({
    userDataDir: "/var/data/openwa-profile",
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  assert.equal(observed.path, "/var/data/openwa-profile");
  assert.equal(observed.options.executablePath, "/usr/bin/chromium");
  assert.deepEqual(observed.options.proxy, {
    server: "http://hk.example:8080",
    username: "proxy-user",
    password: "proxy-password",
  });
  assert.equal(browser.isConnected(), true);
});

test("group retries reuse a previously created group with the same unique name", async () => {
  const calls = [];
  const adapter = new OpenWAAdapter({});
  adapter.remoteClient = {
    async ask(method) {
      calls.push(method);
      if (method === "getAllGroups") {
        return [{ id: "120363000000@g.us", name: "Plate.hk AB123 Z9Q7" }];
      }
      if (method === "getGroupInviteLink") return "https://chat.whatsapp.com/example";
      throw new Error(`Unexpected method ${method}`);
    },
  };
  const result = await adapter.createGroup({
    name: "Plate.hk AB123 Z9Q7",
    participants: ["85260000001@c.us", "85260000002@c.us"],
  });
  assert.deepEqual(result, {
    groupId: "120363000000@g.us",
    inviteLink: "https://chat.whatsapp.com/example",
  });
  assert.deepEqual(calls, ["getAllGroups", "getGroupInviteLink"]);
});
