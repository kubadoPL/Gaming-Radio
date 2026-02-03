import os
import sys
import time
import webview
import threading
import psutil
import keyboard


# Function to check if Discord is running
def is_discord_running():
    for process in psutil.process_iter(["pid", "name"]):
        if "Discord.exe" in process.info["name"]:
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

window = webview.create_window(
    "Radio Gaming Desktop", "https://radio-gaming.stream/", maximized=True
)


# Function to update Discord Rich Presence
def update_rpc(stream_title, audio_playing, playstateicon, statestring):
    if RPC:
        cleaned_title = stream_title.replace("LIVE STREAM:", "").strip()
        currentrpcminiature = audio_playing.replace(" ", "").lower()
        RPC.update(
            details="🎵 " + audio_playing,
            state=cleaned_title,
            large_image=currentrpcminiature,
            start=start_time,
            buttons=[
                {
                    "label": "Listen to Radio Gaming ALSO!",
                    "url": "https://radio-gaming.stream/",
                }
            ],
            large_text=statestring + ": 🎵 " + audio_playing,
            small_image=playstateicon,
            small_text=cleaned_title,
            instance=True,
        )


# Function to be called when the webview is closed
def on_closed():
    print("pywebview window is closed")
    stop_event.set()  # Stop the RPC update thread

    if RPC:
        try:
            # Clear presence before closing to ensure it vanishes from Discord immediately
            RPC.clear()
            RPC.close()
            print("RPC Close")
        except Exception as e:
            print(f"Error closing RPC: {e}")

    try:
        # Unhook keyboard shortcuts
        keyboard.unhook_all()
    except:
        pass

    # Clean up children processes (like webview subprocesses)
    try:
        current_process = psutil.Process()
        for child in current_process.children(recursive=True):
            child.kill()
    except:
        pass

    # Final exit - use os._exit to ensure the process terminates immediately
    # even if there are stuck threads
    os._exit(0)


# Call the update_rpc() function periodically
def update_rpc_periodically(stop_event):
    while not stop_event.is_set():
        try:
            station_name = window.evaluate_js(
                'document.getElementById("StationNameInh1").textContent'
            )
            stream_title = window.evaluate_js(
                'document.getElementById("streamTitle").textContent'
            )
            audio_playing = not window.evaluate_js(
                'document.getElementById("audioPlayer").paused'
            )
            album_cover = window.evaluate_js(
                'document.getElementById("albumCover").getAttribute("src")'
            )
            if not (audio_playing):
                update_rpc("Idling", "Radio Gaming", "pause", "Idling")
            else:
                if stream_title and audio_playing:
                    update_rpc(stream_title, station_name, album_cover, "Streaming")
        except Exception as e:
            print(f"An error occurred while updating RPC: {e}")

        time.sleep(1)


# Function to toggle fullscreen
def toggle_fullscreen():
    window.toggle_fullscreen()
    # time.sleep(5)
    # if window.is_minimized():
    #   window.maximize()


# Start the webview
stop_event = threading.Event()
thread = threading.Thread(
    target=update_rpc_periodically, args=(stop_event,), daemon=True
)

try:
    thread.start()
    keyboard.add_hotkey(
        "f11", toggle_fullscreen
    )  # Add F11 as a hotkey to toggle fullscreen
    window.events.closed += (
        on_closed  # Attach the on_closed function to the closing event of the window
    )
    webview.start()
except KeyboardInterrupt:
    stop_event.set()  # Set the stop event to terminate the update_rpc_periodically thread
    sys.exit(0)
except SystemExit:
    stop_event.set()  # Set the stop event to terminate the update_rpc_periodically thread
    sys.exit(0)
except Exception as e:
    print(f"An error occurred: {e}")
    stop_event.set()  # Set the stop event to terminate the update_rpc_periodically thread
    sys.exit(1)
