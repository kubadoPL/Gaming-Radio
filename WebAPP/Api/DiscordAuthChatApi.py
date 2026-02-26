import os
import sys
import secrets
from datetime import datetime, timedelta

# Set the script and parent directory
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.abspath(os.path.join(script_dir, ".."))
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

from flask import Flask, request, jsonify, redirect, Blueprint
from flask_cors import CORS
import requests as http_requests

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))

# CORS configuration
CORS(
    app,
    resources={
        r"/*": {
            "origins": "*",
            "allow_headers": ["Authorization", "Content-Type"],
            "methods": ["GET", "POST", "OPTIONS"],
        }
    },
)

chat_api = Blueprint("chat_api", __name__)

# Discord OAuth2 Configuration
DISCORD_CLIENT_ID = os.environ.get("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.environ.get("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = os.environ.get(
    "DISCORD_REDIRECT_URI",
    "https://bot-launcher-discord-017f7d5f49d9.herokuapp.com/DiscordAuthChatApi/discord/callback",
)
DISCORD_API_URL = "https://discord.com/api/v10"

# In-memory storage
user_sessions = {}
chat_messages = {"RADIOGAMING": [], "RADIOGAMINGDARK": [], "RADIOGAMINGMARONFM": []}
user_profiles = {}  # user_id -> profile_data (safe subset)
user_last_station = {}  # user_id -> station_key
online_users = {}  # station_key -> {user_id -> last_activity_timestamp}
MAX_MESSAGES_PER_CHANNEL = 100
message_cooldowns = {}
MESSAGE_COOLDOWN_SECONDS = 2
ONLINE_THRESHOLD_SECONDS = 60


def update_user_activity(user_id, station_key):
    if station_key not in online_users:
        online_users[station_key] = {}
    online_users[station_key][user_id] = datetime.utcnow()
    user_last_station[user_id] = station_key


def get_online_users_list(station_key):
    if station_key not in online_users:
        return []
    now = datetime.utcnow()
    # Clean up and get active user IDs
    active_uids = [
        uid
        for uid, ts in online_users[station_key].items()
        if (now - ts).total_seconds() < ONLINE_THRESHOLD_SECONDS
    ]
    # Update the internal dict to clean up expired ones
    online_users[station_key] = {
        uid: online_users[station_key][uid] for uid in active_uids
    }

    # Station display names
    station_names = {
        "RADIOGAMING": "Radio GAMING",
        "RADIOGAMINGDARK": "Radio GAMING DARK",
        "RADIOGAMINGMARONFM": "Radio GAMING MARON FM",
    }

    # Return profiles with their current station
    profiles = []
    for uid in active_uids:
        if uid in user_profiles:
            p = user_profiles[uid].copy()
            p["current_station"] = station_names.get(
                user_last_station.get(uid), "Unknown Station"
            )
            profiles.append(p)
    return profiles


def get_online_count(station_key):
    return len(get_online_users_list(station_key))


@chat_api.route("/")
def home():
    return jsonify({"service": "Discord Auth & Chat API", "status": "online"})


@chat_api.route("/discord/login")
def discord_login():
    if not DISCORD_CLIENT_ID:
        return jsonify({"error": "Discord OAuth not configured"}), 500
    state = secrets.token_urlsafe(32)
    oauth_url = (
        f"https://discord.com/api/oauth2/authorize"
        f"?client_id={DISCORD_CLIENT_ID}"
        f"&redirect_uri={DISCORD_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=identify%20guilds"
        f"&state={state}"
    )
    return jsonify({"oauth_url": oauth_url})


@chat_api.route("/discord/callback")
def discord_callback():
    code = request.args.get("code")
    frontend_url = os.environ.get(
        "FRONTEND_URL", "http://127.0.0.1:5500/WebAPP/index.html"
    )
    if not code:
        return redirect(f"{frontend_url}?auth_error=no_code")

    try:
        token_response = http_requests.post(
            f"{DISCORD_API_URL}/oauth2/token",
            data={
                "client_id": DISCORD_CLIENT_ID,
                "client_secret": DISCORD_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": DISCORD_REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token_json = token_response.json()
        if "access_token" not in token_json:
            return redirect(f"{frontend_url}?auth_error=token_exchange_failed")

        user_response = http_requests.get(
            f"{DISCORD_API_URL}/users/@me",
            headers={"Authorization": f"Bearer {token_json['access_token']}"},
        )
        user_data = user_response.json()

        session_token = secrets.token_urlsafe(64)
        avatar = user_data.get("avatar")
        avatar_url = (
            f"https://cdn.discordapp.com/avatars/{user_data['id']}/{avatar}.png"
            if avatar
            else f"https://cdn.discordapp.com/embed/avatars/{int(user_data.get('discriminator', 0)) % 5}.png"
        )

        profile = {
            "id": user_data["id"],
            "username": user_data["username"],
            "global_name": user_data.get("global_name", user_data["username"]),
            "avatar_url": avatar_url,
            "banner_url": (
                f"https://cdn.discordapp.com/banners/{user_data['id']}/{user_data['banner']}.png?size=600"
                if user_data.get("banner")
                else None
            ),
            "accent_color": user_data.get("accent_color"),
        }

        # Store safe profile for common use
        user_profiles[user_data["id"]] = profile

        user_sessions[session_token] = {
            **profile,
            "discord_access_token": token_json["access_token"],
            "expires_at": (datetime.utcnow() + timedelta(days=7)).isoformat(),
        }
        return redirect(f"{frontend_url}?auth_token={session_token}")
    except Exception as e:
        return redirect(f"{frontend_url}?auth_error=server_error")


@chat_api.route("/discord/user")
def get_user():
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401

    token = auth_header.split(" ")[1]
    if token not in user_sessions:
        return jsonify({"error": "Invalid session"}), 401

    return jsonify({"authenticated": True, "user": user_sessions[token]})


@chat_api.route("/discord/check-guild/<guild_id>")
def check_guild(guild_id):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401

    token = auth_header.split(" ")[1]
    if token not in user_sessions:
        return jsonify({"error": "Invalid session"}), 401

    session = user_sessions[token]

    # Use session cache if available and not expired (5 min cache)
    now = datetime.utcnow()
    guilds_cache = session.get("guilds_cache")
    if guilds_cache and guilds_cache.get("expires_at") > now:
        guilds = guilds_cache.get("guilds", [])
    else:
        discord_token = session.get("discord_access_token")
        if not discord_token:
            return jsonify({"in_guild": False, "error": "No Discord token"}), 200

        try:
            guilds_response = http_requests.get(
                f"{DISCORD_API_URL}/users/@me/guilds?limit=200",
                headers={"Authorization": f"Bearer {discord_token}"},
                timeout=10,
            )

            if guilds_response.status_code == 429:
                return (
                    jsonify({"in_guild": False, "error": "Rate limited by Discord"}),
                    200,
                )

            if guilds_response.status_code != 200:
                return (
                    jsonify(
                        {
                            "in_guild": False,
                            "error": f"Discord API error: {guilds_response.status_code}",
                        }
                    ),
                    200,
                )

            guilds = guilds_response.json()
            if not isinstance(guilds, list):
                return (
                    jsonify(
                        {
                            "in_guild": False,
                            "error": "Unexpected Discord response format",
                        }
                    ),
                    200,
                )

            # Update cache
            session["guilds_cache"] = {
                "guilds": guilds,
                "expires_at": now + timedelta(minutes=5),
            }
        except Exception as e:
            return (
                jsonify(
                    {"in_guild": False, "error": f"Failed to fetch guilds: {str(e)}"}
                ),
                200,
            )

    # Search in the (now potentially cached) guilds list
    matched_guild = next((g for g in guilds if str(g.get("id")) == str(guild_id)), None)

    if matched_guild:
        icon_hash = matched_guild.get("icon")
        icon_url = (
            f"https://cdn.discordapp.com/icons/{guild_id}/{icon_hash}.png?size=128"
            if icon_hash
            else None
        )
        return jsonify(
            {
                "in_guild": True,
                "guild_name": matched_guild.get("name"),
                "guild_icon": icon_url,
            }
        )

    return jsonify({"in_guild": False})


@chat_api.route("/chat/history/<station>")
def get_chat_history(station):
    station_key = station.upper().replace("-", "").replace(" ", "")
    if station_key not in chat_messages:
        return jsonify({"error": "Invalid station"}), 400

    # Track activity if token provided
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        if token in user_sessions:
            update_user_activity(user_sessions[token]["id"], station_key)

    online_users_list = get_online_users_list(station_key)
    return jsonify(
        {
            "station": station_key,
            "messages": chat_messages[station_key][-50:],
            "online_count": len(online_users_list),
            "online_users": online_users_list,
            "server_time": datetime.utcnow().isoformat(),
        }
    )


@chat_api.route("/chat/poll/<station>")
def poll_messages(station):
    station_key = station.upper().replace("-", "").replace(" ", "")
    since = request.args.get("since", "")
    if station_key not in chat_messages:
        return jsonify({"error": "Invalid station"}), 400

    # Track activity
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        if token in user_sessions:
            update_user_activity(user_sessions[token]["id"], station_key)

    messages = chat_messages[station_key]
    if since:
        try:
            since_time = datetime.fromisoformat(since.replace("Z", ""))
            messages = [
                m
                for m in messages
                if datetime.fromisoformat(m["timestamp"]) > since_time
            ]
        except:
            pass

    online_users_list = get_online_users_list(station_key)
    return jsonify(
        {
            "messages": messages[-50:],
            "online_count": len(online_users_list),
            "online_users": online_users_list,
            "server_time": datetime.utcnow().isoformat(),
        }
    )


@chat_api.route("/chat/send", methods=["POST"])
def send_message():
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401

    token = auth_header.split(" ")[1]
    if token not in user_sessions:
        return jsonify({"error": "Invalid session"}), 401

    data = request.json
    content = data.get("message", "").strip()[:200]
    station = data.get("station", "").upper().replace("-", "").replace(" ", "")

    if not content or station not in chat_messages:
        return jsonify({"error": "Invalid data"}), 400

    user = user_sessions[token]
    now = datetime.utcnow()
    update_user_activity(user["id"], station)

    if (
        user["id"] in message_cooldowns
        and (now - message_cooldowns[user["id"]]).total_seconds()
        < MESSAGE_COOLDOWN_SECONDS
    ):
        return jsonify({"error": "Cooldown"}), 429

    message_cooldowns[user["id"]] = now
    msg_obj = {
        "id": secrets.token_hex(8),
        "user": user,
        "content": content,
        "timestamp": now.isoformat(),
        "station": station,
        "song_data": data.get("song_data"),  # optional song embed
    }

    chat_messages[station].append(msg_obj)
    if len(chat_messages[station]) > MAX_MESSAGES_PER_CHANNEL:
        chat_messages[station].pop(0)

    return jsonify({"success": True, "message": msg_obj})


app.register_blueprint(chat_api, url_prefix="/DiscordAuthChatApi")
app.register_blueprint(chat_api, name="chat_api_root")


@app.route("/")
def main_index():
    return "API Online"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, threaded=True)
