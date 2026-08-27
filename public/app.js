// Supabase configuration
const SUPABASE_URL = "https://nqvmupmzxgytvkewklpo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xdm11cG16eGd5dHZrZXdrbHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MTEyNjksImV4cCI6MjEwMzM4NzI2OX0.zbIEvauFtK3Y7dwWoHR7rNJkyab76Dxx5uRbP_jP5gM";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let pdfs = [];
let activeSemester = null; // null or string 'Semester 1'..'Semester 8'
let activeSubjectFolder = null; // null or string subject name
let currentType = "all"; // 'all', 'pdf', 'photo'
let currentViewMode = "semesters"; // 'semesters', 'folders', 'grid'

const ALL_SEMESTERS = [
  "Semester 1", "Semester 2", "Semester 3", "Semester 4",
  "Semester 5", "Semester 6", "Semester 7", "Semester 8"
];

function esc(v = "") {
  return String(v).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function formatDate(v) {
  if (!v) return "Recent";
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(v));
}

function filtered() {
  const q = $("#search").value.trim().toLowerCase();
  return pdfs.filter(p => {
    const semName = p.semester || "Semester 1";
    const matchQuery = !q || `${p.title} ${p.subject} ${semName} ${p.description}`.toLowerCase().includes(q);
    const matchSem = activeSemester ? semName.toLowerCase() === activeSemester.toLowerCase() : true;
    const matchSub = activeSubjectFolder ? p.subject.toLowerCase() === activeSubjectFolder.toLowerCase() : true;
    const itemType = p.fileType || (/\.(png|jpg|jpeg|webp|gif|svg)($|\?)/i.test(p.driveUrl || "") ? "photo" : "pdf");
    const matchType = currentType === "all" || itemType === currentType;
    return matchQuery && matchSem && matchSub && matchType;
  });
}

async function load() {
  try {
    const res = await fetch("/api/pdfs");
    pdfs = await res.json();
    if (!Array.isArray(pdfs)) throw new Error(pdfs.error || "Failed to load library data");

    const subjectsList = [...new Set(pdfs.map(p => p.subject))].sort();

    // Update Hero Stats Counters
    const pdfCount = pdfs.filter(p => (p.fileType || "pdf") === "pdf").length;
    const photoCount = pdfs.filter(p => p.fileType === "photo").length;
    
    $("#statCount").textContent = `${pdfs.length}+`;
    $("#subjectFolderCount").textContent = subjectsList.length;
    $("#pdfStatCount").textContent = pdfCount;
    $("#photoStatCount").textContent = photoCount;

    // Render Semester Filter Chips
    $("#semesterChips").innerHTML = `<button class="sem-chip ${!activeSemester ? "active" : ""}" data-sem="all">All Semesters (${pdfs.length})</button>` +
      ALL_SEMESTERS.map(s => {
        const count = pdfs.filter(x => (x.semester || "Semester 1").toLowerCase() === s.toLowerCase()).length;
        const isActive = activeSemester && activeSemester.toLowerCase() === s.toLowerCase();
        return `<button class="sem-chip ${isActive ? "active" : ""}" data-sem="${esc(s)}">${esc(s)} (${count})</button>`;
      }).join("");

    $$("#semesterChips .sem-chip").forEach(btn => {
      btn.onclick = () => {
        $$("#semesterChips .sem-chip").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        const sem = btn.dataset.sem;
        if (sem === "all") {
          activeSemester = null;
          activeSubjectFolder = null;
          currentViewMode = "semesters";
        } else {
          openSemester(sem);
        }
        render();
      };
    });

    render();
  } catch (err) {
    $("#loading").innerHTML = `<p style="color:#ef4444">${esc(err.message)}</p>`;
  }
}

function render() {
  $("#loading").classList.add("hidden");
  
  if (currentViewMode === "semesters" && !activeSemester && !activeSubjectFolder) {
    renderSemesters();
  } else if (currentViewMode === "folders" || (activeSemester && !activeSubjectFolder)) {
    renderSubjectFolders();
  } else {
    renderCardsGrid();
  }
}

// 1. Render Semesters Grid (Level 1)
function renderSemesters() {
  $("#breadcrumbBar").classList.add("hidden");
  $("#semestersGrid").classList.remove("hidden");
  $("#foldersGrid").classList.add("hidden");
  $("#grid").classList.add("hidden");

  const q = $("#search").value.trim().toLowerCase();

  const semestersMap = ALL_SEMESTERS.map(sem => {
    const semFiles = pdfs.filter(p => (p.semester || "Semester 1").toLowerCase() === sem.toLowerCase());
    const subjects = [...new Set(semFiles.map(x => x.subject))];
    const pdfCount = semFiles.filter(x => (x.fileType || "pdf") === "pdf").length;
    const photoCount = semFiles.filter(x => x.fileType === "photo").length;
    return {
      name: sem,
      fileCount: semFiles.length,
      subjectCount: subjects.length,
      pdfCount,
      photoCount,
      subjects: subjects.slice(0, 3).join(", ")
    };
  }).filter(s => !q || s.name.toLowerCase().includes(q) || s.subjects.toLowerCase().includes(q));

  $("#count").textContent = `8 Semesters (${filtered().length} total files)`;
  $("#empty").classList.toggle("hidden", !!semestersMap.length);

  $("#semestersGrid").innerHTML = semestersMap.map(s => `
    <div class="semester-card" data-sem="${esc(s.name)}">
      <div class="sem-badge-icon">🎓</div>
      <h3 class="sem-title">${esc(s.name)}</h3>
      <div class="sem-stats-pill">
        <strong>${s.fileCount} files</strong> • ${s.subjectCount} subjects (${s.pdfCount} PDFs, ${s.photoCount} Photos)
      </div>
      <div class="sem-footer">
        <span>${s.subjects ? esc(s.subjects) + "..." : "Upload files to this semester"}</span>
        <span class="open-sem-btn">
          Open Semester
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </span>
      </div>
    </div>
  `).join("");

  $$(".semester-card").forEach(card => {
    card.onclick = () => openSemester(card.dataset.sem);
  });
}

// 2. Render Subject-wise Folders (Level 2)
function renderSubjectFolders() {
  $("#semestersGrid").classList.add("hidden");
  $("#foldersGrid").classList.remove("hidden");
  $("#grid").classList.add("hidden");

  $("#breadcrumbBar").classList.remove("hidden");
  $("#breadcrumbSem").textContent = activeSemester || "All Semesters";
  $("#breadcrumbSubSep").classList.add("hidden");
  $("#breadcrumbSub").classList.add("hidden");

  const q = $("#search").value.trim().toLowerCase();
  const subjectsMap = {};

  pdfs.forEach(p => {
    const semName = p.semester || "Semester 1";
    if (activeSemester && semName.toLowerCase() !== activeSemester.toLowerCase()) return;
    const itemType = p.fileType || (/\.(png|jpg|jpeg|webp|gif|svg)($|\?)/i.test(p.driveUrl || "") ? "photo" : "pdf");
    if (currentType !== "all" && itemType !== currentType) return;
    if (q && !`${p.title} ${p.subject} ${semName} ${p.description}`.toLowerCase().includes(q)) return;

    if (!subjectsMap[p.subject]) {
      subjectsMap[p.subject] = {
        name: p.subject,
        semester: semName,
        count: 0,
        pdfCount: 0,
        photoCount: 0,
        latest: p.createdAt
      };
    }
    subjectsMap[p.subject].count++;
    if (itemType === "photo") subjectsMap[p.subject].photoCount++;
    else subjectsMap[p.subject].pdfCount++;
  });

  const folderList = Object.values(subjectsMap).sort((a, b) => a.name.localeCompare(b.name));
  
  $("#count").textContent = `${folderList.length} Subject Folders (${filtered().length} files)`;
  $("#empty").classList.toggle("hidden", !!folderList.length);

  $("#foldersGrid").innerHTML = folderList.map(f => `
    <div class="folder-card" data-folder="${esc(f.name)}">
      <div class="folder-icon-box">📁</div>
      <h3 class="folder-title">${esc(f.name)}</h3>
      <div class="folder-count-pill">
        <strong>${f.count} items</strong> • ${f.pdfCount} PDFs, ${f.photoCount} Photos
      </div>
      <div class="folder-footer">
        <span>Updated ${formatDate(f.latest)}</span>
        <span class="open-folder-btn">
          Open Folder
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </span>
      </div>
    </div>
  `).join("");

  $$(".folder-card").forEach(card => {
    card.onclick = () => openSubjectFolder(card.dataset.folder);
  });
}

// 3. Render Cards Grid (Level 3)
function renderCardsGrid() {
  const list = filtered();
  $("#count").textContent = `${list.length} Files`;
  $("#empty").classList.toggle("hidden", !!list.length);
  $("#semestersGrid").classList.add("hidden");
  $("#foldersGrid").classList.add("hidden");
  $("#grid").classList.remove("hidden");

  if (activeSemester || activeSubjectFolder) {
    $("#breadcrumbBar").classList.remove("hidden");
    $("#breadcrumbSem").textContent = activeSemester || "All Semesters";
    if (activeSubjectFolder) {
      $("#breadcrumbSubSep").classList.remove("hidden");
      $("#breadcrumbSub").classList.remove("hidden");
      $("#breadcrumbSub").textContent = activeSubjectFolder;
    } else {
      $("#breadcrumbSubSep").classList.add("hidden");
      $("#breadcrumbSub").classList.add("hidden");
    }
  } else {
    $("#breadcrumbBar").classList.add("hidden");
  }

  $("#grid").innerHTML = list.map(p => {
    const isPhoto = p.fileType === "photo" || /\.(png|jpg|jpeg|webp|gif|svg)($|\?)/i.test(p.driveUrl || "");
    const badgeIcon = isPhoto ? `
      <div class="doc-icon-badge photo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
      </div>` : `
      <div class="doc-icon-badge">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
      </div>`;

    const isDirectImage = /\.(png|jpg|jpeg|webp|gif|svg)($|\?)/i.test(p.driveUrl || "") || p.driveUrl.includes("supabase.co/storage");
    const photoThumbnail = (isPhoto && isDirectImage) ? `
      <div class="photo-thumbnail-box" data-lightbox="${p.id}">
        <img src="${esc(p.driveUrl)}" alt="${esc(p.title)}" loading="lazy">
        <span class="photo-overlay-tag">Click to Expand</span>
      </div>` : "";

    return `
      <article class="card">
        <div class="card-top">
          ${badgeIcon}
          <span class="subject-tag">${esc(p.semester || "Semester 1")} • ${esc(p.subject)}</span>
        </div>
        ${photoThumbnail}
        <h3 class="card-title">${esc(p.title)}</h3>
        <p class="card-desc">${esc(p.description || (isPhoto ? "Photo note or diagram material." : "Study guide and reference document."))}</p>
        <div class="card-meta">
          <span>Added ${formatDate(p.createdAt)}</span>
          <span class="meta-views">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            ${p.views || 0} views
          </span>
        </div>
        <div class="card-actions">
          <a class="btn-card-view" ${isPhoto ? `data-photo-view="${p.id}"` : `target="_blank" rel="noopener" href="${p.previewUrl}"`} data-v="${p.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            ${isPhoto ? "View Photo" : "Preview"}
          </a>
          <a class="btn-card-download" target="_blank" rel="noopener" href="${p.downloadUrl}" download>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download
          </a>
        </div>
      </article>
    `;
  }).join("");

  $$("[data-v]").forEach(a => {
    a.onclick = () => fetch(`/api/view?id=${a.dataset.v}`, { method: "POST" }).catch(() => {});
  });

  $$("[data-photo-view], [data-lightbox]").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.photoView || el.dataset.lightbox;
      const item = pdfs.find(x => x.id === id);
      if (item) openPhotoLightbox(item);
    };
  });

  $$(".card").forEach(attachCard3DEffect);
}

// Navigation Triggers
function openSemester(semesterName) {
  activeSemester = semesterName;
  activeSubjectFolder = null;
  currentViewMode = "folders";
  $("#viewSemesterTab").classList.remove("active");
  $("#viewFolderTab").classList.add("active");
  $("#viewGridTab").classList.remove("active");
  render();
}

function openSubjectFolder(subjectName) {
  activeSubjectFolder = subjectName;
  currentViewMode = "grid";
  $("#viewSemesterTab").classList.remove("active");
  $("#viewFolderTab").classList.remove("active");
  $("#viewGridTab").classList.add("active");
  render();
}

function resetToSemesters() {
  activeSemester = null;
  activeSubjectFolder = null;
  currentViewMode = "semesters";
  $("#viewSemesterTab").classList.add("active");
  $("#viewFolderTab").classList.remove("active");
  $("#viewGridTab").classList.remove("active");
  render();
}

$("#backToSemestersBtn").onclick = resetToSemesters;

// View Mode Tabs (Semesters vs Folders vs Grid)
$("#viewSemesterTab").onclick = resetToSemesters;

$("#viewFolderTab").onclick = () => {
  activeSubjectFolder = null;
  currentViewMode = "folders";
  $("#viewSemesterTab").classList.remove("active");
  $("#viewFolderTab").classList.add("active");
  $("#viewGridTab").classList.remove("active");
  render();
};

$("#viewGridTab").onclick = () => {
  currentViewMode = "grid";
  $("#viewSemesterTab").classList.remove("active");
  $("#viewFolderTab").classList.remove("active");
  $("#viewGridTab").classList.add("active");
  render();
};

// Category Format Tab Switcher (All / PDF / Photo)
$$(".type-tab").forEach(tab => {
  tab.onclick = () => {
    $$(".type-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentType = tab.dataset.type;
    render();
  };
});

// Search input handling & clear button
const searchInput = $("#search");
const clearSearchBtn = $("#clearSearch");

searchInput.oninput = () => {
  clearSearchBtn.classList.toggle("hidden", !searchInput.value.trim());
  render();
};

clearSearchBtn.onclick = () => {
  searchInput.value = "";
  clearSearchBtn.classList.add("hidden");
  render();
};

// 3D Mouse Parallax Effect for Hero Stage
const heroStage = $("#heroStage");
if (heroStage) {
  const heroWrapper = $(".hero-3d-wrapper");
  heroWrapper.addEventListener("mousemove", (e) => {
    const rect = heroWrapper.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rotateX = (-y / rect.height) * 22;
    const rotateY = (x / rect.width) * 22;

    heroStage.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  });

  heroWrapper.addEventListener("mouseleave", () => {
    heroStage.style.transform = `rotateX(0deg) rotateY(0deg)`;
  });
}

function attachCard3DEffect(card) {
  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
  });
  
  card.addEventListener("mouseleave", () => {
    card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)`;
  });
}

/* PUBLIC FILE & LINK UPLOADER MODAL LOGIC */
const publicUploadModal = $("#publicUploadModal");
const openPublicUploadBtn = $("#openPublicUploadBtn");
const heroUploadBtn = $("#heroUploadBtn");
const publicUploadClose = $("#publicUploadClose");
const uploadSemesterSelect = $("#uploadSemesterSelect");
const uploadSubjectInput = $("#uploadSubjectInput");
const pathPreviewText = $("#pathPreviewText");

function slugify(text) {
  return String(text || "general")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function updatePathPreview() {
  const sem = uploadSemesterSelect.value || "Semester 1";
  const slug = slugify(uploadSubjectInput.value) || "general";
  pathPreviewText.textContent = `Google Drive / ${sem} / ${slug} /`;
}

uploadSemesterSelect.onchange = updatePathPreview;
uploadSubjectInput.oninput = updatePathPreview;

function openPublicUploadModal() {
  publicUploadModal.classList.remove("hidden");
  updatePathPreview();
}

function closePublicUploadModal() {
  publicUploadModal.classList.add("hidden");
  $("#publicUploadForm").reset();
  selectedBase64File = null;
  $("#filePickerLabel").textContent = "Supports PDF, PNG, JPG, WEBP (Max 10MB)";
  $("#uploadStatusMsg").textContent = "";
}

openPublicUploadBtn.onclick = openPublicUploadModal;
if (heroUploadBtn) heroUploadBtn.onclick = openPublicUploadModal;
publicUploadClose.onclick = closePublicUploadModal;
publicUploadModal.onclick = (e) => { if (e.target === publicUploadModal) closePublicUploadModal(); };

let uploadMode = "file";
const methodFileTab = $("#methodFileTab");
const methodLinkTab = $("#methodLinkTab");
const fileUploadSection = $("#fileUploadSection");
const linkUploadSection = $("#linkUploadSection");

methodFileTab.onclick = () => {
  uploadMode = "file";
  methodFileTab.classList.add("active");
  methodLinkTab.classList.remove("active");
  fileUploadSection.classList.remove("hidden");
  linkUploadSection.classList.add("hidden");
};

methodLinkTab.onclick = () => {
  uploadMode = "link";
  methodLinkTab.classList.add("active");
  methodFileTab.classList.remove("active");
  linkUploadSection.classList.remove("hidden");
  fileUploadSection.classList.add("hidden");
};

let selectedBase64File = null;
const filePicker = $("#filePicker");
const filePickerLabel = $("#filePickerLabel");

filePicker.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alert("File size exceeds 10MB limit.");
    filePicker.value = "";
    return;
  }
  filePickerLabel.textContent = `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`;
  
  const reader = new FileReader();
  reader.onload = () => {
    selectedBase64File = {
      fileData: reader.result,
      fileName: file.name,
      mimeType: file.type
    };
  };
  reader.readAsDataURL(file);
};

$("#publicUploadForm").onsubmit = async (e) => {
  e.preventDefault();
  const statusMsg = $("#uploadStatusMsg");
  const submitBtn = $("#submitUploadBtn");
  statusMsg.textContent = "";
  
  const formData = new FormData(e.target);
  const title = formData.get("title");
  const subjectVal = formData.get("subject");
  const semesterVal = formData.get("semester");
  const description = formData.get("description");
  const fileType = formData.get("fileType");
  const driveUrl = formData.get("driveUrl");

  if (uploadMode === "file" && !selectedBase64File) {
    statusMsg.style.color = "#ef4444";
    statusMsg.textContent = "Please select a file to upload.";
    return;
  }
  if (uploadMode === "link" && !driveUrl?.trim()) {
    statusMsg.style.color = "#ef4444";
    statusMsg.textContent = "Please enter a valid Google Drive or web share link.";
    return;
  }

  submitBtn.disabled = true;
  statusMsg.style.color = "#a5b4fc";
  statusMsg.textContent = `Uploading file to ${semesterVal} > ${subjectVal}...`;

  try {
    const payload = {
      title,
      subject: subjectVal,
      semester: semesterVal,
      description,
      fileType,
      ...(uploadMode === "file" ? selectedBase64File : { driveUrl })
    };

    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");

    statusMsg.style.color = "#34d399";
    statusMsg.textContent = `Success! Added to ${semesterVal} > ${subjectVal}. Opening folder...`;
    
    setTimeout(async () => {
      closePublicUploadModal();
      await load();
      openSemester(semesterVal);
      openSubjectFolder(subjectVal);
    }, 1200);
  } catch (err) {
    statusMsg.style.color = "#ef4444";
    statusMsg.textContent = err.message || "An error occurred during upload.";
  } finally {
    submitBtn.disabled = false;
  }
};

/* PHOTO LIGHTBOX PREVIEW MODAL LOGIC */
const photoLightbox = $("#photoLightbox");
const lightboxClose = $("#lightboxClose");
const lightboxImg = $("#lightboxImg");
const lightboxTitle = $("#lightboxTitle");
const lightboxSub = $("#lightboxSub");
const lightboxDownloadBtn = $("#lightboxDownloadBtn");

function openPhotoLightbox(item) {
  photoLightbox.classList.remove("hidden");
  lightboxImg.src = item.driveUrl;
  lightboxTitle.textContent = item.title;
  lightboxSub.textContent = `${item.semester || "Semester 1"} • ${item.subject} • Added ${formatDate(item.createdAt)}`;
  lightboxDownloadBtn.href = item.downloadUrl;
}

lightboxClose.onclick = () => photoLightbox.classList.add("hidden");
photoLightbox.onclick = (e) => { if (e.target === photoLightbox) photoLightbox.classList.add("hidden"); };

/* ADMIN MODAL & TABBED SUITE */
const modal = $("#modal");
$("#adminBtn").onclick = async () => {
  modal.classList.remove("hidden");
  const { data: { session } } = await sb.auth.getSession();
  session ? showAdminPanel() : showLoginForm();
};

$("#close").onclick = () => modal.classList.add("hidden");
modal.onclick = e => { if (e.target === modal) modal.classList.add("hidden"); };

function showLoginForm() {
  $("#loginView").classList.remove("hidden");
  $("#adminView").classList.add("hidden");
}

function showAdminPanel() {
  $("#loginView").classList.add("hidden");
  $("#adminView").classList.remove("hidden");
  switchAdminTab("folders");
  loadAdminItems();
  checkGDriveStatus();
  resetAdminForm();
}

const adminTabFolders = $("#adminTabFolders");
const adminTabAdd = $("#adminTabAdd");
const adminTabGDrive = $("#adminTabGDrive");
const adminPaneFolders = $("#adminPaneFolders");
const adminPaneAdd = $("#adminPaneAdd");
const adminPaneGDrive = $("#adminPaneGDrive");

function switchAdminTab(tabName) {
  [adminTabFolders, adminTabAdd, adminTabGDrive].forEach(t => t.classList.remove("active"));
  [adminPaneFolders, adminPaneAdd, adminPaneGDrive].forEach(p => p.classList.add("hidden"));

  if (tabName === "folders") {
    adminTabFolders.classList.add("active");
    adminPaneFolders.classList.remove("hidden");
  } else if (tabName === "add") {
    adminTabAdd.classList.add("active");
    adminPaneAdd.classList.remove("hidden");
  } else if (tabName === "gdrive") {
    adminTabGDrive.classList.add("active");
    adminPaneGDrive.classList.remove("hidden");
  }
}

adminTabFolders.onclick = () => switchAdminTab("folders");
adminTabAdd.onclick = () => switchAdminTab("add");
adminTabGDrive.onclick = () => switchAdminTab("gdrive");

$("#login").onsubmit = async e => {
  e.preventDefault();
  $("#loginErr").textContent = "";
  const formData = new FormData(e.target);
  const { error } = await sb.auth.signInWithPassword({
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (error) {
    $("#loginErr").textContent = error.message;
  } else {
    showAdminPanel();
  }
};

$("#logout").onclick = async () => {
  await sb.auth.signOut();
  showLoginForm();
};

async function getAuthToken() {
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new Error("Authentication session expired.");
  return data.session.access_token;
}

async function adminApi(method, body, id = "") {
  const token = await getAuthToken();
  const url = `/api/admin${id ? `?id=${encodeURIComponent(id)}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Admin request failed");
  return data;
}

async function loadAdminItems() {
  try {
    const list = await adminApi("GET");
    $("#adminCount").textContent = `${list.length} total files`;

    // Group list by Semester -> Subject Folder
    const semGroups = {};
    list.forEach(p => {
      const sem = p.semester || "Semester 1";
      if (!semGroups[sem]) semGroups[sem] = {};
      if (!semGroups[sem][p.subject]) semGroups[sem][p.subject] = [];
      semGroups[sem][p.subject].push(p);
    });

    const sortedSemesters = ALL_SEMESTERS.filter(s => semGroups[s]);

    $("#adminFolderList").innerHTML = sortedSemesters.map(sem => `
      <div class="admin-sem-group">
        <div class="admin-sem-head">
          <strong>🎓 ${esc(sem)} Directory</strong>
          <span>${Object.values(semGroups[sem]).reduce((acc, curr) => acc + curr.length, 0)} files</span>
        </div>
        ${Object.keys(semGroups[sem]).sort().map(subj => `
          <div class="admin-folder-group">
            <div class="admin-folder-head">
              <strong>📁 ${esc(subj)} Folder</strong>
              <span>${semGroups[sem][subj].length} files</span>
            </div>
            <div class="admin-folder-items">
              ${semGroups[sem][subj].map(p => `
                <div class="admin-item">
                  <div class="admin-item-info">
                    <strong>[${(p.fileType || "pdf").toUpperCase()}] ${esc(p.title)}</strong>
                    <small>${p.views || 0} views • Added ${formatDate(p.createdAt)}</small>
                  </div>
                  <div class="admin-item-actions">
                    <button class="btn-ghost btn-sm" data-e="${p.id}">Edit</button>
                    <button class="btn-ghost danger btn-sm" data-d="${p.id}">Delete</button>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `).join("");

    $$("#adminFolderList [data-e]").forEach(btn => {
      btn.onclick = () => {
        editAdminItem(list.find(p => p.id === btn.dataset.e));
        switchAdminTab("add");
      };
    });

    $$("#adminFolderList [data-d]").forEach(btn => {
      btn.onclick = async () => {
        const item = list.find(x => x.id === btn.dataset.d);
        if (!confirm(`Delete "${item.title}"?`)) return;
        await adminApi("DELETE", null, item.id);
        await loadAdminItems();
        await load();
      };
    });
  } catch (err) {
    $("#adminFolderList").innerHTML = `<p style="color:#ef4444">${esc(err.message)}</p>`;
  }
}

async function checkGDriveStatus() {
  try {
    const res = await fetch("/api/gdrive");
    const data = await res.json();
    const badge = $("#gdriveStatusBadge");
    const statusText = $("#gdriveStatusText");

    if (data.configured && data.status === "connected") {
      badge.style.background = "rgba(16, 185, 129, 0.12)";
      badge.style.borderColor = "rgba(16, 185, 129, 0.3)";
      badge.style.color = "#34d399";
      statusText.textContent = `Google Drive Connected (Service Account: ${data.clientEmail})`;
    } else {
      badge.style.background = "rgba(245, 158, 11, 0.12)";
      badge.style.borderColor = "rgba(245, 158, 11, 0.3)";
      badge.style.color = "#fbbf24";
      statusText.textContent = "Google Drive API Keys Not Configured in .env (Using Supabase Storage Fallback)";
    }
  } catch {
    $("#gdriveStatusText").textContent = "Using Cloud Storage Fallback";
  }
}

function resetAdminForm() {
  $("#pdfForm").reset();
  $("#pdfForm [name=id]").value = "";
  $("#save").textContent = "Save Resource";
  $("#cancel").classList.add("hidden");
  $("#formMsg").textContent = "";
}

function editAdminItem(p) {
  const f = $("#pdfForm");
  f.id.value = p.id;
  f.title.value = p.title;
  f.subject.value = p.subject;
  f.semester.value = p.semester || "Semester 1";
  f.fileType.value = p.fileType || "pdf";
  f.description.value = p.description || "";
  f.driveUrl.value = p.driveUrl || "";
  $("#save").textContent = "Save Changes";
  $("#cancel").classList.remove("hidden");
  f.scrollIntoView({ behavior: "smooth" });
}

$("#cancel").onclick = resetAdminForm;

$("#pdfForm").onsubmit = async e => {
  e.preventDefault();
  $("#formMsg").textContent = "";
  const f = new FormData(e.target);
  const id = f.get("id");
  const body = {
    title: f.get("title"),
    subject: f.get("subject"),
    semester: f.get("semester"),
    fileType: f.get("fileType"),
    description: f.get("description"),
    driveUrl: f.get("driveUrl")
  };
  try {
    await adminApi(id ? "PUT" : "POST", body, id);
    $("#formMsg").textContent = id ? "Updated successfully." : "Added resource successfully.";
    resetAdminForm();
    await loadAdminItems();
    await load();
  } catch (err) {
    $("#formMsg").textContent = err.message;
  }
};

// Initial setup
load();