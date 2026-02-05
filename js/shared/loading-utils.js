/**
 * Shared Loading Utilities
 * Handles buttons, toggles, and spinner elements.
 */
window.LoadingUtils = {
    /**
     * Update button state to loading or normal.
     * @param {HTMLElement} btn - The button element
     * @param {boolean} isLoading - Loading state
     */
    setButtonLoading: (btn, isLoading) => {
        if (!btn) return;
        
        if (isLoading) {
            btn.classList.add("loading");
            btn.disabled = true;
            
            // Add spinner if missing
            if (!btn.querySelector(".btn-spinner")) {
                const spinner = document.createElement("div");
                spinner.className = "btn-spinner";
                btn.appendChild(spinner);
            }
        } else {
            btn.classList.remove("loading");
            btn.disabled = false;
            
            // Remove spinner
            const spinner = btn.querySelector(".btn-spinner");
            if (spinner) spinner.remove();
        }
    },
    
    /**
     * Show/Hide a generic loading element (by ID or Element reference)
     * @param {HTMLElement|string} elOrId - Element or ID
     * @param {boolean} visible - Visibility
     */
    toggle: (elOrId, visible) => {
        const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
        if (!el) return;
        
        el.style.display = visible ? "flex" : "none";
    }
};

/* =========================================
   GLOBAL LOADER (Exposed to Window)
   Used for blocking operations like Uploads
   ========================================= */
/* =========================================
   GLOBAL LOADER (Exposed to Window)
   Used for blocking operations like Uploads
   ========================================= */
(function() {
    function createGlobalLoader() {
        if (document.getElementById("globalUploadOverlay")) return;

        const overlay = document.createElement("div");
        overlay.id = "globalUploadOverlay";
        overlay.className = "loading-overlay"; // Use shared CSS class
        
        // Force fixed position for global usage (override absolute)
        Object.assign(overlay.style, {
            position: "fixed",
            zIndex: "999999",
            background: "rgba(0, 0, 0, 0.5)", // Dark overlay
            backdropFilter: "blur(2px)",
            display: "none" // Hidden by default
        });
        
        const spinner = document.createElement("div");
        spinner.className = "spinner spinner-large"; // Match Newsfeed (large)
        
        // Remove manual color overrides to use CSS defaults (var(--accent-primary))
        // This makes it look exactly like the feed loader
        
        overlay.appendChild(spinner);
        document.body.appendChild(overlay);
    }

    window.showGlobalLoader = function() {
        createGlobalLoader();
        const overlay = document.getElementById("globalUploadOverlay");
        if (overlay) {
             overlay.style.display = "flex";
        }
    };

    window.hideGlobalLoader = function() {
        const overlay = document.getElementById("globalUploadOverlay");
        if (overlay) {
            overlay.style.display = "none";
        }
    };
})();
