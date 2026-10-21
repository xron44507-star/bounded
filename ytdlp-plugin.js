const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { ExtractorPlugin, Song, Playlist, DisTubeError } = require('distube');

// Locate or download yt-dlp binary
function getYtDlpPath() {
    if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
        return process.env.YTDLP_PATH;
    }

    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'yt-dlp.exe' : 'yt-dlp';

    // 1. Check local node_modules/@distube/yt-dlp/bin
    const localBin = path.join(__dirname, 'node_modules', '@distube', 'yt-dlp', 'bin', binaryName);
    if (fs.existsSync(localBin)) {
        if (!isWin) {
            try { fs.chmodSync(localBin, 0o755); } catch (_) {}
        }
        return localBin;
    }

    // 2. Check local ./bin/yt-dlp
    const projectBin = path.join(__dirname, 'bin', binaryName);
    if (fs.existsSync(projectBin)) {
        if (!isWin) {
            try { fs.chmodSync(projectBin, 0o755); } catch (_) {}
        }
        return projectBin;
    }

    // 3. Check system PATH locations (Nixpacks / Railway / Linux)
    const systemPaths = [
        '/root/.nix-profile/bin/yt-dlp',
        '/usr/bin/yt-dlp',
        '/usr/local/bin/yt-dlp',
        '/nix/var/nix/profiles/default/bin/yt-dlp'
    ];
    for (const p of systemPaths) {
        if (fs.existsSync(p)) return p;
    }

    // 4. Default executable in PATH
    return binaryName;
}

// Execute yt-dlp and safely parse JSON from stdout (isolating stderr to prevent syntax errors)
function runYtDlpJson(targetUrl, extraArgs = []) {
    return new Promise((resolve, reject) => {
        const bin = getYtDlpPath();
        const defaultArgs = [
            targetUrl,
            '--dump-single-json',
            '--no-warnings',
            '--skip-download',
            '--simulate',
            '--extractor-args', 'youtube:player_client=android,ios,web',
            ...extraArgs
        ];

        const proc = spawn(bin, defaultArgs);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', chunk => { stdout += chunk; });
        proc.stderr.on('data', chunk => { stderr += chunk; });

        proc.on('close', code => {
            if (code === 0 && stdout.trim()) {
                try {
                    const start = stdout.indexOf('{');
                    const end = stdout.lastIndexOf('}');
                    if (start !== -1 && end !== -1) {
                        return resolve(JSON.parse(stdout.slice(start, end + 1)));
                    }
                    return resolve(JSON.parse(stdout.trim()));
                } catch (err) {
                    return reject(new Error(`Failed to parse yt-dlp metadata: ${err.message}`));
                }
            }
            reject(new Error(stderr.trim() || `yt-dlp failed with exit code ${code}`));
        });

        proc.on('error', err => reject(err));
    });
}

// Extract direct streaming audio URL
function extractAudioStreamUrl(targetUrl) {
    return new Promise((resolve, reject) => {
        const bin = getYtDlpPath();
        const args = [
            '-g',
            '-f', 'ba/ba*',
            '--no-warnings',
            '--extractor-args', 'youtube:player_client=android,ios,web',
            targetUrl
        ];

        const proc = spawn(bin, args);
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', chunk => { stdout += chunk; });
        proc.stderr.on('data', chunk => { stderr += chunk; });

        proc.on('close', code => {
            if (code === 0 && stdout.trim()) {
                const streamUrl = stdout.trim().split(/\r?\n/).filter(Boolean)[0];
                if (streamUrl) return resolve(streamUrl);
            }
            reject(new Error(stderr.trim() || `Audio stream extraction failed with code ${code}`));
        });

        proc.on('error', err => reject(err));
    });
}

class RobustYtDlpPlugin extends ExtractorPlugin {
    constructor() {
        super();
    }

    validate(url) {
        return typeof url === 'string' && url.trim().length > 0;
    }

    async resolve(url, options = {}) {
        const cleanQuery = url.trim();
        const isDirectUrl = /^https?:\/\//i.test(cleanQuery);
        const searchTarget = isDirectUrl ? cleanQuery : `ytsearch1:${cleanQuery}`;

        const info = await runYtDlpJson(searchTarget);

        // 1. Search Query Result (entries array with 1 item)
        if (!isDirectUrl && Array.isArray(info.entries) && info.entries.length > 0) {
            const entry = info.entries[0];
            return new Song({
                plugin: this,
                source: 'youtube',
                playFromSource: true,
                id: entry.id,
                name: entry.title || entry.fulltitle || cleanQuery,
                url: entry.webpage_url || entry.original_url || `https://www.youtube.com/watch?v=${entry.id}`,
                thumbnail: entry.thumbnail || (entry.thumbnails && entry.thumbnails[0]?.url),
                duration: entry.duration || 0,
                isLive: !!entry.is_live,
                uploader: {
                    name: entry.uploader || entry.channel || 'YouTube Artist',
                    url: entry.uploader_url || entry.channel_url
                },
                views: entry.view_count || 0,
                likes: entry.like_count || 0
            }, options);
        }

        // 2. YouTube / External Playlist URL
        if (info._type === 'playlist' || (Array.isArray(info.entries) && info.entries.length > 1)) {
            const validEntries = (info.entries || []).filter(Boolean);
            if (validEntries.length === 0) {
                throw new DisTubeError('YTDLP_EMPTY_PLAYLIST', 'The requested playlist is empty.');
            }
            return new Playlist({
                source: info.extractor || 'youtube',
                songs: validEntries.map(e => new Song({
                    plugin: this,
                    source: info.extractor || 'youtube',
                    playFromSource: true,
                    id: e.id,
                    name: e.title || e.fulltitle,
                    url: e.webpage_url || `https://www.youtube.com/watch?v=${e.id}`,
                    thumbnail: e.thumbnail || (e.thumbnails && e.thumbnails[0]?.url),
                    duration: e.duration || 0,
                    uploader: { name: e.uploader || e.channel }
                }, options)),
                id: info.id?.toString(),
                name: info.title || 'Queued Playlist',
                url: info.webpage_url || cleanQuery,
                thumbnail: info.thumbnails?.[0]?.url || info.thumbnail
            }, options);
        }

        // 3. Single Direct Track URL
        return new Song({
            plugin: this,
            source: info.extractor || 'youtube',
            playFromSource: true,
            id: info.id,
            name: info.title || info.fulltitle,
            url: info.webpage_url || info.original_url || cleanQuery,
            thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails[0]?.url),
            duration: info.duration || 0,
            isLive: !!info.is_live,
            uploader: {
                name: info.uploader || info.channel || 'Artist',
                url: info.uploader_url || info.channel_url
            },
            views: info.view_count || 0,
            likes: info.like_count || 0
        }, options);
    }

    async getStreamURL(song) {
        if (!song || !song.url) {
            throw new DisTubeError('INVALID_SONG', 'Cannot extract stream URL from invalid song object.');
        }
        return await extractAudioStreamUrl(song.url);
    }

    getRelatedSongs() {
        return [];
    }
}

module.exports = {
    RobustYtDlpPlugin,
    getYtDlpPath,
    runYtDlpJson,
    extractAudioStreamUrl
};
