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

// Loading state
let isProcessingCrop = false;

// Post privacy state (0 = Public, 1 = FollowOnly, 2 = Private)
let selectedPrivacy = 0;

// Emoji picker instance


// File size formatting moved to js/shared/file-utils.js

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
    const rawName = fullname && fullname.trim() !== "" ? fullname : "User";
    nameElement.textContent = window.PostUtils 
      ? PostUtils.truncateName(rawName)
      : rawName;
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
  isProcessingCrop = false;
  selectedPrivacy = 0;

  modal.classList.add("show");
  document.body.style.overflow = "hidden";

  loadCreatePostUserInfo();
  resetPrivacySelector();
  showMediaPlaceholder();
  
  // Init caption limit
  const captionInput = document.getElementById("postCaption");
  const maxCharCount = document.getElementById("maxCharCount");
  if (captionInput) captionInput.maxLength = APP_CONFIG.MAX_POST_CONTENT_LENGTH;
  if (maxCharCount) maxCharCount.textContent = APP_CONFIG.MAX_POST_CONTENT_LENGTH;

  lucide.createIcons();
}

// Check if modal has any content
function hasModalContent() {
  const captionInput = document.getElementById("postCaption");
  const caption = captionInput ? captionInput.value.trim() : "";

  return mediaFiles.length > 0 || caption.length > 0;
}

// Show discard confirmation popup
function showDiscardConfirmation() {
  if (isProcessingCrop) {
    // Prevent showing discard while processing/uploading
    return;
  }
  const overlay = document.createElement("div");
  overlay.className = "post-options-overlay";
  overlay.id = "discardConfirmOverlay";

  const popup = document.createElement("div");
  popup.className = "post-options-popup";

  popup.innerHTML = `
    <div class="post-options-header">
      <h3>Discard post?</h3>
      <p>If you leave, your edits won't be saved.</p>
    </div>
    <button class="post-option post-option-danger" onclick="confirmDiscardPost()">
      Discard
    </button>
    <button class="post-option post-option-cancel" onclick="cancelDiscardPost()">
      Cancel
    </button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => overlay.classList.add("show"));

  overlay.onclick = (e) => {
    if (e.target === overlay) cancelDiscardPost();
  };
}

// Confirm discard
function confirmDiscardPost() {
  const overlay = document.getElementById("discardConfirmOverlay");
  if (overlay) overlay.remove();

  // Actually close the modal
  const modal = document.getElementById("createPostModal");
  if (!modal) return;

  modal.classList.remove("show");
  document.body.style.overflow = "";

  resetPostForm();
  currentStep = 1;
  showStep(1);
}

// Cancel discard
function cancelDiscardPost() {
  const overlay = document.getElementById("discardConfirmOverlay");
  if (overlay) {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 200);
  }
}

// Close create post modal
function closeCreatePostModal() {
  // Check if there's content
  if (hasModalContent()) {
    showDiscardConfirmation();
    return;
  }

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

// Set loading state
function setLoadingState(loading) {
  isProcessingCrop = loading;
  const actionBtn = document.getElementById("modalActionBtn");

  if (actionBtn) {
    if (loading) {
      LoadingUtils.setButtonLoading(actionBtn, true);
    } else {
      LoadingUtils.setButtonLoading(actionBtn, false);
    }
  }

  // Disable/enable ratio buttons
  document.querySelectorAll(".crop-ratio-card").forEach((card) => {
    card.disabled = loading;
  });
}

// Global upload helpers have been moved to `js/app.js` so they are
// available application-wide: `createGlobalLoader`, `showGlobalLoader`,
// `hideGlobalLoader`, and `uploadFormDataWithProgress`.

// Handle next step / share
async function handleNextStep() {
  if (isProcessingCrop) {
    return; // Prevent action if still processing
  }

  if (currentStep === 1) {
    // Check if media is uploaded
    if (mediaFiles.length === 0) {
      if (window.toastError) {
        toastError("Please upload at least one image to continue!");
      }
      return;
    }

    // Save crop data for current media if exists
    saveCropData();

    // Show loading
    setLoadingState(true);

    // Ensure all images have crop data before moving to step 2
    await ensureAllCropData();

    currentStep = 2;
    showStep(2);

    // Wait for step 2 preview to be fully ready (this will hide loading)
    await prepareStep2Preview();
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
    // For original, always use 1:1 crop frame
    width = maxSize;
    height = maxSize;
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
    // For original: fit entire image in 1:1 crop frame
    // Always use 1:1 crop frame, but zoom to fit entire image
    const cropFrameRatio = 1; // Always 1:1 for original

    // Compare image dimensions to determine how to fit
    if (imageNaturalHeight > imageNaturalWidth) {
      // Portrait: fit by height (height of image = height of crop frame)
      zoomLevel = cropFrameSize.height / (imageNaturalHeight * displayScale);
    } else {
      // Landscape or square: fit by width (width of image = width of crop frame)
      zoomLevel = cropFrameSize.width / (imageNaturalWidth * displayScale);
    }

    // Constrain zoom level
    zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel));

    // Reset position to center
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

  // Only handle images now
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

      // Update resolution and file size display
      const imageResolution = document.getElementById("imageResolution");
      if (imageResolution) {
        const fileSize = media.file.size;
        const fileSizeText = formatFileSize(fileSize);
        imageResolution.textContent = `${imageNaturalWidth} × ${imageNaturalHeight} • ${fileSizeText}`;
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

      // Show/hide zoom controls based on ratio
      const zoomControls = document.getElementById("zoomControls");
      if (zoomControls) {
        if (currentCropRatio === "original") {
          zoomControls.classList.add("hidden");
        } else {
          zoomControls.classList.remove("hidden");
        }
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
}

// Save crop data for current media
function saveCropData() {
  if (currentMediaIndex >= 0 && currentMediaIndex < mediaFiles.length) {
    const media = mediaFiles[currentMediaIndex];

    // Only save crop data for images
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

    // Crop area relative to image (in pixel values first)
    const cropX_px = (cropLeft - imgLeft) / finalScale;
    const cropY_px = (cropTop - imgTop) / finalScale;
    const cropWidth_px = cropFrameSize.width / finalScale;
    const cropHeight_px = cropFrameSize.height / finalScale;

    // Normalize to 0-1 range based on image dimensions
    const cropX_norm = Math.max(0, cropX_px / imageNaturalWidth);
    const cropY_norm = Math.max(0, cropY_px / imageNaturalHeight);
    const cropWidth_norm = Math.min(cropWidth_px / imageNaturalWidth, 1);
    const cropHeight_norm = Math.min(cropHeight_px / imageNaturalHeight, 1);

    media.cropData = {
      ratio: currentCropRatio,
      zoomLevel: zoomLevel,
      offsetX: imageOffsetX,
      offsetY: imageOffsetY,
      // Store both pixel values (for display/editing) and normalized values (for API)
      cropX_px: Math.max(0, cropX_px),
      cropY_px: Math.max(0, cropY_px),
      cropWidth_px: Math.min(cropWidth_px, imageNaturalWidth),
      cropHeight_px: Math.min(cropHeight_px, imageNaturalHeight),
      // Normalized values for backend (0-1)
      cropX: cropX_norm,
      cropY: cropY_norm,
      cropWidth: cropWidth_norm,
      cropHeight: cropHeight_norm,
      displayScale: displayScale,
      imageNaturalWidth: imageNaturalWidth,
      imageNaturalHeight: imageNaturalHeight,
    };
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

    const img = document.createElement("img");
    img.src = media.data;
    thumbDiv.appendChild(img);

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

  // Only show + button if less than max images
  if (mediaFiles.length < APP_CONFIG.MAX_UPLOAD_FILES) {
    const addBtn = document.createElement("button");
    addBtn.className = "thumbnail-add";
    addBtn.onclick = triggerMediaUpload;
    addBtn.innerHTML = '<i data-lucide="plus"></i>';
    container.appendChild(addBtn);
  }

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
  const sliderWrapper = document.getElementById("mediaSliderWrapper");
  const mediaInput = document.getElementById("postMediaInput");
  const charCount = document.getElementById("charCount");
  const imageResolution = document.getElementById("imageResolution");

  // 1. Reset UI form elements
  if (captionInput) captionInput.value = "";
  if (charCount) charCount.textContent = "0";
  if (imageResolution) imageResolution.textContent = "No image selected";
  if (mediaInput) mediaInput.value = "";

  // 2. Clean up image preview - force remove Base64 from memory
  if (imagePreview) {
    imagePreview.src = "";
    imagePreview.style.display = "none";
    imagePreview.removeAttribute("src"); // Force cleanup
  }

  // 3. Clean up video preview - force unload video data
  if (videoPreview) {
    videoPreview.pause();
    videoPreview.src = "";
    videoPreview.style.display = "none";
    videoPreview.load(); // Force unload video from memory
    videoPreview.removeAttribute("src");
  }

  // 4. Clear slider DOM
  if (sliderWrapper) sliderWrapper.innerHTML = "";

  // 5. Deep clean mediaFiles array - explicitly nullify large objects
  if (mediaFiles && mediaFiles.length > 0) {
    mediaFiles.forEach((media) => {
      // Nullify Base64 data (can be very large, ~7MB per image)
      if (media.data) {
        media.data = null;
      }
      // Nullify File object reference
      if (media.file) {
        media.file = null;
      }
      // Nullify crop data object
      if (media.cropData) {
        media.cropData = null;
      }
      // Nullify other properties
      media.dominantColor = null;
    });
  }

  // Clear the array
  mediaFiles = [];
  currentMediaIndex = 0;

  // 6. Reset all global state variables
  currentImage = null;
  imageNaturalWidth = 0;
  imageNaturalHeight = 0;
  containerWidth = 0;
  containerHeight = 0;
  displayScale = 1;
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  imageOffsetX = 0;
  imageOffsetY = 0;
  zoomLevel = 1;
  currentCropRatio = "1:1";
  globalCropRatio = "1:1";
  cropFrameSize = { width: 400, height: 400 };

  // 7. Reset UI state
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

// Extract dominant color moved to js/shared/image-utils.js

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

  // Check if adding these files would exceed the 8 image limit
  const remainingSlots = 8 - mediaFiles.length;
  if (files.length > remainingSlots) {
    if (window.toastError) {
      toastError(
        `You can only upload ${remainingSlots} more image(s). Maximum is 8 images per post.`,
      );
    }
    event.target.value = "";
    return;
  }

  Array.from(files).forEach((file) => {
    // Check if we've reached the limit
    if (mediaFiles.length >= APP_CONFIG.MAX_UPLOAD_FILES) {
      if (window.toastError) {
        toastError(`Maximum ${APP_CONFIG.MAX_UPLOAD_FILES} images per post!`);
      }
      return;
    }

    const isImage = file.type.startsWith("image/");

    if (!isImage) {
      if (window.toastError) {
        toastError("Please select image files only!");
      }
      return;
    }

    const maxSize = APP_CONFIG.MAX_UPLOAD_SIZE_MB * 1024 * 1024; 
    if (file.size > maxSize) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      if (window.toastError) {
        toastError(
          `Image "${file.name}" is ${fileSizeMB}MB. Maximum size is ${APP_CONFIG.MAX_UPLOAD_SIZE_MB}MB!`,
        );
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
      // Extract dominant color before creating media object
      const dominantColor = await extractDominantColor(e.target.result);

      const mediaData = {
        data: e.target.result,
        type: "image",
        file: file,
        cropData: null,
        dominantColor: dominantColor,
      };

      mediaFiles.push(mediaData);

      // Switch to the newly added media immediately
      currentMediaIndex = mediaFiles.length - 1;

      if (mediaFiles.length === 1) {
        showMediaPreview();
      } else {
        showMediaAtIndex(currentMediaIndex);
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

    if (count >= APP_CONFIG.MAX_POST_CONTENT_LENGTH) {
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
async function toggleEmojiPicker(event) {
  event.stopPropagation();

  const container = document.getElementById("emojiPickerContainer");
  if (!container) return;

  const header = event.currentTarget;
  const captionInput = document.getElementById("postCaption");

  // Check if closing
  if (container.classList.contains("show")) {
    if (window.EmojiUtils) {
      window.EmojiUtils.closePicker(container);
    } else {
       // Fallback manually if util not loaded (should not happen if set up right)
       container.classList.remove("show");
       container.innerHTML = "";
    }
    if (header) header.classList.remove("expanded");
  } else {
    // Opening
    if (window.EmojiUtils) {
        await window.EmojiUtils.togglePicker(container, (emoji) => {
            EmojiUtils.insertAtCursor(captionInput, emoji.native);
            updateCharCount(); // App specific logic
        });
        if (header) header.classList.add("expanded");
    } else {
        console.error("EmojiUtils not found");
    }
  }
}

// ================= PRIVACY SELECTOR =================

// Reset privacy selector to default (Public)
function resetPrivacySelector() {
  selectedPrivacy = 0;
  updatePrivacyUI(0);
}

// Toggle privacy dropdown
function togglePrivacyDropdown(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const dropdown = document.getElementById("privacyDropdown");
  if (!dropdown) return;

  const isVisible = dropdown.classList.contains("show");

  // Close emoji picker if open
  // Close emoji picker if open
  const emojiContainer = document.getElementById("emojiPickerContainer");
  if (emojiContainer && emojiContainer.classList.contains("show")) {
    if (window.EmojiUtils) {
        window.EmojiUtils.closePicker(emojiContainer);
    } else {
        emojiContainer.classList.remove("show");
        setTimeout(() => { emojiContainer.innerHTML = ""; }, 200);
    }
    
    // Reset chevron
    const chevron = document.getElementById("emojiChevron");
    if (chevron) {
        const header = chevron.closest(".section-header");
        if (header) header.classList.remove("expanded");
    }
  }

  if (isVisible) {
    dropdown.classList.remove("show");
  } else {
    // Position dropdown relative to privacy selector button
    const privacySelector = document.querySelector(".privacy-selector");
    if (privacySelector) {
      const rect = privacySelector.getBoundingClientRect();
      dropdown.style.top = rect.bottom + 8 + "px";
      dropdown.style.left = rect.left + "px";
    }
    dropdown.classList.add("show");
  }
}

// Select privacy option
function selectPrivacy(privacy) {
  selectedPrivacy = privacy;
  updatePrivacyUI(privacy);

  const dropdown = document.getElementById("privacyDropdown");
  if (dropdown) {
    dropdown.classList.remove("show");
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Update privacy UI based on selection
function updatePrivacyUI(privacy) {
  const privacyIcon = document.getElementById("privacyIcon");
  const privacyText = document.getElementById("privacyText");

  // Update icon and text
  const iconMap = {
    0: { icon: "globe", text: "Public" },
    1: { icon: "users", text: "Followers Only" },
    2: { icon: "lock", text: "Private" },
  };

  const selected = iconMap[privacy];
  if (privacyIcon && privacyText && selected) {
    privacyIcon.setAttribute("data-lucide", selected.icon);
    privacyText.textContent = selected.text;
  }

  // Update active state in dropdown options
  document.querySelectorAll(".privacy-option").forEach((option) => {
    const optionPrivacy = parseInt(option.getAttribute("data-privacy"));
    if (optionPrivacy === privacy) {
      option.classList.add("active");
    } else {
      option.classList.remove("active");
    }
  });

  // Reinitialize lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }
}

// Submit post
async function submitPost() {
  const captionInput = document.getElementById("postCaption");
  const caption = captionInput ? captionInput.value.trim() : "";

  // Require at least one image (media is now required)
  if (mediaFiles.length === 0) {
    if (window.toastError) {
      toastError("Please add at least one image to your post!");
    }
    return;
  }

  // Build FormData for multipart/form-data
  const formData = new FormData();
  formData.append("Content", caption || "");

  if (typeof selectedPrivacy !== "undefined" && selectedPrivacy !== null) {
    formData.append("Privacy", String(selectedPrivacy));
  }

  // FeedAspectRatio mapping
  const aspectMap = { original: 0, "1:1": 1, "4:5": 2, "16:9": 3 };
  if (globalCropRatio && aspectMap.hasOwnProperty(globalCropRatio)) {
    formData.append("FeedAspectRatio", String(aspectMap[globalCropRatio]));
  }

  // Helper function: convert base64 to Blob
  function dataURLToBlob(dataurl) {
    const arr = dataurl.split(",");
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  setLoadingState(true);
  try {
    // Prepare MediaCrops array
    const mediaCrops = [];

    for (let i = 0; i < mediaFiles.length; i++) {
      const m = mediaFiles[i];

      // Ensure crop data exists and normalize to 0-1
      if (m.cropData) {
        // Save crop data if current media
        if (i === currentMediaIndex) {
          saveCropData();
        }

        const cropData = m.cropData;

        // Normalize crop values to 0-1 range
        const cropX_norm = Math.max(
          0,
          (cropData.cropX_px || cropData.cropX || 0) /
            (cropData.imageNaturalWidth || 1),
        );
        const cropY_norm = Math.max(
          0,
          (cropData.cropY_px || cropData.cropY || 0) /
            (cropData.imageNaturalHeight || 1),
        );
        const cropWidth_norm = Math.min(
          1,
          (cropData.cropWidth_px || cropData.cropWidth || 1) /
            (cropData.imageNaturalWidth || 1),
        );
        const cropHeight_norm = Math.min(
          1,
          (cropData.cropHeight_px || cropData.cropHeight || 1) /
            (cropData.imageNaturalHeight || 1),
        );

        mediaCrops.push({
          index: i,
          cropX: cropX_norm,
          cropY: cropY_norm,
          cropWidth: cropWidth_norm,
          cropHeight: cropHeight_norm,
        });
      } else {
        // No crop data
        mediaCrops.push({
          index: i,
          cropX: 0,
          cropY: 0,
          cropWidth: 1,
          cropHeight: 1,
        });
      }

      // Convert image to Blob and append
      let imageDataUrl = m.data;
      if (m.cropData) {
        try {
          imageDataUrl = await createCleanCroppedImage(m);
        } catch (err) {
          console.warn("Failed to create cropped image for index", i, err);
          imageDataUrl = m.data;
        }
      }

      const blob = dataURLToBlob(imageDataUrl);
      const filename = m.file && m.file.name ? m.file.name : `image_${i}.png`;
      formData.append("MediaFiles", blob, filename);
    }

    // Append MediaCrops as JSON string
    const mediaCropsString = JSON.stringify(mediaCrops);
    formData.append("MediaCrops", mediaCropsString);

    // Debug log: show what we're sending
    const serverPreview = {
      Content: caption,
      Privacy:
        typeof selectedPrivacy !== "undefined" ? Number(selectedPrivacy) : null,
      FeedAspectRatio: aspectMap.hasOwnProperty(globalCropRatio)
        ? Number(aspectMap[globalCropRatio])
        : null,
      MediaCrops: mediaCropsString,
      MediaFilesCount: mediaFiles.length,
    };
    console.log("submitPost FormData preview:", serverPreview);

    // Show Instagram-style upload spinner (no progress percentage)
    showGlobalLoader();
    // Ensure processing flag
    isProcessingCrop = true;

    const res = await uploadFormDataWithProgress("/Posts", formData, (p) => {
      // Do nothing with progress - just keep spinner spinning
    });

    if (!res) throw new Error("No response from server");

    if (res.status === 201 || res.ok) {
      const data = await res.json().catch(() => null);
      if (window.toastSuccess) toastSuccess(`Post uploaded successfully!`);

      // Close modal automatically after successful upload
      const modal = document.getElementById("createPostModal");
      if (modal) {
        modal.classList.remove("show");
        document.body.style.overflow = "";
      }

      // Reset form
      resetPostForm();
      currentStep = 1;
      showStep(1);
    } else if (res.status === 401) {
      if (window.toastError) toastError("Unauthorized. Please login again.");
    } else {
      let errText = `Failed to create post (status ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.message) errText = errJson.message;
      } catch (_) {}
      if (window.toastError) toastError(errText);
    }
  } catch (err) {
    console.error("submitPost error:", err);
    if (window.toastError)
      toastError("Failed to create post. Please try again.");
  } finally {
    hideGlobalLoader();
    setLoadingState(false);
  }
}

// Rest of the file continues...

// ================= CROP RATIO FUNCTIONALITY =================

// Calculate crop data for a single image in background (without displaying)
function calculateCropDataForImage(media, ratio, tempCropFrameSize) {
  return new Promise((resolve) => {
    const tempImg = new Image();
    tempImg.onload = function () {
      const tempNaturalWidth = tempImg.naturalWidth;
      const tempNaturalHeight = tempImg.naturalHeight;

      const container = document.getElementById("mediaZoomContainer");
      if (!container) {
        resolve();
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const scaleX = containerRect.width / tempNaturalWidth;
      const scaleY = containerRect.height / tempNaturalHeight;
      const tempDisplayScale = Math.min(scaleX, scaleY);

      let tempZoomLevel = 1;
      const imageRatio = tempNaturalWidth / tempNaturalHeight;

      if (ratio === "original") {
        if (tempNaturalHeight > tempNaturalWidth) {
          tempZoomLevel =
            tempCropFrameSize.height / (tempNaturalHeight * tempDisplayScale);
        } else {
          tempZoomLevel =
            tempCropFrameSize.width / (tempNaturalWidth * tempDisplayScale);
        }
      } else {
        let cropRatio;
        if (ratio === "1:1") cropRatio = 1;
        else if (ratio === "4:5") cropRatio = 4 / 5;
        else if (ratio === "16:9") cropRatio = 16 / 9;

        if (imageRatio > cropRatio) {
          tempZoomLevel =
            tempCropFrameSize.height / (tempNaturalHeight * tempDisplayScale);
        } else {
          tempZoomLevel =
            tempCropFrameSize.width / (tempNaturalWidth * tempDisplayScale);
        }
      }

      tempZoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, tempZoomLevel));

      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;
      const finalScale = tempDisplayScale * tempZoomLevel;

      const cropLeft = centerX - tempCropFrameSize.width / 2;
      const cropTop = centerY - tempCropFrameSize.height / 2;

      const imgCenterX = centerX;
      const imgCenterY = centerY;
      const imgLeft = imgCenterX - (tempNaturalWidth * finalScale) / 2;
      const imgTop = imgCenterY - (tempNaturalHeight * finalScale) / 2;

      const cropX = (cropLeft - imgLeft) / finalScale;
      const cropY = (cropTop - imgTop) / finalScale;
      const cropWidth = tempCropFrameSize.width / finalScale;
      const cropHeight = tempCropFrameSize.height / finalScale;

      media.cropData = {
        ratio: ratio,
        zoomLevel: tempZoomLevel,
        offsetX: 0,
        offsetY: 0,
        // Pixel values (required by createCroppedImage in Step 2)
        cropX_px: Math.max(0, cropX),
        cropY_px: Math.max(0, cropY),
        cropWidth_px: Math.min(cropWidth, tempNaturalWidth),
        cropHeight_px: Math.min(cropHeight, tempNaturalHeight),
        // Normalized values (0-1) for API submission
        cropX: Math.max(0, cropX / tempNaturalWidth),
        cropY: Math.max(0, cropY / tempNaturalHeight),
        cropWidth: Math.min(cropWidth / tempNaturalWidth, 1),
        cropHeight: Math.min(cropHeight / tempNaturalHeight, 1),
        // Image dimensions (required by createCroppedImage)
        imageNaturalWidth: tempNaturalWidth,
        imageNaturalHeight: tempNaturalHeight,
        displayScale: tempDisplayScale,
      };

      resolve();
    };
    tempImg.src = media.data;
  });
}

// Recalculate crop data for all images with new ratio (in background)
async function recalculateAllCropDataInBackground(ratio) {
  const tempCropFrameSize = calculateCropFrameSize(ratio);

  const promises = mediaFiles.map((media) => {
    return calculateCropDataForImage(media, ratio, tempCropFrameSize);
  });

  await Promise.all(promises);
}

// Ensure all images have crop data before moving to step 2
async function ensureAllCropData() {
  const promises = mediaFiles.map((media, index) => {
    // All media are images now
    if (!media.cropData || media.cropData.ratio !== globalCropRatio) {
      return calculateCropDataForImage(media, globalCropRatio, cropFrameSize);
    }
    return Promise.resolve();
  });

  await Promise.all(promises);
}

async function changeCropRatio(ratio) {
  // Prevent changing ratio while processing
  if (isProcessingCrop) {
    return;
  }

  // Show loading state
  setLoadingState(true);

  // Small delay to let UI update
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Save crop data for current image before changing ratio
  saveCropData();

  // Store current index
  const originalIndex = currentMediaIndex;

  // Update global crop ratio
  globalCropRatio = ratio;
  currentCropRatio = ratio;

  // Recalculate crop frame size
  cropFrameSize = calculateCropFrameSize(ratio);

  // Calculate crop data for ALL images in background (without displaying them)
  await recalculateAllCropDataInBackground(ratio);

  // Restore the original index to keep the same image selected
  currentMediaIndex = originalIndex;

  // Now update only the currently visible image
  calculateOptimalCrop(ratio);
  updateImagePosition();
  updateZoomSlider();

  // Show/hide zoom controls based on ratio
  const zoomControls = document.getElementById("zoomControls");
  if (zoomControls) {
    if (ratio === "original") {
      zoomControls.classList.add("hidden");
    } else {
      zoomControls.classList.remove("hidden");
    }
  }

  // Update active ratio button
  document.querySelectorAll(".crop-ratio-card").forEach((card) => {
    card.classList.remove("active");
  });

  document
    .querySelectorAll(`[data-ratio="${ratio}"]`)
    .forEach((el) => el.classList.add("active"));

  // Save the crop data for current image
  saveCropData();

  // Update thumbnails to reflect active state
  updateThumbnails();

  lucide.createIcons();

  // Hide loading state
  setLoadingState(false);
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

    // Disable zoom for original ratio
    if (currentCropRatio === "original") return;

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

async function prepareStep2Preview() {
  if (mediaFiles.length === 0) return;

  // Show loading while building slider
  setLoadingState(true);

  currentMediaIndex = 0;

  // Wait for slider to fully build with all cropped images
  await buildSlider();

  updateThumbnailsStep2();

  const navigation = document.getElementById("mediaNavigation");

  if (mediaFiles.length > 1) {
    if (navigation) navigation.style.display = "block";
  } else {
    if (navigation) navigation.style.display = "none";
  }

  lucide.createIcons();

  // Hide loading after everything is ready
  setLoadingState(false);
}

// Build slider with all images
async function buildSlider() {
  const sliderWrapper = document.getElementById("mediaSliderWrapper");
  const container = document.getElementById("mediaReadonlyContainer");

  if (!sliderWrapper || !container) return;

  sliderWrapper.innerHTML = "";

  const track = document.createElement("div");
  track.className = "media-slider-track";
  track.id = "mediaSliderTrack";

  // Process all images in parallel and wait for all to complete
  const slidePromises = mediaFiles.map(async (media, i) => {
    const slide = document.createElement("div");
    slide.className = "media-slide";

    // Apply dynamic gradient based on dominant color
    const dominantColor = media.dominantColor || "var(--accent-primary)";
    slide.style.background = `linear-gradient(
      135deg,
      var(--bg-primary) 0%,
      ${dominantColor} 100%
    )`;

    // All media are images now
    const croppedSrc = await createCroppedImage(media);

    // Wait for image to actually load before returning
    await new Promise((resolve) => {
      const img = document.createElement("img");
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Still resolve on error to not block
      img.src = croppedSrc;
      slide.appendChild(img);
    });

    return slide;
  });

  // Wait for all slides to be ready
  const slides = await Promise.all(slidePromises);

  // Add all slides to track
  slides.forEach((slide) => track.appendChild(slide));

  sliderWrapper.appendChild(track);

  // Remove all crop classes
  container.className = "media-readonly-container";

  updateSliderPosition();
}

// Update slider position
function updateSliderPosition() {
  const track = document.getElementById("mediaSliderTrack");
  if (!track) return;

  const translateX = -currentMediaIndex * 100;
  track.style.transform = `translateX(${translateX}%)`;
}

// Create clean cropped image (exact dimensions, no padding) for Server Upload
function createCleanCroppedImage(media) {
  return new Promise((resolve) => {
    if (!media.cropData) {
      resolve(media.data);
      return;
    }

    const img = new Image();
    img.onload = function () {
      const cropData = media.cropData;

      // Canvas size matches the crop size exactly
      const canvasWidth = cropData.cropWidth_px;
      const canvasHeight = cropData.cropHeight_px;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      // Draw image offset by crop position
      ctx.drawImage(
        img,
        cropData.cropX_px,
        cropData.cropY_px,
        cropData.cropWidth_px,
        cropData.cropHeight_px,
        0,
        0,
        canvasWidth,
        canvasHeight
      );

      resolve(canvas.toDataURL());
    };
    img.src = media.data;
  });
}

// Create cropped image canvas - FIXED FOR ORIGINAL RATIO
function createCroppedImage(media) {
  return new Promise((resolve) => {
    if (!media.cropData) {
      resolve(media.data);
      return;
    }

    const img = new Image();
    img.onload = function () {
      const cropData = media.cropData;
      const ratio = cropData.ratio;

      // Determine canvas size based on crop ratio
      let canvasWidth, canvasHeight;

      if (ratio === "original") {
        // For original: canvas is square (1:1), but image maintains its aspect ratio
        // Determine canvas size to be square based on the longer dimension of the cropped area
        const maxDimension = Math.max(
          cropData.cropWidth_px,
          cropData.cropHeight_px,
        );
        canvasWidth = maxDimension;
        canvasHeight = maxDimension;
      } else if (ratio === "1:1") {
        // For 1:1: canvas is square with crop dimensions
        canvasWidth = cropData.cropWidth_px;
        canvasHeight = cropData.cropHeight_px;
      } else if (ratio === "4:5") {
        // For 4:5: canvas is square, crop area is 4:5 in the middle
        // Canvas height = crop height (which is the max dimension)
        canvasHeight = cropData.cropHeight_px;
        canvasWidth = canvasHeight; // Make it square

        // Crop width is smaller (4/5 of height)
        // We'll center the crop horizontally
      } else if (ratio === "16:9") {
        // For 16:9: canvas is square, crop area is 16:9 in the middle
        // Canvas width = crop width (which is the max dimension)
        canvasWidth = cropData.cropWidth_px;
        canvasHeight = canvasWidth; // Make it square

        // Crop height is smaller (9/16 of width)
        // We'll center the crop vertically
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      // Fill with black background
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Calculate position to center the cropped content
      let drawX = 0;
      let drawY = 0;
      let drawWidth = cropData.cropWidth_px;
      let drawHeight = cropData.cropHeight_px;

      if (ratio === "original") {
        // Center the image (keep aspect ratio)
        drawX = (canvasWidth - cropData.cropWidth_px) / 2;
        drawY = (canvasHeight - cropData.cropHeight_px) / 2;
      } else if (ratio === "4:5") {
        // Center horizontally
        drawX = (canvasWidth - cropData.cropWidth_px) / 2;
        drawY = 0;
      } else if (ratio === "16:9") {
        // Center vertically
        drawX = 0;
        drawY = (canvasHeight - cropData.cropHeight_px) / 2;
      }

      // Draw the cropped image
      ctx.drawImage(
        img,
        cropData.cropX_px,
        cropData.cropY_px,
        cropData.cropWidth_px,
        cropData.cropHeight_px,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      );

      resolve(canvas.toDataURL());
    };
    img.src = media.data;
  });
}

function updateThumbnailsStep2() {
  const container = document.getElementById("mediaThumbnailsStep2");
  if (!container) return;

  container.innerHTML = "";

  // Always display thumbnails if there are media files
  if (mediaFiles.length === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "flex";

  mediaFiles.forEach((media, index) => {
    const thumbDiv = document.createElement("div");
    thumbDiv.className = `thumbnail-item ${index === currentMediaIndex ? "active" : ""}`;
    thumbDiv.onclick = () => navigateToMedia(index);

    const img = document.createElement("img");
    img.src = media.data;
    thumbDiv.appendChild(img);

    container.appendChild(thumbDiv);
  });

  lucide.createIcons();
}

function navigateToMedia(index) {
  if (index >= 0 && index < mediaFiles.length) {
    currentMediaIndex = index;
    updateSliderPosition();

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
    newIndex = mediaFiles.length - 1;
  }
  navigateToMedia(newIndex);
}

function nextImage() {
  let newIndex = currentMediaIndex + 1;
  if (newIndex >= mediaFiles.length) {
    newIndex = 0;
  }
  navigateToMedia(newIndex);
}

// ================= MODAL EVENTS =================

document.addEventListener("click", (e) => {
  const modal = document.getElementById("createPostModal");
  if (e.target === modal) {
    closeCreatePostModal();
  }

  // Close privacy dropdown if clicking outside
  const privacyDropdown = document.getElementById("privacyDropdown");
  const privacySelector = e.target.closest(".privacy-selector");
  const privacyOption = e.target.closest(".privacy-option");

  if (privacyDropdown && !privacySelector && !privacyOption) {
    privacyDropdown.classList.remove("show");
  }

  // Close emoji picker if clicking outside
  // Close emoji picker if clicking outside
  const emojiContainer = document.getElementById("emojiPickerContainer");
  const isInsideEmojiPicker =
    e.target.closest("#emojiPickerContainer") ||
    e.target.closest("em-emoji-picker");

  if (
    emojiContainer &&
    emojiContainer.classList.contains("show") &&
    !isInsideEmojiPicker
  ) {
    if (window.EmojiUtils) {
      window.EmojiUtils.closePicker(emojiContainer);
    } else {
      emojiContainer.classList.remove("show");
      setTimeout(() => {
        emojiContainer.innerHTML = "";
      }, 200);
    }
    
    // Reset chevron
    const chevron = document.getElementById("emojiChevron");
    if (chevron) {
        const header = chevron.closest(".section-header");
        if (header) header.classList.remove("expanded");
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("createPostModal");
    if (modal && modal.classList.contains("show")) {
      // Prevent closing modal with Escape when upload/processing is running
      if (isProcessingCrop) return;
      // Don't close if discard confirmation is showing
      if (document.getElementById("discardConfirmOverlay")) return;

      // Close privacy dropdown if open
      const privacyDropdown = document.getElementById("privacyDropdown");
      if (privacyDropdown && privacyDropdown.classList.contains("show")) {
        privacyDropdown.classList.remove("show");
        return;
      }

      // Close emoji picker if open
      const emojiContainer = document.getElementById("emojiPickerContainer");
      if (emojiContainer && emojiContainer.classList.contains("show")) {
        if (window.EmojiUtils) {
            window.EmojiUtils.closePicker(emojiContainer);
        } else {
            emojiContainer.classList.remove("show");
            setTimeout(() => { emojiContainer.innerHTML = ""; }, 200);
        }
        
        // Reset chevron
        const chevron = document.getElementById("emojiChevron");
        if (chevron) {
            const header = chevron.closest(".section-header");
            if (header) header.classList.remove("expanded");
        }
        return;
      }

      closeCreatePostModal();
    }
  }
});

// Prevent accidental page close when modal has content
window.addEventListener("beforeunload", (e) => {
  // If an upload is in progress, warn the user before leaving
  if (isProcessingCrop) {
    e.preventDefault();
    e.returnValue = "";
    return "";
  }

  const modal = document.getElementById("createPostModal");
  if (modal && modal.classList.contains("show") && hasModalContent()) {
    e.preventDefault();
    e.returnValue = "";
    return "";
  }
});

// Toggle switches for advanced settings
document.addEventListener("click", (e) => {
  const toggleSwitch = e.target.closest(".toggle-switch");
  if (toggleSwitch && e.target.closest(".setting-item")) {
    toggleSwitch.classList.toggle("active");
  }
});
