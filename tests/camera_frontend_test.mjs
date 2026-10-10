import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(process.env.CAMERA_SOURCE || new URL('../assets/camera.js', import.meta.url), 'utf8');

function cameraApp(options = {}) {
  const elements = new Map();
  let focused;
  class Element {
    value = ''; textContent = ''; innerHTML = ''; disabled = false; hidden = false;
    attrs = new Map(); events = new Map();
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    removeAttribute(key) { this.attrs.delete(key); }
    addEventListener(key, callback) { this.events.set(key, callback); }
    replaceChildren() { this.innerHTML = ''; }
    focus() { focused = this; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 360 }; }
  }
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const requests = [];
  let permissionCalls = 0, trackStops = 0, drawArgs;
  const canvas = element('ocrCanvas');
  canvas.getContext = () => ({
    drawImage(...args) { drawArgs = args; }, fillRect() {}, putImageData() {},
    getImageData: () => ({ data: new Uint8ClampedArray() }),
  });
  canvas.toDataURL = () => 'data:image/jpeg;base64,dGVzdA==';
  Object.assign(element('video'), { videoWidth: 1280, videoHeight: 720, play: async () => {} });
  const document = {
    body: { dataset: {} }, documentElement: {}, visibilityState: 'visible',
    getElementById: element, querySelector: selector => selector === '#manualLabel' ? element('manualLabel') : null,
    addEventListener() {},
  };
  class Reader {
    readAsDataURL() { this.result = 'data:image/png;base64,cGhvdG8='; queueMicrotask(() => this.onload()); }
  }
  class Photo {
    naturalWidth = options.imageWidth || 4000;
    naturalHeight = options.imageHeight || 3000;
    set src(value) { this.url = value; queueMicrotask(() => options.decodeFailure ? this.onerror() : this.onload()); }
  }
  const context = vm.createContext({
    document, window: { addEventListener() {} }, URL, URLSearchParams, Image: Photo, FileReader: Reader,
    AbortController, Date, console,
    location: { search: '?lang=en', pathname: '/camera.html', hostname: 'localhost' },
    history: { replaceState() {} },
    navigator: { mediaDevices: { getUserMedia: async () => {
      permissionCalls += 1;
      return { getTracks: () => [{ stop() { trackStops += 1; } }] };
    } } },
    fetch: async (url, init = {}) => {
      requests.push({ url, init });
      if (options.fetch) return options.fetch(url, init);
      const body = url.includes('vision_session') ? { token: 'fixture-token', expires_at: 4_000_000_000 }
        : url.includes('vision_plate') ? { plate: 'HK88', confidence: .99, is_hong_kong_plate: true }
          : { total: 1, rows: [{ single_line: 'HK 88', dataset_key: 'pvrm', amount_hkd: 88000 }] };
      return { ok: true, json: async () => body };
    },
  });
  vm.runInContext(source, context);
  return { element, requests, run: code => vm.runInContext(code, context),
    get permissionCalls() { return permissionCalls; }, get trackStops() { return trackStops; },
    get drawArgs() { return drawArgs; }, get focused() { return focused; } };
}

test('manual fullwidth input reaches the normalized search without disappearing', async () => {
  const app = cameraApp();
  app.element('manualInput').value = 'ＡＡ８８';
  app.element('manualInput').events.get('input')();
  assert.equal(app.element('manualInput').value, 'ＡＡ８８');
  await app.run("searchPlate('ＡＡ８８')");
  assert.equal(app.requests.length, 1);
  assert.match(app.requests[0].url, /q=AA88/);
  assert.equal(app.element('manualInput').value, 'AA88');
});

test('invalid manual input is preserved and produces validation without a request', async () => {
  const app = cameraApp();
  for (const query of ['', 'Q88', 'HK-88', '123456789']) {
    app.element('manualInput').value = query;
    await app.run(`searchPlate(${JSON.stringify(query)})`);
    assert.equal(app.element('manualInput').value, query);
    assert.equal(app.element('manualInput').getAttribute('aria-invalid'), 'true');
    assert.match(app.element('manualError').textContent, /1–8/);
  }
  assert.equal(app.requests.length, 0);
});

test('photo preview stays local until an explicit scan and resizes without changing aspect ratio', async () => {
  const app = cameraApp();
  await app.run("loadPhoto({type:'image/png',size:5000})");
  assert.equal(app.permissionCalls, 0);
  assert.equal(app.requests.length, 0);
  assert.equal(app.element('photoPreview').hidden, false);
  assert.equal(app.element('aiScanBtn').disabled, false);
  assert.match(app.element('aiScanBtn').textContent, /Upload photo/);
  await app.run('runVisionScan()');
  assert.equal(app.element('ocrCanvas').width, 1440);
  assert.equal(app.element('ocrCanvas').height, 1080);
  assert.equal(app.requests.filter(r => r.url.includes('vision_plate')).length, 1);
  const body = JSON.parse(app.requests.find(r => r.url.includes('vision_plate')).init.body);
  assert.deepEqual(Object.keys(body).sort(), ['image_data_url', 'lang', 'vision_token']);
  assert.equal(body.image_data_url, 'data:image/jpeg;base64,dGVzdA==');
  assert.equal(app.element('aiScanBtn').disabled, false);
});

test('removing a photo releases its decoded preview and disables scanning', async () => {
  const app = cameraApp();
  await app.run("loadPhoto({type:'image/png',size:5000})");
  app.run('removePhoto()');
  assert.equal(app.run('photoImage'), null);
  assert.equal(app.element('photoPreview').hidden, true);
  assert.equal(app.element('aiScanBtn').disabled, true);
  await app.run('runVisionScan()');
  assert.equal(app.requests.length, 0);
});

test('invalid, oversized and unreadable photos remain recoverable without upload', async () => {
  const app = cameraApp({ decodeFailure: true });
  await app.run("loadPhoto({type:'text/plain',size:5000})");
  assert.match(app.element('ocrMeta').textContent, /could not be read/);
  await app.run("loadPhoto({type:'image/png',size:21*1024*1024})");
  assert.match(app.element('ocrMeta').textContent, /20 MB/);
  await app.run("loadPhoto({type:'image/png',size:5000})");
  assert.equal(app.run('photoImage'), null);
  assert.equal(app.element('choosePhoto').disabled, false);
  assert.equal(app.element('aiScanBtn').disabled, true);
  assert.equal(app.requests.length, 0);
});

test('switching from a live camera to a photo stops the camera tracks', async () => {
  const app = cameraApp();
  await app.run('startCamera()');
  assert.equal(app.permissionCalls, 1);
  await app.run("loadPhoto({type:'image/png',size:5000})");
  assert.equal(app.trackStops, 1);
  assert.equal(app.element('stopBtn').disabled, true);
  assert.equal(app.element('photoPreview').hidden, false);
});

test('changing visibility cancels a pending scan before any image upload', async () => {
  let release;
  const app = cameraApp({ fetch: async () => new Promise(resolve => { release = resolve; }) });
  await app.run("loadPhoto({type:'image/png',size:5000})");
  const scan = app.run('runVisionScan()');
  app.run('stopCamera()');
  release({ ok: true, json: async () => ({ token: 'late-token', expires_at: 4_000_000_000 }) });
  await scan;
  assert.equal(app.requests.length, 1);
  assert.match(app.requests[0].url, /vision_session/);
  assert.equal(app.element('aiScanBtn').disabled, false);
});

test('oversized decoded photos never retain a preview or reach OCR', async () => {
  const app = cameraApp({ imageWidth: 10000, imageHeight: 10000 });
  await app.run("loadPhoto({type:'image/png',size:5000})");
  assert.match(app.element('ocrMeta').textContent, /40 megapixels/);
  assert.equal(app.element('aiScanBtn').disabled, true);
  assert.equal(app.run('photoImage'), null);
  assert.equal(app.requests.length, 0);
});
