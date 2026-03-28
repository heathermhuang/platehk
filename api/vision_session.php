<?php
require __DIR__ . '/lib.php';
enforce_get_request();
enforce_same_origin_request();
enforce_rate_limit('vision_session:minute:' . client_ip(), 90, 60);
enforce_rate_limit('vision_session:hour:' . client_ip(), 1200, 3600);

$issued = issue_vision_session_token();
json_response([
  'token' => $issued['token'],
  'expires_at' => (int)$issued['expires_at'],
  'expires_in' => max(1, (int)$issued['expires_at'] - time()),
]);
