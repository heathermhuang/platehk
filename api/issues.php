<?php
require __DIR__ . '/lib.php';
enforce_get_request();

$dataset = isset($_GET['dataset']) ? (string)$_GET['dataset'] : '';
if (!valid_dataset($dataset, true)) bad_request('invalid dataset');

enforce_public_read_rate_limit('issues:' . $dataset, 180, 2400);

$cacheKey = 'issues:' . $dataset;
$cached = cache_get_json($cacheKey, 300);
if ($cached !== null) json_response_raw($cached);

$pdo = db();
if ($dataset === 'all') {
  $orderExpr = dataset_order_sql('dataset');
  $stmt = $pdo->query("
    SELECT
      dataset AS dataset_key,
      CONCAT(dataset, '::', auction_date) AS auction_key,
      auction_date,
      auction_date_label,
      is_lny,
      pdf_url,
      total_sale_proceeds_hkd
    FROM vrm_auction
    WHERE dataset IN ('pvrm','tvrm_physical','tvrm_eauction','tvrm_legacy')
    ORDER BY auction_date DESC, {$orderExpr} ASC
  ");
  $rows = $stmt->fetchAll();
} else {
  $stmt = $pdo->prepare('
    SELECT auction_date, auction_date_label, is_lny, pdf_url, total_sale_proceeds_hkd
    FROM vrm_auction
    WHERE dataset = ?
    ORDER BY auction_date DESC
  ');
  $stmt->execute([$dataset]);
  $rows = $stmt->fetchAll();
}

[ $datasetClause, $datasetParams ] = sql_dataset_clause($dataset, 'r');
[ $dedupeClause, $dedupeParams ] = sql_legacy_dedupe_clause($dataset, 'r');
$stmt2 = $pdo->prepare("
  SELECT COUNT(*) AS total_rows, MAX(amount_hkd) AS top_amount_hkd
  FROM vrm_result r
  WHERE {$datasetClause}
    {$dedupeClause}
");
$stmt2->execute(array_merge($datasetParams, $dedupeParams));
$summary = $stmt2->fetch() ?: ['total_rows' => 0, 'top_amount_hkd' => null];

// Ensure ISO string dates.
foreach ($rows as &$r) {
  if (isset($r['auction_date'])) $r['auction_date'] = (string)$r['auction_date'];
  $r['is_lny'] = (int)$r['is_lny'] === 1;
  if ($dataset === 'all') {
    $r['dataset_key'] = (string)($r['dataset_key'] ?? '');
    $r['auction_key'] = (string)($r['auction_key'] ?? '');
  }
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
