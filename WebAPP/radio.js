const albumCovers = {};
const eventSources = new Map();

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
            break;
        case 'loading':
        case 'waiting':
        case 'buffering':
            badge.classList.add('loading');
            text.textContent = 'LOADING';
            break;
        case 'paused':
            badge.classList.add('paused');
            text.textContent = 'PAUSED';
            break;
        case 'offline':
        case 'error':
            badge.classList.add('offline');
            text.textContent = 'OFFLINE';
            break;
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
            fetchSpotifyCover(cleanedTitle); // Fetch and display the Spotify cover

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
        setInterval(updateAllOnlineUsers, 40000);
    }, 6000);

    // Audio time update listener
    const currentTimeElement = document.getElementById('currentTime');
    if (audio && currentTimeElement) {
        audio.addEventListener('timeupdate', function () {
            currentTimeElement.textContent = formatTime(audio.currentTime);
        });
    }

    changeVolume(0.1);

    // Fetch Spotify token early for loading progress
    getSpotifyAccessToken();

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

    // Listen for Fullscreen API changes
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    document.addEventListener('mozfullscreenchange', checkFullscreen);
    document.addEventListener('MSFullscreenChange', checkFullscreen);

    // Listen for F11/window resize
    window.addEventListener('resize', checkFullscreen);

    // Initial check
    checkFullscreen();
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

async function fetchAlbumCovers() {
    updateLoadingProgress(10, "Loading Artwork Data...");
    try {
        const response = await fetch('https://raw.githubusercontent.com/kubadoPL/Gaming-Radio/main/WebAPP/albumCovers.json');
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

async function fetchSpotifyCover(query) {
    const fallbackCover = 'https://radio-gaming.stream/Images/Logos/Radio%20Gaming%20Logo%20with%20miodzix%20planet.png';
    try {
        const accessToken = await getSpotifyAccessToken();
        if (!accessToken) throw new Error("No token");

        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
        const response = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        const data = await response.json();

        let albumCover = fallbackCover;
        if (data.tracks && data.tracks.items.length > 0) {
            const bestTrack = findBestTrackMatch(query, data.tracks.items);
            const defaultCover = bestTrack.album.images[0].url;
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

function showNotification(message, icon = 'fas fa-bell') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = 'notificationPopup';
    notification.innerHTML = `
        <div class="notification-icon"><i class="${icon}"></i></div>
        <div class="notification-message">${message}</div>
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
        playPauseIcon.className = 'fas fa-pause';
        showNotification("Now Playing!");
    } else {
        audio.pause();
        playPauseIcon.className = 'fas fa-play';
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
        // This ensures the visualizer gets full signal while user controls output volume
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
        const bassBins = 4;
        for (let i = 0; i < bassBins; i++) {
            bassSum += dataArray[i];
        }
        let bassAverage = bassSum / bassBins;

        const threshold = 235;
        let triggerValue = 0;

        if (bassAverage > threshold) {
            triggerValue = (bassAverage - threshold) / (255 - threshold);
        }

        if (!window.lastTriggerValue) window.lastTriggerValue = 0;
        window.lastTriggerValue = window.lastTriggerValue * 0.8 + triggerValue * 0.2;
        const v = window.lastTriggerValue;

        const scale = 1 + v * 0.08;
        const glowSize = 30 + v * 80;
        const borderGlow = 6 + v * 18;
        const intensity = 0.35 + v * 0.35;
        const brightness = 0.92 + v * 0.18;

        // Optimization: only update DOM if values changed significantly
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

let previousVolume = 0.1;

function changeVolume(value) {
    if (gainNode) {
        gainNode.gain.value = value;
    } else if (audio) {
        audio.volume = value;
    }
    previousVolume = value;
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
        playPauseIcon.className = 'fas fa-pause';

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
    try {
        const accessToken = await getSpotifyAccessToken();
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
        const response = await fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken } });
        const data = await response.json();

        let cover = fallbackCover;
        if (data.tracks && data.tracks.items.length > 0) {
            const bestTrack = findBestTrackMatch(query, data.tracks.items);
            cover = albumCovers[query] || bestTrack.album.images[0].url;
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
                if (trackElem) trackElem.textContent = cleaned;
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

        if (cached && (Date.now() - cached.timestamp < 2 * 60 * 1000)) {
            console.log(`[Live Listeners] ${sName}: ${cached.listenerCount} (cached)`);
            updateTooltip(tooltipElement, cached.listenerCount, sName);
            return;
        }

        console.log(`[Live Listeners] Fetching count for ${sName}...`);
        const res = await fetch('https://bot-launcher-discord-017f7d5f49d9.herokuapp.com/ZenoFMApi/get-sum?station=' + normalized);
        const data = await res.json();
        const count = data.total_sum;

        console.log(`[Live Listeners] ${sName}: ${count} listeners`);
        localStorage.setItem(cacheKey, JSON.stringify({ listenerCount: count, timestamp: Date.now() }));
        updateTooltip(tooltipElement, count, sName);
    } catch (e) {
        console.error(`[Live Listeners] Error fetching count for ${sName}:`, e);
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

        // Notify if it's the active station and count changed significantly
        const currentStationName = stationName ? stationName.textContent : '';
        if (sName === currentStationName && count !== null) {
            const now = Date.now();
            const timeSinceLastNotify = now - lastListenerNotifyTime;

            // Notify if count changed and it's been at least 2 minutes, or if it's the first fetch
            if (lastActiveListenerCount === -1 || (count !== lastActiveListenerCount && timeSinceLastNotify > 120000)) {
                if (count > 0) {
                    showNotification(`There are <span class="notification-listeners-count">${count}</span> live listeners on ${sName}!`, 'fas fa-users');
                }
                lastActiveListenerCount = count;
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
