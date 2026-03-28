<?php
require __DIR__ . '/lib.php';
enforce_get_request();
enforce_public_read_rate_limit('health', 30, 300);

$cached = cache_get_json('health:db-ok', 5);
if ($cached !== null) json_response_raw($cached);

$pdo = db();
$stmt = $pdo->query('SELECT 1 AS ok');
$row = $stmt->fetch();
$ok = (int)($row['ok'] ?? 0) === 1;

$json = json_encode(['ok' => $ok], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
cache_put_json('health:db-ok', $json);
json_response_raw($json, $ok ? 200 : 503);
