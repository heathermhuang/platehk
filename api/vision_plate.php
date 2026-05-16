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

function vision_plate_type_from_model($value) {
  $type = strtolower(trim((string)$value));
  $type = preg_replace('/[\s-]+/', '_', $type);
  if (in_array($type, ['macau', 'macao'], true)) return 'macau';
  if (in_array($type, ['mainland', 'mainland_china', 'china', 'prc'], true)) return 'mainland_china';
  if (in_array($type, ['not_hk', 'non_hk', 'not_hong_kong', 'unknown'], true)) return 'not_hk';
  if (in_array($type, ['hong_kong', 'hk'], true)) return 'hong_kong';
  return '';
}

function vision_boolean_or_null($value) {
  if (is_bool($value)) return $value;
  if (is_string($value)) {
    $v = strtolower(trim($value));
    if (in_array($v, ['true', 'yes', '1'], true)) return true;
    if (in_array($v, ['false', 'no', '0'], true)) return false;
  }
  return null;
}

function vision_contains_mainland_plate_signal($value) {
  $text = strtoupper((string)$value);
  $compact = preg_replace('/[\s\.\-·–—]+/u', '', $text);
  $provinceChars = '京津沪滬渝冀豫云雲辽遼黑湘皖鲁魯新苏蘇浙赣贛鄂桂甘晋晉蒙陕陝吉闽閩贵貴粤粵青藏川宁寧琼瓊';
  if (preg_match('/[' . $provinceChars . '][A-Z][A-Z0-9]{4,6}[港澳]?/u', $compact)) return true;
  if (preg_match('/[港澳]$/u', $compact) && preg_match('/[' . $provinceChars . ']/u', $compact)) return true;
  return false;
}

function vision_contains_macau_plate_signal($value) {
  $text = strtoupper((string)$value);
  if (preg_match('/(?:^|[^A-Z0-9])M[A-Z]?\s*[-·–—]\s*\d{2}\s*[-·–—]\s*\d{2}(?:[^A-Z0-9]|$)/u', $text)) return true;
  $hasMacauContext = preg_match('/MACAU|MACAO|澳門|澳门/u', $text);
  if ($hasMacauContext && preg_match('/(?:^|[^A-Z0-9])M[A-Z]?\s*\d{4}(?:[^A-Z0-9]|$)/u', $text)) return true;
  return false;
}

function vision_non_hk_plate_type($plateText, $rawText, $note, $modelType, $isHongKongPlate) {
  $type = vision_plate_type_from_model($modelType);
  if ($type === 'macau' || $type === 'mainland_china') return $type;
  $plateNorm = normalize_query($plateText);
  $rawNorm = normalize_query($rawText);
  if (vision_contains_mainland_plate_signal($plateText)) return 'mainland_china';
  if (vision_contains_macau_plate_signal($plateText)) return 'macau';
  $scanRawForForeign = $plateNorm === '' || $plateNorm === $rawNorm || $isHongKongPlate === false;
  if ($scanRawForForeign && vision_contains_mainland_plate_signal($rawText . ' ' . $note)) return 'mainland_china';
  if ($scanRawForForeign && vision_contains_macau_plate_signal($rawText . ' ' . $note)) return 'macau';
  if ($isHongKongPlate === false) return 'not_hk';
  return '';
}

$prompt = $lang === 'en'
  ? "Read the Hong Kong vehicle registration mark from this cropped plate image. If multiple plates are visible, choose the Hong Kong plate only and ignore Macau plates such as M-12-34 or MA-12-34 and Mainland China plates such as 粤Z1234港, 粵Z1234澳, or province-character plates. Return JSON only with keys: plate, confidence, raw_text, reasoning_note, plate_type, is_hong_kong_plate. Hong Kong registration marks do not use the letters I, O, or Q. Normalize HK marks by removing spaces, converting I to 1, converting O to 0, and dropping Q. Example: visible text like IRIS LAM should normalize as 1R1SLAM. If no Hong Kong plate is visible, return an empty plate, confidence 0, plate_type macau/mainland_china/not_hk, and is_hong_kong_plate false."
  : "讀取這張已裁切的香港車牌圖像；如同時出現多個車牌，只選香港車牌，並忽略澳門車牌（例如 M-12-34 或 MA-12-34）及內地車牌（例如 粤Z1234港、粵Z1234澳 或省份漢字開頭的車牌）。只回傳 JSON，鍵為 plate、confidence、raw_text、reasoning_note、plate_type、is_hong_kong_plate。香港車牌不使用英文字母 I、O、Q。香港車牌正規化規則：移除空格，把 I 轉成 1，把 O 轉成 0，刪除 Q。例如畫面像 IRIS LAM 時，plate 應正規化為 1R1SLAM。如畫面沒有香港車牌，plate 請回傳空字串、confidence 為 0、plate_type 為 macau/mainland_china/not_hk，並把 is_hong_kong_plate 設為 false。";

$payload = [
  'model' => (string)($openai['vision_model'] ?? 'gpt-4.1-mini'),
  'input' => [[
    'role' => 'user',
    'content' => [
      ['type' => 'input_text', 'text' => $prompt],
      ['type' => 'input_image', 'image_url' => $imageDataUrl, 'detail' => 'high'],
    ],
  ]],
  'max_output_tokens' => 190,
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

$rawPlateText = (string)($parsed['plate'] ?? '');
$rawTextOriginal = (string)($parsed['raw_text'] ?? $rawPlateText);
$note = trim((string)($parsed['reasoning_note'] ?? ''));
if (strlen($note) > 160) $note = substr($note, 0, 160);
$plateType = vision_plate_type_from_model((string)($parsed['plate_type'] ?? ''));
$isHongKongPlate = vision_boolean_or_null($parsed['is_hong_kong_plate'] ?? null);
$ignoredPlateType = vision_non_hk_plate_type($rawPlateText, $rawTextOriginal, $note, $plateType, $isHongKongPlate);
if ($ignoredPlateType !== '') {
  json_response([
    'plate' => '',
    'raw_text' => normalize_query($rawTextOriginal),
    'confidence' => 0,
    'note' => $note !== '' ? $note : $ignoredPlateType,
    'model' => (string)($openai['vision_model'] ?? 'gpt-4.1-mini'),
    'plate_type' => $ignoredPlateType,
    'is_hong_kong_plate' => false,
    'ignored_plate_type' => $ignoredPlateType,
  ]);
}

$plate = normalize_query($rawPlateText);
$confidence = (float)($parsed['confidence'] ?? 0);
$confidence = max(0.0, min(1.0, $confidence));
$rawText = normalize_query($rawTextOriginal);

json_response([
  'plate' => $plate,
  'raw_text' => $rawText,
  'confidence' => $confidence,
  'note' => $note,
  'model' => (string)($openai['vision_model'] ?? 'gpt-4.1-mini'),
  'plate_type' => $plateType ?: ($plate !== '' ? 'hong_kong' : 'unknown'),
  'is_hong_kong_plate' => $plate !== '' && $plateType !== 'not_hk',
]);
