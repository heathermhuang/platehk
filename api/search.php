<?php
require __DIR__ . '/lib.php';
enforce_get_request();

$dataset = isset($_GET['dataset']) ? (string)$_GET['dataset'] : '';
$q = isset($_GET['q']) ? (string)$_GET['q'] : '';
$issue = isset($_GET['issue']) ? (string)$_GET['issue'] : '';
$sort = isset($_GET['sort']) ? (string)$_GET['sort'] : 'amount_desc';
$mode = isset($_GET['mode']) ? (string)$_GET['mode'] : '';
$page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
$page_size = isset($_GET['page_size']) ? (int)$_GET['page_size'] : 200;

if (!valid_dataset($dataset, true)) bad_request('invalid dataset');
$qn = normalize_query($q);
if ($qn === '') bad_request('q is required');
if (strlen($qn) > 16) bad_request('q too long');
if ($page < 1) bad_request('invalid paging');
enforce_public_page_size('search', $page_size, 200);
enforce_public_search_window($dataset, $qn, $page, $page_size);
if ($issue !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $issue)) bad_request('invalid issue');
if (!in_array($sort, ['amount_desc','amount_asc','date_desc','plate_asc'], true)) bad_request('invalid sort');
if (!in_array($mode, ['', 'exact_prefix'], true)) bad_request('invalid mode');

$minuteLimit = $dataset === 'all' ? 180 : 300;
$hourLimit = $dataset === 'all' ? 1800 : 3600;
if (strlen($qn) <= 2) {
  $minuteLimit = min($minuteLimit, $dataset === 'all' ? 120 : 220);
  $hourLimit = min($hourLimit, $dataset === 'all' ? 1200 : 2600);
}
if ($issue !== '') {
  $minuteLimit += 60;
  $hourLimit += 600;
}
enforce_public_read_rate_limit('search:' . $dataset, $minuteLimit, $hourLimit);

$cacheTtl = 0;
if ($issue === '') {
  if ($dataset === 'all') $cacheTtl = 600;
  else if (strlen($qn) <= 2) $cacheTtl = 300;
}
$cacheKey = $cacheTtl > 0
  ? 'search:' . hash('sha256', json_encode([$dataset, $qn, $issue, $sort, $page, $page_size]))
  : '';
if ($cacheTtl > 0) {
  $cached = cache_get_json($cacheKey, $cacheTtl);
  if ($cached !== null) json_response_raw($cached);
}

function plate_norm_for_row($row) {
  $single = isset($row['single_line']) ? (string)$row['single_line'] : '';
  if ($single !== '') return normalize_plate_for_search($single);
  $double = $row['double_line'] ?? null;
  if (is_array($double)) return normalize_plate_for_search(implode('', $double));
  return '';
}

function duplicate_key_for_row($row) {
  $amount = array_key_exists('amount_hkd', $row) && $row['amount_hkd'] !== null ? (int)$row['amount_hkd'] : null;
  if (($row['date_precision'] ?? '') === 'day' && !empty($row['auction_date'])) {
    return json_encode([plate_norm_for_row($row), $amount, (string)$row['auction_date']]);
  }
  return json_encode([plate_norm_for_row($row), $amount]);
}

function load_overlap_key_lookup() {
  static $lookup = null;
  if ($lookup !== null) return $lookup;
  $lookup = ['coarse' => [], 'exact' => []];
  $path = dirname(__DIR__) . '/data/all.tvrm_legacy_overlap.json';
  if (!is_file($path)) return $lookup;
  $raw = @file_get_contents($path);
  if ($raw === false) return $lookup;
  $decoded = json_decode($raw, true);
  foreach (($decoded['keys'] ?? []) as $key) $lookup['coarse'][$key] = true;
  foreach (($decoded['exact_keys'] ?? []) as $key) $lookup['exact'][$key] = true;
  return $lookup;
}

function dedupe_all_index_rows($rows) {
  $lookup = load_overlap_key_lookup();
  if (!$lookup) return $rows;
  $out = [];
  foreach ($rows as $row) {
    if (($row['dataset_key'] ?? '') !== 'tvrm_legacy') {
      $out[] = $row;
      continue;
    }
    $bucket = (($row['date_precision'] ?? '') === 'day') ? 'exact' : 'coarse';
    if (!isset($lookup[$bucket][duplicate_key_for_row($row)])) $out[] = $row;
  }
  return $out;
}

function compare_search_rows($a, $b, $sort, $q) {
  $aNorm = plate_norm_for_row($a);
  $bNorm = plate_norm_for_row($b);
  $aRank = $aNorm === $q ? 0 : (strpos($aNorm, $q) === 0 ? 1 : 2);
  $bRank = $bNorm === $q ? 0 : (strpos($bNorm, $q) === 0 ? 1 : 2);
  if ($aRank !== $bRank) return $aRank <=> $bRank;
  if ($sort === 'amount_desc' || $sort === 'amount_asc') {
    $aAmount = array_key_exists('amount_hkd', $a) && $a['amount_hkd'] !== null ? (int)$a['amount_hkd'] : -1;
    $bAmount = array_key_exists('amount_hkd', $b) && $b['amount_hkd'] !== null ? (int)$b['amount_hkd'] : -1;
    if ($aAmount !== $bAmount) return $sort === 'amount_desc' ? ($bAmount <=> $aAmount) : ($aAmount <=> $bAmount);
  } else if ($sort === 'plate_asc') {
    $cmp = strcmp((string)($a['single_line'] ?? ''), (string)($b['single_line'] ?? ''));
    if ($cmp !== 0) return $cmp;
  }
  $aDate = (string)($a['auction_date'] ?? '');
  $bDate = (string)($b['auction_date'] ?? '');
  if ($aDate !== $bDate) return strcmp($bDate, $aDate);
  return strcmp((string)($a['single_line'] ?? ''), (string)($b['single_line'] ?? ''));
}

function load_all_prefix1_rows($q, $sort) {
  $path = dirname(__DIR__) . '/data/all.prefix1.top200.json';
  if (!is_file($path)) return null;
  $raw = @file_get_contents($path);
  if ($raw === false) return null;
  $decoded = json_decode($raw, true);
  if (!is_array($decoded) || !isset($decoded[$q]) || !is_array($decoded[$q])) return ['total' => 0, 'rows' => []];
  $bucket = $decoded[$q];
  $rows = is_array($bucket['rows'] ?? null) ? $bucket['rows'] : [];
  $rows = dedupe_all_index_rows($rows);
  usort($rows, fn($a, $b) => compare_search_rows($a, $b, $sort, $q));
  return [
    'total' => count($rows),
    'rows' => $rows,
  ];
}

function load_hot_search_cache_payload($q, $page, $page_size, $sort) {
  if ($sort !== 'amount_desc') return null;
  $path = dirname(__DIR__) . '/data/hot_search/all_amount_desc/' . rawurlencode($q) . '.json';
  if (!is_file($path)) return null;
  $raw = @file_get_contents($path);
  if ($raw === false) return null;
  $decoded = json_decode($raw, true);
  if (!is_array($decoded) || !is_array($decoded['rows'] ?? null)) return null;
  $rows = $decoded['rows'];
  $total = (int)($decoded['total'] ?? count($rows));
  $cachedRows = (int)($decoded['cached_rows'] ?? count($rows));
  $offset = ($page - 1) * $page_size;
  if ($offset >= $cachedRows && $total > $cachedRows) return null;
  return [
    'dataset' => 'all',
    'q' => $q,
    'issue' => null,
    'sort' => $sort,
    'page' => $page,
    'page_size' => $page_size,
    'total' => $total,
    'rows' => array_slice($rows, $offset, $page_size),
  ];
}

function load_all_index_rows($q, $sort) {
  if (strlen($q) !== 1) return null;
  return load_all_prefix1_rows($q, $sort);
}

if ($dataset === 'all' && $issue === '') {
  $hotPayload = load_hot_search_cache_payload($qn, $page, $page_size, $sort);
  if (is_array($hotPayload)) {
    $json = json_encode($hotPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($cacheTtl > 0) cache_put_json($cacheKey, $json);
    json_response_raw($json);
  }
  $index = load_all_index_rows($qn, $sort);
  if (is_array($index)) {
    $rows = is_array($index['rows'] ?? null) ? $index['rows'] : [];
    $total = isset($index['total']) ? (int)$index['total'] : count($rows);
    $offset = ($page - 1) * $page_size;
    $payload = [
      'dataset' => $dataset,
      'q' => $qn,
      'issue' => null,
      'sort' => $sort,
      'page' => $page,
      'page_size' => $page_size,
      'total' => $total,
      'rows' => array_slice($rows, $offset, $page_size),
    ];
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($cacheTtl > 0) cache_put_json($cacheKey, $json);
    json_response_raw($json);
  }
}

$pdo = db();
[ $datasetClause, $datasetParams ] = sql_dataset_clause($dataset, 'r');
[ $dedupeClause, $dedupeParams ] = sql_legacy_dedupe_clause($dataset, 'r');
$issueClause = $issue !== '' ? ' AND r.auction_date = :issue' : '';
$params = array_merge($datasetParams, $dedupeParams, [
  ':q_exact' => $qn,
  ':q_prefix' => $qn . '%',
  ':q_contains' => '%' . $qn . '%',
]);
if ($issue !== '') $params[':issue'] = $issue;

function build_search_branch($datasetClause, $issueClause, $dedupeClause, $matchCondition, $rank) {
  return "
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
      r.pdf_url,
      {$rank} AS match_rank
    FROM vrm_result r
    LEFT JOIN vrm_auction a
      ON a.dataset = r.dataset
     AND a.auction_date = r.auction_date
    WHERE {$datasetClause}
      {$issueClause}
      AND {$matchCondition}
      {$dedupeClause}
  ";
}

if (strlen($qn) <= 2 || $mode === 'exact_prefix') {
  $querySql = "
    SELECT
      ranked.id,
      ranked.dataset,
      ranked.auction_date,
      ranked.auction_date_label,
      ranked.is_lny,
      ranked.single_line,
      ranked.double_top,
      ranked.double_bottom,
      ranked.amount_hkd,
      ranked.pdf_url,
      MIN(ranked.match_rank) AS match_rank
    FROM (
      " . build_search_branch($datasetClause, $issueClause, $dedupeClause, "r.single_norm = :q_exact", 0) . "
      UNION ALL
      " . build_search_branch($datasetClause, $issueClause, $dedupeClause, "COALESCE(r.double_norm, '') = :q_exact", 0) . "
      UNION ALL
      " . build_search_branch($datasetClause, $issueClause, $dedupeClause, "r.single_norm LIKE :q_prefix AND r.single_norm <> :q_exact", 1) . "
      UNION ALL
      " . build_search_branch($datasetClause, $issueClause, $dedupeClause, "COALESCE(r.double_norm, '') LIKE :q_prefix AND COALESCE(r.double_norm, '') <> :q_exact", 1) . "
    ) AS ranked
    GROUP BY
      ranked.id,
      ranked.dataset,
      ranked.auction_date,
      ranked.auction_date_label,
      ranked.is_lny,
      ranked.single_line,
      ranked.double_top,
      ranked.double_bottom,
      ranked.amount_hkd,
      ranked.pdf_url
  ";
} else {
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
      r.pdf_url,
      CASE
        WHEN (" . sql_plate_norm_expr('r') . " = :q_exact) THEN 0
        WHEN (" . sql_plate_norm_expr('r') . " LIKE :q_prefix) THEN 1
        ELSE 2
      END AS match_rank
    FROM vrm_result r
    LEFT JOIN vrm_auction a
      ON a.dataset = r.dataset
     AND a.auction_date = r.auction_date
    WHERE {$datasetClause}
      {$issueClause}
      AND (
        r.single_norm LIKE :q_contains
        OR COALESCE(r.double_norm, '') LIKE :q_contains
      )
      {$dedupeClause}
  ";
}

if ($sort === 'amount_desc') {
  $order = 'ORDER BY match_rank ASC, (amount_hkd IS NULL) ASC, amount_hkd DESC, auction_date DESC, id ASC';
} else if ($sort === 'amount_asc') {
  $order = 'ORDER BY match_rank ASC, (amount_hkd IS NULL) ASC, amount_hkd ASC, auction_date DESC, id ASC';
} else if ($sort === 'plate_asc') {
  $order = 'ORDER BY match_rank ASC, single_line ASC, auction_date DESC, id ASC';
} else { // date_desc
  $order = 'ORDER BY match_rank ASC, auction_date DESC, id ASC';
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
  'q' => $qn,
  'issue' => $issue === '' ? null : $issue,
  'mode' => $mode === '' ? null : $mode,
  'sort' => $sort,
  'page' => $page,
  'page_size' => $page_size,
  'total' => $total,
  'rows' => $out,
];
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($cacheTtl > 0) cache_put_json($cacheKey, $json);
json_response_raw($json);
