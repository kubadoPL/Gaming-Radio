const albumCovers = {};
const eventSources = new Map();
const YOUTUBE_API_KEY = '';

function switchSection(sectionId) {
    const sections = document.querySelectorAll('.page-section');
    const targetSection = document.getElementById(sectionId + '-section');

    if (!targetSection) return;

    // Find currently active section
    const currentSection = document.querySelector('.page-section.active');

    // If clicking the same section, do nothing
    if (currentSection && currentSection.id === sectionId + '-section') return;

    // Update nav links active state immediately for responsiveness
    const navLinks = document.querySelectorAll('nav ul li a');
    navLinks.forEach(link => {
        link.classList.remove('active-nav-link');
        if (link.getAttribute('onclick') && link.getAttribute('onclick').includes(`'${sectionId}'`)) {
            link.classList.add('active-nav-link');
        }
    });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // If there's a current section, animate it out first
    if (currentSection) {
        currentSection.classList.add('exiting');
        currentSection.classList.remove('active');

        // After exit animation completes, show the new section
        setTimeout(() => {
            currentSection.classList.remove('exiting');

            // Show target section with entrance animation
            targetSection.classList.add('entering');
            targetSection.classList.add('active');

            // Remove entering class after animation
            setTimeout(() => {
                targetSection.classList.remove('entering');
            }, 500);
        }, 300);
    } else {
        // No current section, just show the target
        targetSection.classList.add('entering');
        targetSection.classList.add('active');

        setTimeout(() => {
            targetSection.classList.remove('entering');
        }, 500);
    }
}

let audio, streamTitleElement, playPauseIcon, stationName, eventSource, currentEventSource;
let globalCurrentColor = "#7300ff"; // Default color for the loading screen and scrollbar
let fetching = false; // Flag to prevent multiple fetches
let tokenPromise = null; // Shared promise for token fetching
let giphyTokenPromise = null; // Shared promise for Giphy token fetching
let cooldown = false;
let IsChangingStation = false; // Flag to prevent multiple station changes
var notificationTimeout;
let lastPercentage = 0;
let statusQueue = [];
let isProcessingQueue = false;
let lastActiveListenerCount = -1;
let lastListenerNotifyTime = 0;

// Audio Visualizer Variables
let audioCtx, analyser, dataArray, source, gainNode;
let isVisualizerInitialized = false;
let isVisualizerEnabled = localStorage.getItem('RadioGaming-visualizerEnabled') !== 'false';

// Song History & Favorites
let songHistory = JSON.parse(localStorage.getItem('RadioGaming-songHistory') || '[]');
let songFavorites = JSON.parse(localStorage.getItem('RadioGaming-songFavorites') || '[]');
let listeningStats = JSON.parse(localStorage.getItem('RadioGaming-listeningStats') || '{"totalTime": 0, "songs": {}}');
let historyViewMode = localStorage.getItem('RadioGaming-historyViewMode') || 'list'; // 'list' or 'grid' (spotify-style)
let lastHistorySongTitle = '';
let listeningTimer = null;

window.toggleVisualizations = function () {
    isVisualizerEnabled = !isVisualizerEnabled;
    localStorage.setItem('RadioGaming-visualizerEnabled', isVisualizerEnabled);
    applyVisualizationState();
    showNotification(isVisualizerEnabled ? "Visuals Enabled" : "Visuals Disabled", isVisualizerEnabled ? 'fas fa-eye' : 'fas fa-eye-slash');
};

function applyVisualizationState() {
    const particles = document.querySelector('.animation-wrapper');
    const toggleBtn = document.querySelector('.vis-toggle-btn');
    const toggleIcon = document.getElementById('vis-toggle-icon');

    if (isVisualizerEnabled) {
        if (particles) particles.style.display = 'block';
        if (toggleBtn) toggleBtn.classList.remove('disabled');
        if (toggleIcon) toggleIcon.className = 'fas fa-eye';
    } else {
        if (particles) particles.style.display = 'none';
        if (toggleBtn) toggleBtn.classList.add('disabled');
        if (toggleIcon) toggleIcon.className = 'fas fa-eye-slash';

        // Reset player styles to defaults
        if (!cachedCover) cachedCover = document.getElementById('albumCover');
        if (!cachedPlayer) cachedPlayer = document.querySelector('.audio-player');

        if (cachedCover) {
            cachedCover.style.setProperty('--vis-scale', '1');
            cachedCover.style.setProperty('--vis-brightness', '0.92');
            cachedCover.style.setProperty('--vis-border-glow', '6');
            cachedCover.style.setProperty('--vis-glow-size', '30');
            cachedCover.style.setProperty('--vis-intensity', '0.35');
        }
        if (cachedPlayer) {
            cachedPlayer.style.setProperty('--player-border-opacity', '0.12');
            cachedPlayer.style.setProperty('--player-inset-opacity', '0.1');
            cachedPlayer.style.setProperty('--player-glow', '80');
            cachedPlayer.style.setProperty('--player-glow2', '40');
            cachedPlayer.style.setProperty('--border-glow-opacity', '0.5');
        }
    }
}

async function processStatusQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (statusQueue.length > 0) {
        const { percentage, status } = statusQueue.shift();

        const progressBar = document.getElementById('loading-progress-bar');
        const statusText = document.getElementById('loading-status');
        const percentageText = document.getElementById('loading-percentage');

        // Only allow percentage to increase
        if (percentage > lastPercentage) {
            lastPercentage = percentage;
            if (progressBar) progressBar.style.width = lastPercentage + '%';
            if (percentageText) percentageText.textContent = Math.round(lastPercentage) + '%';
        }

        if (statusText && status) {
            statusText.style.opacity = '0';
            await new Promise(r => setTimeout(r, 150));
            statusText.textContent = status;
            statusText.style.opacity = '1';
        }

        // Wait a bit so the user can actually read the status
        await new Promise(r => setTimeout(r, 600));

        if (lastPercentage >= 100 && statusQueue.length === 0) {
            setTimeout(() => {
                const ls = document.querySelector('.loading-screen');
                if (ls && !IsChangingStation) {
                    ls.style.opacity = '0';
                    setTimeout(() => {
                        ls.style.display = 'none';
                        ls.style.opacity = '1';
                        // Reset for next time (e.g. station change)
                        lastPercentage = 0;
                    }, 500);
                }
            }, 500);
        }
    }
    isProcessingQueue = false;
}

function updateStatusBadge(status) {
    const badge = document.getElementById('stream-status-badge');
    const text = document.getElementById('status-text');
    if (!badge || !text) return;

    badge.classList.remove('online', 'loading', 'paused', 'offline');

    switch (status.toLowerCase()) {
        case 'playing':
        case 'online':
            badge.classList.add('online');
            text.textContent = 'ONLINE';
            updatePlayPauseUI('playing');
            break;
        case 'loading':
        case 'waiting':
        case 'buffering':
            badge.classList.add('loading');
            text.textContent = 'LOADING';
            updatePlayPauseUI('loading');
            break;
        case 'paused':
            badge.classList.add('paused');
            text.textContent = 'PAUSED';
            updatePlayPauseUI('paused');
            break;
        case 'offline':
        case 'error':
            badge.classList.add('offline');
            text.textContent = 'OFFLINE';
            updatePlayPauseUI('paused');
            break;
    }
}

function updatePlayPauseUI(state) {
    if (!playPauseIcon) return;
    const icon = playPauseIcon.querySelector('i');
    if (!icon) return;

    playPauseIcon.classList.remove('loading');

    if (state === 'playing') {
        icon.className = 'fas fa-pause';
    } else if (state === 'loading') {
        playPauseIcon.classList.add('loading');
    } else {
        icon.className = 'fas fa-play';
    }
}

function updateLoadingProgress(percentage, status) {
    statusQueue.push({ percentage, status });
    processStatusQueue();
}

function handleMainStreamMessage(event) {
    try {
        var jsonData = JSON.parse(event.data);
        if (jsonData.streamTitle) {
            var cleanedTitle = cleanTitle(jsonData.streamTitle);
            if (streamTitleElement) streamTitleElement.textContent = cleanedTitle;
            fetchBestCover(cleanedTitle); // Fetch and display the best cover from Spotify or YouTube
            updateFavoriteIcon(cleanedTitle); // Update the heart icon state for the new song

            // If we are still loading, this is a good sign we are ready
            const ls = document.querySelector('.loading-screen');
            if (ls && ls.style.display !== 'none' && !IsChangingStation) {
                updateLoadingProgress(100, "Ready to Play!");
            }
        }
    } catch (error) {
        console.error('Error processing data:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateLoadingProgress(5, "Initializing UI...");
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
    document.documentElement.style.setProperty('--active-station-glow-rgb', hexToRgb('#7300ff').join(','));

    updateLoadingProgress(70, "Connecting to Stream...");

    // Improved Metadata Connection with retry logic
    function setupMetadataConnection(url) {
        if (currentEventSource) currentEventSource.close();

        console.log("Initializing metadata connection to:", url);
        const es = new EventSource(url);
        currentEventSource = es;

        es.onmessage = handleMainStreamMessage;

        es.onerror = function (error) {
            console.error('Metadata connection error. Retrying in 5s...', error);
            es.close();

            // Check if we are still on the same station before retrying
            setTimeout(() => {
                const currentUrl = currentEventSource ? currentEventSource.url : null;
                if (currentUrl === url) {
                    setupMetadataConnection(url);
                }
            }, 5000);

            if (document.querySelector('.loading-screen') && document.querySelector('.loading-screen').style.display !== 'none') {
                updateLoadingProgress(100, "Connection issues detected - still trying...");
            }
        };

        return es;
    }

    eventSource = setupMetadataConnection('https://api.zeno.fm/mounts/metadata/subscribe/es4ngpu7ud6tv');

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
        setInterval(updateAllOnlineUsers, 10000); // Poll every 10 seconds for faster Chat API updates
    }, 6000);

    // Audio time update listener
    const currentTimeElement = document.getElementById('currentTime');
    if (audio && currentTimeElement) {
        audio.addEventListener('timeupdate', function () {
            currentTimeElement.textContent = formatTime(audio.currentTime);
        });
    }

    const savedVolume = localStorage.getItem('RadioGaming-volume');
    const initialVolume = savedVolume !== null ? parseFloat(savedVolume) : 0.1;
    changeVolume(initialVolume);
    const volumeSlider = document.querySelector('.volume-slider');
    if (volumeSlider) volumeSlider.value = initialVolume;

    // Fetch Spotify and Giphy tokens early for loading progress
    getSpotifyAccessToken();
    getGiphyAccessToken();

    // Mute/Restore icons setup
    const volDown = document.getElementById('volume-down');
    const volUp = document.getElementById('volume-up');
    if (volDown) volDown.addEventListener('click', () => window.muteVolume());
    if (volUp) volUp.addEventListener('click', () => window.restoreVolume());

    // Audio Event Listeners for Status Badge
    if (audio) {
        audio.addEventListener('playing', () => updateStatusBadge('playing'));
        audio.addEventListener('waiting', () => updateStatusBadge('loading'));
        audio.addEventListener('pause', () => updateStatusBadge('paused'));
        audio.addEventListener('error', () => updateStatusBadge('error'));
        audio.addEventListener('stalled', () => updateStatusBadge('loading'));
        audio.addEventListener('loadstart', () => updateStatusBadge('loading'));
        audio.addEventListener('canplay', () => {
            if (!audio.paused) updateStatusBadge('playing');
            else updateStatusBadge('paused');
        });
    }

    showNotification("Welcome to Radio GAMING!");

    // Fullscreen change detection (handles both F11 and Fullscreen API)
    function checkFullscreen() {
        // Check Fullscreen API
        const isFullscreenAPI = document.fullscreenElement || document.webkitFullscreenElement ||
            document.mozFullScreenElement || document.msFullscreenElement;

        // Check F11/browser fullscreen (window matches screen size)
        const isF11Fullscreen = window.innerWidth === screen.width && window.innerHeight === screen.height;

        if (isFullscreenAPI || isF11Fullscreen) {
            document.body.classList.add('is-fullscreen');
        } else {
            document.body.classList.remove('is-fullscreen');
        }
    }

    // Apply initial visualization state
    applyVisualizationState();

    // Initial history view mode setup based on saved preference
    const historyDrawer = document.getElementById('history-drawer');
    if (historyDrawer && historyViewMode === 'grid') {
        historyDrawer.classList.add('immersive-mode');
        const toggleIcon = document.querySelector('#view-mode-toggle i');
        if (toggleIcon) toggleIcon.className = 'fas fa-list';
    }

    // Listen for Fullscreen API changes
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    document.addEventListener('mozfullscreenchange', checkFullscreen);
    document.addEventListener('MSFullscreenChange', checkFullscreen);

    // Listen for F11/window resize
    window.addEventListener('resize', checkFullscreen);

    // Initial check
    checkFullscreen();

    // Start stats tracking
    startListeningTimer();
});

async function getSpotifyAccessToken() {
    const now = Date.now();
    let cachedToken = localStorage.getItem('RadioGaming-spotifyAccessToken');
    let tokenExpiresAt = parseInt(localStorage.getItem('RadioGaming-spotifyTokenExpiresAt'), 10) || 0;

    // Use cached token if valid
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
                updateLoadingProgress(60, "Spotify authentication successful");
            }
        }
        return cachedToken;
    }

    // If already fetching, return the existing promise
    if (tokenPromise) {
        console.log("Spotify token fetch already in progress, waiting...");
        return tokenPromise;
    }

    // Create a new promise for fetching the token
    tokenPromise = (async () => {
        updateLoadingProgress(40, "Authenticating with Spotify...");
        const tokenUrl = 'https://bot-launcher-discord-017f7d5f49d9.herokuapp.com/K5ApiManager/spotify/token';

        try {
            const response = await fetch(tokenUrl);
            const data = await response.json();

            if (response.ok) {
                const newToken = data.access_token;
                const expiresIn = data.expires_in || 3600;
                const createdAt = new Date(data.created_at).getTime();
                const newExpiry = createdAt + expiresIn * 1000 - 60000;

                const timeStr = Math.floor(expiresIn / 60) + "m " + (expiresIn % 60) + "s";
                const expiryDate = new Date(newExpiry).toLocaleString();
                console.log(`New Spotify token fetched. Valid for ${timeStr} (expires at ${expiryDate}).`);

                localStorage.setItem('RadioGaming-spotifyAccessToken', newToken);
                localStorage.setItem('RadioGaming-spotifyTokenExpiresAt', newExpiry.toString());

                const ls = document.querySelector('.loading-screen');
                if (ls && ls.style.display !== 'none' && !IsChangingStation) {
                    updateLoadingProgress(60, "Spotify authentication successful");
                }

                showNotification('Album Covers token fetched successfully!');
                return newToken;
            } else {
                throw new Error('Failed to fetch access token');
            }
        } catch (error) {
            console.error('Spotify Auth Error:', error);
            showNotification('Failed to fetch Album Covers token.');
            if (!IsChangingStation) updateLoadingProgress(60, "Spotify authentication failed");
            return null;
        } finally {
            tokenPromise = null; // Clear promise after completion
        }
    })();

    return tokenPromise;
}

async function getGiphyAccessToken() {
    const now = Date.now();
    let cachedToken = localStorage.getItem('RadioGaming-giphyAccessToken');
    let tokenExpiresAt = parseInt(localStorage.getItem('RadioGaming-giphyTokenExpiresAt'), 10) || 0;

    // Use cached token if valid
    if (cachedToken && now < tokenExpiresAt) {
        return cachedToken;
    }

    // If already fetching, return the existing promise
    if (giphyTokenPromise) {
        return giphyTokenPromise;
    }

    // Create a new promise for fetching the token
    giphyTokenPromise = (async () => {
        const tokenUrl = 'https://bot-launcher-discord-017f7d5f49d9.herokuapp.com/K5ApiManager/giphy/token';

        try {
            const response = await fetch(tokenUrl);
            const data = await response.json();

            if (response.ok) {
                const newToken = data.access_token;
                const expiresIn = data.expires_in || 3600;
                const createdAt = new Date(data.created_at).getTime();
                const newExpiry = createdAt + expiresIn * 1000 - 60000;

                localStorage.setItem('RadioGaming-giphyAccessToken', newToken);
                localStorage.setItem('RadioGaming-giphyTokenExpiresAt', newExpiry.toString());

                console.log(`New Giphy token fetched. Expires at ${new Date(newExpiry).toLocaleString()}.`);
                return newToken;
            } else {
                throw new Error('Failed to fetch Giphy access token');
            }
        } catch (error) {
            console.error('Giphy Auth Error:', error);
            return null;
        } finally {
            giphyTokenPromise = null; // Clear promise after completion
        }
    })();

    return giphyTokenPromise;
}

async function fetchAlbumCovers() {
    updateLoadingProgress(10, "Loading Artwork Data...");
    try {
        const response = await fetch('https://raw.githubusercontent.com/kubadoPL/Gaming-Radio/main/WebAPP/albumCovers.json?t=' + Date.now());
        const data = await response.json();
        Object.assign(albumCovers, data);
        console.log('Album covers fetched successfully:', albumCovers);
        updateLoadingProgress(30, "Artwork Data Loaded");
    } catch (error) {
        console.error('Error fetching album covers:', error);
        updateLoadingProgress(30, "Artwork Data Failed to Load");
    }
}

fetchAlbumCovers();

async function fetchBestCover(query) {
    const fallbackCover = 'https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png';
    const coverElem = document.getElementById('albumCover');

    try {
        const [spotifyRes, youtubeRes] = await Promise.allSettled([
            fetchSpotifyCoverData(query),
            fetchYouTubeCoverData(query)
        ]);

        let spotifyData = spotifyRes.status === 'fulfilled' ? spotifyRes.value : null;
        let youtubeData = youtubeRes.status === 'fulfilled' ? youtubeRes.value : null;
        let manualData = findBestManualMatch(query);

        let bestChoice = { url: fallbackCover, score: -1, source: 'fallback' };

        const MANUAL_MIN_SCORE = 0.6; // Only use manual cover if similarity is high enough
        if (manualData && manualData.score >= MANUAL_MIN_SCORE && manualData.score > bestChoice.score) {
            bestChoice = { url: manualData.url, score: manualData.score, source: 'manual' };
        }
        if (spotifyData && spotifyData.score > bestChoice.score) {
            bestChoice = { url: spotifyData.url, score: spotifyData.score, source: 'spotify' };
        }
        if (youtubeData && youtubeData.score > bestChoice.score) {
            bestChoice = { url: youtubeData.url, score: youtubeData.score, source: 'youtube' };
        }

        console.log(`[Cover Search] "${query}" | Scores -> Manual: ${manualData ? manualData.score.toFixed(2) : 'N/A'}, Spotify: ${spotifyData ? spotifyData.score.toFixed(2) : 'N/A'}, YouTube: ${youtubeData ? youtubeData.score.toFixed(2) : 'N/A'} | Result: ${bestChoice.source} (${bestChoice.score.toFixed(2)})`);

        if (coverElem) coverElem.src = bestChoice.url;
        updateMediaSessionMetadata(query, bestChoice.url);
        // Add to song history
        addToSongHistory(query, bestChoice.url);
    } catch (error) {
        console.error('Error fetching best cover:', error);
        if (coverElem) coverElem.src = fallbackCover;
        updateMediaSessionMetadata(query, fallbackCover);
        addToSongHistory(query, fallbackCover);
    }
}

function findBestManualMatch(query) {
    let bestUrl = null;
    let highestScore = -1;

    for (const [key, url] of Object.entries(albumCovers)) {
        const score = getSimilarityScore(query, key);
        if (score > highestScore) {
            highestScore = score;
            bestUrl = url;
        }
    }

    return highestScore > 0 ? { url: bestUrl, score: highestScore } : null;
}

async function fetchSpotifyCoverData(query) {
    try {
        const accessToken = await getSpotifyAccessToken();
        if (!accessToken) return null;

        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
        const response = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        const data = await response.json();

        if (data.tracks && data.tracks.items.length > 0) {
            const bestMatchData = findBestTrackMatchWithScore(query, data.tracks.items);
            return {
                url: bestMatchData.track.album.images[0].url,
                score: bestMatchData.score
            };
        }
    } catch (e) {
        console.error('Spotify Fetch Error:', e);
    }
    return null;
}

async function fetchYouTubeCoverData(query) {
    if (!YOUTUBE_API_KEY) return null;

    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
            let bestMatch = data.items[0];
            let highestScore = -1;

            data.items.forEach(item => {
                const score = getSimilarityScore(query, item.snippet.title);
                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = item;
                }
            });

            return {
                url: bestMatch.snippet.thumbnails.high ? bestMatch.snippet.thumbnails.high.url : bestMatch.snippet.thumbnails.default.url,
                score: highestScore
            };
        }
    } catch (e) {
        console.error('YouTube Fetch Error:', e);
    }
    return null;
}

function findBestTrackMatchWithScore(query, tracks) {
    let bestMatch = tracks[0];
    let highestScore = -1;

    tracks.forEach(track => {
        const trackTitle = `${track.artists[0].name} - ${track.name}`;
        const score = getSimilarityScore(query, trackTitle);

        if (score > highestScore) {
            highestScore = score;
            bestMatch = track;
        }
    });

    return { track: bestMatch, score: highestScore };
}

// Obsolete, replaced by fetchBestCover
async function fetchSpotifyCover(query) {
    return fetchBestCover(query);
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
            if (audio) { audio.play(); updatePlayPauseUI('playing'); }
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (audio) { audio.pause(); updatePlayPauseUI('paused'); }
        });
        navigator.mediaSession.setActionHandler('stop', () => {
            if (audio) { audio.pause(); updatePlayPauseUI('paused'); }
        });
    }
}

function showNotification(message, icon = 'fas fa-bell') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = 'notificationPopup';
    notification.innerHTML = `
        <div class="notification-icon"><i class="${icon}"></i></div>
        <div class="notification-message">${message}</div>
        <div class="notification-close" onclick="this.parentElement.classList.add('exiting'); setTimeout(() => this.parentElement.remove(), 500);"><i class="fas fa-times"></i></div>
    `;

    // Apply active station color for border
    const activeColor = getComputedStyle(document.documentElement).getPropertyValue('--active-station-color');
    notification.style.borderLeftColor = activeColor;

    container.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('exiting');
        setTimeout(() => {
            notification.remove();
        }, 500); // Wait for exit animation
    }, 5000);
}


function playPause() {
    if (!audio) return;
    if (audio.paused) {
        audio.load();
        audio.play();
        updatePlayPauseUI('loading');
        showNotification("Now Playing!");

        // Add the currently displayed song to history when play is pressed
        // (metadata was received while paused, so we need to trigger this manually)
        const currentTitle = streamTitleElement ? streamTitleElement.textContent : '';
        const currentCover = document.getElementById('albumCover') ? document.getElementById('albumCover').src : '';
        if (currentTitle && currentTitle !== 'Loading...' && currentTitle !== '') {
            lastHistorySongTitle = ''; // Reset so addToSongHistory will accept it
            // Use a short delay to let audio.paused become false
            setTimeout(() => {
                addToSongHistory(currentTitle, currentCover);
            }, 300);
        }
    } else {
        audio.pause();
        updatePlayPauseUI('paused');
        showNotification("Paused!");
    }

    // Initialize/Resume visualizer on user interaction
    if (!isVisualizerInitialized) {
        initVisualizer();
    } else if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function initVisualizer() {
    if (isVisualizerInitialized || !audio) return;

    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        source = audioCtx.createMediaElementSource(audio);
        gainNode = audioCtx.createGain();

        source.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        // Map audio volume to gainNode and set element volume to 1
        gainNode.gain.value = previousVolume;
        audio.volume = 1;

        analyser.fftSize = 32;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        isVisualizerInitialized = true;
        animateVisualizer();
    } catch (e) {
        console.error("Failed to initialize visualizer:", e);
    }
}

let lastVisScale = 1;
let lastVisIntensity = 0.35;
let lastVisGlow = 30;

let cachedCover = null;
let cachedPlayer = null;

function animateVisualizer() {
    requestAnimationFrame(animateVisualizer);

    if (!isVisualizerEnabled) return;

    if (audio && !audio.paused && dataArray) {
        analyser.getByteFrequencyData(dataArray);

        // Focus on bass frequencies (drums)
        let bassSum = 0;
        const bassBins = 6;
        for (let i = 0; i < bassBins; i++) {
            bassSum += dataArray[i];
        }
        let bassAverage = bassSum / bassBins;

        const threshold = 200;
        let triggerValue = 0;

        if (bassAverage > threshold) {
            triggerValue = Math.min(1, (bassAverage - threshold) / (255 - threshold) * 1.2);
        }

        if (!window.lastTriggerValue) window.lastTriggerValue = 0;
        window.lastTriggerValue = window.lastTriggerValue * 0.75 + triggerValue * 0.25;
        const v = window.lastTriggerValue;

        // Pulse mode effects (cover glow, player glow)
        const scale = 1 + v * 0.08;
        const glowSize = 30 + v * 80;
        const borderGlow = 6 + v * 18;
        const intensity = 0.35 + v * 0.35;
        const brightness = 0.92 + v * 0.18;

        if (Math.abs(scale - lastVisScale) > 0.001 || Math.abs(intensity - lastVisIntensity) > 0.01) {
            if (!cachedCover) cachedCover = document.getElementById('albumCover');
            if (!cachedPlayer) cachedPlayer = document.querySelector('.audio-player');

            if (cachedCover) {
                cachedCover.style.setProperty('--vis-scale', scale);
                cachedCover.style.setProperty('--vis-brightness', brightness);
                cachedCover.style.setProperty('--vis-border-glow', borderGlow);
                cachedCover.style.setProperty('--vis-glow-size', glowSize);
                cachedCover.style.setProperty('--vis-intensity', intensity);
            }

            if (cachedPlayer) {
                const playerGlowSize = 80 + v * 120;
                const playerGlowSize2 = 40 + v * 80;
                const playerBorderOpacity = 0.12 + v * 0.15;
                const playerInsetOpacity = 0.1 + v * 0.1;
                const borderGlowOpacity = 0.5 + v * 0.5;

                cachedPlayer.style.setProperty('--player-border-opacity', playerBorderOpacity);
                cachedPlayer.style.setProperty('--player-inset-opacity', playerInsetOpacity);
                cachedPlayer.style.setProperty('--player-glow', playerGlowSize);
                cachedPlayer.style.setProperty('--player-glow2', playerGlowSize2);
                cachedPlayer.style.setProperty('--border-glow-opacity', borderGlowOpacity);
            }

            lastVisScale = scale;
            lastVisIntensity = intensity;
        }
    }
}

let previousVolume = parseFloat(localStorage.getItem('RadioGaming-volume')) || 0.1;

function changeVolume(value) {
    const vol = parseFloat(value);
    if (gainNode) {
        gainNode.gain.value = vol;
    } else if (audio) {
        audio.volume = vol;
    }
    if (vol > 0) {
        previousVolume = vol;
        localStorage.setItem('RadioGaming-volume', vol);
    }
}

// Restore volume when clicking the volume-up icon
window.restoreVolume = function () {
    const vol = previousVolume || 0.1;
    if (gainNode) {
        gainNode.gain.value = vol;
    } else if (audio) {
        audio.volume = vol;
    }
    document.querySelector('.volume-slider').value = vol;
    showNotification("Restoring volume!");
};

// Mute volume when clicking the volume-down icon
window.muteVolume = function () {
    if (gainNode) {
        previousVolume = gainNode.gain.value;
        gainNode.gain.value = 0;
    } else if (audio) {
        previousVolume = audio.volume;
        audio.volume = 0;
    }
    document.querySelector('.volume-slider').value = 0;
    showNotification("Muting volume!");
};

function changeStation(source, name, metadataURL) {
    if (cooldown) return;
    IsChangingStation = true;
    lastActiveListenerCount = -1; // Reset listener count tracker for new station

    const stationDetails = {
        "https://stream.zeno.fm/es4ngpu7ud6tv": {
            backgroundImage: "url('https://radio-gaming.stream/Images/Radio-Gaming-Background.webp')",
            borderColor: "#7300ff",
            secondaryColor: "#a855f7",
            glowColor: "rgba(115, 0, 255, 0.6)",
            loadingBackgroundColor: "#7300ff",
            liveEmoji: "🟣LIVE",
            streamTitleColor: "#7300ff"
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
    document.documentElement.style.setProperty('--active-station-glow-rgb', hexToRgb(config.borderColor).join(','));
    document.documentElement.style.setProperty('--scrollbar-thumb-color', config.loadingBackgroundColor);

    const ls = document.querySelector('.loading-screen');
    if (ls) {
        ls.style.backgroundColor = config.loadingBackgroundColor;
        ls.style.display = 'flex';
        updateLoadingProgress(10, "Switching to " + name + "...");
    }
    updateStatusBadge('loading');

    document.body.style.backgroundImage = config.backgroundImage;
    document.querySelectorAll('.station-photo').forEach(photo => {
        photo.classList.toggle('active', photo.getAttribute('onclick').includes(source));
        if (photo.classList.contains('active')) photo.style.borderColor = config.borderColor;
    });

    const liveIndicator = document.getElementById('liveIndicator');
    if (liveIndicator) liveIndicator.textContent = config.liveEmoji;
    if (streamTitleElement) streamTitleElement.style.color = config.streamTitleColor;

    if (audio) {
        updateLoadingProgress(40, "Buffering Audio Stream...");
        audio.src = source;
        audio.load();
        audio.play().catch(e => console.error("Playback failed:", e));
        updatePlayPauseUI('loading');

        // Initialize/Resume visualizer
        if (!isVisualizerInitialized) {
            initVisualizer();
        } else if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }
    if (stationName) stationName.textContent = name;
    showNotification("Changing station to: " + name);

    if (currentEventSource) currentEventSource.close();

    // Use the same robust connection logic as initial load
    const setupMetadataConnection = (url) => {
        const es = new EventSource(url);
        currentEventSource = es;
        es.onmessage = handleMainStreamMessage;
        es.onerror = (err) => {
            console.error("Metadata retry for station:", url);
            es.close();
            setTimeout(() => {
                if (currentEventSource === es) setupMetadataConnection(url);
            }, 5000);
        };
        return es;
    };

    setupMetadataConnection(metadataURL);

    cooldown = true;
    const bgUrl = config.backgroundImage.slice(5, -2);
    const backgroundImg = new Image();
    backgroundImg.src = bgUrl;
    backgroundImg.onload = () => {
        updateLoadingProgress(80, "Environment Ready...");
        setTimeout(() => {
            updateLoadingProgress(100, "Enjoy your music!");
            cooldown = false;
            IsChangingStation = false;
        }, 1200);
    };
    backgroundImg.onerror = () => {
        updateLoadingProgress(100, "Ready!");
        cooldown = false;
        IsChangingStation = false;
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

/**
 * Finds the most similar track from Spotify search results based on the query.
 */
function findBestTrackMatch(query, tracks) {
    let bestMatch = tracks[0];
    let highestScore = -1;

    tracks.forEach(track => {
        // Build a full title for comparison: "Artist - Track Name"
        const trackTitle = `${track.artists[0].name} - ${track.name}`;
        const score = getSimilarityScore(query, trackTitle);

        if (score > highestScore) {
            highestScore = score;
            bestMatch = track;
        }
    });

    console.log(`Best match for "${query}" is "${bestMatch.artists[0].name} - ${bestMatch.name}" (Similarity Score: ${highestScore.toFixed(2)})`);
    return bestMatch;
}

/**
 * Calculates a simple similarity score between two strings based on shared words.
 */
function getSimilarityScore(s1, s2) {
    if (!s1 || !s2) return 0;

    const normalize = (s) => s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const n1 = normalize(s1);
    const n2 = normalize(s2);

    if (n1 === n2) return 1.0;

    const words1 = n1.split(' ');
    const words2 = n2.split(' ');

    const intersection = words1.filter(w => words2.includes(w));
    return (intersection.length * 2) / (words1.length + words2.length); // Dice's coefficient
}

async function metaDataUrlToStationName(url) {
    if (url.includes('es4ngpu7ud6tv')) return 'Radio GAMING';
    if (url.includes('pfg9eajshnjtv')) return 'Radio GAMING DARK';
    if (url.includes('5nhy0myl4jpuv')) return 'Radio GAMING MARON FM';
    return 'Unknown Station';
}

async function fetchSpotifyCovertooltip(query, tooltipElement) {
    const fallbackCover = 'https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png';
    const img = tooltipElement.querySelector('.tooltip-cover');

    try {
        const [spotifyRes, youtubeRes] = await Promise.allSettled([
            fetchSpotifyCoverData(query),
            fetchYouTubeCoverData(query)
        ]);

        let spotifyData = spotifyRes.status === 'fulfilled' ? spotifyRes.value : null;
        let youtubeData = youtubeRes.status === 'fulfilled' ? youtubeRes.value : null;
        let manualData = findBestManualMatch(query);

        let bestUrl = fallbackCover;
        let highestScore = -1;
        let chosenSource = 'fallback';

        if (manualData && manualData.score > highestScore) {
            highestScore = manualData.score;
            bestUrl = manualData.url;
            chosenSource = 'manual';
        }
        if (spotifyData && spotifyData.score > highestScore) {
            highestScore = spotifyData.score;
            bestUrl = spotifyData.url;
            chosenSource = 'spotify';
        }
        if (youtubeData && youtubeData.score > highestScore) {
            highestScore = youtubeData.score;
            bestUrl = youtubeData.url;
            chosenSource = 'youtube';
        }

        console.log(`[Tooltip Search] "${query}" | Scores -> Manual: ${manualData ? manualData.score.toFixed(2) : 'N/A'}, Spotify: ${spotifyData ? spotifyData.score.toFixed(2) : 'N/A'}, YouTube: ${youtubeData ? youtubeData.score.toFixed(2) : 'N/A'} | Result: ${chosenSource} (${highestScore.toFixed(2)})`);

        if (img) img.src = bestUrl;
    } catch (e) {
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
                if (trackElem) {
                    trackElem.textContent = cleaned;
                    if (isFavorited(cleaned)) {
                        const heart = document.createElement('i');
                        heart.className = 'fas fa-heart';
                        heart.style.color = 'var(--active-station-color)';
                        heart.style.marginLeft = '6px';
                        heart.style.filter = 'drop-shadow(0 0 5px var(--active-station-glow))';
                        trackElem.appendChild(heart);
                    }
                }
                await fetchSpotifyCovertooltip(cleaned, tooltipElement);
            }
        } catch (e) { console.error(e); }
    };
    es.onerror = () => es.close();
    return es;
}

function getStationId(sName) {
    const nameToId = {
        'Radio GAMING': 'RADIOGAMING',
        'Radio GAMING DARK': 'RADIOGAMINGDARK',
        'Radio GAMING MARON FM': 'RADIOGAMINGMARONFM'
    };
    return nameToId[sName] || sName.replace(/\s+/g, '').toUpperCase();
}

async function updateOnlineUsersTooltip(tooltipElement, sName, metadataUrl) {
    try {
        const stationId = getStationId(sName);

        // ZenoFM Cache (40s)
        const zenoCacheKey = `zenoCount_${stationId}`;
        const zenoCached = JSON.parse(localStorage.getItem(zenoCacheKey) || 'null');

        let zenoCount = 0;
        let shouldFetchZeno = !zenoCached || (Date.now() - zenoCached.timestamp > 40 * 1000);

        if (!shouldFetchZeno) {
            zenoCount = zenoCached.count;
        }

        const currentPlayingName = (document.getElementById('StationNameInh1')?.textContent || 'Radio GAMING').trim();
        const currentPlayingId = getStationId(currentPlayingName);

        const headers = {
            'X-Playing-Station': currentPlayingName
        };

        // Only send the token if we are checking the station we are ACTUALLY listening to 
        // OR the one we are currently viewing in the chat window.
        // This prevents us from appearing "online" in every station at once during background checks.
        if (discordAuthToken && (stationId === currentPlayingId || stationId === currentChatStation)) {
            headers['Authorization'] = `Bearer ${discordAuthToken}`;
        }

        // Fetch Logic
        const fetchPromises = [
            fetch(`${CHAT_API_BASE}/chat/poll/${stationId}?since=${Date.now()}`, { headers }).then(r => r.json())
        ];

        if (shouldFetchZeno) {
            fetchPromises.push(fetch('https://bot-launcher-discord-017f7d5f49d9.herokuapp.com/ZenoFMApi/get-sum?station=' + stationId).then(r => r.json()));
        }

        const results = await Promise.allSettled(fetchPromises);

        // Handle Chat Data (always the first promise)
        let chatCount = 0;
        if (results[0].status === 'fulfilled') {
            chatCount = results[0].value.online_count !== undefined ? results[0].value.online_count : 0;
            console.log(`[OnlineCountDebug] ${sName} (Chat API - Realtime):`, chatCount);
        }

        // Handle Zeno Data (if requested, it's the second promise)
        if (shouldFetchZeno && results[1] && results[1].status === 'fulfilled') {
            zenoCount = results[1].value.total_sum || 0;
            localStorage.setItem(zenoCacheKey, JSON.stringify({ count: zenoCount, timestamp: Date.now() }));
            console.log(`[OnlineCountDebug] ${sName} (ZenoFM - Refreshed):`, zenoCount);
        } else if (!shouldFetchZeno) {
            console.log(`[OnlineCountDebug] ${sName} (ZenoFM - Cached):`, zenoCount);
        }

        const finalCount = Math.max(zenoCount, chatCount);
        console.log(`[OnlineCountDebug] ${sName} -> Tooltip: ${zenoCount}, Chat: ${finalCount}`);

        updateTooltip(tooltipElement, zenoCount, finalCount, sName);
    } catch (e) {
        console.error(`[OnlineCountDebug] Error fetching count for ${sName}:`, e);
        updateTooltip(tooltipElement, 0, 0, sName, true);
    }
}

function updateTooltip(tooltipElement, zenoCount, finalCount, sName, isError = false) {
    // Update tooltip UI (Main Page - ONLY ZenoFM Listeners)
    if (tooltipElement) {
        const userElem = tooltipElement.querySelector('.tooltip-Online-Users');
        if (userElem) {
            if (isError) {
                userElem.textContent = 'Error loading';
            } else {
                userElem.textContent = `Live Listeners: ${zenoCount}`;
                userElem.style.color = zenoCount > 0 ? '#00ff8c' : 'rgba(255,255,255,0.4)';
            }
        }
    }

    // Update channel dropdown counts (Chat - Combined Max)
    const dropdownOptionBadge = document.querySelector(`.channel-option[data-station="${sName}"] .chat-online-badge`);
    if (dropdownOptionBadge) {
        if (isError) {
            dropdownOptionBadge.textContent = '!';
        } else {
            dropdownOptionBadge.textContent = finalCount;
        }
    }

    if (!isError) {
        // Sync with the main chat online badge if this is the currently viewing station
        const currentViewingStationName = document.getElementById('chat-current-station')?.textContent || '';
        if (sName === currentViewingStationName) {
            const chatOnlineCountElem = document.getElementById('chat-online-count');
            if (chatOnlineCountElem) chatOnlineCountElem.textContent = finalCount;
        }

        // Notify based on listeners specifically
        const currentPlayingStation = stationName ? stationName.textContent : '';
        if (sName === currentPlayingStation && zenoCount !== null) {
            const now = Date.now();
            const timeSinceLastNotify = now - lastListenerNotifyTime;

            if (lastActiveListenerCount === -1 || (zenoCount !== lastActiveListenerCount && timeSinceLastNotify > 120000)) {
                if (zenoCount > 0) {
                    showNotification(`There are <span class="notification-listeners-count">${zenoCount}</span> live listeners on ${sName}!`, 'fas fa-users');
                }
                lastActiveListenerCount = zenoCount;
                lastListenerNotifyTime = now;
            }
        }
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

function hexToRgb(color) {
    color = color.trim();
    if (color.startsWith('rgba')) {
        return color.match(/\d+/g).slice(0, 3);
    }
    if (color.startsWith('rgb')) {
        return color.match(/\d+/g);
    }
    let hex = color.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
}

// ========================
// DISCORD AUTH & CHAT SYSTEM
// ========================

const CHAT_API_BASE = 'https://bot-launcher-discord-017f7d5f49d9.herokuapp.com/DiscordAuthChatApi';
let discordAuthToken = localStorage.getItem('RadioGaming-discordAuthToken');
let discordUser = null;
let currentChatStation = 'RADIOGAMING';
let isSongShared = false;
let sharedSongData = null; // Stores specific song data (from history) if sharing specific song

window.toggleSongShare = function (forceState = null, song = null) {
    if (forceState !== null) {
        isSongShared = forceState;
    } else {
        isSongShared = !isSongShared;
    }

    const shareBtn = document.getElementById('chat-share-song-btn');
    const preview = document.getElementById('chat-song-preview');
    const previewText = preview.querySelector('.preview-song-name');

    if (isSongShared) {
        let displayTitle = '';

        if (song) {
            sharedSongData = {
                title: song.title,
                artwork: song.cover,
                station: song.station
            };
            displayTitle = song.title;
        } else {
            const currentSong = document.getElementById('streamTitle').textContent;
            if (!currentSong || currentSong === 'Loading...' || currentSong === '') {
                showNotification('Wait for a song to load before sharing!', 'fas fa-info-circle');
                isSongShared = false;
                return;
            }
            sharedSongData = null; // Use live data
            displayTitle = currentSong;
        }

        shareBtn.classList.add('active');
        preview.classList.remove('hidden');
        previewText.textContent = `Sharing: ${displayTitle}`;
        showNotification(`${song ? 'Selected' : 'Current'} song attached to your message!`, 'fas fa-music');
    } else {
        sharedSongData = null;
        shareBtn.classList.remove('active');
        preview.classList.add('hidden');
    }
};

// Check for auth callback on page load
document.addEventListener('DOMContentLoaded', () => {
    handleAuthCallback();
    checkExistingSession();

    // Start polling automatically for everyone (guests included)
    // Only if chat visibility logic doesn't handle it first
    if (!chatPollingInterval) {
        initializeChatPolling();
    }
});

function handleAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth_token');
    const authError = urlParams.get('auth_error');

    if (authToken) {
        localStorage.setItem('RadioGaming-discordAuthToken', authToken);
        discordAuthToken = authToken;
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
        showNotification('Successfully logged in with Discord!', 'fab fa-discord');
        checkExistingSession();
    }

    if (authError) {
        showNotification('Login failed: ' + authError, 'fas fa-exclamation-triangle');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

async function checkExistingSession() {
    if (!discordAuthToken) {
        updateAuthUI(false);
        return;
    }

    try {
        const response = await fetch(`${CHAT_API_BASE}/discord/user`, {
            headers: {
                'Authorization': `Bearer ${discordAuthToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            discordUser = data.user;
            updateAuthUI(true);
            initializeChatPolling();
        } else {
            // Token invalid or expired
            localStorage.removeItem('RadioGaming-discordAuthToken');
            discordAuthToken = null;
            updateAuthUI(false);
        }
    } catch (error) {
        console.error('Error checking session:', error);
        updateAuthUI(false);
    }
}

function updateAuthUI(isLoggedIn) {
    const loginBtn = document.getElementById('discord-login-btn');
    const userInfo = document.getElementById('discord-user-info');
    const userAvatar = document.getElementById('discord-user-avatar');
    const userName = document.getElementById('discord-user-name');
    const chatAuthPrompt = document.getElementById('chat-auth-prompt');
    const chatMain = document.getElementById('chat-main');
    const chatUserAvatar = document.getElementById('chat-user-avatar');

    if (isLoggedIn && discordUser) {
        if (loginBtn) loginBtn.classList.add('hidden');
        if (userInfo) userInfo.classList.remove('hidden');
        if (userAvatar) userAvatar.src = discordUser.avatar_url;
        if (userName) userName.textContent = discordUser.global_name || discordUser.username;
        if (chatAuthPrompt) chatAuthPrompt.classList.add('hidden');
        if (chatMain) chatMain.classList.remove('hidden');
        if (chatUserAvatar) chatUserAvatar.src = discordUser.avatar_url;

        // If user info is fetched, we can pre-check guilds in background with cache
        SHARE_GUILDS.forEach(guild => checkUserInGuild(guild.id));
    } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (userInfo) userInfo.classList.add('hidden');
        if (chatAuthPrompt) chatAuthPrompt.classList.remove('hidden');
        if (chatMain) chatMain.classList.add('hidden');
    }
}

window.openDiscordProfileModal = async function () {
    if (!discordUser) return;

    // Show modal
    const overlay = document.getElementById('discord-profile-modal-overlay');
    overlay.classList.remove('hidden');

    // Populate data
    const modalBanner = document.querySelector('.profile-banner');
    if (modalBanner) {
        if (discordUser.banner_url) {
            modalBanner.style.backgroundImage = `url(${discordUser.banner_url})`;
            modalBanner.style.backgroundSize = 'cover';
            modalBanner.style.backgroundPosition = 'center';
            modalBanner.style.backgroundColor = 'transparent';
        } else if (discordUser.accent_color) {
            const hexColor = '#' + discordUser.accent_color.toString(16).padStart(6, '0');
            modalBanner.style.backgroundImage = 'none';
            modalBanner.style.backgroundColor = hexColor;
        } else {
            modalBanner.style.backgroundImage = 'none';
            modalBanner.style.backgroundColor = 'var(--active-station-color)';
        }
    }

    document.getElementById('modal-discord-avatar').src = discordUser.avatar_url;
    document.getElementById('modal-discord-name').textContent = discordUser.global_name || discordUser.username;
    document.getElementById('modal-discord-username').textContent = `@${discordUser.username}`;

    // Clear and reset guild list
    const guildListContainer = document.getElementById('profile-guild-list');
    guildListContainer.innerHTML = '';

    // Check membership for all guilds in SHARE_GUILDS - Serialized to avoid concurrent request issues
    for (const guild of SHARE_GUILDS) {
        const item = document.createElement('div');
        item.className = 'membership-badge loading';
        item.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Checking...</span>';
        guildListContainer.appendChild(item);

        try {
            const result = await checkUserInGuild(guild.id, true);

            if (result.inGuild) {
                item.className = 'membership-badge member';
                item.innerHTML = `
                ${result.guildIcon ? `<img src="${result.guildIcon}" class="membership-guild-icon" alt="Icon">` : '<i class="fab fa-discord"></i>'}
                <div class="membership-info">
                    <div class="membership-guild-name">${result.guildName || GUILD_DISPLAY_NAMES[guild.id] || `Server ${guild.id}`}</div>
                    <div class="membership-status-text">Official Server Member</div>
                </div>
            `;
            } else {
                item.className = 'membership-badge not-member';
                item.innerHTML = `
                ${result.guildIcon ? `<img src="${result.guildIcon}" class="membership-guild-icon grayscale" alt="Icon">` : '<i class="fas fa-times-circle"></i>'}
                <div class="membership-info">
                    <div class="membership-guild-name">${result.guildName || GUILD_DISPLAY_NAMES[guild.id] || `Server ${guild.id}`}</div>
                    <div class="membership-status-text">Not a member</div>
                </div>
            `;
            }
        } catch (err) {
            console.error('Error checking guild:', guild.id, err);
            item.className = 'membership-badge not-member';
            item.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <div class="membership-info">
                    <div class="membership-guild-name">${GUILD_DISPLAY_NAMES[guild.id] || `Server ${guild.id}`}</div>
                    <div class="membership-status-text">Connection error</div>
                </div>
            `;
        }
    }
};

window.closeDiscordProfileModal = function (event) {
    if (event && event.target !== event.currentTarget) return;
    const overlay = document.getElementById('discord-profile-modal-overlay');
    overlay.classList.add('hidden');
};

window.initiateDiscordLogin = async function () {
    try {
        const response = await fetch(`${CHAT_API_BASE}/discord/login`);
        const data = await response.json();

        if (data.oauth_url) {
            window.location.href = data.oauth_url;
        } else {
            showNotification('Failed to initialize Discord login', 'fas fa-exclamation-triangle');
        }
    } catch (error) {
        console.error('Discord login error:', error);
        showNotification('Failed to connect to auth server', 'fas fa-exclamation-triangle');
    }
};

window.logoutDiscord = async function () {
    try {
        if (discordAuthToken) {
            await fetch(`${CHAT_API_BASE}/discord/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${discordAuthToken}`
                }
            });
        }
    } catch (error) {
        console.error('Logout error:', error);
    }

    // Clean up
    localStorage.removeItem('RadioGaming-discordAuthToken');
    // Clear all guild check caches for this user
    if (discordUser) {
        SHARE_GUILDS.forEach(g => localStorage.removeItem(`RadioGaming-guildCheck-${discordUser.id}-${g.id}`));
    }
    discordAuthToken = null;
    discordUser = null;

    stopChatPolling();

    updateAuthUI(false);
    showNotification('Logged out successfully', 'fas fa-sign-out-alt');
};

// Discord Webhook Share System
let lastDiscordShareTime = parseInt(localStorage.getItem('RadioGaming-lastDiscordShareTime')) || 0;
const DISCORD_SHARE_COOLDOWN = 120000; // 120 seconds in ms
const GUILD_CHECK_CACHE_DURATION = 120000; // 2 minutes cache (reduced for better responsiveness)

const GUILD_DISPLAY_NAMES = {
    '637696690853511184': 'Supported Server 1',
    '706179463288979519': 'Supported Server 2'
};

// Guild list — each entry has a guild ID, webhook URL, and membership gating flag
// Server name and icon are fetched live from Discord's API
const SHARE_GUILDS = [
    {
        id: '637696690853511184',
        webhookUrl: 'https://discord.com/api/webhooks/1470563794424955069/Z5r9gtLBDyrzSYFUBQ_04bQwE5MaW7pzlTUfbcplEXpKEwo9lbGo2XPh8qpWkJJWaWMz',
        requireGuildMembership: true
    },
    {
        id: '706179463288979519',
        webhookUrl: 'https://discord.com/api/webhooks/1470802278515605647/uEqVAqq3IxU5L20IQKeLnckAj1WyHWQOU36wsq4a94rzOwmr5cfZozUaOpoL6jcgGPws',
        requireGuildMembership: true
    }
];

async function checkUserInGuild(guildId, force = false) {
    if (!discordAuthToken) return { inGuild: false, guildName: null, guildIcon: null };

    // Check cache first (include user ID to prevent cross-account cache issues)
    const userId = discordUser ? discordUser.id : 'anon';
    const cacheKey = `RadioGaming-guildCheck-${userId}-${guildId}`;
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');

    if (!force && cached && (Date.now() - cached.timestamp < GUILD_CHECK_CACHE_DURATION)) {
        return cached;
    }

    try {
        const response = await fetch(`${CHAT_API_BASE}/discord/check-guild/${guildId}`, {
            headers: {
                'Authorization': `Bearer ${discordAuthToken}`
            }
        });
        const data = await response.json();
        const result = {
            inGuild: data.in_guild === true,
            guildName: data.guild_name || null,
            guildIcon: data.guild_icon || null,
            timestamp: Date.now()
        };

        // Cache result
        localStorage.setItem(cacheKey, JSON.stringify(result));

        return result;
    } catch (error) {
        console.error('Guild check error:', error);
        return { inGuild: false, guildName: null, guildIcon: null };
    }
}

function getShareEmbedData() {
    const stationNameText = document.getElementById('StationNameInh1').textContent;
    const songTitle = document.getElementById('streamTitle').textContent;
    const albumCover = document.getElementById('albumCover').src;
    const radioUrl = window.location.origin + window.location.pathname;

    let embedColor = 7536895; // Default Purple (#7300ff)
    let webhookUser = "Radio GAMING";
    let webhookAvatar = "https://radio-gaming.stream/Images/Logos/Radio-Gaming-Logo.webp";

    if (stationNameText.includes('DARK')) {
        embedColor = 2702538;
        webhookUser = "Radio GAMING DARK";
        webhookAvatar = "https://radio-gaming.stream/Images/Logos/Radio-Gaming-dark-logo.webp";
    } else if (stationNameText.includes('MARON')) {
        embedColor = 2566486;
        webhookUser = "Radio GAMING MARON FM";
        webhookAvatar = "https://radio-gaming.stream/Images/Logos/Radio-Gaming-Maron-fm-logo.webp";
    }

    return { stationNameText, songTitle, albumCover, radioUrl, embedColor, webhookUser, webhookAvatar };
}

async function shareToWebhook(webhookUrl) {
    const { stationNameText, songTitle, albumCover, radioUrl, embedColor, webhookUser, webhookAvatar } = getShareEmbedData();

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: webhookUser,
                avatar_url: webhookAvatar,
                embeds: [{
                    author: {
                        name: `${discordUser.global_name || discordUser.username} is sharing...`,
                        icon_url: discordUser.avatar_url
                    },
                    title: `Listening to ${stationNameText}`,
                    description: `🎵 Currently playing: **${songTitle}**\n\n[▶️ **Listen to Radio Gaming Also**](${radioUrl})`,
                    url: radioUrl,
                    color: embedColor,
                    thumbnail: {
                        url: albumCover
                    },
                    footer: {
                        text: "Shared via Radio GAMING",
                        icon_url: "https://radio-gaming.stream/Images/Logos/Radio-Gaming-Logo.webp"
                    },
                    timestamp: new Date().toISOString()
                }]
            })
        });

        if (response.ok) {
            lastDiscordShareTime = Date.now();
            localStorage.setItem('RadioGaming-lastDiscordShareTime', lastDiscordShareTime.toString());
            closeShareModal();
            showNotification('Successfully shared to Discord!', 'fab fa-discord');
        } else {
            const data = await response.json();
            console.error('Webhook error:', data);
            showNotification('Failed to share to Discord', 'fas fa-exclamation-triangle');
        }
    } catch (error) {
        console.error('Share on Discord error:', error);
        showNotification('Error connecting to Discord', 'fas fa-exclamation-triangle');
    }
}

window.openShareModal = function () {
    if (!discordAuthToken) {
        showNotification('Please login with Discord to share!', 'fas fa-exclamation-triangle');
        return;
    }

    const now = Date.now();
    if (now - lastDiscordShareTime < DISCORD_SHARE_COOLDOWN) {
        const remaining = Math.ceil((DISCORD_SHARE_COOLDOWN - (now - lastDiscordShareTime)) / 1000);
        showNotification(`Please wait ${remaining} seconds before sharing again!`, 'fas fa-clock');
        return;
    }

    const songTitle = document.getElementById('streamTitle').textContent;
    if (!songTitle || songTitle === 'Loading...' || songTitle === '') {
        showNotification('Wait for a song to load before sharing!', 'fas fa-info-circle');
        return;
    }

    // Populate guild list
    const guildList = document.getElementById('share-guild-list');
    guildList.innerHTML = '';

    if (!discordUser) {
        showNotification('Loading user profile...', 'fas fa-spinner fa-spin');
        // Close modal and wait if this happens
        closeShareModal();
        return;
    }

    // Check membership for all guilds sequentially to avoid race conditions
    (async () => {
        for (const guild of SHARE_GUILDS) {
            const item = document.createElement('div');
            item.className = 'share-guild-item loading';
            item.innerHTML = `
                <div class="share-guild-icon placeholder"><i class="fab fa-discord"></i></div>
                <div class="share-guild-info">
                    <div class="share-guild-name">Loading server...</div>
                    <div class="share-guild-desc">Checking membership...</div>
                </div>
                <i class="fas fa-spinner share-guild-arrow"></i>
            `;
            guildList.appendChild(item);

            try {
                // Check guild membership - use force=true to ensure fresh state when opening modal
                const result = await checkUserInGuild(guild.id, true);

                item.classList.remove('loading');
                const iconEl = item.querySelector('.share-guild-icon');
                const nameEl = item.querySelector('.share-guild-name');
                const desc = item.querySelector('.share-guild-desc');
                const arrow = item.querySelector('.share-guild-arrow');

                // Update name and icon from API response
                nameEl.textContent = result.guildName || GUILD_DISPLAY_NAMES[guild.id] || `Server ${guild.id}`;

                if (result.guildIcon) {
                    const img = document.createElement('img');
                    img.className = 'share-guild-icon';
                    img.src = result.guildIcon;
                    img.alt = result.guildName || 'Server';
                    if (iconEl) iconEl.replaceWith(img);
                }

                if (result.inGuild) {
                    desc.textContent = 'Click to share';
                    arrow.className = 'fas fa-chevron-right share-guild-arrow';
                    item.onclick = () => shareToGuild(guild);
                } else {
                    item.classList.add('disabled');
                    desc.textContent = 'You must be a member of this server';
                    arrow.className = 'fas fa-lock share-guild-arrow';
                }
            } catch (err) {
                console.error('Share modal guild check error:', err);
                item.classList.remove('loading');
                item.classList.add('disabled');
                const nameEl = item.querySelector('.share-guild-name');
                const desc = item.querySelector('.share-guild-desc');
                nameEl.textContent = GUILD_DISPLAY_NAMES[guild.id] || `Server ${guild.id}`;
                desc.textContent = 'Failed to check membership';
            }
        }
    })();

    // Render saved custom webhooks
    renderSavedWebhooks();

    // Show modal
    const overlay = document.getElementById('share-modal-overlay');
    overlay.classList.remove('hidden');
};

window.closeShareModal = function (event) {
    // If called from overlay click, only close if clicking the overlay itself
    if (event && event.target !== event.currentTarget) return;
    const overlay = document.getElementById('share-modal-overlay');
    overlay.classList.add('hidden');
};

async function shareToGuild(guild) {
    const item = document.querySelector(`.share-guild-item[data-sharing]`);
    if (item) return; // Already sharing

    // Find and mark the guild item as sharing
    const guildItems = document.querySelectorAll('.share-guild-item');
    guildItems.forEach(el => {
        // Find if this element matches the guild we are sharing to
        // We can't rely on text name alone, let's look for the icon or name matches
        const nameEl = el.querySelector('.share-guild-name');
        if (nameEl && (nameEl.textContent === guild.id || el.innerHTML.includes(guild.webhookUrl))) {
            el.setAttribute('data-sharing', 'true');
            const desc = el.querySelector('.share-guild-desc');
            const arrow = el.querySelector('.share-guild-arrow');
            desc.textContent = 'Sharing...';
            arrow.className = 'fas fa-spinner share-guild-arrow';
            el.classList.add('loading');
        }
    });

    await shareToWebhook(guild.webhookUrl);

    // Clean up sharing state
    guildItems.forEach(el => el.removeAttribute('data-sharing'));
}

window.shareToCustomWebhook = async function () {
    const input = document.getElementById('custom-webhook-input');
    const webhookUrl = input.value.trim();

    if (!webhookUrl) {
        showNotification('Please paste a webhook URL!', 'fas fa-exclamation-triangle');
        return;
    }

    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/') && !webhookUrl.startsWith('https://discordapp.com/api/webhooks/')) {
        showNotification('Invalid Discord webhook URL!', 'fas fa-exclamation-triangle');
        return;
    }

    const now = Date.now();
    if (now - lastDiscordShareTime < DISCORD_SHARE_COOLDOWN) {
        const remaining = Math.ceil((DISCORD_SHARE_COOLDOWN - (now - lastDiscordShareTime)) / 1000);
        showNotification(`Please wait ${remaining} seconds before sharing again!`, 'fas fa-clock');
        return;
    }

    await shareToWebhook(webhookUrl);

    // Save webhook with metadata to localStorage on success
    await saveCustomWebhook(webhookUrl);
    input.value = '';
    renderSavedWebhooks();
};

// Saved custom webhooks management
// Each entry: { url, webhookName, guildId, guildName, guildIcon }
function getSavedWebhooks() {
    const raw = JSON.parse(localStorage.getItem('RadioGaming-savedWebhooks') || '[]');
    // Migrate old format (plain URL strings) to object format
    return raw.map(entry => {
        if (typeof entry === 'string') {
            return { url: entry, webhookName: null, guildId: null, guildName: null, guildIcon: null };
        }
        return entry;
    });
}

async function fetchWebhookInfo(webhookUrl) {
    try {
        const response = await fetch(webhookUrl, { method: 'GET' });
        if (!response.ok) return null;
        const data = await response.json();
        return {
            webhookName: data.name || null,
            guildId: data.guild_id || null
        };
    } catch (error) {
        console.error('Failed to fetch webhook info:', error);
        return null;
    }
}

async function saveCustomWebhook(url) {
    const saved = getSavedWebhooks();
    // Don't save duplicates
    if (saved.some(entry => entry.url === url)) return;

    // Fetch webhook metadata
    let webhookName = null;
    let guildId = null;
    let guildName = null;
    let guildIcon = null;

    const webhookInfo = await fetchWebhookInfo(url);
    if (webhookInfo) {
        webhookName = webhookInfo.webhookName;
        guildId = webhookInfo.guildId;

        // Try to get guild name/icon if we have a guild ID and auth token
        if (guildId && discordAuthToken) {
            const guildResult = await checkUserInGuild(guildId);
            if (guildResult.guildName) guildName = guildResult.guildName;
            if (guildResult.guildIcon) guildIcon = guildResult.guildIcon;
        }
    }

    saved.push({ url, webhookName, guildId, guildName, guildIcon });
    localStorage.setItem('RadioGaming-savedWebhooks', JSON.stringify(saved));
}

function removeCustomWebhook(url) {
    const saved = getSavedWebhooks().filter(w => w.url !== url);
    localStorage.setItem('RadioGaming-savedWebhooks', JSON.stringify(saved));
    renderSavedWebhooks();
}

function renderSavedWebhooks() {
    const container = document.getElementById('saved-webhooks-list');
    if (!container) return;
    container.innerHTML = '';

    const saved = getSavedWebhooks();
    if (saved.length === 0) return;

    saved.forEach(entry => {
        const displayName = entry.guildName || entry.webhookName || `Webhook ...${entry.url.split('/').slice(-2, -1)[0].slice(-8)}`;
        const subtitle = entry.guildName && entry.webhookName
            ? `#${entry.webhookName}`
            : 'Click to share';

        const item = document.createElement('div');
        item.className = 'share-guild-item';

        if (entry.guildIcon) {
            item.innerHTML = `
                <img class="share-guild-icon" src="${entry.guildIcon}" alt="${displayName}">
                <div class="share-guild-info">
                    <div class="share-guild-name">${displayName}</div>
                    <div class="share-guild-desc">${subtitle}</div>
                </div>
                <i class="fas fa-times share-guild-remove" title="Remove saved webhook"></i>
                <i class="fas fa-chevron-right share-guild-arrow"></i>
            `;
        } else {
            item.innerHTML = `
                <div class="share-guild-icon placeholder"><i class="fas fa-link"></i></div>
                <div class="share-guild-info">
                    <div class="share-guild-name">${displayName}</div>
                    <div class="share-guild-desc">${subtitle}</div>
                </div>
                <i class="fas fa-times share-guild-remove" title="Remove saved webhook"></i>
                <i class="fas fa-chevron-right share-guild-arrow"></i>
            `;
        }

        // Share on click (but not on remove button)
        item.addEventListener('click', (e) => {
            if (e.target.closest('.share-guild-remove')) return;
            shareToWebhook(entry.url);
        });

        // Remove button
        const removeBtn = item.querySelector('.share-guild-remove');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeCustomWebhook(entry.url);
        });

        container.appendChild(item);

        // If missing metadata, try to fetch it in the background and update
        if (!entry.guildName && !entry.webhookName) {
            fetchWebhookInfo(entry.url).then(async (info) => {
                if (!info) return;
                entry.webhookName = info.webhookName;
                entry.guildId = info.guildId;

                if (info.guildId && discordAuthToken) {
                    const guildResult = await checkUserInGuild(info.guildId);
                    if (guildResult.guildName) entry.guildName = guildResult.guildName;
                    if (guildResult.guildIcon) entry.guildIcon = guildResult.guildIcon;
                }

                // Update localStorage with enriched data
                const allSaved = getSavedWebhooks();
                const idx = allSaved.findIndex(s => s.url === entry.url);
                if (idx !== -1) {
                    allSaved[idx] = entry;
                    localStorage.setItem('RadioGaming-savedWebhooks', JSON.stringify(allSaved));
                }

                // Re-render to show updated info
                renderSavedWebhooks();
            });
        }
    });
}

// Chat Polling System (no WebSockets needed)
let chatPollingInterval = null;
let lastMessageTimestamp = null;
let isChatVisible = false;
let isChatAtBottom = true; // Global flag to track if we should auto-scroll

function toggleChannelDropdown() {
    const dropdown = document.getElementById('channel-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-channel-selector')) {
        const dropdown = document.getElementById('channel-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
    }
});

async function switchChatChannel(stationName) {
    const oldStation = currentChatStation;
    currentChatStation = stationName.replace(/\s+/g, '').toUpperCase();

    if (oldStation !== currentChatStation) {
        lastMessageTimestamp = null;
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="chat-loading">Loading channel...</div>';
        }

        // Update UI
        const chatStationLabel = document.getElementById('chat-current-station');
        if (chatStationLabel) chatStationLabel.textContent = stationName;

        await loadChatHistory();
        showNotification(`Switched to ${stationName} chat`, 'fas fa-comments');
    }

    const dropdown = document.getElementById('channel-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
}

function initializeChatPolling() {
    if (chatPollingInterval) return;

    console.log('[CHAT] Initializing polling...');
    updateCurrentStation();
    loadChatHistory();

    // Poll for new messages every 3 seconds
    chatPollingInterval = setInterval(pollNewMessages, 3000);
}

function stopChatPolling() {
    if (chatPollingInterval) {
        clearInterval(chatPollingInterval);
        chatPollingInterval = null;
    }
}

function updateCurrentStation() {
    const stationNameElem = document.getElementById('StationNameInh1');
    const stationName = stationNameElem ? stationNameElem.textContent : 'Radio GAMING';
    const newStationId = stationName.replace(/\s+/g, '').toUpperCase();

    if (currentChatStation !== newStationId) {
        currentChatStation = newStationId;
        lastMessageTimestamp = null;

        // Clear messages and show loading if we're switching
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="chat-loading">Loading channel...</div>';
        }
    }

    // Update chat UI
    const chatStationLabel = document.getElementById('chat-current-station');
    if (chatStationLabel) chatStationLabel.textContent = stationName;
}

async function loadChatHistory() {
    const messagesContainer = document.getElementById('chat-messages');
    try {
        const playingStation = (document.getElementById('StationNameInh1')?.textContent || 'Radio GAMING').trim();
        const headers = {
            'X-Playing-Station': playingStation
        };
        if (discordAuthToken) {
            headers['Authorization'] = `Bearer ${discordAuthToken}`;
        }

        const response = await fetch(`${CHAT_API_BASE}/chat/history/${currentChatStation}`, { headers });
        const data = await response.json();

        if (data.online_count !== undefined) {
            updateOnlineCountUI(data.online_count, data.online_users);
        }

        if (messagesContainer) {
            if (data.messages && data.messages.length > 0) {
                // Clear welcome message or loading indicator
                messagesContainer.innerHTML = '';
                data.messages.forEach(message => appendChatMessage(message, false));

                // Scroll to bottom after the section transition and DOM update
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    isChatAtBottom = true;
                }, 300);

                // Track last message timestamp
                lastMessageTimestamp = data.messages[data.messages.length - 1].timestamp;
            } else if (messagesContainer.querySelector('.chat-loading')) {
                // No messages and we were loading - show welcome message
                messagesContainer.innerHTML = `
                    <div class="chat-welcome">
                        <i class="fas fa-music"></i>
                        <p>Welcome to the chat! Say hello to other listeners.</p>
                    </div>
                `;
            }
        }

        if (data.server_time) {
            lastMessageTimestamp = lastMessageTimestamp || data.server_time;
        }
    } catch (error) {
        console.error('[CHAT] Error loading history:', error);
        if (messagesContainer && messagesContainer.querySelector('.chat-loading')) {
            messagesContainer.innerHTML = '<div class="chat-error"><i class="fas fa-exclamation-circle"></i> Failed to load chat history.</div>';
        }
    }
}

let pollCount = 0;
async function pollNewMessages() {
    // If chat is not visible, only poll every 30s (10 ticks * 3s) to save resources
    // but still announce we are online and what we are listening to.
    if (!isChatVisible && pollCount % 10 !== 0) {
        pollCount++;
        return;
    }
    pollCount++;

    try {
        const since = lastMessageTimestamp ? `?since=${encodeURIComponent(lastMessageTimestamp)}` : '';
        const playingStation = (document.getElementById('StationNameInh1')?.textContent || 'Radio GAMING').trim();
        const headers = {
            'X-Playing-Station': playingStation
        };

        if (discordAuthToken) {
            headers['Authorization'] = `Bearer ${discordAuthToken}`;
        }

        const response = await fetch(`${CHAT_API_BASE}/chat/poll/${currentChatStation}${since}`, { headers });
        const data = await response.json();

        // Always update online count and users list
        if (data.online_count !== undefined) {
            updateOnlineCountUI(data.online_count, data.online_users);
        }

        // Only process and append messages if the chat is actually open
        if (isChatVisible && data.messages && data.messages.length > 0) {
            data.messages.forEach(message => {
                // Only append if we don't already have this message
                if (!document.getElementById(`msg-${message.id}`)) {
                    appendChatMessage(message);
                }
            });

            // Update last timestamp
            lastMessageTimestamp = data.messages[data.messages.length - 1].timestamp;
        }

        if (data.server_time) {
            lastMessageTimestamp = lastMessageTimestamp || data.server_time;
        }
    } catch (error) {
        if (isChatVisible) console.error('[CHAT] Polling error:', error);
    }
}

function updateOnlineCountUI(count, users) {
    const onlineCountElem = document.getElementById('chat-online-count');
    if (onlineCountElem) {
        onlineCountElem.textContent = count;
    }
    // Store users list if provided for the modal
    if (users) {
        window.currentOnlineUsers = users;

        // If modal is open, refresh the list immediately
        const overlay = document.getElementById('online-users-modal-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            renderOnlineUsers();
        }
    }
}

window.openOnlineUsersModal = async function () {
    const overlay = document.getElementById('online-users-modal-overlay');
    const container = document.getElementById('online-users-list');
    if (!overlay || !container) return;

    overlay.classList.remove('hidden');
    container.innerHTML = '<div class="chat-loading"><i class="fas fa-spinner fa-spin"></i> Loading users...</div>';

    try {
        const playingStation = (document.getElementById('StationNameInh1')?.textContent || 'Radio GAMING').trim();
        const headers = {
            'X-Playing-Station': playingStation
        };

        if (discordAuthToken) {
            headers['Authorization'] = `Bearer ${discordAuthToken}`;
        }

        const response = await fetch(`${CHAT_API_BASE}/chat/history/${currentChatStation}`, { headers });
        const data = await response.json();
        console.log('[CHAT] Online users data:', data);

        // API might return online_users or just users depending on the version
        const users = data.online_users || data.users || [];
        window.currentOnlineUsers = users;

        renderOnlineUsers();
    } catch (error) {
        console.error('[CHAT] Error fetching online users:', error);
        container.innerHTML = '<div class="chat-error">Failed to load online users.</div>';
    }
};

window.closeOnlineUsersModal = function (event) {
    if (event && event.target !== event.currentTarget) return;
    const overlay = document.getElementById('online-users-modal-overlay');
    if (overlay) overlay.classList.add('hidden');
};

function formatRelativeTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) {
        const mins = Math.floor(diffInSeconds / 60);
        return `${mins} min${mins > 1 ? 's' : ''} ago`;
    }
    if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

function renderOnlineUsers() {
    const container = document.getElementById('online-users-list');
    if (!container) return;

    const users = window.currentOnlineUsers || [];
    if (users.length === 0) {
        container.innerHTML = '<div class="chat-empty">No other listeners online right now.</div>';
        return;
    }

    container.innerHTML = '';
    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'share-guild-item'; // Reuse existing styles
        item.style.cursor = 'default';
        if (!user.is_online) item.style.opacity = '0.7';

        const statusLabel = user.is_online ? 'Online' : formatRelativeTime(user.last_seen);
        const badgeStyle = user.is_online
            ? 'background: rgba(0, 255, 140, 0.1); border-color: rgba(0, 255, 140, 0.2); color: #00ff8c;'
            : 'background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.1); color: #888;';

        item.innerHTML = `
            <img class="share-guild-icon" src="${user.avatar_url}" alt="${user.username}">
            <div class="share-guild-info">
                <div class="share-guild-name">${user.global_name || user.username}</div>
                <div class="share-guild-desc">Listened to ${user.current_station || 'Radio GAMING'}</div>
            </div>
            <div class="chat-online-badge" style="margin-left: auto; ${badgeStyle} cursor: default; white-space: nowrap;">
                <i class="fas fa-circle" style="font-size: 8px; color: ${user.is_online ? '#00ff8c' : '#777'};"></i> ${statusLabel}
            </div>
        `;
        container.appendChild(item);
    });
}

function appendChatMessage(message, scrollToBottom = true) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    // Remove welcome message if present
    const welcome = messagesContainer.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.id = `msg-${message.id}`;

    const timestamp = new Date(message.timestamp);
    const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Improved detection for image-only messages (like from GIF picker)
    const trimmedContent = message.content.trim();
    const isImageOnly = trimmedContent.match(/^https?:\/\/.*?\.(gif|jpe?g|png|webp|svg)(\?.*)?$/i) ||
        trimmedContent.match(/^https?:\/\/media\d?\.giphy\.com\/media\/[a-zA-Z0-9]+\/giphy\.gif$/) ||
        trimmedContent.includes('tenor.com/view/');

    let formattedContent;
    if (isImageOnly) {
        formattedContent = `<img src="${escapeHtml(trimmedContent)}" class="chat-inline-gif" alt="GIF">`;
    } else {
        // Escape content and find links
        const escaped = escapeHtml(message.content);
        formattedContent = escaped.replace(/(https?:\/\/[^\s]+)/g, (url) => {
            const displayUrl = url.length > 40 ? url.substring(0, 37) + '...' : url;
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link"><i class="fas fa-link"></i> ${displayUrl}</a>`;
        });
    }

    messageEl.innerHTML = `
        <img class="chat-message-avatar" src="${message.user.avatar_url}" alt="${message.user.username}">
        <div class="chat-message-content">
            <div class="chat-message-header">
                <span class="chat-message-username">${message.user.global_name || message.user.username}</span>
                <span class="chat-message-time">${timeStr}</span>
            </div>
            <div class="chat-message-text">
                ${formattedContent}
            </div>
            ${message.song_data ? `
            <div class="song-embed">
                <img class="song-embed-cover" src="${message.song_data.artwork}" alt="Album Cover">
                <div class="song-embed-info">
                    <div class="song-embed-title">${escapeHtml(message.song_data.title)}</div>
                    <div class="song-embed-station">${escapeHtml(message.song_data.station)}</div>
                </div>
            </div>
            ` : ''}
        </div>
    `;

    messagesContainer.appendChild(messageEl);

    // Auto-scroll logic for new messages
    if (scrollToBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        isChatAtBottom = true;
    }

    // Always handle images loading late
    const images = messageEl.querySelectorAll('img');
    images.forEach(img => {
        img.addEventListener('load', () => {
            if (isChatAtBottom && isChatVisible) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.sendChatMessage = async function (overrideMessage = null) {
    const input = document.getElementById('chat-input');
    if (!input) return;

    const message = overrideMessage || input.value.trim();
    if (!message) return;

    if (!overrideMessage && message.length > 200) {
        showNotification(`Message is too long! ${message.length}/200 letters`, 'fas fa-exclamation-triangle');
        return;
    }

    if (!discordAuthToken) {
        showNotification('Please login to chat', 'fas fa-exclamation-triangle');
        return;
    }

    try {
        let songData = null;
        if (isSongShared) {
            if (sharedSongData) {
                // Use specific song from history/favorites
                songData = sharedSongData;
            } else {
                // Use currently playing song
                songData = {
                    title: document.getElementById('streamTitle').textContent,
                    artwork: document.getElementById('albumCover').src,
                    station: document.getElementById('StationNameInh1').textContent
                };
            }
        }

        const playingStation = (document.getElementById('StationNameInh1')?.textContent || 'Radio GAMING').trim();
        const response = await fetch(`${CHAT_API_BASE}/chat/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${discordAuthToken}`,
                'X-Playing-Station': playingStation
            },
            body: JSON.stringify({
                message: message,
                station: currentChatStation,
                song_data: songData
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            input.value = '';
            toggleSongShare(false); // Reset share state
            // Append message immediately for instant feedback
            if (!document.getElementById(`msg-${data.message.id}`)) {
                appendChatMessage(data.message);
            }
        } else {
            showNotification(data.error || 'Failed to send message', 'fas fa-exclamation-triangle');
        }
    } catch (error) {
        console.error('[CHAT] Send error:', error);
        showNotification('Failed to send message', 'fas fa-exclamation-triangle');
    }
};

// Handle Enter key for sending messages
document.addEventListener('keydown', (e) => {
    if (e.target.id === 'chat-input') {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    }
});

// Character counter for chat
document.addEventListener('input', (e) => {
    if (e.target.id === 'chat-input') {
        const input = e.target;
        const count = input.value.length;
        const counterElem = document.getElementById('chat-char-count');

        if (counterElem) {
            counterElem.textContent = `${count}/200`;
            if (count > 200) {
                counterElem.classList.add('error');
            } else {
                counterElem.classList.remove('error');
            }
        }
    }
});

// Giphy token is now fetched dynamically from K5ApiManager
let isGifPickerOpen = false;
let gifResultsCache = {}; // Cache object: { query: { data, timestamp } }
const GIF_CACHE_STALE_TIME = 5 * 60 * 1000; // 5 minutes

window.toggleGifPicker = function () {
    const picker = document.getElementById('chat-gif-picker');
    const btn = document.getElementById('chat-gif-btn');
    if (!picker) return;

    isGifPickerOpen = !isGifPickerOpen;

    if (isGifPickerOpen) {
        picker.classList.remove('hidden');
        btn.classList.add('active');
        fetchGiphyGifs(); // Load trending by default

        // Auto focus search
        setTimeout(() => document.getElementById('gif-search-input').focus(), 100);
    } else {
        picker.classList.add('hidden');
        btn.classList.remove('active');
    }
};

async function fetchGiphyGifs(query = '') {
    const resultsContainer = document.getElementById('gif-results');
    if (!resultsContainer) return;

    const normalizedQuery = query.trim().toLowerCase();
    const cacheKey = normalizedQuery || 'trending_default';
    const now = Date.now();

    // Check cache
    if (gifResultsCache[cacheKey] && (now - gifResultsCache[cacheKey].timestamp < GIF_CACHE_STALE_TIME)) {
        console.log(`[GIPHY] Loading from cache: "${cacheKey}"`);
        displayGifs(gifResultsCache[cacheKey].data);
        return;
    }

    resultsContainer.innerHTML = '<div class="chat-loading">Loading GIFs...</div>';

    try {
        const giphyApiKey = await getGiphyAccessToken();
        if (!giphyApiKey) throw new Error("Could not acquire Giphy API token");

        const endpoint = normalizedQuery
            ? `https://api.giphy.com/v1/gifs/search?api_key=${giphyApiKey}&q=${encodeURIComponent(normalizedQuery)}&limit=20&rating=g`
            : `https://api.giphy.com/v1/gifs/trending?api_key=${giphyApiKey}&limit=20&rating=g`;

        const response = await fetch(endpoint);
        const data = await response.json();

        if (data.data) {
            // Store in cache
            gifResultsCache[cacheKey] = {
                data: data.data,
                timestamp: now
            };
            displayGifs(data.data);
        } else {
            resultsContainer.innerHTML = '<div class="chat-error">No GIFs found.</div>';
        }
    } catch (error) {
        console.error('Giphy API Error:', error);
        resultsContainer.innerHTML = '<div class="chat-error">Failed to load GIFs.</div>';
    }
}

function displayGifs(gifs) {
    const resultsContainer = document.getElementById('gif-results');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '';

    if (gifs.length > 0) {
        gifs.forEach(gif => {
            const img = document.createElement('img');
            const url = gif.images.fixed_height.url;
            img.src = url;
            img.alt = gif.title;
            img.onclick = () => selectGif(url);
            resultsContainer.appendChild(img);
        });
    } else {
        resultsContainer.innerHTML = '<div class="chat-error">No GIFs found.</div>';
    }
}

function selectGif(url) {
    // Send message directly with the GIF URL
    sendChatMessage(url);
    if (isGifPickerOpen) toggleGifPicker();
}

// Search input listener
document.addEventListener('DOMContentLoaded', () => {
    const gifInput = document.getElementById('gif-search-input');
    if (gifInput) {
        let debounceTimer;
        gifInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchGiphyGifs(e.target.value);
            }, 500);
        });
    }
});

// Close picker on outside click
window.addEventListener('mousedown', (e) => {
    const picker = document.getElementById('chat-gif-picker');
    const btn = document.getElementById('chat-gif-btn');
    if (isGifPickerOpen && picker && !picker.contains(e.target) && !btn.contains(e.target)) {
        toggleGifPicker();
    }
});

// Robust auto-scroll for chat
document.addEventListener('DOMContentLoaded', () => {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    let isAtBottom = true;

    // Track if user is at the bottom
    messagesContainer.addEventListener('scroll', () => {
        const threshold = 50; // pixels from bottom
        isChatAtBottom = (messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight) < threshold;
    });

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
        if (isChatAtBottom && isChatVisible) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    });

    resizeObserver.observe(messagesContainer);
});

// Track when chat section is visible
const originalSwitchSection = window.switchSection || switchSection;
window.switchSection = function (sectionId) {
    originalSwitchSection(sectionId);

    isChatVisible = (sectionId === 'chat');

    if (isChatVisible) {
        updateCurrentStation();
        // Wait for section transition to complete before loading history and scrolling
        setTimeout(() => {
            loadChatHistory();
        }, 400);

        if (!chatPollingInterval) {
            initializeChatPolling();
        }
    }
};

// Update chat station when changing radio station
const originalChangeStation = window.changeStation || changeStation;
window.changeStation = function (source, name, metadataURL) {
    originalChangeStation(source, name, metadataURL);

    // Update chat station

    const oldStation = currentChatStation;
    currentChatStation = name.replace(/\s+/g, '').toUpperCase();

    if (oldStation !== currentChatStation) {
        // Clear messages and reload
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="chat-welcome">
                    <i class="fas fa-music"></i>
                    <p>Welcome to the chat! Say hello to other listeners.</p>
                </div>
            `;
        }

        lastMessageTimestamp = null;

        if (isChatVisible) {
            loadChatHistory();
        }

        // Update chat UI
        const chatStationLabel = document.getElementById('chat-current-station');
        if (chatStationLabel) chatStationLabel.textContent = name;
    }
};

// ========================
// SONG HISTORY & FAVORITES
// ========================

function addToSongHistory(title, coverUrl) {
    if (!title || title === lastHistorySongTitle) return;

    // Only add to history if the user is actually listening
    if (!audio || audio.paused) return;

    lastHistorySongTitle = title;

    const currentStation = stationName ? stationName.textContent : 'Unknown';
    const entry = {
        title: title,
        cover: coverUrl,
        station: currentStation,
        timestamp: Date.now()
    };

    // Update Stats
    if (!listeningStats.songs[title]) {
        listeningStats.songs[title] = {
            playCount: 0,
            listeningTime: 0,
            firstPlayed: Date.now(),
            cover: coverUrl,
            station: currentStation
        };
    }
    listeningStats.songs[title].playCount++;
    listeningStats.songs[title].lastPlayed = Date.now();
    listeningStats.songs[title].cover = coverUrl; // Update cover if same song has different one now
    localStorage.setItem('RadioGaming-listeningStats', JSON.stringify(listeningStats));

    // Remove duplicate if exists
    songHistory = songHistory.filter(s => s.title !== title);

    // Add to front
    songHistory.unshift(entry);

    // Keep only last 20
    if (songHistory.length > 20) songHistory = songHistory.slice(0, 20);

    localStorage.setItem('RadioGaming-songHistory', JSON.stringify(songHistory));
    renderHistoryList();
}

function startListeningTimer() {
    if (listeningTimer) return;
    listeningTimer = setInterval(() => {
        if (audio && !audio.paused) {
            const currentTitle = document.getElementById('streamTitle') ? document.getElementById('streamTitle').textContent : '';
            if (currentTitle && currentTitle !== 'Loading...' && currentTitle !== '') {
                listeningStats.totalTime++;
                if (listeningStats.songs[currentTitle]) {
                    listeningStats.songs[currentTitle].listeningTime++;
                } else {
                    // This case handles if the song started before stats were initialized or if it's the first play
                    const currentStation = stationName ? stationName.textContent : 'Unknown';
                    const currentCover = document.getElementById('albumCover') ? document.getElementById('albumCover').src : '';
                    listeningStats.songs[currentTitle] = {
                        playCount: 1,
                        listeningTime: 1,
                        firstPlayed: Date.now(),
                        lastPlayed: Date.now(),
                        cover: currentCover,
                        station: currentStation
                    };
                }

                // Save every 30 seconds to avoid too many writes
                if (listeningStats.totalTime % 30 === 0) {
                    localStorage.setItem('RadioGaming-listeningStats', JSON.stringify(listeningStats));
                }
            }
        }
    }, 1000);
}

window.shareSongToChat = function (title, cover, station) {
    if (!discordAuthToken) {
        showNotification('Login with Discord to share in chat!', 'fas fa-exclamation-triangle');
        return;
    }

    // Switch to chat section
    switchSection('chat');

    // Toggle sharing for this specific song
    toggleSongShare(true, { title, cover, station });

    // Close history drawer
    if (typeof toggleHistoryDrawer === 'function') toggleHistoryDrawer();
};

function toggleFavorite(title) {
    const idx = songFavorites.findIndex(s => s.title === title);
    if (idx !== -1) {
        songFavorites.splice(idx, 1);
        showNotification('Removed from favorites', 'fas fa-heart-broken');
    } else {
        // Find in history
        const song = songHistory.find(s => s.title === title);
        if (song) {
            songFavorites.unshift({ ...song });
            showNotification('Added to favorites! ❤️', 'fas fa-heart');
        } else {
            // If not in history (e.g. current song just started), add it now
            const currentTitle = document.getElementById('streamTitle').textContent;
            if (title === currentTitle) {
                const currentStation = document.getElementById('StationNameInh1').textContent;
                const currentCover = document.getElementById('albumCover').src;
                songFavorites.unshift({
                    title: title,
                    cover: currentCover,
                    station: currentStation,
                    timestamp: Date.now()
                });
                showNotification('Added to favorites! ❤️', 'fas fa-heart');
            }
        }
    }
    localStorage.setItem('RadioGaming-songFavorites', JSON.stringify(songFavorites));
    renderHistoryList();
    renderFavoritesList();

    // Update main player icon if this is the current song
    const currentTitle = document.getElementById('streamTitle') ? document.getElementById('streamTitle').textContent : '';
    if (title === currentTitle) {
        updateFavoriteIcon(title);
    }
}

window.toggleCurrentFavorite = function () {
    const songTitle = document.getElementById('streamTitle') ? document.getElementById('streamTitle').textContent : '';
    if (!songTitle || songTitle === 'Loading...' || songTitle === '') {
        showNotification('Wait for a song to load!', 'fas fa-info-circle');
        return;
    }
    toggleFavorite(songTitle);
};

window.updateFavoriteIcon = function (title) {
    const icon = document.getElementById('favoriteIcon');
    if (!icon) return;

    if (isFavorited(title)) {
        icon.classList.add('favorited');
        icon.classList.remove('far');
        icon.classList.add('fas');
        icon.title = 'Remove from Favorites';
    } else {
        icon.classList.remove('favorited');
        icon.classList.remove('fas');
        icon.classList.add('far');
        icon.title = 'Add to Favorites';
    }
};

function isFavorited(title) {
    return songFavorites.some(s => s.title === title);
}



function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// History Drawer Toggle
window.toggleHistoryDrawer = function () {
    const drawer = document.getElementById('history-drawer');
    const overlay = document.getElementById('history-overlay');
    if (!drawer || !overlay) return;

    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
    } else {
        renderHistoryList();
        renderFavoritesList();
        drawer.classList.add('open');
        overlay.classList.add('open');
    }
};

window.switchHistoryTab = function (tab) {
    const historyList = document.getElementById('history-list');
    const favoritesList = document.getElementById('favorites-list');
    const statsView = document.getElementById('stats-view');
    const tabs = document.querySelectorAll('.history-tab');

    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

    const displayVal = historyViewMode === 'grid' ? 'grid' : 'flex';
    historyList.style.display = tab === 'history' ? displayVal : 'none';
    favoritesList.style.display = tab === 'favorites' ? displayVal : 'none';
    statsView.style.display = tab === 'stats' ? 'block' : 'none';

    if (tab === 'stats') {
        renderStatsView();
        statsView.scrollTop = 0;
    } else if (tab === 'favorites') {
        renderFavoritesList();
        favoritesList.scrollTop = 0;
    } else {
        renderHistoryList();
        historyList.scrollTop = 0;
    }
};

window.toggleHistoryMode = function () {
    historyViewMode = historyViewMode === 'list' ? 'grid' : 'list';
    localStorage.setItem('RadioGaming-historyViewMode', historyViewMode);

    const drawer = document.getElementById('history-drawer');
    const toggleIcon = document.querySelector('#view-mode-toggle i');

    if (historyViewMode === 'grid') {
        drawer.classList.add('immersive-mode');
        if (toggleIcon) toggleIcon.className = 'fas fa-list';
    } else {
        drawer.classList.remove('immersive-mode');
        if (toggleIcon) toggleIcon.className = 'fas fa-th-large';
    }

    // Refresh current active tab
    const activeTab = document.querySelector('.history-tab.active');
    if (activeTab) {
        switchHistoryTab(activeTab.dataset.tab);
    }
};

function renderStatsView() {
    const list = document.getElementById('stats-view');
    if (!list) return;

    if (Object.keys(listeningStats.songs).length === 0) {
        list.innerHTML = `<div class="history-empty"><i class="fas fa-chart-line"></i><p>Statistics are being gathered. Keep listening!</p></div>`;
        return;
    }

    // Station logo map
    const stationLogos = {
        'Radio GAMING': 'https://radio-gaming.stream/Images/Logos/Radio-Gaming-Logo.webp',
        'Radio GAMING DARK': 'https://radio-gaming.stream/Images/Logos/Radio-Gaming-dark-logo.webp',
        'Radio GAMING MARON FM': 'https://radio-gaming.stream/Images/Logos/Radio-Gaming-Maron-fm-logo.webp',
    };
    const fallbackLogo = 'https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png';

    // Sort songs by listening time
    const sortedSongs = Object.entries(listeningStats.songs)
        .sort(([, a], [, b]) => {
            if ((b.playCount || 0) !== (a.playCount || 0)) {
                return (b.playCount || 0) - (a.playCount || 0);
            }
            return (b.listeningTime || 0) - (a.listeningTime || 0);
        });

    // Calculate station stats
    const stationStats = {};
    Object.values(listeningStats.songs).forEach(data => {
        const sName = data.station || 'Unknown Station';
        if (!stationStats[sName]) stationStats[sName] = { time: 0, songs: 0 };
        stationStats[sName].time += data.listeningTime;
        stationStats[sName].songs++;
    });

    const sortedStations = Object.entries(stationStats)
        .sort(([, a], [, b]) => b.time - a.time);

    const favoriteStation = sortedStations.length > 0 ? sortedStations[0][0] : 'N/A';
    const mostPopular = sortedSongs[0][0];
    const totalTimeHours = Math.floor(listeningStats.totalTime / 3600);
    const totalTimeMins = Math.floor((listeningStats.totalTime % 3600) / 60);
    const maxStationTime = sortedStations.length > 0 ? sortedStations[0][1].time : 1;

    let html = `
        <div class="stats-container">
            <div class="stats-header-row">
                <h4 class="stats-subtitle">Listening Overview</h4>
                <button class="stats-export-btn" onclick="exportUserData()" title="Export Statistics Data">
                    <i class="fas fa-file-export"></i> Export Data
                </button>
            </div>
            <div class="stats-overview">
                <div class="stat-card">
                    <span class="stat-label">Total Listening Time</span>
                    <span class="stat-value">${totalTimeHours}h ${totalTimeMins}m</span>
                </div>
                <div class="stat-card featured">
                    <span class="stat-label">Top Station</span>
                    <span class="stat-value">${favoriteStation}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Most Played Track</span>
                    <span class="stat-value" title="${mostPopular}">${mostPopular}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Songs Heard</span>
                    <span class="stat-value">${Object.keys(listeningStats.songs).length}</span>
                </div>
            </div>

            <h4 class="stats-subtitle">Station Breakdown</h4>
            <div class="station-stats-list">
    `;

    sortedStations.forEach(([name, data], i) => {
        const logo = stationLogos[name] || fallbackLogo;
        const h = Math.floor(data.time / 3600);
        const m = Math.floor((data.time % 3600) / 60);
        const s = data.time % 60;
        const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
        const pct = Math.round((data.time / Math.max(listeningStats.totalTime, 1)) * 100);
        const barWidth = Math.round((data.time / maxStationTime) * 100);
        html += `
            <div class="station-stat-item" style="animation-delay: ${i * 0.08}s">
                <img class="station-stat-logo" src="${logo}" alt="${name}" onerror="this.src='${fallbackLogo}'">
                <div class="station-stat-info">
                    <div class="station-stat-header">
                        <span class="station-stat-name">${name}</span>
                        <span class="station-stat-time">${timeStr} <span class="station-stat-pct">(${pct}%)</span></span>
                    </div>
                    <div class="station-stat-bar-bg">
                        <div class="station-stat-bar" style="width: ${barWidth}%"></div>
                    </div>
                    <div class="station-stat-songs">${data.songs} unique tracks</div>
                </div>
            </div>
        `;
    });

    html += `</div>
            <h4 class="stats-subtitle">Top Tracks</h4>
            <div class="stats-songs-list">
    `;

    html += sortedSongs.slice(0, 10).map(([title, data], i) => {
        const mins = Math.floor(data.listeningTime / 60);
        const secs = data.listeningTime % 60;
        return `
            <div class="stats-song-item" style="animation-delay: ${i * 0.05}s">
                <div class="stats-rank">${i + 1}</div>
                <img class="stats-cover" src="${data.cover}" alt="Cover" onerror="this.src='https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png'">
                <div class="stats-info">
                    <div class="stats-title">${title}</div>
                    <div class="stats-meta">${data.playCount} plays • ${mins}m ${secs}s</div>
                </div>
            </div>
        `;
    }).join('');

    html += `</div></div>`;
    list.innerHTML = html;
}

function renderHistoryList() {
    const list = document.getElementById('history-list');
    if (!list) return;

    const stationLogos = {
        'Radio GAMING': 'https://radio-gaming.stream/Images/Logos/Radio-Gaming-Logo.webp',
        'Radio GAMING DARK': 'https://radio-gaming.stream/Images/Logos/Radio-Gaming-dark-logo.webp',
        'Radio GAMING MARON FM': 'https://radio-gaming.stream/Images/Logos/Radio-Gaming-Maron-fm-logo.webp',
    };
    const fallbackLogo = 'https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png';


    if (songHistory.length === 0) {
        list.innerHTML = `<div class="history-empty"><i class="fas fa-music"></i><p>No songs played yet. Start listening!</p></div>`;
        return;
    }

    // Group songs by station
    const groups = songHistory.reduce((acc, song) => {
        if (!acc[song.station]) acc[song.station] = [];
        acc[song.station].push(song);
        return acc;
    }, {});

    let html = '';
    Object.keys(groups).forEach(stationName => {
        const stationSongs = groups[stationName];

        // Add station header
        const sLogo1 = stationLogos[stationName] || fallbackLogo;
        html += `
            <div class="station-group-header">
                <img src="${sLogo1}" alt="${stationName}" class="station-group-logo" onerror="this.src='${fallbackLogo}'">
                <h3>${stationName}</h3>
                <span class="song-count">${stationSongs.length} songs</span>
            </div>
        `;

        html += stationSongs.map((song, i) => {
            const timeAgo = getTimeAgo(song.timestamp);
            const fav = isFavorited(song.title);
            const encodedTitle = encodeURIComponent(song.title);
            const stats = listeningStats.songs[song.title] || { playCount: 0, listeningTime: 0 };

            if (historyViewMode === 'grid') {
                return `
                    <div class="grid-item" style="animation-delay: ${i * 0.05}s">
                        <div class="grid-cover-wrapper">
                            <img class="grid-cover" src="${song.cover}" alt="Cover" onerror="this.src='https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png'">
                        </div>
                        <div class="grid-info">
                            <div class="grid-title" title="${song.title}">${song.title}</div>
                            <div class="grid-meta">${song.station}</div>
                            <div class="grid-stats">${stats.playCount} plays</div>
                        </div>
                        <div class="grid-actions">
                            <button class="grid-action-btn ${fav ? 'favorited' : ''}" onclick="toggleFavorite('${song.title.replace(/'/g, "\\'")}')" title="Favorite">
                                <i class="fas fa-heart"></i>
                            </button>
                            <button class="grid-action-btn" onclick="shareSongToChat('${song.title.replace(/'/g, "\\'")}', '${song.cover}', '${song.station}')" title="Share">
                                <i class="fas fa-comment-alt"></i>
                            </button>
                            <a class="grid-action-btn spotify-btn" href="https://open.spotify.com/search/${encodedTitle}" target="_blank" onclick="event.stopPropagation();" title="Spotify">
                                <i class="fab fa-spotify"></i>
                            </a>
                            <a class="grid-action-btn youtube-btn" href="https://www.youtube.com/results?search_query=${encodedTitle}" target="_blank" onclick="event.stopPropagation();" title="YouTube">
                                <i class="fab fa-youtube"></i>
                            </a>
                        </div>
                    </div>`;
            }

            return `
                <div class="history-item" style="animation-delay: ${i * 0.05}s">
                    <img class="history-item-cover" src="${song.cover}" alt="Cover" onerror="this.src='https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png'">
                    <div class="history-item-info">
                        <div class="history-item-title" title="${song.title}">${song.title}</div>
                        <div class="history-item-meta">
                            <span class="history-item-station">${song.station}</span>
                            <span class="history-item-playcount">• ${stats.playCount} plays</span>
                            <span>• ${timeAgo}</span>
                        </div>
                    </div>
                    <div class="history-item-actions">
                        <button class="history-action-btn chat-share-btn" onclick="shareSongToChat('${song.title.replace(/'/g, "\\'")}', '${song.cover}', '${song.station}')"
                            title="Share to Chat">
                            <i class="fas fa-comment-alt"></i>
                        </button>
                        <button class="history-action-btn ${fav ? 'favorited' : ''}" onclick="toggleFavorite('${song.title.replace(/'/g, "\\'")}')"
                            title="${fav ? 'Remove from favorites' : 'Add to favorites'}">
                            <i class="fas fa-heart"></i>
                        </button>
                        <a class="history-action-btn spotify-btn" href="https://open.spotify.com/search/${encodedTitle}" target="_blank" title="Search on Spotify">
                            <i class="fab fa-spotify"></i>
                        </a>
                        <a class="history-action-btn youtube-btn" href="https://www.youtube.com/results?search_query=${encodedTitle}" target="_blank" title="Search on YouTube">
                            <i class="fab fa-youtube"></i>
                        </a>
                    </div>
                </div>`;
        }).join('');
    });

    list.innerHTML = html;
}


function renderFavoritesList() {
    const list = document.getElementById('favorites-list');
    if (!list) return;

    if (songFavorites.length === 0) {
        list.innerHTML = `<div class="history-empty"><i class="fas fa-heart"></i><p>No favorites yet. Heart a song to save it!</p></div>`;
        return;
    }

    const stationLogos = {
        'Radio GAMING': 'https://radio-gaming.stream/Images/Logos/Radio-Gaming-Logo.webp',
        'Radio GAMING DARK': 'https://radio-gaming.stream/Images/Logos/Radio-Gaming-dark-logo.webp',
        'Radio GAMING MARON FM': 'https://radio-gaming.stream/Images/Logos/Radio-Gaming-Maron-fm-logo.webp',
    };
    const fallbackLogo = 'https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png';

    // Group songs by station
    const groups = songFavorites.reduce((acc, song) => {
        if (!acc[song.station]) acc[song.station] = [];
        acc[song.station].push(song);
        return acc;
    }, {});

    let html = '';
    Object.keys(groups).forEach(stationName => {
        const stationSongs = groups[stationName];

        // Add station header
        const sLogo2 = stationLogos[stationName] || fallbackLogo;
        html += `
            <div class="station-group-header">
                <img src="${sLogo2}" alt="${stationName}" class="station-group-logo" onerror="this.src='${fallbackLogo}'">
                <h3>${stationName}</h3>
                <span class="song-count">${stationSongs.length} favorites</span>
            </div>
        `;

        html += stationSongs.map((song, i) => {
            const timeAgo = getTimeAgo(song.timestamp);
            const encodedTitle = encodeURIComponent(song.title);
            const stats = listeningStats.songs[song.title] || { playCount: 0, listeningTime: 0 };

            if (historyViewMode === 'grid') {
                return `
                    <div class="grid-item" style="animation-delay: ${i * 0.05}s">
                        <div class="grid-cover-wrapper">
                            <img class="grid-cover" src="${song.cover}" alt="Cover" onerror="this.src='https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png'">
                        </div>
                        <div class="grid-info">
                            <div class="grid-title" title="${song.title}">${song.title}</div>
                            <div class="grid-meta">${song.station}</div>
                            <div class="grid-stats">${stats.playCount} plays</div>
                        </div>
                        <div class="grid-actions">
                            <button class="grid-action-btn favorited" onclick="toggleFavorite('${song.title.replace(/'/g, "\\'")}')" title="Favorite">
                                <i class="fas fa-heart"></i>
                            </button>
                            <button class="grid-action-btn" onclick="shareSongToChat('${song.title.replace(/'/g, "\\'")}', '${song.cover}', '${song.station}')" title="Share">
                                <i class="fas fa-comment-alt"></i>
                            </button>
                            <a class="grid-action-btn spotify-btn" href="https://open.spotify.com/search/${encodedTitle}" target="_blank" onclick="event.stopPropagation();" title="Spotify">
                                <i class="fab fa-spotify"></i>
                            </a>
                            <a class="grid-action-btn youtube-btn" href="https://www.youtube.com/results?search_query=${encodedTitle}" target="_blank" onclick="event.stopPropagation();" title="YouTube">
                                <i class="fab fa-youtube"></i>
                            </a>
                        </div>
                    </div>`;
            }

            return `
                <div class="history-item" style="animation-delay: ${i * 0.05}s">
                    <img class="history-item-cover" src="${song.cover}" alt="Cover" onerror="this.src='https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png'">
                    <div class="history-item-info">
                        <div class="history-item-title" title="${song.title}">${song.title}</div>
                        <div class="history-item-meta">
                            <span class="history-item-station">${song.station}</span>
                            <span class="history-item-playcount">• ${stats.playCount} plays</span>
                            <span>• ${timeAgo}</span>
                        </div>
                    </div>
                    <div class="history-item-actions">
                        <button class="history-action-btn chat-share-btn" onclick="shareSongToChat('${song.title.replace(/'/g, "\\'")}', '${song.cover}', '${song.station}')"
                            title="Share to Chat">
                            <i class="fas fa-comment-alt"></i>
                        </button>
                        <button class="history-action-btn favorited" onclick="toggleFavorite('${song.title.replace(/'/g, "\\'")}')"
                            title="Remove from favorites">
                            <i class="fas fa-heart"></i>
                        </button>
                        <a class="history-action-btn spotify-btn" href="https://open.spotify.com/search/${encodedTitle}" target="_blank" title="Search on Spotify">
                            <i class="fab fa-spotify"></i>
                        </a>
                        <a class="history-action-btn youtube-btn" href="https://www.youtube.com/results?search_query=${encodedTitle}" target="_blank" title="Search on YouTube">
                            <i class="fab fa-youtube"></i>
                        </a>
                    </div>
                </div>`;
        }).join('');
    });

    list.innerHTML = html;
}

// ========================
// DATA PERSISTENCE (EX/IM)
// ========================

window.exportUserData = async function () {
    const userData = {};
    const prefix = 'RadioGaming-';

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(prefix)) {
            userData[key] = localStorage.getItem(key);
        }
    }

    if (Object.keys(userData).length === 0) {
        showNotification("No data to export!", "fas fa-info-circle");
        return;
    }

    const content = JSON.stringify(userData, null, 4);
    const fileName = `RadioGaming-Backup-${new Date().toISOString().split('T')[0]}.json`;

    // Try to use File System Access API for "Save As" experience (Chrome/Edge/Opera)
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'JSON Backup',
                    accept: { 'application/json': ['.json'] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            showNotification("Data saved successfully!", "fas fa-file-export");
            return;
        } catch (err) {
            // If user cancels, just stop
            if (err.name === 'AbortError') return;
            console.warn("FilePicker failed or not supported, falling back to download.", err);
        }
    }

    // Fallback for Firefox and older browsers
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification("Data exported (check downloads)!", "fas fa-file-export");
};

window.importUserData = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            const keys = Object.keys(data);

            if (keys.length === 0) {
                showNotification("Invalid backup file!", "fas fa-exclamation-triangle");
                return;
            }

            if (!confirm(`Are you sure you want to import ${keys.length} items? This will merge with your existing data.`)) {
                event.target.value = '';
                return;
            }

            keys.forEach(key => {
                if (key.startsWith('RadioGaming-')) {
                    localStorage.setItem(key, data[key]);
                }
            });

            showNotification("Data imported! Reloading...", "fas fa-check-circle");

            // Reload page to re-initialize everything with new data
            setTimeout(() => {
                window.location.reload();
            }, 1500);

        } catch (err) {
            console.error("Import error:", err);
            showNotification("Failed to parse JSON file!", "fas fa-exclamation-circle");
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
};
