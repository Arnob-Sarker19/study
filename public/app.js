// Supabase configuration
const SUPABASE_URL = "https://nqvmupmzxgytvkewklpo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xdm11cG16eGd5dHZrZXdrbHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MTEyNjksImV4cCI6MjEwMzM4NzI2OX0.zbIEvauFtK3Y7dwWoHR7rNJkyab76Dxx5uRbP_jP5gM";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Safe DOM Query Selectors & Helper Functions
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const setText = (s, val) => {
  const el = typeof s === "string" ? $(s) : s;
  if (el) el.textContent = val;
};

const setHTML = (s, val) => {
  const el = typeof s === "string" ? $(s) : s;
  if (el) el.innerHTML = val;
};

const addClass = (s, cls) => {
  const el = typeof s === "string" ? $(s) : s;
  if (el) el.classList.add(cls);
};

const removeClass = (s, cls) => {
  const el = typeof s === "string" ? $(s) : s;
  if (el) el.classList.remove(cls);
};

const toggleClass = (s, cls, force) => {
  const el = typeof s === "string" ? $(s) : s;
  if (el) el.classList.toggle(cls, force);
};

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
  const searchEl = $("#search");
  const q = searchEl ? searchEl.value.trim().toLowerCase() : "";
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

    // Safe Hero Stats Counters Update
    const pdfCount = pdfs.filter(p => (p.fileType || "pdf") === "pdf").length;
    const photoCount = pdfs.filter(p => p.fileType === "photo").length;
    
    setText("#statCount", `${pdfs.length}+`);
    setText("#subjectFolderCount", subjectsList.length);
    setText("#pdfStatCount", pdfCount);
    setText("#photoStatCount", photoCount);

    // Render Semester Filter Chips
    setHTML("#semesterChips", `<button class="sem-chip ${!activeSemester ? "active" : ""}" data-sem="all">All Semesters (${pdfs.length})</button>` +
      ALL_SEMESTERS.map(s => {
        const count = pdfs.filter(x => (x.semester || "Semester 1").toLowerCase() === s.toLowerCase()).length;
        const isActive = activeSemester && activeSemester.toLowerCase() === s.toLowerCase();
        return `<button class="sem-chip ${isActive ? "active" : ""}" data-sem="${esc(s)}">${esc(s)} (${count})</button>`;
      }).join(""));

    $$("#semesterChips .sem-chip").forEach(btn => {
      btn.onclick = () => {
        $$("#semesterChips .sem-chip").forEach(x => removeClass(x, "active"));
        addClass(btn, "active");
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
    setHTML("#loading", `<p style="color:#ef4444">${esc(err.message)}</p>`);
  }
}

function render() {
  addClass("#loading", "hidden");
  
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
  addClass("#breadcrumbBar", "hidden");
  removeClass("#semestersGrid", "hidden");
  addClass("#foldersGrid", "hidden");
  addClass("#grid", "hidden");

  const searchEl = $("#search");
  const q = searchEl ? searchEl.value.trim().toLowerCase() : "";

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

  setText("#count", `8 Semesters (${filtered().length} total files)`);
  toggleClass("#empty", "hidden", !!semestersMap.length);

  setHTML("#semestersGrid", semestersMap.map(s => `
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
  `).join(""));

  $$(".semester-card").forEach(card => {
    card.onclick = () => openSemester(card.dataset.sem);
  });
}

// 2. Render Subject-wise Folders (Level 2)
function renderSubjectFolders() {
  addClass("#semestersGrid", "hidden");
  removeClass("#foldersGrid", "hidden");
  addClass("#grid", "hidden");

  removeClass("#breadcrumbBar", "hidden");
  setText("#breadcrumbSem", activeSemester || "All Semesters");
  addClass("#breadcrumbSubSep", "hidden");
  addClass("#breadcrumbSub", "hidden");

  const searchEl = $("#search");
  const q = searchEl ? searchEl.value.trim().toLowerCase() : "";
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
  
  setText("#count", `${folderList.length} Subject Folders (${filtered().length} files)`);
  toggleClass("#empty", "hidden", !!folderList.length);

  setHTML("#foldersGrid", folderList.map(f => `
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
  `).join(""));

  $$(".folder-card").forEach(card => {
    card.onclick = () => openSubjectFolder(card.dataset.folder);
  });
}

// 3. Render Cards Grid (Level 3)
function renderCardsGrid() {
  const list = filtered();
  setText("#count", `${list.length} Files`);
  toggleClass("#empty", "hidden", !!list.length);
  addClass("#semestersGrid", "hidden");
  addClass("#foldersGrid", "hidden");
  removeClass("#grid", "hidden");

  if (activeSemester || activeSubjectFolder) {
    removeClass("#breadcrumbBar", "hidden");
    setText("#breadcrumbSem", activeSemester || "All Semesters");
    if (activeSubjectFolder) {
      removeClass("#breadcrumbSubSep", "hidden");
      removeClass("#breadcrumbSub", "hidden");
      setText("#breadcrumbSub", activeSubjectFolder);
    } else {
      addClass("#breadcrumbSubSep", "hidden");
      addClass("#breadcrumbSub", "hidden");
    }
  } else {
    addClass("#breadcrumbBar", "hidden");
  }

  setHTML("#grid", list.map(p => {
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
  }).join(""));

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
  removeClass("#viewSemesterTab", "active");
  addClass("#viewFolderTab", "active");
  removeClass("#viewGridTab", "active");
  render();
}

function openSubjectFolder(subjectName) {
  activeSubjectFolder = subjectName;
  currentViewMode = "grid";
  removeClass("#viewSemesterTab", "active");
  removeClass("#viewFolderTab", "active");
  addClass("#viewGridTab", "active");
  render();
}

function resetToSemesters() {
  activeSemester = null;
  activeSubjectFolder = null;
  currentViewMode = "semesters";
  addClass("#viewSemesterTab", "active");
  removeClass("#viewFolderTab", "active");
  removeClass("#viewGridTab", "active");
  render();
}

const backToSemestersBtn = $("#backToSemestersBtn");
if (backToSemestersBtn) backToSemestersBtn.onclick = resetToSemesters;

// View Mode Tabs (Semesters vs Folders vs Grid)
const viewSemesterTab = $("#viewSemesterTab");
if (viewSemesterTab) viewSemesterTab.onclick = resetToSemesters;

const viewFolderTab = $("#viewFolderTab");
if (viewFolderTab) {
  viewFolderTab.onclick = () => {
    activeSubjectFolder = null;
    currentViewMode = "folders";
    removeClass("#viewSemesterTab", "active");
    addClass("#viewFolderTab", "active");
    removeClass("#viewGridTab", "active");
    render();
  };
}

const viewGridTab = $("#viewGridTab");
if (viewGridTab) {
  viewGridTab.onclick = () => {
    currentViewMode = "grid";
    removeClass("#viewSemesterTab", "active");
    removeClass("#viewFolderTab", "active");
    addClass("#viewGridTab", "active");
    render();
  };
}

// Category Format Tab Switcher (All / PDF / Photo)
$$(".type-tab").forEach(tab => {
  tab.onclick = () => {
    $$(".type-tab").forEach(t => removeClass(t, "active"));
    addClass(tab, "active");
    currentType = tab.dataset.type;
    render();
  };
});

// Search input handling & clear button
const searchInput = $("#search");
const clearSearchBtn = $("#clearSearch");

if (searchInput) {
  searchInput.oninput = () => {
    toggleClass("#clearSearch", "hidden", !searchInput.value.trim());
    render();
  };
}

if (clearSearchBtn) {
  clearSearchBtn.onclick = () => {
    if (searchInput) searchInput.value = "";
    addClass("#clearSearch", "hidden");
    render();
  };
}

// 3D Mouse Parallax Effect for Hero Stage
const heroStage = $("#heroStage");
if (heroStage) {
  const heroWrapper = $(".hero-3d-wrapper");
  if (heroWrapper) {
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

function slugify(text) {
  return String(text || "general")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function updatePathPreview() {
  const sem = uploadSemesterSelect ? uploadSemesterSelect.value || "Semester 1" : "Semester 1";
  const slug = slugify(uploadSubjectInput ? uploadSubjectInput.value : "general") || "general";
  setText("#pathPreviewText", `Google Drive / ${sem} / ${slug} /`);
}

if (uploadSemesterSelect) uploadSemesterSelect.onchange = updatePathPreview;
if (uploadSubjectInput) uploadSubjectInput.oninput = updatePathPreview;

function openPublicUploadModal() {
  removeClass("#publicUploadModal", "hidden");
  updatePathPreview();
}

function closePublicUploadModal() {
  addClass("#publicUploadModal", "hidden");
  const form = $("#publicUploadForm");
  if (form) form.reset();
  selectedBase64File = null;
  setText("#filePickerLabel", "Supports PDF, PNG, JPG, WEBP (Max 10MB)");
  setText("#uploadStatusMsg", "");
}

if (openPublicUploadBtn) openPublicUploadBtn.onclick = openPublicUploadModal;
if (heroUploadBtn) heroUploadBtn.onclick = openPublicUploadModal;
if (publicUploadClose) publicUploadClose.onclick = closePublicUploadModal;
if (publicUploadModal) {
  publicUploadModal.onclick = (e) => { if (e.target === publicUploadModal) closePublicUploadModal(); };
}

let uploadMode = "file";
const methodFileTab = $("#methodFileTab");
const methodLinkTab = $("#methodLinkTab");

if (methodFileTab) {
  methodFileTab.onclick = () => {
    uploadMode = "file";
    addClass("#methodFileTab", "active");
    removeClass("#methodLinkTab", "active");
    removeClass("#fileUploadSection", "hidden");
    addClass("#linkUploadSection", "hidden");
  };
}

if (methodLinkTab) {
  methodLinkTab.onclick = () => {
    uploadMode = "link";
    addClass("#methodLinkTab", "active");
    removeClass("#methodFileTab", "active");
    removeClass("#linkUploadSection", "hidden");
    addClass("#fileUploadSection", "hidden");
  };
}

let selectedBase64File = null;
const filePicker = $("#filePicker");

if (filePicker) {
  filePicker.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("File size exceeds 10MB limit.");
      filePicker.value = "";
      return;
    }
    setText("#filePickerLabel", `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    
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
}

const publicUploadForm = $("#publicUploadForm");
if (publicUploadForm) {
  publicUploadForm.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = $("#submitUploadBtn");
    setText("#uploadStatusMsg", "");
    
    const formData = new FormData(e.target);
    const title = formData.get("title");
    const subjectVal = formData.get("subject");
    const semesterVal = formData.get("semester");
    const description = formData.get("description");
    const fileType = formData.get("fileType");
    const driveUrl = formData.get("driveUrl");

    if (uploadMode === "file" && !selectedBase64File) {
      const statusMsg = $("#uploadStatusMsg");
      if (statusMsg) statusMsg.style.color = "#ef4444";
      setText("#uploadStatusMsg", "Please select a file to upload.");
      return;
    }
    if (uploadMode === "link" && !driveUrl?.trim()) {
      const statusMsg = $("#uploadStatusMsg");
      if (statusMsg) statusMsg.style.color = "#ef4444";
      setText("#uploadStatusMsg", "Please enter a valid Google Drive or web share link.");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    const statusMsg = $("#uploadStatusMsg");
    if (statusMsg) statusMsg.style.color = "#a5b4fc";
    setText("#uploadStatusMsg", `Uploading file to ${semesterVal} > ${subjectVal}...`);

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

      if (statusMsg) statusMsg.style.color = "#34d399";
      setText("#uploadStatusMsg", `Success! Added to ${semesterVal} > ${subjectVal}. Opening folder...`);
      
      setTimeout(async () => {
        closePublicUploadModal();
        await load();
        openSemester(semesterVal);
        openSubjectFolder(subjectVal);
      }, 1200);
    } catch (err) {
      if (statusMsg) statusMsg.style.color = "#ef4444";
      setText("#uploadStatusMsg", err.message || "An error occurred during upload.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };
}

/* PHOTO LIGHTBOX PREVIEW MODAL LOGIC */
const photoLightbox = $("#photoLightbox");
const lightboxClose = $("#lightboxClose");

function openPhotoLightbox(item) {
  removeClass("#photoLightbox", "hidden");
  const lightboxImg = $("#lightboxImg");
  if (lightboxImg) lightboxImg.src = item.driveUrl;
  setText("#lightboxTitle", item.title);
  setText("#lightboxSub", `${item.semester || "Semester 1"} • ${item.subject} • Added ${formatDate(item.createdAt)}`);
  const lightboxDownloadBtn = $("#lightboxDownloadBtn");
  if (lightboxDownloadBtn) lightboxDownloadBtn.href = item.downloadUrl;
}

if (lightboxClose) lightboxClose.onclick = () => addClass("#photoLightbox", "hidden");
if (photoLightbox) {
  photoLightbox.onclick = (e) => { if (e.target === photoLightbox) addClass("#photoLightbox", "hidden"); };
}

/* ADMIN MODAL & TABBED SUITE */
const modal = $("#modal");
const adminBtn = $("#adminBtn");
if (adminBtn) {
  adminBtn.onclick = async () => {
    removeClass("#modal", "hidden");
    const { data: { session } } = await sb.auth.getSession();
    session ? showAdminPanel() : showLoginForm();
  };
}

const closeBtn = $("#close");
if (closeBtn) closeBtn.onclick = () => addClass("#modal", "hidden");
if (modal) modal.onclick = e => { if (e.target === modal) addClass("#modal", "hidden"); };

function showLoginForm() {
  removeClass("#loginView", "hidden");
  addClass("#adminView", "hidden");
}

function showAdminPanel() {
  addClass("#loginView", "hidden");
  removeClass("#adminView", "hidden");
  switchAdminTab("folders");
  loadAdminItems();
  checkGDriveStatus();
  resetAdminForm();
}

const adminTabFolders = $("#adminTabFolders");
const adminTabAdd = $("#adminTabAdd");
const adminTabGDrive = $("#adminTabGDrive");

function switchAdminTab(tabName) {
  [adminTabFolders, adminTabAdd, adminTabGDrive].forEach(t => t && removeClass(t, "active"));
  ["#adminPaneFolders", "#adminPaneAdd", "#adminPaneGDrive"].forEach(p => addClass(p, "hidden"));

  if (tabName === "folders") {
    addClass(adminTabFolders, "active");
    removeClass("#adminPaneFolders", "hidden");
  } else if (tabName === "add") {
    addClass(adminTabAdd, "active");
    removeClass("#adminPaneAdd", "hidden");
  } else if (tabName === "gdrive") {
    addClass(adminTabGDrive, "active");
    removeClass("#adminPaneGDrive", "hidden");
  }
}

if (adminTabFolders) adminTabFolders.onclick = () => switchAdminTab("folders");
if (adminTabAdd) adminTabAdd.onclick = () => switchAdminTab("add");
if (adminTabGDrive) adminTabGDrive.onclick = () => switchAdminTab("gdrive");

const loginForm = $("#login");
if (loginForm) {
  loginForm.onsubmit = async e => {
    e.preventDefault();
    setText("#loginErr", "");
    const formData = new FormData(e.target);
    const { error } = await sb.auth.signInWithPassword({
      email: formData.get("email"),
      password: formData.get("password")
    });
    if (error) {
      setText("#loginErr", error.message);
    } else {
      showAdminPanel();
    }
  };
}

const logoutBtn = $("#logout");
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await sb.auth.signOut();
    showLoginForm();
  };
}

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
    setText("#adminCount", `${list.length} total files`);

    // Group list by Semester -> Subject Folder
    const semGroups = {};
    list.forEach(p => {
      const sem = p.semester || "Semester 1";
      if (!semGroups[sem]) semGroups[sem] = {};
      if (!semGroups[sem][p.subject]) semGroups[sem][p.subject] = [];
      semGroups[sem][p.subject].push(p);
    });

    const sortedSemesters = ALL_SEMESTERS.filter(s => semGroups[s]);

    setHTML("#adminFolderList", sortedSemesters.map(sem => `
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
    `).join(""));

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
    setHTML("#adminFolderList", `<p style="color:#ef4444">${esc(err.message)}</p>`);
  }
}

async function checkGDriveStatus() {
  try {
    const res = await fetch("/api/gdrive");
    const data = await res.json();
    const badge = $("#gdriveStatusBadge");

    if (data.configured && data.status === "connected") {
      if (badge) {
        badge.style.background = "rgba(16, 185, 129, 0.12)";
        badge.style.borderColor = "rgba(16, 185, 129, 0.3)";
        badge.style.color = "#34d399";
      }
      if (data.mode === "user_oauth") {
        setText("#gdriveStatusText", "Google Drive Connected (Personal @gmail.com Account - 15 GB Quota Enabled)");
      } else {
        setText("#gdriveStatusText", `Google Drive Connected (Service Account: ${data.clientEmail})`);
      }
    } else {
      if (badge) {
        badge.style.background = "rgba(245, 158, 11, 0.12)";
        badge.style.borderColor = "rgba(245, 158, 11, 0.3)";
        badge.style.color = "#fbbf24";
      }
      setText("#gdriveStatusText", "Google Drive API Keys Not Configured (Using Supabase Storage Fallback)");
    }
  } catch {
    setText("#gdriveStatusText", "Using Cloud Storage Fallback");
  }
}

function resetAdminForm() {
  const form = $("#pdfForm");
  if (form) {
    form.reset();
    if (form.elements["id"]) form.elements["id"].value = "";
  }
  setText("#save", "Save Resource");
  addClass("#cancel", "hidden");
  setText("#formMsg", "");
}

function editAdminItem(p) {
  const f = $("#pdfForm");
  if (!f) return;
  if (f.elements["id"]) f.elements["id"].value = p.id;
  if (f.elements["title"]) f.elements["title"].value = p.title;
  if (f.elements["subject"]) f.elements["subject"].value = p.subject;
  if (f.elements["semester"]) f.elements["semester"].value = p.semester || "Semester 1";
  if (f.elements["fileType"]) f.elements["fileType"].value = p.fileType || "pdf";
  if (f.elements["description"]) f.elements["description"].value = p.description || "";
  if (f.elements["driveUrl"]) f.elements["driveUrl"].value = p.driveUrl || "";
  setText("#save", "Save Changes");
  removeClass("#cancel", "hidden");
  f.scrollIntoView({ behavior: "smooth" });
}

const cancelBtn = $("#cancel");
if (cancelBtn) cancelBtn.onclick = resetAdminForm;

const pdfForm = $("#pdfForm");
if (pdfForm) {
  pdfForm.onsubmit = async e => {
    e.preventDefault();
    setText("#formMsg", "");
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
      setText("#formMsg", id ? "Updated successfully." : "Added resource successfully.");
      resetAdminForm();
      await loadAdminItems();
      await load();
    } catch (err) {
      setText("#formMsg", err.message);
    }
  };
}

// Initial setup
load();