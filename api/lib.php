<?php

function is_debug_mode() {
  $v = getenv('APP_DEBUG');
  return $v === '1' || strtolower((string)$v) === 'true';
}

set_error_handler(function($severity, $message, $file, $line) {
  if (!(error_reporting() & $severity)) return false;
  throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(function(Throwable $e) {
  error_log('[api] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
  http_response_code(500);
  apply_api_security_headers();
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  $payload = ['error' => 'server_error'];
  if (is_debug_mode()) $payload['message'] = $e->getMessage();
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
});

function json_response($data, $status = 200) {
  json_response_raw(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $status);
}

function json_response_raw($json, $status = 200) {
  http_response_code($status);
  apply_api_security_headers();
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo $json;
  exit;
}

function unsupported_media_type($msg = 'unsupported_media_type') {
  json_response(['error' => $msg], 415);
}

function too_many_requests($msg = 'rate_limited', $retryAfterSeconds = null) {
  if ($retryAfterSeconds !== null) {
    header('Retry-After: ' . max(1, (int)$retryAfterSeconds));
  }
  json_response(['error' => $msg], 429);
}

function reject_public_read_abuse($eventType, $errorCode, array $context = [], $status = 400) {
  security_log_event($eventType, $context);
  json_response(['error' => $errorCode], $status);
}

function bad_request($msg) {
  json_response(['error' => $msg], 400);
}

function not_found($msg) {
  json_response(['error' => $msg], 404);
}

function enforce_get_request() {
  $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
  if ($method !== 'GET' && $method !== 'HEAD') {
    json_response(['error' => 'method_not_allowed'], 405);
  }
}

function enforce_post_request() {
  $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
  if ($method !== 'POST') {
    json_response(['error' => 'method_not_allowed'], 405);
  }
}

function apply_api_security_headers() {
  header_remove('X-Powered-By');
  header('X-Content-Type-Options: nosniff');
  header('X-Frame-Options: SAMEORIGIN');
  header('Referrer-Policy: strict-origin-when-cross-origin');
  header('Permissions-Policy: geolocation=(), microphone=(), camera=(), browsing-topics=()');
  header('X-Robots-Tag: noindex, nofollow, noarchive');
  header('Cross-Origin-Resource-Policy: same-origin');
}

function app_config() {
  static $cfg = null;
  if ($cfg !== null) return $cfg;
  /** @noinspection PhpIncludeInspection */
  $cfg = require __DIR__ . '/config.php';
  return is_array($cfg) ? $cfg : [];
}

function security_log_dir() {
  $dir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'logs';
  if (!is_dir($dir)) @mkdir($dir, 0775, true);
  return $dir;
}

function security_log_path() {
  return security_log_dir() . DIRECTORY_SEPARATOR . 'security-events.log';
}

function truncate_security_value($value, $maxLen = 180) {
  $text = trim((string)$value);
  if ($text === '') return '';
  return strlen($text) > $maxLen ? substr($text, 0, $maxLen) . '…' : $text;
}

function client_fingerprint() {
  return substr(hash('sha256', client_ip()), 0, 16);
}

function user_agent_fingerprint() {
  return substr(hash('sha256', (string)($_SERVER['HTTP_USER_AGENT'] ?? '')), 0, 16);
}

function security_signing_key() {
  static $key = null;
  if ($key !== null) return $key;
  $env = getenv('APP_SECURITY_TOKEN_SECRET');
  if (is_string($env) && trim($env) !== '') {
    $key = hash('sha256', $env, true);
    return $key;
  }
  $cfg = app_config();
  $openai = (string)($cfg['openai']['api_key'] ?? '');
  $dbPass = (string)($cfg['db']['pass'] ?? '');
  $seed = $openai !== '' ? $openai : ($dbPass !== '' ? $dbPass : __FILE__);
  $key = hash('sha256', $seed . '|platehk|vision-session', true);
  return $key;
}

function base64url_encode($raw) {
  return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function base64url_decode($encoded) {
  $pad = strlen($encoded) % 4;
  if ($pad > 0) $encoded .= str_repeat('=', 4 - $pad);
  return base64_decode(strtr($encoded, '-_', '+/'), true);
}

function vision_session_cookie_name() {
  return '__Host-platehk_vision';
}

function vision_session_ttl_seconds() {
  return 300;
}

function set_strict_session_cookie($name, $value, $expiresAt) {
  setcookie($name, $value, [
    'expires' => (int)$expiresAt,
    'path' => '/',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Strict',
  ]);
}

function issue_vision_session_token() {
  $exp = time() + vision_session_ttl_seconds();
  $nonce = bin2hex(random_bytes(16));
  $payload = [
    'n' => $nonce,
    'exp' => $exp,
    'fp' => client_fingerprint(),
    'ua' => user_agent_fingerprint(),
  ];
  $payloadRaw = json_encode($payload, JSON_UNESCAPED_SLASHES);
  $payloadEnc = base64url_encode($payloadRaw);
  $sig = hash_hmac('sha256', $payloadEnc, security_signing_key(), true);
  $token = $payloadEnc . '.' . base64url_encode($sig);
  set_strict_session_cookie(vision_session_cookie_name(), $nonce, $exp);
  return [
    'token' => $token,
    'expires_at' => $exp,
  ];
}

function require_vision_session_token($token) {
  $token = trim((string)$token);
  if ($token === '' || strpos($token, '.') === false) {
    security_log_event('vision_token_missing');
    json_response(['error' => 'vision_token_required'], 403);
  }
  [$payloadEnc, $sigEnc] = explode('.', $token, 2);
  $expectedSig = base64url_encode(hash_hmac('sha256', $payloadEnc, security_signing_key(), true));
  if (!hash_equals($expectedSig, $sigEnc)) {
    security_log_event('vision_token_invalid', ['reason' => 'bad_signature']);
    json_response(['error' => 'vision_token_invalid'], 403);
  }
  $payloadRaw = base64url_decode($payloadEnc);
  $payload = json_decode((string)$payloadRaw, true);
  if (!is_array($payload)) {
    security_log_event('vision_token_invalid', ['reason' => 'bad_payload']);
    json_response(['error' => 'vision_token_invalid'], 403);
  }
  $exp = (int)($payload['exp'] ?? 0);
  $nonce = (string)($payload['n'] ?? '');
  if ($exp < time()) {
    security_log_event('vision_token_expired');
    json_response(['error' => 'vision_token_expired'], 403);
  }
  if ($nonce === '') {
    security_log_event('vision_token_invalid', ['reason' => 'missing_nonce']);
    json_response(['error' => 'vision_token_invalid'], 403);
  }
  $cookieNonce = (string)($_COOKIE[vision_session_cookie_name()] ?? '');
  if ($cookieNonce === '' || !hash_equals($cookieNonce, $nonce)) {
    security_log_event('vision_token_invalid', ['reason' => 'cookie_mismatch']);
    json_response(['error' => 'vision_token_invalid'], 403);
  }
  if (!hash_equals((string)($payload['fp'] ?? ''), client_fingerprint())) {
    security_log_event('vision_token_invalid', ['reason' => 'ip_mismatch']);
    json_response(['error' => 'vision_token_invalid'], 403);
  }
  if (!hash_equals((string)($payload['ua'] ?? ''), user_agent_fingerprint())) {
    security_log_event('vision_token_invalid', ['reason' => 'ua_mismatch']);
    json_response(['error' => 'vision_token_invalid'], 403);
  }
  return $payload;
}

function security_log_event($eventType, array $context = []) {
  $path = security_log_path();
  $sanitized = [];
  foreach ($context as $key => $value) {
    if ($value === null) continue;
    if (is_bool($value) || is_int($value) || is_float($value)) {
      $sanitized[$key] = $value;
      continue;
    }
    $sanitized[$key] = truncate_security_value($value);
  }
  $entry = [
    'ts' => gmdate('c'),
    'event' => (string)$eventType,
    'client' => client_fingerprint(),
    'path' => truncate_security_value($_SERVER['REQUEST_URI'] ?? ''),
    'method' => truncate_security_value($_SERVER['REQUEST_METHOD'] ?? ''),
    'context' => $sanitized,
  ];
  @file_put_contents($path, json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL, FILE_APPEND | LOCK_EX);
}

function enforce_json_content_type() {
  $contentType = (string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '');
  if ($contentType === '') return unsupported_media_type();
  $mediaType = strtolower(trim(explode(';', $contentType, 2)[0]));
  if ($mediaType !== 'application/json') unsupported_media_type();
}

function request_origin_parts() {
  $https = (string)($_SERVER['HTTPS'] ?? '');
  $scheme = (!empty($https) && strtolower($https) !== 'off') ? 'https' : 'http';
  $host = (string)($_SERVER['HTTP_HOST'] ?? '');
  return [
    'scheme' => strtolower($scheme),
    'host' => strtolower((string)parse_url($scheme . '://' . $host, PHP_URL_HOST)),
    'port' => parse_url($scheme . '://' . $host, PHP_URL_PORT),
  ];
}

function url_matches_request_origin($url) {
  $url = trim((string)$url);
  if ($url === '') return false;
  $current = request_origin_parts();
  $scheme = strtolower((string)(parse_url($url, PHP_URL_SCHEME) ?? ''));
  $host = strtolower((string)(parse_url($url, PHP_URL_HOST) ?? ''));
  $port = parse_url($url, PHP_URL_PORT);
  return $scheme === $current['scheme']
    && $host === $current['host']
    && (($port ?: null) === ($current['port'] ?: null));
}

function enforce_same_origin_request() {
  $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
  $secFetchSite = strtolower(trim((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')));
  if ($origin !== '' && !url_matches_request_origin($origin)) {
    security_log_event('invalid_origin', ['origin' => $origin]);
    json_response(['error' => 'invalid_origin'], 403);
  }
  $referer = trim((string)($_SERVER['HTTP_REFERER'] ?? ''));
  if ($origin === '' && $referer !== '' && !url_matches_request_origin($referer)) {
    security_log_event('invalid_origin', ['referer' => $referer]);
    json_response(['error' => 'invalid_origin'], 403);
  }
  if ($origin === '' && $referer === '') {
    security_log_event('missing_origin', ['sec_fetch_site' => $secFetchSite ?: 'absent']);
    json_response(['error' => 'origin_required'], 403);
  }
  if ($secFetchSite !== '' && !in_array($secFetchSite, ['same-origin', 'same-site', 'none'], true)) {
    security_log_event('invalid_fetch_site', ['sec_fetch_site' => $secFetchSite]);
    json_response(['error' => 'invalid_origin'], 403);
  }
}

function read_json_request_body($maxBytes = 7340032) {
  $len = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
  if ($len > 0 && $len > $maxBytes) bad_request('payload_too_large');
  $raw = file_get_contents('php://input');
  if ($raw === false || $raw === '') bad_request('empty_body');
  if (strlen($raw) > $maxBytes) bad_request('payload_too_large');
  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) bad_request('invalid_json');
  return $decoded;
}

function client_ip() {
  foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $key) {
    $raw = trim((string)($_SERVER[$key] ?? ''));
    if ($raw === '') continue;
    if ($key === 'HTTP_X_FORWARDED_FOR') {
      $raw = trim(explode(',', $raw, 2)[0]);
    }
    if (filter_var($raw, FILTER_VALIDATE_IP)) return $raw;
  }
  return 'unknown';
}

function rate_limit_dir() {
  $dir = cache_dir() . DIRECTORY_SEPARATOR . 'ratelimit';
  if (!is_dir($dir)) @mkdir($dir, 0775, true);
  return $dir;
}

function rate_limit_path($bucket) {
  return rate_limit_dir() . DIRECTORY_SEPARATOR . hash('sha256', $bucket) . '.json';
}

function enforce_rate_limit($bucket, $limit, $windowSeconds) {
  $path = rate_limit_path($bucket);
  $dir = dirname($path);
  if (!is_dir($dir) && !@mkdir($dir, 0775, true)) return;
  $now = time();
  $windowStart = $now - max(1, (int)$windowSeconds);
  $fh = @fopen($path, 'c+');
  if ($fh === false) return;

  $retryAfter = null;
  try {
    if (!@flock($fh, LOCK_EX)) return;
    $raw = stream_get_contents($fh);
    $timestamps = json_decode($raw ?: '[]', true);
    if (!is_array($timestamps)) $timestamps = [];
    $timestamps = array_values(array_filter($timestamps, fn($ts) => is_int($ts) && $ts >= $windowStart));
    if (count($timestamps) >= $limit) {
      $retryAfter = max(1, ((int)$timestamps[0] + (int)$windowSeconds) - $now);
    } else {
      $timestamps[] = $now;
      rewind($fh);
      ftruncate($fh, 0);
      fwrite($fh, json_encode($timestamps, JSON_UNESCAPED_SLASHES));
    }
  } finally {
    @flock($fh, LOCK_UN);
    fclose($fh);
  }
  if ($retryAfter !== null) {
    security_log_event('rate_limited', [
      'bucket' => $bucket,
      'limit' => (int)$limit,
      'window_seconds' => (int)$windowSeconds,
      'retry_after' => (int)$retryAfter,
    ]);
    too_many_requests('rate_limited', $retryAfter);
  }
}

function enforce_public_read_rate_limit($endpointKey, $minuteLimit, $hourLimit) {
  $ip = client_ip();
  enforce_rate_limit("public-read:{$endpointKey}:minute:{$ip}", max(1, (int)$minuteLimit), 60);
  enforce_rate_limit("public-read:{$endpointKey}:hour:{$ip}", max(1, (int)$hourLimit), 3600);
}

function enforce_public_page_size($endpointKey, $pageSize, $maxPageSize = 200) {
  $pageSize = (int)$pageSize;
  $maxPageSize = max(1, (int)$maxPageSize);
  if ($pageSize < 1 || $pageSize > $maxPageSize) {
    reject_public_read_abuse('public_read_invalid_paging', 'invalid_paging', [
      'endpoint' => (string)$endpointKey,
      'page_size' => $pageSize,
      'max_page_size' => $maxPageSize,
    ]);
  }
}

function short_query_search_page_cap($dataset, $normalizedQuery) {
  $qLen = strlen((string)$normalizedQuery);
  if ($qLen <= 1) return $dataset === 'all' ? 3 : 5;
  if ($qLen === 2) return $dataset === 'all' ? 5 : 10;
  return null;
}

function enforce_public_search_window($dataset, $normalizedQuery, $page, $pageSize) {
  $page = (int)$page;
  $maxPage = short_query_search_page_cap($dataset, $normalizedQuery);
  if ($page < 1) {
    reject_public_read_abuse('public_read_invalid_paging', 'invalid_paging', [
      'endpoint' => 'search',
      'dataset' => (string)$dataset,
      'page' => $page,
      'page_size' => (int)$pageSize,
    ]);
  }
  if ($maxPage !== null && $page > $maxPage) {
    reject_public_read_abuse('search_window_exceeded', 'query_window_exceeded', [
      'dataset' => (string)$dataset,
      'query_length' => strlen((string)$normalizedQuery),
      'page' => $page,
      'max_page' => $maxPage,
      'page_size' => (int)$pageSize,
    ]);
  }
}

function http_post_json($url, $payload, $headers = [], $timeoutSeconds = 20) {
  $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($body === false) {
    throw new RuntimeException('json_encode_failed');
  }
  if (!function_exists('curl_init')) {
    throw new RuntimeException('curl_not_available');
  }
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => array_merge([
      'Content-Type: application/json',
      'Content-Length: ' . strlen($body),
    ], $headers),
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_TIMEOUT => max(5, (int)$timeoutSeconds),
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_MAXREDIRS => 0,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
  ]);
  if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTPS')) {
    curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
  }
  if (defined('CURLOPT_REDIR_PROTOCOLS') && defined('CURLPROTO_HTTPS')) {
    curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTPS);
  }
  $respBody = curl_exec($ch);
  $curlErr = curl_error($ch);
  $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  curl_close($ch);
  if ($respBody === false) {
    throw new RuntimeException($curlErr !== '' ? $curlErr : 'http_request_failed');
  }
  $decoded = json_decode($respBody, true);
  return [
    'status' => $status,
    'body' => $respBody,
    'json' => is_array($decoded) ? $decoded : null,
  ];
}

function normalize_query($q) {
  $q = strtoupper(trim((string)$q));
  $q = preg_replace('/\s+/', '', $q);
  $q = preg_replace('/[^A-Z0-9]+/', '', $q);
  // PVRM: users may type I/O; treat as 1/0 for searching
  $q = str_replace('I', '1', $q);
  $q = str_replace('O', '0', $q);
  $q = str_replace('Q', '', $q);
  return $q;
}

function normalize_plate_for_search($s) {
  $s = strtoupper((string)$s);
  $s = preg_replace('/\s+/', '', $s);
  $s = preg_replace('/[^A-Z0-9]+/', '', $s);
  return $s;
}

function db() {
  static $pdo = null;
  if ($pdo) return $pdo;
  $cfg = require __DIR__ . '/config.php';
  $db = $cfg['db'];
  $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['host'], $db['port'], $db['name']);
  $pdo = new PDO($dsn, $db['user'], $db['pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  return $pdo;
}

function cache_dir() {
  static $dir = null;
  if ($dir !== null) return $dir;
  $dir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'platehk-api-cache';
  if (!is_dir($dir)) @mkdir($dir, 0775, true);
  return $dir;
}

function cache_path_for_key($key) {
  return cache_dir() . DIRECTORY_SEPARATOR . hash('sha256', $key) . '.json';
}

function cache_get_json($key, $ttlSeconds) {
  $path = cache_path_for_key($key);
  if (!is_file($path)) return null;
  $mtime = @filemtime($path);
  if (!$mtime || (time() - $mtime) > $ttlSeconds) return null;
  $body = @file_get_contents($path);
  return $body === false ? null : $body;
}

function cache_put_json($key, $json) {
  $dir = cache_dir();
  if (!is_dir($dir) && !@mkdir($dir, 0775, true)) return;
  $path = cache_path_for_key($key);
  $tmp = $path . '.tmp-' . getmypid() . '-' . mt_rand(1000, 9999);
  if (@file_put_contents($tmp, $json, LOCK_EX) === false) return;
  @rename($tmp, $path);
}

function valid_dataset($ds, $allow_all = false) {
  if ($allow_all && $ds === 'all') return true;
  return in_array($ds, ['pvrm', 'tvrm_physical', 'tvrm_eauction', 'tvrm_legacy'], true);
}

function sql_plate_norm_expr($alias = 'r') {
  return "CASE WHEN COALESCE({$alias}.double_norm, '') <> '' THEN {$alias}.double_norm ELSE {$alias}.single_norm END";
}

function sql_amount_match_clause($leftAlias, $rightAlias) {
  return "(
    {$leftAlias}.amount_hkd = {$rightAlias}.amount_hkd
    OR ({$leftAlias}.amount_hkd IS NULL AND {$rightAlias}.amount_hkd IS NULL)
  )";
}

function sql_dataset_clause($dataset, $alias = 'r') {
  if ($dataset === 'all') {
    return ["{$alias}.dataset IN ('pvrm','tvrm_physical','tvrm_eauction','tvrm_legacy')", []];
  }
  return ["{$alias}.dataset = :dataset", [':dataset' => $dataset]];
}

function sql_legacy_dedupe_clause($dataset, $alias = 'r') {
  if ($dataset !== 'all') return ['', []];
  return [
    " AND NOT (
      {$alias}.dataset = 'tvrm_legacy'
      AND (
        (
          {$alias}.single_norm <> ''
          AND EXISTS (
            SELECT 1
            FROM vrm_result r2
            WHERE r2.dataset IN ('tvrm_physical', 'tvrm_eauction')
              AND r2.single_norm = {$alias}.single_norm
              AND " . sql_amount_match_clause('r2', $alias) . "
          )
        )
        OR (
          COALESCE({$alias}.double_norm, '') <> ''
          AND EXISTS (
            SELECT 1
            FROM vrm_result r3
            WHERE r3.dataset IN ('tvrm_physical', 'tvrm_eauction')
              AND r3.double_norm = {$alias}.double_norm
              AND " . sql_amount_match_clause('r3', $alias) . "
          )
        )
      )
    )",
    [],
  ];
}
