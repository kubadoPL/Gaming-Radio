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

// ========================
// DISCORD AUTH & CHAT SYSTEM
// ========================

const CHAT_API_BASE = 'https://bot-launcher-discord-017f7d5f49d9.herokuapp.com/DiscordAuthChatApi';
let discordAuthToken = localStorage.getItem('RadioGaming-discordAuthToken');
let discordUser = null;
let currentChatStation = 'RADIOGAMING';
let isSongShared = false;

window.toggleSongShare = function (forceState = null) {
    if (forceState !== null) {
        isSongShared = forceState;
    } else {
        isSongShared = !isSongShared;
    }

    const shareBtn = document.getElementById('chat-share-song-btn');
    const preview = document.getElementById('chat-song-preview');
    const previewText = preview.querySelector('.preview-song-name');

    if (isSongShared) {
        const currentSong = document.getElementById('streamTitle').textContent;
        if (!currentSong || currentSong === 'Loading...' || currentSong === '') {
            showNotification('Wait for a song to load before sharing!', 'fas fa-info-circle');
            isSongShared = false;
            return;
        }

        shareBtn.classList.add('active');
        preview.classList.remove('hidden');
        previewText.textContent = `Sharing: ${currentSong}`;
        showNotification('Current song attached to your message!', 'fas fa-music');
    } else {
        shareBtn.classList.remove('active');
        preview.classList.add('hidden');
    }
};

// Check for auth callback on page load
document.addEventListener('DOMContentLoaded', () => {
    handleAuthCallback();
    checkExistingSession();
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
    } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (userInfo) userInfo.classList.add('hidden');
        if (chatAuthPrompt) chatAuthPrompt.classList.remove('hidden');
        if (chatMain) chatMain.classList.add('hidden');
    }
}

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
    discordAuthToken = null;
    discordUser = null;

    stopChatPolling();

    updateAuthUI(false);
    showNotification('Logged out successfully', 'fas fa-sign-out-alt');
};

// Discord Webhook Share System
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1470563794424955069/Z5r9gtLBDyrzSYFUBQ_04bQwE5MaW7pzlTUfbcplEXpKEwo9lbGo2XPh8qpWkJJWaWMz'; // USER: Add your Discord Webhook URL here to enable sharing to a server
let lastDiscordShareTime = parseInt(localStorage.getItem('RadioGaming-lastDiscordShareTime')) || 0;
const DISCORD_SHARE_COOLDOWN = 120000; // 120 seconds in ms

window.shareOnDiscord = async function () {
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

    const stationName = document.getElementById('StationNameInh1').textContent;
    const songTitle = document.getElementById('streamTitle').textContent;
    const albumCover = document.getElementById('albumCover').src;
    const radioUrl = window.location.origin + window.location.pathname;

    // Determine embed design based on station
    let embedColor = 7536895; // Default Purple (#7300ff)
    let webhookUser = "Radio GAMING";
    let webhookAvatar = "https://radio-gaming.stream/Images/Logos/Radio-Gaming-Logo.webp";

    if (stationName.includes('DARK')) {
        embedColor = 2702538; // Blue (#293cca)
        webhookUser = "Radio GAMING DARK";
        webhookAvatar = "https://radio-gaming.stream/Images/Logos/Radio-Gaming-dark-logo.webp";
    } else if (stationName.includes('MARON')) {
        embedColor = 2566486; // Dark Blue (#272956)
        webhookUser = "Radio GAMING MARON FM";
        webhookAvatar = "https://radio-gaming.stream/Images/Logos/Radio-Gaming-Maron-fm-logo.webp";
    }

    if (!songTitle || songTitle === 'Loading...' || songTitle === '') {
        showNotification('Wait for a song to load before sharing!', 'fas fa-info-circle');
        return;
    }

    if (!DISCORD_WEBHOOK_URL) {
        // If no webhook is configured, we can still "share" by posting to the integrated chat
        if (discordAuthToken && discordUser) {
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.value = "🎶 I'm currently listening to this! ";
                toggleSongShare(true);
                await sendChatMessage();
                showNotification('Shared current song to the station chat!', 'fab fa-discord');
                return;
            }
        }
        showNotification('Discord Webhook not configured in radio.js!', 'fas fa-exclamation-triangle');
        return;
    }

    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
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
                    title: `Listening to ${stationName}`,
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
};

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
    if (!discordAuthToken || chatPollingInterval) return;

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
    currentChatStation = stationName.replace(/\s+/g, '').toUpperCase();

    // Update chat UI
    const chatStationLabel = document.getElementById('chat-current-station');
    if (chatStationLabel) chatStationLabel.textContent = stationName;
}

async function loadChatHistory() {
    try {
        const headers = {};
        if (discordAuthToken) {
            headers['Authorization'] = `Bearer ${discordAuthToken}`;
        }

        const response = await fetch(`${CHAT_API_BASE}/chat/history/${currentChatStation}`, { headers });
        const data = await response.json();

        if (data.online_count !== undefined) {
            updateOnlineCountUI(data.online_count);
        }

        if (data.messages && data.messages.length > 0) {
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
                // Clear welcome message
                messagesContainer.innerHTML = '';
                data.messages.forEach(message => appendChatMessage(message, false));

                // Scroll to bottom after the section transition and DOM update
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    isChatAtBottom = true;
                }, 300);

                // Track last message timestamp
                lastMessageTimestamp = data.messages[data.messages.length - 1].timestamp;
            }
        }

        if (data.server_time) {
            lastMessageTimestamp = lastMessageTimestamp || data.server_time;
        }
    } catch (error) {
        console.error('[CHAT] Error loading history:', error);
    }
}

async function pollNewMessages() {
    if (!discordAuthToken || !isChatVisible) return;

    try {
        const since = lastMessageTimestamp ? `?since=${encodeURIComponent(lastMessageTimestamp)}` : '';
        const response = await fetch(`${CHAT_API_BASE}/chat/poll/${currentChatStation}${since}`, {
            headers: {
                'Authorization': `Bearer ${discordAuthToken}`
            }
        });
        const data = await response.json();

        if (data.online_count !== undefined) {
            updateOnlineCountUI(data.online_count);
        }

        if (data.messages && data.messages.length > 0) {
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
        console.error('[CHAT] Polling error:', error);
    }
}

function updateOnlineCountUI(count) {
    const onlineCountElem = document.getElementById('chat-online-count');
    if (onlineCountElem) {
        onlineCountElem.textContent = count;
    }
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

    messageEl.innerHTML = `
        <img class="chat-message-avatar" src="${message.user.avatar_url}" alt="${message.user.username}">
        <div class="chat-message-content">
            <div class="chat-message-header">
                <span class="chat-message-username">${message.user.global_name || message.user.username}</span>
                <span class="chat-message-time">${timeStr}</span>
            </div>
            <div class="chat-message-text">${escapeHtml(message.content)}</div>
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

window.sendChatMessage = async function () {
    const input = document.getElementById('chat-input');
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    if (message.length > 200) {
        showNotification(`Message is too long! ${message.length}/200 letters`, 'fas fa-exclamation-triangle');
        return;
    }

    if (!discordAuthToken) {
        showNotification('Please login to chat', 'fas fa-exclamation-triangle');
        return;
    }

    try {
        const songData = isSongShared ? {
            title: document.getElementById('streamTitle').textContent,
            artwork: document.getElementById('albumCover').src,
            station: document.getElementById('StationNameInh1').textContent
        } : null;

        const response = await fetch(`${CHAT_API_BASE}/chat/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${discordAuthToken}`
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

    if (isChatVisible && discordAuthToken && discordUser) {
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

