import sys
import time
import webview
import threading
import psutil  # Import the psutil library

# Function to check if Discord is running
def is_discord_running():
    for process in psutil.process_iter(['pid', 'name']):
        if 'Discord.exe' in process.info['name']:  # Check for the Discord process name
            return True
    return False

# Variable to check if Discord is enabled
use_discord = is_discord_running()

# Import Discord Rich Presence if enabled
if use_discord:
    from pypresence import Presence

    # Get the current time as the start time
    start_time = int(time.time())

    # Initialize Discord Rich Presence
    RPC = Presence(client_id="1199866038569947217")
    RPC.connect()
else:
    RPC = None

# Create the webview window
window = webview.create_window('Radio Gaming Desktop', 'https://www.manticore.uni.lodz.pl/~druzb5/inne/radio.html', maximized=True)

# Function to update Discord Rich Presence
def update_rpc(stream_title, audio_playing, playstateicon, statestring):
    if RPC:
        # Remove "LIVE STREAM:" from the stream title
        cleaned_title = stream_title.replace("LIVE STREAM:", "").strip()

        RPC.update(
            details="🎵 " + audio_playing,
            state=cleaned_title,
            large_image="gaminglogo",
            start=start_time,
            buttons=[{"label": "Listen to Radio Gaming ALSO!", "url": "https://www.manticore.uni.lodz.pl/~druzb5/inne/radio.html"}],
            large_text=cleaned_title,
            small_image=playstateicon,
            small_text=statestring,
            #join="test",
            instance=True
        )

# Function to be called when the webview is closed
def on_closed():
    print('pywebview window is closed')
    # Disconnect Discord Rich Presence when the program exits
    if RPC:
        RPC.close()
    # Optionally, perform additional cleanup or exit actions here
    sys.exit(0)

# Call the update_rpc() function periodically
def update_rpc_periodically():
    while True:
        # Retrieve the current stream title from the webview and check if any audio is playing
        station_name = window.evaluate_js('document.getElementById("StationNameInh1").textContent')
        stream_title = window.evaluate_js('document.getElementById("streamTitle").textContent')
        audio_playing = not window.evaluate_js('document.getElementById("audioPlayer").paused')

        # If none of the audio players is playing, update to "Idling"
        if not (audio_playing):
            update_rpc("Idling", "Nothing", "pause", "Idling")
        else:
            # Update based on which audio player is currently playing
            if stream_title and audio_playing:
                update_rpc(stream_title, "Radio GAMING", "play", "Streaming")

        time.sleep(1)  # Adjust the interval as needed

# Start the webview
window.events.closed += on_closed
thread = threading.Thread(target=update_rpc_periodically)

try:
    thread.start()
    webview.start()
except KeyboardInterrupt:
    sys.exit(0)
except SystemExit:
    sys.exit(0)
except Exception as e:
    print(f"An error occurred: {e}")
    sys.exit(1)
