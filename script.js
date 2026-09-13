let term;
let fitAddon;
let socket = null;
const encoder = new TextEncoder();

// Initialize xterm.js Terminal Instance
function initTerminal() {
    term = new Terminal({
        cursorBlink: true,
        fontFamily: "'Fira Code', monospace",
        fontSize: 14,
        theme: {
            background: '#0d1117',
            foreground: '#e2e8f0',
            cursor: '#00ffaa',
            selectionBackground: '#21262d',
            black: '#0d1117',
            red: '#ff5555',
            green: '#50fa7b',
            yellow: '#f1fa8c',
            blue: '#bd93f9',
            magenta: '#ff79c6',
            cyan: '#8be9fd',
            white: '#bfbfbf'
        }
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon.WebLinksAddon());

    term.open(document.getElementById('terminal'));
    fitAddon.fit();

    term.writeln('\x1b[1;32m=== TERMUX CLOUDFLARE BRIDGE ===\x1b[0m');
    term.writeln('Click "Connect Live Shell" to decrypt your tunnel link and connect.\r\n');

    // Send keystrokes to ttyd using binary format with command prefix '0'
    term.onData(data => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            const payload = new Uint8Array(data.length + 1);
            payload[0] = '0'.charCodeAt(0); // '0' = INPUT command
            for (let i = 0; i < data.length; i++) {
                payload[i + 1] = data.charCodeAt(i);
            }
            socket.send(payload.buffer);
        }
    });

    window.addEventListener('resize', () => {
        fitAddon.fit();
        if (socket && socket.readyState === WebSocket.OPEN) {
            sendWindowSize();
        }
    });
}

// WebSocket Connection Handlers
function connectWebSocket(url) {
    const statusText = document.getElementById('statusText');
    statusText.innerText = "CONNECTING...";

    if (socket) socket.close();

    try {
        socket = new WebSocket(url, 'tty');
        socket.binaryType = 'arraybuffer';

        socket.onopen = () => {
            statusText.innerText = "CONNECTED";
            term.clear();
        
            socket.send(JSON.stringify({ AuthToken: "" }));
        
            // Send initial size immediately
            sendWindowSize();
        
            // Re-send size after DOM layout stabilizes
            setTimeout(() => {
                sendWindowSize();
            }, 150);
        };

        socket.onmessage = (event) => {
            let rawData;
            if (event.data instanceof ArrayBuffer) {
                rawData = new Uint8Array(event.data);
            } else if (typeof event.data === 'string') {
                rawData = encoder.encode(event.data);
            } else {
                return;
            }

            if (rawData.length === 0) return;

            // Strip ttyd command prefix byte ('0' for OUTPUT)
            const command = String.fromCharCode(rawData[0]);
            if (command === '0') {
                const data = rawData.subarray(1);
                term.write(data);
            }
        };

        socket.onclose = () => {
            statusText.innerText = "DISCONNECTED";
            term.writeln('\r\n\x1b[1;31m[!] Tunnel Connection closed.\x1b[0m');
        };

        socket.onerror = (err) => {
            statusText.innerText = "ERROR";
            term.writeln('\r\n\x1b[1;31m[!] WebSocket Error.\x1b[0m');
        };

    } catch (err) {
        term.writeln(`\r\n\x1b[1;31m[!] Failed to connect: ${err.message}\x1b[0m`);
    }
}

// Sends resizing payloads formatted for ttyd
function sendWindowSize() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    
    // Force DOM measurement update
    fitAddon.fit();

    // Prevent sub-pixel row mismatch on the bottom line
    const rows = Math.max(1, term.rows);
    const cols = Math.max(1, term.cols);

    const dimensions = JSON.stringify({ 
        columns: cols, 
        rows: rows 
    });
    
    socket.send('1' + dimensions);
}

function sendRawData(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = new Uint8Array(data.length + 1);
        payload[0] = '0'.charCodeAt(0);
        for (let i = 0; i < data.length; i++) {
            payload[i + 1] = data.charCodeAt(i);
        }
        socket.send(payload.buffer);
    }
}

// Encrypter Modal Helper Action
async function generateEncryptedPayload() {
    const url = document.getElementById('encUrlInput').value.trim();
    const pass = document.getElementById('encPassInput').value.trim();
    const resultBox = document.getElementById('encResultContainer');
    const resultText = document.getElementById('encResultText');

    if (!url || !pass) {
        alert("Please provide both a WebSocket URL and an Encryption Password.");
        return;
    }

    try {
        const encryptedBase64 = await encryptPayload(url, pass);
        resultText.value = encryptedBase64;
        resultBox.classList.remove('hidden');
    } catch (err) {
        alert("Error generating encrypted payload: " + err.message);
    }
}

function copyEncryptedPayload() {
    const textarea = document.getElementById('encResultText');
    textarea.select();
    document.execCommand('copy');
    alert("Encrypted payload copied to clipboard!");
}

// Decryption Trigger & Form Handler
function requestLiveModeSwitch() {
    const errorMsg = document.getElementById('decryptErrorMsg');
    const passInput = document.getElementById('decryptPassInput');
    if (errorMsg) errorMsg.classList.add('hidden');
    if (passInput) passInput.value = '';
    toggleModal('decryptModal', true);
    setTimeout(() => { if (passInput) passInput.focus(); }, 100);
}

async function handleDecryptSubmit(event) {
    event.preventDefault();
    const passInput = document.getElementById('decryptPassInput');
    const errorMsg = document.getElementById('decryptErrorMsg');
    const submitBtn = document.getElementById('decryptSubmitBtn');

    const password = passInput ? passInput.value : '';
    if (!password) return;

    try {
        if (submitBtn) submitBtn.disabled = true;
        
        const decryptedUrl = await decryptEndpoint(password, HARDCODED_ENCRYPTED_TUNNEL_PAYLOAD);
        
        if (errorMsg) errorMsg.classList.add('hidden');
        toggleModal('decryptModal', false);
        
        connectWebSocket(decryptedUrl);
    } catch (err) {
        console.error("Decryption failed:", err);
        if (errorMsg) {
            errorMsg.classList.remove('hidden');
            const errTextSpan = errorMsg.querySelector('span');
            if (errTextSpan) {
                errTextSpan.innerText = err.message || "Invalid password or corrupted payload.";
            }
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Utility UI Helpers
function clearTerminal() {
    term.clear();
}

function toggleScanlines() {
    document.getElementById('scanlinesOverlay').classList.toggle('hidden');
}

function toggleModal(id, force) {
    const modal = document.getElementById(id);
    if (force !== undefined) {
        modal.classList.toggle('hidden', !force);
    } else {
        modal.classList.toggle('hidden');
    }
}

window.onload = initTerminal;
