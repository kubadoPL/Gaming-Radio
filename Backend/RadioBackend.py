from flask import Flask, request, jsonify
import os
from flask import render_template
import requests
app = Flask(__name__)


# Set working directory to one level up from where bot.py is
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.join(script_dir, "..")
os.chdir(parent_dir)  # Change working directory

print("Working directory set to:", os.getcwd())

API_ENDPOINT = os.environ.get('ENDPOINT')
API_KEY = os.environ.get('API_KEY')

@app.route('/spotify/token', methods=['GET'])
def get_spotify_token_from_server():
    headers = {
        'X-API-Key': API_KEY
    }

    try:
        response = requests.get(API_ENDPOINT, headers=headers)
        if response.status_code == 200:
            data = response.json()
            return data['access_token']
        else:
            print(f"[ERROR] Failed to fetch token: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"[EXCEPTION] {e}")
        return None

def run_api():
    port = int(os.environ.get("PORT", 5000))  # Get the port from environment variable
    print(f"[INFO] Starting API server on port {port}...")
    app.run(host='0.0.0.0', port=port)


run_api()