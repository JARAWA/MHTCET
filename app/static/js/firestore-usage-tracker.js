// firestore-usage-tracker.js

import { 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js";

// Import the existing Firestore instance from your usage-limiter.js
// This avoids re-initializing Firebase

class FirestoreUsageTracker {
    static DAILY_LIMIT = 5; // Match the limit in UsageLimiter
    static UNLIMITED_EMAILS = ['49.jayesh@gmail.com', 'kapil.mems@gmail.com']; // Match the unlimited emails list
    static DEBUG_MODE = true; // Enable debugging
    
    /**
     * Initialize the Firestore usage tracker
     * @returns {Promise<boolean>} Whether initialization was successful
     */
    static async init() {
        console.log("Initializing FirestoreUsageTracker...");
        
        // Check if we're in development environment
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log("Development environment: Firestore usage tracking in simulation mode");
            return true;
        }
        
        // Check if Firestore is available from usage-limiter.js
        if (!window.db) {
            console.error("Firestore instance not available. Make sure usage-limiter.js is loaded first.");
            return false;
        }
        
        // Display initial usage information if element exists
        await this.displayRemainingUses();
        
        return true;
    }
    
    /**
     * Get the current authenticated user information
     * @returns {Object|null} User object or null if not authenticated
     */
    static getCurrentUser() {
        // Use the AuthVerification user info
        if (!window.AuthVerification || !window.AuthVerification.isAuthenticated()) {
            return null;
        }
        
        return window.AuthVerification.user;
    }
    
    /**
     * Get today's date in YYYY-MM-DD format
     * @returns {string} Today's date string
     */
    static getTodayString() {
        const today = new Date();
        return today.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    
    /**
     * Check and update usage limits in Firestore
     * @param {boolean} updateCount - Whether to increment the usage count
     * @returns {Promise<Object>} Usage information
     */
static async checkAndUpdateUsage(updateCount = false) {
    try {
        // Diagnostic logs
        console.log("=== FIRESTORE ACCESS DIAGNOSIS ===");
        
        // Get current user
        const user = this.getCurrentUser();
        console.log("Current user info:", user ? {
            uid: user.uid,
            email: user.email
        } : "No user");
        
        // Check Firebase auth directly - with error handling
        try {
            if (window.firebase && typeof window.firebase.auth === 'function') {
                const firebaseUser = window.firebase.auth().currentUser;
                console.log("Firebase Auth current user:", firebaseUser ? {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email
                } : "No Firebase user");
            } else {
                console.log("Firebase auth not properly initialized");
            }
        } catch (firebaseError) {
            console.log("Error accessing Firebase auth:", firebaseError.message);
        }
        
        // Check token in session storage
        const tokenExists = !!sessionStorage.getItem('authToken');
        console.log("Auth token in sessionStorage:", tokenExists);
        
        // Print known document IDs from Firestore
        console.log("Known Firestore user IDs for reference:");
        console.log("- PdcgDWdyz4fY8weiOC6hTBccSM33");
        console.log("- kcVI38NfIAf92jfE7cxHTWEUmVz1");
        console.log("=== END DIAGNOSIS ===");
        
        if (!user || !user.uid || !user.email) {
            console.warn("User not authenticated");
            return { 
                allowed: false, 
                remainingUses: 0, 
                message: "Please log in to use this feature" 
            };
        }
        
        // Check for unlimited emails
        if (this.UNLIMITED_EMAILS.includes(user.email)) {
            return { allowed: true, remainingUses: Infinity, message: "Unlimited access" };
        }
        
        const today = this.getTodayString();
        
        // Use system_test collection which our security rules allow access to
        const userUsageDocRef = doc(window.db, "system_test", `usage_${user.email.replace(/[.@]/g, "_")}`);
        
        // Get the current usage document
        let usageDoc;
        try {
            console.log(`Attempting to read document: system_test/usage_${user.email.replace(/[.@]/g, "_")}`);
            usageDoc = await getDoc(userUsageDocRef);
            console.log("Successfully read system_test usage document:", usageDoc.exists() ? "Document exists" : "Document doesn't exist yet");
        } catch (fetchError) {
            console.error("Error fetching system_test usage document:", fetchError);
            console.error("Error details:", fetchError.code, fetchError.message);
            
            // Try a test write to check permissions
            try {
                const testDocRef = doc(window.db, "system_test", "test_" + Date.now());
                await setDoc(testDocRef, { test: true });
                console.log("✅ Test write to system_test successful");
            } catch (testError) {
                console.error("❌ Test write to system_test failed:", testError);
            }
            
            return await UsageLimiter.checkAndUpdateUsage(updateCount);
        }
        
        // Get or initialize usage data
        let usageData = usageDoc.exists() ? usageDoc.data() : {};
        let usage = usageData[today] || 0;
        
        if (updateCount) {
            usage += 1;
            
            // Update the usage document
            try {
                console.log(`Attempting to update usage for ${user.email} to ${usage}`);
                await setDoc(userUsageDocRef, {
                    [today]: usage,
                    email: user.email,
                    lastUpdated: new Date().toISOString()
                }, { merge: true });
                console.log(`✅ Successfully updated usage for ${user.email} to ${usage} for ${today}`);
            } catch (updateError) {
                console.error("Error updating usage:", updateError);
                console.error("Update error details:", updateError.code, updateError.message);
                return await UsageLimiter.checkAndUpdateUsage(false);
            }
        }
        
        // Check if limit reached
        const remainingUses = Math.max(0, this.DAILY_LIMIT - usage);
        const allowed = remainingUses > 0;
        
        return {
            allowed,
            remainingUses,
            usage,
            message: allowed 
                ? `You have ${remainingUses} generations remaining today` 
                : `You have reached the daily limit of ${this.DAILY_LIMIT} generations. Please try again tomorrow.`
        };
    } catch (error) {
        console.error("Error tracking usage:", error);
        console.error("Stack trace:", error.stack);
        return await UsageLimiter.checkAndUpdateUsage(false);
    }
}

/**
 * Get the current authenticated user information with enhanced diagnostics
 * @returns {Object|null} User object or null if not authenticated
 */
static getCurrentUser() {
    console.log("Attempting to get current user from multiple sources");
    
    // Try multiple sources to get user info
    
    // First try AuthVerification
    if (window.AuthVerification && window.AuthVerification.user) {
        console.log("✅ Using AuthVerification user");
        return window.AuthVerification.user;
    }
    
    // Then try Firebase Auth (with error handling)
    try {
        if (window.firebase && typeof window.firebase.auth === 'function' && window.firebase.auth().currentUser) {
            console.log("✅ Using Firebase auth current user");
            return window.firebase.auth().currentUser;
        }
    } catch (e) {
        console.log("❌ Error accessing Firebase auth:", e.message);
    }
    
    // Try to get from token in sessionStorage
    try {
        const token = sessionStorage.getItem('authToken');
        if (token) {
            // Try to decode token
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                if (payload && (payload.email || payload.sub)) {
                    console.log("✅ Using user info from auth token");
                    return {
                        uid: payload.sub || payload.user_id,
                        email: payload.email || (payload.sub + "@unknown.com")
                    };
                }
            } else {
                console.log("❌ Token doesn't appear to be a valid JWT");
            }
        } else {
            console.log("❌ No auth token found in sessionStorage");
        }
    } catch (e) {
        console.log("❌ Could not extract user from token:", e);
    }
    
    console.log("❌ Failed to get current user from any source");
    return null;
}
    /**
     * Display remaining uses in UI
     */
    static async displayRemainingUses() {
        const usageInfoElement = document.getElementById('usage-info');
        if (!usageInfoElement) return;
        
        try {
            const usageInfo = await this.checkAndUpdateUsage(false);
            
            if (usageInfo.remainingUses === Infinity) {
                usageInfoElement.innerHTML = `<span class="unlimited-badge"><i class="fas fa-infinity"></i> Unlimited Access</span>`;
            } else if (usageInfo.remainingUses === "unknown") {
                usageInfoElement.innerHTML = `<span class="usage-badge"><i class="fas fa-exclamation-triangle"></i> Usage tracking unavailable</span>`;
            } else {
                usageInfoElement.innerHTML = `<span class="usage-badge"><i class="fas fa-bolt"></i> ${usageInfo.remainingUses} generations remaining today</span>`;
            }
            
            // Add color coding based on remaining uses
            if (usageInfo.remainingUses <= 1) {
                usageInfoElement.querySelector('.usage-badge')?.classList.add('low-usage');
            } else if (usageInfo.remainingUses <= 2) {
                usageInfoElement.querySelector('.usage-badge')?.classList.add('medium-usage');
            }
        } catch (error) {
            console.error("Error displaying usage info:", error);
            usageInfoElement.innerHTML = `<span class="usage-badge"><i class="fas fa-exclamation-triangle"></i> Usage tracking unavailable</span>`;
        }
    }
    
    /**
     * Apply usage limiting to a button
     * Extends the UsageLimiter functionality to use Firestore
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
                const checkResult = await FirestoreUsageTracker.checkAndUpdateUsage(false);
                console.log("Usage check result:", checkResult);
                
                // Reset button state
                buttonElement.innerText = originalText;
                buttonElement.disabled = false;
                
                if (checkResult.allowed) {
                    // Show remaining uses if not unlimited
                    if (checkResult.remainingUses !== Infinity) {
                        FirestoreUsageTracker.showNotification(checkResult.message, "info");
                    }
                    
                    // Call the original form submit handler directly
                    if (typeof generateFunction === 'function') {
                        const success = await generateFunction();
                        // Update count only if generation was successful
                        if (success !== false) {
                            await FirestoreUsageTracker.checkAndUpdateUsage(true);
                            // Refresh the counter display
                            FirestoreUsageTracker.displayRemainingUses();
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
                    FirestoreUsageTracker.showNotification(checkResult.message, "warning");
                    
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
                FirestoreUsageTracker.showNotification("An error occurred while checking usage limits", "error");
                
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
     * Show a notification to the user
     * Reuses the existing notification function
     * @param {string} message - Message to display
     * @param {string} type - Type of notification (info, warning, error)
     */
    static showNotification(message, type = 'info') {
        if (window.UsageLimiter && window.UsageLimiter.showNotification) {
            window.UsageLimiter.showNotification(message, type);
        } else if (window.AuthVerification && window.AuthVerification.showAlert) {
            const alertType = type === 'info' ? 'info' : 
                            type === 'warning' ? 'warning' : 'danger';
            window.AuthVerification.showAlert(message, alertType);
        } else {
            // Fallback if neither is available
            alert(message);
        }
    }
    
    /**
     * CSS styles for usage badges
     */
    static addStyles() {
        if (document.getElementById('firestore-usage-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'firestore-usage-styles';
        style.textContent = `
            .usage-badge {
                display: inline-block;
                padding: 0.25rem 0.5rem;
                background-color: #e9ecef;
                border-radius: 0.25rem;
                font-size: 0.75rem;
                font-weight: bold;
            }
            
            .unlimited-badge {
                display: inline-block;
                padding: 0.25rem 0.5rem;
                background-color: #d1e7dd;
                color: #0f5132;
                border-radius: 0.25rem;
                font-size: 0.75rem;
                font-weight: bold;
            }
            
            .low-usage {
                background-color: #f8d7da;
                color: #842029;
            }
            
            .medium-usage {
                background-color: #fff3cd;
                color: #664d03;
            }
        `;
        document.head.appendChild(style);
    }
}

// Add styles
FirestoreUsageTracker.addStyles();

// Initialize on page load - after AuthVerification and UsageLimiter
document.addEventListener('DOMContentLoaded', async () => {
    // Make sure AuthVerification and UsageLimiter are ready
    const waitForDependencies = async () => {
        return new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (window.AuthVerification && window.UsageLimiter && window.db) {
                    clearInterval(checkInterval);
                    resolve(true);
                }
            }, 100);
            
            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve(false);
            }, 10000);
        });
    };
    
    const dependenciesReady = await waitForDependencies();
    if (dependenciesReady) {
        await FirestoreUsageTracker.init();
        console.log("FirestoreUsageTracker initialized");
        
        // Create a usage info element if not present
        if (!document.getElementById('usage-info')) {
            const navbarRight = document.querySelector('.navbar-right, .navbar .ms-auto, .nav-right');
            if (navbarRight) {
                const usageInfoContainer = document.createElement('li');
                usageInfoContainer.className = 'nav-item';
                usageInfoContainer.innerHTML = '<div id="usage-info" class="nav-link"></div>';
                navbarRight.appendChild(usageInfoContainer);
                await FirestoreUsageTracker.displayRemainingUses();
            }
        }
    } else {
        console.error("Could not initialize FirestoreUsageTracker - dependencies not loaded");
    }
});

// Replace UsageLimiter.applyToButton with our version for all future calls
const originalApplyToButton = window.UsageLimiter?.applyToButton;
if (originalApplyToButton) {
    window.UsageLimiter.applyToButton = function(buttonElement, generateFunction) {
        FirestoreUsageTracker.applyToButton(buttonElement, generateFunction);
    };
    console.log("Enhanced UsageLimiter.applyToButton with Firestore tracking");
}

// Also expose globally
window.FirestoreUsageTracker = FirestoreUsageTracker;

// Export
export default FirestoreUsageTracker;
