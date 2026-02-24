// --- Variables ---
let player = null;
let isVR = false; // Start in normal mode
let files = [];
let currentIndex = 0;
let currentUrl = null;

// PAN & ZOOM STATE
let state = { scale: 1, x: 0, y: 0 };
const ZOOM_STEP = 0.2;
const PAN_STEP = 50; 

const playlistContainer = document.getElementById("playlist");
const folderPicker = document.getElementById("folderPicker");
const videoContainer = document.getElementById("video-container");
const modeBtn = document.getElementById("modeBtn");

// --- 1. TRANSFORM LOGIC (Normal Mode Only) ---
function updateTransform() {
  if (!player || isVR) return; 
  
  const techEl = player.el().querySelector('.vjs-tech'); 
  if(techEl) {
    techEl.style.transition = "transform 0.1s ease-out";
    techEl.style.transformOrigin = "center center";
    techEl.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  }
}

// --- ZOOM & PAN BUTTON CONTROLS ---

document.getElementById("zoomInBtn").onclick = () => { 
  if (isVR && player && player.vr && player.vr().camera) {
    let camera = player.vr().camera;
    camera.fov = Math.max(20, camera.fov - 10);
    camera.updateProjectionMatrix();
  } else {
    if(state.scale < 5) state.scale += ZOOM_STEP; 
    updateTransform(); 
  }
};

document.getElementById("zoomOutBtn").onclick = () => { 
  if (isVR && player && player.vr && player.vr().camera) {
    let camera = player.vr().camera;
    camera.fov = Math.min(100, camera.fov + 10);
    camera.updateProjectionMatrix();
  } else {
    if(state.scale > 1) state.scale -= ZOOM_STEP; 
    else { state.scale = 1; state.x = 0; state.y = 0; } 
    updateTransform(); 
  }
};

// D-Pad pans normal video.
document.getElementById("btnUp").onclick = () => { if(!isVR){ state.y -= PAN_STEP; updateTransform(); }};
document.getElementById("btnDown").onclick = () => { if(!isVR){ state.y += PAN_STEP; updateTransform(); }};
document.getElementById("btnLeft").onclick = () => { if(!isVR){ state.x -= PAN_STEP; updateTransform(); }};
document.getElementById("btnRight").onclick = () => { if(!isVR){ state.x += PAN_STEP; updateTransform(); }};

document.getElementById("resetBtn").onclick = () => {
  if (isVR && player && player.vr && player.vr().camera) {
    player.vr().camera.fov = 75;
    player.vr().camera.updateProjectionMatrix();
  }
  state = { scale: 1, x: 0, y: 0 };
  updateTransform();
};

// --- MOBILE TOUCH DRAG (Normal Mode) ---
let isDragging = false;
let startX, startY;

videoContainer.addEventListener('touchstart', (e) => {
  if (isVR) return; 
  if (e.touches.length === 1) {
    isDragging = true;
    startX = e.touches[0].clientX - state.x;
    startY = e.touches[0].clientY - state.y;
  }
}, {passive: true});

videoContainer.addEventListener('touchmove', (e) => {
  if (!isDragging || isVR) return;
  if (e.touches.length === 1) {
    state.x = e.touches[0].clientX - startX;
    state.y = e.touches[0].clientY - startY;
    updateTransform();
  }
}, {passive: true});

videoContainer.addEventListener('touchend', () => { isDragging = false; });

// --- 2. PLAYER LOGIC ---
function initPlayer(url, time = 0) {
  if (player) {
    player.dispose();
    player = null;
  }

  videoContainer.innerHTML = `
    <video id="player" class="video-js vjs-default-skin vjs-big-play-centered" controls crossorigin="anonymous" playsinline></video>
  `;

  player = videojs('player');

  player.ready(() => {
    if (isVR) {
      player.vr({ projection: '360', motionControls: true });
      modeBtn.innerText = "Mode: 360 VR";
      modeBtn.style.background = "#0066cc";
    } else {
      modeBtn.innerText = "Mode: Normal";
      modeBtn.style.background = "#444";
    }

    if (url) {
      player.src({ src: url, type: 'video/mp4' }); 
      player.currentTime(time);
      player.play().catch(()=>{});
    }

    if(!isVR) setTimeout(updateTransform, 200);
  });

  player.on('ended', () => {
    if(files.length > 0) {
      currentIndex = (currentIndex + 1) % files.length;
      playVideo(currentIndex);
    }
  });
}

initPlayer(null);

// --- 3. MODE SWITCHING ---
modeBtn.addEventListener("click", () => {
  isVR = !isVR; 
  let t = player ? player.currentTime() : 0;
  state = { scale: 1, x: 0, y: 0 }; 
  initPlayer(currentUrl, t);
});

// --- 4. FILE LOADING & PLAYLIST ---
document.getElementById("loadBtn").onclick = () => folderPicker.click();

folderPicker.onchange = (e) => {
  files = Array.from(e.target.files).filter(f => f.type.startsWith('video/'));
  if (files.length === 0) return alert("No video files found!");
  loadSidebar();
  playVideo(0);
};

function loadSidebar() {
  playlistContainer.innerHTML = "";
  files.forEach((file, i) => {
    const item = document.createElement("div");
    item.className = "video-item";
    
    const v = document.createElement("video");
    v.muted = true; v.loop = true;
    
    let previewUrl = null;
    
    if (window.matchMedia("(hover: hover)").matches) {
      item.onmouseenter = () => { 
        if (!previewUrl) previewUrl = URL.createObjectURL(file);
        v.src = previewUrl; 
        v.play().catch(()=>{}); 
      };
      item.onmouseleave = () => { 
        v.pause(); 
        v.removeAttribute('src'); 
        v.load(); 
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = null;
        }
      };
    } else {
      v.src = URL.createObjectURL(file) + "#t=0.1";
    }
    
    const s = document.createElement("span");
    s.textContent = (i+1) + ". " + file.name;
    
    item.appendChild(v); item.appendChild(s);
    item.onclick = () => playVideo(i);
    playlistContainer.appendChild(item);
  });
  highlightActive(0);
}

function playVideo(i) {
  if (!files[i]) return;
  currentIndex = i;
  highlightActive(i);
  const file = files[i];
  
  if(currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(file);
  
  if(player) {
    player.src({ src: currentUrl, type: file.type });
    player.play().catch(()=>{});
    if(!isVR) setTimeout(updateTransform, 100);
  } else {
    initPlayer(currentUrl);
  }
}

function highlightActive(i) {
  document.querySelectorAll(".video-item").forEach((el, idx) => el.classList.toggle("active", idx === i));
}

document.getElementById("nextBtn").onclick = () => {
  if(files.length > 0) playVideo((currentIndex + 1) % files.length);
};
