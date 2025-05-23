// hash-tracker.js
const HashTracker = {
    originalHash: window.location.hash,
    events: [],
    isActive: false,
    
    init() {
        this.isActive = true;
        this.originalHash = window.location.hash;
        this.logEvent('INIT', `Initial hash: ${this.originalHash}`);
        
        // Store initial state in sessionStorage
        this.preserveState();
        
        // Capture hash changes
        window.addEventListener('hashchange', (e) => {
            this.logEvent('HASHCHANGE', `Old: ${e.oldURL}, New: ${e.newURL}`);
            this.preserveState();
        });
        
        // Capture navigation events
        window.addEventListener('beforeunload', (e) => {
            this.logEvent('BEFOREUNLOAD', `Hash at beforeunload: ${window.location.hash}`);
            this.preserveState();
        });
        
        // Capture visibilitychange events (tab switching)
        document.addEventListener('visibilitychange', () => {
            this.logEvent('VISIBILITY', `Visible: ${!document.hidden}, Hash: ${window.location.hash}`);
        });
        
        // Monitor pushState and replaceState
        this.patchHistoryMethods();
        
        console.log('💬 HashTracker initialized', this.originalHash);
    },
    
    logEvent(type, message) {
        const timestamp = new Date().toISOString();
        const entry = { timestamp, type, message };
        this.events.push(entry);
        console.log(`🔍 [${type}] ${message}`);
        
        // Keep the last 50 events only
        if (this.events.length > 50) this.events.shift();
    },
    
    preserveState() {
        sessionStorage.setItem('hash_tracker_hash', window.location.hash);
        sessionStorage.setItem('hash_tracker_events', JSON.stringify(this.events));
        sessionStorage.setItem('hash_tracker_last_url', window.location.href);
    },
    
    patchHistoryMethods() {
        // Monitor pushState
        const originalPushState = history.pushState;
        history.pushState = function() {
            HashTracker.logEvent('PUSHSTATE', `Args: ${JSON.stringify(arguments)}`);
            HashTracker.logEvent('PUSHSTATE_URL', `Current hash before: ${window.location.hash}`);
            const result = originalPushState.apply(this, arguments);
            HashTracker.logEvent('PUSHSTATE_AFTER', `Hash after: ${window.location.hash}`);
            HashTracker.preserveState();
            return result;
        };
        
        // Monitor replaceState
        const originalReplaceState = history.replaceState;
        history.replaceState = function() {
            HashTracker.logEvent('REPLACESTATE', `Args: ${JSON.stringify(arguments)}`);
            HashTracker.logEvent('REPLACESTATE_URL', `Current hash before: ${window.location.hash}`);
            const result = originalReplaceState.apply(this, arguments);
            HashTracker.logEvent('REPLACESTATE_AFTER', `Hash after: ${window.location.hash}`);
            HashTracker.preserveState();
            return result;
        };
    },
    
    checkPreviousSession() {
        const lastHash = sessionStorage.getItem('hash_tracker_hash');
        const lastUrl = sessionStorage.getItem('hash_tracker_last_url');
        const previousEvents = sessionStorage.getItem('hash_tracker_events');
        
        if (lastHash || previousEvents) {
            console.log('💬 Previous HashTracker session detected');
            console.log('📍 Last URL:', lastUrl);
            console.log('📍 Last hash:', lastHash);
            
            if (previousEvents) {
                try {
                    const events = JSON.parse(previousEvents);
                    console.log('📜 Previous session events:', events);
                } catch (e) {
                    console.error('Error parsing previous events:', e);
                }
            }
        }
    }
};

// Run as early as possible during page load
document.addEventListener('DOMContentLoaded', () => {
    HashTracker.init();
});

// Also try to run immediately 
if (document.readyState !== 'loading') {
    HashTracker.init();
} else {
    HashTracker.checkPreviousSession();
}

// Create a global reference
window.HashTracker = HashTracker;
