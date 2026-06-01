import express from "express";
import cors from "cors";
import "dotenv/config";

const {
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  PORT = 4000,
  WEB_ORIGIN = "http://localhost:5173",
} = process.env;

const REDIRECT_URI = `http://localhost:${PORT}/auth/strava/callback`;

if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
  console.warn(
    "\n⚠️  STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET not set. Copy server/.env.example to server/.env and fill them in.\n"
  );
}

const app = express();
app.use(cors({ origin: WEB_ORIGIN, credentials: true }));

// ---------------------------------------------------------------------------
// In-memory single-user token store. Fine for a local POC — restarting the
// server means reconnecting Strava. Revisit before this is ever multi-user.
// ---------------------------------------------------------------------------
let session = null; // { access_token, refresh_token, expires_at, athlete }

async function strava(path, token, params = {}) {
  const url = new URL(`https://www.strava.com/api/v3${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

// Ensure we have a non-expired access token, refreshing if needed.
async function freshToken() {
  if (!session) throw new Error("not_connected");
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at > now + 60) return session.access_token;

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: session.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${await res.text()}`);
  const data = await res.json();
  session = { ...session, ...data };
  return session.access_token;
}

// --- OAuth: kick off -------------------------------------------------------
app.get("/auth/strava", (_req, res) => {
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", STRAVA_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "activity:read_all");
  res.redirect(url.toString());
});

// --- OAuth: callback (exchange code for tokens) ----------------------------
app.get("/auth/strava/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect(`${WEB_ORIGIN}/?error=${encodeURIComponent(String(error || "no_code"))}`);
  }
  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) throw new Error(await tokenRes.text());
    const data = await tokenRes.json();
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      athlete: data.athlete
        ? { id: data.athlete.id, firstname: data.athlete.firstname, lastname: data.athlete.lastname }
        : null,
    };
    res.redirect(`${WEB_ORIGIN}/?connected=1`);
  } catch (e) {
    console.error("OAuth exchange failed:", e.message);
    res.redirect(`${WEB_ORIGIN}/?error=oauth_failed`);
  }
});

// --- API: connection status ------------------------------------------------
app.get("/api/status", (_req, res) => {
  res.json({ connected: !!session, athlete: session?.athlete ?? null });
});

// --- API: recent activities ------------------------------------------------
app.get("/api/activities", async (_req, res) => {
  try {
    const token = await freshToken();
    const acts = await strava("/athlete/activities", token, { per_page: 30 });
    res.json(
      acts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        sport_type: a.sport_type,
        start_date: a.start_date, // UTC ISO — the anchor for video sync
        start_date_local: a.start_date_local,
        elapsed_time: a.elapsed_time,
        moving_time: a.moving_time,
        distance: a.distance,
        total_elevation_gain: a.total_elevation_gain,
        has_gps: !!a.start_latlng?.length,
      }))
    );
  } catch (e) {
    res.status(e.message === "not_connected" ? 401 : 500).json({ error: e.message });
  }
});

// --- API: GPS + telemetry streams for one activity -------------------------
app.get("/api/activities/:id/streams", async (req, res) => {
  try {
    const token = await freshToken();
    const streams = await strava(`/activities/${req.params.id}/streams`, token, {
      keys: "latlng,time,altitude,velocity_smooth",
      key_by_type: "true",
    });
    res.json(streams);
  } catch (e) {
    res.status(e.message === "not_connected" ? 401 : 500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Handlebars backend on http://localhost:${PORT}`);
  console.log(`OAuth redirect URI: ${REDIRECT_URI}`);
});
