/**
 * Media Previewer Utility
 * Handles full-screen preview of images and videos with navigation, thumbnails, and dynamic background
 */
const MediaPreviewer = {
    overlay: null,
    body: null,
    counter: null,
    thumbsContainer: null,
    mediaList: [],
    currentIndex: 0,

    init() {
        if (this.overlay) return;

        // Create DOM elements
        const html = `
            <div id="media-preview-overlay" class="media-preview-overlay">
                <div class="media-preview-toolbar">
                    <button class="preview-tool-btn" onclick="MediaPreviewer.downloadCurrent()" title="Tải xuống">
                        <i data-lucide="download"></i>
                    </button>
                    <button class="preview-tool-btn" onclick="MediaPreviewer.close()" title="Đóng">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                
                <div class="media-preview-container">
                    <div class="media-preview-nav prev" id="preview-nav-prev" onclick="MediaPreviewer.prev(event)">
                        <i data-lucide="chevron-left"></i>
                    </div>
                    
                    <div id="media-preview-body">
                        <!-- Content will be injected here -->
                    </div>
                    
                    <div class="media-preview-nav next" id="preview-nav-next" onclick="MediaPreviewer.next(event)">
                        <i data-lucide="chevron-right"></i>
                    </div>
                </div>

                <div id="media-preview-footer" class="media-preview-footer">
                    <div id="media-preview-thumbs" class="media-preview-thumbs"></div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        this.overlay = document.getElementById('media-preview-overlay');
        this.body = document.getElementById('media-preview-body');
        this.thumbsContainer = document.getElementById('media-preview-thumbs');

        // Close on background click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.overlay.classList.contains('active')) return;
            
            if (e.key === 'Escape') this.close();
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key === 'ArrowRight') this.next();
        });

        if (window.lucide) lucide.createIcons();
    },

    /**
     * Open previewer with set of media
     * @param {Array} mediaList - Array of {mediaUrl, mediaType} or just strings
     * @param {number} startIndex - Index to start at
     */
    open(mediaList, startIndex = 0) {
        this.init();
        
        // Normalize list
        this.mediaList = mediaList.map(item => {
            if (typeof item === 'string') return { mediaUrl: item, mediaType: 0 };
            return {
                mediaUrl: item.mediaUrl || item.MediaUrl,
                mediaType: item.mediaType !== undefined ? item.mediaType : (item.MediaType !== undefined ? item.MediaType : 0)
            };
        });

        this.currentIndex = startIndex;
        this.renderThumbs();
        this.render();
        
        this.overlay.classList.add('active');
        document.body.style.overflow = 'hidden'; 
    },

    async render() {
        const item = this.mediaList[this.currentIndex];
        if (!item) return;

        // Use a render version ID to prevent race conditions from rapid calls
        const currentRenderId = ++this.lastRenderId || (this.lastRenderId = 1);
        this.currentRenderId = currentRenderId;

        this.body.innerHTML = '';
        
        // Update dynamic background
        if (item.mediaType === 0 && window.extractDominantColor) {
            try {
                const color = await window.extractDominantColor(item.mediaUrl);
                // Only apply if this is still the active render
                if (this.currentRenderId === currentRenderId) {
                    this.overlay.style.setProperty('--dynamic-bg', color);
                }
            } catch (e) {
                this.overlay.style.removeProperty('--dynamic-bg');
            }
        } else {
            this.overlay.style.removeProperty('--dynamic-bg');
        }

        // If a newer render has started, stop here
        if (this.currentRenderId !== currentRenderId) return;

        // Render main content
        if (item.mediaType === 0) {
            const img = document.createElement('img');
            img.src = item.mediaUrl;
            img.className = 'media-preview-content';
            this.body.appendChild(img);
        } else {
            const video = document.createElement('video');
            video.src = item.mediaUrl;
            video.className = 'media-preview-content';
            video.controls = true;
            video.autoplay = true;
            this.body.appendChild(video);
        }

        // Update active thumb
        const allThumbs = this.thumbsContainer.querySelectorAll('.preview-thumb');
        allThumbs.forEach((t, i) => {
            if (i === this.currentIndex) t.classList.add('active');
            else t.classList.remove('active');
        });

        // Hide/show nav buttons
        const prevBtn = document.getElementById('preview-nav-prev');
        const nextBtn = document.getElementById('preview-nav-next');
        
        prevBtn.style.display = this.mediaList.length > 1 ? 'flex' : 'none';
        nextBtn.style.display = this.mediaList.length > 1 ? 'flex' : 'none';
        
        if (window.lucide) lucide.createIcons();
    },

    renderThumbs() {
        this.thumbsContainer.style.display = 'flex';
        this.thumbsContainer.innerHTML = this.mediaList.map((m, idx) => `
            <div class="preview-thumb ${idx === this.currentIndex ? 'active' : ''}" onclick="MediaPreviewer.goTo(${idx})">
                ${m.mediaType === 0 
                    ? `<img src="${m.mediaUrl}">` 
                    : `<div class="thumb-video-icon"><i data-lucide="play"></i></div>`
                }
            </div>
        `).join('');
        
        if (window.lucide) lucide.createIcons();
    },

    goTo(index) {
        this.currentIndex = index;
        this.render();
    },

    next(e) {
        if (e) e.stopPropagation();
        if (this.mediaList.length <= 1) return;
        
        this.currentIndex = (this.currentIndex + 1) % this.mediaList.length;
        this.render();
    },

    prev(e) {
        if (e) e.stopPropagation();
        if (this.mediaList.length <= 1) return;
        
        this.currentIndex = (this.currentIndex - 1 + this.mediaList.length) % this.mediaList.length;
        this.render();
    },

    async downloadCurrent() {
        const item = this.mediaList[this.currentIndex];
        if (!item) return;

        try {
            // Use fetch and blob to try and bypass cross-origin download restrictions
            const response = await fetch(item.mediaUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            
            // Get filename from URL or fallback
            const fileName = item.mediaUrl.split('/').pop().split('?')[0] || `media_${Date.now()}`;
            a.download = fileName;
            
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback for simple link opening if fetch fails
            window.open(item.mediaUrl, '_blank');
        }
    },

    close() {
        if (this.overlay) {
            this.overlay.classList.remove('active');
            document.body.style.overflow = ''; 
            this.body.innerHTML = '';
            this.overlay.style.removeProperty('--dynamic-bg');
        }
    }
};

window.previewMedia = (media, index = 0, allMedias = null) => {
    if (allMedias) {
        MediaPreviewer.open(allMedias, index);
    } else {
        MediaPreviewer.open([media], 0);
    }
};

window.previewImage = (url) => window.previewMedia(url);
