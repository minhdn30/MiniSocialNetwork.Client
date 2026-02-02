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
