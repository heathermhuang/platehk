<?php
require __DIR__ . '/lib.php';
enforce_get_request();

$dataset = isset($_GET['dataset']) ? (string)$_GET['dataset'] : '';
if (!valid_dataset($dataset)) bad_request('invalid dataset');

enforce_public_read_rate_limit('issues:' . $dataset, 180, 2400);

$cacheKey = 'issues:' . $dataset;
$cached = cache_get_json($cacheKey, 300);
if ($cached !== null) json_response_raw($cached);

$pdo = db();
$stmt = $pdo->prepare('
  SELECT auction_date, auction_date_label, is_lny, pdf_url, total_sale_proceeds_hkd
  FROM vrm_auction
  WHERE dataset = ?
  ORDER BY auction_date DESC
');
$stmt->execute([$dataset]);
$rows = $stmt->fetchAll();

$stmt2 = $pdo->prepare('
  SELECT COUNT(*) AS total_rows, MAX(amount_hkd) AS top_amount_hkd
  FROM vrm_result
  WHERE dataset = ?
');
$stmt2->execute([$dataset]);
$summary = $stmt2->fetch() ?: ['total_rows' => 0, 'top_amount_hkd' => null];

// Ensure ISO string dates.
foreach ($rows as &$r) {
  if (isset($r['auction_date'])) $r['auction_date'] = (string)$r['auction_date'];
  $r['is_lny'] = (int)$r['is_lny'] === 1;
}

$payload = [
  'dataset' => $dataset,
  'total_rows' => (int)($summary['total_rows'] ?? 0),
  'issue_count' => count($rows),
  'top_amount_hkd' => $summary['top_amount_hkd'] === null ? null : (int)$summary['top_amount_hkd'],
  'issues' => $rows,
];
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
cache_put_json($cacheKey, $json);
json_response_raw($json);
