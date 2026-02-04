import os
import sys
import secrets
from datetime import datetime, timedelta

# Set the script and parent directory
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.abspath(os.path.join(script_dir, ".."))
sys.path.append(parent_dir)
os.chdir(parent_dir)

from flask import Flask, request, jsonify, redirect, Blueprint
from flask_cors import CORS
import requests as http_requests

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))

# More robust CORS configuration
# explicitly allowing Authorization header and responding with 200 to preflights
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

# Define Blueprint WITHOUT prefix internally
# If the entry point uses a prefix, it will be handled there
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
MAX_MESSAGES_PER_CHANNEL = 100
message_cooldowns = {}
MESSAGE_COOLDOWN_SECONDS = 2


@chat_api.route("/")
def home():
    print("[CHAT] Health check request")
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
        f"&scope=identify"
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

        user_sessions[session_token] = {
            "id": user_data["id"],
            "username": user_data["username"],
            "global_name": user_data.get("global_name", user_data["username"]),
            "avatar_url": avatar_url,
            "expires_at": (datetime.utcnow() + timedelta(days=7)).isoformat(),
        }
        return redirect(f"{frontend_url}?auth_token={session_token}")
    except Exception as e:
        print(f"[ERROR] Callback exception: {e}")
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


@chat_api.route("/chat/history/<station>")
def get_chat_history(station):
    station_key = station.upper().replace("-", "").replace(" ", "")
    if station_key not in chat_messages:
        return jsonify({"error": "Invalid station"}), 400
    return jsonify(
        {
            "station": station_key,
            "messages": chat_messages[station_key][-50:],
            "server_time": datetime.utcnow().isoformat(),
        }
    )


@chat_api.route("/chat/poll/<station>")
def poll_messages(station):
    station_key = station.upper().replace("-", "").replace(" ", "")
    since = request.args.get("since", "")
    if station_key not in chat_messages:
        return jsonify({"error": "Invalid station"}), 400

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

    return jsonify(
        {"messages": messages[-50:], "server_time": datetime.utcnow().isoformat()}
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
    content = data.get("message", "").strip()[:500]
    station = data.get("station", "").upper().replace("-", "").replace(" ", "")

    if not content or station not in chat_messages:
        return jsonify({"error": "Invalid data"}), 400

    user = user_sessions[token]
    now = datetime.utcnow()

    # Rate limit
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
    }

    chat_messages[station].append(msg_obj)
    if len(chat_messages[station]) > MAX_MESSAGES_PER_CHANNEL:
        chat_messages[station].pop(0)

    return jsonify({"success": True, "message": msg_obj})


# Register blueprint both with and without prefix to handle different routing environments
app.register_blueprint(chat_api, url_prefix="/DiscordAuthChatApi")
# Also allow root access (in case Heroku router strips the subpath)
app.register_blueprint(chat_api, name="chat_api_root")


@app.route("/")
def main_index():
    return "API Online"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, threaded=True)
