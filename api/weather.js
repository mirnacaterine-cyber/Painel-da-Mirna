const DEFAULT_CITY = "Marechal Cândido Rondon, Paraná";

function numberParam(value, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Painel-da-Mirna/4.0" },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`Serviço de clima respondeu ${response.status}.`);
  return response.json();
}

async function resolveLocation(requestUrl) {
  const latitude = numberParam(requestUrl.searchParams.get("lat"), -90, 90);
  const longitude = numberParam(requestUrl.searchParams.get("lon"), -180, 180);
  const requestedCity = String(requestUrl.searchParams.get("city") || DEFAULT_CITY).trim().slice(0, 140);

  if (latitude !== null && longitude !== null) {
    return {
      latitude,
      longitude,
      label: String(requestUrl.searchParams.get("label") || "Localização atual").trim().slice(0, 140)
    };
  }

  const geocoding = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocoding.searchParams.set("name", requestedCity);
  geocoding.searchParams.set("count", "1");
  geocoding.searchParams.set("language", "pt");
  geocoding.searchParams.set("format", "json");
  const data = await fetchJson(geocoding);
  const place = data.results?.[0];
  if (!place) throw Object.assign(new Error("Cidade não encontrada para a previsão."), { status: 404 });

  return {
    latitude: place.latitude,
    longitude: place.longitude,
    label: [place.name, place.admin1].filter(Boolean).join(", ") || requestedCity
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const location = await resolveLocation(url);
    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(location.latitude));
    forecastUrl.searchParams.set("longitude", String(location.longitude));
    forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,is_day");
    forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset");
    forecastUrl.searchParams.set("timezone", "auto");
    forecastUrl.searchParams.set("forecast_days", "2");
    const forecast = await fetchJson(forecastUrl);

    return Response.json(
      {
        ok: true,
        location: {
          label: location.label,
          latitude: location.latitude,
          longitude: location.longitude,
          timezone: forecast.timezone || "America/Sao_Paulo"
        },
        current: {
          temperature: Math.round(forecast.current?.temperature_2m ?? 0),
          feelsLike: Math.round(forecast.current?.apparent_temperature ?? 0),
          code: Number(forecast.current?.weather_code ?? -1),
          isDay: Boolean(forecast.current?.is_day)
        },
        today: {
          max: Math.round(forecast.daily?.temperature_2m_max?.[0] ?? 0),
          min: Math.round(forecast.daily?.temperature_2m_min?.[0] ?? 0),
          rainChance: Math.round(forecast.daily?.precipitation_probability_max?.[0] ?? 0),
          sunrise: forecast.daily?.sunrise?.[0] || null,
          sunset: forecast.daily?.sunset?.[0] || null,
          code: Number(forecast.daily?.weather_code?.[0] ?? -1)
        },
        fetchedAt: new Date().toISOString()
      },
      {
        headers: {
          "Cache-Control": "public, max-age=600, stale-while-revalidate=1800",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } catch (error) {
    return Response.json(
      { ok: false, message: error?.message || "Não foi possível atualizar o clima." },
      { status: Number(error?.status) || 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
