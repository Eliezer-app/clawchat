import { Router } from 'express';

const WMO: Record<number, [string, string]> = {
  0: ['☀️','Clear'], 1: ['🌤️','Mostly clear'], 2: ['⛅','Partly cloudy'], 3: ['☁️','Overcast'],
  45: ['🌫️','Fog'], 48: ['🌫️','Rime fog'],
  51: ['🌦️','Light drizzle'], 53: ['🌦️','Drizzle'], 55: ['🌦️','Heavy drizzle'],
  61: ['🌧️','Light rain'], 63: ['🌧️','Rain'], 65: ['🌧️','Heavy rain'],
  71: ['❄️','Light snow'], 73: ['❄️','Snow'], 75: ['❄️','Heavy snow'],
  80: ['🌧️','Light showers'], 81: ['🌧️','Showers'], 82: ['🌧️','Heavy showers'],
  95: ['⛈️','Thunderstorm'], 96: ['⛈️','Hail storm'], 99: ['⛈️','Heavy hail storm'],
};

export default (router: Router) => {
  router.get('/weather', async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      res.status(400).json({ error: 'lat and lon required' });
      return;
    }
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
      const r = await fetch(url);
      const data = await r.json();
      const cw = data.current_weather;
      const [icon, description] = WMO[cw.weathercode] || ['🌡️', 'Unknown'];
      res.json({ temp: Math.round(cw.temperature), description, icon });
    } catch {
      res.status(502).json({ error: 'Weather API failed' });
    }
  });
};
