<?php
/**
 * Public, read-only menu endpoint for the Xserver deployment.
 *
 * The microCMS credential is never exposed to the browser. Store it at:
 * <domain-directory>/_private/tsubakitei-microcms.key
 * and deploy this script at:
 * <domain-directory>/public_html/api/menu.php
 *
 * This endpoint only returns a strict public-field allowlist. It falls back
 * to a local published snapshot when microCMS is temporarily unavailable.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=60');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo '{"error":"Method Not Allowed"}';
    exit;
}

$store = (string) ($_GET['store'] ?? 'tsubakitei');
$sources = [
    'tsubakitei' => ['endpoint' => 'tsubakitei-menus', 'snapshot' => 'tsubakitei-menus-public.json'],
    'deli' => ['endpoint' => 'deli-menus', 'snapshot' => 'deli-menus-public.json'],
];
if (!isset($sources[$store])) {
    http_response_code(400);
    echo '{"error":"Invalid store"}';
    exit;
}

$publicRoot = dirname(__DIR__);
$privateDir = dirname(__DIR__, 2) . '/_private';
$keyFile = $privateDir . '/tsubakitei-microcms.key';
$cacheFile = $privateDir . '/tsubakitei-menu-' . $store . '.json';
$snapshotFile = $publicRoot . '/data/' . $sources[$store]['snapshot'];
$cacheSeconds = 300;
$fields = [
    'id', 'visible', 'menuId', 'menuIdSingle', 'menuIdSelect', 'menu',
    'menuLabel', 'menuDescription', 'sectionName', 'sectionNameSingle',
    'sectionNameSelect', 'sectionDescription', 'subsectionName',
    'store', 'storeSingle', 'storeSelect', 'name', 'description',
    'price', 'priceText', 'sortOrder', 'image', 'imagePath',
    'takeoutAvailable'
];

function jsonIfValid(string $filename): ?string
{
    if (!is_readable($filename)) {
        return null;
    }
    $body = file_get_contents($filename);
    if ($body === false) {
        return null;
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded) || !isset($decoded['contents'])
        || !is_array($decoded['contents'])) {
        return null;
    }
    return $body;
}

function returnJson(string $body): void
{
    echo $body;
    exit;
}

function cmsPage(string $endpoint, string $apiKey, int $offset): array
{
    $url = 'https://tsubakitei-hp.microcms.io/api/v1/' . $endpoint
        . '?' . http_build_query([
            'limit' => 100,
            'offset' => $offset,
            'orders' => 'sortOrder,createdAt',
        ]);
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('Unable to open CMS connection');
    }

    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['X-MICROCMS-API-KEY: ' . $apiKey],
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    $body = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    curl_close($handle);

    if ($body === false || $status !== 200) {
        throw new RuntimeException('CMS GET failed');
    }
    $data = json_decode((string) $body, true);
    if (!is_array($data) || !isset($data['contents']) || !is_array($data['contents'])
        || !isset($data['totalCount']) || !is_int($data['totalCount'])
        || !isset($data['offset']) || $data['offset'] !== $offset) {
        throw new RuntimeException('Invalid CMS response');
    }
    return $data;
}

function cleanRow(array $row, array $fields): ?array
{
    if (($row['visible'] ?? true) === false) {
        return null;
    }
    $allowed = array_intersect_key($row, array_fill_keys($fields, true));
    if (isset($allowed['image']) && is_array($allowed['image'])) {
        $allowed['image'] = ['url' => (string) ($allowed['image']['url'] ?? '')];
    }
    return $allowed;
}

// No network request while cached data is fresh.
$cache = jsonIfValid($cacheFile);
$mtime = @filemtime($cacheFile);
if ($cache !== null && $mtime !== false && (time() - $mtime) < $cacheSeconds) {
    returnJson($cache);
}

try {
    $key = is_readable($keyFile) ? trim((string) file_get_contents($keyFile)) : '';
    if (strlen($key) < 20 || !function_exists('curl_init')) {
        throw new RuntimeException('Private CMS configuration unavailable');
    }

    $rows = [];
    $ids = [];
    $expected = null;
    $endpoint = $sources[$store]['endpoint'];

    while ($expected === null || count($rows) < $expected) {
        $page = cmsPage($endpoint, $key, count($rows));
        $expected = $page['totalCount'];
        if (!$page['contents'] && count($rows) < $expected) {
            throw new RuntimeException('Incomplete CMS pagination');
        }
        foreach ($page['contents'] as $row) {
            if (!is_array($row) || !isset($row['id']) || isset($ids[$row['id']])) {
                throw new RuntimeException('Invalid or duplicate CMS ID');
            }
            $ids[$row['id']] = true;
            $rows[] = $row;
        }
        if (count($rows) > 500) {
            throw new RuntimeException('CMS response exceeded safety limit');
        }
    }

    if ($expected !== count($rows) || ($store === 'tsubakitei' && $expected < 100)) {
        throw new RuntimeException('Unexpected CMS record count');
    }

    $public = [];
    foreach ($rows as $row) {
        $clean = cleanRow($row, $fields);
        if ($clean !== null) {
            $public[] = $clean;
        }
    }
    $encoded = json_encode(['contents' => $public], JSON_UNESCAPED_UNICODE
        | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    if (is_dir($privateDir) && is_writable($privateDir)) {
        $tmp = tempnam($privateDir, 'cms-');
        if ($tmp !== false) {
            file_put_contents($tmp, $encoded, LOCK_EX);
            chmod($tmp, 0600);
            rename($tmp, $cacheFile);
        }
    }
    returnJson($encoded);
} catch (Throwable $error) {
    // Do not expose credentials, server paths, CMS errors, or private data.
    // A failure must never take down menu display if a snapshot is available.
    if ($cache !== null) {
        returnJson($cache);
    }
    $snapshot = jsonIfValid($snapshotFile);
    if ($snapshot !== null) {
        returnJson($snapshot);
    }
    http_response_code(503);
    echo '{"error":"Menu temporarily unavailable"}';
    exit;
}
