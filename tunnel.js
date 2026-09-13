// =========================================================================
// PASTE YOUR GENERATED AES-256 BASE64 PAYLOAD HERE
// =========================================================================
let HARDCODED_ENCRYPTED_TUNNEL_PAYLOAD = "XBiuI6KfEjchMlmRzVGDww==:uz2WFKtGaQwwBMi+:XH8+UCc4qfFzXC20fCJL/VboSuCA6dsCKBDWFZk8M8ChoBOWW+EjpCo=";

/**
 * Converts a Base64 string safely to a Uint8Array, handling URL-safe padding.
 */
function base64ToBytes(base64) {
    if (typeof base64 !== 'string') {
        throw new Error("Invalid payload: Data is not a string.");
    }
    let cleaned = base64.trim().replace(/[\s"'\r\n]/g, '');
    cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const pad = cleaned.length % 4;
    if (pad === 2) cleaned += '==';
    else if (pad === 3) cleaned += '=';

    const binString = atob(cleaned);
    const bytes = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Converts an ArrayBuffer/Uint8Array to a standard Base64 string.
 */
function bufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Derives an AES-GCM 256-bit key using PBKDF2.
 */
async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypts plaintext string using AES-GCM.
 * Output layout: [ 16 bytes Salt | 12 bytes IV | Ciphertext + Tag ]
 */
async function encryptPayload(plaintext, password) {
    const enc = new TextEncoder();
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);

    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        enc.encode(plaintext)
    );

    const combined = new Uint8Array(16 + 12 + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, 16);
    combined.set(new Uint8Array(encrypted), 28);

    return bufferToBase64(combined);
}

/**
 * Decrypts an AES-GCM Base64 string payload using the provided password.
 */
async function decryptEndpoint(passphrase, base64Data) {
    if (!base64Data || base64Data === "REPLACE_WITH_YOUR_BASE64_ENCRYPTED_ENDPOINT_STRING") {
        throw new Error("No hardcoded payload set in HARDCODED_ENCRYPTED_TUNNEL_PAYLOAD.");
    }

    const encryptedBytes = base64ToBytes(base64Data);

    if (encryptedBytes.length < 28) {
        throw new Error("Payload is corrupted or too short. Needs Salt(16) + IV(12) + Tag.");
    }

    const salt = encryptedBytes.subarray(0, 16);
    const iv = encryptedBytes.subarray(16, 28);
    const ciphertext = encryptedBytes.subarray(28);

    const key = await deriveKey(passphrase, salt);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
}
