import assert from "node:assert/strict";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
}

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.hidden = false;
    this.innerHTML = "";
    this.listeners = new Map();
    this.parentElement = null;
    this.textContent = "";
    this.value = "";
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  append(child) {
    child.parentElement = this;
    this.children.push(child);
  }
  closest(selector) {
    if (selector === "[data-market-inquire]" && Object.hasOwn(this.dataset, "marketInquire")) return this;
    return null;
  }
  focus() {}
  querySelector() { return new FakeElement(); }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }
  reset() {}
  reportValidity() { return true; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

const candidateRows = [
  { single_line: "HUANG" },
  ...Array.from({ length: 198 }, (_, index) => ({ single_line: `HUANG${index + 1}` })),
  { single_line: "DR HUANG" },
];
const rowActions = new Map(candidateRows.map((row) => [
  String(row.single_line).replace(/\s+/g, ""),
  new FakeElement(),
]));
const rowsEl = new FakeElement();
rowsEl.querySelectorAll = (selector) => {
  if (selector === ".row-market-btn") {
    return Array.from(rowActions.values()).flatMap((actions) => actions.children.filter((child) => child.className === "icon-btn row-market-btn"));
  }
  const match = /^tr\[data-plate="([A-Z0-9]+)"\] \.row-actions$/.exec(selector);
  return match && rowActions.has(match[1]) ? [rowActions.get(match[1])] : [];
};

const marketSignalEl = new FakeElement();
marketSignalEl.hidden = true;
const brokerModalEl = new FakeElement();
brokerModalEl.hidden = true;
const brokerFormEl = new FakeElement();
const brokerPlateEl = new FakeElement();
const brokerBudgetEl = new FakeElement();
const brokerNoteEl = new FakeElement();
const brokerSubmitEl = new FakeElement();

globalThis.location = { href: "https://plate.hk/?lang=en&q=HUANG", search: "?lang=en&q=HUANG" };
globalThis.document = {
  activeElement: null,
  addEventListener() {},
  body: { classList: new FakeClassList() },
  createElement() { return new FakeElement(); },
};
globalThis.window = {
  open() {},
  setTimeout(callback) { callback(); },
};

const signals = {
  HUANG: {
    plate: "HUANG",
    availability_detected: true,
    inquiry_enabled: true,
    asking_prices_hkd: [],
    has_contact_price: true,
    observed_at: "2026-08-11T14:11:42Z",
    source_url: "https://m.28car.com/num_dsp.php?h_vid=62255017&h_f_do=1",
  },
  DRHUANG: {
    plate: "DRHUANG",
    availability_detected: true,
    inquiry_enabled: true,
    asking_prices_hkd: [100000],
    has_contact_price: false,
    observed_at: "2026-08-11T14:11:42Z",
    source_url: "https://m.28car.com/num_dsp.php?h_vid=69543484&h_f_do=1",
  },
};
const fetchedBatches = [];
globalThis.fetch = async (input) => {
  const plates = new URL(input, location.href).searchParams.get("plates").split(",");
  fetchedBatches.push(plates);
  return {
    ok: true,
    async json() {
      return {
        plates_requested: plates.length,
        signals: plates.flatMap((plate) => signals[plate] ? [signals[plate]] : []),
      };
    },
  };
};

await import("../assets/index.market.js");
const flow = window.createPlateMarketFlow({
  normalizePlate(value) {
    const raw = Array.isArray(value) ? value.join("") : String(value || "");
    return raw.toUpperCase().replace(/\s+/g, "").replace(/I/g, "1").replace(/O/g, "0").replace(/Q/g, "");
  },
  getCurrentLang: () => "en",
  rowsEl,
  marketSignalEl,
  brokerModalEl,
  brokerCloseEl: new FakeElement(),
  brokerFormEl,
  brokerPlateEl,
  brokerBudgetEl,
  brokerNoteEl,
  brokerSubmitEl,
});

await flow.update({
  query: "HUANG",
  rows: candidateRows,
});

assert.equal(fetchedBatches.length, 1);
assert.equal(fetchedBatches[0].length, 200);
assert.equal(fetchedBatches[0][0], "HUANG");
assert.equal(fetchedBatches[0][199], "DRHUANG");
assert.equal(rowActions.get("HUANG").children.length, 1);
assert.equal(rowActions.get("DRHUANG").children.length, 1);
assert.equal(rowActions.get("HUANG88").children.length, 0);
assert.equal((marketSignalEl.innerHTML.match(/class="market-signal-item"/g) || []).length, 2);
assert.match(marketSignalEl.innerHTML, /data-market-plate="HUANG"/);
assert.match(marketSignalEl.innerHTML, /data-market-plate="DRHUANG"/);
assert.match(marketSignalEl.innerHTML, />DR HUANG<\/span>/);

const drHuangButton = rowActions.get("DRHUANG").children[0];
rowsEl.listeners.get("click")({ target: drHuangButton });
assert.equal(brokerModalEl.hidden, false);
assert.equal(brokerPlateEl.value, "DR HUANG");

console.log("Multi-result market signal frontend test passed.");
