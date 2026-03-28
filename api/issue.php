<?php
require __DIR__ . '/lib.php';
enforce_get_request();

$dataset = isset($_GET['dataset']) ? (string)$_GET['dataset'] : '';
$auction_date = isset($_GET['auction_date']) ? (string)$_GET['auction_date'] : '';
if (!valid_dataset($dataset)) bad_request('invalid dataset');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $auction_date)) bad_request('invalid auction_date');

enforce_public_read_rate_limit('issue:' . $dataset, 240, 3200);

$cacheKey = 'issue:' . hash('sha256', json_encode([$dataset, $auction_date]));
$cached = cache_get_json($cacheKey, 300);
if ($cached !== null) json_response_raw($cached);

$pdo = db();

$stmt = $pdo->prepare('
  SELECT auction_date, auction_date_label, is_lny, pdf_url, total_sale_proceeds_hkd
  FROM vrm_auction
  WHERE dataset = ? AND auction_date = ?
');
$stmt->execute([$dataset, $auction_date]);
$meta = $stmt->fetch();
if (!$meta) not_found('issue not found');

$stmt2 = $pdo->prepare('
  SELECT auction_date, single_line, double_top, double_bottom, amount_hkd, pdf_url
  FROM vrm_result
  WHERE dataset = ? AND auction_date = ?
  ORDER BY (amount_hkd IS NULL) ASC, amount_hkd DESC, single_line ASC, id ASC
');
$stmt2->execute([$dataset, $auction_date]);
$rows = $stmt2->fetchAll();

$out = [];
foreach ($rows as $r) {
  $dl = null;
  if ($r['double_top'] !== null || $r['double_bottom'] !== null) {
    $dl = [ $r['double_top'] ?? '', $r['double_bottom'] ?? '' ];
  }
  $out[] = [
    'dataset_key' => $dataset,
    'auction_date' => (string)$r['auction_date'],
    'auction_date_label' => isset($meta['auction_date_label']) ? (string)$meta['auction_date_label'] : null,
    'is_lny' => isset($meta['is_lny']) ? ((int)$meta['is_lny'] === 1) : false,
    'single_line' => $r['single_line'],
    'double_line' => $dl,
    'amount_hkd' => $r['amount_hkd'] === null ? null : (int)$r['amount_hkd'],
    'pdf_url' => $r['pdf_url'],
  ];
}

$meta['auction_date'] = (string)$meta['auction_date'];
$meta['is_lny'] = (int)$meta['is_lny'] === 1;
if ($meta['total_sale_proceeds_hkd'] !== null) $meta['total_sale_proceeds_hkd'] = (int)$meta['total_sale_proceeds_hkd'];

$payload = ['dataset' => $dataset, 'issue' => $meta, 'rows' => $out];
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
cache_put_json($cacheKey, $json);
json_response_raw($json);
