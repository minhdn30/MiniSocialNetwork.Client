// ================= CREATE POST MODAL - 2 STEPS =================

// Current step
let currentStep = 1;

// Store multiple media files
let mediaFiles = []; // Array to store multiple media with crop data
let currentMediaIndex = 0; // Current active media

// Image state
let currentImage = null;
let imageNaturalWidth = 0;
let imageNaturalHeight = 0;

// Display state
let containerWidth = 0;
let containerHeight = 0;
let displayScale = 1; // Scale to fit image in container

// Drag state
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let imageOffsetX = 0;
let imageOffsetY = 0;

// Crop state
let currentCropRatio = "1:1";
let cropFrameSize = { width: 400, height: 400 }; // Fixed crop frame size in pixels

// Zoom state (0.5 = 50%, 1 = 100%, 3 = 300%)
let zoomLevel = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

// Global crop ratio for all images
let globalCropRatio = "1:1";

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

  currentStep = 1;
  showStep(1);

  // Reset states
  globalCropRatio = "1:1";
  currentCropRatio = "1:1";
  zoomLevel = 1;
  imageOffsetX = 0;
  imageOffsetY = 0;
  isDragging = false;

  modal.classList.add("show");
  document.body.style.overflow = "hidden";

  loadCreatePostUserInfo();
  showMediaPlaceholder();
  lucide.createIcons();
}

// Close create post modal
function closeCreatePostModal() {
  const modal = document.getElementById("createPostModal");
  if (!modal) return;

  modal.classList.remove("show");
  document.body.style.overflow = "";

  resetPostForm();
  currentStep = 1;
  showStep(1);
}

// Handle back button
function handleBackButton() {
  if (currentStep === 2) {
    currentStep = 1;
    showStep(1);
  } else {
    closeCreatePostModal();
  }
}

// Handle next step / share
function handleNextStep() {
  if (currentStep === 1) {
    if (mediaFiles.length === 0) {
      alert("Please upload an image or video!");
      return;
    }

    // Save crop data for current media
    saveCropData();

    currentStep = 2;
    showStep(2);
    prepareStep2Preview();
  } else {
    submitPost();
  }
}

// Show specific step
function showStep(step) {
  const step1Content = document.getElementById("step1Content");
  const step2Content = document.getElementById("step2Content");
  const modalTitle = document.getElementById("modalTitle");
  const actionBtn = document.getElementById("modalActionBtn");

  if (step === 1) {
    if (step1Content) step1Content.style.display = "flex";
    if (step2Content) step2Content.style.display = "none";
    if (modalTitle) modalTitle.textContent = "Upload and Edit Photos";
    if (actionBtn) actionBtn.textContent = "Next Step";
  } else {
    if (step1Content) step1Content.style.display = "none";
    if (step2Content) step2Content.style.display = "flex";
    if (modalTitle) modalTitle.textContent = "Create New Post";
    if (actionBtn) actionBtn.textContent = "Share";

    setTimeout(() => {
      const captionInput = document.getElementById("postCaption");
      if (captionInput) captionInput.focus();
    }, 300);
  }

  lucide.createIcons();
}

// Calculate crop frame based on ratio
function calculateCropFrameSize(ratio) {
  const container = document.getElementById("mediaZoomContainer");
  if (!container) return { width: 400, height: 400 };

  const containerRect = container.getBoundingClientRect();
  containerWidth = containerRect.width;
  containerHeight = containerRect.height;

  // Make crop frame smaller to be more visible (70% of container)
  const maxSize = Math.min(containerWidth, containerHeight) * 0.7;
  let width, height;

  if (ratio === "original") {
    // For original, calculate based on image orientation
    if (imageNaturalWidth && imageNaturalHeight) {
      const imageRatio = imageNaturalWidth / imageNaturalHeight;

      // Determine if image is portrait or landscape
      if (imageRatio < 1) {
        // Portrait - use 4:5 frame
        width = maxSize * 0.8;
        height = maxSize;
      } else {
        // Landscape or square - use 1:1 frame
        width = maxSize;
        height = maxSize;
      }
    } else {
      width = maxSize;
      height = maxSize;
    }
  } else if (ratio === "1:1") {
    width = maxSize;
    height = maxSize;
  } else if (ratio === "4:5") {
    width = maxSize * 0.8;
    height = maxSize;
  } else if (ratio === "16:9") {
    width = maxSize;
    height = maxSize * (9 / 16);
  }

  return { width, height };
}

// Update crop overlay display
function updateCropOverlay() {
  const cropFrameEl = document.getElementById("cropFrameEl");

  if (!cropFrameEl) return;

  const container = document.getElementById("mediaZoomContainer");
  const containerRect = container.getBoundingClientRect();
  const centerX = containerRect.width / 2;
  const centerY = containerRect.height / 2;

  // Position crop frame at center
  cropFrameEl.style.left = centerX - cropFrameSize.width / 2 + "px";
  cropFrameEl.style.top = centerY - cropFrameSize.height / 2 + "px";
  cropFrameEl.style.width = cropFrameSize.width + "px";
  cropFrameEl.style.height = cropFrameSize.height + "px";
}

// Calculate display scale to fit full image in container
function calculateDisplayScale() {
  const container = document.getElementById("mediaZoomContainer");
  if (!container || !imageNaturalWidth || !imageNaturalHeight) return 1;

  const containerRect = container.getBoundingClientRect();

  // Scale to fit entire image in container
  const scaleX = containerRect.width / imageNaturalWidth;
  const scaleY = containerRect.height / imageNaturalHeight;

  return Math.min(scaleX, scaleY);
}

// Calculate optimal zoom and position for Instagram-style crop
function calculateOptimalCrop(ratio) {
  if (!imageNaturalWidth || !imageNaturalHeight) return;

  const imageRatio = imageNaturalWidth / imageNaturalHeight;
  let cropRatio;

  // Determine crop ratio value
  if (ratio === "1:1") {
    cropRatio = 1;
  } else if (ratio === "4:5") {
    cropRatio = 4 / 5;
  } else if (ratio === "16:9") {
    cropRatio = 16 / 9;
  } else if (ratio === "original") {
    // For original, just fit the entire image
    zoomLevel = 1;
    imageOffsetX = 0;
    imageOffsetY = 0;
    return;
  }

  // Instagram algorithm: compare image ratio with crop ratio
  // If image is wider than crop ratio -> fit by height
  // If image is taller than crop ratio -> fit by width

  let targetZoom;

  if (imageRatio > cropRatio) {
    // Image is wider than crop ratio
    // Fit by HEIGHT: make image height = crop frame height
    targetZoom = cropFrameSize.height / (imageNaturalHeight * displayScale);
  } else {
    // Image is taller/equal to crop ratio
    // Fit by WIDTH: make image width = crop frame width
    targetZoom = cropFrameSize.width / (imageNaturalWidth * displayScale);
  }

  // Apply zoom level with constraints
  zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));

  // Reset position to center
  imageOffsetX = 0;
  imageOffsetY = 0;
}

// Update image position
function updateImagePosition() {
  const wrapper = document.getElementById("mediaContentWrapper");
  const img = document.getElementById("postImagePreview");

  if (!wrapper || !img) return;

  // Calculate final scale
  const finalScale = displayScale * zoomLevel;

  // Apply transform
  wrapper.style.transform = `translate(${imageOffsetX}px, ${imageOffsetY}px)`;

  // Set image size
  img.style.width = imageNaturalWidth * finalScale + "px";
  img.style.height = imageNaturalHeight * finalScale + "px";

  updateCropOverlay();
}

// Constrain drag to keep crop frame filled
function constrainDrag() {
  const container = document.getElementById("mediaZoomContainer");
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const centerX = containerRect.width / 2;
  const centerY = containerRect.height / 2;

  const finalScale = displayScale * zoomLevel;
  const scaledWidth = imageNaturalWidth * finalScale;
  const scaledHeight = imageNaturalHeight * finalScale;

  // Calculate crop frame position (always centered)
  const cropLeft = centerX - cropFrameSize.width / 2;
  const cropRight = centerX + cropFrameSize.width / 2;
  const cropTop = centerY - cropFrameSize.height / 2;
  const cropBottom = centerY + cropFrameSize.height / 2;

  // Calculate max offsets to ensure crop frame is always covered
  // Image can move only as much as it extends beyond the crop frame
  const maxOffsetX = Math.max(0, (scaledWidth - cropFrameSize.width) / 2);
  const maxOffsetY = Math.max(0, (scaledHeight - cropFrameSize.height) / 2);

  // Constrain offsets
  imageOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, imageOffsetX));
  imageOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, imageOffsetY));
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

  // Reset states
  zoomLevel = 1;
  imageOffsetX = 0;
  imageOffsetY = 0;

  showMediaAtIndex(currentMediaIndex);
  updateThumbnails();
}

// Show media at specific index
function showMediaAtIndex(index) {
  if (index < 0 || index >= mediaFiles.length) return;

  const media = mediaFiles[index];
  const imagePreview = document.getElementById("postImagePreview");
  const videoPreview = document.getElementById("postVideoPreview");

  if (media.type === "image") {
    if (imagePreview) {
      imagePreview.src = media.data;
      imagePreview.style.display = "block";

      // Wait for image to load
      imagePreview.onload = function () {
        currentImage = imagePreview;
        imageNaturalWidth = imagePreview.naturalWidth;
        imageNaturalHeight = imagePreview.naturalHeight;

        // Calculate display scale to fit full image
        displayScale = calculateDisplayScale();

        // Use global crop ratio
        currentCropRatio = globalCropRatio;
        cropFrameSize = calculateCropFrameSize(currentCropRatio);

        // Update resolution display
        const imageResolution = document.getElementById("imageResolution");
        if (imageResolution) {
          imageResolution.textContent = `${imageNaturalWidth} × ${imageNaturalHeight}`;
        }

        // Restore crop data if exists
        if (media.cropData && media.cropData.ratio === currentCropRatio) {
          zoomLevel = media.cropData.zoomLevel;
          imageOffsetX = media.cropData.offsetX;
          imageOffsetY = media.cropData.offsetY;
        } else {
          // Calculate optimal crop for this image with current ratio
          calculateOptimalCrop(currentCropRatio);
        }

        updateImagePosition();
        updateCropOverlay();
        updateZoomSlider();
      };
    }
    if (videoPreview) {
      videoPreview.style.display = "none";
      videoPreview.src = "";
      videoPreview.pause();
    }
  } else if (media.type === "video") {
    if (videoPreview) {
      videoPreview.src = media.data;
      videoPreview.style.display = "block";
    }
    if (imagePreview) {
      imagePreview.style.display = "none";
      imagePreview.src = "";
    }

    const imageResolution = document.getElementById("imageResolution");
    if (imageResolution) {
      imageResolution.textContent = "Video file";
    }
  }
}

// Save crop data for current media
function saveCropData() {
  if (currentMediaIndex >= 0 && currentMediaIndex < mediaFiles.length) {
    const media = mediaFiles[currentMediaIndex];

    if (media.type === "image") {
      // Calculate crop coordinates in original image
      const container = document.getElementById("mediaZoomContainer");
      const containerRect = container.getBoundingClientRect();
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;

      const finalScale = displayScale * zoomLevel;

      // Crop frame position in container
      const cropLeft = centerX - cropFrameSize.width / 2;
      const cropTop = centerY - cropFrameSize.height / 2;

      // Image position in container
      const imgCenterX = centerX + imageOffsetX;
      const imgCenterY = centerY + imageOffsetY;
      const imgLeft = imgCenterX - (imageNaturalWidth * finalScale) / 2;
      const imgTop = imgCenterY - (imageNaturalHeight * finalScale) / 2;

      // Crop area relative to image
      const cropX = (cropLeft - imgLeft) / finalScale;
      const cropY = (cropTop - imgTop) / finalScale;
      const cropWidth = cropFrameSize.width / finalScale;
      const cropHeight = cropFrameSize.height / finalScale;

      media.cropData = {
        ratio: currentCropRatio,
        zoomLevel: zoomLevel,
        offsetX: imageOffsetX,
        offsetY: imageOffsetY,
        cropX: Math.max(0, cropX),
        cropY: Math.max(0, cropY),
        cropWidth: Math.min(cropWidth, imageNaturalWidth),
        cropHeight: Math.min(cropHeight, imageNaturalHeight),
        displayScale: displayScale,
      };
    }
  }
}

// Update thumbnails display
function updateThumbnails() {
  const container = document.getElementById("mediaThumbnails");
  if (!container) return;

  container.innerHTML = "";

  mediaFiles.forEach((media, index) => {
    const thumbDiv = document.createElement("div");
    thumbDiv.className = `thumbnail-item ${index === currentMediaIndex ? "active" : ""}`;
    thumbDiv.onclick = (e) => {
      // Don't switch if clicking delete button
      if (!e.target.closest(".thumbnail-delete")) {
        switchToMedia(index);
      }
    };

    if (media.type === "image") {
      const img = document.createElement("img");
      img.src = media.data;
      thumbDiv.appendChild(img);
    } else {
      const video = document.createElement("video");
      video.src = media.data;
      thumbDiv.appendChild(video);
    }

    // Add delete button
    const deleteBtn = document.createElement("div");
    deleteBtn.className = "thumbnail-delete";
    deleteBtn.innerHTML = '<i data-lucide="x"></i>';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteMedia(index);
    };
    thumbDiv.appendChild(deleteBtn);

    container.appendChild(thumbDiv);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "thumbnail-add";
  addBtn.onclick = triggerMediaUpload;
  addBtn.innerHTML = '<i data-lucide="plus"></i>';
  container.appendChild(addBtn);

  lucide.createIcons();
}

// Delete media at index
function deleteMedia(index) {
  if (index < 0 || index >= mediaFiles.length) return;

  // Save current media crop data before deleting
  if (index === currentMediaIndex) {
    saveCropData();
  }

  // Remove from array
  mediaFiles.splice(index, 1);

  // If no media left, show placeholder
  if (mediaFiles.length === 0) {
    showMediaPlaceholder();
    return;
  }

  // Adjust current index if needed
  if (currentMediaIndex >= mediaFiles.length) {
    currentMediaIndex = mediaFiles.length - 1;
  }

  // Show current media
  showMediaAtIndex(currentMediaIndex);
  updateThumbnails();
}

// Switch to media at index
function switchToMedia(index) {
  if (index >= 0 && index < mediaFiles.length) {
    // Save current media crop data
    saveCropData();

    currentMediaIndex = index;

    showMediaAtIndex(index);

    document.querySelectorAll(".thumbnail-item").forEach((thumb, i) => {
      thumb.classList.toggle("active", i === index);
    });
  }
}

// Reset post form
function resetPostForm() {
  const captionInput = document.getElementById("postCaption");
  const imagePreview = document.getElementById("postImagePreview");
  const videoPreview = document.getElementById("postVideoPreview");
  const imagePreviewFinal = document.getElementById("postImagePreviewFinal");
  const videoPreviewFinal = document.getElementById("postVideoPreviewFinal");
  const mediaInput = document.getElementById("postMediaInput");
  const charCount = document.getElementById("charCount");
  const imageResolution = document.getElementById("imageResolution");

  if (captionInput) captionInput.value = "";
  if (imagePreview) {
    imagePreview.src = "";
    imagePreview.style.display = "none";
  }
  if (videoPreview) {
    videoPreview.src = "";
    videoPreview.style.display = "none";
    videoPreview.pause();
  }
  if (imagePreviewFinal) {
    imagePreviewFinal.src = "";
    imagePreviewFinal.style.display = "none";
  }
  if (videoPreviewFinal) {
    videoPreviewFinal.src = "";
    videoPreviewFinal.style.display = "none";
    videoPreviewFinal.pause();
  }
  if (mediaInput) mediaInput.value = "";
  if (charCount) charCount.textContent = "0";
  if (imageResolution) imageResolution.textContent = "No image selected";

  mediaFiles = [];
  currentMediaIndex = 0;
  showMediaPlaceholder();

  const sections = ["location", "collaborators", "accessibility", "advanced"];
  sections.forEach((section) => {
    const content = document.getElementById(`${section}Content`);
    if (content) content.style.display = "none";

    const header = document.querySelector(
      `[onclick*="toggleSection('${section}')"]`,
    );
    if (header) header.classList.remove("expanded");
  });
}

// Trigger media upload
function triggerMediaUpload() {
  const mediaInput = document.getElementById("postMediaInput");
  if (mediaInput) {
    mediaInput.setAttribute("multiple", "multiple");
    mediaInput.click();
  }
}

// Handle media upload
function handleMediaUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  Array.from(files).forEach((file) => {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      alert("Please select image or video files only!");
      return;
    }

    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      const limit = isVideo ? "50MB" : "10MB";
      alert(`File size must not exceed ${limit}!`);
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const mediaData = {
        data: e.target.result,
        type: isImage ? "image" : "video",
        file: file,
        cropData: null,
      };

      mediaFiles.push(mediaData);

      if (mediaFiles.length === 1) {
        currentMediaIndex = 0;
        showMediaPreview();
      } else {
        updateThumbnails();
      }

      lucide.createIcons();
    };
    reader.readAsDataURL(file);
  });

  event.target.value = "";
}

// Update character count
function updateCharCount() {
  const captionInput = document.getElementById("postCaption");
  const charCount = document.getElementById("charCount");

  if (captionInput && charCount) {
    const count = captionInput.value.length;
    charCount.textContent = count;

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

// Toggle emoji picker
function toggleEmojiPicker() {
  alert("Emoji feature is under development!");
}

// Submit post
function submitPost() {
  const captionInput = document.getElementById("postCaption");

  if (mediaFiles.length === 0) {
    alert("Please select at least one image or video!");
    return;
  }

  const caption = captionInput ? captionInput.value.trim() : "";

  const selectedPlatforms = [];
  document.querySelectorAll(".setting-item").forEach((item) => {
    const toggle = item.querySelector(".toggle-switch");
    const platformName = item.querySelector(".setting-name").textContent;
    if (toggle && toggle.classList.contains("active")) {
      selectedPlatforms.push(platformName);
    }
  });

  console.log("Submitting post:", {
    caption: caption,
    mediaCount: mediaFiles.length,
    mediaFiles: mediaFiles.map((m) => ({
      type: m.type,
      cropData: m.cropData,
    })),
    platforms: selectedPlatforms,
  });

  alert(`Post with ${mediaFiles.length} media file(s) shared successfully!`);
  closeCreatePostModal();
}

// ================= CROP RATIO FUNCTIONALITY =================

function changeCropRatio(ratio) {
  // Save crop data for current image before changing ratio
  saveCropData();

  // Update global crop ratio
  globalCropRatio = ratio;
  currentCropRatio = ratio;

  // Recalculate crop frame size
  cropFrameSize = calculateCropFrameSize(ratio);

  // Apply optimal crop to current image
  calculateOptimalCrop(ratio);

  // Clear saved crop data for all images (they need to be recalculated for new ratio)
  mediaFiles.forEach((media) => {
    if (media.type === "image") {
      media.cropData = null;
    }
  });

  updateImagePosition();
  updateZoomSlider();

  document.querySelectorAll(".crop-ratio-card").forEach((card) => {
    card.classList.remove("active");
  });

  document
    .querySelectorAll(`[data-ratio="${ratio}"]`)
    .forEach((el) => el.classList.add("active"));

  lucide.createIcons();
}

// ================= ZOOM FUNCTIONALITY =================

function updateZoomSlider() {
  const sliderTrack = document.getElementById("zoomSliderTrack");
  const sliderThumb = document.getElementById("zoomSliderThumb");
  if (sliderTrack && sliderThumb) {
    // Map zoom level (0.5 to 3) to percentage (0 to 100)
    const percentage = ((zoomLevel - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100;
    sliderTrack.style.height = `${percentage}%`;
  }
}

function zoomIn() {
  zoomLevel = Math.min(zoomLevel + 0.25, MAX_ZOOM);
  constrainDrag();
  updateImagePosition();
  updateZoomSlider();
}

function zoomOut() {
  zoomLevel = Math.max(zoomLevel - 0.25, MIN_ZOOM);
  constrainDrag();
  updateImagePosition();
  updateZoomSlider();
}

function setZoomLevel(level) {
  zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
  constrainDrag();
  updateImagePosition();
  updateZoomSlider();
}

// ================= DRAG FUNCTIONALITY =================

// Mouse down
document.addEventListener("mousedown", (e) => {
  if (currentStep !== 1) return;

  // Check if clicking on zoom slider
  if (
    e.target.closest("#zoomSlider") ||
    e.target.closest("#zoomSliderTrack") ||
    e.target.closest("#zoomSliderThumb")
  ) {
    return;
  }

  const wrapper = document.getElementById("mediaContentWrapper");
  if (!wrapper) return;

  if (
    e.target.closest("#mediaContentWrapper") ||
    e.target.closest("#mediaZoomContainer")
  ) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    wrapper.classList.add("dragging");
    wrapper.style.cursor = "grabbing";
    e.preventDefault();
  }
});

// Mouse move
document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const deltaX = e.clientX - dragStartX;
  const deltaY = e.clientY - dragStartY;

  imageOffsetX += deltaX;
  imageOffsetY += deltaY;

  constrainDrag();
  updateImagePosition();

  dragStartX = e.clientX;
  dragStartY = e.clientY;
});

// Mouse up
document.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    const wrapper = document.getElementById("mediaContentWrapper");
    if (wrapper) {
      wrapper.classList.remove("dragging");
      wrapper.style.cursor = "move";
    }
  }
});

// Zoom slider interaction
let isZoomSliding = false;

document.addEventListener("mousedown", (e) => {
  const slider = document.getElementById("zoomSlider");
  const thumb = document.getElementById("zoomSliderThumb");
  const track = document.getElementById("zoomSliderTrack");

  if (
    e.target === slider ||
    e.target === thumb ||
    e.target === track ||
    e.target.closest("#zoomSliderTrack")
  ) {
    if (currentStep !== 1) return;
    isZoomSliding = true;
    updateZoomFromSlider(e);
    e.preventDefault();
  }
});

document.addEventListener("mousemove", (e) => {
  if (isZoomSliding) {
    updateZoomFromSlider(e);
  }
});

document.addEventListener("mouseup", () => {
  isZoomSliding = false;
});

function updateZoomFromSlider(e) {
  const slider = document.getElementById("zoomSlider");
  if (!slider) return;

  const rect = slider.getBoundingClientRect();
  const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
  const percentage = 1 - y / rect.height; // Inverted for vertical slider
  const newZoomLevel = MIN_ZOOM + percentage * (MAX_ZOOM - MIN_ZOOM);

  setZoomLevel(newZoomLevel);
}

// Mouse wheel zoom
document.addEventListener(
  "wheel",
  (e) => {
    const wrapper = document.getElementById("mediaPreviewWrapper");
    if (!wrapper || wrapper.style.display === "none") return;
    if (currentStep !== 1) return;

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

// ================= STEP 2 FUNCTIONALITY =================

function prepareStep2Preview() {
  if (mediaFiles.length === 0) return;

  currentMediaIndex = 0;
  showMediaAtIndexStep2(currentMediaIndex);
  updateThumbnailsStep2();

  const navigation = document.getElementById("mediaNavigation");

  if (mediaFiles.length > 1) {
    if (navigation) navigation.style.display = "block";
  } else {
    if (navigation) navigation.style.display = "none";
  }

  lucide.createIcons();
}

// Create cropped image canvas
function createCroppedImage(media) {
  return new Promise((resolve) => {
    if (media.type !== "image" || !media.cropData) {
      resolve(media.data);
      return;
    }

    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const cropData = media.cropData;

      canvas.width = cropData.cropWidth;
      canvas.height = cropData.cropHeight;

      ctx.drawImage(
        img,
        cropData.cropX,
        cropData.cropY,
        cropData.cropWidth,
        cropData.cropHeight,
        0,
        0,
        cropData.cropWidth,
        cropData.cropHeight,
      );

      resolve(canvas.toDataURL());
    };
    img.src = media.data;
  });
}

async function showMediaAtIndexStep2(index) {
  if (index < 0 || index >= mediaFiles.length) return;

  const media = mediaFiles[index];
  const imagePreviewFinal = document.getElementById("postImagePreviewFinal");
  const videoPreviewFinal = document.getElementById("postVideoPreviewFinal");
  const container = document.getElementById("mediaReadonlyContainer");

  if (media.type === "image") {
    // Create cropped image
    const croppedSrc = await createCroppedImage(media);

    if (imagePreviewFinal) {
      imagePreviewFinal.src = croppedSrc;
      imagePreviewFinal.style.display = "block";
    }
    if (videoPreviewFinal) {
      videoPreviewFinal.style.display = "none";
      videoPreviewFinal.src = "";
      videoPreviewFinal.pause();
    }

    // Update container class based on crop ratio
    if (container && media.cropData) {
      container.className = "media-readonly-container";
      if (media.cropData.ratio === "1:1") {
        container.classList.add("crop-1-1");
      } else if (media.cropData.ratio === "4:5") {
        container.classList.add("crop-4-5");
      } else if (media.cropData.ratio === "16:9") {
        container.classList.add("crop-16-9");
      } else if (media.cropData.ratio === "original") {
        const imageRatio = media.cropData.cropWidth / media.cropData.cropHeight;
        if (imageRatio < 1) {
          container.classList.add("crop-4-5");
        } else {
          container.classList.add("crop-1-1");
        }
      }
    }
  } else if (media.type === "video") {
    if (videoPreviewFinal) {
      videoPreviewFinal.src = media.data;
      videoPreviewFinal.style.display = "block";
    }
    if (imagePreviewFinal) {
      imagePreviewFinal.style.display = "none";
      imagePreviewFinal.src = "";
    }
  }
}

function updateThumbnailsStep2() {
  const container = document.getElementById("mediaThumbnailsStep2");
  if (!container) return;

  container.innerHTML = "";

  if (mediaFiles.length <= 1) {
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";

  mediaFiles.forEach((media, index) => {
    const thumbDiv = document.createElement("div");
    thumbDiv.className = `thumbnail-item ${index === currentMediaIndex ? "active" : ""}`;
    thumbDiv.onclick = () => navigateToMedia(index);

    if (media.type === "image") {
      const img = document.createElement("img");
      img.src = media.data;
      thumbDiv.appendChild(img);
    } else {
      const video = document.createElement("video");
      video.src = media.data;
      thumbDiv.appendChild(video);
    }

    container.appendChild(thumbDiv);
  });

  lucide.createIcons();
}

function navigateToMedia(index) {
  if (index >= 0 && index < mediaFiles.length) {
    currentMediaIndex = index;
    showMediaAtIndexStep2(index);

    document
      .querySelectorAll("#mediaThumbnailsStep2 .thumbnail-item")
      .forEach((dot, i) => {
        dot.classList.toggle("active", i === index);
      });
  }
}

function previousImage() {
  let newIndex = currentMediaIndex - 1;
  if (newIndex < 0) {
    newIndex = mediaFiles.length - 1; // Loop to last
  }
  navigateToMedia(newIndex);
}

function nextImage() {
  let newIndex = currentMediaIndex + 1;
  if (newIndex >= mediaFiles.length) {
    newIndex = 0; // Loop to first
  }
  navigateToMedia(newIndex);
}

// ================= MODAL EVENTS =================

document.addEventListener("click", (e) => {
  const modal = document.getElementById("createPostModal");
  if (e.target === modal) {
    closeCreatePostModal();
  }
});

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
