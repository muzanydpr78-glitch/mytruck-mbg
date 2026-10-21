/**
 * Web Monitoring Armada - Main Application Controller
 * Menghubungkan views, event listeners, moduler RBAC, dashboard charts, dan import/export
 */

class AppController {
  constructor() {
    this.currentViewId = "view-dashboard-armada";
    this.selectedArmadaCache = [];
  }

  async init() {
    // 0. Update initial connection indicator status
    this.updateBackendStatusIndicator("syncing", "Menghubungkan ke GAS...");

    // 0.1 Sync data from Google Sheets
    const syncResult = await window.dataStore.syncFromGas();
    if (syncResult && syncResult.success) {
      this.updateBackendStatusIndicator("gas", "GAS Web App: Connected");
    } else if (syncResult && syncResult.reason === "LOCAL_MODE") {
      this.updateBackendStatusIndicator("local", "Storage: Local Mode");
    } else {
      const settings = window.dataStore.getSettings();
      if (settings.dataMode === "GAS" && settings.gasUrl) {
        this.updateBackendStatusIndicator("gas", "GAS Web App: Connected (Cached)");
      } else {
        this.updateBackendStatusIndicator("local", "Engine: Local Ready");
      }
    }

    // 0.2 Initialize Dark/Light Theme
    this.initTheme();

    // 1. Check auto-login session
    const autoLogin = await window.authService.checkAutoLogin();
    if (autoLogin.success) {
      this.showAppShell();
      this.showToast("Sesi Dipulihkan", `Selamat datang kembali, ${autoLogin.user.Username}!`, "info");
    } else {
      this.showLoginView();
    }

    // 2. Setup navigation listeners
    this.setupNavigation();

    // 3. Setup drag & drop for Dual Excel Import
    this.setupDropzones();

    // 4. Initialize icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // --- Auth & Session Views ---
  showLoginView() {
    document.getElementById("view-login").style.display = "flex";
    document.getElementById("app-shell").style.display = "none";
    if (window.lucide) window.lucide.createIcons();
  }

  showAppShell() {
    document.getElementById("view-login").style.display = "none";
    document.getElementById("app-shell").style.display = "flex";

    const user = window.authService.getCurrentUser();
    if (user) {
      const displayName = user.Nama || user.Username;
      document.getElementById("sidebar-user-name").textContent = displayName;
      document.getElementById("sidebar-user-avatar").textContent = displayName.charAt(0).toUpperCase();

      const roleBadge = document.getElementById("sidebar-user-role");
      roleBadge.textContent = user.Role.toUpperCase();
      roleBadge.className = `user-role-badge role-${user.Role.toLowerCase()}`;

      // Update topbar role info badge (read-only)
      const topbarRoleBadge = document.getElementById("topbar-user-role");
      if (topbarRoleBadge) {
        topbarRoleBadge.textContent = `Role: ${user.Role.toUpperCase()}`;
        topbarRoleBadge.className = `user-role-badge role-${user.Role.toLowerCase()}`;
      }
    }

    this.updateRbacUi();
    this.navigateTo(this.currentViewId);
    if (window.lucide) window.lucide.createIcons();
  }

  async handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    const rememberMe = document.getElementById("login-remember").checked;

    const btn = document.getElementById("btn-login-submit");
    const btnText = document.getElementById("btn-login-text");
    const btnSpinner = document.getElementById("btn-login-spinner");

    btn.disabled = true;
    btnText.textContent = "Memverifikasi...";
    btnSpinner.style.display = "inline-block";

    try {
      // Small artificial delay for pleasant UI feedback
      await new Promise(r => setTimeout(r, 400));
      const result = await window.authService.login(username, password, rememberMe);

      if (result.success) {
        this.showAppShell();
        this.showToast("Login Berhasil", result.message, "success");
      } else {
        this.showToast("Gagal Masuk", result.message, "error");
      }
    } catch (err) {
      this.showToast("Terjadi Kesalahan", err.message || "Gagal menghubungi server", "error");
    } finally {
      btn.disabled = false;
      btnText.textContent = "Masuk ke Sistem";
      btnSpinner.style.display = "none";
    }
  }

  handleLogout() {
    window.authService.logout();
    this.showLoginView();
    this.showToast("Logout Berhasil", "Sesi Anda telah berhasil diakhiri.", "info");
  }

  fillLogin(username, password) {
    document.getElementById("login-username").value = username;
    document.getElementById("login-password").value = password;
  }

  togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
  }

  quickSwitchRole(role) {
    const user = window.authService.getCurrentUser();
    if (!user) return;
    user.Role = role;
    window.authService.currentUser = user;

    const roleBadge = document.getElementById("sidebar-user-role");
    roleBadge.textContent = role.toUpperCase();
    roleBadge.className = `user-role-badge role-${role.toLowerCase()}`;

    this.updateRbacUi();
    this.showToast("Role Diubah", `Kewenangan dialihkan sementara ke: ${role}`, "info");

    // If current view is not permitted for new role, navigate to Dashboard Armada
    const moduleMap = {
      "view-master-armada": "master_armada",
      "view-master-standby": "master_standby",
      "view-master-muatan": "master_muatan",
      "view-user-management": "user_management",
      "view-settings": "settings"
    };

    if (moduleMap[this.currentViewId] && !window.authService.canAccess(moduleMap[this.currentViewId])) {
      this.navigateTo("view-dashboard-armada");
    }
  }

  updateRbacUi() {
    const isMasterAllowed = window.authService.canAccess("master_armada");
    const isAdmin = window.authService.canAccess("user_management");

    document.querySelectorAll(".sec-master-data").forEach(el => {
      el.style.display = isMasterAllowed ? "flex" : "none";
    });

    document.querySelectorAll(".sec-admin-only").forEach(el => {
      el.style.display = isAdmin ? "flex" : "none";
    });
  }

  // --- Navigation & Routing ---
  setupNavigation() {
    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", () => {
        const viewId = item.getAttribute("data-view");
        if (viewId) {
          this.navigateTo(viewId);
        }
      });
    });
  }

  navigateTo(viewId) {
    // Permission check
    const moduleMap = {
      "view-dashboard-armada": "dashboard_armada",
      "view-dashboard-standby": "dashboard_standby",
      "view-dashboard-muatan": "dashboard_muatan",
      "view-master-armada": "master_armada",
      "view-master-standby": "master_standby",
      "view-master-muatan": "master_muatan",
      "view-user-management": "user_management",
      "view-settings": "settings"
    };

    if (moduleMap[viewId] && !window.authService.canAccess(moduleMap[viewId])) {
      this.showToast("Akses Ditolak", "Role Anda tidak memiliki izin untuk mengakses halaman ini.", "error");
      return;
    }

    this.currentViewId = viewId;

    // Update active nav item
    document.querySelectorAll(".nav-item").forEach(nav => {
      if (nav.getAttribute("data-view") === viewId) {
        nav.classList.add("active");
      } else {
        nav.classList.remove("active");
      }
    });

    // Update views
    document.querySelectorAll(".view-section").forEach(sec => {
      if (sec.id === viewId) {
        sec.classList.add("active");
      } else {
        sec.classList.remove("active");
      }
    });

    // Set Topbar title
    const titles = {
      "view-dashboard-armada": "Dashboard Armada",
      "view-dashboard-standby": "Dashboard Armada Standby",
      "view-dashboard-muatan": "Dashboard Muatan Armada",
      "view-master-armada": "Master Data Armada",
      "view-master-standby": "Master Standby Armada",
      "view-master-muatan": "Master Muatan (Dual Import BKB & BTB)",
      "view-user-management": "Manajemen Pengguna & Hak Akses",
      "view-settings": "Konfigurasi Sistem & Google Sheets Sync"
    };
    document.getElementById("page-current-title").textContent = titles[viewId] || "Monitoring Armada";

    // Trigger view-specific render
    if (viewId === "view-dashboard-armada") this.refreshArmadaDashboard();
    if (viewId === "view-dashboard-standby") this.refreshStandbyDashboard();
    if (viewId === "view-dashboard-muatan") this.refreshMuatanDashboard();
    if (viewId === "view-master-armada") this.renderMasterArmadaTable();
    if (viewId === "view-master-standby") this.renderMasterStandbyTable();
    if (viewId === "view-master-muatan") this.renderMasterMuatanTable();
    if (viewId === "view-user-management") this.renderUsersTable();
    if (viewId === "view-settings") {
      this.loadSettingsForm();
      this.renderLogsTable();
    }

    if (window.lucide) window.lucide.createIcons();

    // Auto-close sidebar on mobile after navigation
    if (window.innerWidth <= 768) {
      this.closeSidebarMobile();
    }
  }

  toggleSidebarMobile() {
    const sidebar = document.getElementById("main-sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const isOpen = sidebar.classList.toggle("mobile-open");
    if (backdrop) {
      if (isOpen) {
        backdrop.style.display = "block";
        // Force reflow then animate
        requestAnimationFrame(() => backdrop.classList.add("active"));
      } else {
        backdrop.classList.remove("active");
        setTimeout(() => { backdrop.style.display = "none"; }, 300);
      }
    }
  }

  closeSidebarMobile() {
    const sidebar = document.getElementById("main-sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (sidebar.classList.contains("mobile-open")) {
      sidebar.classList.remove("mobile-open");
      if (backdrop) {
        backdrop.classList.remove("active");
        setTimeout(() => { backdrop.style.display = "none"; }, 300);
      }
    }
  }

  // =========================================================================
  // VIEW 3.1: DASHBOARD ARMADA LOGIC
  // =========================================================================
  refreshArmadaDashboard() {
    const pt = document.getElementById("filter-armada-pt").value;
    const depo = document.getElementById("filter-armada-depo").value;
    const bulan = document.getElementById("filter-armada-bulan").value;
    const tahun = document.getElementById("filter-armada-tahun").value;

    const data = window.dataStore.getArmadaDashboardMetrics({ pt, depo, bulan, tahun });

    // Update summary cards
    document.getElementById("card-armada-total").textContent = data.summary.totalArmada;
    document.getElementById("card-armada-retail").textContent = data.summary.totalRetail;
    document.getElementById("card-armada-dropping").textContent = data.summary.totalDropping;
    document.getElementById("card-armada-standby").textContent = data.summary.totalStandby;

    // Render Progress Bar: Persentase Jenis Armada
    const progressContainer = document.getElementById("armada-progress-container");
    progressContainer.innerHTML = "";

    const fillClasses = ["fill-engkel", "fill-grandmax", "fill-l300", "fill-double", "fill-wingbox"];
    data.jenisArmadaPercentages.forEach((item, index) => {
      const fillClass = fillClasses[index % fillClasses.length];
      const div = document.createElement("div");
      div.className = "progress-item";
      div.innerHTML = `
        <div class="progress-header">
          <span class="progress-name">${item.jenis}</span>
          <span class="progress-count">${item.count} Unit (${item.percentage}%)</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${fillClass}" style="width: ${item.percentage}%;"></div>
        </div>
      `;
      progressContainer.appendChild(div);
    });

    // Render Bar Chart: Depo vs Jumlah Armada
    window.chartManager.renderDepoDistributionChart(
      "chart-depo-distribution",
      data.depoDistribution.labels,
      data.depoDistribution.data
    );

    // Render Pie Chart: Tipe Muatan (JUGS, SPS, MIX)
    window.chartManager.renderTipeMuatanChart(
      "chart-tipe-muatan",
      data.tipeMuatanDistribution.labels,
      data.tipeMuatanDistribution.data
    );
  }

  // =========================================================================
  // VIEW 3.2: DASHBOARD ARMADA STANDBY LOGIC & MATRICES
  // =========================================================================
  refreshStandbyDashboard() {
    const pt = document.getElementById("filter-standby-pt").value;
    const depo = document.getElementById("filter-standby-depo").value;
    const startDate = document.getElementById("filter-standby-start").value;
    const endDate = document.getElementById("filter-standby-end").value;

    const data = window.dataStore.getStandbyDashboardData({ pt, depo, startDate, endDate });

    // Summary Cards
    document.getElementById("card-standby-total").textContent = data.summary.totalArmada;
    document.getElementById("card-standby-s").textContent = data.summary.totalStandby;
    document.getElementById("card-standby-k").textContent = data.summary.totalKIR;
    document.getElementById("card-standby-p").textContent = data.summary.totalPerbaikan;

    document.getElementById("card-standby-avg-s").textContent = data.summary.avgDailyStandby;
    document.getElementById("card-standby-avg-k").textContent = data.summary.avgDailyKIR;
    document.getElementById("card-standby-avg-p").textContent = data.summary.avgDailyPerbaikan;

    // Render Matrix 1: Summary by Depo
    this.renderMatrixStandbyDepo(data.dates, data.matrixDepo);

    // Render Matrix 2: Summary by Driver
    this.renderMatrixStandbyDriver(data.dates, data.matrixDriver);
  }

  renderMatrixStandbyDepo(dates, matrixData) {
    const container = document.getElementById("matrix-standby-depo-container");
    if (!matrixData.length) {
      container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-dim);">Tidak ada data depo yang cocok dengan filter.</div>`;
      return;
    }

    let html = `<table class="table-matrix"><thead><tr><th class="sticky-col">Nama Depo</th>`;
    dates.forEach(d => {
      const shortDate = d.substring(5); // MM-DD
      html += `<th>${shortDate}</th>`;
    });
    html += `</tr></thead><tbody>`;

    matrixData.forEach(row => {
      html += `<tr><td class="sticky-col">${row.depo}</td>`;
      dates.forEach(d => {
        const cell = row.dates[d] || { total: 0, tooltip: "Standby: 0, KIR: 0, Perbaikan: 0" };
        const valClass = cell.total > 0 ? (cell.perbaikan > 0 ? 'badge-perbaikan' : (cell.kir > 0 ? 'badge-kir' : 'badge-standby')) : '';
        html += `<td>
          <div class="matrix-cell-hover">
            <span class="${valClass}">${cell.total}</span>
            <div class="tooltip-callout">${cell.tooltip}</div>
          </div>
        </td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  renderMatrixStandbyDriver(dates, matrixData) {
    const container = document.getElementById("matrix-standby-driver-container");
    if (!matrixData.length) {
      container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-dim);">Tidak ada driver yang cocok dengan filter.</div>`;
      return;
    }

    let html = `<table class="table-matrix"><thead><tr><th class="sticky-col">Driver & Nopol</th>`;
    dates.forEach(d => {
      const shortDate = d.substring(5);
      html += `<th>${shortDate}</th>`;
    });
    html += `</tr></thead><tbody>`;

    matrixData.forEach(row => {
      html += `<tr><td class="sticky-col">
        <div>${row.driver}</div>
        <div style="font-size: 11px; color: var(--text-dim);">${row.nopol} (${row.depo})</div>
      </td>`;
      dates.forEach(d => {
        const cell = row.dates[d] || { code: "•", badgeClass: "badge-active", status: "Active" };
        html += `<td>
          <span class="${cell.badgeClass}" title="${cell.status}">${cell.code}</span>
        </td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  // =========================================================================
  // VIEW 3.3: DASHBOARD MUATAN ARMADA LOGIC & MATRICES
  // =========================================================================
  refreshMuatanDashboard() {
    const pt = document.getElementById("filter-muatan-pt").value;
    const depo = document.getElementById("filter-muatan-depo").value;
    const jenisPengiriman = document.getElementById("filter-muatan-tipe").value;
    const startDate = document.getElementById("filter-muatan-start").value;
    const endDate = document.getElementById("filter-muatan-end").value;

    const data = window.dataStore.getMuatanDashboardData({ pt, depo, jenisPengiriman, startDate, endDate });

    // Summary Cards
    document.getElementById("card-muatan-box").textContent = data.summary.totalInBox.toLocaleString();
    document.getElementById("card-muatan-jugs").textContent = data.summary.totalInJugs.toLocaleString();
    document.getElementById("card-muatan-avg-box").textContent = data.summary.avgInBox.toLocaleString();
    document.getElementById("card-muatan-avg-jugs").textContent = data.summary.avgInJugs.toLocaleString();

    document.getElementById("card-retur-box").textContent = data.summary.totalReturBox.toLocaleString();
    document.getElementById("card-retur-jugs").textContent = data.summary.totalReturJugs.toLocaleString();
    document.getElementById("card-retur-avg-box").textContent = data.summary.avgReturBox.toLocaleString();
    document.getElementById("card-retur-avg-jugs").textContent = data.summary.avgReturJugs.toLocaleString();

    // Render Trendlines
    window.chartManager.renderTrendlineMuatan(
      "chart-trend-muatan",
      data.bkbTrend.labels.map(d => d.substring(5)),
      data.bkbTrend.box,
      data.bkbTrend.jugs
    );

    window.chartManager.renderTrendlineRetur(
      "chart-trend-retur",
      data.btbTrend.labels.map(d => d.substring(5)),
      data.btbTrend.box,
      data.btbTrend.jugs
    );

    // Render Matrix 1: Summary by BKB
    this.renderMatrixMuatanBKB(data.dates, data.matrixBKB);

    // Render Matrix 2: Summary by BTB
    this.renderMatrixMuatanBTB(data.dates, data.matrixBTB);
  }

  renderMatrixMuatanBKB(dates, matrixData) {
    const container = document.getElementById("matrix-muatan-bkb-container");
    if (!matrixData.length) {
      container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-dim);">Tidak ada data muatan BKB.</div>`;
      return;
    }

    let html = `<table class="table-matrix"><thead><tr><th class="sticky-col">Nama Driver</th>`;
    dates.forEach(d => {
      html += `<th>${d.substring(5)}</th>`;
    });
    html += `</tr></thead><tbody>`;

    matrixData.forEach(row => {
      html += `<tr><td class="sticky-col">
        <div>${row.driver}</div>
        <div style="font-size: 11px; color: var(--text-dim);">${row.nopol}</div>
      </td>`;
      dates.forEach(d => {
        const val = row.dates[d] || { box: 0, jugs: 0 };
        if (val.box > 0 || val.jugs > 0) {
          html += `<td>
            <div class="dual-cargo-pill">
              <span class="cargo-tag-box">${val.box}B</span>
              <span class="cargo-tag-jugs">${val.jugs}J</span>
            </div>
          </td>`;
        } else {
          html += `<td><span style="color: var(--text-dim);">-</span></td>`;
        }
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  renderMatrixMuatanBTB(dates, matrixData) {
    const container = document.getElementById("matrix-muatan-btb-container");
    if (!matrixData.length) {
      container.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-dim);">Tidak ada data retur BTB.</div>`;
      return;
    }

    let html = `<table class="table-matrix"><thead><tr><th class="sticky-col">Nama Driver</th>`;
    dates.forEach(d => {
      html += `<th>${d.substring(5)}</th>`;
    });
    html += `</tr></thead><tbody>`;

    matrixData.forEach(row => {
      html += `<tr><td class="sticky-col">
        <div>${row.driver}</div>
        <div style="font-size: 11px; color: var(--text-dim);">${row.nopol}</div>
      </td>`;
      dates.forEach(d => {
        const val = row.dates[d] || { box: 0, jugs: 0 };
        if (val.box > 0 || val.jugs > 0) {
          html += `<td>
            <div class="dual-cargo-pill">
              <span class="cargo-tag-box">${val.box}B</span>
              <span class="cargo-tag-jugs">${val.jugs}J</span>
            </div>
          </td>`;
        } else {
          html += `<td><span style="color: var(--text-dim);">-</span></td>`;
        }
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  // =========================================================================
  // AI INSIGHT TRIGGER (Section 4 PRD)
  // =========================================================================
  async triggerAiInsight(dashboardType) {
    const btnText = document.getElementById(`btn-ai-text-${dashboardType}`);
    const originalText = btnText.textContent;
    btnText.textContent = "Menganalisis...";

    try {
      let contextData = null;
      if (dashboardType === "armada") {
        const pt = document.getElementById("filter-armada-pt").value;
        const depo = document.getElementById("filter-armada-depo").value;
        contextData = window.dataStore.getArmadaDashboardMetrics({ pt, depo });
      } else if (dashboardType === "standby") {
        const pt = document.getElementById("filter-standby-pt").value;
        const depo = document.getElementById("filter-standby-depo").value;
        const startDate = document.getElementById("filter-standby-start").value;
        const endDate = document.getElementById("filter-standby-end").value;
        contextData = window.dataStore.getStandbyDashboardData({ pt, depo, startDate, endDate });
      } else if (dashboardType === "muatan") {
        const pt = document.getElementById("filter-muatan-pt").value;
        const depo = document.getElementById("filter-muatan-depo").value;
        const startDate = document.getElementById("filter-muatan-start").value;
        const endDate = document.getElementById("filter-muatan-end").value;
        contextData = window.dataStore.getMuatanDashboardData({ pt, depo, startDate, endDate });
      }

      const insight = await window.aiService.generateInsights(dashboardType, contextData);

      // Render insights into UI
      document.getElementById(`ai-summary-${dashboardType}`).textContent = insight.executiveSummary;

      const anomaliesList = document.getElementById(`ai-anomalies-${dashboardType}`);
      anomaliesList.innerHTML = "";
      (insight.anomalies || []).forEach(item => {
        const li = document.createElement("li");
        li.textContent = item;
        anomaliesList.appendChild(li);
      });

      const recsList = document.getElementById(`ai-recommendations-${dashboardType}`);
      recsList.innerHTML = "";
      (insight.recommendations || []).forEach(item => {
        const li = document.createElement("li");
        li.textContent = item;
        recsList.appendChild(li);
      });

      this.showToast("AI Insight Selesai", "Analisis eksekutif dan rekomendasi berhasil dimuat.", "success");
    } catch (err) {
      this.showToast("Gagal Generate AI", err.message || "Terjadi kesalahan saat memproses data.", "error");
    } finally {
      btnText.textContent = originalText;
    }
  }

  // =========================================================================
  // VIEW 5.1: MASTER ARMADA CRUD & MODAL
  // =========================================================================
  renderMasterArmadaTable() {
    const search = document.getElementById("search-master-armada")?.value || "";
    const list = window.dataStore.getArmada({ search });
    const tbody = document.getElementById("table-body-master-armada");
    tbody.innerHTML = "";

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-dim); padding: 24px;">Tidak ada data armada ditemukan.</td></tr>`;
      return;
    }

    list.forEach(a => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${a.No}</td>
        <td>${a.PT}</td>
        <td>${a.Depo}</td>
        <td><code>${a.Driver_ID}</code></td>
        <td><strong>${a.Nama_Driver}</strong></td>
        <td><code>${a.Vehicle_ID}</code></td>
        <td><strong style="color: #38BDF8;">${a.Nopol}</strong></td>
        <td>${a.Jenis_Armada}</td>
        <td>${a.Kapasitas} ${a.UOM || 'KG'}</td>
        <td><span class="user-role-badge role-${a.Tipe_Pengiriman === 'Retail' ? 'viewer' : 'operator'}">${a.Tipe_Pengiriman}</span></td>
        <td style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button class="btn-icon" title="Edit Armada" onclick="window.app.openArmadaModal('${a.Vehicle_ID}')">
              <i data-lucide="edit-2" style="width: 14px;"></i>
            </button>
            <button class="btn-icon delete" title="Hapus Armada" onclick="window.app.deleteArmada('${a.Vehicle_ID}')">
              <i data-lucide="trash-2" style="width: 14px;"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  openArmadaModal(vehicleId = null) {
    if (!window.authService.canEdit("master_armada")) {
      this.showToast("Akses Ditolak", "Role Anda tidak memiliki izin untuk mengubah data armada.", "error");
      return;
    }

    const modal = document.getElementById("modal-armada");
    const title = document.getElementById("modal-armada-title");

    if (vehicleId) {
      const item = window.dataStore.getArmada().find(a => a.Vehicle_ID === vehicleId);
      if (!item) return;
      title.textContent = `Edit Armada (${item.Nopol})`;
      document.getElementById("armada-vehicle-id").value = item.Vehicle_ID;
      document.getElementById("armada-pt").value = item.PT;
      document.getElementById("armada-depo").value = item.Depo;
      document.getElementById("armada-nopol").value = item.Nopol;
      document.getElementById("armada-jenis").value = item.Jenis_Armada;
      document.getElementById("armada-driver").value = item.Nama_Driver;
      document.getElementById("armada-driver-id").value = item.Driver_ID;
      document.getElementById("armada-kapasitas").value = item.Kapasitas;
      document.getElementById("armada-tipe-kirim").value = item.Tipe_Pengiriman;
      document.getElementById("armada-tipe-muatan").value = item.Tipe_Muatan || "JUGS";
    } else {
      title.textContent = "Tambah Armada Baru";
      document.getElementById("form-armada").reset();
      document.getElementById("armada-vehicle-id").value = "";
    }

    modal.classList.add("active");
  }

  handleArmadaFormSubmit(e) {
    e.preventDefault();
    const vehicleId = document.getElementById("armada-vehicle-id").value;
    const user = window.authService.getCurrentUser()?.Username || "Operator";

    const payload = {
      PT: document.getElementById("armada-pt").value,
      Depo: document.getElementById("armada-depo").value,
      Nopol: document.getElementById("armada-nopol").value.toUpperCase().trim(),
      Jenis_Armada: document.getElementById("armada-jenis").value,
      Nama_Driver: document.getElementById("armada-driver").value.trim(),
      Driver_ID: document.getElementById("armada-driver-id").value.trim(),
      Kapasitas: Number(document.getElementById("armada-kapasitas").value) || 2000,
      UOM: "KG",
      Tipe_Pengiriman: document.getElementById("armada-tipe-kirim").value,
      Tipe_Muatan: document.getElementById("armada-tipe-muatan").value
    };

    if (vehicleId) {
      payload.Vehicle_ID = vehicleId;
    }

    window.dataStore.saveArmada(payload, user);
    this.closeModal("modal-armada");
    this.renderMasterArmadaTable();
    this.refreshArmadaDashboard();
    this.showToast("Berhasil Disimpan", `Data armada ${payload.Nopol} telah diperbarui.`, "success");
  }

  deleteArmada(vehicleId) {
    if (!window.authService.canEdit("master_armada")) {
      this.showToast("Akses Ditolak", "Role Anda tidak memiliki izin untuk menghapus data armada.", "error");
      return;
    }
    if (confirm("Apakah Anda yakin ingin menghapus unit armada ini?")) {
      const user = window.authService.getCurrentUser()?.Username || "Operator";
      window.dataStore.deleteArmada(vehicleId, user);
      this.renderMasterArmadaTable();
      this.refreshArmadaDashboard();
      this.showToast("Armada Dihapus", "Unit armada berhasil dihapus dari sistem.", "info");
    }
  }

  exportMasterArmada() {
    const data = window.dataStore.getArmada();
    window.dataStore.exportToExcel(data, "Master_Armada.xlsx", "DB_Armada");
    this.showToast("Export Berhasil", "File Master_Armada.xlsx berhasil diunduh.", "success");
  }

  // =========================================================================
  // VIEW 5.1: MASTER STANDBY CRUD & MODAL
  // =========================================================================
  renderMasterStandbyTable() {
    const search = document.getElementById("search-master-standby")?.value || "";
    const list = window.dataStore.getStandby({ search });
    const tbody = document.getElementById("table-body-master-standby");
    tbody.innerHTML = "";

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-dim); padding: 24px;">Tidak ada data standby ditemukan.</td></tr>`;
      return;
    }

    list.forEach(s => {
      let badgeClass = "badge-standby";
      if (s.Status === "KIR") badgeClass = "badge-kir";
      if (s.Status === "Perbaikan") badgeClass = "badge-perbaikan";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${s.Document_ID}</code></td>
        <td>${s.tanggal}</td>
        <td>${s.PT}</td>
        <td>${s.Nama_Depo}</td>
        <td><strong>${s.Nama_Driver}</strong></td>
        <td><strong>${s.Nopol}</strong></td>
        <td><span class="${badgeClass}">${s.Status}</span></td>
        <td>${s.Created_by || '-'}</td>
        <td style="font-size: 11px; color: var(--text-dim);">${s.Created_at || '-'}</td>
        <td style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button class="btn-icon" title="Edit Data" onclick="window.app.openStandbyModal('${s.Document_ID}')">
              <i data-lucide="edit-2" style="width: 14px;"></i>
            </button>
            <button class="btn-icon delete" title="Hapus Data" onclick="window.app.deleteStandby('${s.Document_ID}')">
              <i data-lucide="trash-2" style="width: 14px;"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  openStandbyModal(docId = null) {
    if (!window.authService.canEdit("master_standby")) {
      this.showToast("Akses Ditolak", "Role Anda tidak memiliki izin untuk menambah data standby.", "error");
      return;
    }

    const modal = document.getElementById("modal-standby");
    const title = document.getElementById("modal-standby-title");
    const select = document.getElementById("standby-armada-select");

    // Populate armada dropdown
    const armadas = window.dataStore.getArmada();
    select.innerHTML = '<option value="">-- Pilih Armada --</option>';
    armadas.forEach(a => {
      select.innerHTML += `<option value="${a.Vehicle_ID}">${a.Nopol} - ${a.Nama_Driver} (${a.Depo})</option>`;
    });

    if (docId) {
      const item = window.dataStore.getStandby().find(s => s.Document_ID === docId);
      if (!item) return;
      title.textContent = `Edit Status Standby (${item.Document_ID})`;
      document.getElementById("standby-doc-id").value = item.Document_ID;
      document.getElementById("standby-tanggal").value = item.tanggal;
      document.getElementById("standby-status").value = item.Status;
      document.getElementById("standby-pt").value = item.PT;
      document.getElementById("standby-depo").value = item.Nama_Depo;
      document.getElementById("standby-driver").value = item.Nama_Driver;
      document.getElementById("standby-nopol").value = item.Nopol;

      const matchingArmada = armadas.find(a => a.Nopol === item.Nopol);
      if (matchingArmada) select.value = matchingArmada.Vehicle_ID;
    } else {
      title.textContent = "Catat Armada Standby / KIR / Perbaikan";
      document.getElementById("form-standby").reset();
      document.getElementById("standby-doc-id").value = "";
      document.getElementById("standby-tanggal").value = new Date().toISOString().substring(0, 10);
    }

    modal.classList.add("active");
  }

  onStandbyArmadaSelected(vehicleId) {
    if (!vehicleId) return;
    const a = window.dataStore.getArmada().find(item => item.Vehicle_ID === vehicleId);
    if (a) {
      document.getElementById("standby-pt").value = a.PT;
      document.getElementById("standby-depo").value = a.Depo;
      document.getElementById("standby-driver").value = a.Nama_Driver;
      document.getElementById("standby-nopol").value = a.Nopol;
    }
  }

  handleStandbyFormSubmit(e) {
    e.preventDefault();
    const docId = document.getElementById("standby-doc-id").value;
    const user = window.authService.getCurrentUser()?.Username || "Operator";

    const payload = {
      tanggal: document.getElementById("standby-tanggal").value,
      Status: document.getElementById("standby-status").value,
      PT: document.getElementById("standby-pt").value,
      Nama_Depo: document.getElementById("standby-depo").value,
      Nama_Driver: document.getElementById("standby-driver").value,
      Nopol: document.getElementById("standby-nopol").value
    };

    if (docId) payload.Document_ID = docId;

    window.dataStore.saveStandby(payload, user);
    this.closeModal("modal-standby");
    this.renderMasterStandbyTable();
    this.refreshStandbyDashboard();
    this.refreshArmadaDashboard();
    this.showToast("Berhasil Disimpan", `Data standby ${payload.Nopol} tercatat sebagai ${payload.Status}.`, "success");
  }

  deleteStandby(docId) {
    if (!window.authService.canEdit("master_standby")) {
      this.showToast("Akses Ditolak", "Role Anda tidak memiliki izin untuk menghapus data standby.", "error");
      return;
    }
    if (confirm("Hapus catatan standby ini?")) {
      const user = window.authService.getCurrentUser()?.Username || "Operator";
      window.dataStore.deleteStandby(docId, user);
      this.renderMasterStandbyTable();
      this.refreshStandbyDashboard();
      this.refreshArmadaDashboard();
      this.showToast("Data Dihapus", "Catatan standby berhasil dihapus.", "info");
    }
  }

  exportMasterStandby() {
    const data = window.dataStore.getStandby();
    window.dataStore.exportToExcel(data, "Master_Standby_Armada.xlsx", "DB_Standby");
    this.showToast("Export Berhasil", "File Master_Standby_Armada.xlsx berhasil diunduh.", "success");
  }

  // =========================================================================
  // VIEW 5.2: MASTER MUATAN (DUAL EXCEL IMPORT BKB & BTB)
  // =========================================================================
  setupDropzones() {
    const setupZone = (zoneId, jenis) => {
      const zone = document.getElementById(zoneId);
      if (!zone) return;

      zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("dragover");
      });

      zone.addEventListener("dragleave", () => {
        zone.classList.remove("dragover");
      });

      zone.addEventListener("drop", async (e) => {
        e.preventDefault();
        zone.classList.remove("dragover");
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          const file = e.dataTransfer.files[0];
          await this.processExcelUpload(file, jenis);
        }
      });
    };

    setupZone("dropzone-bkb", "BKB");
    setupZone("dropzone-btb", "BTB");
  }

  async handleFileSelect(e, jenis) {
    const file = e.target.files?.[0];
    if (file) {
      await this.processExcelUpload(file, jenis);
      e.target.value = ""; // reset file input
    }
  }

  async processExcelUpload(file, jenisMuatan) {
    if (!window.authService.canEdit("master_muatan")) {
      this.showToast("Akses Ditolak", "Role Anda tidak memiliki izin untuk mengimpor file muatan.", "error");
      return;
    }

    try {
      this.showToast("Memproses Excel", `Membaca file ${file.name} (${jenisMuatan})...`, "info");
      const rows = await window.dataStore.parseExcelFile(file);

      if (!rows || rows.length === 0) {
        this.showToast("File Kosong", "Tidak ada baris data yang ditemukan pada lembar kerja pertama.", "error");
        return;
      }

      const user = window.authService.getCurrentUser()?.Username || "Operator";
      const result = window.dataStore.importMuatanBatch(rows, jenisMuatan, user);

      if (result.success) {
        this.showToast("Import Berhasil", result.message, "success");
        this.renderMasterMuatanTable();
        this.refreshMuatanDashboard();
      } else {
        this.showToast("Import Gagal", result.message, "error");
      }
    } catch (err) {
      this.showToast("Gagal Membaca File", err.message || "Pastikan format file adalah .xlsx atau .xls valid.", "error");
    }
  }

  renderMasterMuatanTable() {
    const list = window.dataStore.getMuatan();
    const tbody = document.getElementById("table-body-master-muatan");
    tbody.innerHTML = "";

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-dim); padding: 24px;">Belum ada data muatan. Silakan upload file BKB atau BTB di atas.</td></tr>`;
      return;
    }

    // Show recent 100 entries sorted descending
    const displayList = [...list].reverse().slice(0, 100);

    displayList.forEach(m => {
      const isBkb = m.Jenis_Muatan === "BKB";
      const tagClass = isBkb ? "user-role-badge role-viewer" : "user-role-badge role-operator";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="${tagClass}">${m.Jenis_Muatan}</span></td>
        <td><code>${m.Document_ID}</code></td>
        <td>${m.tanggal}</td>
        <td>${m.Nama_Depo}</td>
        <td><strong>${m.Nama_Driver}</strong></td>
        <td>${m.Nopol}</td>
        <td>${m.Nama_Product}</td>
        <td><strong style="color: ${isBkb ? '#38BDF8' : '#F59E0B'};">${m.QTY}</strong></td>
        <td>${m.Satuan}</td>
        <td style="font-size: 11.5px; color: var(--text-muted);">${m.Keterangan}</td>
        <td style="font-size: 11px; color: var(--text-dim);">${m.Uploaded_by || '-'}</td>
      `;
      tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  exportMasterMuatan() {
    const data = window.dataStore.getMuatan();
    window.dataStore.exportToExcel(data, "Master_Muatan_Terintegrasi.xlsx", "DB_Muatan");
    this.showToast("Export Berhasil", "File Master_Muatan_Terintegrasi.xlsx berhasil diunduh.", "success");
  }

  // =========================================================================
  // VIEW 5.3: USER MANAGEMENT & PERMISSIONS
  // =========================================================================
  renderUsersTable() {
    const list = window.dataStore.getUsers();
    const tbody = document.getElementById("table-body-users");
    tbody.innerHTML = "";

    list.forEach(u => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${u.User_ID}</code></td>
        <td><strong>${u.Username}</strong></td>
        <td>${u.Nama || '-'}</td>
        <td>${u.Email}</td>
        <td><span class="user-role-badge role-${u.Role.toLowerCase()}">${u.Role}</span></td>
        <td>
          <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: ${u.Status_Aktif === 'Aktif' ? '#10B981' : '#F43F5E'};">
            ● ${u.Status_Aktif}
          </span>
        </td>
        <td style="font-size: 11.5px; color: var(--text-dim);">${u.Last_Login || '-'}</td>
        <td style="text-align: right;">
          <div class="action-btn-group" style="justify-content: flex-end;">
            <button class="btn-icon" title="Edit User" onclick="window.app.openUserModal('${u.User_ID}')">
              <i data-lucide="edit-2" style="width: 14px;"></i>
            </button>
            <button class="btn-icon delete" title="Hapus User" onclick="window.app.deleteUser('${u.User_ID}')">
              <i data-lucide="trash-2" style="width: 14px;"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  openUserModal(userId = null) {
    if (!window.authService.canAccess("user_management")) {
      this.showToast("Akses Terbatas", "Hanya Administrator yang dapat mengelola akun pengguna.", "error");
      return;
    }

    const modal = document.getElementById("modal-user");
    const title = document.getElementById("modal-user-title");

    if (userId) {
      const u = window.dataStore.getUsers().find(item => item.User_ID === userId);
      if (!u) return;
      title.textContent = `Edit User (${u.Username})`;
      document.getElementById("user-id").value = u.User_ID;
      document.getElementById("user-username").value = u.Username;
      document.getElementById("user-nama").value = u.Nama || "";
      document.getElementById("user-email").value = u.Email;
      document.getElementById("user-password").value = "";
      document.getElementById("user-role").value = u.Role;
      document.getElementById("user-status").value = u.Status_Aktif;
    } else {
      title.textContent = "Tambah Pengguna Baru";
      document.getElementById("form-user").reset();
      document.getElementById("user-id").value = "";
    }

    modal.classList.add("active");
  }

  async handleUserFormSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById("user-id").value;
    const username = document.getElementById("user-username").value.trim();
    const nama = document.getElementById("user-nama").value.trim();
    const email = document.getElementById("user-email").value.trim();
    const password = document.getElementById("user-password").value;
    const role = document.getElementById("user-role").value;
    const status = document.getElementById("user-status").value;

    const payload = {
      Username: username,
      Nama: nama || username,
      Email: email,
      Role: role,
      Status_Aktif: status
    };

    if (userId) {
      payload.User_ID = userId;
      if (password) {
        payload.Password_Hash = await window.authService.hashPassword(password);
      }
    } else {
      if (!password) {
        this.showToast("Password Wajib", "Password harus diisi untuk pengguna baru.", "error");
        return;
      }
      payload.Password_Hash = await window.authService.hashPassword(password);
    }

    window.dataStore.saveUser(payload);
    this.closeModal("modal-user");
    this.renderUsersTable();
    this.showToast("User Disimpan", `Akun ${nama || username} berhasil disimpan.`, "success");
  }

  deleteUser(userId) {
    const currentUser = window.authService.getCurrentUser();
    if (currentUser && currentUser.User_ID === userId) {
      this.showToast("Gagal", "Anda tidak dapat menghapus akun Anda sendiri saat sedang login.", "error");
      return;
    }

    if (confirm("Apakah Anda yakin ingin menghapus akun pengguna ini?")) {
      window.dataStore.deleteUser(userId, currentUser?.Username || "Admin");
      this.renderUsersTable();
      this.showToast("User Dihapus", "Akun berhasil dihapus dari sistem.", "info");
    }
  }

  // =========================================================================
  // VIEW / MODAL: PENGATURAN PROFIL PRIBADI
  // =========================================================================
  openProfileModal() {
    const user = window.authService.getCurrentUser();
    if (!user) {
      this.showToast("Peringatan", "Silakan login terlebih dahulu.", "warning");
      return;
    }

    const modal = document.getElementById("modal-profile");
    if (!modal) return;

    // Header info
    const avatarEl = document.getElementById("modal-profile-avatar");
    const nameEl = document.getElementById("modal-profile-header-name");
    const roleEl = document.getElementById("modal-profile-header-role");
    const idEl = document.getElementById("modal-profile-header-id");

    const displayName = user.Nama || user.Username || "Pengguna";
    if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) {
      roleEl.textContent = (user.Role || "USER").toUpperCase();
      roleEl.className = `user-role-badge role-${(user.Role || "user").toLowerCase()}`;
    }
    if (idEl) idEl.textContent = user.User_ID || "";

    // Form inputs
    document.getElementById("profile-username").value = user.Username || "";
    document.getElementById("profile-nama").value = user.Nama || user.Username || "";
    document.getElementById("profile-email").value = user.Email || "";
    document.getElementById("profile-current-password").value = "";
    document.getElementById("profile-new-password").value = "";
    document.getElementById("profile-confirm-password").value = "";

    // Reset password field visibility to password
    ["profile-current-password", "profile-new-password", "profile-confirm-password"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.type = "password";
    });

    modal.classList.add("active");
    if (window.lucide) window.lucide.createIcons();
  }

  async handleProfileFormSubmit(e) {
    e.preventDefault();
    const username = document.getElementById("profile-username").value.trim();
    const nama = document.getElementById("profile-nama").value.trim();
    const email = document.getElementById("profile-email").value.trim();
    const currentPassword = document.getElementById("profile-current-password").value;
    const newPassword = document.getElementById("profile-new-password").value;
    const confirmPassword = document.getElementById("profile-confirm-password").value;

    if (!username) {
      this.showToast("Username Kosong", "Nama pengguna (username) tidak boleh kosong.", "error");
      return;
    }

    if (!nama) {
      this.showToast("Nama Kosong", "Nama lengkap tidak boleh kosong.", "error");
      return;
    }

    if (!email) {
      this.showToast("Email Kosong", "Alamat email tidak boleh kosong.", "error");
      return;
    }

    // Validation if user wants to change password
    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        this.showToast("Verifikasi Diperlukan", "Masukkan kata sandi saat ini untuk menyetujui perubahan kata sandi.", "error");
        return;
      }
      if (newPassword.length < 4) {
        this.showToast("Kata Sandi Terlalu Pendek", "Kata sandi baru minimal 4 karakter.", "error");
        return;
      }
      if (newPassword !== confirmPassword) {
        this.showToast("Kata Sandi Tidak Cocok", "Kata sandi baru dan konfirmasi kata sandi tidak sama.", "error");
        return;
      }
    }

    const result = await window.authService.updateProfile({
      Username: username,
      Nama: nama,
      Email: email,
      currentPassword: currentPassword,
      newPassword: newPassword
    });

    if (!result.success) {
      this.showToast("Gagal Memperbarui Profil", result.message, "error");
      return;
    }

    // Update UI elements in App Shell (tampilkan Nama, bukan username)
    const updatedUser = result.user;
    const newDisplayName = updatedUser.Nama || updatedUser.Username;
    const sidebarName = document.getElementById("sidebar-user-name");
    const sidebarAvatar = document.getElementById("sidebar-user-avatar");
    if (sidebarName) sidebarName.textContent = newDisplayName;
    if (sidebarAvatar) sidebarAvatar.textContent = newDisplayName.charAt(0).toUpperCase();

    // Re-render user table if user management view is active
    if (this.currentViewId === "view-user-management" && typeof this.renderUsersTable === "function") {
      this.renderUsersTable();
    }

    this.closeModal("modal-profile");
    this.showToast("Profil Berhasil Diperbarui", "Nama dan kredensial akun Anda telah berhasil diperbarui.", "success");
  }

  // =========================================================================
  // VIEW: SETTINGS & GAS SYNC
  // =========================================================================
  loadSettingsForm() {
    const s = window.dataStore.getSettings();
    document.getElementById("setting-gas-url").value = s.gasUrl || "";
    document.getElementById("setting-data-mode").value = s.dataMode || "LOCAL";
    document.getElementById("setting-gemini-key").value = s.geminiApiKey || "";
  }

  updateBackendStatusIndicator(state, text) {
    const statusPill = document.getElementById("system-status-text");
    const container = statusPill ? statusPill.closest(".system-status-indicator") : null;
    if (!statusPill) return;

    if (text) statusPill.textContent = text;
    if (container) {
      container.classList.remove("status-gas-connected", "status-syncing", "status-local", "status-error");
      if (state === "gas") container.classList.add("status-gas-connected");
      else if (state === "syncing") container.classList.add("status-syncing");
      else if (state === "error") container.classList.add("status-error");
      else container.classList.add("status-local");
    }
  }

  saveBackendSettings() {
    const s = window.dataStore.getSettings();
    s.gasUrl = document.getElementById("setting-gas-url").value.trim();
    s.dataMode = document.getElementById("setting-data-mode").value;
    window.dataStore.saveSettings(s);

    if (s.dataMode === "GAS" && s.gasUrl) {
      this.updateBackendStatusIndicator("gas", "GAS Web App: Connected");
    } else {
      this.updateBackendStatusIndicator("local", "Storage: Local Mode");
    }

    this.showToast("Pengaturan Disimpan", "Konfigurasi koneksi backend berhasil disimpan.", "success");
  }

  saveGeminiKey() {
    const s = window.dataStore.getSettings();
    s.geminiApiKey = document.getElementById("setting-gemini-key").value.trim();
    window.dataStore.saveSettings(s);
    this.showToast("API Key Disimpan", "Google Gemini API Key berhasil dikonfigurasi.", "success");
  }

  resetDatabaseDemo() {
    if (confirm("Reset seluruh data ke kondisi demo awal? Semua modifikasi lokal akan dikembalikan.")) {
      window.dataStore.initDatabase(true);
      this.showToast("Data Direset", "Database berhasil dikembalikan ke seed data awal.", "info");
      this.refreshArmadaDashboard();
      this.renderLogsTable();
    }
  }

  renderLogsTable() {
    const logs = window.dataStore.getLogs();
    const tbody = document.getElementById("table-body-logs");
    if (!tbody) return;
    tbody.innerHTML = "";

    logs.slice(0, 30).forEach(l => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${l.Log_ID}</code></td>
        <td style="font-size: 11.5px; color: var(--text-dim);">${l.Timestamp}</td>
        <td><strong>${l.User}</strong></td>
        <td><span class="user-role-badge role-operator">${l.Activity}</span></td>
        <td style="font-size: 12px; color: #CBD5E1;">${l.Keterangan}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- Modal Helpers ---
  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
  }

  // --- Toast System ---
  showToast(title, desc, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = "info";
    if (type === "success") icon = "check-circle";
    if (type === "error") icon = "alert-circle";

    toast.innerHTML = `
      <i data-lucide="${icon}" style="width: 18px; margin-top: 2px;"></i>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-desc">${desc}</div>
      </div>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(20px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // --- Theme Management (Dark / Light Mode) ---
  initTheme() {
    const savedTheme = localStorage.getItem("mytruck_theme") || "dark";
    if (savedTheme === "light") {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
    this.updateThemeIcons(savedTheme);
  }

  toggleTheme() {
    const isLight = document.body.classList.toggle("light-theme");
    const currentTheme = isLight ? "light" : "dark";
    localStorage.setItem("mytruck_theme", currentTheme);
    this.updateThemeIcons(currentTheme);

    // Re-render active view's charts to adapt grid lines and text colors
    if (this.currentViewId === "view-dashboard-armada") {
      this.refreshArmadaDashboard();
    } else if (this.currentViewId === "view-dashboard-muatan") {
      this.refreshMuatanDashboard();
    }

    this.showToast("Mode Tampilan Diubah", `Tema ${isLight ? 'Terang (Light)' : 'Gelap (Dark)'} diaktifkan.`, "info");
  }

  updateThemeIcons(theme) {
    const isLight = theme === "light";
    document.querySelectorAll(".icon-theme-sun").forEach(el => {
      el.style.display = isLight ? "inline-block" : "none";
    });
    document.querySelectorAll(".icon-theme-moon").forEach(el => {
      el.style.display = isLight ? "none" : "inline-block";
    });
    if (window.lucide) window.lucide.createIcons();
  }
}

// Bootstrap application on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.app = new AppController();
  window.app.init();
});
