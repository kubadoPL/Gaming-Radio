import sys
import time
import webview
import threading
import psutil  
import keyboard  # Import the keyboard library

# Function to check if Discord is running
def is_discord_running():
    for process in psutil.process_iter(['pid', 'name']):
        if 'Discord.exe' in process.info['name']: 
            return True
    return False

# Variable to check if Discord is enabled
use_discord = is_discord_running()

# Import Discord Rich Presence if enabled
if use_discord:
    from pypresence import Presence

    start_time = int(time.time())

    RPC = Presence(client_id="1199866038569947217")
    RPC.connect()
else:
    RPC = None

window = webview.create_window('Radio Gaming Desktop', 'https://radio-gaming.stream/', maximized=True)

# Function to update Discord Rich Presence
def update_rpc(stream_title, audio_playing, playstateicon, statestring):
    if RPC:
        cleaned_title = stream_title.replace("LIVE STREAM:", "").strip()
        currentrpcminiature = audio_playing.replace(" ", "").lower()
        RPC.update(
            details="🎵 " + audio_playing,
            state=cleaned_title,
            large_image= currentrpcminiature,
            start=start_time,
            buttons=[{"label": "Listen to Radio Gaming ALSO!", "url": "https://radio-gaming.stream/"}],
            large_text=cleaned_title,
            small_image=playstateicon,
            small_text=statestring,
            instance=True
        )

# Function to be called when the webview is closed
def on_closed():
    print('pywebview window is closed')
    if RPC:
        RPC.close()
    sys.exit(0)

# Call the update_rpc() function periodically
def update_rpc_periodically():
    while True:
        try:
            station_name = window.evaluate_js('document.getElementById("StationNameInh1").textContent')
            stream_title = window.evaluate_js('document.getElementById("streamTitle").textContent')
            audio_playing = not window.evaluate_js('document.getElementById("audioPlayer").paused')

            if not (audio_playing):
                update_rpc("Idling", "Radio Gaming", "pause", "Idling")
            else:
                if stream_title and audio_playing:
                    update_rpc(stream_title, station_name, "play", "Streaming")
        except Exception as e:
            print(f"An error occurred while updating RPC: {e}")

        time.sleep(1)

# Function to toggle fullscreen
def toggle_fullscreen():
    window.toggle_fullscreen()

# Start the webview
window.events.closed += on_closed
thread = threading.Thread(target=update_rpc_periodically)

try:
    thread.start()
    keyboard.add_hotkey('f11', toggle_fullscreen)  # Add F11 as a hotkey to toggle fullscreen
    webview.start()
except KeyboardInterrupt:
    sys.exit(0)
except SystemExit:
    sys.exit(0)
except Exception as e:
    print(f"An error occurred: {e}")
    sys.exit(1)
