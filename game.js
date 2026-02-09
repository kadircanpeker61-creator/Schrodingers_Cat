// GLOBALS
// isPlaying, gameTime, score are defined later, removing duplicate declarations here to fix lint errors

// WEBP SUPPORT CHECK (Step 8) - WRAPPED IN TRY-CATCH
let supportsWebP = true;
try {
    function checkWebPSupport() {
        const elem = document.createElement('canvas');
        if (!!(elem.getContext && elem.getContext('2d'))) {
            supportsWebP = elem.toDataURL('image/webp').indexOf('data:image/webp') == 0;
        } else {
            supportsWebP = false;
        }
        console.log("WebP Support:", supportsWebP);
        if (!supportsWebP) convertStaticImagesToPng();
    }
    checkWebPSupport();
} catch (e) {
    console.error("WebP Check Failed:", e);
}

function getAssetPath(filename) {
    if (supportsWebP) return filename;
    return filename.replace('.webp', '.png');
}

function convertStaticImagesToPng() {
    document.querySelectorAll('img').forEach(img => {
        if (img.src.includes('.webp')) {
            img.src = img.src.replace('.webp', '.png');
        }
    });
    updateMenuBackground();
}

// IOS AUDIO UNLOCK INITIALIZATION (Step 11) - FIXED PASSIVE
function unlockIOSAudio() {
    if (audioManager) audioManager.unlockAudio();
    document.removeEventListener('touchstart', unlockIOSAudio);
    document.removeEventListener('click', unlockIOSAudio);
}
// Use passive: true to ensure we never block clicks/scrolls
document.addEventListener('touchstart', unlockIOSAudio, { passive: true });
document.addEventListener('click', unlockIOSAudio);

// --- PERFORMANCE CACHE SYSTEM ---
const RENDER_CACHE = {
    groundPatterns: {}, // { 'white': CanvasPattern, 'black': CanvasPattern }
    obstacles: {},      // { 'themeName': OffscreenCanvas }
    isInitialized: false
};

function initRenderCache() {
    if (RENDER_CACHE.isInitialized) return;

    // 1. Pre-render Ground Patterns
    const tileSize = 40;
    ['white', 'black'].forEach(type => {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = tileSize;
        offCanvas.height = tileSize;
        const offCtx = offCanvas.getContext('2d');
        const isWhite = type === 'white';

        // Draw Tile
        offCtx.fillStyle = isWhite ? '#b0b0b0' : '#080808';
        offCtx.fillRect(0, 0, tileSize, tileSize);

        offCtx.lineWidth = 2;
        offCtx.strokeStyle = isWhite ? 'rgba(255,255,255,0.3)' : 'rgba(50,50,50,0.5)';
        offCtx.fillStyle = isWhite ? 'rgba(255,255,255,0.1)' : 'rgba(20,20,20,0.5)';

        // Pattern tile
        offCtx.beginPath();
        offCtx.roundRect(2, 2, tileSize - 4, tileSize - 4, 4);
        offCtx.fill();
        offCtx.stroke();

        // Top Highlight (Partial)
        offCtx.fillStyle = isWhite ? '#fff' : '#333';
        offCtx.fillRect(0, 0, tileSize, 4);

        RENDER_CACHE.groundPatterns[type] = ctx.createPattern(offCanvas, 'repeat');
    });

    // 2. Pre-render Obstacles (if possible, or lazy-load)
    RENDER_CACHE.isInitialized = true;
    console.log("Render Cache Initialized");
}

function getCachedObstacle(theme, width, height, drawFunc) {
    const key = `${theme}_${width}_${height}`;
    if (RENDER_CACHE.obstacles[key]) return RENDER_CACHE.obstacles[key];

    const offCanvas = document.createElement('canvas');
    offCanvas.width = width + 20; // Extra space for glow
    offCanvas.height = height + 20;
    const offCtx = offCanvas.getContext('2d');

    // Draw with offset for shadows/glow
    offCtx.translate(10, 10);
    drawFunc(offCtx, width, height);

    RENDER_CACHE.obstacles[key] = offCanvas;
    return offCanvas;
}

const MUSIC_DATA = { "CITY": "assets/neon_music.ogg", "LAB": "assets/lab_music.ogg", "FOREST": "assets/forest_music.ogg", "EGYPT": "assets/egypt.ogg", "ISLAND": "assets/island.ogg", "VIENNA": "assets/vienna_music.ogg", "MATRIX": "assets/matrix_music.ogg", "QUANTUM": "assets/quantum_music.ogg", "ORIENTAL": "assets/oriental.ogg", "RUINS": "assets/ruins.ogg" };

class AudioManager {
    constructor() {
        this.ctx = null;
        this.isMusicPlaying = false;
        this.musicSource = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.masterGain = null;
        this.currentTheme = null;

        // Settings Defaults
        this.musicVolume = parseFloat(localStorage.getItem('musicVolume'));
        if (isNaN(this.musicVolume)) this.musicVolume = 0.3;

        this.sfxVolume = parseFloat(localStorage.getItem('sfxVolume'));
        if (isNaN(this.sfxVolume)) this.sfxVolume = 0.3;

        this.isMuted = localStorage.getItem('gameMuted') === 'true';

        // Müzik Dosyaları Eşleştirmesi
        this.themeFiles = {
            'CITY': 'assets/vienna_music.ogg',     // Vienna/Noir
            'LAB': 'assets/lab_music.ogg',         // Radioactive
            'MATRIX': 'assets/matrix_music.ogg',   // Simulation
            'SYNTHWAVE': 'assets/neon_music.ogg',  // Neon Future
            'VOID': 'assets/quantum_music.ogg',    // Quantum
            'EGYPT': 'assets/egypt.ogg',
            'FOREST': 'assets/forest.ogg',
            'ISLAND': 'assets/island.ogg',
            'ORIENTAL': 'assets/oriental.ogg',
            'RUINS': 'assets/ruins.ogg'
        };

        this.musicBuffers = {}; // Yüklenen müzikleri cachelemek için
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();

            // Master Gain (Used for Mute logic mainly)
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.isMuted ? 0 : 1;
            this.masterGain.connect(this.ctx.destination);

            // Music Channel
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = this.musicVolume;
            this.musicGain.connect(this.masterGain);

            // SFX Channel
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = this.sfxVolume;
            this.sfxGain.connect(this.masterGain);
        }

        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setMusicVolume(val) {
        this.musicVolume = val;
        localStorage.setItem('musicVolume', val);
        if (this.musicGain) {
            this.musicGain.gain.setValueAtTime(val, this.ctx.currentTime);
        }
    }

    setSfxVolume(val) {
        this.sfxVolume = val;
        localStorage.setItem('sfxVolume', val);
        if (this.sfxGain) {
            this.sfxGain.gain.setValueAtTime(val, this.ctx.currentTime);
        }
    }

    setMute(state) {
        this.isMuted = state;
        localStorage.setItem('gameMuted', state);
        if (this.masterGain) {
            // Toggle Master between 0 and 1. Individual volumes are kept in their own gain nodes.
            const target = state ? 0 : 1;
            this.masterGain.gain.setValueAtTime(target, this.ctx.currentTime);
        }
    }

    // IOS UNLOCK (Step 11)
    unlockAudio() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                console.log("Audio Context Force Resumed");
                // Play silent buffer to effectively unlock
                const buffer = this.ctx.createBuffer(1, 1, 22050);
                const source = this.ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(this.ctx.destination);
                source.start(0);
            });
        }
    }

    playJump() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        // PITCH FIX: 200->600 was too squeaky. 
        // New: 120->350 (Deeper, cleaner jump)
        osc.frequency.setValueAtTime(120, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(350, this.ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain); // Connect to SFX Gain
        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    playSwitch() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle'; // Square was too harsh
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        gain.connect(this.sfxGain); // Connect to SFX Gain
        osc.connect(gain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    // NEW: Deep 'Tok' Menu Sound
    playMenuClick() {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Deep Sine Kick (Thud)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        // Fast Attack/Decay
        gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.sfxGain); // Connect to SFX Gain

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playCoin() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.sfxGain); // Connect to SFX Gain
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playGameOver() {
        if (!this.ctx) return;

        // Müzik durdur
        this.stopMusic();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // PITCH FIX: 400->50 Sawtooth was too harsh/screaming
        // New: 150->30 Triangle (Sad, heavy drop)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 1.0);

        gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1.0);

        osc.connect(gain);
        gain.connect(this.sfxGain); // Connect to SFX Gain
        osc.start();
        osc.stop(this.ctx.currentTime + 1.0);
    }

    // --- MUSIC ENGINE ---
    async startMusic(theme = 'CITY') {
        if (!this.ctx) { this.init(); }

        // FORCE RESUME for Mobile: Ensure context is running whenever music is requested
        // This usually works if the call stack originated from a user click (like "Start Game")
        if (this.ctx.state === 'suspended') {
            try {
                await this.ctx.resume();
                console.log("Audio Context Force Resumed in startMusic");
            } catch (e) {
                console.warn("Could not resume audio context - wait for user interaction", e);
            }
        }

        if (this.isMusicPlaying && this.currentTheme === theme) return;

        this.stopMusic();
        this.isMusicPlaying = true;
        this.currentTheme = theme;

        // Use Embedded Data if available, fallback to file path
        let musicSource = (typeof MUSIC_DATA !== 'undefined' && MUSIC_DATA[theme]) ? MUSIC_DATA[theme] : null;

        if (!musicSource) {
            musicSource = this.themeFiles[theme] || this.themeFiles['CITY'];
        }

        try {
            await this.playMusicFile(musicSource);
        } catch (err) {
            console.error("Music playback error:", err);
            this.isMusicPlaying = false;
        }
    }

    async playMusicFile(url) {
        console.log("[Audio] Attempting to play:", url);

        // --- METHOD 1: Web Audio API (Preferred) ---
        if (!this.musicBuffers[url]) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const arrayBuffer = await response.arrayBuffer();
                this.musicBuffers[url] = await this.ctx.decodeAudioData(arrayBuffer);
                console.log("Müzik decode edildi (Web Audio):", url);
            } catch (e) {
                console.warn("Web Audio Fetch Failed (Likely file:// protocol), trying fallback...", e);
                // Fallback to Method 2 immediately
                this.playMusicFallback(url);
                return;
            }
        }

        if (!this.isMusicPlaying) return;

        // Stop previous Web Audio source
        if (this.musicSource) {
            try { this.musicSource.stop(); } catch (e) { }
        }
        // Stop previous Fallback Audio
        if (this.fallbackAudio) {
            this.fallbackAudio.pause();
            this.fallbackAudio.currentTime = 0;
        }

        try {
            const buffer = this.musicBuffers[url];
            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            source.connect(this.musicGain);
            source.start(0);
            this.musicSource = source;
            console.log("Müzik başladı (Web Audio):", url);
        } catch (e) {
            console.error("Web Audio Playback Error:", e);
        }
    }

    // --- METHOD 2: HTML5 Audio (Fallback for local files) ---
    playMusicFallback(url) {
        if (!this.isMusicPlaying) return;

        // Stop previous sources
        if (this.musicSource) { try { this.musicSource.stop(); } catch (e) { } }
        if (this.fallbackAudio) {
            this.fallbackAudio.pause();
            this.fallbackAudio.currentTime = 0;
        }

        console.log("Müzik başlatılıyor (Fallback Audio):", url);
        const audio = new Audio(url);
        audio.loop = true;
        // Volume syncing is harder without gain node, but workable
        audio.volume = this.musicVolume;

        // Add error listener for user feedback
        audio.onerror = (e) => {
            console.error("Fallback Audio Error:", e);
            showToast("HATA", "Müzik dosyası bulunamadı: " + url.split('/').pop(), "fa-triangle-exclamation");
        };

        audio.play().catch(e => {
            console.error("Autoplay/Play Error:", e);
        });

        this.fallbackAudio = audio;
    }

    stopMusic() {
        if (this.musicSource) {
            try { this.musicSource.stop(); } catch (e) { }
            this.musicSource = null;
        }
        if (this.fallbackAudio) {
            this.fallbackAudio.pause();
            this.fallbackAudio.currentTime = 0;
            this.fallbackAudio = null;
        }
        this.isMusicPlaying = false;
    }
}

class BackgroundLayer {
    constructor(speedModifier, theme = 'CITY') {
        this.x = 0;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.speedModifier = speedModifier;
        this.speed = 0;
        this.theme = theme;

        // ASSET MAPPING - Using Converted WebP (Optimized)
        const themeAssets = {
            'CITY': 'assets/Noir_plan.webp',
            'LAB': 'assets/Radyoaktif_Lab.webp',
            'MATRIX': 'assets/Simülasyon_plan.webp',
            'SYNTHWAVE': 'assets/Neon_Gelecek.webp', // Renamed to remove space
            'VOID': 'assets/Kuantum_plan.webp',
            'EGYPT': 'assets/mısır_plan.webp',
            'FOREST': 'assets/orman_plan.webp',
            'ISLAND': 'assets/ada_plan.webp',
            'ORIENTAL': 'assets/chınes_plan.webp',
            'RUINS': 'assets/yıkım_plan.webp'
        };

        this.image = new Image();
        // Explicitly encode ONLY the filename part if needed, but modern browsers usually handle spaces in src.
        // However, we will use a safe approach:
        // If it fails, we fall back.

        let assetPath = themeAssets[this.theme] || 'assets/Noir_plan.webp';
        this.image.src = assetPath;

        // Debug log
        console.log(`Initializing Background: ${this.theme} -> ${assetPath}`);
        this.image.onerror = () => {
            console.error("Background Image Failed to Load:", assetPath);
            // Fallback to City - ONLY on critical failure
            if (this.theme !== 'CITY') {
                // Optional: Maybe try encoded version only on failure?
                // For now just fallback to ensure game doesn't look broken (white/black screen)
                // this.image.src = 'assets/Noir_plan.webp'; 

                // Let's NOT fallback immediately to see if it eventually loads or use a different strategy?
                // User says "Vienna opens" implies fallback works.
                // We will keep fallback for safety.
                this.image.src = 'assets/Noir_plan.webp';
            }
        };
    }

    update(speed, dt) {
        this.speed = speed * this.speedModifier;
        this.x -= this.speed * 60 * dt;
        if (this.x <= -this.width) {
            this.x = 0;
        }
    }

    draw(ctx, canvasWidth, canvasHeight, groundY) {
        ctx.imageSmoothingEnabled = false;

        // Always try to draw image
        if (this.image && this.image.complete && this.image.naturalWidth !== 0) {
            ctx.drawImage(this.image, this.x, 0, this.width, this.height);
            ctx.drawImage(this.image, this.x + this.width, 0, this.width, this.height);
        } else {
            // Fallback to Solid Color if image missing/loading
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            // Loading text to debug
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '20px monospace';
            ctx.fillText("LOADING THEME...", 20, 40);
        }
    }
}

class Ground {
    constructor(x, width, type) {
        this.x = x;
        this.width = width;
        this.type = type;
    }
}

class Obstacle {
    constructor(x, type, groundY) {
        this.x = x;
        this.type = type;
        this.width = 30;
        this.height = 50;
        this.y = groundY - this.height;
    }
}

class ObstacleManager {
    constructor() {
        this.groundSegments = [];
        this.obstacles = [];
    }

    reset(width, groundY) {
        this.groundSegments = [];
        this.obstacles = [];
        this.groundSegments.push(new Ground(0, width * 1.5, 'white'));
    }

    update(speed, width, groundY, deltaTime) {
        // Update Ground
        if (this.groundSegments[0].x + this.groundSegments[0].width < -100) {
            this.groundSegments.shift();
        }

        const lastG = this.groundSegments[this.groundSegments.length - 1];
        if (lastG.x + lastG.width < width + 200) {
            const newX = lastG.x + lastG.width;

            let nextType = lastG.type === 'white' ? 'black' : 'white';
            if (Math.random() < 0.85) {
                nextType = lastG.type === 'white' ? 'black' : 'white';
            }

            // FIX: Dinamik güvenli alan hesabı
            // Hız arttıkça engellerin kenarlara olan mesafesi artmalı
            const safeMargin = Math.max(300, 150 + (speed * 20));

            // Zemin uzunluğu en az 2 katı kadar olmalı ki engel sığsın
            const minLen = (safeMargin * 2.5) + (speed * 10);
            const newW = minLen + Math.random() * 500;

            this.groundSegments.push(new Ground(newX, newW, nextType));

            let currentSpawnX = newX + safeMargin;
            const limitX = newX + newW - safeMargin;

            while (currentSpawnX < limitX) {
                if (Math.random() < 0.9) {
                    this.obstacles.push(new Obstacle(currentSpawnX, 'spike', groundY));
                }

                const settings = DIFFICULTY_SETTINGS[currentDifficulty] || DIFFICULTY_SETTINGS['EASY'];
                const gapMultiplier = settings.gapMultiplier || 1.0;

                // FIX: Increase spacing to ensure jump distance < gap
                // Using gapMultiplier allows wider gaps for Easy mode (more forgiving)
                const jumpDistance = 100 + (speed * 26);

                // Base gap logic adjusted by multiplier
                currentSpawnX += (jumpDistance + (Math.random() * 200)) * gapMultiplier;
            }
        }

        // Update Obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            let obs = this.obstacles[i];
            obs.x -= speed * 60 * deltaTime;

            // Check if passed
            // Check if passed
            if (!obs.passed && obs.x + obs.width < player.x) {
                obs.passed = true;

                // TRACKING: Obstacles Per Second
                const now = Date.now();
                obstaclesPassedTimestamps.push(now);
                // Filter last 1 second
                obstaclesPassedTimestamps = obstaclesPassedTimestamps.filter(t => now - t <= 1000);
                if (obstaclesPassedTimestamps.length > maxObstaclesPerSecond) {
                    maxObstaclesPerSecond = obstaclesPassedTimestamps.length;
                }

                // Also track total obstacles passed in run
                obstaclesPassedCount++;
            }

            if (obs.x < -100) this.obstacles.splice(i, 1);
        }

        // Move ground
        for (let g of this.groundSegments) {
            g.x -= speed * 60 * deltaTime;
        }
    }

    draw(ctx, height, groundY) {
        // Zemin Çizimi
        for (let g of this.groundSegments) {
            const isWhite = g.type === 'white';
            const pattern = RENDER_CACHE.groundPatterns[g.type];

            // 1. Draw solid base (Fast)
            ctx.fillStyle = isWhite ? '#b0b0b0' : '#080808';
            ctx.fillRect(g.x, groundY, g.width, height - groundY);

            // 2. Draw Cached Pattern
            if (pattern) {
                ctx.save();
                // Translate pattern to match ground movement
                const matrix = new DOMMatrix().translate(g.x, groundY);
                pattern.setTransform(matrix);
                ctx.fillStyle = pattern;
                ctx.fillRect(g.x, groundY, g.width, height - groundY);
                ctx.restore();
            }

            // 3. Top Highlight Line & Gradient Fade (Few calls)
            ctx.fillStyle = isWhite ? '#fff' : '#333';
            ctx.fillRect(g.x, groundY, g.width, 10);

            const grad = ctx.createLinearGradient(0, height - 50, 0, height);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.8)');
            ctx.fillStyle = grad;
            ctx.fillRect(g.x, height - 50, g.width, 50);
        }

        // --- THEME SPECIFIC OBSTACLES ---
        for (let obs of this.obstacles) {
            ctx.save();
            ctx.translate(obs.x, obs.y);

            const currentTheme = economyData.equippedTheme || 'CITY';

            switch (currentTheme) {
                case 'CITY':
                    this.drawUraniumFlask(ctx, obs.width, obs.height);
                    break;
                case 'EGYPT':
                    this.drawCanopicJar(ctx, obs.width, obs.height);
                    break;
                case 'FOREST':
                    this.drawPoisonMushroom(ctx, obs.width, obs.height);
                    break;
                case 'ISLAND':
                    this.drawStormCrystal(ctx, obs.width, obs.height);
                    break;
                case 'ORIENTAL':
                    this.drawStoneLantern(ctx, obs.width, obs.height);
                    break;
                case 'RUINS':
                    this.drawToxicBarrel(ctx, obs.width, obs.height);
                    break;
                case 'LAB':
                    this.drawLabTestTubes(ctx, obs.width, obs.height);
                    break;
                case 'MATRIX':
                    this.drawGlitchBlock(ctx, obs.width, obs.height);
                    break;
                case 'SYNTHWAVE':
                    this.drawNeonPyramid(ctx, obs.width, obs.height);
                    break;
                case 'VOID':
                    this.drawBlackHole(ctx, obs.width, obs.height);
                    break;
                default:
                    this.drawUraniumFlask(ctx, obs.width, obs.height);
                    break;
            }

            ctx.restore();
        }
        ctx.restore();
    }

    // --- THEME DRAWING HELPERS ---

    drawUraniumFlask(ctx, w, h) {
        // 1. Şişe İçindeki Sıvı (Uranyum)
        ctx.fillStyle = '#39FF14'; // Neon Yeşil
        ctx.shadowColor = '#39FF14';
        ctx.shadowBlur = 20;

        ctx.beginPath();
        // Sıvı seviyesi (hafif dalgalanma efekti)
        const liquidLevel = h * 0.4 + Math.sin(Date.now() / 200) * 2;

        ctx.moveTo(w * 0.2, h); // Sol alt
        ctx.lineTo(w * 0.8, h); // Sağ alt
        ctx.lineTo(w * 0.65, h - liquidLevel); // Sağ üst sıvı sınırı
        ctx.lineTo(w * 0.35, h - liquidLevel); // Sol üst sıvı sınırı
        ctx.fill();

        // 2. Şişe Camı (Erlenmeyer Şekli)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 0; // Cam parlamasın

        ctx.beginPath();
        ctx.moveTo(w * 0.35, 0); // Ağız sol
        ctx.lineTo(w * 0.65, 0); // Ağız sağ
        ctx.lineTo(w * 0.65, h * 0.3); // Boyun sağ
        ctx.lineTo(w * 0.9, h); // Taban sağ köşe
        ctx.quadraticCurveTo(w * 0.5, h + 5, w * 0.1, h); // Hafif kavisli taban
        ctx.lineTo(w * 0.35, h * 0.3); // Boyun sol
        ctx.closePath();
        ctx.stroke();

        // 3. Kabarcıklar (Radyasyon efekti)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        if (Math.random() > 0.8) {
            ctx.beginPath();
            ctx.arc(w / 2 + (Math.random() - 0.5) * 10, h - liquidLevel + Math.random() * 10, 1 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // 4. Kafatası / Tehlike Sembolü
        ctx.fillStyle = '#000';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('☢', w / 2, h - 5);
    }

    drawCanopicJar(ctx, w, h) {
        // ANTİK MISIR: Kanopik Kavanoz
        // Gövde (Altın)
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, '#DAA520'); // GoldenRod
        grad.addColorStop(0.5, '#FFD700'); // Gold
        grad.addColorStop(1, '#B8860B'); // DarkGoldenRod
        ctx.fillStyle = grad;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.moveTo(w * 0.2, h);
        ctx.lineTo(w * 0.8, h);
        ctx.quadraticCurveTo(w * 0.9, h * 0.2, w * 0.2, h * 0.2); // Çanak şekli
        ctx.quadraticCurveTo(w * 0.1, h * 0.2, w * 0.2, h);
        ctx.fill();

        // Kapak (Çakal Başı - Anubis)
        ctx.fillStyle = '#2F4F4F'; // DarkSlateGray
        ctx.beginPath();
        ctx.moveTo(w * 0.2, h * 0.25);
        ctx.lineTo(w * 0.8, h * 0.25);
        ctx.lineTo(w * 0.5, -h * 0.1); // Sivri kulaklar
        ctx.fill();

        // Dekoratif Şeritler (Mavi)
        ctx.strokeStyle = '#0000CD'; // MediumBlue
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(w * 0.15, h * 0.4);
        ctx.lineTo(w * 0.85, h * 0.4);
        ctx.moveTo(w * 0.18, h * 0.6);
        ctx.lineTo(w * 0.82, h * 0.6);
        ctx.stroke();
    }

    drawPoisonMushroom(ctx, w, h) {
        // MİSTİK ORMAN: Zehirli Mantar
        // Sap
        ctx.fillStyle = '#F5F5DC'; // Beige
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.rect(w * 0.35, h * 0.4, w * 0.3, h * 0.6);
        ctx.fill();

        // Şapka (Mor ve Parlak)
        ctx.fillStyle = '#8A2BE2'; // BlueViolet
        ctx.shadowColor = '#9400D3';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.4, w * 0.6, Math.PI, 0); // Yarım daire
        ctx.fill();

        // Benekler (Yeşil Zehir)
        ctx.fillStyle = '#7FFF00'; // Chartreuse
        ctx.beginPath();
        ctx.arc(w * 0.3, h * 0.25, 3, 0, Math.PI * 2);
        ctx.arc(w * 0.7, h * 0.3, 4, 0, Math.PI * 2);
        ctx.arc(w * 0.5, h * 0.15, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    drawStormCrystal(ctx, w, h) {
        // UÇAN ADA: Fırtına Kristali
        ctx.fillStyle = '#00FFFF'; // Aqua
        ctx.shadowColor = '#E0FFFF'; // LightCyan
        ctx.shadowBlur = 25;

        // Havada asılı durma efekti
        const floatY = Math.sin(Date.now() / 300) * 5;

        ctx.beginPath();
        ctx.moveTo(w / 2, 0 + floatY); // Üst Uç
        ctx.lineTo(w, h * 0.4 + floatY); // Orta Sağ
        ctx.lineTo(w / 2, h + floatY); // Alt Uç
        ctx.lineTo(0, h * 0.4 + floatY); // Orta Sol
        ctx.closePath();
        ctx.fill();

        // İç kısımdaki parlama
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w / 2, 0 + floatY);
        ctx.lineTo(w / 2, h + floatY);
        ctx.stroke();
    }

    drawStoneLantern(ctx, w, h) {
        // YASAK ŞEHİR: Taş Fener (Toro)
        ctx.shadowBlur = 0;

        // Kaide
        ctx.fillStyle = '#696969'; // DimGray
        ctx.fillRect(w * 0.3, h * 0.8, w * 0.4, h * 0.2);

        // Gövde (Direk)
        ctx.fillRect(w * 0.4, h * 0.5, w * 0.2, h * 0.3);

        // Işık Haznesi (Kırmızı Ateş)
        ctx.fillStyle = '#FF4500'; // OrangeRed
        ctx.shadowColor = '#FF0000';
        ctx.shadowBlur = 15;
        ctx.fillRect(w * 0.25, h * 0.25, w * 0.5, h * 0.25);

        // Çatı
        ctx.fillStyle = '#2F4F4F';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(w * 0.1, h * 0.25);
        ctx.lineTo(w * 0.9, h * 0.25);
        ctx.lineTo(w * 0.5, 0); // Tepe
        ctx.fill();
    }

    drawToxicBarrel(ctx, w, h) {
        // YIKILMIŞ DÜNYA: Paslı Varil
        ctx.shadowBlur = 0;

        // Varil Gövdesi
        ctx.fillStyle = '#8B4513'; // SaddleBrown (Pas rengi)
        ctx.fillRect(w * 0.1, h * 0.2, w * 0.8, h * 0.8);

        // Şeritler (Metal)
        ctx.fillStyle = '#CD853F'; // Peru
        ctx.fillRect(w * 0.1, h * 0.3, w * 0.8, h * 0.1);
        ctx.fillRect(w * 0.1, h * 0.7, w * 0.8, h * 0.1);

        // Sızan Yeşil Sıvı
        ctx.fillStyle = '#32CD32'; // LimeGreen
        ctx.shadowColor = '#00FF00';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(w * 0.8, h * 0.9, 5, 0, Math.PI * 2); // Sızıntı damlası
        ctx.fill();

        // Üstteki Radyoaktif Sembolü (Basit üçgen)
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(w * 0.3, h * 0.5);
        ctx.lineTo(w * 0.7, h * 0.5);
        ctx.lineTo(w * 0.5, h * 0.8);
        ctx.fill();
    }

    drawLabTestTubes(ctx, w, h) {
        // LAB: Test Tüpü Standı
        ctx.shadowBlur = 0;
        // Metal Stand Ayakları
        ctx.strokeStyle = '#C0C0C0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.1, h);
        ctx.lineTo(w * 0.1, h * 0.4);
        ctx.moveTo(w * 0.9, h);
        ctx.lineTo(w * 0.9, h * 0.4);
        ctx.stroke();

        // 3 Tüp
        for (let i = 0; i < 3; i++) {
            const tx = w * (0.2 + i * 0.25);
            const color = i === 0 ? '#FF0000' : i === 1 ? '#00FF00' : '#0000FF';

            // Cam tüp
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect(tx, h * 0.3, w * 0.15, h * 0.6);

            // Renkli Sıvı (Fokurdama efekti)
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 5;
            const boil = Math.random() * 5;
            ctx.fillRect(tx, h * 0.5 + boil, w * 0.15, h * 0.4 - boil);
        }
    }

    drawGlitchBlock(ctx, w, h) {
        // MATRIX: Glitch Bloğu
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        // Matrix Kodu
        ctx.fillStyle = '#00FF00';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00FF00';
        ctx.shadowBlur = 5;

        // Titreme efekti
        if (Math.random() > 0.8) ctx.globalAlpha = 0.5;

        ctx.fillText('0 1', w / 2, h * 0.3);
        ctx.fillText('1 0', w / 2, h * 0.6);
        ctx.fillText('ERR', w / 2, h * 0.9);

        ctx.globalAlpha = 1.0;

        // Border Glitch
        ctx.strokeStyle = '#00FF00';
        if (Math.random() > 0.9) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * w, Math.random() * h);
            ctx.lineTo(Math.random() * w, Math.random() * h);
            ctx.stroke();
        }
    }

    drawNeonPyramid(ctx, w, h) {
        // SYNTHWAVE: Neon Piramit
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;

        // Gradyan Çizgiler
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#FF00FF'); // Magenta
        grad.addColorStop(1, '#00FFFF'); // Cyan
        ctx.strokeStyle = grad;
        ctx.shadowColor = '#FF00FF';
        ctx.shadowBlur = 15;

        ctx.beginPath();
        ctx.moveTo(w / 2, 0); // Tepe
        ctx.lineTo(w, h); // Sağ Alt
        ctx.lineTo(0, h); // Sol Alt
        ctx.closePath();
        ctx.stroke();

        // Izgara çizgileri
        ctx.beginPath();
        ctx.moveTo(w * 0.25, h * 0.5);
        ctx.lineTo(w * 0.75, h * 0.5);
        ctx.stroke();

        // Yansıma (Altına ters silik)
        ctx.save();
        ctx.scale(1, -0.5);
        ctx.globalAlpha = 0.3;
        ctx.translate(0, -h * 3);
        ctx.stroke(); // Piramidi tekrar çiz (ters)
        ctx.restore();
    }

    drawBlackHole(ctx, w, h) {
        // VOID: Karadelik
        const cx = w / 2;
        const cy = h / 2;

        // Olay Ufku (Siyah Merkez)
        ctx.fillStyle = '#000';
        ctx.shadowColor = '#9D00FF';
        ctx.shadowBlur = 20; // Etrafında mor hare
        ctx.beginPath();
        ctx.arc(cx, cy, w * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Akresyon Diski (Dönen Halkalar)
        ctx.strokeStyle = '#4B0082'; // Indigo
        ctx.lineWidth = 2;
        ctx.beginPath();
        const angle = Date.now() / 500;
        ctx.ellipse(cx, cy, w * 0.5, h * 0.2, angle, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#8A2BE2'; // BlueViolet
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * 0.4, h * 0.15, -angle, 0, Math.PI * 2);
        ctx.stroke();
    }

    checkCollision(cat) {
        if (cat.isInvulnerable) return null;

        // Ground Collision
        if (cat.y + cat.height >= GROUND_Y) {
            // Find the ground segment the cat is on
            const currentGround = this.groundSegments.find(g => cat.x + cat.width > g.x && cat.x < g.x + g.width);
            if (currentGround && cat.grounded) {
                if (cat.color !== currentGround.type) {
                    return { type: 'ground', reason: `YANLIŞ RENK! <br>${currentGround.type === 'white' ? 'BEYAZ' : 'SİYAH'} ZEMİNE BASTIN.` };
                }
            }
        }

        // Obstacle Collision
        for (let obs of this.obstacles) {
            // AABB çarpışma testi - Hitbox padding eklendi (daha adil çarpışma)
            const padding = 3; // Her taraftan 3px tolerans
            if (
                cat.x + padding < obs.x + obs.width - padding &&
                cat.x + cat.width - padding > obs.x + padding &&
                cat.y + padding < obs.y + obs.height - padding &&
                cat.y + cat.height - padding > obs.y + padding
            ) {
                // HIT!
                if (activePowerups.shield) {
                    activePowerups.shield = false; // Kalkanı tüket
                    cat.isInvulnerable = true;
                    cat.invulnerableTimer = 1000; // 1 sn koruma
                    audioManager.playJump(); // Geçici ses efekt, kalkan kırılma sesi eklenebilir
                    updateBuffsDisplay(); // UI güncelle
                    return null; // Ölme
                }

                return { type: 'obstacle', reason: "RADYOAKTİF TEMAS!" };
            }
        }

        // Track passed obstacles
        if (obstacleManager) {
            // We need to count passed in a safer place usually, but let's check ObstacleManager.update for specific logic
        }

        return null;
    }
}

class Player {
    constructor(groundY) {
        this.width = 44;
        this.height = 44;
        this.x = 80;
        this.y = groundY - this.height;
        this.dy = 0;
        this.gravity = 1.8;
        this.jumpForce = -22;
        // Will be overwritten by setDifficulty
        this.grounded = true;
        this.color = 'white'; // Başlangıç rengi
        this.isInvulnerable = false;
        this.invulnerableTimer = 0;
        this.isOceanMode = false;
        this.isAtmosferMode = false;
    }

    setOceanMode(active) {
        this.isOceanMode = active;
        if (active) {
            this.dy = 0;
            this.grounded = false;
            this.isAtmosferMode = false;
        }
    }

    setAtmosferMode(active) {
        this.isAtmosferMode = active;
        if (active) {
            this.dy = 0;
            this.grounded = false;
            this.isOceanMode = false;
        }
    }

    setPhysics(grav, jump) {
        this.gravity = grav;
        this.jumpForce = jump;
    }

    reset() {
        this.x = 80;
        this.y = (window.innerHeight - 100) - this.height;
        this.dy = 0;
        this.grounded = true;
        this.color = 'white';
        this.isInvulnerable = false;
        this.invulnerableTimer = 0;
        this.isOceanMode = false;
        this.isAtmosferMode = false;
    }

    update(groundY, dt) {
        // Invulnerability Timer
        if (this.isInvulnerable) {
            this.invulnerableTimer -= dt * 1000; // dt is in seconds, convert to ms
            if (this.invulnerableTimer <= 0) {
                this.isInvulnerable = false;
            }
        }

        if (this.isOceanMode) {
            const isDiving = (inputHandler && inputHandler.actions.jump);
            if (isDiving) {
                this.dy += 1.5 * 60 * dt;
                if (this.dy > 8) this.dy = 8;
            } else {
                this.dy -= 0.8 * 60 * dt;
                if (this.dy < -6) this.dy = -6;
            }
            this.dy *= 0.96;
            this.y += this.dy * 60 * dt;
            if (this.y < 0) this.y = 0;
            if (this.y + this.height > groundY) this.y = groundY - this.height;
            return;
        }

        if (this.isAtmosferMode) {
            // ATMOSPHERE PHYSICS ("Smoother Flight")
            const isFlying = (inputHandler && inputHandler.actions.jump);

            if (isFlying) {
                // LIFT: More gradual, stronger lift feeling but controlled
                this.dy -= 1.2 * 60 * dt;
                if (this.dy < -9) this.dy = -9;
            } else {
                // GRAVITY: Floaty, slow descent
                this.dy += 0.5 * 60 * dt;
                if (this.dy > 6) this.dy = 6;
            }

            this.dy *= 0.94; // Significantly higher air friction for "floaty" feel
            this.y += this.dy * 60 * dt;

            if (this.y < 0) { this.y = 0; this.dy = 0; }
            if (this.y + this.height > groundY) { this.y = groundY - this.height; this.dy = 0; }
            return;
        }

        // NORMAL PHYSICS
        this.dy += this.gravity * 60 * dt;
        this.y += this.dy * 60 * dt;

        if (this.y + this.height > groundY) {
            this.y = groundY - this.height;
            this.dy = 0;
            this.grounded = true;
        } else {
            this.grounded = false;
        }
    }

    jump() {
        if (this.isOceanMode) {
            // DIVE handled in update() via input state
            return false;
        }

        if (this.grounded) {
            this.dy = this.jumpForce;
            this.grounded = false;
            this.jumpColor = this.color; // Track color at jump start
            return true;
        }
        return false;
    }

    switchColor() {
        this.color = this.color === 'white' ? 'black' : 'white';
        this.lastSwitchTime = gameTime; // Track time for perfect landing
    }

    draw(ctx, frames, name, gameTime) {



        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);

        // --- OCEAN/ATMOSPHERE MODE ROTATION & ANIMATION ---
        let modeRotation = 0;
        if (this.isOceanMode || this.isAtmosferMode) {
            // Rotate based on DY (Smoothly)
            // limit rotation to ~45 degrees (PI/4)
            modeRotation = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.dy * 0.1));
            ctx.rotate(modeRotation);
        }

        if (this.isInvulnerable) {
            ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 50) * 0.3; // Flashing effect
        } else {
            ctx.globalAlpha = 1.0;
        }

        // KALKAN GÖRSELİ
        if (activePowerups.shield) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, 40, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.5 + Math.sin(Date.now() / 200) * 0.3})`; // Mavi Titrek
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
            ctx.fill();
            ctx.restore();
        }

        const isWhite = this.color === 'white';

        // --- MODERN VEKTÖR KEDİ ÇİZİMİ (Clean Version) ---

        ctx.fillStyle = isWhite ? '#fff' : '#000';
        ctx.strokeStyle = isWhite ? '#000' : '#fff';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Animasyon Değişkenleri
        // Ocean/Atmosfer Mode: Slower, smoother cycle
        const animSpeed = (this.isOceanMode || this.isAtmosferMode) ? 0.2 : 0.4;
        const runCycle = Math.sin(frames * animSpeed);
        const t = gameTime;

        // 1. GÖVDE (Akıcı silüet)
        // Kedi şekli, hafif esneyen bir yapı
        ctx.beginPath();
        // Arka ayak hizası
        ctx.moveTo(-15, 10);
        // Sırt kavisi (Hızlanınca biraz daha uzayabilir)
        ctx.quadraticCurveTo(0, -10 + (runCycle * 2), 20, 0);
        // Göğüs
        ctx.quadraticCurveTo(25, 15, 5, 15);
        // Karın (Nefes alma/koşma etkisi)
        ctx.lineTo(-15, 12);
        ctx.fill();

        // 2. KAFA
        ctx.beginPath();
        // Kafa dairemsi ama biraz basık
        ctx.ellipse(22, -8, 10, 8, Math.PI / 12, 0, Math.PI * 2);
        ctx.fill();

        // Kulaklar
        ctx.beginPath();
        ctx.moveTo(18, -14); ctx.lineTo(16, -24); ctx.lineTo(24, -15);
        ctx.moveTo(26, -14); ctx.lineTo(32, -22); ctx.lineTo(30, -12);
        ctx.fill();

        // 3. GÖZLER (Keskin bakış)
        ctx.fillStyle = isWhite ? '#000' : '#fff';
        ctx.beginPath();
        if (this.dy > 5 && !this.isOceanMode) { // Düşerken gözler biraz büyür (Normal mode only)
            ctx.ellipse(26, -8, 3, 3, 0, 0, Math.PI * 2);
        } else if (Math.floor(gameTime) % 150 > 140) { // Göz kırpma
            ctx.rect(24, -8, 6, 1);
        } else {
            // Normal badem göz
            ctx.moveTo(22, -8);
            ctx.quadraticCurveTo(26, -11, 29, -9);
            ctx.quadraticCurveTo(26, -5, 22, -8);
        }
        ctx.fill();

        // 4. KUYRUK (S Sinus Hareketi)
        ctx.strokeStyle = isWhite ? '#fff' : '#000';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-15, 0);
        // Kuyruk ucu hareketi
        const tailWag = Math.sin(frames * (this.isOceanMode ? 0.1 : 0.2)) * 10;
        ctx.bezierCurveTo(-25, -10, -30 + tailWag, -20, -25 + tailWag, -30);
        ctx.stroke();

        // 5. BACAKLAR (Prosedürel Koşu / Yüzme Animasyonu)
        ctx.fillStyle = isWhite ? '#fff' : '#000';
        ctx.lineWidth = 4;
        ctx.strokeStyle = isWhite ? '#fff' : '#000';

        // Bacak çizim fonksiyonu
        const drawLeg = (x, y, phase) => {
            let angle = 0;
            let len = 14;
            let extension = 0;

            if (this.isOceanMode) {
                // SWIMMING (Paddling)
                // Legs move back and forth more horizontally
                // We want them trailing behind mostly
                // Simple paddle:
                const swimCycle = Math.sin(frames * 0.2 + phase);
                const x2 = x + swimCycle * 10 - 5;
                const y2 = y + Math.abs(swimCycle) * 5 + 5;

                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                return;
            }

            if (this.isAtmosferMode) {
                // FLYING (Soft Flutter/Gliding)
                // Slow down the cycle and reduce amplitude
                const flyCycle = Math.sin(frames * 0.15 + phase);
                const x2 = x + flyCycle * 5 - 2;
                const y2 = y + 12 + Math.cos(frames * 0.15 + phase) * 2;

                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                return;
            }

            // RUNNING / JUMPING
            angle = Math.sin(frames * 0.5 + phase) * 0.8;

            // Havadaysa bacakları uzat
            if (!this.grounded) {
                extension = 5;
                // Zıplama pozu
                if (phase === 0) return { x2: x - 5, y2: y + 15 }; // Arka bacak gergin
                if (phase > 1) return { x2: x + 10, y2: y + 10 }; // Ön bacak ileri
            }

            const x2 = x + Math.sin(angle) * (len + extension);
            const y2 = y + Math.cos(angle) * (len + extension);

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        };

        // Arka Bacaklar
        drawLeg(-12, 10, 0); // Sol Arka
        drawLeg(-12, 10, Math.PI); // Sağ Arka (Ters faz)

        // Ön Bacaklar
        drawLeg(18, 12, Math.PI * 1.5); // Sol Ön
        drawLeg(18, 12, Math.PI * 0.5); // Sağ Ön (Ters faz)

        // --- AKSESUARLAR (Hats & Glasses) ---
        const drawAccessories = () => {
            const equipped = economyData.equippedCosmetics || { hat: 'none', glasses: 'none' };

            // 1. ŞAPKALAR (Kafa Üstü)
            if (equipped.hat !== 'none') {
                ctx.save();
                ctx.translate(22, -14); // Kafa üstü hizası
                ctx.rotate(Math.PI / 12); // Kafa eğimi

                if (equipped.hat === 'tophat') {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(-8, -10, 16, 12); // Top
                    ctx.fillRect(-12, 2, 24, 3); // Brim
                } else if (equipped.hat === 'party') {
                    ctx.beginPath();
                    ctx.moveTo(0, -18); ctx.lineTo(-8, 0); ctx.lineTo(8, 0); ctx.closePath();
                    ctx.fillStyle = '#ff00ff'; ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(0, -20, 2, 0, Math.PI * 2); ctx.fill();
                } else if (equipped.hat === 'cowboy') {
                    ctx.fillStyle = '#8B4513';
                    ctx.beginPath();
                    ctx.ellipse(0, 4, 15, 4, 0, 0, Math.PI * 2); ctx.fill(); // Brim
                    ctx.fillRect(-8, -8, 16, 12); // Crown
                } else if (equipped.hat === 'beanie') {
                    ctx.fillStyle = '#ff0000';
                    ctx.beginPath();
                    ctx.arc(0, 0, 10, Math.PI, 0); ctx.fill();
                    ctx.fillRect(-10, 0, 20, 4);
                } else if (equipped.hat === 'king_crown') {
                    ctx.fillStyle = '#FFD700';
                    ctx.beginPath();
                    ctx.moveTo(-10, 0); ctx.lineTo(-10, -12); ctx.lineTo(-5, -6);
                    ctx.lineTo(0, -15); ctx.lineTo(5, -6); ctx.lineTo(10, -12);
                    ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
                } else if (equipped.hat === 'queen_crown') {
                    ctx.fillStyle = '#E6E6FA';
                    ctx.beginPath(); ctx.bezierCurveTo(-8, -12, 8, -12, 8, 0);
                    ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = '#DA70D6';
                    ctx.beginPath(); ctx.arc(0, -10, 3, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }

            // 2. GÖZLÜKLER (Göz Hizası)
            if (equipped.glasses !== 'none') {
                ctx.save();
                ctx.translate(26, -8); // Göz hizası
                ctx.rotate(Math.PI / 12);
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#000';

                if (equipped.glasses === 'cool') {
                    ctx.fillStyle = 'rgba(0,0,0,0.8)';
                    ctx.fillRect(-6, -3, 5, 5); ctx.fillRect(1, -3, 5, 5);
                    ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(1, 0); ctx.stroke();
                } else if (equipped.glasses === 'monocle') {
                    ctx.beginPath(); ctx.arc(3, 0, 4, 0, Math.PI * 2); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(10, 8); ctx.stroke();
                } else if (equipped.glasses === 'nerd') {
                    ctx.lineWidth = 1;
                    ctx.strokeRect(-5, -3, 4, 5); ctx.strokeRect(1, -3, 4, 5);
                    ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(1, 0); ctx.stroke();
                } else if (equipped.glasses === 'heart') {
                    const drawSmallHeart = (hx, hy) => {
                        ctx.beginPath(); ctx.moveTo(hx, hy);
                        ctx.bezierCurveTo(hx - 2, hy - 2, hx - 4, hy, hx, hy + 4);
                        ctx.bezierCurveTo(hx + 4, hy, hx + 2, hy - 2, hx, hy); ctx.fill();
                    };
                    ctx.fillStyle = 'rgba(255,0,0,0.7)';
                    drawSmallHeart(-3, -1); drawSmallHeart(3, -1);
                }
                ctx.restore();
            }
        };

        drawAccessories();

        // İsim Etiketi (Hafif yukarı alındı)
        ctx.fillStyle = "#666";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        // Rotate text back so it stays upright? Or let it rotate with cat?
        // Let it rotate with cat for now, looks more natural as "attached" tag.
        ctx.fillText(name, 5, -50);

        ctx.restore();
    }
}

class InputHandler {
    constructor(game) {
        this.game = game;
        this.width = window.innerWidth;
        this.actions = { jump: false, switch: false }; // State tracking
        this.setupListeners();
    }

    updateWidth(width) {
        this.width = width;
    }

    setupListeners() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (!this.game.isPlaying) return;

            // Prevent repeat triggers for hold (optional, but good for one-shot logic if we kept it)
            // But for state tracking 'repeat' is fine, or we just set true.

            const diffSettings = DIFFICULTY_SETTINGS[this.game.currentDifficulty];
            const isSwapped = diffSettings && diffSettings.swapControls;
            const isJumpKey = ['Space', 'ArrowUp', 'KeyW'].includes(e.code);
            const isSwitchKey = ['Enter', 'ArrowRight', 'KeyZ', 'KeyD', 'ArrowDown', 'KeyS'].includes(e.code);

            if (isJumpKey) {
                const action = isSwapped ? 'switch' : 'jump';
                this.actions[action] = true;
                this.game.handleAction(action);
            } else if (isSwitchKey) {
                const action = isSwapped ? 'jump' : 'switch';
                this.actions[action] = true;
                this.game.handleAction(action);
            }
        });

        window.addEventListener('keyup', (e) => {
            const diffSettings = DIFFICULTY_SETTINGS[this.game.currentDifficulty];
            const isSwapped = diffSettings && diffSettings.swapControls;
            const isJumpKey = ['Space', 'ArrowUp', 'KeyW'].includes(e.code);
            const isSwitchKey = ['Enter', 'ArrowRight', 'KeyZ', 'KeyD', 'ArrowDown', 'KeyS'].includes(e.code);

            if (isJumpKey) {
                const action = isSwapped ? 'switch' : 'jump';
                this.actions[action] = false;
            } else if (isSwitchKey) {
                const action = isSwapped ? 'jump' : 'switch';
                this.actions[action] = false;
            }
        });

        // Touch / Mouse
        const handleStart = (e) => {
            if (!this.game.isPlaying) return;
            if (e.type === 'touchstart') e.preventDefault(); // Prevent scroll/mouse emulation

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const diffSettings = DIFFICULTY_SETTINGS[this.game.currentDifficulty];
            const isSwapped = diffSettings && diffSettings.swapControls;

            // Left=Jump, Right=Switch (Normal)
            const isLeft = clientX < window.innerWidth / 2;
            let action = 'jump';

            if (isLeft) {
                action = isSwapped ? 'switch' : 'jump';
            } else {
                action = isSwapped ? 'jump' : 'switch';
            }

            this.actions[action] = true;
            this.game.handleAction(action);
        };

        const handleEnd = (e) => {
            // For simplicity, release both on any up, or try to track touches.
            // A simple "release all" is usually safe for this simple game.
            this.actions.jump = false;
            this.actions.switch = false;
        };

        window.addEventListener('touchstart', handleStart, { passive: false });
        window.addEventListener('mousedown', handleStart);

        window.addEventListener('touchend', handleEnd);
        window.addEventListener('mouseup', handleEnd);
    }
}



const scoreEl = document.getElementById('score-display');
// REMOVED comboEl
const highScoreEl = document.getElementById('high-score');
const livesDisplayEl = document.getElementById('lives-display');
const activeBuffsEl = document.getElementById('active-buffs-display'); // NEW

const startScreen = document.getElementById('start-screen');
const storyScreen = document.getElementById('story-screen');
const scoreboardScreen = document.getElementById('scoreboard-screen');
const shopScreen = document.getElementById('shop-screen');
const atomDisplayEl = document.getElementById('atom-display');
const earnedAtomsEl = document.getElementById('earned-atoms');
const btnRevive = document.getElementById('btn-revive');

// Shop Buttons & Stock Displays
const btnBuyLife = document.getElementById('btn-buy-life');
const btnBuyShield = document.getElementById('btn-buy-shield');
const btnBuyWorm = document.getElementById('btn-buy-wormhole');
const btnBuyBoost = document.getElementById('btn-buy-booster');

const stockLifeEl = document.getElementById('stock-life');
const stockShieldEl = document.getElementById('stock-shield');
const stockWormEl = document.getElementById('stock-wormhole');
const stockBoostEl = document.getElementById('stock-booster');

const leaderboardList = document.getElementById('leaderboard-list');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const deathReasonEl = document.getElementById('death-reason');
const playerNameInput = document.getElementById('player-name');
const gameMsgEl = document.getElementById('game-message');
const leftZone = document.getElementById('left-zone');
const rightZone = document.getElementById('right-zone');

// CANVAS SETUP - CRITICAL MISSING PART RESTORED
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const dpr = window.devicePixelRatio || 1;
let WIDTH = window.innerWidth;
let HEIGHT = window.innerHeight;

canvas.width = WIDTH * dpr;
canvas.height = HEIGHT * dpr;
canvas.style.width = WIDTH + 'px';
canvas.style.height = HEIGHT + 'px';

ctx.scale(dpr, dpr);

let GROUND_Y = HEIGHT - 100;

// Handle Resize
window.addEventListener('resize', () => {
    const dpr = window.devicePixelRatio || 1;
    WIDTH = window.innerWidth;
    HEIGHT = window.innerHeight;

    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = WIDTH + 'px';
    canvas.style.height = HEIGHT + 'px';

    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.scale(dpr, dpr);

    GROUND_Y = HEIGHT - 100;
    if (player) player.y = Math.min(player.y, GROUND_Y - player.height);
    if (inputHandler) inputHandler.updateWidth(WIDTH);
    if (backgroundLayers) backgroundLayers.forEach(l => { l.width = WIDTH; l.height = HEIGHT; });
});



const SPEED_START = 8;
const SPEED_MAX = 20;

const DIFFICULTY_SETTINGS = {
    'EASY': { speedStart: 7, speedMax: 14, accelInterval: 800, scoreMultiplier: 1.0, gravity: 1.5, jumpForce: -20, gapMultiplier: 1.5 },
    'NORMAL': { speedStart: 9, speedMax: 22, accelInterval: 600, scoreMultiplier: 1.5, gravity: 1.65, jumpForce: -21, gapMultiplier: 1.2 },
    'HARD': { speedStart: 11, speedMax: 30, accelInterval: 400, scoreMultiplier: 2.0, gravity: 1.8, jumpForce: -22, gapMultiplier: 1.0 },
    'EXTREME': { speedStart: 13, speedMax: 35, accelInterval: 300, scoreMultiplier: 3.0, gravity: 2.0, jumpForce: -24, gapMultiplier: 0.9, swapControls: true }
};

// Leaderboard Initial Data
// Leaderboard Initial Data
let leaderboardData = { 'EASY': [], 'NORMAL': [], 'HARD': [], 'EXTREME': [] };
try {
    const savedLb = localStorage.getItem('schrodinger_leaderboard');
    if (savedLb) {
        const parsedLb = JSON.parse(savedLb);
        leaderboardData = { ...leaderboardData, ...parsedLb };
        // Ensure all keys exist (migration fix)
        ['EASY', 'NORMAL', 'HARD', 'EXTREME'].forEach(diff => {
            if (!leaderboardData[diff]) leaderboardData[diff] = [];
        });
    }
} catch (e) { console.error("Skor yüklenemedi", e); }


// SHOP & ECONOMY SYSTEM
const COSMETICS = {
    hat: {
        tophat: { name: "Sihirbaz Şapkası", cost: 1000, icon: "🎩" },
        party: { name: "Parti Şapkası", cost: 500, icon: "🥳" },
        cowboy: { name: "Kovboy Şapkası", cost: 1500, icon: "🤠" },
        beanie: { name: "Kırmızı Bere", cost: 800, icon: "🔴" },
        king_crown: { name: "Kral Tacı", cost: 5000, icon: "👑" },
        queen_crown: { name: "Kraliçe Tacı", cost: 5000, icon: "👸" }
    },
    glasses: {
        cool: { name: "Havalı Gözlük", cost: 1200, icon: "😎" },
        monocle: { name: "Monokl", cost: 2000, icon: "🧐" },
        nerd: { name: "Nerd Gözlük", cost: 900, icon: "🤓" },
        heart: { name: "Kalp Gözlük", cost: 1100, icon: "😍" }
    },
    toy: {
        yarn: { name: "Yün Yumağı", cost: 600, icon: "🧶" },
        mouse: { name: "Oyuncak Fare", cost: 750, icon: "🐭" },
        ball: { name: "Renkli Top", cost: 400, icon: "🎾" }
    },
    bowl: {
        red_bowl: { name: "Kırmızı Kap", cost: 300, icon: "🥣" },
        blue_bowl: { name: "Mavi Kap", cost: 300, icon: "🥣" },
        golden_bowl: { name: "Altın Kap", cost: 2500, icon: "🏆" }
    }
};

const THEMES = {
    CITY: { name: "VİYANA 1935", cost: 0, desc: "Klasik Noir Şehir", color: "#888", icon: "fa-city", img: "assets/noir.webp", bgImg: "assets/Noir_plan.webp" },
    LAB: { name: "RADYOAKTİF LAB", cost: 2000, desc: "Toksik Atık Bölgesi", color: "#39FF14", icon: "fa-radiation", img: "assets/laboratuvar.webp", bgImg: "assets/Radyoaktif_Lab.webp" },
    MATRIX: { name: "SİMÜLASYON", cost: 5000, desc: "Gerçekliğin Kodları", color: "#00FF00", icon: "fa-terminal", img: "assets/simülasyon.webp", bgImg: "assets/Simülasyon_plan.webp" },
    SYNTHWAVE: { name: "NEON GELECEK", cost: 8000, desc: "Retro-Fütüristik Günbatımı", color: "#FF00FF", icon: "fa-sun", img: "assets/neon.webp", bgImg: "assets/Neon_Gelecek.webp" },
    VOID: { name: "KUANTUM BOŞLUĞU", cost: 15000, desc: "Evrenin Dokusu", color: "#9D00FF", icon: "fa-infinity", img: "assets/Kuantum.webp", bgImg: "assets/Kuantum_plan.webp" },
    EGYPT: { name: "ANTİK MISIR", cost: 20000, desc: "Piramitlerin Gizemi", color: "#F4D03F", icon: "fa-pyramid", img: "assets/mısırr.webp", bgImg: "assets/mısır_plan.webp" },
    FOREST: { name: "MİSTİK ORMAN", cost: 25000, desc: "Büyülü Doğa", color: "#2ECC71", icon: "fa-tree", img: "assets/ormann.webp", bgImg: "assets/orman_plan.webp" },
    ISLAND: { name: "UÇAN ADA", cost: 30000, desc: "Gökyüzü Krallığı", color: "#5DADE2", icon: "fa-cloud", img: "assets/adaa.webp", bgImg: "assets/ada_plan.webp" },
    ORIENTAL: { name: "YASAK ŞEHİR", cost: 35000, desc: "Doğunun İncisi", color: "#E74C3C", icon: "fa-torii-gate", img: "assets/chınes.webp", bgImg: "assets/chınes_plan.webp" },
    RUINS: { name: "YIKILMIŞ DÜNYA", cost: 40000, desc: "Kıyamet Sonrası", color: "#7F8C8D", icon: "fa-dungeon", img: "assets/bina.webp", bgImg: "assets/yıkım_plan.webp" }
};

let economyData = {
    atoms: 0,
    extraLives: 0,
    inventory: { shield: 0, wormhole: 0, booster: 0 },
    highScore: { EASY: 0, NORMAL: 0, HARD: 0, EXTREME: 0 },
    ownedThemes: ['CITY'],
    equippedTheme: 'CITY',
    ownedCosmetics: ['none'],
    equippedCosmetics: { hat: 'none', glasses: 'none' },
    // Achievements
    unlockedAchievements: [],
    unlockedBadges: [], // Rozetler için yeni dizi
    stats: {
        totalGames: 0,
        totalDeaths: 0,
        totalScore: 0, // Career Score
        bestScore: 0,
        totalTimePlayed: 0, // seconds
        totalItemsBought: 0,
        totalAtomsEarned: 0,
        totalAtomsSpent: 0,
        totalColorSwitches: 0,
        totalShieldsUsed: 0,
        totalWormholesUsed: 0,
        totalBoostersUsed: 0,
        totalRevives: 0,
        consecutiveDays: 0,
        lastLoginDate: null,
        visitedShop: false,
        visitedScores: false,
        visitedStory: false,
        ownedThemes: ['CITY'], // Helper mirror
        playedThemes: []
    },
    // Specific flags
    boughtShield: false,
    boughtWormhole: false,
    boughtBooster: false,
    boughtLife: false
};

// ACHIEVEMENTS CONSTANTS
const ACHIEVEMENTS = {
    FIRST_MILESTONE: { id: 'FIRST_MILESTONE', title: "İLK KİLOMETRE", msg: "1000 Puan Barajı Aşıldı!", reward: 100, icon: "fa-flag-checkered" },
    QUANTUM_LEAP: { id: 'QUANTUM_LEAP', title: "KUANTUM ATLAYIŞI", msg: "5000 Puan! Efsanevi!", reward: 500, icon: "fa-rocket" },
    FIRST_COLLAPSE: { id: 'FIRST_COLLAPSE', title: "İLK ÇÖKÜŞ", msg: "Her Deney Başarılı Olmaz.", reward: 50, icon: "fa-skull" },
    DETERMINATION: { id: 'DETERMINATION', title: "KARARLILIK", msg: "10 Kez Oynadın!", reward: 200, icon: "fa-rotate-right" }
};

// --- EXPANDED BADGES DEFINITION (60+ Items) ---
const BADGES = [
    // A) MESAFE & SKOR
    { id: 'score_100', title: 'İLK ADIM', desc: '100 puana ulaş.', icon: 'fa-baby', targetScore: 100, category: 'DISTANCE' },
    { id: 'score_1000', title: 'İLK KİLOMETRE', desc: '1.000 puana ulaş.', icon: 'fa-flag', targetScore: 1000, category: 'DISTANCE' },
    { id: 'score_5000', title: 'MARATON KOŞUCUSU', desc: '5.000 puana ulaş.', icon: 'fa-person-running', targetScore: 5000, category: 'DISTANCE' },
    { id: 'score_10000', title: 'UZUN MESAFE', desc: '10.000 puana ulaş.', icon: 'fa-road', targetScore: 10000, category: 'DISTANCE' },
    { id: 'score_25000', title: 'EFSANE YOLCULUK', desc: '25.000 puana ulaş.', icon: 'fa-map-location-dot', targetScore: 25000, category: 'DISTANCE' },
    { id: 'score_50000', title: 'KUANTUM ATLAYIŞI', desc: '50.000 puana ulaş.', icon: 'fa-rocket', targetScore: 50000, category: 'DISTANCE' },
    { id: 'total_score_100k', title: 'ZAMAN YOLCUSU', desc: 'Toplam 100.000 kariyer puanı yap.', icon: 'fa-hourglass-half', targetTotalScore: 100000, category: 'DISTANCE' },
    { id: 'single_10000', title: 'SONSUZ KOŞUCU', desc: 'Tek seferde 10.000 puan yap (ZOR mod değilse bile).', icon: 'fa-infinity', targetScore: 10000, category: 'DISTANCE' }, // check logic same
    { id: 'peak_15000', title: 'ZİRVE', desc: 'Tek oyunda 15.000+ puan yap.', icon: 'fa-mountain', targetScore: 15000, category: 'DISTANCE' },
    // "Mükemmeliyetçi" requires logic per diff, will simplify to "Win hard w/ 5k" for now or custom logic

    // B) HAYATTA KALMA
    { id: 'first_death', title: 'İLK CAN KAYBI', desc: 'İlk kez öl.', icon: 'fa-skull', category: 'SURVIVAL', customCheck: (s) => s.totalDeaths >= 1 },
    { id: 'nine_lives', title: 'DOKUZ CANLI KEDİ', desc: 'Toplam 9 kez öl.', icon: 'fa-cat', category: 'SURVIVAL', customCheck: (s) => s.totalDeaths >= 9 },
    { id: 'immortal_5k', title: 'ÖLÜMSÜZ', desc: '5.000 puanı hiç ölmeden geç (Revive kullanmadan).', icon: 'fa-heart-pulse', category: 'SURVIVAL', targetScore: 5000, noRevive: true },
    { id: 'ghost_3', title: 'HAYALET', desc: 'Kalkan kullanarak 3 kez kurtul (Toplam).', icon: 'fa-shield-cat', category: 'SURVIVAL', customCheck: (s) => s.totalShieldsUsed >= 3 },
    { id: 'wormhole_10', title: 'ZAMAN GEZGİNİ', desc: 'Wormhole ile 10 oyun başlat.', icon: 'fa-worm', category: 'SURVIVAL', customCheck: (s) => s.totalWormholesUsed >= 10 },
    { id: 'revive_5', title: 'İKİNCİ ŞANS', desc: 'Revive ile 5 kez hayata dön (Toplam).', icon: 'fa-suitcase-medical', category: 'SURVIVAL', customCheck: (s) => s.totalRevives >= 5 },
    { id: 'survivor_combo', title: 'SURVIVOR', desc: 'Aynı oyunda Shield, Wormhole ve Booster kullan.', icon: 'fa-kit-medical', category: 'SURVIVAL', customCheck: (s, run) => run.usedShield && run.usedWormhole && run.usedBooster },
    { id: 'obstacle_100', title: 'DAYANIKLI', desc: 'Tek oyunda 100 engel geç.', icon: 'fa-person-hurdles', category: 'SURVIVAL', customCheck: (s, run) => run.obstaclesPassed >= 100 },

    // C) TEKNİK USTALIK
    { id: 'fast_fingers', title: 'HIZLI PARMAKLAR', desc: '1 saniyede 5 kez renk değiştir.', icon: 'fa-bolt', category: 'TECH', customCheck: (s, run) => run.maxClicksPerSecond >= 5 },
    { id: 'color_world', title: 'RENKLİ DÜNYA', desc: 'Toplam 100 kez renk değiştir.', icon: 'fa-palette', category: 'TECH', customCheck: (s) => s.totalColorSwitches >= 100 },
    { id: 'color_master', title: 'RENK CAMBAZI', desc: 'Toplam 1.000 kez renk değiştir.', icon: 'fa-brush', category: 'TECH', customCheck: (s) => s.totalColorSwitches >= 1000 },
    { id: 'speed_demon', title: 'HIZ CANAVARI', desc: 'Maksimum hıza (20+) ulaş.', icon: 'fa-gauge-high', category: 'TECH', customCheck: (s, run) => run.maxSpeedReached >= 20 },
    { id: 'careful_easy', title: 'YAVAŞ VE DİKKATLİ', desc: 'KOLAY modda ölmeden 5.000 puan.', icon: 'fa-feather', category: 'TECH', customCheck: (s, run) => run.difficulty === 'EASY' && run.score >= 5000 && run.revives === 0 },
    { id: 'hard_journey', title: 'ZOR YOLCULUK', desc: 'ZOR modda ölmeden 5.000 puan.', icon: 'fa-skull-crossbones', category: 'TECH', customCheck: (s, run) => run.difficulty === 'HARD' && run.score >= 5000 && run.revives === 0 },
    { id: 'brave', title: 'CESUR', desc: 'Hiç power-up kullanmadan 3.000 puan yap (Loadout boş).', icon: 'fa-fist-raised', category: 'TECH', customCheck: (s, run) => run.score >= 3000 && !run.usedLoadout },

    // D) TEMA KEŞFİ
    { id: 'theme_vienna', title: 'VİYANA GEZGİNİ', desc: 'Viyana temasının sahibi ol.', icon: 'fa-city', category: 'THEME', customCheck: (s) => s.ownedThemes.includes('CITY') },
    { id: 'theme_lab', title: 'RADYASYON UZMANI', desc: 'Lab temasının sahibi ol.', icon: 'fa-flask', category: 'THEME', customCheck: (s) => s.ownedThemes.includes('LAB') },
    { id: 'theme_matrix', title: 'GERÇEKLİK KIRICI', desc: 'Matrix temasının sahibi ol.', icon: 'fa-terminal', category: 'THEME', customCheck: (s) => s.ownedThemes.includes('MATRIX') },
    { id: 'theme_neon', title: 'NEON RÜYALARI', desc: 'Synthwave temasının sahibi ol.', icon: 'fa-sun', category: 'THEME', customCheck: (s) => s.ownedThemes.includes('SYNTHWAVE') },
    { id: 'theme_void', title: 'BOŞLUK GEZGİNİ', desc: 'Void temasının sahibi ol.', icon: 'fa-infinity', category: 'THEME', customCheck: (s) => s.ownedThemes.includes('VOID') },
    { id: 'theme_egypt', title: 'ANTİK KÂŞİF', desc: 'Antik Mısır temasının sahibi ol.', icon: 'fa-pyramid', category: 'THEME', customCheck: (s) => s.ownedThemes.includes('EGYPT') },
    { id: 'theme_forest', title: 'DOĞA KORUYUCUSU', desc: 'Mistik Orman temasının sahibi ol.', icon: 'fa-tree', category: 'THEME', customCheck: (s) => s.ownedThemes.includes('FOREST') },
    { id: 'theme_island', title: 'GÖKYÜZÜ HAKİMİ', desc: 'Uçan Ada temasının sahibi ol.', icon: 'fa-cloud', category: 'THEME', customCheck: (s) => s.ownedThemes.includes('ISLAND') },
    { id: 'theme_oriental', title: 'DOĞU BİLGESİ', desc: 'Yasak Şehir temasının sahibi ol.', icon: 'fa-torii-gate', category: 'THEME', customCheck: (s) => s.ownedThemes.includes('ORIENTAL') },
    { id: 'theme_ruins', title: 'HURDA AVCISI', desc: 'Yıkılmış Dünya temasının sahibi ol.', icon: 'fa-dungeon', category: 'THEME', customCheck: (s) => s.ownedThemes.includes('RUINS') },
    { id: 'theme_collector', title: 'EVREN KOLEKSİYONCUSU', desc: 'Tüm temaların sahibi ol.', icon: 'fa-layer-group', category: 'THEME', customCheck: (s) => s.ownedThemes.length >= 5 },
    { id: 'versatile', title: 'ÇOK YÖNLÜ', desc: '5 farklı temada oyun oyna.', icon: 'fa-shuffle', category: 'THEME', customCheck: (s) => s.playedThemes && s.playedThemes.length >= 5 },

    // E) EKONOMİ
    { id: 'first_shop', title: 'İLK ALIŞVERİŞ', desc: 'Mağazadan bir şey satın al.', icon: 'fa-cart-shopping', category: 'ECONOMY', customCheck: (s) => s.totalItemsBought >= 1 },
    { id: 'shopaholic', title: 'ALIŞVERİŞ ÇILGINI', desc: '10 item satın al.', icon: 'fa-bags-shopping', category: 'ECONOMY', customCheck: (s) => s.totalItemsBought >= 10 },
    { id: 'rich', title: 'ZENGİN', desc: '5.000 atom biriktir (Cüzdan).', icon: 'fa-sack-dollar', category: 'ECONOMY', customCheck: (s) => s.currentAtoms >= 5000 },
    { id: 'quantum_rich', title: 'KUANTUM ZENGİNİ', desc: '25.000 atom biriktir (Cüzdan).', icon: 'fa-coins', category: 'ECONOMY', customCheck: (s) => s.currentAtoms >= 25000 },
    { id: 'emperor', title: 'ATOM İMPARATORU', desc: 'Toplam 100.000 atom kazan (Kariyer).', icon: 'fa-crown', category: 'ECONOMY', customCheck: (s) => s.totalAtomsEarned >= 100000 },
    { id: 'generous', title: 'CÖMERT', desc: '50.000 atom harca.', icon: 'fa-hand-holding-dollar', category: 'ECONOMY', customCheck: (s) => s.totalAtomsSpent >= 50000 },
    { id: 'collector_power', title: 'KOLEKSİYONCU', desc: 'Her power-up tipinden en az 1 tane al.', icon: 'fa-box-open', category: 'ECONOMY', customCheck: (s) => s.boughtShield && s.boughtWormhole && s.boughtBooster && s.boughtLife },
    { id: 'prepared', title: 'HAZIRLIKLI', desc: 'Stokta 10 shield, 10 wormhole, 10 booster olsun.', icon: 'fa-warehouse', category: 'ECONOMY', customCheck: (s) => s.inventory.shield >= 10 && s.inventory.wormhole >= 10 && s.inventory.booster >= 10 },
    { id: 'consumer', title: 'TÜKETİCİ', desc: 'Toplam 100 item kullan.', icon: 'fa-recycle', category: 'ECONOMY', customCheck: (s) => (s.totalShieldsUsed + s.totalWormholesUsed + s.totalBoostersUsed) >= 100 },

    // F) SOSYAL & ÖZEL
    { id: 'curious', title: 'MERAKLI', desc: 'Mağaza, Skorlar ve Hikaye ekranlarını ziyaret et.', icon: 'fa-eye', category: 'SOCIAL', customCheck: (s) => s.visitedShop && s.visitedScores && s.visitedStory },
    { id: 'patient', title: 'SABIRLI', desc: '7 gün üst üste giriş yap.', icon: 'fa-calendar-check', category: 'SOCIAL', customCheck: (s) => s.consecutiveDays >= 7 },
    { id: 'marathon', title: 'MARATON', desc: 'Tek oturumda 1 saat oyna (Toplam süre).', icon: 'fa-stopwatch', category: 'SOCIAL', customCheck: (s) => (s.sessionTime && s.sessionTime >= 3600) || (s.currentSessionTime && s.currentSessionTime >= 3600) },
    { id: 'night_owl', title: 'GECE KUŞU', desc: '00:00 - 04:00 arası oyun oyna.', icon: 'fa-moon', category: 'SOCIAL', customCheck: (s, run) => run.hour >= 0 && run.hour < 4 },
    { id: 'lucky', title: 'ŞANSLI', desc: 'Ayın 13\'ü ve Cuma günü oyun oyna.', icon: 'fa-clover', category: 'SOCIAL', customCheck: (s, run) => run.isFriday13 },

    // G) GİZLİ
    { id: 'respect', title: 'SCHRÖDINGER\'E SAYGI', desc: 'İsmini "ERWIN" yap ve oyna.', icon: 'fa-user-graduate', category: 'SECRET', customCheck: (s, run) => run.playerName.toUpperCase() === 'ERWIN' },
    { id: 'honor_1935', title: '1935 ONURU', desc: 'Tam olarak 1935 skor yapıp öl.', icon: 'fa-award', category: 'SECRET', customCheck: (s, run) => Math.floor(run.score) === 1935 },
    { id: 'cat_love', title: 'KEDİ SEVGİSİ', desc: 'İsmini "KEDİ" yapıp 50 oyun oyna.', icon: 'fa-heart', category: 'SECRET', customCheck: (s, run) => run.playerName.toUpperCase() === 'KEDI' && s.totalGames >= 50 },
    { id: 'quantum_leap_sec', title: 'KUANTUM SIÇRAMASI', desc: '1 saniyede 3 engel geç.', icon: 'fa-forward', category: 'SECRET', customCheck: (s, run) => run.maxObstaclesPerSecond >= 3 }
];

// Loadout State
let selectedLoadout = { shield: false, wormhole: false, booster: false };
let activePowerups = { shield: false, wormhole: false, booster: false };

window.initEconomy = () => {
    let saved = localStorage.getItem('schrodinger_economy_v3');
    // Migration/Fallback: If v3 empty, check old key
    if (!saved) saved = localStorage.getItem('schrodinger_economy');
    if (saved) {
        const parsed = JSON.parse(saved);
        economyData = { ...economyData, ...parsed };
        if (!economyData.inventory) economyData.inventory = { shield: 0, wormhole: 0, booster: 0 };
        // Migration for themes
        if (!economyData.ownedThemes) economyData.ownedThemes = ['CITY'];
        if (!economyData.equippedTheme) economyData.equippedTheme = 'CITY';

        // MIGRATION: Ensure highScore has all keys
        if (!economyData.highScore) economyData.highScore = { EASY: 0, NORMAL: 0, HARD: 0, EXTREME: 0 };
        if (economyData.highScore.EXTREME === undefined) economyData.highScore.EXTREME = 0;

        // Init Achievement Data if missing
        if (!economyData.unlockedAchievements) economyData.unlockedAchievements = [];
        if (!economyData.unlockedBadges) economyData.unlockedBadges = [];
        if (!economyData.ownedCosmetics) economyData.ownedCosmetics = ['none'];
        if (!economyData.equippedCosmetics) economyData.equippedCosmetics = { hat: 'none', glasses: 'none', toy: 'none', bowl: 'none' };
        if (!economyData.equippedCosmetics.toy) economyData.equippedCosmetics.toy = 'none';
        if (!economyData.equippedCosmetics.bowl) economyData.equippedCosmetics.bowl = 'none';

        // DATA MIGRATION: Ensure all new stats fields exist
        const defaultStats = {
            totalGames: 0, totalDeaths: 0, totalScore: 0, bestScore: 0,
            totalTimePlayed: 0, totalItemsBought: 0, totalAtomsEarned: 0, totalAtomsSpent: 0,
            totalColorSwitches: 0, totalShieldsUsed: 0, totalWormholesUsed: 0, totalBoostersUsed: 0,
            totalRevives: 0, consecutiveDays: 0, lastLoginDate: null,
            visitedShop: false, visitedScores: false, visitedStory: false,
            ownedThemes: ['CITY'], playedThemes: []
        };

        // If stats missing entirely, use default. If exists, merge to preserve old data while adding new fields.
        if (!economyData.stats) {
            economyData.stats = defaultStats;
        } else {
            economyData.stats = { ...defaultStats, ...economyData.stats };
        }
    }
    // ----------------------------------
    // DAILY LOGIN LOGIC (Consolidated)
    checkDailyLogin();

    if (economyData.atoms < 0) {
        economyData.atoms = 0;
        saveEconomy();
    }
    // ----------------------------------

    // Periodic Passive Check
    // Periodic Passive Check
    if (window.passiveCheckInterval) clearInterval(window.passiveCheckInterval);
    window.passiveCheckInterval = setInterval(checkPassiveBadges, 30000); // Check every 30s

    updateShopUI();
    updateLoadoutUI();
    checkPassiveBadges(); // Check on load (days played etc)
};

// Initialize immediately on load
setTimeout(initEconomy, 100);

window.toggleLoadout = (type) => {
    if (economyData.inventory[type] > 0) {
        selectedLoadout[type] = !selectedLoadout[type];
        updateLoadoutUI();
    }
};

window.updateLoadoutUI = () => {
    const types = ['shield', 'wormhole', 'booster'];
    types.forEach(type => {
        // START SCREEN
        const el = document.getElementById(`loadout-${type}`);
        const countEl = document.getElementById(`count-${type}`);
        // GAME OVER SCREEN (QUICK)
        const quickEl = document.getElementById(`quick-${type}`);
        const quickCountEl = document.getElementById(`quick-count-${type}`);

        const count = economyData.inventory[type];
        if (countEl) countEl.innerText = count;
        if (quickCountEl) quickCountEl.innerText = count;

        // Sync Visuals
        [el, quickEl].forEach(element => {
            if (element) {
                if (count > 0) {
                    element.classList.remove('opacity-30');
                    if (selectedLoadout[type]) {
                        element.classList.add('selected');
                        element.classList.remove('owned');
                    } else {
                        element.classList.remove('selected');
                        element.classList.add('owned');
                    }
                } else {
                    element.classList.remove('selected', 'owned');
                    element.classList.add('opacity-30');
                    // If we ran out, deselect
                    if (selectedLoadout[type] && count === 0) selectedLoadout[type] = false;
                }
            }
        });
    });
};

updateLoadoutUI();

// DEV TOOLS
window.resetProgress = () => {
    if (confirm("TÜM İLERLEME SİLİNECEK! Rozetler, skorlar, satın alımlar... Emin misin?")) {
        localStorage.removeItem('schrodinger_economy_v3');
        localStorage.removeItem('schrodinger_economy');
        localStorage.removeItem('schrodinger_leaderboard');
        location.reload();
    }
};

window.addDebugAtoms = () => {
    economyData.atoms += 50000;
    saveEconomy();
    updateShopUI();
    showToast("DEV MODU", "50.000 Atom Eklendi!", "fa-radiation");
};

// ACHIEVEMENT SYSTEM
function unlockAchievement(key) {
    const ach = ACHIEVEMENTS[key];
    if (!ach) return;
    if (economyData.unlockedAchievements.includes(key)) return;

    // Unlock
    economyData.unlockedAchievements.push(key);

    // Reward
    if (ach.reward > 0) {
        economyData.atoms += ach.reward;
        saveEconomy(); // Save immediately
    }

    // Notify
    showToast(ach.title, ach.msg, ach.icon);
    // Also show mini reward text if needed, but toast covers it.
}

function showToast(title, msg, iconClass) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
                <div class="toast-icon"><i class="fa-solid ${iconClass}"></i></div>
                <div class="toast-content">
                    <div class="toast-title">${title}</div>
                    <div class="toast-message">${msg}</div>
                </div>
            `;
    // ARROWS_ICON_HTML is undefined, strictly simplified HTML

    container.appendChild(toast);

    // Remove logic handled by CSS animation delay mostly, but safe to remove from DOM
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);

    // Limit max toasts
    // Limit max toasts
    while (container.children.length > 3) {
        container.removeChild(container.firstChild);
    }
}

function saveScoreToLeaderboard(score) {
    if (!leaderboardData[currentDifficulty]) leaderboardData[currentDifficulty] = [];
    const list = leaderboardData[currentDifficulty];
    list.push({ name: playerName, score: score });
    list.sort((a, b) => b.score - a.score);
    if (list.length > 10) list.pop(); // Keep top 10

    leaderboardData[currentDifficulty] = list;
    localStorage.setItem('schrodinger_leaderboard', JSON.stringify(leaderboardData));
}

// --- BADGES LOGIC (NO PAGINATION) ---

// 1. ACTIVE RUN CHECK (Called on Game Over)
function checkBadges(finalScore, currentTheme) {
    let newUnlock = false;

    // Safety Defaults
    const safePowerups = activePowerups || { shield: false, wormhole: false, booster: false };
    const safeStats = economyData.stats || {};
    const safeDifficulty = currentDifficulty || 'NORMAL';

    // Create Merged Context for Badges
    // This allows badges to access s.totalScore (stats) AND s.inventory (root) AND s.boughtShield (root)
    const statsContext = {
        ...safeStats,
        inventory: economyData.inventory || { shield: 0, wormhole: 0, booster: 0 },
        boughtShield: economyData.boughtShield,
        boughtWormhole: economyData.boughtWormhole,
        boughtBooster: economyData.boughtBooster,
        boughtLife: economyData.boughtLife,
        ownedThemes: economyData.ownedThemes || [],
        atoms: economyData.atoms || 0,
        // Special mapping for 'currentAtoms' used in badge definition
        currentAtoms: economyData.atoms || 0
    };

    const runStats = {
        score: finalScore,
        difficulty: safeDifficulty,
        hour: new Date().getHours(),
        isFriday13: (new Date().getDate() === 13 && new Date().getDay() === 5),
        playerName: playerName || "",
        revives: runRevives || 0,
        usedShield: safePowerups.shield,
        usedWormhole: safePowerups.wormhole,
        usedBooster: safePowerups.booster,
        usedLoadout: (safePowerups.shield || safePowerups.wormhole || safePowerups.booster),
        obstaclesPassed: obstaclesPassedCount, // Live count
        maxSpeedReached: speed || 0,
        maxClicksPerSecond: (inputHandler && inputHandler.maxCps) ? inputHandler.maxCps : 0,
        maxObstaclesPerSecond: maxObstaclesPerSecond // Live count
    };

    BADGES.forEach(badge => {
        if (economyData.unlockedBadges.includes(badge.id)) return;

        let unlocked = false;

        // 1. Target Score Check
        if (badge.targetScore) {
            if (finalScore >= badge.targetScore) {
                let failedConstraint = false;
                if (badge.theme && badge.theme !== currentTheme) failedConstraint = true;
                if (badge.noRevive && runStats.revives > 0) failedConstraint = true;

                if (!failedConstraint) unlocked = true;
            }
        }

        // 2. Custom Logic Check (Run Dependent)
        else if (badge.customCheck && typeof badge.customCheck === 'function') {
            // Only run checks that depend on RunStats here if needed, or run all.
            // Ideally we separate, but running all is safe if runStats is provided.
            try {
                if (badge.customCheck(statsContext, runStats)) {
                    unlocked = true;
                }
            } catch (e) { console.warn("Badge check failed for", badge.id, e); }
        }

        // 3. Total Score Check (Fallback if not caught by passive)
        else if (badge.targetTotalScore) {
            if (safeStats.totalScore >= badge.targetTotalScore) unlocked = true;
        }

        if (unlocked) {
            economyData.unlockedBadges.push(badge.id);
            showToast("ROZET KAZANILDI!", badge.title, badge.icon);
            newUnlock = true;
        }
    });

    if (newUnlock) {
        saveEconomy();
    }

    // Also check passive badges just in case
    checkPassiveBadges();
}

// 2. PASSIVE CHECK (Called on Shop, Init, Open Menu)
function checkPassiveBadges() {
    let newUnlock = false;
    const safeStats = economyData.stats || {};

    // Create Merged Context
    const statsContext = {
        ...safeStats,
        inventory: economyData.inventory || { shield: 0, wormhole: 0, booster: 0 },
        boughtShield: economyData.boughtShield,
        boughtWormhole: economyData.boughtWormhole,
        boughtBooster: economyData.boughtBooster,
        boughtLife: economyData.boughtLife,
        ownedThemes: economyData.ownedThemes || [],
        atoms: economyData.atoms || 0,
        currentAtoms: economyData.atoms || 0,
        // Add current session time
        currentSessionTime: (Date.now() - sessionStartTime) / 1000
    };

    // Dummy run stats for passive checks (avoids crash if customCheck expects it)
    const dummyRun = {
        score: 0, difficulty: 'NORMAL', hour: new Date().getHours(),
        isFriday13: false, playerName: playerName || "KEDI",
        revives: 0, usedShield: false, usedWormhole: false, usedBooster: false, usedLoadout: false,
        obstaclesPassed: 0, maxSpeedReached: 0, maxClicksPerSecond: 0, maxObstaclesPerSecond: 0
    };

    BADGES.forEach(badge => {
        if (economyData.unlockedBadges.includes(badge.id)) return;

        // SKIPPED: Score badges are Run-Only.
        if (badge.targetScore) return;

        let unlocked = false;

        // Total Score / Passive Checks
        if (badge.targetTotalScore) {
            if (safeStats.totalScore >= badge.targetTotalScore) unlocked = true;
        }
        else if (badge.customCheck && typeof badge.customCheck === 'function') {
            try {
                if (badge.customCheck(statsContext, dummyRun)) unlocked = true;
            } catch (e) { }
        }

        if (unlocked) {
            economyData.unlockedBadges.push(badge.id);
            showToast("ROZET KAZANILDI!", badge.title, badge.icon);
            newUnlock = true;
        }
    });

    if (newUnlock) {
        saveEconomy();
        // If badges screen is open, re-render
        const badgesScreen = document.getElementById('badges-screen');
        if (badgesScreen && !badgesScreen.classList.contains('hidden')) {
            renderBadges();
        }
    }
}

function openBadges() {
    checkPassiveBadges(); // Ensure update on open
    renderBadges();
    document.getElementById('badges-screen').classList.remove('hidden');
    document.getElementById('start-screen').classList.add('hidden');
}

function closeBadges() {
    document.getElementById('badges-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
}

// --- SETTINGS UI ---
function openSettings() {
    // Sync UI with current Audio Manager state
    const musicSlider = document.getElementById('music-volume-slider');
    const musicDisplay = document.getElementById('music-vol-display');
    const sfxSlider = document.getElementById('sfx-volume-slider');
    const sfxDisplay = document.getElementById('sfx-vol-display');
    const muteBtn = document.getElementById('mute-btn');

    // Music
    const musicVol = (audioManager.musicVolume !== undefined) ? audioManager.musicVolume : 0.3;
    musicSlider.value = Math.round(musicVol * 100);
    musicDisplay.innerText = musicSlider.value + "%";

    // SFX
    const sfxVol = (audioManager.sfxVolume !== undefined) ? audioManager.sfxVolume : 0.3;
    sfxSlider.value = Math.round(sfxVol * 100);
    sfxDisplay.innerText = sfxSlider.value + "%";

    // Mute
    const isMuted = audioManager.isMuted;
    muteBtn.innerText = isMuted ? "KAPALI" : "AÇIK";
    muteBtn.style.color = isMuted ? "red" : "#39FF14";

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('settings-screen').classList.remove('hidden');
    audioManager.playMenuClick();
}

function closeSettings() {
    document.getElementById('settings-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    audioManager.playMenuClick();
}

function updateMusicVolume(val) {
    const vol = parseInt(val);
    document.getElementById('music-vol-display').innerText = vol + "%";
    audioManager.setMusicVolume(vol / 100);
}

function updateSfxVolume(val) {
    const vol = parseInt(val);
    document.getElementById('sfx-vol-display').innerText = vol + "%";
    audioManager.setSfxVolume(vol / 100);
}

function toggleMute() {
    const currentState = audioManager.isMuted;
    const newState = !currentState;

    audioManager.setMute(newState);

    const muteBtn = document.getElementById('mute-btn');
    muteBtn.innerText = newState ? "KAPALI" : "AÇIK";
    muteBtn.style.color = newState ? "red" : "#39FF14";

    // Also update slider visual if needed or leave as is (slider shows 'potential' volume)
    audioManager.playMenuClick();
}

function renderBadges() {
    const list = document.getElementById('badges-list');
    list.innerHTML = '';

    BADGES.forEach(badge => {
        const isUnlocked = economyData.unlockedBadges.includes(badge.id);

        const badgeEl = document.createElement('div');
        badgeEl.className = `badge-grid-item ${isUnlocked ? 'unlocked' : ''}`;

        badgeEl.innerHTML = `
                    <div class="badge-icon" style="${isUnlocked ? '' : 'filter:grayscale(1); opacity:0.3;'}">
                        <i class="fa-solid ${badge.icon}"></i>
                    </div>
                    <div class="badge-info">
                        <div class="badge-title" style="${isUnlocked ? '' : 'color:#555;'}">${badge.title}</div>
                        <div class="badge-desc">${badge.desc}</div>
                    </div>
                `;

        list.appendChild(badgeEl);
    });
}

// --- ETKİLEŞİMLİ EVCİL HAYVAN SİSTEMİ ---
class InteractivePet {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // Çözünürlüğü Ayarla
        this.width = 300;
        this.height = 300;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Durum Değişkenleri
        this.mood = 80; // 0-100 (Mutluluk)
        this.energy = 100;
        this.isSleeping = false;
        this.lastInteraction = Date.now();
        this.blinkTimer = 0;
        this.isBlinking = false;

        // Animasyon Değişkenleri
        this.frame = 0;
        this.tailAngle = 0;
        this.breathScale = 1;
        this.purrIntensity = 0;
        this.leftEarTwitch = 0;
        this.rightEarTwitch = 0;
        this.yawnTimer = 0;
        this.isYawning = false;

        // Etkileşim Sınırları (Kafa bölgesi için yaklaşık değer: y 100 -> 140 görsel merkez)
        this.headRegion = { x: 150, y: 150, r: 60 };

        // Olay Dinleyicileri
        this.setupEvents();

        // Döngüyü Başlat
        this.loop();
    }

    setupEvents() {
        // Sevme için Fare/Dokunma Etkileşimi
        const handleMove = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const x = (clientX - rect.left) * (this.width / rect.width);
            const y = (clientY - rect.top) * (this.height / rect.height);

            this.checkInteraction(x, y);
        };

        this.canvas.addEventListener('mousemove', handleMove);
        this.canvas.addEventListener('touchmove', handleMove, { passive: true });
        this.canvas.addEventListener('click', () => this.pet(true));
    }

    checkInteraction(x, y) {
        // Kafa üzerinde gezinme/dokunma kontrolü
        const dx = x - this.headRegion.x;
        const dy = y - this.headRegion.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.headRegion.r) {
            this.pet();
            document.body.style.cursor = 'grab';
        } else {
            document.body.style.cursor = 'default';
            this.purrIntensity = Math.max(0, this.purrIntensity - 0.5);
        }
    }

    pet(isClick = false) {
        const now = Date.now();
        if (now - this.lastInteraction < 50) return; // Debounce
        this.lastInteraction = now;

        // Mutluluğu Artır
        this.mood = Math.min(100, this.mood + (isClick ? 5 : 0.5));
        this.updateMoodUI();

        // Mırıldanma Efekti
        this.purrIntensity = Math.min(10, this.purrIntensity + 1);

        // Görsel Efektleri Tetikle
        if (Math.random() < 0.05) this.showHeart();

        // Ses Efekti (Sınırlandırılmış)
        if (Math.random() < 0.3 && audioManager && audioManager.ctx && !audioManager.isMuted) {
            const osc = audioManager.ctx.createOscillator();
            const gain = audioManager.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(25 + Math.random() * 10, audioManager.ctx.currentTime);

            const vol = (audioManager.sfxVolume || 0.3) * 0.2;
            gain.gain.setValueAtTime(vol, audioManager.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioManager.ctx.currentTime + 0.8);

            osc.connect(gain);
            if (audioManager.sfxGain) gain.connect(audioManager.sfxGain);
            else gain.connect(audioManager.ctx.destination);

            osc.start();
            osc.stop(audioManager.ctx.currentTime + 0.8);
        }
    }

    updateMoodUI() {
        const moodBar = document.getElementById('pet-mood-fill');
        const tooltip = document.getElementById('pet-tooltip');

        if (moodBar) moodBar.style.width = this.mood + '%';

        if (this.mood > 90) tooltip.innerText = "Çok Mutlu!";
        else if (this.mood > 50) tooltip.innerText = "Memnun";
        else if (this.mood > 20) tooltip.innerText = "İlgi Bekliyor";
        else tooltip.innerText = "Mutsuz...";
    }

    showHeart() {
        // Görsel efekt CSS veya canvas ile yapılabilir
        // Şimdilik ipucu balonunu zıplatalım
        const tooltip = document.getElementById('pet-tooltip');
        if (tooltip) {
            tooltip.classList.add('visible');
            setTimeout(() => tooltip.classList.remove('visible'), 2000);
        }
    }

    update() {
        this.frame++;

        // Nefes Alma
        this.breathScale = 1 + Math.sin(this.frame * 0.05) * 0.02;

        // Kuyruk Sallama (Gelişmiş)
        // Yavaşça yukarı aşağı hareket (Base Offset)
        const tailLift = Math.sin(this.frame * 0.02) * 0.5 - 0.2;
        // Hızlı sallanma (Wag)
        const moodSpeed = this.mood > 80 ? 0.15 : 0.08;
        const wagRange = this.mood > 50 ? 0.3 : 0.15;
        const tailWag = Math.sin(this.frame * moodSpeed) * wagRange;

        this.tailAngle = tailLift + tailWag;

        // Göz Kırpma
        this.blinkTimer++;
        if (this.blinkTimer > 200 + Math.random() * 200) {
            this.isBlinking = true;
            if (this.blinkTimer > 210 + Math.random() * 200) { // Hızlı kırpma
                this.isBlinking = false;
                this.blinkTimer = 0;
            }
        }

        // Kulak Oynatma (Rastgele)
        if (Math.random() > 0.99) this.leftEarTwitch = 10;
        if (Math.random() > 0.99) this.rightEarTwitch = 10;

        if (this.leftEarTwitch > 0) this.leftEarTwitch *= 0.8;
        if (this.rightEarTwitch > 0) this.rightEarTwitch *= 0.8;

        // Esneme Animasyonu (Nadir)
        if (!this.isYawning && Math.random() < 0.001) { // ~3 dakikada bir şans (60fps) - Şans arttırıldı: 0.001
            this.isYawning = true;
            this.yawnTimer = 0;
        }

        if (this.isYawning) {
            this.yawnTimer++;
            if (this.yawnTimer > 120) { // 2 saniye sürsün
                this.isYawning = false;
                this.yawnTimer = 0;
            }
        }

        // Mutluluk Azalması
        if (this.frame % 600 === 0) { // Her ~10 saniyede bir
            this.mood = Math.max(0, this.mood - 1);
            this.updateMoodUI();
        }

        if (this.purrIntensity > 0) {
            this.purrIntensity -= 0.05;
            this.canvas.style.transform = `translate(${Math.random()}px, ${Math.random()}px)`;
        } else {
            this.canvas.style.transform = 'none';
        }
    }

    drawAccessories(ctx) {
        const equipped = economyData.equippedCosmetics || { hat: 'none', glasses: 'none', toy: 'none', bowl: 'none' };

        // 1. ŞAPKALAR
        if (equipped.hat !== 'none') {
            ctx.save();
            ctx.translate(0, -45); // Kafa üstü
            // Nefes almaya bağlı hafif sallanma
            ctx.rotate(Math.sin(this.frame * 0.05) * 0.02);

            if (equipped.hat === 'tophat') {
                ctx.fillStyle = '#000';
                ctx.fillRect(-15, -20, 30, 25); // Top
                ctx.fillRect(-22, 5, 44, 4); // Brim
            } else if (equipped.hat === 'party') {
                ctx.beginPath();
                ctx.moveTo(0, -35); ctx.lineTo(-15, 0); ctx.lineTo(15, 0); ctx.closePath();
                ctx.fillStyle = '#ff00ff'; ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(0, -38, 5, 0, Math.PI * 2); ctx.fill();
            } else if (equipped.hat === 'cowboy') {
                ctx.fillStyle = '#8B4513';
                ctx.beginPath();
                ctx.ellipse(0, 5, 30, 8, 0, 0, Math.PI * 2); ctx.fill(); // Brim
                ctx.fillRect(-15, -15, 30, 20); // Crown
            } else if (equipped.hat === 'beanie') {
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(0, 0, 18, Math.PI, 0); ctx.fill(); // Dome
                ctx.fillRect(-18, 0, 36, 6); // Brim
            } else if (equipped.hat === 'king_crown') {
                ctx.fillStyle = '#FFD700'; // Gold
                ctx.beginPath();
                ctx.moveTo(-20, 0);
                ctx.lineTo(-20, -20);
                ctx.lineTo(-10, -10);
                ctx.lineTo(0, -25);
                ctx.lineTo(10, -10);
                ctx.lineTo(20, -20);
                ctx.lineTo(20, 0);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#FF0000'; // Gem
                ctx.beginPath(); ctx.arc(0, -15, 3, 0, Math.PI * 2); ctx.fill();
            } else if (equipped.hat === 'queen_crown') {
                ctx.fillStyle = '#E6E6FA'; // Silver/Lavender
                ctx.beginPath();
                ctx.moveTo(-15, 0);
                ctx.bezierCurveTo(-15, -20, 15, -20, 15, 0);
                ctx.fill();
                ctx.fillStyle = '#DA70D6'; // Pearl/Gem
                ctx.beginPath(); ctx.arc(0, -18, 4, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(-10, -10, 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(10, -10, 2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }

        // 2. GÖZLÜKLER
        if (equipped.glasses !== 'none') {
            ctx.save();
            ctx.translate(0, -25); // Göz hizası
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000';

            if (equipped.glasses === 'cool') {
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(-12, -4, 10, 10); // Sol cam
                ctx.fillRect(2, -4, 10, 10);  // Sağ cam
                ctx.beginPath(); ctx.moveTo(-2, 1); ctx.lineTo(2, 1); ctx.stroke(); // Köprü
            } else if (equipped.glasses === 'monocle') {
                ctx.beginPath(); ctx.arc(8, 0, 8, 0, Math.PI * 2); ctx.stroke(); // Sağ cam
                ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(25, 15); ctx.stroke(); // Zincir
            } else if (equipped.glasses === 'nerd') {
                ctx.lineWidth = 2;
                ctx.strokeRect(-11, -5, 9, 11); ctx.strokeRect(2, -5, 9, 11);
                ctx.beginPath(); ctx.moveTo(-2, 1); ctx.lineTo(2, 1); ctx.stroke();
            } else if (equipped.glasses === 'heart') {
                const drawHeart = (hx, hy) => {
                    ctx.beginPath();
                    ctx.moveTo(hx, hy);
                    ctx.bezierCurveTo(hx - 5, hy - 5, hx - 10, hy, hx, hy + 8);
                    ctx.bezierCurveTo(hx + 10, hy, hx + 5, hy - 5, hx, hy);
                    ctx.fill();
                };
                ctx.fillStyle = 'rgba(255,0,0,0.6)';
                drawHeart(-8, -2); drawHeart(8, -2);
            }
            ctx.restore();
        }

        // 3. OYUNCAKLAR (Yerde, kedinin sağında)
        if (equipped.toy && equipped.toy !== 'none') {
            ctx.save();
            ctx.translate(45, 45); // Sağ alt yer
            if (equipped.toy === 'yarn') {
                ctx.fillStyle = '#ff69b4';
                ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath(); ctx.arc(0, 0, 8 - i * 2, 0, Math.PI * 2); ctx.stroke();
                }
            } else if (equipped.toy === 'mouse') {
                ctx.fillStyle = '#808080';
                ctx.beginPath(); ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-20, -5); ctx.stroke(); // Tail
            } else if (equipped.toy === 'ball') {
                ctx.fillStyle = '#32CD32';
                ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 8, 0.2, 1.2); ctx.stroke();
            }
            ctx.restore();
        }

        // 4. MAMA KABI (Yerde, kedinin solunda)
        if (equipped.bowl && equipped.bowl !== 'none') {
            ctx.save();
            ctx.translate(-45, 45); // Sol alt yer
            let color = '#ff0000';
            if (equipped.bowl === 'blue_bowl') color = '#0000ff';
            if (equipped.bowl === 'golden_bowl') color = '#FFD700';

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(0, 5, 20, 5, 0, 0, Math.PI * 2); ctx.fill(); // Base
            ctx.fillRect(-15, -2, 30, 7); // Sides
            ctx.fillStyle = (equipped.bowl === 'golden_bowl') ? '#FFA500' : '#8B4513'; // Food
            ctx.beginPath(); ctx.ellipse(0, -2, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        ctx.save();
        ctx.translate(this.width / 2, this.height / 2 + 40); // Move down
        ctx.scale(2.2 * this.breathScale, 2.2 * this.breathScale); // Reduce scale

        // --- PASS 1: LEFT HALF (BLACK) ---
        this.drawHalf(ctx, 'left');

        // --- PASS 2: RIGHT HALF (WHITE) ---
        this.drawHalf(ctx, 'right');

        // --- PASS 3: ACCESSORIES ---
        this.drawAccessories(ctx);

        ctx.restore();
    }

    drawHalf(ctx, side) {
        ctx.save();

        // Clipping Region
        ctx.beginPath();
        if (side === 'left') {
            ctx.rect(-100, -100, 100, 200); // Left side
        } else {
            ctx.rect(0, -100, 100, 200); // Right side
        }
        ctx.clip();

        const isLeft = side === 'left';
        const mainColor = isLeft ? '#111' : '#EEE';
        const contrastColor = isLeft ? '#EEE' : '#111';

        ctx.fillStyle = mainColor;
        ctx.strokeStyle = mainColor;

        // 1. KUYRUK
        ctx.save();
        ctx.translate(-30, 10);
        ctx.rotate(this.tailAngle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        // ctx.globalCompositeOperation = 'destination-over'; // Body arkası
        ctx.bezierCurveTo(-20, -10, -40, -40, -10, -60);
        ctx.bezierCurveTo(10, -50, 20, -20, 0, 0);
        ctx.fill();
        ctx.restore();

        // 2. GÖVDE
        ctx.beginPath();
        ctx.ellipse(0, 10, 35, 45, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2.5. PATİLER
        ctx.beginPath();
        ctx.ellipse(-20, 45, 12, 8, 0, 0, Math.PI * 2); // Sol Pati
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(20, 45, 12, 8, 0, 0, Math.PI * 2); // Sağ Pati
        ctx.fill();

        // 3. KAFA
        ctx.beginPath();
        ctx.arc(0, -25, 25, 0, Math.PI * 2);
        ctx.fill();

        // 4. KULAKLAR
        // Sol Kulak
        ctx.save();
        ctx.translate(-20, -40);
        ctx.rotate(this.leftEarTwitch * -0.05);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-5, -25);
        ctx.lineTo(15, -5);
        ctx.fill();
        ctx.restore();

        // Sağ Kulak
        ctx.save();
        ctx.translate(20, -40);
        ctx.rotate(this.rightEarTwitch * 0.05);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(5, -25);
        ctx.lineTo(-15, -5);
        ctx.fill();
        ctx.restore();

        // 5. GÖZLER
        if (!this.isBlinking) {
            ctx.fillStyle = contrastColor;

            // Sol Göz
            ctx.beginPath();
            ctx.ellipse(-10, -25, 4, 3, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();

            // Sağ Göz
            ctx.beginPath();
            ctx.ellipse(10, -25, 4, 3, -Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Kapalı Gözler (Çizgi)
            ctx.strokeStyle = contrastColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-15, -25);
            ctx.lineTo(-5, -25);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(5, -25);
            ctx.lineTo(15, -25);
            ctx.stroke();
        }

        // 6. AĞIZ / ESNEME
        if (this.isYawning) {
            // Esneme (Açık Ağız)
            const progress = this.yawnTimer / 60; // 0 -> 2
            const openFactor = Math.sin(Math.min(progress, 1) * Math.PI); // 0 -> 1 -> 0

            ctx.fillStyle = contrastColor;
            ctx.beginPath();
            // Ağız konumu: y = -15 civarı
            // Side check: Esneme ağzını tam ortada çizmek için clip yüzünden yarısını çiziyoruz
            ctx.ellipse(0, -10, 8 * openFactor, 10 * openFactor, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Normal Ağız (Küçük 'w' gib)
            ctx.strokeStyle = contrastColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (side === 'left') {
                ctx.arc(-3, -12, 3, 0, Math.PI);
            } else {
                ctx.arc(3, -12, 3, 0, Math.PI);
            }
            ctx.stroke();
        }

        // 7. BIYIKLAR
        ctx.strokeStyle = contrastColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();

        // Sol Bıyıklar
        ctx.moveTo(-15, -15); ctx.lineTo(-35, -20);
        ctx.moveTo(-15, -12); ctx.lineTo(-35, -12);
        ctx.moveTo(-15, -9); ctx.lineTo(-35, -5);

        // Sağ Bıyıklar
        ctx.moveTo(15, -15); ctx.lineTo(35, -20);
        ctx.moveTo(15, -12); ctx.lineTo(35, -12);
        ctx.moveTo(15, -9); ctx.lineTo(35, -5);

        ctx.stroke();

        ctx.restore();
    }

    loop() {
        if (!document.getElementById('start-screen').classList.contains('hidden')) {
            this.update();
            this.draw();
        }
        requestAnimationFrame(() => this.loop());
    }
}

let petSystem; // Global Reference

// GAME VARIABLES
let currentDifficulty = 'NORMAL';
let isPlaying = false;
let score = 0;
let atomsClaimedThisRun = 0;
let highScore = 0;

let speed = SPEED_START;
let frames = 0;
let playerName = "KEDI";
let gameTime = 0;
let lastTime = 0;
let shake = 0;

// TRACKING VARIABLES
let obstaclesPassedTimestamps = [];
let maxObstaclesPerSecond = 0;
let obstaclesPassedCount = 0;
let runRevives = 0;
let hasRevivedThisGame = false; // Track if player has already revived this game

// SESSION TRACKING
let sessionStartTime = Date.now();

let rainDrops = [];
let particles = [];
let backgroundLayers = [];

const player = new Player(GROUND_Y);
const obstacleManager = new ObstacleManager();
const audioManager = new AudioManager();

const gameInterface = {
    get isPlaying() { return isPlaying; },
    get currentDifficulty() { return currentDifficulty; },
    handleAction: (action) => handleAction(action)
};
const inputHandler = new InputHandler(gameInterface);

// --- PHASE 1 & 2: PORTAL & OCEAN SYSTEM ---
const GAME_MODES = {
    NORMAL: 'NORMAL',
    OCEAN: 'OCEAN',
    ATMOSPHERE: 'ATMOSPHERE'
};

class PortalManager {
    constructor() {
        this.portals = [];
        // Phase 1: Frequent spawns for testing (10-25s)
        this.spawnTimer = 0;
        this.nextSpawnTime = Math.random() * 15 + 10; // 10-25s
    }

    reset() {
        this.portals = [];
        this.spawnTimer = 0;
        this.nextSpawnTime = 5; // First portal spawns in 5 seconds
    }

    update(dt, speed) {
        if (gameMode !== GAME_MODES.NORMAL) return;

        // Spawning
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.nextSpawnTime) {
            this.spawnPortal();
            this.spawnTimer = 0;
            // Balanced Frequency: 20-30s
            this.nextSpawnTime = Math.random() * 10 + 20;
        }

        // Update Portals
        for (let i = this.portals.length - 1; i >= 0; i--) {
            let p = this.portals[i];
            p.x -= (speed * 1.2 * 60) * dt; // Portals move slightly faster than background
            p.rotation += 2 * 60 * dt; // Rotate visuals
            p.pulse += dt * 5; // Pulse animation speed

            // Remove if off screen
            if (p.x < -100) {
                this.portals.splice(i, 1);
            }
        }
    }

    spawnPortal() {
        const yPos = GROUND_Y - (Math.random() * 80 + 70);
        const isAtmosphere = Math.random() < 0.7; // 70% chance for Atmosphere, 30% for Ocean
        const mode = isAtmosphere ? GAME_MODES.ATMOSPHERE : GAME_MODES.OCEAN;
        const color = isAtmosphere ? '#00BFFF' : '#8A2BE2'; // DeepSkyBlue vs Purple

        this.portals.push({
            x: WIDTH + 100,
            y: yPos,
            radius: 45,
            rotation: 0,
            pulse: 0,
            color: color,
            mode: mode
        });
        console.log("Portal Spawned - Mode:", mode, "at Y:", yPos);
    }

    draw(ctx) {
        if (gameMode !== GAME_MODES.NORMAL && this.portals.length === 0) return;

        for (let p of this.portals) {
            ctx.save();
            ctx.translate(p.x, p.y);

            // PULSING GLOW EFFECT
            const glowSize = Math.sin(p.pulse) * 5 + 10;
            ctx.shadowBlur = glowSize + 10;
            ctx.shadowColor = p.color; // Match portal color

            // 1. OUTER ROTATING RING (Segmented)
            ctx.save();
            ctx.rotate(p.rotation * 0.05); // Slow Rotation
            ctx.strokeStyle = p.color; // Match portal color
            ctx.lineWidth = 4;
            ctx.setLineDash([15, 10]); // Dashed effect
            ctx.beginPath();
            ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // 2. INNER VORTEX (Faster Reverse Rotation)
            ctx.save();
            ctx.rotate(-p.rotation * 0.1);
            ctx.fillStyle = 'rgba(124, 58, 237, 0.4)'; // Transparent Purple
            ctx.beginPath();
            // Star/Flower shape
            for (let i = 0; i < 5; i++) {
                ctx.lineTo(Math.cos(i * 1.25) * (p.radius - 10), Math.sin(i * 1.25) * (p.radius - 10));
                ctx.lineTo(Math.cos(i * 1.25 + 0.6) * (p.radius - 25), Math.sin(i * 1.25 + 0.6) * (p.radius - 25));
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // 3. CENTER CORE (Pulsing)
            const coreSize = 15 + Math.sin(p.pulse * 2) * 2;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(0, 0, coreSize, 0, Math.PI * 2);
            ctx.fill();

            // 4. PARTICLES (Simple orbiting dots)
            for (let i = 0; i < 3; i++) {
                const orbitAngle = p.rotation * 0.2 + (i * 2.09); // 120 deg apart
                const ox = Math.cos(orbitAngle) * (p.radius + 10);
                const oy = Math.sin(orbitAngle) * (p.radius + 10);
                ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.sin(p.pulse + i) * 0.5})`;
                ctx.beginPath();
                ctx.arc(ox, oy, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    checkCollision(player) {
        const pw = player.width || 40;
        const ph = player.height || 40;
        const px = player.x + pw / 2;
        const py = player.y + ph / 2;

        for (let i = 0; i < this.portals.length; i++) {
            let p = this.portals[i];
            const dx = px - p.x;
            const dy = py - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < p.radius + 40) {
                console.log("PORTAL HIT! Mode:", p.mode);
                const mode = p.mode;
                this.portals.splice(i, 1); // Remove hit portal
                return mode;
            }
        }
        return null;
    }
}

const FISH_TYPES = {
    GREEN: { color: '#00ff00', score: 0, time: 1, weight: 0.4, name: 'Time Fish' },
    BLUE: { color: '#00ffff', score: 10, time: 0, weight: 0.3, name: 'Score Fish' },
    GOLD: { color: '#ffd700', score: 50, time: 0, weight: 0.1, name: 'Gold Fish' },
    PURPLE: { color: '#800080', score: 25, time: 0, weight: 0.15, name: 'Rare Score' },
    ORANGE: { color: '#ffa500', score: 0, time: 2, weight: 0.05, name: 'Rare Time' }
};

class Fish {
    constructor(startX) {
        this.x = startX;
        this.y = Math.random() * (GROUND_Y - 100) + 50; // Random height
        this.width = 30;
        this.height = 20;
        this.baseY = this.y;

        // Speed Calculation (Pixels per Second)
        // Speed Calculation (Pixels per Second)
        // INCREASED SPEED: 120 - 250 px/s (was 40-120) for 10s mode
        this.speed = Math.random() * 130 + 120;

        this.timeOffset = Math.random() * 100;

        // Visual Variety
        this.scale = 0.8 + Math.random() * 0.4; // 0.8x to 1.2x size

        // Pick Type
        // Pick Type based on weight
        const rand = Math.random();
        if (rand < FISH_TYPES.GREEN.weight) this.type = FISH_TYPES.GREEN;
        else if (rand < FISH_TYPES.GREEN.weight + FISH_TYPES.BLUE.weight) this.type = FISH_TYPES.BLUE;
        else if (rand < FISH_TYPES.GREEN.weight + FISH_TYPES.BLUE.weight + FISH_TYPES.GOLD.weight) this.type = FISH_TYPES.GOLD;
        else if (rand < FISH_TYPES.GREEN.weight + FISH_TYPES.BLUE.weight + FISH_TYPES.GOLD.weight + FISH_TYPES.PURPLE.weight) this.type = FISH_TYPES.PURPLE;
        else this.type = FISH_TYPES.ORANGE;

        this.width *= this.scale;
        this.height *= this.scale;
        this.bobTimer = 0;
    }

    update(dt) {
        // Now dt is in seconds.
        // Speed is pixels/second (120-250)
        this.x -= this.speed * dt;

        // Bobbing using internally tracked time for smoothness
        this.bobTimer += dt;
        this.y = this.baseY + Math.sin(this.bobTimer * 2 + this.timeOffset) * 20;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Scale and Flip (Face left)
        // Scale (No flip needed if drawing is already left-facing, or add flip if needed)
        // Drawing: Tail is at +10..+20 (Right), Head is at -15 (Left).
        // So the default drawing faces LEFT.
        // If speed > 0 (Moving Left), we want it to face Left -> Scale(1, 1).
        if (this.speed > 0) ctx.scale(this.scale, this.scale);
        else ctx.scale(-this.scale, this.scale);

        ctx.fillStyle = this.type.color;

        // Simple Fish Shape
        ctx.beginPath();
        ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tail
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(20, -10);
        ctx.lineTo(20, 10);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-8, -2, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

class Shark {
    constructor(startX) {
        this.x = startX;
        this.y = Math.random() * (GROUND_Y - 150) + 80; // Random height, avoid edges
        this.width = 70;
        this.height = 35;
        this.baseY = this.y;

        // Faster than fish for high stakes (250-400 px/s)
        this.speed = Math.random() * 150 + 250;

        this.timeOffset = Math.random() * 100;
        this.bobTimer = 0;

        // Sharks are larger and more menacing
        this.scale = 1.0 + Math.random() * 0.3; // 1.0x to 1.3x size
        this.width *= this.scale;
        this.height *= this.scale;
    }

    update(dt) {
        this.x -= this.speed * dt;

        // Subtle bobbing (less than fish)
        this.bobTimer += dt;
        this.y = this.baseY + Math.sin(this.bobTimer * 1.5 + this.timeOffset) * 15;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Scale
        ctx.scale(this.scale, this.scale);

        // Shark Body (Gray)
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.ellipse(0, 0, 25, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tail
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(28, -8);
        ctx.lineTo(28, 8);
        ctx.fill();

        // Dorsal Fin (Triangular - Menacing!)
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.moveTo(-5, -12);
        ctx.lineTo(5, -12);
        ctx.lineTo(0, -22);
        ctx.closePath();
        ctx.fill();

        // Eye (Red - Dangerous!)
        ctx.fillStyle = '#f00';
        ctx.beginPath();
        ctx.arc(-12, -3, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Teeth (White sharp triangles)
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(-18 + i * 4, 5);
            ctx.lineTo(-16 + i * 4, 9);
            ctx.lineTo(-14 + i * 4, 5);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }
}

const BIRD_TYPES = {
    GREEN: { color: '#4ade80', score: 20, time: 1, atoms: 0, weight: 0.4, name: 'Zaman Kuşu' },
    BLUE: { color: '#60a5fa', score: 30, time: 0, atoms: 0, weight: 0.3, name: 'Puan Kuşu' },
    GOLD: { color: '#fbbf24', score: 100, time: 0, atoms: 5, weight: 0.1, name: 'Altın Kuş' },
    PURPLE: { color: '#a855f7', score: 50, time: 0, atoms: 2, weight: 0.15, name: 'Nadir Puan' },
    ORANGE: { color: '#fb923c', score: 40, time: 2, atoms: 1, weight: 0.05, name: 'Nadir Zaman' }
};

class Bird {
    constructor(startX) {
        this.x = startX;
        this.y = Math.random() * (GROUND_Y - 150) + 50;
        this.width = 35;
        this.height = 25;
        this.baseY = this.y;
        this.speed = Math.random() * 100 + 150;
        this.timeOffset = Math.random() * 100;
        this.scale = 0.8 + Math.random() * 0.4;

        const rand = Math.random();
        let cumulativeWeight = 0;
        for (const key in BIRD_TYPES) {
            cumulativeWeight += BIRD_TYPES[key].weight;
            if (rand < cumulativeWeight) {
                this.type = BIRD_TYPES[key];
                break;
            }
        }

        this.width *= this.scale;
        this.height *= this.scale;
        this.wingTimer = 0;
    }

    update(dt) {
        this.x -= this.speed * dt;
        this.wingTimer += dt * 10;
        this.y = this.baseY + Math.sin(this.wingTimer * 0.5 + this.timeOffset) * 25;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);

        // Wings animation
        const wingPos = Math.sin(this.wingTimer) * 10;

        ctx.fillStyle = this.type.color;
        // Body
        ctx.beginPath();
        ctx.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(-12, -2, 6, 0, Math.PI * 2);
        ctx.fill();

        // Beak
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(-17, -2);
        ctx.lineTo(-24, 0);
        ctx.lineTo(-17, 2);
        ctx.fill();

        // Wings
        ctx.fillStyle = this.type.color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(5, -15 - wingPos, 15, - wingPos);
        ctx.lineTo(10, 0);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-14, -4, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

class Eagle {
    constructor(startX) {
        this.x = startX;
        this.y = Math.random() * (GROUND_Y - 200) + 100;
        this.width = 80;
        this.height = 40;
        this.baseY = this.y;
        this.speed = Math.random() * 150 + 300;
        this.timeOffset = Math.random() * 100;
        this.wingTimer = 0;
        this.scale = 1.1 + Math.random() * 0.3;
        this.width *= this.scale;
        this.height *= this.scale;
    }

    update(dt) {
        this.x -= this.speed * dt;
        this.wingTimer += dt * 8;
        this.y = this.baseY + Math.sin(this.wingTimer * 0.3 + this.timeOffset) * 20;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);

        const wingPos = Math.sin(this.wingTimer) * 12;

        // Body (Brown)
        ctx.fillStyle = '#452610';
        ctx.beginPath();
        ctx.ellipse(0, 0, 30, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head (White)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-25, -5, 10, 0, Math.PI * 2);
        ctx.fill();

        // Beak (Yellow/Hooked)
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(-32, -5);
        ctx.lineTo(-42, 2);
        ctx.lineTo(-32, 5);
        ctx.fill();

        // Wings
        ctx.fillStyle = '#452610';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(20, -25 - wingPos);
        ctx.lineTo(40, -10 - wingPos);
        ctx.lineTo(10, 5);
        ctx.fill();

        // Eye (Sharp)
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-28, -7, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

class AtmosferMode {
    constructor() {
        this.isActive = false;
        this.isExiting = false;
        this.timer = 0;
        this.duration = 10;
        this.birds = [];
        this.birdSpawnTimer = 0;
        this.eagles = [];
        this.eagleSpawnTimer = 0;
        this.floatingTexts = []; // NEW: For score popups

        this.bgImage = new Image();
        this.bgImage.src = 'assets/atmosfer.webp';
        this.bgX = 0;
        this.bgSpeed = 100;
    }

    enter() {
        this.isActive = true;
        this.isExiting = false;
        this.timer = this.duration;
        console.log("Atmosfer Moduna Giriliyor");

        if (player) player.setAtmosferMode(true);
        document.body.style.backgroundColor = "#87CEEB"; // Sky Blue

        this.birds = [];
        this.eagles = [];
        this.birdSpawnTimer = 0;
        this.eagleSpawnTimer = 0;

        // Initial birds
        for (let i = 0; i < 2; i++) {
            this.birds.push(new Bird(WIDTH + 100 + i * 200));
        }
    }

    exit() {
        if (this.isExiting) return;
        this.isExiting = true;
        this.isActive = false;

        if (player) {
            player.setAtmosferMode(false);
            player.isInvulnerable = true;
            player.invulnerableTimer = 3000;
            if (window.showToast) showToast("GÜVENDE", "3 sn dokunulmazlık", "fa-shield");
        }

        gameMode = GAME_MODES.NORMAL;
        document.body.style.backgroundColor = "#111";
    }

    reset() {
        this.isActive = false;
        this.isExiting = false;
        this.timer = this.duration;
        this.birds = [];
        this.eagles = [];
        this.floatingTexts = [];
    }

    addFloatingText(x, y, text, color) {
        this.floatingTexts.push({
            x, y, text, color,
            life: 1.0,
            uy: -20 // Upward velocity
        });
    }

    update(dt) {
        if (!this.isActive) return;

        this.timer -= dt;
        if (this.timer <= 0 && !this.isExiting) {
            this.exit();
            return;
        }

        const settings = DIFFICULTY_SETTINGS[currentDifficulty];
        score += (1.2 * settings.scoreMultiplier);
        const sEl = document.getElementById('score-display');
        if (sEl) sEl.innerText = Math.floor(score).toString().padStart(5, '0');

        // Background Scrolling
        this.bgX -= this.bgSpeed * dt;
        if (this.bgX <= -WIDTH) this.bgX = 0;

        // Birds
        this.birdSpawnTimer += dt;
        if (this.birdSpawnTimer > Math.random() * 2.0 + 1.0) {
            this.birds.push(new Bird(WIDTH + 50));
            this.birdSpawnTimer = 0;
        }
        for (let i = this.birds.length - 1; i >= 0; i--) {
            let b = this.birds[i];
            b.update(dt);
            if (
                player.x < b.x + b.width &&
                player.x + player.width > b.x &&
                player.y < b.y + b.height &&
                player.y + player.height > b.y
            ) {
                if (b.type.time > 0) this.timer += b.type.time;
                if (b.type.score > 0) {
                    score += b.type.score;
                    // Update score display immediately
                    if (sEl) sEl.innerText = Math.floor(score).toString().padStart(5, '0');
                    // Add floating text
                    this.addFloatingText(b.x, b.y, `+${b.type.score}`, b.type.color);
                }

                // NEW: Atom Rewards
                if (b.type.atoms > 0) {
                    economyData.atoms += b.type.atoms;
                    atomsClaimedThisRun += b.type.atoms;
                    if (window.showToast) showToast(`+${b.type.atoms} ATOM`, "Kuş toplandı", "fa-atom");
                    saveEconomy();
                    // Optional: add floating atom text too
                    this.addFloatingText(b.x, b.y - 20, `+${b.type.atoms} ATOM`, '#ffea00');
                }

                if (window.audioManager && audioManager.playCollect) audioManager.playCollect();
                this.birds.splice(i, 1);
                continue;
            }
            if (b.x < -100) this.birds.splice(i, 1);
        }

        // Eagles
        this.eagleSpawnTimer += dt;
        if (this.eagleSpawnTimer > Math.random() * 3.0 + 2.0) {
            if (Math.random() < 0.45) {
                this.eagles.push(new Eagle(WIDTH + 100));
            }
            this.eagleSpawnTimer = 0;
        }
        for (let i = this.eagles.length - 1; i >= 0; i--) {
            let e = this.eagles[i];
            e.update(dt);

            // Hitbox padding for fairer collision (shrink both player and eagle hitbox)
            const playerPadding = 4;  // Player hitbox shrink
            const eaglePadding = 6;  // Eagle hitbox shrink (kartal daha büyük görünüyor ama gerçek gövde daha küçük)

            if (!player.isInvulnerable &&
                player.x + playerPadding < e.x + e.width - eaglePadding &&
                player.x + player.width - playerPadding > e.x + eaglePadding &&
                player.y + playerPadding < e.y + e.height - eaglePadding &&
                player.y + player.height - playerPadding > e.y + eaglePadding
            ) {
                gameOver("Bir kartal tarafından yakalandın!");
                return;
            }
            if (e.x < -200) this.eagles.splice(i, 1);
        }

        // Floating Texts Update
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            let ft = this.floatingTexts[i];
            ft.y += ft.uy * dt;
            ft.life -= dt * 1.5;
            if (ft.life <= 0) this.floatingTexts.splice(i, 1);
        }
    }

    draw(ctx) {
        ctx.save();
        if (this.bgImage && this.bgImage.complete && this.bgImage.naturalWidth !== 0) {
            ctx.drawImage(this.bgImage, this.bgX, 0, WIDTH, HEIGHT);
            ctx.drawImage(this.bgImage, this.bgX + WIDTH, 0, WIDTH, HEIGHT);
        } else {
            const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
            grad.addColorStop(0, "#87CEEB");
            grad.addColorStop(1, "#E0F6FF");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
        }
        ctx.restore();

        if (this.isActive) {
            for (let b of this.birds) b.draw(ctx);
            for (let e of this.eagles) e.draw(ctx);

            ctx.fillStyle = "#333";
            ctx.font = "bold 24px 'Courier Prime'";
            ctx.textAlign = "center";
            ctx.fillText(`AIR: ${Math.ceil(this.timer)}s`, WIDTH / 2, 100);

            // Floating Texts
            ctx.font = "bold 20px 'Courier Prime'";
            for (let ft of this.floatingTexts) {
                ctx.globalAlpha = ft.life;
                ctx.fillStyle = ft.color;
                ctx.fillText(ft.text, ft.x, ft.y);
            }
            ctx.globalAlpha = 1.0;
        }
    }
}

class OceanMode {
    constructor() {
        this.isActive = false;
        this.isExiting = false;
        this.timer = 0;
        this.duration = 10; // 10 seconds
        this.bubbles = [];
        this.fishes = [];
        this.fishSpawnTimer = 0;
        this.sharks = [];
        this.sharkSpawnTimer = 0;

        // Load Background Image
        this.bgImage = new Image();
        this.bgImage.src = 'assets/okyanus.webp';

        // Background Scrolling (Infinite)
        this.bgX = 0;
        this.bgSpeed = 80; // Slow, relaxing drift (pixels per second)
    }

    enter() {
        this.isActive = true;
        this.isExiting = false;
        this.timer = this.duration;
        console.log("Entering Ocean Mode");

        // Activate Player Ocean Physics
        if (player) player.setOceanMode(true);

        // Visual feedback (Fallback color if image fails)
        document.body.style.transition = "background-color 1s";
        document.body.style.backgroundColor = "#001e33"; // Deep blue

        // Spawn initial bubbles
        this.bubbles = [];
        for (let i = 0; i < 30; i++) {
            this.bubbles.push(this.createBubble(true));
        }

        // Spawn 1-2 fish immediately at closer positions for instant action
        this.fishes = [];
        const initialFishCount = Math.floor(Math.random() * 2) + 1; // 1 or 2 fish
        for (let i = 0; i < initialFishCount; i++) {
            // Spawn much closer: ~500px from left edge instead of ~850px
            this.fishes.push(new Fish(WIDTH / 2 + 100 + (i * 150))); // Closer spawn
        }

        // Clear sharks array
        this.sharks = [];
        this.sharkSpawnTimer = 0;
        this.fishSpawnTimer = 0;
    }

    createBubble(randomY = false) {
        return {
            x: Math.random() * WIDTH,
            y: randomY ? Math.random() * HEIGHT : HEIGHT + 10,
            radius: Math.random() * 5 + 2,
            speed: Math.random() * 50 + 20, // Faster bubbles (20-70 px/s)
            wobble: Math.random() * Math.PI * 2
        };
    }

    exit() {
        if (this.isExiting) return; // Prevent multiple exits
        this.isExiting = true;

        this.isActive = false;
        if (player) {
            player.setOceanMode(false);
            // Post-Portal Invulnerability (3 Seconds)
            player.isInvulnerable = true;
            player.invulnerableTimer = 3000;
            if (window.showToast) showToast("GÜVENDE", "3 sn dokunulmazlık", "fa-shield");
        }

        // Switch back explicitly if managed by global
        gameMode = GAME_MODES.NORMAL;
        console.log("Exiting Ocean Mode");

        document.body.style.backgroundColor = "#111"; // Back to dark
    }

    reset() {
        this.isActive = false;
        this.isExiting = false;
        this.timer = this.duration;
        this.bubbles = [];
        this.fishes = [];
        this.fishSpawnTimer = 0;
    }

    update(dt) {
        if (!this.isActive) return;

        this.timer -= dt; // Fix: dt is already in seconds

        // Check if time is up and start exit sequence
        if (this.timer <= 0 && !this.isExiting) {
            this.exit();
            return;
        }


        // Add continuous score increase in Ocean Mode
        const settings = DIFFICULTY_SETTINGS[currentDifficulty];
        score += (1 * settings.scoreMultiplier);
        const sEl = document.getElementById('score-display');
        if (sEl) sEl.innerText = Math.floor(score).toString().padStart(5, '0');

        // --- BACKGROUND SCROLLING ---
        this.bgX -= this.bgSpeed * dt;
        if (this.bgX <= -WIDTH) {
            this.bgX = 0;
        }

        // --- BUBBLES ---
        if (Math.random() < 5 * dt) {
            this.bubbles.push(this.createBubble());
        }

        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            let b = this.bubbles[i];
            b.y -= b.speed * dt; // Speed is px/sec
            b.x += Math.sin(gameTime * 2 + b.wobble) * 20 * dt; // Wobble

            if (b.y < -10) {
                this.bubbles.splice(i, 1);
            }
        }

        // --- FISHES ---
        this.fishSpawnTimer += dt;

        // Spawn every 1.5 - 3.5 seconds (REDUCED FREQUENCY from 1.0-2.5)
        if (this.fishSpawnTimer > Math.random() * 2.0 + 1.5) {
            if (Math.random() < 0.8) { // Slightly higher chance to spawn when timer hits
                this.fishes.push(new Fish(WIDTH + 50));
            }
            this.fishSpawnTimer = 0;
        }

        for (let i = this.fishes.length - 1; i >= 0; i--) {
            let f = this.fishes[i];
            f.update(dt);

            // Collision with Player
            if (
                player.x < f.x + f.width &&
                player.x + player.width > f.x &&
                player.y < f.y + f.height &&
                player.y + player.height > f.y
            ) {
                // COLLECTED
                if (f.type.time > 0 && !this.isExiting) {
                    this.timer += f.type.time;
                    // Visual Feedback
                    if (window.showToast) showToast(`OXYGEN +${f.type.time}s`, "Balık toplandı", "fa-water");
                }
                if (f.type.score > 0) {
                    score += f.type.score;
                    // Visual Feedback
                    if (window.showToast) showToast(`+${f.type.score} PUAN`, "Balık toplandı", "fa-fish");
                }

                // Audio
                if (window.audioManager && audioManager.playCollect) audioManager.playCollect();

                this.fishes.splice(i, 1);
                continue;
            }

            if (f.x < -100) {
                this.fishes.splice(i, 1);
            }
        }

        // --- SHARKS ---
        this.sharkSpawnTimer += dt;

        // Increased Shark Spawn Frequency (Every 2 - 4 seconds)
        if (this.sharkSpawnTimer > Math.random() * 2.0 + 2.0) {
            if (Math.random() < 0.40) { // Increased to 40% probability
                this.sharks.push(new Shark(WIDTH + 80));
            }
            this.sharkSpawnTimer = 0;
        }

        for (let i = this.sharks.length - 1; i >= 0; i--) {
            let s = this.sharks[i];
            s.update(dt);

            // Collision with Player - DEADLY!
            if (player.isInvulnerable) continue;
            if (
                player.x < s.x + s.width &&
                player.x + player.width > s.x &&
                player.y < s.y + s.height &&
                player.y + player.height > s.y
            ) {
                // GAME OVER!
                gameOver("Köpek balığı tarafından yenildin!");
                return;
            }

            if (s.x < -150) {
                this.sharks.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        // CLEAR SCREEN FOR OCEAN MODE
        ctx.save();

        // Draw Background Image if loaded
        if (this.bgImage && this.bgImage.complete && this.bgImage.naturalWidth !== 0) {
            try {
                // Draw looping background (Seamless Scrolling)
                ctx.drawImage(this.bgImage, this.bgX, 0, WIDTH, HEIGHT);
                ctx.drawImage(this.bgImage, this.bgX + WIDTH, 0, WIDTH, HEIGHT);

                // Overlay a semi-transparent blue tint to ensure text/elements pop
                ctx.fillStyle = "rgba(0, 30, 51, 0.3)";
                ctx.fillRect(0, 0, WIDTH, HEIGHT);
            } catch (e) {
                // Fallback if draw fails
                console.error("BG Draw Error", e);
                ctx.fillStyle = "#001e33";
                ctx.fillRect(0, 0, WIDTH, HEIGHT);
            }
        } else {
            // Fallback Gradient
            ctx.fillStyle = "#001e33"; // Deep Ocean Blue
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            // Add Deep Sea Gradient (optional but nice)
            const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
            grad.addColorStop(0, "#001e33"); // Surface
            grad.addColorStop(1, "#000510"); // Deep
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
        }
        ctx.restore();

        if (!this.isActive && this.bubbles.length === 0) return;

        // Draw Bubbles
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; // Increased opacity
        for (let b of this.bubbles) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Fishes
        if (this.isActive) {
            for (let f of this.fishes) {
                f.draw(ctx);
            }
        }

        // Draw Sharks
        if (this.isActive) {
            for (let s of this.sharks) {
                s.draw(ctx);
            }
        }

        // Draw Timer
        if (this.isActive) {
            ctx.fillStyle = "#fff";
            ctx.font = "bold 24px 'Courier Prime'";
            ctx.textAlign = "center";
            ctx.fillText(`OXYGEN: ${Math.ceil(this.timer)}s`, WIDTH / 2, 100);
        }

        ctx.restore();
    }
}

// GLOBALS FOR NEW MODES
let gameMode = GAME_MODES.NORMAL;
let portalManager = new PortalManager();
let oceanMode = new OceanMode();
let atmosferMode = new AtmosferMode();

// Initialize Game
// Initialize Game
function initGame() {
    initEconomy();
    const settings = DIFFICULTY_SETTINGS[currentDifficulty];


    // RESET
    score = 0;
    atomsClaimedThisRun = 0;

    // Phase 1 Reset
    if (portalManager) portalManager.reset();
    if (oceanMode) oceanMode.reset();
    if (atmosferMode) atmosferMode.reset();
    gameMode = GAME_MODES.NORMAL;

    speed = settings.speedStart;
    frames = 0;
    gameTime = 0;
    lastTime = 0;
    shake = 0;

    // Reset Tracking
    obstaclesPassedTimestamps = [];
    maxObstaclesPerSecond = 0;
    obstaclesPassedCount = 0;
    runRevives = 0;
    hasRevivedThisGame = false; // Reset revive flag for new game

    // ACTIVATING POWERUPS logic
    activePowerups = { shield: false, wormhole: false, booster: false };

    // Consume selected loadout items
    if (selectedLoadout.shield && economyData.inventory.shield > 0) {
        economyData.inventory.shield--;
        activePowerups.shield = true;
        economyData.stats.totalShieldsUsed++;
    }
    if (selectedLoadout.wormhole && economyData.inventory.wormhole > 0) {
        economyData.inventory.wormhole--;
        activePowerups.wormhole = true;
        economyData.stats.totalWormholesUsed++;
    }
    if (selectedLoadout.booster && economyData.inventory.booster > 0) {
        economyData.inventory.booster--;
        activePowerups.booster = true;
        economyData.stats.totalBoostersUsed++;
    }

    saveEconomy();
    updateBuffsDisplay();

    // WORMHOLE EFFECT
    if (activePowerups.wormhole) {
        score = 1000;
        speed += 2;
        atomsClaimedThisRun = 0;
    }

    // Intro Message
    const gameMsgEl = document.getElementById('game-message');
    gameMsgEl.innerHTML = `<span class="text-xl font-bold text-white bg-black/70 px-6 py-2 border-l-4 border-white tracking-widest font-mono">DENEY BAŞLIYOR...</span>`;
    gameMsgEl.style.opacity = 1;
    setTimeout(() => { gameMsgEl.style.opacity = 0; }, 2000);

    // Load best score for display
    highScore = 0;
    if (leaderboardData[currentDifficulty].length > 0) {
        highScore = leaderboardData[currentDifficulty][0].score;
    }
    highScoreEl.innerText = "HI: " + String(Math.floor(highScore)).padStart(5, '0');

    // Show lives if any
    if (economyData.extraLives > 0) {
        livesDisplayEl.innerText = "❤️ x " + economyData.extraLives;
        livesDisplayEl.classList.remove('hidden');
    } else {
        livesDisplayEl.classList.add('hidden');
    }

    player.reset();
    player.setPhysics(settings.gravity, settings.jumpForce);
    obstacleManager.reset(window.innerWidth, GROUND_Y);

    backgroundLayers = [];
    // Pass the equipped theme to the BackgroundLayer
    backgroundLayers.push(new BackgroundLayer(0.2, economyData.equippedTheme));
    createRain();

    audioManager.startMusic(economyData.equippedTheme);
    if (!isPlaying) { // Only start loop if not already running (though initGame usually starts it)
        loop(0);
    }
}

function handleAction(action) {
    if (audioManager.ctx && audioManager.ctx.state === 'suspended') {
        audioManager.ctx.resume();
    }

    if (!isPlaying) return;

    if (action === 'jump') {
        if (player.jump()) {
            audioManager.playJump();
            createDust(player.x + 20, player.y + 40);
            leftZone.classList.add('active');
            setTimeout(() => leftZone.classList.remove('active'), 100);
        }
    } else if (action === 'switch') {
        player.switchColor();

        // TRACKING: Color Switches
        economyData.stats.totalColorSwitches++;
        // Check fast clicks (simplistic approach: clicks in last sec)
        if (!inputHandler.clickHistory) inputHandler.clickHistory = [];
        const now = Date.now();
        inputHandler.clickHistory.push(now);
        inputHandler.clickHistory = inputHandler.clickHistory.filter(t => now - t < 1000);
        if (inputHandler.clickHistory.length > (inputHandler.maxCps || 0)) inputHandler.maxCps = inputHandler.clickHistory.length;

        audioManager.playSwitch();
        // shake = 5; // REMOVED: User didn't like the shake
        let flashColor = player.color === 'white' ? '#222' : '#333';
        document.body.style.backgroundColor = flashColor;
        setTimeout(() => document.body.style.backgroundColor = '#000', 50);
        rightZone.classList.add('active');
        setTimeout(() => rightZone.classList.remove('active'), 100);
    }
}

function updateComboUI() {
    // REMOVED
}

function createRain() {
    rainDrops = []; // Reset array

    // Sadece Viyana temasında yağmur yağsın
    if (economyData.equippedTheme !== 'CITY') return;

    const isMobile = window.innerWidth < 768;
    const dropCount = isMobile ? 30 : 80; // Mobilde daha az yağmur

    for (let i = 0; i < dropCount; i++) {
        rainDrops.push({
            x: Math.random() * WIDTH,
            y: Math.random() * HEIGHT,
            l: Math.random() * 20 + 10,
            v: Math.random() * 10 + 15
        });
    }
}

function updateRain(dt) {
    for (let p of rainDrops) {
        p.y += p.v * 60 * dt;
        p.x -= (speed * 0.5) * 60 * dt;
        if (p.y > HEIGHT) {
            p.y = -20;
            p.x = Math.random() * WIDTH + (speed * 20);
        }
    }
}

function createDust(x, y) {
    const isMobile = window.innerWidth < 768;
    const count = isMobile ? 2 : 5; // Mobilde daha az toz

    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random()) * -2,
            life: 1.0,
            size: Math.random() * 4 + 2,
            color: '#888'
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * 60 * dt;
        p.y += p.vy * 60 * dt;
        p.life -= 0.05 * 60 * dt;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function switchGameMode(newMode) {
    if (gameMode === newMode) return;

    console.log(`Switching Mode: ${gameMode} -> ${newMode}`);

    // Exit current logic
    if (gameMode === GAME_MODES.OCEAN && oceanMode) {
        oceanMode.exit();
    }
    if (gameMode === GAME_MODES.ATMOSPHERE && atmosferMode) {
        atmosferMode.exit();
    }

    gameMode = newMode;

    // Enter new logic
    if (gameMode === GAME_MODES.OCEAN && oceanMode) {
        oceanMode.enter();
    }
    if (gameMode === GAME_MODES.ATMOSPHERE && atmosferMode) {
        atmosferMode.enter();
    }
}

function update(dt) {
    if (!isPlaying) return;
    frames++;
    gameTime += dt;

    // --- OCEAN/ATMOSPHERE MODE UPDATE ---
    if (gameMode === GAME_MODES.OCEAN) {
        if (oceanMode) oceanMode.update(dt);
        player.update(GROUND_Y, dt);
        return;
    }
    if (gameMode === GAME_MODES.ATMOSPHERE) {
        if (atmosferMode) atmosferMode.update(dt);
        player.update(GROUND_Y, dt);
        return;
    }

    // --- PORTAL UPDATE ---
    if (portalManager) {
        portalManager.update(dt, speed);
        const portalMode = portalManager.checkCollision(player);
        if (portalMode) {
            portalManager.portals = [];
            switchGameMode(portalMode);
            return;
        }
    }

    if (shake > 0) {
        shake -= 15 * dt;
        if (shake < 0) shake = 0;
    }

    const settings = DIFFICULTY_SETTINGS[currentDifficulty];

    if (frames % settings.accelInterval === 0 && speed < settings.speedMax) {
        speed += 1;
        showMessage("HIZLANIYOR...");
    }

    score += (1 * settings.scoreMultiplier);
    scoreEl.innerText = Math.floor(score).toString().padStart(5, '0');

    // MILESTONE CHECKS
    if (score >= 1000) unlockAchievement('FIRST_MILESTONE');
    if (score >= 5000) unlockAchievement('QUANTUM_LEAP');

    player.update(GROUND_Y, dt);
    backgroundLayers.forEach(layer => layer.update(speed, dt));
    obstacleManager.update(speed, WIDTH, GROUND_Y, dt);
    updateParticles(dt);
    updateRain(dt);

    const collision = obstacleManager.checkCollision(player);
    if (collision) {
        if (collision.type === 'obstacle' || collision.type === 'ground') {
            gameOver(collision.reason);
        }
    }
}

// setDifficulty logic moved to window assignment below


function draw() {
    ctx.save();
    if (shake > 0) {
        const dx = (Math.random() - 0.5) * shake;
        const dy = (Math.random() - 0.5) * shake;
        ctx.translate(dx, dy);
    }

    // --- OCEAN MODE DRAW ---
    if (gameMode === GAME_MODES.OCEAN) {
        if (oceanMode) oceanMode.draw(ctx, WIDTH, HEIGHT);
        player.draw(ctx, frames, playerName, gameTime);
        ctx.restore();
        return;
    }

    // --- ATMOSPHERE MODE DRAW ---
    if (gameMode === GAME_MODES.ATMOSPHERE) {
        if (atmosferMode) atmosferMode.draw(ctx);
        player.draw(ctx, frames, playerName, gameTime);
        ctx.restore();
        return;
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    backgroundLayers.forEach(layer => layer.draw(ctx, WIDTH, HEIGHT, GROUND_Y));

    // Draw Portals
    if (portalManager) portalManager.draw(ctx);

    ctx.beginPath();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(WIDTH, GROUND_Y);
    ctx.stroke();

    obstacleManager.draw(ctx, HEIGHT, GROUND_Y);
    player.draw(ctx, frames, playerName, gameTime);

    for (let p of particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.globalAlpha = 1.0;
    }

    ctx.strokeStyle = 'rgba(150, 150, 150, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let p of rainDrops) {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 2, p.y + p.l);
    }
    ctx.stroke();

    ctx.restore();
}

// FPS CONTROL
let lastFrameTime = 0;
const targetFPS = 60;
const frameInterval = 1000 / targetFPS;

function loop(timeStamp) {
    if (!isPlaying) return;

    requestAnimationFrame(loop);

    // Throttle FPS to targetFPS (60)
    const elapsed = timeStamp - lastFrameTime;
    if (elapsed < frameInterval) return;

    // Adjust for stable rhythm
    lastFrameTime = timeStamp - (elapsed % frameInterval);

    // Pause if in Portrait Mode
    if (window.innerHeight > window.innerWidth) {
        lastTime = timeStamp;
        return;
    }

    if (!lastTime) lastTime = timeStamp;
    const deltaTimeMs = timeStamp - lastTime;
    // Prevent huge delta jumps (max 100ms)
    const safeDelta = Math.min(deltaTimeMs, 100);

    lastTime = timeStamp; // Reset for next valid frame

    const dt = safeDelta / 1000; // Convert to seconds
    update(dt);
    draw();
}

function showMessage(msg) {
    gameMsgEl.querySelector('span').innerText = msg;
    gameMsgEl.style.opacity = 1;
    setTimeout(() => gameMsgEl.style.opacity = 0, 1500);
}

function gameOver(reason) {
    try {
        isPlaying = false;
        if (audioManager && typeof audioManager.playGameOver === 'function') {
            audioManager.playGameOver();
        }

        // Update Stats
        if (!economyData.stats) economyData.stats = { totalGames: 0, totalDeaths: 0, totalScore: 0 };
        economyData.stats.totalGames++;
        economyData.stats.totalDeaths++;

        // CAREER & SESSION STATS
        economyData.stats.totalScore += score;
        economyData.stats.totalTimePlayed += gameTime; // seconds

        // Max Speed Track
        // speed is current max speed of this run roughly

        // Consecutive Days Logic (Consolidated)
        checkDailyLogin();

        saveEconomy();

        // Achievement Checks (Post-Game)
        // if (economyData.stats.totalDeaths === 1) unlockAchievement('FIRST_COLLAPSE'); // Old system support

        deathReasonEl.innerHTML = reason;
        const finalScoreVal = Math.floor(score);
        finalScoreEl.innerText = finalScoreVal.toString().padStart(5, '0');

        // Calculate and Save Atoms (Incremental Fix + Booster)
        const totalAtomsForRun = Math.floor(finalScoreVal / 10);

        let newAtoms = Math.max(0, totalAtomsForRun - atomsClaimedThisRun);

        // APPLY BOOSTER MULTIPLIER to the NEWLY earned atoms
        if (activePowerups.booster) {
            newAtoms *= 2;
        }

        if (newAtoms > 0) {
            economyData.atoms += newAtoms;
            economyData.stats.totalAtomsEarned += newAtoms;
            atomsClaimedThisRun = totalAtomsForRun;

            saveEconomy();
        }

        // UI shows earned THIS DEATH segment usually? Or total?
        // Let's show just "KAZANILAN: X"
        earnedAtomsEl.innerText = newAtoms;
        if (activePowerups.booster) {
            earnedAtomsEl.innerHTML += " <span class='text-yellow-400 font-bold'>(2x)</span>";
        }

        // Save to Leaderboard
        saveScoreToLeaderboard(finalScoreVal);

        // Check Badges
        checkBadges(finalScoreVal, economyData.equippedTheme);

        if (finalScoreVal > highScore) {
            highScore = finalScoreVal;
            highScoreEl.innerText = "HI: " + String(highScore).padStart(5, '0');
        }

        // Revive Logic - Only allow ONE revive per game
        if (economyData.extraLives > 0 && !hasRevivedThisGame) {
            btnRevive.innerText = `HAYATA DÖN (${economyData.extraLives} ❤️)`;
            btnRevive.classList.remove('hidden');
        } else {
            btnRevive.classList.add('hidden');
        }

        gameOverScreen.classList.remove('hidden');
    } catch (err) {
        console.error("GAMEOVER ERROR:", err);
        alert("Oyun sonu hatası oluştu: " + err.message);
        // Force show screen anyway
        if (gameOverScreen) gameOverScreen.classList.remove('hidden');
    }
}

function revivePlayer() {
    if (economyData.extraLives > 0) {
        economyData.extraLives--;

        // TRACKING
        if (!economyData.stats.totalRevives) economyData.stats.totalRevives = 0;
        economyData.stats.totalRevives++;
        runRevives++;
        hasRevivedThisGame = true; // Mark that player has used their one revive for this game

        livesDisplayEl.innerText = "❤️ x " + economyData.extraLives;
        if (economyData.extraLives === 0) livesDisplayEl.classList.add('hidden');
        saveEconomy();

        // Resume Game
        gameOverScreen.classList.add('hidden');
        isPlaying = true;
        lastTime = 0;

        // Give invulnerability
        player.isInvulnerable = true;
        player.invulnerableTimer = 3000; // 3 seconds

        // Lift player slightly to avoid immediate ground collision issues if sunk
        player.y = Math.min(player.y, GROUND_Y - player.height - 10);
        player.dy = 0;

        // Müziği Yeniden Başlat
        audioManager.startMusic(economyData.equippedTheme);

        requestAnimationFrame(loop);
    }
}

function drawStatic() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Show best of current difficulty
    let best = 0;
    if (leaderboardData[currentDifficulty] && leaderboardData[currentDifficulty].length > 0) {
        best = leaderboardData[currentDifficulty][0].score;
    }
    highScoreEl.innerText = "HI: " + Math.floor(best).toString().padStart(5, '0');

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 50; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * WIDTH, Math.random() * HEIGHT, Math.random() * 1, 0, Math.PI * 2);
        ctx.fill();
    }
}

function saveData() {
    // Deprecated func kept for safety, but real save hooks are in setScore
    localStorage.setItem('schrodinger_leaderboard', JSON.stringify(leaderboardData));
}

function saveEconomy() {
    localStorage.setItem('schrodinger_economy_v3', JSON.stringify(economyData));
}

function checkDailyLogin() {
    const today = new Date().toISOString().split('T')[0];
    const lastLogin = economyData.stats.lastLoginDate;

    if (lastLogin !== today) {
        if (lastLogin) {
            const d1 = new Date(today);
            // Handle potential Date string format differences
            const d2 = new Date(lastLogin);

            // Reset hours to compare dates only
            d1.setHours(0, 0, 0, 0);
            d2.setHours(0, 0, 0, 0);

            const diffTime = Math.abs(d1 - d2);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                economyData.stats.consecutiveDays++;
            } else {
                economyData.stats.consecutiveDays = 1;
            }
        } else {
            economyData.stats.consecutiveDays = 1;
        }
        economyData.stats.lastLoginDate = today;
        saveEconomy();
    }
}

function saveScoreToLeaderboard(newScore) {
    const list = leaderboardData[currentDifficulty];
    list.push({
        name: playerNameInput.value || "KEDI",
        score: newScore,
        date: new Date().toLocaleDateString()
    });

    // Sort Descending
    list.sort((a, b) => b.score - a.score);

    // Keep Top 5
    leaderboardData[currentDifficulty] = list.slice(0, 5);

    saveData();
}

// WAKE LOCK LOGIC (Step 12)
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock is active!');
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock was released');
            });
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

// Re-request lock on visibility change
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

window.startGame = () => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    requestWakeLock(); // Prevent Screen Sleep

    audioManager.init();

    playerName = playerNameInput.value || "KEDI";

    // TRACK PLAYED THEMES
    const currentTheme = economyData.equippedTheme;
    if (!economyData.stats.playedThemes) economyData.stats.playedThemes = [];
    if (!economyData.stats.playedThemes.includes(currentTheme)) {
        economyData.stats.playedThemes.push(currentTheme);
        saveEconomy();
    }

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    scoreboardScreen.classList.add('hidden');
    storyScreen.classList.add('hidden');
    shopScreen.classList.add('hidden');
    isPlaying = true;
    lastTime = 0;
    initGame();
    requestAnimationFrame(loop);
};

window.setDifficulty = (diff) => {
    currentDifficulty = diff;
    document.querySelectorAll('.btn-difficulty').forEach(btn => {
        btn.classList.remove('active');
        // Check correct button by onclick attribute to avoid text issues
        if (btn.getAttribute('onclick').includes(`'${diff}'`)) {
            btn.classList.add('active');
        }
    });
    drawStatic(); // Hangi zorluktaysak onun high score'unu göster
    if (window.audioManager) window.audioManager.playMenuClick();
};

window.resetGame = () => { window.startGame(); };
let currentStoryPage = 1;
const totalStoryPages = 5;

window.openStory = () => {
    economyData.stats.visitedStory = true;
    startScreen.classList.add('hidden');
    storyScreen.classList.remove('hidden');
    currentStoryPage = 1;
    updateStoryDisplay();
};

window.changeStoryPage = (dir) => {
    currentStoryPage += dir;
    if (currentStoryPage < 1) currentStoryPage = 1;
    if (currentStoryPage > totalStoryPages) currentStoryPage = totalStoryPages;
    updateStoryDisplay();
};

window.updateStoryDisplay = () => {
    for (let i = 1; i <= totalStoryPages; i++) {
        const el = document.getElementById(`scene-${i}`);
        if (el) el.classList.remove('active');
    }
    const activeEl = document.getElementById(`scene-${currentStoryPage}`);
    if (activeEl) activeEl.classList.add('active');

    // Prev Button
    const prevBtn = document.getElementById('btn-prev-story');
    if (prevBtn) {
        prevBtn.disabled = (currentStoryPage === 1);
        prevBtn.style.opacity = (currentStoryPage === 1) ? 0.3 : 1;
    }

    // Next Button logic
    const nextBtn = document.getElementById('btn-next-story');
    if (nextBtn) {
        if (currentStoryPage === totalStoryPages) {
            nextBtn.innerText = "OYUNA DÖN";
            nextBtn.onclick = closeStory;
            nextBtn.classList.add('btn-secondary'); // Make it look different
        } else {
            nextBtn.innerText = "İLERİ";
            nextBtn.onclick = () => changeStoryPage(1);
            nextBtn.classList.remove('btn-secondary');
        }
    }

    const indicator = document.getElementById('story-page-num');
    if (indicator) indicator.innerText = `${currentStoryPage} / ${totalStoryPages}`;
};

window.closeStory = () => {
    storyScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
};

window.openScoreboard = () => {
    economyData.stats.visitedScores = true;
    startScreen.classList.add('hidden');
    scoreboardScreen.classList.remove('hidden');
    showLeaderboardTab(currentDifficulty);
};

window.closeScoreboard = () => {
    scoreboardScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
};

window.showLeaderboardTab = (diff) => {
    // Tab Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const tabBtn = document.getElementById('tab-' + diff);
    if (tabBtn) tabBtn.classList.add('active');

    // List Content
    const container = document.getElementById('leaderboard-list');
    if (container) {
        container.innerHTML = "";
        const scores = leaderboardData[diff] || [];
        if (scores.length === 0) {
            container.innerHTML = "<div class='text-center text-gray-500 font-mono mt-10'>HENÜZ VERİ YOK</div>";
        } else {
            scores.forEach((item, index) => {
                const row = document.createElement('div');
                row.className = 'score-row';
                row.innerHTML = `
                        <span>${index + 1}. ${item.name}</span>
                        <span>${Math.floor(item.score).toString().padStart(5, '0')}</span>
                    `;
                container.appendChild(row);
            });
        }
    }
};

window.openShop = () => {
    economyData.stats.visitedShop = true;
    startScreen.classList.add('hidden');
    shopScreen.classList.remove('hidden');
    updateShopUI();
};
window.closeShop = () => {
    shopScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
};

window.updateShopUI = () => {
    if (atomDisplayEl) atomDisplayEl.innerText = economyData.atoms;

    // Update Buttons
    if (btnBuyLife) btnBuyLife.disabled = economyData.atoms < 500;
    if (btnBuyShield) btnBuyShield.disabled = economyData.atoms < 1000;
    if (btnBuyWorm) btnBuyWorm.disabled = economyData.atoms < 300;
    if (btnBuyBoost) btnBuyBoost.disabled = economyData.atoms < 200;

    // Update Stocks
    if (stockLifeEl) stockLifeEl.innerText = economyData.extraLives;
    if (stockShieldEl) stockShieldEl.innerText = economyData.inventory.shield;
    if (stockWormEl) stockWormEl.innerText = economyData.inventory.wormhole;
    if (stockBoostEl) stockBoostEl.innerText = economyData.inventory.booster;

    // Render Themes
    const themesList = document.getElementById('themes-list');
    if (themesList) {
        themesList.innerHTML = "";
        Object.keys(THEMES).forEach(key => {
            const theme = THEMES[key];
            const isOwned = economyData.ownedThemes.includes(key);
            const isEquipped = economyData.equippedTheme === key;

            const item = document.createElement('div');
            item.className = "shop-item";
            if (isEquipped) item.style.borderColor = theme.color;

            let btnHtml = "";
            if (isEquipped) {
                btnHtml = `<button class="btn-secondary" style="color:${theme.color}; border-color:${theme.color}" disabled>SEÇİLDİ</button>`;
            } else if (isOwned) {
                btnHtml = `<button class="btn-secondary" onclick="equipTheme('${key}')">SEÇ</button>`;
            } else {
                btnHtml = `<button class="buy-btn" onclick="buyTheme('${key}')" style="color:${theme.color}">${theme.cost} ⚛</button>`;
            }

            const iconHtml = theme.img ?
                `<img src="${getAssetPath(theme.img)}" class="shop-icon-img" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 2px solid #333;">` :
                `<div class="item-icon" style="color:${theme.color};"><i class="fa-solid ${theme.icon}"></i></div>`;

            item.innerHTML = `
                            <div class="mb-4">${iconHtml}</div>
                            <div class="item-info">
                                <div class="item-title" style="color:${theme.color}">${theme.name}</div>
                                <div class="item-desc">${theme.desc}</div>
                            </div>
                            ${btnHtml}
                        `;
            themesList.appendChild(item);
        });
    }
    updateMenuBackground();

    // Render Cosmetics
    const cosList = document.getElementById('cosmetics-list');
    if (cosList) {
        cosList.innerHTML = "";
        ['hat', 'glasses', 'toy', 'bowl'].forEach(category => {
            const sectionTitle = { hat: 'Şapkalar', glasses: 'Gözlükler', toy: 'Oyuncaklar', bowl: 'Kaplar' }[category];
            const sectionHeader = document.createElement('h3');
            sectionHeader.style.gridColumn = "1 / -1";
            sectionHeader.style.color = "#fff";
            sectionHeader.style.marginTop = "20px";
            sectionHeader.innerText = sectionTitle;
            cosList.appendChild(sectionHeader);

            Object.keys(COSMETICS[category]).forEach(key => {
                const itemData = COSMETICS[category][key];
                const isOwned = economyData.ownedCosmetics.includes(key);
                const isEquipped = economyData.equippedCosmetics[category] === key;

                const item = document.createElement('div');
                item.className = "shop-item";
                if (isEquipped) item.style.borderColor = "#39FF14";

                let btnHtml = "";
                if (isEquipped) {
                    btnHtml = `<button class="btn-secondary" style="color:#39FF14; border-color:#39FF14" onclick="window.toggleCosmetic('${category}', 'none')">ÇIKAR</button>`;
                } else if (isOwned) {
                    btnHtml = `<button class="btn-secondary" onclick="window.toggleCosmetic('${category}', '${key}')">KUŞAN</button>`;
                } else {
                    btnHtml = `<button class="buy-btn" onclick="window.buyCosmetic('${category}', '${key}')">${itemData.cost} ⚛</button>`;
                }

                item.innerHTML = `
                            <div class="mb-4">
                                <div class="item-icon">${itemData.icon}</div>
                            </div>
                            <div class="item-info">
                                <div class="item-title">${itemData.name}</div>
                            </div>
                            ${btnHtml}
                        `;
                cosList.appendChild(item);
            });
        });
    }
};

window.updateMenuBackground = () => {
    const bgLayer = document.getElementById('menu-background-layer');
    if (!bgLayer) return;

    const t = economyData.equippedTheme;
    let bgUrl = 'assets/Noir_plan.webp'; // Default

    if (THEMES[t] && THEMES[t].bgImg) {
        bgUrl = THEMES[t].bgImg;
    }

    bgLayer.style.backgroundImage = `url('${getAssetPath(bgUrl)}')`;
};

window.updateBuffsDisplay = () => {
    if (!activeBuffsEl) return;
    activeBuffsEl.innerHTML = "";
    if (activePowerups.shield) activeBuffsEl.innerHTML += "<div class='buff-icon buff-shield'>SHIELD</div>";
    if (activePowerups.wormhole) activeBuffsEl.innerHTML += "<div class='buff-icon buff-worm'>WARP</div>";
    if (activePowerups.booster) activeBuffsEl.innerHTML += "<div class='buff-icon buff-booster'>2X</div>";
};

window.buyTheme = (themeKey) => {
    const theme = THEMES[themeKey];
    if (!theme) return;

    if (economyData.atoms >= theme.cost) {
        if (!economyData.ownedThemes.includes(themeKey)) {
            economyData.atoms -= theme.cost;
            economyData.ownedThemes.push(themeKey);
            economyData.stats.totalItemsBought++;
            economyData.stats.totalAtomsSpent += theme.cost;
            saveEconomy();
            updateShopUI();
            checkPassiveBadges(); // Hook
        }
    } else {
        alert("Yetersiz Atom!");
    }
};

window.equipTheme = (themeKey) => {
    if (economyData.ownedThemes.includes(themeKey)) {
        economyData.equippedTheme = themeKey;
        saveEconomy();
        updateShopUI();
        checkPassiveBadges(); // Check theme collector etc
    }
};

window.buyItem = (itemType) => {

    let cost = 0;
    if (itemType === 'LIFE') cost = 500;
    if (itemType === 'SHIELD') cost = 1000;
    if (itemType === 'WORMHOLE') cost = 300;
    if (itemType === 'BOOSTER') cost = 200;

    if (economyData.atoms >= cost) {
        economyData.atoms -= cost;
        economyData.stats.totalItemsBought++;
        economyData.stats.totalAtomsSpent += cost;

        if (itemType === 'LIFE') { economyData.extraLives++; economyData.boughtLife = true; }
        if (itemType === 'SHIELD') { economyData.inventory.shield++; economyData.boughtShield = true; }
        if (itemType === 'WORMHOLE') { economyData.inventory.wormhole++; economyData.boughtWormhole = true; }
        if (itemType === 'BOOSTER') { economyData.inventory.booster++; economyData.boughtBooster = true; }

        saveEconomy();
        // Recalculate UI
        updateShopUI();
        updateLoadoutUI(); // FIX: Update main menu loadout counts
        checkPassiveBadges(); // Check shopaholic etc

        // Show floating text instead of alert for better UX
        const btn = document.getElementById(
            itemType === 'LIFE' ? 'btn-buy-life' :
                itemType === 'SHIELD' ? 'btn-buy-shield' :
                    itemType === 'WORMHOLE' ? 'btn-buy-wormhole' : 'btn-buy-booster'
        );
        if (btn) {
            const originalText = btn.innerText;
            btn.innerText = "ALINDI!";
            btn.style.borderColor = "#39FF14";
            btn.style.color = "#39FF14";
            setTimeout(() => {
                updateShopUI(); // Reset text via UI update (since it reads cost mostly, actually buttons had hardcoded cost text in HTML, updateShopUI disables them but doesn't set text)
                // Wait, updateShopUI doesn't reset text. We need to restore original.
                btn.innerText = originalText;
                btn.style.borderColor = "";
                btn.style.color = "";
            }, 1000);
        }
    } else {
        // Shake effect on the item? Or just alert.
        // Alert is reliable for "Not Enough"
        alert("Yetersiz Atom! Daha fazla oyna.");
    }
};

window.buyCosmetic = (category, key) => {
    const item = COSMETICS[category][key];
    if (!item) return;

    if (economyData.atoms >= item.cost) {
        if (!economyData.ownedCosmetics.includes(key)) {
            economyData.atoms -= item.cost;
            economyData.ownedCosmetics.push(key);
            economyData.stats.totalItemsBought++;
            economyData.stats.totalAtomsSpent += item.cost;
            saveEconomy();
            updateShopUI();
            showToast("YENİ EŞYA!", `${item.name} artık senin!`, "fa-gift");
            checkPassiveBadges();
        }
    } else {
        alert("Yetersiz Atom!");
    }
};

window.toggleCosmetic = (type, key) => {
    // type: 'hat', 'glasses', 'toy', 'bowl'
    // key: item key or 'none'
    if (key === 'none' || economyData.ownedCosmetics.includes(key)) {
        economyData.equippedCosmetics[type] = key;
        saveEconomy();
        updateShopUI();
        if (petSystem) petSystem.lastInteraction = Date.now(); // Trigger update for pet display
    }
};

// Duplicate showLeaderboardTab removed. The active definition is around line 4814.


window.showMenu = () => {
    document.body.style.overflow = 'hidden'; // Ensure locked even in menu
    document.body.style.position = 'fixed'; // Keep fixed

    gameOverScreen.classList.add('hidden');
    storyScreen.classList.add('hidden');
    scoreboardScreen.classList.add('hidden');
    shopScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    isPlaying = false;
    drawStatic();
};

// RESTORED OPTIMIZATION: Ensure Landscape & High-DPI Scaling (Step 1 & 2)
let scaleRatio = 1;
function resizeCanvas() {
    const targetWidth = window.innerWidth;
    const targetHeight = window.innerHeight;

    // Performance limiting for High-DPI screens
    const MAX_WIDTH = 1920;

    if (targetWidth > MAX_WIDTH) {
        scaleRatio = MAX_WIDTH / targetWidth;
        canvas.width = MAX_WIDTH;
        canvas.height = targetHeight * scaleRatio;
    } else {
        scaleRatio = 1;
        canvas.width = targetWidth; // Default to full width
        canvas.height = targetHeight;
    }

    // CSS always fills screen
    canvas.style.width = targetWidth + 'px';
    canvas.style.height = targetHeight + 'px';

    if (ctx) ctx.scale(scaleRatio, scaleRatio);

    // Update Global Logic Vars
    WIDTH = targetWidth;
    HEIGHT = targetHeight;
    GROUND_Y = HEIGHT - 100;

    if (typeof player !== 'undefined' && player) player.y = Math.min(player.y, GROUND_Y - player.height);
    if (typeof inputHandler !== 'undefined' && inputHandler) inputHandler.updateWidth(WIDTH);
    if (typeof backgroundLayers !== 'undefined' && backgroundLayers) backgroundLayers.forEach(l => l.width = WIDTH);
    if (!isPlaying) drawStatic();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Trigger immediately
drawStatic();

// UI SOUND INTEGRATION
// Attach 'tok' sound to all buttons and interactive elements
document.addEventListener('DOMContentLoaded', () => {
    const interactiveElements = document.querySelectorAll('button, .shop-item, .loadout-item, .btn, .btn-secondary, .buy-btn');

    interactiveElements.forEach(el => {
        el.addEventListener('mousedown', () => audioManager.playMenuClick());
        // For mobile touches
        el.addEventListener('touchstart', (e) => {
            // Prevent double firing if both exist, but simple call is fine usually
            audioManager.playMenuClick();
        }, { passive: true });
    });

    // Dynamic elements observer might be needed, but for now this catches initial static UI.
    // Since shop draws dynamically, we inject via click delegation for safety:
    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('button, .shop-item, .loadout-item');
        if (target) {
            audioManager.playMenuClick();
        }
    });
});
// Initialize Pet
petSystem = new InteractivePet('pet-canvas');
