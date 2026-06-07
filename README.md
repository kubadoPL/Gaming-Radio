# 🎮 Radio GAMING – Powering Your Gaming Experience

**Are you ready to immerse yourself in the ultimate music experience?**

Whether you're a casual gamer grinding through levels, a competitive esports enthusiast seeking focus, or simply an audiophile who appreciates a great soundtrack, **Radio GAMING** is built for you.

![Radio Gaming Showcase](https://raw.githubusercontent.com/kubadoPL/Gaming-Radio/refs/heads/main/Assets/Ads/Radio%20Showcase%20new2026.gif)

---

## 📖 About The Project

**Radio GAMING** is a streamlined internet radio player designed to deliver high-quality music without distractions.

What started as a simple university coursework project quickly evolved into a passion project. The initial concept was straightforward: build a functional radio player. However, as development progressed, I realized the potential to create a dedicated hub for gaming music that I—and others—would actually want to use daily. Today, it stands as a fully featured, cross-platform application that I'm proud to continue updating.

---

## ✨ Features Overview

### 🎧 Core Experience
*   **Multiple Curated Stations**: Switch seamlessly between different vibes and genres to match your current gameplay style.
*   **High-Quality Audio**: Built on **ICECAST MP3** streaming for low-latency, high-fidelity sound.
*   **Media Session Integration**: Control playback and view track info directly from your OS media controls, keyboard media keys, or mobile lock screen.

### 🎨 Visuals & Immersion
*   **Smart Album Art**: Automatically fetches high-resolution covers using a multi-source engine (**Spotify**, **iTunes**, **Deezer**, and **YouTube**) with intelligent similarity scoring.
*   **Beat-Reactive Visualizer**: A built-in visualizer that pulses interface elements and album art in sync with the audio frequencies.
*   **Dynamic Theming**: UI accents and glow effects adapt in real-time to match the identity of the active station.
*   **Immersive Modes**: Toggle between Grid and List views for your song history, and use **Fullscreen Mode** (`F11`) for distraction-free gaming.

### 🌐 Social & Discord Ecosystem
*   **Real-Time Station Chat**: Log in with Discord to connect with other listeners.
    *   **Custom Emojis & Reactions**: Upload your own icons and react to messages with a variety of emojis (persisted in MySQL database).
    *   **Image Sharing**: Share screenshots or gameplay moments directly in chat (up to 2MB).
    *   **GIF Picker**: Full **Giphy** integration with a personal "Favorites" system for your most-used GIFs.
    *   **Song Sharing in Chat**: Reference the currently playing track when sending a message, displayed as a rich embed in chat.
    *   **@Mention System**: Get notified instantly when someone tags you in the chat across any station, with autocomplete suggestions.
    *   **Message Deletion**: Delete your own messages or any message (admins). Deletions sync across all clients in real-time.
*   **Smart Presence**: See who's online, what they're listening to, and their Discord profiles in the active listener's list. View detailed user profiles with listening stats.
*   **Now Playing Webhooks**: Share tracks directly to Discord with rich embeds including art and direct links — via configured server channels or custom webhook URLs.
*   **Anonymous Listener Tracking**: Non-logged-in users automatically receive a unique ID with full listening stats (songs, total time, favorites) persisted to the database. Stats can be claimed when the user logs in via Discord.
*   **Global Listener Rankings**: Leaderboard tab showing top listeners by total listening time with medals and formatted durations.

### 📊 Listener Statistics & Data
*   **Personal Listening Stats**: Track your total listening time, song count, most-listened tracks, and per-station breakdowns.
*   **Admin Anonymous Stats Panel**: Admin users can browse all anonymous listener profiles with search, sort, and detailed song breakdowns.
*   **Server-Side Stats Dashboard**: Live widget showing online users, registered user count, and unique anonymous user count.
*   **Data Export & Import**: Backup or restore your favorites, history, and settings via JSON export/import.

### 🛠️ User Tools
*   **Song History & Favorites**: View your recently played tracks and build a collection of your favorites.
*   **Persistent Experience**: Your volume, visualizer settings, and GIF favorites are saved automatically between sessions.
*   **Smart Notifications**: Non-intrusive in-app toasts for track changes, mentions, and system updates.

### 💻 Desktop Application
Experience **Radio GAMING** as a native application with dedicated features:
*   **Discord Rich Presence (RPC)**: Automatically syncs your active station, current song, and album art to your Discord status.
*   **Smart Persistence**: Unlike browsers that may clear data, the Desktop App uses dedicated local storage in `AppData` to keep your tokens, themes, and favorites safe.
*   **Native Performance**: Built with a lightweight webview for low memory footprint and fast startup.
*   **Custom Hotkeys**:
    *   `F11`: Deep-immersion Fullscreen.
    *   `Shift + F7`: Instant cache purge and application refresh.
*   **Easy Installation**: Includes a standalone installer (`.exe`) and a portable standalone EXE for quick setup on Windows.

### 🎮 Discord Activity (Embedded App)
Play Radio GAMING directly inside Discord as an embedded activity:
*   **Discord SDK Integration**: Seamlessly authenticates users via the Discord Embedded App SDK.
*   **Full Feature Parity**: All core features — stations, chat, history, favorites — available within the Discord client.
*   **Automatic Login**: Users are instantly authenticated through the Discord Activity context.

### 🎙️ Broadcaster Suite
A professional-grade broadcasting tool for our live streamers:
*   **Link & Play**: Queue tracks directly from **YouTube** or **Spotify**.
*   **Hybrid Sources**: Mix local **MP3s** with cloud searches and live microphone input.
*   **Direct Zeno Integration**: Low-latency broadcasting with automated metadata syncing.

---

## 🏗️ Architecture

### Frontend
*   **WebAPP** — Main web player at [radio-gaming.stream](https://radio-gaming.stream/)
*   **DiscordActivityWebApp** — Variant built for Discord's Embedded App SDK
*   **DesktopAPP** — Windows desktop wrapper with Discord RPC support

### Backend Services (hosted on the [Discord Bot Launcher Manager](https://github.com/kubadoPL/Discord-Bot-Launcher-Manager))
*   **DiscordAuthChatApi** — Discord OAuth2 login, real-time chat, user sessions, custom emojis, online presence, anonymous stats, and listener rankings. All data persisted to MySQL.
*   **K5ApiManager** — Spotify/YouTube/Giphy token proxy, album cover search engine (multi-source with similarity scoring), Discord webhook relay, server uptime, and running services API.
*   **ZenoFMApi** — Zeno FM analytics scraper (live listener count via headless Chrome/Selenium).

---

## 🛠️ Built With

*   **Frontend**: Vanilla HTML5, CSS3, JavaScript (Reactive UI)
*   **Backend Services**: 
    *   **Python (Flask)**: Custom Discord OAuth, Real-time Chat API, Listener Stats
    *   **Proxy Services**: Album cover fetcher (Spotify, iTunes, Deezer, YouTube), token proxies
    *   **Database**: MySQL (chat messages, user profiles, sessions, custom emojis, anonymous stats, service stats)
*   **Streaming Platform**: Zeno FM Icecast Infrastructure
*   **Integrations**: Spotify Web API, YouTube Data API, Giphy API, Discord OAuth2, Discord Embedded App SDK
*   **Hosting**: Heroku (backend), custom domain (frontend)

---

## 🚀 Live Demo

Don't just take my word for it. Experience the radio directly in your browser:
**👉 [Listen Live at radio-gaming.stream](https://radio-gaming.stream/)**

---

## 📥 Download

Take **Radio GAMING** beyond the browser! Download our standalone application for the best experience:

*   **📦 Windows Desktop Launcher (Installer)**: [Download Installer](https://github.com/kubadoPL/Gaming-Radio/raw/main/DesktopAPP/Radio%20Gaming%20Desktop%20Launcher%20Installer.exe)
    *   *Includes: Auto-updater, Discord RPC, and Global Hotkeys.*
*   **📦 Windows Standalone EXE (Portable)**: [Download Standalone](https://github.com/kubadoPL/Gaming-Radio/raw/main/DesktopAPP/Radio%20Gaming%20Desktop.exe)
    *   *No installation required. Just run and play.*

---

**Radio GAMING — Powering Your Gaming Experience.**

<img src="https://raw.githubusercontent.com/kubadoPL/Gaming-Radio/main/Assets/Ads/Radio%20Gaming%20ad.png" width="400" height="auto">
