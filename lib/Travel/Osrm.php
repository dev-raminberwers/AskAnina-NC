<?php

declare(strict_types=1);

namespace OCA\PersonalAssistant\Travel;

/**
 * Real driving/cycling/walking time via the public OSRM demo server — same
 * pattern used platform-wide (see the LIFE tool backend's Osrm.php): no
 * self-host, no API key, 8s timeout, haversine*1.25 fallback on failure so a
 * transient OSRM outage never blocks the timeline from rendering.
 */
class Osrm {
    private const BASE_URL = 'https://router.project-osrm.org';

    /** @return array{distance_km: float, duration_min: float, estimated: bool} */
    public function route(float $fromLat, float $fromLon, float $toLat, float $toLon, string $profile = 'driving'): array {
        $osrmProfile = in_array($profile, ['driving', 'cycling', 'walking'], true) ? $profile : 'driving';
        $url = sprintf(
            '%s/route/v1/%s/%F,%F;%F,%F?overview=false&steps=false',
            self::BASE_URL,
            $osrmProfile,
            $fromLon,
            $fromLat,
            $toLon,
            $toLat
        );

        $ch = curl_init($url);
        if ($ch !== false) {
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                // Without a User-Agent, the OSRM demo server's nginx returns
                // a bare 403 (PHP's curl sends none by default, unlike the
                // curl CLI) — this silently triggered the haversine fallback
                // below on every single request, never the real route.
                CURLOPT_USERAGENT => 'NextcloudPersonalAssistant/0.1',
            ]);
            $body = curl_exec($ch);
            $errno = curl_errno($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($errno === 0 && $body !== false && $status < 400) {
                $data = json_decode((string)$body, true);
                $route = is_array($data) ? ($data['routes'][0] ?? null) : null;
                if (is_array($route) && isset($route['distance'], $route['duration'])) {
                    return [
                        'distance_km' => round(((float)$route['distance']) / 1000, 2),
                        'duration_min' => round(((float)$route['duration']) / 60),
                        'estimated' => false,
                    ];
                }
            } else {
                error_log("PersonalAssistant Osrm: route request failed (status=$status, errno=$errno) — falling back to haversine estimate");
            }
        }

        $km = self::haversineKm($fromLat, $fromLon, $toLat, $toLon) * 1.25;
        return [
            'distance_km' => round($km, 2),
            'duration_min' => round($km / 40 * 60), // ~40km/h assumed average, only used when OSRM itself is unreachable
            'estimated' => true,
        ];
    }

    private static function haversineKm(float $lat1, float $lon1, float $lat2, float $lon2): float {
        $earthRadiusKm = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        return $earthRadiusKm * $c;
    }
}
