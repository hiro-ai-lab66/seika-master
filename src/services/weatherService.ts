const WEATHER_CODE_LABELS: Record<number, string> = {
    0: '晴れ',
    1: '晴れ',
    2: '曇り',
    3: '曇り',
    45: '曇り',
    48: '曇り',
    51: '雨',
    53: '雨',
    55: '雨',
    56: '雨',
    57: '雨',
    61: '雨',
    63: '雨',
    65: '雨',
    66: '雨',
    67: '雨',
    71: '雪',
    73: '雪',
    75: '雪',
    77: '雪',
    80: '雨',
    81: '雨',
    82: '雨',
    85: '雪',
    86: '雪',
    95: '雨',
    96: '雨',
    99: '雨'
};

export type DailyWeatherSnapshot = {
    weather12: string;
    weather17: string;
    highTemp: number | null;
    lowTemp: number | null;
};

const OPEN_METEO_FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive';

const parseCoordinate = (value: string | undefined) => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const getConfiguredCoordinates = () => {
    const latitude = parseCoordinate((import.meta as any).env?.VITE_STORE_LAT);
    const longitude = parseCoordinate((import.meta as any).env?.VITE_STORE_LON);
    if (latitude === null || longitude === null) {
        return null;
    }

    return { latitude, longitude };
};

export const resolveWeatherCoordinates = async (): Promise<{ latitude: number; longitude: number }> => {
    const configured = getConfiguredCoordinates();
    if (configured) {
        return configured;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) {
        throw new Error('店舗座標が未設定で、位置情報も取得できません');
    }

    return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
            },
            () => reject(new Error('位置情報の取得に失敗しました')),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60 * 60 * 1000 }
        );
    });
};

const buildWeatherApiUrl = (targetDate: string, latitude: number, longitude: number) => {
    const today = new Date().toISOString().slice(0, 10);
    const baseUrl = targetDate <= today ? OPEN_METEO_ARCHIVE_API : OPEN_METEO_FORECAST_API;
    const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        timezone: 'Asia/Tokyo',
        start_date: targetDate,
        end_date: targetDate,
        hourly: 'weather_code',
        daily: 'temperature_2m_max,temperature_2m_min'
    });
    return `${baseUrl}?${params.toString()}`;
};

const normalizeWeatherLabel = (code: number | null | undefined) => {
    if (code === null || code === undefined || Number.isNaN(code)) return '';
    return WEATHER_CODE_LABELS[Math.round(code)] || '曇り';
};

const findHourlyWeatherCode = (times: string[] = [], weatherCodes: number[] = [], targetHour: number) => {
    const index = times.findIndex((time) => {
        const hourText = time.slice(11, 13);
        return Number(hourText) === targetHour;
    });
    if (index < 0) return null;
    return weatherCodes[index];
};

export const deriveTempBandFromHigh = (highTemp: number | null) => {
    if (highTemp === null || Number.isNaN(highTemp)) return '';
    if (highTemp < 10) return '寒い';
    if (highTemp < 20) return '涼しい';
    if (highTemp < 28) return '暖かい';
    return '暑い';
};

export const deriveOverallWeather = (weather12: string, weather17: string) => {
    const values = [weather12, weather17].filter(Boolean);
    if (values.includes('雪')) return '雪';
    if (values.includes('雨')) return '雨';
    if (values.includes('曇り')) return '曇り';
    if (values.includes('晴れ')) return '晴れ';
    return '';
};

export const fetchDailyWeatherSnapshot = async (targetDate: string): Promise<DailyWeatherSnapshot> => {
    const { latitude, longitude } = await resolveWeatherCoordinates();
    const response = await fetch(buildWeatherApiUrl(targetDate, latitude, longitude));
    if (!response.ok) {
        throw new Error(`天気取得に失敗しました (${response.status})`);
    }

    const data = await response.json();
    const weather12Code = findHourlyWeatherCode(data?.hourly?.time, data?.hourly?.weather_code, 12);
    const weather17Code = findHourlyWeatherCode(data?.hourly?.time, data?.hourly?.weather_code, 17);
    const highTempRaw = data?.daily?.temperature_2m_max?.[0];
    const lowTempRaw = data?.daily?.temperature_2m_min?.[0];

    return {
        weather12: normalizeWeatherLabel(weather12Code),
        weather17: normalizeWeatherLabel(weather17Code),
        highTemp: Number.isFinite(highTempRaw) ? Math.round(highTempRaw) : null,
        lowTemp: Number.isFinite(lowTempRaw) ? Math.round(lowTempRaw) : null
    };
};
