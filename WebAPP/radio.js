const albumCovers = {};
const eventSources = new Map();

function switchSection(sectionId) {
    // Remove active class from all sections
    const sections = document.querySelectorAll('.page-section');
    sections.forEach(section => {
        section.classList.remove('active');
    });

    // Show target section
    const targetSection = document.getElementById(sectionId + '-section');
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Update nav links active state
    const navLinks = document.querySelectorAll('nav ul li a');
    navLinks.forEach(link => {
        link.classList.remove('active-nav-link');
        if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(`'${sectionId}'`)) {
            link.classList.add('active-nav-link');
        }
    });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update title badge logic (optional)
    if (sectionId === 'info') {
        showNotification("Viewing Information");
    } else if (sectionId === 'download') {
        showNotification("Get the Desktop App!");
    }
}

let audio, streamTitleElement, playPauseIcon, stationName, eventSource, currentEventSource;
let globalCurrentColor = "#7300ff"; // Default color for the loading screen and scrollbar
let fetching = false; // Flag to prevent multiple fetches
let cooldown = false;
let IsChangingStation = false; // Flag to prevent multiple station changes
var notificationTimeout;

function handleMainStreamMessage(event) {
    try {
        var jsonData = JSON.parse(event.data);
        if (jsonData.streamTitle) {
            var cleanedTitle = cleanTitle(jsonData.streamTitle);
            if (streamTitleElement) streamTitleElement.textContent = 'LIVE STREAM: ' + cleanedTitle;
            fetchSpotifyCover(cleanedTitle); // Fetch and display the Spotify cover
        }
    } catch (error) {
        console.error('Error processing data:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    audio = document.getElementById('audioPlayer');
    streamTitleElement = document.getElementById('streamTitle');
    playPauseIcon = document.getElementById('playPauseIcon');
    stationName = document.querySelector('h1');

    // Initial setup with safety checks
    const loadingScreen = document.querySelector('.loading-screen');
    if (loadingScreen) {
        loadingScreen.style.backgroundColor = "#7300ff";
        loadingScreen.style.display = 'flex';
    }

    document.documentElement.style.setProperty('--scrollbar-thumb-color', '#7300ff');

    // Main Stream EventSource
    eventSource = new EventSource('https://api.zeno.fm/mounts/metadata/subscribe/es4ngpu7ud6tv');
    currentEventSource = eventSource;

    eventSource.onmessage = handleMainStreamMessage;

    eventSource.onerror = function (error) {
        console.error('Connection error:', error);
        eventSource.close();
    };

    // Event listener setup for station photos
    document.querySelectorAll('.station-photo').forEach(station => {
        station.addEventListener('mouseover', function () {
            const tooltip = this.querySelector('.tooltip');
            const onclickAttr = this.getAttribute('onclick');
            if (!onclickAttr) return;

            const parts = onclickAttr.split(", ");
            if (parts.length < 3) return;

            const metadataUrl = parts[2].replace(/[')]/g, '').trim();

            if (metadataUrl) {
                if (eventSources.has(metadataUrl)) {
                    eventSources.get(metadataUrl).close();
                }
                const newEventSource = handleEventSource(metadataUrl, tooltip);
                eventSources.set(metadataUrl, newEventSource);
            }
        });

        station.addEventListener('mouseleave', function () {
            const onclickAttr = this.getAttribute('onclick');
            if (!onclickAttr) return;

            const parts = onclickAttr.split(", ");
            if (parts.length < 3) return;

            const metadataUrl = parts[2].replace(/[')]/g, '').trim();

            if (metadataUrl && eventSources.has(metadataUrl)) {
                eventSources.get(metadataUrl).close();
                eventSources.delete(metadataUrl);
            }
        });
    });

    // Initial listener update setup
    setTimeout(function () {
        console.log("Updating all online users 6 sec after page load");
        updateAllOnlineUsers();
        setInterval(updateAllOnlineUsers, 60000);
    }, 6000);

    // Audio time update listener
    const currentTimeElement = document.getElementById('currentTime');
    if (audio && currentTimeElement) {
        audio.addEventListener('timeupdate', function () {
            currentTimeElement.textContent = formatTime(audio.currentTime);
        });
    }

    changeVolume(0.1);

    // Mute/Restore icons setup
    const volDown = document.getElementById('volume-down');
    const volUp = document.getElementById('volume-up');
    if (volDown) volDown.addEventListener('click', () => window.muteVolume());
    if (volUp) volUp.addEventListener('click', () => window.restoreVolume());

    showNotification("Welcome to Radio GAMING!");
});

async function getSpotifyAccessToken() {
    const now = Date.now();
    let cachedToken = localStorage.getItem('RadioGaming-spotifyAccessToken');
    let tokenExpiresAt = parseInt(localStorage.getItem('RadioGaming-spotifyTokenExpiresAt'), 10) || 0;

    if (cachedToken && now < tokenExpiresAt) {
        const msLeft = tokenExpiresAt - now;
        const secondsLeft = Math.floor(msLeft / 1000);
        const minutes = Math.floor(secondsLeft / 60);
        const seconds = secondsLeft % 60;
        const expiryDate = new Date(tokenExpiresAt).toLocaleString();
        console.log(`Using cached Spotify access token. Expires in ${minutes}m ${seconds}s (at ${expiryDate}).`);

        if (document.querySelector('.loading-screen')) {
            const ls = document.querySelector('.loading-screen');
            if (ls.style.display !== 'none' && !IsChangingStation) {
                setTimeout(() => {
                    ls.style.display = 'none';
                    console.log('Album Covers token from CACHE. Hiding loading screen!');
                }, 3000);
            }
        }
        return cachedToken;
    }

    if (fetching) return cachedToken;
    fetching = true;

    const tokenUrl = 'https://bot-launcher-discord-017f7d5f49d9.herokuapp.com/K5ApiManager/spotify/token';
    try {
        const response = await fetch(tokenUrl);
        const data = await response.json();

        if (response.ok) {
            cachedToken = data.access_token;
            const expiresIn = data.expires_in || 3600;
            const createdAt = new Date(data.created_at).getTime();
            tokenExpiresAt = createdAt + expiresIn * 1000 - 60000;

            const timeStr = Math.floor(expiresIn / 60) + "m " + (expiresIn % 60) + "s";
            const expiryDate = new Date(tokenExpiresAt).toLocaleString();
            console.log(`New Spotify token fetched. Valid for ${timeStr} (expires at ${expiryDate}).`);

            localStorage.setItem('RadioGaming-spotifyAccessToken', cachedToken);
            localStorage.setItem('RadioGaming-spotifyTokenExpiresAt', tokenExpiresAt.toString());

            fetching = false;
            const ls = document.querySelector('.loading-screen');
            if (ls && ls.style.display !== 'none' && !IsChangingStation) {
                setTimeout(() => {
                    ls.style.display = 'none';
                    console.log('Album Covers token fetched successfully. Hiding loading screen!');
                }, 3000);
            }
            showNotification('Album Covers token fetched successfully!');
            return cachedToken;
        } else {
            console.log('Failed to fetch album covers token. Hiding loading screen!');
            showNotification('Failed to fetch Album Covers token. Please try again later.');
            fetching = false;
            throw new Error('Failed to fetch access token');
        }
    } catch (error) {
        fetching = false;
        console.error(error);
        return null;
    }
}

async function fetchAlbumCovers() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/kubadoPL/Gaming-Radio/main/WebAPP/albumCovers.json');
        const data = await response.json();
        Object.assign(albumCovers, data);
        console.log('Album covers fetched successfully:', albumCovers);
    } catch (error) {
        console.error('Error fetching album covers:', error);
    }
}

fetchAlbumCovers();

async function fetchSpotifyCover(query) {
    const fallbackCover = 'https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png';
    try {
        const accessToken = await getSpotifyAccessToken();
        if (!accessToken) throw new Error("No token");

        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
        const response = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        const data = await response.json();

        let albumCover = fallbackCover;
        if (data.tracks && data.tracks.items.length > 0) {
            const track = data.tracks.items[0];
            const defaultCover = track.album.images[0].url;
            albumCover = albumCovers[query] || defaultCover;
        } else {
            console.log('No cover found for: ' + query);
        }

        const coverElem = document.getElementById('albumCover');
        if (coverElem) coverElem.src = albumCover;
        updateMediaSessionMetadata(query, albumCover);
    } catch (error) {
        console.error('Error fetching Spotify cover:', error);
        const coverElem = document.getElementById('albumCover');
        if (coverElem) coverElem.src = fallbackCover;
        updateMediaSessionMetadata(query, fallbackCover);
    }
}

function updateMediaSessionMetadata(title, artwork) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: stationName ? stationName.textContent : 'Radio Gaming',
            album: 'Radio Gaming Stream',
            artwork: [{ src: artwork, sizes: '512x512', type: 'image/png' }]
        });

        navigator.mediaSession.setActionHandler('play', () => {
            if (audio) { audio.play(); playPauseIcon.className = 'fas fa-pause'; }
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (audio) { audio.pause(); playPauseIcon.className = 'fas fa-play'; }
        });
        navigator.mediaSession.setActionHandler('stop', () => {
            if (audio) { audio.pause(); playPauseIcon.className = 'fas fa-play'; }
        });
    }
}

function showNotification(message) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = 'notificationPopup';
    notification.innerHTML = `
        <div class="notification-icon"><i class="fas fa-bell"></i></div>
        <div class="notification-message">${message}</div>
    `;
    notification.style.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--active-station-color');
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5600);
}

function playPause() {
    if (!audio) return;
    if (audio.paused) {
        audio.load();
        audio.play();
        playPauseIcon.className = 'fas fa-pause';
        showNotification("Now Playing!");
    } else {
        audio.pause();
        playPauseIcon.className = 'fas fa-play';
        showNotification("Paused!");
    }
}

let previousVolume = 0.1;

function changeVolume(value) {
    if (audio) audio.volume = value;
    previousVolume = value;
}

// Restore volume when clicking the volume-up icon
window.restoreVolume = function () {
    if (audio) {
        audio.volume = previousVolume || 0.1;
        document.querySelector('.volume-slider').value = audio.volume;
        showNotification("Restoring volume!");
    }
};

// Mute volume when clicking the volume-down icon
window.muteVolume = function () {
    if (audio) {
        previousVolume = audio.volume;
        audio.volume = 0;
        document.querySelector('.volume-slider').value = 0;
        showNotification("Muting volume!");
    }
};

function changeStation(source, name, metadataURL) {
    if (cooldown) return;
    IsChangingStation = true;

    const stationDetails = {
        "https://stream.zeno.fm/es4ngpu7ud6tv": {
            backgroundImage: "url('https://radio-gaming.stream/Images/Radio-Gaming-Background.webp')",
            borderColor: "#7300ff",
            secondaryColor: "#a855f7",
            glowColor: "rgba(115, 0, 255, 0.6)",
            loadingBackgroundColor: "#7300ff",
            liveEmoji: "🟣LIVE",
            streamTitleColor: "#ffffff"
        },
        "https://stream.zeno.fm/pfg9eajshnjtv": {
            backgroundImage: "url('https://radio-gaming.stream/Images/Radio-Gaming-Dark-background.webp')",
            borderColor: "#293cca",
            secondaryColor: "#3e5aff",
            glowColor: "rgba(41, 60, 202, 0.6)",
            loadingBackgroundColor: "#293cca",
            liveEmoji: "🔵LIVE",
            streamTitleColor: "#0039ff"
        },
        "https://stream.zeno.fm/5nhy0myl4jpuv": {
            backgroundImage: "url('https://radio-gaming.stream/Images/Radio-Gaming-Maron-FM-background-Polished.webp')",
            borderColor: "#272956",
            secondaryColor: "#4a4e8a",
            glowColor: "rgba(39, 41, 86, 0.6)",
            loadingBackgroundColor: "#272956",
            liveEmoji: "🟣LIVE",
            streamTitleColor: "#272956"
        }
    };

    const config = stationDetails[source];
    if (!config) return;

    document.documentElement.style.setProperty('--active-station-color', config.borderColor);
    document.documentElement.style.setProperty('--active-station-color-secondary', config.secondaryColor);
    document.documentElement.style.setProperty('--active-station-glow', config.glowColor);
    document.documentElement.style.setProperty('--scrollbar-thumb-color', config.loadingBackgroundColor);

    const ls = document.querySelector('.loading-screen');
    if (ls) {
        ls.style.backgroundColor = config.loadingBackgroundColor;
        ls.style.display = 'flex';
    }

    document.body.style.backgroundImage = config.backgroundImage;
    document.querySelectorAll('.station-photo').forEach(photo => {
        photo.classList.toggle('active', photo.getAttribute('onclick').includes(source));
        if (photo.classList.contains('active')) photo.style.borderColor = config.borderColor;
    });

    const liveIndicator = document.getElementById('liveIndicator');
    if (liveIndicator) liveIndicator.textContent = config.liveEmoji;
    if (streamTitleElement) streamTitleElement.style.color = config.streamTitleColor;

    if (audio) {
        audio.src = source;
        audio.load();
        audio.play();
        playPauseIcon.className = 'fas fa-pause';
    }
    if (stationName) stationName.textContent = name;
    showNotification("Changing station to: " + name);

    if (currentEventSource) currentEventSource.close();
    currentEventSource = new EventSource(metadataURL);
    currentEventSource.onmessage = handleMainStreamMessage;

    cooldown = true;
    const bgUrl = config.backgroundImage.slice(5, -2);
    const backgroundImg = new Image();
    backgroundImg.src = bgUrl;
    backgroundImg.onload = () => {
        setTimeout(() => {
            if (!fetching && ls) ls.style.display = 'none';
            cooldown = false;
            IsChangingStation = false;
        }, 3000);
    };
}

function formatTime(time) {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    let f = (minutes < 10 ? '0' + minutes : minutes) + ':' + (seconds < 10 ? '0' + seconds : seconds);
    if (hours > 0) f = (hours < 10 ? '0' + hours : hours) + ':' + f;
    return f;
}

function cleanTitle(title) {
    return title.replace(/\.mp3/gi, '')
        .replace(/\(official music video\)/gi, '')
        .replace(/\[SPOTIFY-DOWNLOADER\.COM\]/gi, '')
        .replace(/\[HD\]/gi, '')
        .replace(/\[NEW SONG\]/gi, '')
        .replace(/\(gotg3 song adam warlock intro\)/gi, '')
        .replace(/\(Official song\)/gi, '')
        .replace(/\(with Lyrics\)/gi, '')
        .replace(/\(w?\)/gi, '')
        .replace(/Lyrics/gi, '')
        .replace(/\(Lyric Video\)/gi, '')
        .replace(/\(Official Audio\)/gi, '')
        .replace(/\(Official Video\)/gi, '')
        .replace(/\((1)\)/gi, '')
        .replace(/\(Official\)/gi, '')
        .replace(/\[Official Music Video\]/gi, '')
        .replace(/\?+/g, '')
        .trim();
}

async function metaDataUrlToStationName(url) {
    if (url.includes('es4ngpu7ud6tv')) return 'Radio GAMING';
    if (url.includes('pfg9eajshnjtv')) return 'Radio GAMING DARK';
    if (url.includes('5nhy0myl4jpuv')) return 'Radio GAMING MARON FM';
    return 'Unknown Station';
}

async function fetchSpotifyCovertooltip(query, tooltipElement) {
    const fallbackCover = 'https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png';
    try {
        const accessToken = await getSpotifyAccessToken();
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;
        const response = await fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken } });
        const data = await response.json();

        let cover = fallbackCover;
        if (data.tracks && data.tracks.items.length > 0) {
            cover = albumCovers[query] || data.tracks.items[0].album.images[0].url;
        }
        const img = tooltipElement.querySelector('.tooltip-cover');
        if (img) img.src = cover;
    } catch (e) {
        const img = tooltipElement.querySelector('.tooltip-cover');
        if (img) img.src = fallbackCover;
    }
}

function handleEventSource(metadataUrl, tooltipElement) {
    const es = new EventSource(metadataUrl);
    es.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.streamTitle) {
                const cleaned = cleanTitle(data.streamTitle);
                const trackElem = tooltipElement.querySelector('.tooltip-track');
                if (trackElem) trackElem.textContent = 'LIVE STREAM: ' + cleaned;
                await fetchSpotifyCovertooltip(cleaned, tooltipElement);
            }
        } catch (e) { console.error(e); }
    };
    es.onerror = () => es.close();
    return es;
}

async function updateOnlineUsersTooltip(tooltipElement, sName, metadataUrl) {
    try {
        const normalized = sName.replace(/\s+/g, '').toUpperCase();
        const cacheKey = `listenerCount_${normalized}`;
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');

        if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
            updateTooltip(tooltipElement, cached.listenerCount, sName);
            return;
        }

        const res = await fetch('https://bot-launcher-discord-017f7d5f49d9.herokuapp.com/ZenoFMApi/get-sum?station=' + normalized);
        const data = await res.json();
        const count = data.total_sum;

        localStorage.setItem(cacheKey, JSON.stringify({ listenerCount: count, timestamp: Date.now() }));
        updateTooltip(tooltipElement, count, sName);
    } catch (e) {
        updateTooltip(tooltipElement, null, sName, true);
    }
}

function updateTooltip(tooltipElement, count, sName, isError = false) {
    const userElem = tooltipElement.querySelector('.tooltip-Online-Users');
    if (!userElem) return;

    if (isError) {
        userElem.textContent = 'Error loading Live Listeners';
    } else {
        userElem.textContent = `Live Listeners: ${count}`;
        userElem.style.color = count > 0 ? '#00ff00' : '#ff0000';
    }
}

function updateAllOnlineUsers() {
    document.querySelectorAll('.station-photo').forEach(async (station) => {
        const tooltip = station.querySelector('.tooltip');
        const onclickAttr = station.getAttribute('onclick');
        if (!onclickAttr) return;
        const parts = onclickAttr.split(", ");
        if (parts.length < 3) return;
        const metadataUrl = parts[2].replace(/[')]/g, '').trim();
        const sName = await metaDataUrlToStationName(metadataUrl);
        updateOnlineUsersTooltip(tooltip, sName, metadataUrl);
    });
}
