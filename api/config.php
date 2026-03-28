<?php
// Keep credentials out of git if possible. On shared hosting, this file will live on the server.
// You can also set these via environment variables if your host supports it.

// Prefer a non-versioned local config file on shared hosting:
// - create api/config.local.php (see api/config.local.php.example)
// - keep credentials out of git
$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
  /** @noinspection PhpIncludeInspection */
  return require $local;
}

function cfg($key, $default = null) {
  $v = getenv($key);
  if ($v !== false && $v !== '') return $v;
  return $default;
}

return [
  'db' => [
    'host' => cfg('MYSQL_HOST', 'localhost'),
    'port' => (int)cfg('MYSQL_PORT', '3306'),
    'name' => cfg('MYSQL_DATABASE', 'vrm'),
    'user' => cfg('MYSQL_USER', ''),
    'pass' => cfg('MYSQL_PASSWORD', ''),
  ],
  'openai' => [
    'api_key' => cfg('OPENAI_API_KEY', ''),
    'vision_model' => cfg('OPENAI_VISION_MODEL', 'gpt-4.1-mini'),
    'base_url' => rtrim((string)cfg('OPENAI_BASE_URL', 'https://api.openai.com/v1'), '/'),
    'timeout_seconds' => (int)cfg('OPENAI_TIMEOUT_SECONDS', '20'),
  ],
];
