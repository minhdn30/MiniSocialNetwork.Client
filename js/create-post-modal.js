// ================= CREATE POST MODAL =================

// Zoom and Pan state
let zoomLevel = 1;
let isPanning = false;
let startX = 0;
let startY = 0;
let translateX = 0;
let translateY = 0;
let currentCropRatio = "original"; // original, 1:1, 4:5, 16:9

// Load user info for create post modal
function loadCreatePostUserInfo() {
  const avatarUrl = localStorage.getItem("avatarUrl");
  const fullname = localStorage.getItem("fullname");

  const avatarElement = document.getElementById("post-user-avatar");
  const nameElement = document.getElementById("post-user-name");

  if (avatarElement) {
    if (!avatarUrl || avatarUrl === "null" || avatarUrl.trim() === "") {
      avatarElement.src = APP_CONFIG.DEFAULT_AVATAR;
    } else {
      avatarElement.src = avatarUrl;
    }
  }

  if (nameElement) {
    nameElement.textContent =
      fullname && fullname.trim() !== "" ? fullname : "User";
  }
}

// Open create post modal
function openCreatePostModal() {
  const modal = document.getElementById("createPostModal");
  if (!modal) return;

  // Reset zoom state when opening modal
  zoomLevel = 1;
  translateX = 0;
  translateY = 0;
  isPanning = false;
  currentCropRatio = "original";

  modal.classList.add("show");
  document.body.style.overflow = "hidden"; // Prevent body scroll

  // Load user info
  loadCreatePostUserInfo();

  // Show placeholder and hide preview
  showMediaPlaceholder();

  // Recreate lucide icons
  lucide.createIcons();

  // Focus on caption input
  setTimeout(() => {
    const captionInput = document.getElementById("postCaption");
    if (captionInput) captionInput.focus();
  }, 300);
}

// Close create post modal
function closeCreatePostModal() {
  const modal = document.getElementById("createPostModal");
  if (!modal) return;

  modal.classList.remove("show");
  document.body.style.overflow = ""; // Restore body scroll

  // Reset form
  resetPostForm();
}

// Show media placeholder
function showMediaPlaceholder() {
  const placeholder = document.getElementById("mediaPlaceholder");
  const previewWrapper = document.getElementById("mediaPreviewWrapper");

  if (placeholder) placeholder.style.display = "flex";
  if (previewWrapper) previewWrapper.style.display = "none";
}

// Show media preview
function showMediaPreview() {
  const placeholder = document.getElementById("mediaPlaceholder");
  const previewWrapper = document.getElementById("mediaPreviewWrapper");

  if (placeholder) placeholder.style.display = "none";
  if (previewWrapper) previewWrapper.style.display = "flex";

  // Reset zoom when showing new media
  zoomLevel = 1;
  translateX = 0;
  translateY = 0;
  currentCropRatio = "original";

  // Apply crop ratio class
  applyCropRatio();
  updateZoom();
}

// Reset post form
function resetPostForm() {
  const captionInput = document.getElementById("postCaption");
  const imagePreview = document.getElementById("postImagePreview");
  const videoPreview = document.getElementById("postVideoPreview");
  const mediaInput = document.getElementById("postMediaInput");
  const charCount = document.getElementById("charCount");

  if (captionInput) captionInput.value = "";
  if (imagePreview) {
    imagePreview.src = "";
    imagePreview.style.display = "none";
  }
  if (videoPreview) {
    videoPreview.src = "";
    videoPreview.style.display = "none";
    // Pause video if playing
    videoPreview.pause();
  }
  if (mediaInput) mediaInput.value = "";
  if (charCount) charCount.textContent = "0";

  // Show placeholder again
  showMediaPlaceholder();

  // Close all expanded sections
  const sections = ["location", "collaborators", "advanced"];
  sections.forEach((section) => {
    const content = document.getElementById(`${section}Content`);
    if (content) content.style.display = "none";

    // Remove expanded class from headers
    const header = document.querySelector(
      `[onclick*="toggleSection('${section}')"]`,
    );
    if (header) header.classList.remove("expanded");
  });
}

// Trigger media upload
function triggerMediaUpload() {
  const mediaInput = document.getElementById("postMediaInput");
  if (mediaInput) mediaInput.click();
}

// Handle media upload (image or video)
function handleMediaUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    alert("Please select an image or video file!");
    return;
  }

  // Validate file size (max 50MB for video, 10MB for image)
  const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    const limit = isVideo ? "50MB" : "10MB";
    alert(`File size must not exceed ${limit}!`);
    return;
  }

  // Preview media
  const reader = new FileReader();
  reader.onload = function (e) {
    const imagePreview = document.getElementById("postImagePreview");
    const videoPreview = document.getElementById("postVideoPreview");

    if (isImage) {
      // Show image preview
      if (imagePreview) {
        imagePreview.src = e.target.result;
        imagePreview.style.display = "block";
      }
      if (videoPreview) {
        videoPreview.style.display = "none";
        videoPreview.src = "";
        videoPreview.pause();
      }
    } else if (isVideo) {
      // Show video preview
      if (videoPreview) {
        videoPreview.src = e.target.result;
        videoPreview.style.display = "block";
      }
      if (imagePreview) {
        imagePreview.style.display = "none";
        imagePreview.src = "";
      }
    }

    // Show preview and hide placeholder
    showMediaPreview();
    // Recreate icons for the change button
    lucide.createIcons();
  };
  reader.readAsDataURL(file);
}

// Update character count
function updateCharCount() {
  const captionInput = document.getElementById("postCaption");
  const charCount = document.getElementById("charCount");

  if (captionInput && charCount) {
    const count = captionInput.value.length;
    charCount.textContent = count;

    // Change color if near limit
    if (count > 2000) {
      charCount.style.color = "var(--danger-alt)";
    } else {
      charCount.style.color = "var(--text-disabled)";
    }
  }
}

// Toggle section
function toggleSection(sectionName) {
  const content = document.getElementById(`${sectionName}Content`);
  const header = event.currentTarget;

  if (!content) return;

  if (content.style.display === "none" || content.style.display === "") {
    content.style.display = "block";
    if (header) header.classList.add("expanded");
  } else {
    content.style.display = "none";
    if (header) header.classList.remove("expanded");
  }
}

// Toggle emoji picker (placeholder)
function toggleEmojiPicker() {
  console.log("Toggle emoji picker");
  // TODO: Implement emoji picker
  alert("Emoji feature is under development!");
}

// Submit post
function submitPost() {
  const captionInput = document.getElementById("postCaption");
  const imagePreview = document.getElementById("postImagePreview");
  const videoPreview = document.getElementById("postVideoPreview");

  // Validate - check both image and video
  const hasImage =
    imagePreview && imagePreview.src && imagePreview.style.display !== "none";
  const hasVideo =
    videoPreview && videoPreview.src && videoPreview.style.display !== "none";

  if (!hasImage && !hasVideo) {
    alert("Please select an image or video!");
    return;
  }

  const caption = captionInput ? captionInput.value.trim() : "";
  const mediaType = hasVideo ? "video" : "image";
  const mediaSrc = hasVideo ? videoPreview.src : imagePreview.src;

  // Get selected platforms
  const selectedPlatforms = [];
  document.querySelectorAll(".setting-item").forEach((item) => {
    const toggle = item.querySelector(".toggle-switch");
    const platformName = item.querySelector(".setting-name").textContent;
    if (toggle && toggle.classList.contains("active")) {
      selectedPlatforms.push(platformName);
    }
  });

  // TODO: Implement actual post submission
  console.log("Submitting post:", {
    caption: caption,
    mediaType: mediaType,
    media: mediaSrc,
    cropRatio: currentCropRatio,
    zoomLevel: zoomLevel,
    position: { x: translateX, y: translateY },
    platforms: selectedPlatforms,
  });

  // Show success message
  alert("Post shared successfully!");

  // Close modal
  closeCreatePostModal();
}

// Close modal when clicking overlay
document.addEventListener("click", (e) => {
  const modal = document.getElementById("createPostModal");
  if (e.target === modal) {
    closeCreatePostModal();
  }
});

// Close modal with ESC key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("createPostModal");
    if (modal && modal.classList.contains("show")) {
      closeCreatePostModal();
    }
  }
});

// Toggle platform sharing
document.addEventListener("click", (e) => {
  if (e.target.closest(".toggle-switch") && e.target.closest(".setting-item")) {
    const toggle = e.target.closest(".toggle-switch");
    toggle.classList.toggle("active");
  }
});

// ================= CROP RATIO FUNCTIONALITY =================

// Change crop ratio
function changeCropRatio(ratio) {
  currentCropRatio = ratio;

  // Reset zoom and position when changing ratio
  zoomLevel = 1;
  translateX = 0;
  translateY = 0;

  // Update UI
  applyCropRatio();
  updateZoom();

  // Update active button
  document.querySelectorAll(".ratio-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-ratio="${ratio}"]`)?.classList.add("active");

  // Recreate icons
  lucide.createIcons();
}

// Apply crop ratio class to container
function applyCropRatio() {
  const container = document.getElementById("mediaZoomContainer");
  if (!container) return;

  // Remove all crop classes
  container.classList.remove(
    "crop-original",
    "crop-1-1",
    "crop-4-5",
    "crop-16-9",
  );

  // Add current crop class
  const cropClass = `crop-${currentCropRatio.replace(":", "-")}`;
  container.classList.add(cropClass);
}

// ================= ZOOM AND PAN FUNCTIONALITY =================

// Calculate pan boundaries
function getPanBoundaries() {
  const container = document.getElementById("mediaZoomContainer");
  const wrapper = document.getElementById("mediaPreviewWrapper");

  if (!container || !wrapper) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  const wrapperRect = wrapper.getBoundingClientRect();

  // Calculate the scaled size of content
  const scaledWidth = wrapperRect.width * zoomLevel;
  const scaledHeight = wrapperRect.height * zoomLevel;

  // Calculate how much we can pan (half of the overflow on each side)
  const maxPanX = Math.max(0, (scaledWidth - wrapperRect.width) / 2);
  const maxPanY = Math.max(0, (scaledHeight - wrapperRect.height) / 2);

  return {
    minX: -maxPanX / zoomLevel,
    maxX: maxPanX / zoomLevel,
    minY: -maxPanY / zoomLevel,
    maxY: maxPanY / zoomLevel,
  };
}

// Clamp value between min and max
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Zoom In
function zoomIn() {
  zoomLevel = Math.min(zoomLevel + 0.25, 3); // Max 3x zoom
  updateZoom();
  constrainPan();
}

// Zoom Out
function zoomOut() {
  zoomLevel = Math.max(zoomLevel - 0.25, 1); // Min 1x zoom

  // Reset position if zoom is 1
  if (zoomLevel === 1) {
    translateX = 0;
    translateY = 0;
  }

  updateZoom();
  constrainPan();
}

// Reset Zoom
function resetZoom() {
  zoomLevel = 1;
  translateX = 0;
  translateY = 0;
  updateZoom();
}

// Constrain pan within boundaries
function constrainPan() {
  const boundaries = getPanBoundaries();
  translateX = clamp(translateX, boundaries.minX, boundaries.maxX);
  translateY = clamp(translateY, boundaries.minY, boundaries.maxY);
}

// Update Zoom Transform
function updateZoom() {
  const container = document.getElementById("mediaZoomContainer");
  if (container) {
    container.style.transform = `scale(${zoomLevel}) translate(${translateX}px, ${translateY}px)`;

    // Update cursor based on zoom level
    if (zoomLevel > 1) {
      container.classList.add("zoomed");
    } else {
      container.classList.remove("zoomed");
    }
  }
}

// Mouse Wheel Zoom
document.addEventListener(
  "wheel",
  (e) => {
    const container = document.getElementById("mediaZoomContainer");
    const wrapper = document.getElementById("mediaPreviewWrapper");

    if (!container || !wrapper) return;
    if (wrapper.style.display === "none") return;

    // Check if mouse is over the media preview area
    const rect = wrapper.getBoundingClientRect();
    if (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    ) {
      e.preventDefault();

      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    }
  },
  { passive: false },
);

// Pan functionality
document.addEventListener("mousedown", (e) => {
  const container = document.getElementById("mediaZoomContainer");
  if (!container) return;

  // Only allow panning when zoomed
  if (zoomLevel > 1 && e.target.closest("#mediaZoomContainer")) {
    isPanning = true;
    startX = e.clientX - translateX * zoomLevel;
    startY = e.clientY - translateY * zoomLevel;
    container.classList.add("grabbing");
    e.preventDefault();
  }
});

document.addEventListener("mousemove", (e) => {
  if (!isPanning) return;

  const container = document.getElementById("mediaZoomContainer");
  if (!container) return;

  // Calculate new position
  const newTranslateX = (e.clientX - startX) / zoomLevel;
  const newTranslateY = (e.clientY - startY) / zoomLevel;

  // Apply boundaries
  const boundaries = getPanBoundaries();
  translateX = clamp(newTranslateX, boundaries.minX, boundaries.maxX);
  translateY = clamp(newTranslateY, boundaries.minY, boundaries.maxY);

  // Apply transform with requestAnimationFrame for smooth animation
  requestAnimationFrame(() => {
    container.style.transform = `scale(${zoomLevel}) translate(${translateX}px, ${translateY}px)`;
  });
});

document.addEventListener("mouseup", () => {
  if (isPanning) {
    isPanning = false;
    const container = document.getElementById("mediaZoomContainer");
    if (container) {
      container.classList.remove("grabbing");
    }
  }
});

// Prevent context menu on media preview
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest("#mediaZoomContainer")) {
    e.preventDefault();
  }
});

// Reset zoom when changing media
const originalHandleMediaUpload = handleMediaUpload;
window.handleMediaUpload = function (event) {
  // Reset zoom state
  zoomLevel = 1;
  translateX = 0;
  translateY = 0;

  // Call original function
  originalHandleMediaUpload(event);
};

// Reset zoom when closing modal
const originalCloseCreatePostModal = closeCreatePostModal;
window.closeCreatePostModal = function () {
  // Reset zoom state
  zoomLevel = 1;
  translateX = 0;
  translateY = 0;
  isPanning = false;

  // Call original function
  originalCloseCreatePostModal();
};
