import sys
import time
import webview
from pypresence import Presence
import threading

# Get the current time as the start time
start_time = int(time.time())

# Initialize Discord Rich Presence
RPC = Presence(client_id="1199866038569947217")
RPC.connect()

# Create the webview window
window = webview.create_window('Radio Gaming Desktop', 'https://www.manticore.uni.lodz.pl/~druzb5/inne/radio.html' , maximized=True)

# Function to update Discord Rich Presence
def update_rpc(stream_title, audio_playing):
    # Remove "LIVE STREAM:" from the stream title
    cleaned_title = stream_title.replace("LIVE STREAM:", "").strip()

    RPC.update(
        details="🎵 " + audio_playing,
        state=cleaned_title,
        large_image="gaminglogo",
        start=start_time,
        buttons=[{"label": "Play Gaming Radio!", "url": "https://www.manticore.uni.lodz.pl/~druzb5/inne/radio.html"}],
        large_text=cleaned_title,
        instance=True
    )

# Function to be called when the webview is closed
def on_closed():
    print('pywebview window is closed')
    # Disconnect Discord Rich Presence when the program exits
    RPC.close()
    # Optionally, perform additional cleanup or exit actions here
    thread.Stop()
    sys.exit(0)

# Call the update_rpc() function periodically
def update_rpc_periodically():
    while True:
        # Retrieve the current stream title from the webview and check if any audio is playing
        stream_title = window.evaluate_js('document.getElementById("streamTitle").textContent')
        audio_playing = not window.evaluate_js('document.getElementById("audioPlayer").paused')

        stream_title2 = window.evaluate_js('document.getElementById("streamTitle2").textContent')
        audio_playing2 = not window.evaluate_js('document.getElementById("audioPlayer2").paused')

        stream_title3 = window.evaluate_js('document.getElementById("streamTitle3").textContent')
        audio_playing3 = not window.evaluate_js('document.getElementById("audioPlayer3").paused')

        # If none of the audio players is playing, update to "Idling"
        if not (audio_playing or audio_playing2 or audio_playing3):
            update_rpc("Idling", "Nothing")
        else:
            # Update based on which audio player is currently playing
            if stream_title and audio_playing:
                update_rpc(stream_title, "Radio GAMING")
            elif stream_title2 and audio_playing2:
                update_rpc(stream_title2, "Radio GAMING DARK")
            elif stream_title3 and audio_playing3:
                update_rpc(stream_title3, "Radio GAMING MARON FM")

        time.sleep(1)  # Adjust the interval as needed

# Start the webview
window.events.closed += on_closed
thread = threading.Thread(target=update_rpc_periodically)
thread.start()
webview.start()
