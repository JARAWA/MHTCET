// auth-verification.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyC7tvZe9NeHRhYuTVrQnkaSG7Nkj3ZS40U",
    authDomain: "nextstep-log.firebaseapp.com",
    projectId: "nextstep-log",
    storageBucket: "nextstep-log.firebasestorage.app",
    messagingSenderId: "9308831285",
    appId: "1:9308831285:web:d55ed6865804c50f743b7c",
    measurementId: "G-BPGP3TBN3N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Allowed origins
const ALLOWED_ORIGINS = [
    'https://nextstepedu.co.in',
    'https://josaa.nextstepedu.co.in',
    'https://nextstep-test.onrender.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

export default class AuthVerification {
    static isVerified = false;
    static user = null;
    static initializationTimeout = 30000; // 30 seconds timeout

    static async init() {
        try {
            this.showLoadingState();

            // Development mode check
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('Development mode: Bypassing authentication');
                this.isVerified = true;
                this.user = { email: 'dev@example.com' };
                await this.initializeApplication();
                return true;
            }

            // Debug logging for URL and hash
            console.log("Full URL:", window.location.href);
            console.log("URL Hash:", window.location.hash);
            console.log("Session Storage:", {
                token: sessionStorage.getItem('josaa_auth_token') ? 'present (length: ' + sessionStorage.getItem('josaa_auth_token').length + ')' : 'not found',
                authVerified: localStorage.getItem('authVerified'),
                authToken: localStorage.getItem('authToken') ? 'present' : 'not found'
            });
            
            // Extract auth data from hash fragment
            let token = null;
            let source = null;
            let uid = null;
            
            // Check if hash exists and try to parse it
            if (window.location.hash && window.location.hash.length > 1) {
                try {
                    // Remove the # and parse the base64 encoded JSON
                    const hashData = JSON.parse(atob(window.location.hash.substring(1)));
                    console.log("Hash data found:", Object.keys(hashData));
                    
                    token = hashData.token;
                    source = hashData.source;
                    uid = hashData.uid;
                    
                    console.log("Extracted from hash:", { 
                        hasToken: !!token, 
                        tokenLength: token ? token.length : 0,
                        source,
                        uid
                    });
                    
                    // Store in session storage as backup
                    if (token) {
                        sessionStorage.setItem('josaa_auth_token', token);
                        console.log("Stored token from hash in sessionStorage");
                    }
                } catch (e) {
                    console.error("Error parsing hash fragment:", e);
                }
            }
            
            // Fallback to URL params and session storage if hash fragment method fails
            if (!token) {
                const urlParams = new URLSearchParams(window.location.search);
                token = urlParams.get('token') || sessionStorage.getItem('josaa_auth_token');
                source = urlParams.get('source') || 'nextstepedu'; // Default source if not found
                uid = urlParams.get('uid');
                console.log("Fallback auth check:", { hasToken: !!token, source, hasUid: !!uid });
            }

            const referrer = document.referrer;
            const referrerOrigin = referrer ? new URL(referrer).origin : null;

            console.log('Init started:', { source, referrerOrigin, hasToken: !!token, hasUid: !!uid });

            // More lenient referrer check if we have a valid token from hash
            if (!this.verifyReferrer(referrerOrigin, source)) {
                console.log('Referrer verification failed, checking alternate conditions');
                
                // If we have a token from hash fragment, we can be more lenient with referrer
                if (token && window.location.hash) {
                    console.log('Token found in hash fragment, bypassing strict referrer check');
                } else {
                    console.log('No token in hash and referrer check failed');
                    this.handleUnauthorizedAccess("Invalid referrer or source");
                    return false;
                }
            }

            if (!token) {
                console.log('No token found in any source');
                this.handleUnauthorizedAccess("No authentication token provided");
                return false;
            }

            // Check cookies as well
            const cookies = this.parseCookies();
            console.log("Cookies:", Object.keys(cookies));

            try {
                await this.verifyToken(token, uid);
                this.isVerified = true;
                localStorage.setItem('authVerified', 'true');
                localStorage.setItem('authToken', token);
                
                // Clear hash to avoid keeping the token in the URL after authentication
                if (window.location.hash) {
                    history.replaceState(null, document.title, window.location.pathname + window.location.search);
                    console.log("Cleared hash fragment for security");
                }

                this.showAlert('Authentication successful', 'success');
                await this.initializeApplication();
                return true;
            } catch (tokenError) {
                console.error("Token verification failed:", tokenError);
                this.handleUnauthorizedAccess("Authentication token validation failed: " + tokenError.message);
                return false;
            }

        } catch (error) {
            console.error('Authentication initialization error:', error);
            this.handleUnauthorizedAccess(error.message);
            return false;
        } finally {
            this.removeLoadingState();
        }
    }

    static parseCookies() {
        return document.cookie
            .split(';')
            .map(cookie => cookie.trim())
            .filter(cookie => cookie.length > 0)
            .reduce((obj, cookieStr) => {
                const [key, value] = cookieStr.split('=');
                obj[key] = value;
                return obj;
            }, {});
    }

    static async initializeApplication() {
        if (!window.initializeApp) {
            console.warn('No initialization function found');
            return;
        }

        const initPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Application initialization timed out'));
            }, this.initializationTimeout);

            Promise.resolve(window.initializeApp())
                .then(() => {
                    clearTimeout(timeout);
                    resolve();
                })
                .catch(reject);
        });

        try {
            await initPromise;
            this.showAlert('Application initialized successfully', 'success');
        } catch (error) {
            console.error('Application initialization error:', error);
            this.showAlert('Failed to initialize application. Please refresh the page.', 'error');
            throw error;
        }
    }

    static verifyReferrer(referrerOrigin, source) {
        // For direct access without a referrer but with valid token and source
        if (!referrerOrigin && source === 'nextstepedu') {
            return true;
        }
        
        return (
            ALLOWED_ORIGINS.includes(referrerOrigin) || 
            source === 'nextstepedu'
        );
    }

    static async verifyToken(token, uid) {
        try {
            if (!token) {
                throw new Error('No token provided');
            }
            
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid token format');
            }
            
            const payload = JSON.parse(atob(parts[1]));
            console.log("Token payload:", { 
                sub: payload.sub ? 'present' : 'missing',
                user_id: payload.user_id ? 'present' : 'missing', 
                exp: new Date(payload.exp * 1000).toLocaleString()
            });
            
            const expiry = payload.exp * 1000; // Convert to milliseconds
            if (Date.now() >= expiry) {
                throw new Error('Token has expired');
            }
            
            if (uid && payload.user_id !== uid && payload.sub !== uid) {
                console.warn('UID mismatch:', { 
                    providedUid: uid, 
                    tokenUserId: payload.user_id, 
                    tokenSub: payload.sub 
                });
                // Still proceed, but log the issue
            }
            
            this.user = {
                uid: payload.user_id || payload.sub,
                email: payload.email || payload.email_verified
            };
            
            console.log('User authenticated:', this.user.email);
            return true;
        } catch (error) {
            console.error('Token verification failed:', error);
            throw new Error(`Invalid authentication token: ${error.message}`);
        }
    }

    static handleUnauthorizedAccess(message) {
        const errorContainer = document.getElementById('auth-error-container') || 
            this.createErrorContainer();

        errorContainer.style.display = 'block';
        errorContainer.innerHTML = `
            <h2>Access Denied</h2>
            <p>${message}</p>
            <p>Please access this application through the <a href="https://nextstepedu.co.in">NextStep</a> website.</p>
            <div class="mt-3">
                <button class="btn btn-primary" onclick="window.location.href='https://nextstepedu.co.in'">
                    Go to NextStep
                </button>
            </div>
        `;
        
        this.showAlert(message, 'danger');
        this.disableAppFunctionality();
    }

    static createErrorContainer() {
        const container = document.createElement('div');
        container.id = 'auth-error-container';
        container.style.position = 'fixed';
        container.style.top = '50%';
        container.style.left = '50%';
        container.style.transform = 'translate(-50%, -50%)';
        container.style.backgroundColor = 'white';
        container.style.padding = '20px';
        container.style.borderRadius = '8px';
        container.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        container.style.zIndex = '1001';
        container.style.maxWidth = '90%';
        container.style.width = '400px';
        container.style.textAlign = 'center';
        document.body.appendChild(container);
        return container;
    }

    static showLoadingState() {
        let loadingElement = document.getElementById('auth-loading');
        if (!loadingElement) {
            loadingElement = document.createElement('div');
            loadingElement.id = 'auth-loading';
            loadingElement.className = 'auth-loading';
            loadingElement.innerHTML = `
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p>Verifying authentication...</p>
            `;
            document.body.appendChild(loadingElement);
        }
        loadingElement.style.display = 'block';

        this.addLoadingStyles();
    }

    static addLoadingStyles() {
        if (!document.getElementById('auth-loading-styles')) {
            const style = document.createElement('style');
            style.id = 'auth-loading-styles';
            style.textContent = `
                .auth-loading {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    text-align: center;
                    z-index: 1000;
                    background: rgba(255, 255, 255, 0.9);
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                }
                .auth-loading p {
                    margin-top: 10px;
                    color: #666;
                }
            `;
            document.head.appendChild(style);
        }
    }

    static removeLoadingState() {
        const loadingElement = document.getElementById('auth-loading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }

        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.style.display = 'block';
        }
    }

    static showAlert(message, type = 'danger') {
        let alertContainer = document.getElementById('error-alert-container');
        if (!alertContainer) {
            alertContainer = document.createElement('div');
            alertContainer.id = 'error-alert-container';
            alertContainer.style.position = 'fixed';
            alertContainer.style.top = '20px';
            alertContainer.style.right = '20px';
            alertContainer.style.zIndex = '1000';
            document.body.appendChild(alertContainer);
        }

        const alertElement = document.createElement('div');
        alertElement.className = `alert alert-${type} alert-dismissible fade show`;
        alertElement.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;

        alertContainer.appendChild(alertElement);

        setTimeout(() => {
            alertElement.remove();
        }, 5000);
    }

    static disableAppFunctionality() {
        const interactiveElements = document.querySelectorAll('button, a, input, select, textarea');
        interactiveElements.forEach(el => {
            if (el.closest('#auth-error-container') === null) {
                el.disabled = true;
                el.style.pointerEvents = 'none';
                el.style.opacity = '0.5';
            }
        });
        
        if (window.stopAllProcesses) {
            window.stopAllProcesses();
        }
    }

    static isAuthenticated() {
        return this.isVerified && this.user !== null;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    AuthVerification.init().then(isVerified => {
        if (isVerified) {
            console.log('Authentication verified, application can continue');
        } else {
            console.error('Authentication failed, application disabled');
        }
    }).catch(error => {
        console.error('Authentication initialization failed:', error);
        AuthVerification.handleUnauthorizedAccess("Authentication failed");
    });
});

// Export globally
window.AuthVerification = AuthVerification;
