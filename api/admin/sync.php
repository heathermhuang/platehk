<?php
// CLI-only sync: reads local static JSON under api/v1/* and upserts into MySQL.
// Intended for DreamHost shared-host cron.

if (php_sapi_name() !== 'cli') {
  http_response_code(404);
  echo "Not Found\n";
  exit;
}

require dirname(__DIR__) . '/lib.php';

function logln($s) {
  fwrite(STDOUT, $s . "\n");
}

set_time_limit(0);

function read_json_file($path) {
  $raw = @file_get_contents($path);
  if ($raw === false) return null;
  $data = json_decode($raw, true);
  return $data;
}

function pick_issue_pdf_url($meta) {
  if (isset($meta['pdf_url']) && $meta['pdf_url']) return (string)$meta['pdf_url'];
  if (isset($meta['pdf_urls']) && is_array($meta['pdf_urls']) && count($meta['pdf_urls']) > 0) return (string)$meta['pdf_urls'][0];
  return null;
}

$full = in_array('--full', $argv, true);
$datasets = ['pvrm', 'tvrm_physical', 'tvrm_eauction', 'tvrm_legacy'];
$base = dirname(__DIR__) . '/v1';

$pdo = db();

function upsert_rows_batch($pdo, $ds, $d, $rows, $pdf_url) {
  if (!is_array($rows) || count($rows) === 0) return 0;
  $cols = "(dataset,auction_date,single_line,double_top,double_bottom,amount_hkd,pdf_url,pdf_url_hash,single_norm,double_norm)";
  $base = "INSERT INTO vrm_result $cols VALUES ";
  $suffix = " ON DUPLICATE KEY UPDATE double_top=VALUES(double_top),double_bottom=VALUES(double_bottom),amount_hkd=VALUES(amount_hkd),pdf_url=VALUES(pdf_url),pdf_url_hash=VALUES(pdf_url_hash),single_norm=VALUES(single_norm),double_norm=VALUES(double_norm)";

  $CHUNK = 400; // keep SQL size bounded for shared hosting
  $done = 0;
  for ($i = 0; $i < count($rows); $i += $CHUNK) {
    $part = array_slice($rows, $i, $CHUNK);
    $placeholders = [];
    $args = [];
    foreach ($part as $r) {
      $single = isset($r['single_line']) ? (string)$r['single_line'] : '';
      if ($single === '') continue;
      $dl = isset($r['double_line']) ? $r['double_line'] : null;
      $top = $bottom = null;
      if (is_array($dl) && count($dl) > 0) {
        $top = (string)($dl[0] ?? '');
        $bottom = (string)($dl[1] ?? '');
      }
      $amount = isset($r['amount_hkd']) ? $r['amount_hkd'] : null;
      $row_pdf = (isset($r['pdf_url']) && $r['pdf_url']) ? (string)$r['pdf_url'] : $pdf_url;
      $single_norm = normalize_plate_for_search($single);
      $double_norm = null;
      if ($top !== null || $bottom !== null) $double_norm = normalize_plate_for_search(($top ?? '') . ($bottom ?? ''));

      $placeholders[] = "(?,?,?,?,?,?,?,?,?,?)";
      $hash = $row_pdf ? hex2bin(sha1($row_pdf)) : null;
      array_push($args, $ds, $d, $single, $top, $bottom, $amount, $row_pdf, $hash, $single_norm, $double_norm);
      $done += 1;
    }
    if (count($placeholders) === 0) continue;
    $sql = $base . implode(",", $placeholders) . $suffix;
    $stmt = $pdo->prepare($sql);
    $stmt->execute($args);
  }
  return $done;
}

function delete_stale_issues($pdo, $ds, $stale_dates) {
  if (!is_array($stale_dates) || count($stale_dates) === 0) return 0;
  $CHUNK = 200;
  $deleted = 0;
  for ($i = 0; $i < count($stale_dates); $i += $CHUNK) {
    $part = array_values(array_slice($stale_dates, $i, $CHUNK));
    if (count($part) === 0) continue;
    $in = implode(',', array_fill(0, count($part), '?'));
    $args = array_merge([$ds], $part);

    $stmt_rows = $pdo->prepare("DELETE FROM vrm_result WHERE dataset=? AND auction_date IN ($in)");
    $stmt_rows->execute($args);

    $stmt_auctions = $pdo->prepare("DELETE FROM vrm_auction WHERE dataset=? AND auction_date IN ($in)");
    $stmt_auctions->execute($args);

    $deleted += count($part);
  }
  return $deleted;
}

foreach ($datasets as $ds) {
  $manifest_path = $base . '/' . $ds . '/issues.manifest.json';
  $auctions_path = $base . '/' . $ds . '/auctions.json';

  $manifest = read_json_file($manifest_path);
  $auctions = read_json_file($auctions_path);
  if (!$manifest || !$auctions) {
    logln("[sync] WARN dataset=$ds missing manifest/auctions under $base");
    continue;
  }

  // map date -> auction meta
  $meta_by_date = [];
  foreach ($auctions as $a) {
    if (!isset($a['auction_date'])) continue;
    $meta_by_date[(string)$a['auction_date']] = $a;
  }

  // which issues already exist
  $stmt = $pdo->prepare('SELECT auction_date FROM vrm_auction WHERE dataset=?');
  $stmt->execute([$ds]);
  $existing = [];
  foreach ($stmt->fetchAll() as $r) $existing[(string)$r['auction_date']] = true;

  $issues = isset($manifest['issues']) && is_array($manifest['issues']) ? $manifest['issues'] : [];
  $current_dates = [];
  foreach ($issues as $it) {
    $d = isset($it['auction_date']) ? (string)$it['auction_date'] : '';
    if ($d === '') continue;
    $current_dates[$d] = true;
  }

  if ($full) {
    $stale = [];
    foreach ($existing as $d => $_) {
      if (!isset($current_dates[$d])) $stale[] = $d;
    }
    if (count($stale) > 0) {
      $deleted = delete_stale_issues($pdo, $ds, $stale);
      logln("[sync] dataset=$ds pruned_stale_issues=$deleted");
    }
  }

  $todo = [];
  foreach ($issues as $it) {
    $d = isset($it['auction_date']) ? (string)$it['auction_date'] : '';
    if ($d === '') continue;
    if ($full || !isset($existing[$d])) $todo[] = $d;
  }

  logln("[sync] dataset=$ds total_issues=" . count($issues) . " to_sync=" . count($todo) . ($full ? " (full)" : ""));

  $ins_auction = $pdo->prepare('
    INSERT INTO vrm_auction (dataset,auction_date,auction_date_label,session_label,is_lny,pdf_url,total_sale_proceeds_hkd,error_text)
    VALUES (?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      auction_date_label=VALUES(auction_date_label),
      session_label=VALUES(session_label),
      is_lny=VALUES(is_lny),
      pdf_url=VALUES(pdf_url),
      total_sale_proceeds_hkd=VALUES(total_sale_proceeds_hkd),
      error_text=VALUES(error_text)
  ');

  $synced = 0;
  foreach ($todo as $d) {
    $meta = isset($meta_by_date[$d]) ? $meta_by_date[$d] : [];
    $issue_label = isset($meta['auction_date_label']) ? (string)$meta['auction_date_label'] : '';
    $session = isset($meta['session']) ? (string)$meta['session'] : null;
    $is_lny = isset($meta['is_lny']) && $meta['is_lny'] ? 1 : 0;
    $pdf_url = pick_issue_pdf_url($meta);
    $total = isset($meta['total_sale_proceeds_hkd']) ? $meta['total_sale_proceeds_hkd'] : null;
    $err = isset($meta['error']) ? (string)$meta['error'] : null;

    $ins_auction->execute([$ds, $d, $issue_label ?: null, $session ?: null, $is_lny, $pdf_url, $total, $err]);

    $shard_path = $base . '/' . $ds . '/issues/' . $d . '.json';
    $rows = read_json_file($shard_path);
    if (!is_array($rows)) {
      logln("[sync] WARN dataset=$ds issue=$d missing shard $shard_path");
      continue;
    }

    // upsert rows (batched, for speed on shared hosting)
    try {
      $pdo->beginTransaction();
      $cnt = upsert_rows_batch($pdo, $ds, $d, $rows, $pdf_url);
      $pdo->commit();
    } catch (Exception $e) {
      try { $pdo->rollBack(); } catch (Exception $e2) {}
      logln("[sync] ERROR dataset=$ds issue=$d " . $e->getMessage());
      continue;
    }
    $synced += 1;
    if ($synced % 10 === 0) logln("[sync] dataset=$ds progress $synced/" . count($todo));
  }

  logln("[sync] dataset=$ds done synced_issues=$synced");
}

logln("[sync] OK");
