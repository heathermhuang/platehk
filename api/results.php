<?php
require __DIR__ . '/lib.php';
enforce_get_request();

$dataset = isset($_GET['dataset']) ? (string)$_GET['dataset'] : '';
$sort = isset($_GET['sort']) ? (string)$_GET['sort'] : 'date_desc';
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$page_size = isset($_GET['page_size']) ? (int)$_GET['page_size'] : 200;

if (!valid_dataset($dataset, true)) bad_request('invalid dataset');
if ($page < 1) bad_request('invalid paging');
enforce_public_page_size('results', $page_size, 200);
if (!in_array($sort, ['amount_desc','amount_asc','date_desc','plate_asc'], true)) bad_request('invalid sort');

enforce_public_read_rate_limit(
  'results:' . $dataset,
  $dataset === 'all' ? 90 : 180,
  $dataset === 'all' ? 900 : 1800
);

$cacheKey = 'results:' . hash('sha256', json_encode([$dataset, $sort, $page, $page_size]));
$cached = cache_get_json($cacheKey, 180);
if ($cached !== null) json_response_raw($cached);

$pdo = db();
[ $datasetClause, $datasetParams ] = sql_dataset_clause($dataset, 'r');
[ $dedupeClause, $dedupeParams ] = sql_legacy_dedupe_clause($dataset, 'r');
$params = array_merge($datasetParams, $dedupeParams);

$querySql = "
  SELECT
    r.id,
    r.dataset,
    r.auction_date,
    a.auction_date_label,
    a.is_lny,
    r.single_line,
    r.double_top,
    r.double_bottom,
    r.amount_hkd,
    r.pdf_url
  FROM vrm_result r
  LEFT JOIN vrm_auction a
    ON a.dataset = r.dataset
   AND a.auction_date = r.auction_date
  WHERE {$datasetClause}
    {$dedupeClause}
";

if ($sort === 'amount_desc') {
  $order = 'ORDER BY (amount_hkd IS NULL) ASC, amount_hkd DESC, auction_date DESC, id ASC';
} else if ($sort === 'amount_asc') {
  $order = 'ORDER BY (amount_hkd IS NULL) ASC, amount_hkd ASC, auction_date DESC, id ASC';
} else if ($sort === 'plate_asc') {
  $order = 'ORDER BY single_line ASC, auction_date DESC, id ASC';
} else {
  $order = 'ORDER BY auction_date DESC, id ASC';
}

$stmt = $pdo->prepare("SELECT COUNT(*) AS c FROM ($querySql) AS ranked");
$stmt->execute($params);
$total = (int)$stmt->fetch()['c'];

$offset = ($page - 1) * $page_size;
$stmt2 = $pdo->prepare("
  SELECT dataset, auction_date, auction_date_label, is_lny, single_line, double_top, double_bottom, amount_hkd, pdf_url
  FROM ($querySql) AS ranked
  $order
  LIMIT :limit OFFSET :offset
");
foreach ($params as $k => $v) $stmt2->bindValue($k, $v);
$stmt2->bindValue(':limit', $page_size, PDO::PARAM_INT);
$stmt2->bindValue(':offset', $offset, PDO::PARAM_INT);
$stmt2->execute();
$rows = $stmt2->fetchAll();

$out = [];
foreach ($rows as $r) {
  $dl = null;
  if ($r['double_top'] !== null || $r['double_bottom'] !== null) {
    $dl = [ $r['double_top'] ?? '', $r['double_bottom'] ?? '' ];
  }
  $out[] = [
    'dataset_key' => (string)$r['dataset'],
    'auction_date' => (string)$r['auction_date'],
    'auction_date_label' => $r['auction_date_label'] === null ? null : (string)$r['auction_date_label'],
    'is_lny' => isset($r['is_lny']) ? ((int)$r['is_lny'] === 1) : false,
    'single_line' => $r['single_line'],
    'double_line' => $dl,
    'amount_hkd' => $r['amount_hkd'] === null ? null : (int)$r['amount_hkd'],
    'pdf_url' => $r['pdf_url'],
  ];
}

$payload = [
  'dataset' => $dataset,
  'sort' => $sort,
  'page' => $page,
  'page_size' => $page_size,
  'total' => $total,
  'rows' => $out,
];
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
cache_put_json($cacheKey, $json);
json_response_raw($json);
