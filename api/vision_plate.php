<?php
require __DIR__ . '/lib.php';
enforce_post_request();
enforce_json_content_type();
enforce_same_origin_request();
enforce_rate_limit('vision_plate:minute:' . client_ip(), 45, 60);
enforce_rate_limit('vision_plate:hour:' . client_ip(), 600, 3600);

$cfg = require __DIR__ . '/config.php';
$openai = is_array($cfg['openai'] ?? null) ? $cfg['openai'] : [];
$apiKey = trim((string)($openai['api_key'] ?? ''));
if ($apiKey === '') {
  json_response(['error' => 'vision_not_configured'], 503);
}
$baseUrl = rtrim((string)($openai['base_url'] ?? 'https://api.openai.com/v1'), '/');
if (!preg_match('#^https://#i', $baseUrl)) {
  json_response(['error' => 'vision_not_configured'], 503);
}

$req = read_json_request_body(7 * 1024 * 1024);
$imageDataUrl = (string)($req['image_data_url'] ?? '');
$lang = (string)($req['lang'] ?? 'zh');
$lang = $lang === 'en' ? 'en' : 'zh';

if (!preg_match('/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+\/=]+)$/', $imageDataUrl, $m)) {
  bad_request('invalid_image_data_url');
}
$decodedImage = base64_decode($m[2], true);
if ($decodedImage === false) bad_request('invalid_image_base64');
if (strlen($decodedImage) > 5 * 1024 * 1024) bad_request('image_too_large');
require_vision_session_token((string)($req['vision_token'] ?? ''));

$prompt = $lang === 'en'
  ? "Read the Hong Kong vehicle registration mark from this cropped plate image. Return JSON only with keys: plate, confidence, raw_text, reasoning_note. Normalize by removing spaces, converting I to 1, O to 0, and dropping Q. If uncertain, still return your best guess and lower confidence."
  : "讀取這張已裁切的香港車牌圖像，只回傳 JSON，鍵為 plate、confidence、raw_text、reasoning_note。正規化規則：移除空格，把 I 轉成 1，把 O 轉成 0，刪除 Q。如不完全確定，也請回傳最佳猜測並降低 confidence。";

$payload = [
  'model' => (string)($openai['vision_model'] ?? 'gpt-4.1-mini'),
  'input' => [[
    'role' => 'user',
    'content' => [
      ['type' => 'input_text', 'text' => $prompt],
      ['type' => 'input_image', 'image_url' => $imageDataUrl, 'detail' => 'high'],
    ],
  ]],
  'max_output_tokens' => 140,
];

$resp = http_post_json(
  $baseUrl . '/responses',
  $payload,
  [
    'Authorization: Bearer ' . $apiKey,
  ],
  (int)($openai['timeout_seconds'] ?? 20)
);

if ($resp['status'] < 200 || $resp['status'] >= 300 || !is_array($resp['json'])) {
  error_log('[vision_plate] openai_error status=' . $resp['status'] . ' body=' . substr((string)$resp['body'], 0, 800));
  security_log_event('vision_upstream_error', [
    'status' => (int)$resp['status'],
    'body_excerpt' => substr((string)$resp['body'], 0, 180),
  ]);
  json_response(['error' => 'vision_upstream_error'], 502);
}

$responseJson = $resp['json'];
$outputText = trim((string)($responseJson['output_text'] ?? ''));
if ($outputText === '') {
  $chunks = [];
  foreach (($responseJson['output'] ?? []) as $item) {
    foreach (($item['content'] ?? []) as $content) {
      if (($content['type'] ?? '') === 'output_text' && isset($content['text'])) {
        $chunks[] = (string)$content['text'];
      }
    }
  }
  $outputText = trim(implode("\n", $chunks));
}
if ($outputText === '') {
  json_response(['error' => 'vision_empty_output'], 502);
}

$jsonStart = strpos($outputText, '{');
$jsonEnd = strrpos($outputText, '}');
if ($jsonStart !== false && $jsonEnd !== false && $jsonEnd >= $jsonStart) {
  $outputText = substr($outputText, $jsonStart, $jsonEnd - $jsonStart + 1);
}

$parsed = json_decode($outputText, true);
if (!is_array($parsed)) {
  security_log_event('vision_invalid_output', [
    'raw_excerpt' => is_debug_mode() ? substr($outputText, 0, 180) : 'suppressed',
  ]);
  json_response([
    'error' => 'vision_invalid_output',
    'raw_output' => is_debug_mode() ? $outputText : null,
  ], 502);
}

$plate = normalize_query((string)($parsed['plate'] ?? ''));
$confidence = (float)($parsed['confidence'] ?? 0);
$confidence = max(0.0, min(1.0, $confidence));
$rawText = normalize_query((string)($parsed['raw_text'] ?? $plate));
$note = trim((string)($parsed['reasoning_note'] ?? ''));
if (strlen($note) > 160) $note = substr($note, 0, 160);

json_response([
  'plate' => $plate,
  'raw_text' => $rawText,
  'confidence' => $confidence,
  'note' => $note,
  'model' => (string)($openai['vision_model'] ?? 'gpt-4.1-mini'),
]);
