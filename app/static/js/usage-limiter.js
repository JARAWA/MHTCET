// usage-limiter.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import { 
    getFirestore,
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

// Use the same Firebase config that's in auth-verification.js
const firebaseConfig = {
    apiKey: "AIzaSyC7tvZe9NeHRhYuTVrQnkaSG7Nkj3ZS40U",
    authDomain: "nextstep-log.firebaseapp.com",
    projectId: "nextstep-log",
    storageBucket: "nextstep-log.firebasestorage.app",
    messagingSenderId: "9308831285",
    appId: "1:9308831285:web:d55ed6865804c50f743b7c",
    measurementId: "G-BPGP3TBN3N"
};

// Check if we're in development environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname.includes('local') ||
                      window.location.hostname.includes('dev') ||
                      window.location.hostname.includes('render.com');

// Initialize Firebase only in production environment
let app, db;
if (!isDevelopment) {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        window.db = db;
        console.log("Firebase initialized in production mode (Firestore only)");
    } catch (error) {
        console.error("Error initializing Firebase:", error);
    }
}

export default class UsageLimiter {
    static DAILY_LIMIT = 5;
    static UNLIMITED_EMAILS = ['49.jayesh@gmail.com','kapil.mems@gmail.com'];
    static DEBUG_MODE = true; // Set to true to enable more verbose logging
    
    /**
     * Get user information for storage operations
     * We're completely bypassing Firebase Authentication and using JWT user info directly
     * @param {string} userId - User ID
     * @param {string} email - User's email
     * @returns {Promise<Object>}
     */
    static async getUserInfo(userId, email) {
        // For development environment, use a known user
        if (isDevelopment) {
            console.log("Development environment: Using dummy user info");
            return {
                uid: userId || "dev-user-id",
                email: email || "dev@example.com"
            };
        }
        
        // Return user info from JWT directly
        console.log("Using JWT authenticated user info:", email);
        return { 
            uid: userId, 
            email: email
        };
    }
    
    /**
     * Check if the user can generate preferences and update usage count
     * @returns {Promise<{allowed: boolean, remainingUses: number, message: string}>}
     */
    static async checkAndUpdateUsage(updateCount = false) {
        try {
            // In development mode, always allow with a simulated count
            if (isDevelopment) {
                if (this.DEBUG_MODE) console.log("Development environment: Bypassing usage tracking");
                // Simulate usage tracking in development
                const devUsage = sessionStorage.getItem('devUsageCount') || 0;
                let newUsage = parseInt(devUsage);
                
                if (updateCount) {
                    newUsage += 1;
                    sessionStorage.setItem('devUsageCount', newUsage);
                }
                
                const remainingUses = this.DAILY_LIMIT - newUsage;
                return { 
                    allowed: remainingUses > 0, 
                    remainingUses: Math.max(0, remainingUses), 
                    message: `DEV MODE: You have ${Math.max(0, remainingUses)} generations remaining today` 
                };
            }
            
            // Get the authenticated user from AuthVerification
            if (!window.AuthVerification || !window.AuthVerification.isAuthenticated()) {
                if (this.DEBUG_MODE) console.log("Auth verification not available or user not authenticated");
                return { allowed: true, remainingUses: this.DAILY_LIMIT, message: 'Auth tracking unavailable - operations allowed' };
            }
            
            const authUser = window.AuthVerification.user;
            if (!authUser || !authUser.uid || !authUser.email) {
                if (this.DEBUG_MODE) console.log("Auth user information not available");
                return { allowed: true, remainingUses: this.DAILY_LIMIT, message: 'User tracking unavailable - operations allowed' };
            }

            // Check if user has unlimited access
            if (this.UNLIMITED_EMAILS.includes(authUser.email)) {
                console.log(`Unlimited access granted for ${authUser.email}`);
                return { allowed: true, remainingUses: Infinity, message: 'Unlimited access' };
            }
            
            // Use local storage to track usage limits
            try {
                // Create a unique key for today's usage for this user
                const today = new Date().toISOString().split('T')[0];
                const storageKey = `josaa_usage_${authUser.uid}_${today}`;
                
                // Get current usage count
                let currentUsage = parseInt(localStorage.getItem(storageKey) || '0');
                
                // Check if limit reached
                if (currentUsage >= this.DAILY_LIMIT) {
                    if (this.DEBUG_MODE) console.log(`User ${authUser.email} has reached daily limit`);
                    return {
                        allowed: false,
                        remainingUses: 0,
                        message: `You have reached the daily limit of ${this.DAILY_LIMIT} generations. Please try again tomorrow.`
                    };
                }
                
                // Update usage if needed
                if (updateCount) {
                    currentUsage += 1;
                    localStorage.setItem(storageKey, currentUsage.toString());
                    if (this.DEBUG_MODE) console.log(`Updated usage for ${authUser.email} to ${currentUsage}`);
                }
                
                const remainingUses = this.DAILY_LIMIT - currentUsage;
                return {
                    allowed: true,
                    remainingUses,
                    message: `You have ${remainingUses} generations remaining today`
                };
            } catch (storageError) {
                console.error("Error accessing localStorage:", storageError);
                // Fallback to allow operation
                return { 
                    allowed: true, 
                    remainingUses: this.DAILY_LIMIT, 
                    message: "Usage tracking is unavailable - operations allowed" 
                };
            }
        } catch (error) {
            console.error("Error checking user usage:", error);
            // In case of error, allow the user but with a warning
            return { 
                allowed: true, 
                remainingUses: "unknown", 
                message: "Usage tracking is currently unavailable",
                error: error.message 
            };
        }
    }
    
    /**
     * Apply usage limiting to a button
     * @param {HTMLElement} buttonElement - The button to limit
     * @param {Function} generateFunction - The function to call when generation is allowed
     */
    static applyToButton(buttonElement, generateFunction) {
        if (!buttonElement) {
            console.error("Button element not found");
            return;
        }
        
        // Store the original click handler if any
        const originalClickHandler = buttonElement.onclick;
        
        // Replace with our handler
        buttonElement.onclick = async function(event) {
            event.preventDefault();
            
            // Show loading state
            const originalText = buttonElement.innerText;
            buttonElement.innerText = "Checking limits...";
            buttonElement.disabled = true;
            
            try {
                // First check WITHOUT updating the count
                const checkResult = await UsageLimiter.checkAndUpdateUsage(false);
                console.log("Usage check result:", checkResult);
                
                // Reset button state
                buttonElement.innerText = originalText;
                buttonElement.disabled = false;
                
                if (checkResult.allowed) {
                    // Show remaining uses if not unlimited
                    if (checkResult.remainingUses !== Infinity) {
                        UsageLimiter.showNotification(checkResult.message, "info");
                    }
                    
                    // Call the original form submit handler directly
                    if (typeof generateFunction === 'function') {
                        const success = await generateFunction();
                        // Update count only if generation was successful
                        if (success !== false) {
                            await UsageLimiter.checkAndUpdateUsage(true);
                            // Refresh the counter display if function exists
                            if (typeof window.displayRemainingUses === 'function') {
                                window.displayRemainingUses();
                            }
                        }
                    } else {
                        // Submit the form directly if no function was provided
                        const form = buttonElement.closest('form');
                        if (form) {
                            const formSubmitEvent = new Event('submit', { bubbles: true, cancelable: true });
                            form.dispatchEvent(formSubmitEvent);
                            // Form handling will update the usage count if successful
                        } else if (typeof originalClickHandler === 'function') {
                            originalClickHandler.call(buttonElement, event);
                        }
                    }
                } else {
                    // Show limit reached message
                    buttonElement.innerText = "Limit Reached";
                    buttonElement.disabled = true;
                    UsageLimiter.showNotification(checkResult.message, "warning");
                    
                    // Reset button after 3 seconds
                    setTimeout(() => {
                        buttonElement.innerText = originalText;
                        buttonElement.disabled = false;
                    }, 3000);
                }
            } catch (error) {
                console.error("Error in usage limiter:", error);
                buttonElement.innerText = originalText;
                buttonElement.disabled = false;
                UsageLimiter.showNotification("An error occurred while checking usage limits", "error");
                
                // On error, still allow the action to proceed
                if (typeof generateFunction === 'function') {
                    generateFunction();
                } else {
                    const form = buttonElement.closest('form');
                    if (form) {
                        const formSubmitEvent = new Event('submit', { bubbles: true, cancelable: true });
                        form.dispatchEvent(formSubmitEvent);
                    } else if (typeof originalClickHandler === 'function') {
                        originalClickHandler.call(buttonElement, event);
                    }
                }
            }
        };
    }
    
    /**
     * Get remaining uses for the current day
     * @returns {Promise<number>} Number of remaining uses
     */
    static async getRemainingUses() {
        const result = await this.checkAndUpdateUsage(false); // Pass false to prevent updating
        return result.remainingUses;
    }
    
    /**
     * Display a notification to the user
     * @param {string} message - Message to display
     * @param {string} type - Type of notification (info, warning, error)
     */
    static showNotification(message, type = 'info') {
        // Reuse the alert functionality from AuthVerification
        if (window.AuthVerification && window.AuthVerification.showAlert) {
            const alertType = type === 'info' ? 'info' : 
                            type === 'warning' ? 'warning' : 'danger';
            window.AuthVerification.showAlert(message, alertType);
        } else {
            // Fallback if AuthVerification is not available
            alert(message);
        }
    }
}

// Export globally
window.UsageLimiter = UsageLimiter;
