/**
 * Web Monitoring Armada - Data Store & Local Storage Engine
 * Menyediakan state management, filter query, perhitungan matriks, dan integrasi SheetJS
 */

class DataStore {
  constructor() {
    this.STORAGE_KEYS = {
      USERS: "mytruck_db_users",
      ARMADA: "mytruck_db_armada",
      STANDBY: "mytruck_db_standby",
      MUATAN: "mytruck_db_muatan",
      LOGS: "mytruck_db_logs",
      SETTINGS: "mytruck_db_settings"
    };

    this.initDatabase();
  }

  initDatabase(forceReset = false) {
    if (forceReset || !localStorage.getItem(this.STORAGE_KEYS.ARMADA)) {
      localStorage.setItem(this.STORAGE_KEYS.USERS, JSON.stringify(window.SEED_DATA.users));
      localStorage.setItem(this.STORAGE_KEYS.ARMADA, JSON.stringify(window.SEED_DATA.armada));
      localStorage.setItem(this.STORAGE_KEYS.STANDBY, JSON.stringify(window.SEED_DATA.standby));
      localStorage.setItem(this.STORAGE_KEYS.MUATAN, JSON.stringify(window.SEED_DATA.muatan));
      localStorage.setItem(this.STORAGE_KEYS.LOGS, JSON.stringify(window.SEED_DATA.logs));

      const defaultSettings = {
        gasUrl: "https://script.google.com/macros/s/AKfycbxf7E8JNMgIdgSR1nytpake7qoJ7TDAhZfdZZIjrh-DGhgxOtNe1FiDNp4SzKzI7Usf/exec",
        geminiApiKey: "",
        dataMode: "GAS" // "LOCAL" or "GAS"
      };
      localStorage.setItem(this.STORAGE_KEYS.SETTINGS, JSON.stringify(defaultSettings));
    }
  }

  // --- Generic Helpers ---
  getItem(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
      console.error("Error reading from storage", key, e);
      return [];
    }
  }

  setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Error saving to storage", key, e);
      return false;
    }
  }

  getSettings() {
    const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxf7E8JNMgIdgSR1nytpake7qoJ7TDAhZfdZZIjrh-DGhgxOtNe1FiDNp4SzKzI7Usf/exec";
    try {
      const s = JSON.parse(localStorage.getItem(this.STORAGE_KEYS.SETTINGS));
      if (!s) return { gasUrl: DEFAULT_GAS_URL, geminiApiKey: "", dataMode: "GAS" };
      if (!s.gasUrl) s.gasUrl = DEFAULT_GAS_URL;
      return s;
    } catch (e) {
      return { gasUrl: DEFAULT_GAS_URL, geminiApiKey: "", dataMode: "GAS" };
    }
  }

  saveSettings(settings) {
    this.setItem(this.STORAGE_KEYS.SETTINGS, settings);
  }

  // --- Remote Google Apps Script Live Sync Engine ---
  async sendGasRequest(action, payload = {}) {
    const settings = this.getSettings();
    if (!settings.gasUrl) return null;

    try {
      const res = await fetch(settings.gasUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: action, ...payload })
      });
      return await res.json();
    } catch (e) {
      console.warn("GAS Live Sync Warning:", e);
      return null;
    }
  }

  async syncFromGas() {
    const settings = this.getSettings();
    if (!settings.gasUrl || settings.dataMode === "LOCAL") {
      return { success: false, reason: "LOCAL_MODE" };
    }

    try {
      let syncedCount = 0;
      const fetchSheet = async (action, key) => {
        try {
          const res = await fetch(`${settings.gasUrl}?action=${action}`);
          const json = await res.json();
          if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
            this.setItem(key, json.data);
            syncedCount += json.data.length;
            return true;
          }
          return false;
        } catch (err) {
          console.warn(`Gagal sync ${action}:`, err);
          return false;
        }
      };

      const results = await Promise.all([
        fetchSheet("getUsers", this.STORAGE_KEYS.USERS),
        fetchSheet("getArmada", this.STORAGE_KEYS.ARMADA),
        fetchSheet("getStandby", this.STORAGE_KEYS.STANDBY),
        fetchSheet("getMuatan", this.STORAGE_KEYS.MUATAN),
        fetchSheet("getLogs", this.STORAGE_KEYS.LOGS)
      ]);

      const anySuccess = results.some(r => r === true);
      return { success: anySuccess, syncedCount };
    } catch (e) {
      console.warn("Error running syncFromGas:", e);
      return { success: false, error: e };
    }
  }

  addLog(user, activity, keterangan) {
    const logs = this.getItem(this.STORAGE_KEYS.LOGS);
    const newLog = {
      Log_ID: "LOG-" + Date.now().toString().slice(-6),
      Timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      User: user || "System",
      Activity: activity,
      Keterangan: keterangan
    };
    logs.unshift(newLog);
    if (logs.length > 500) logs.pop(); // keep last 500
    this.setItem(this.STORAGE_KEYS.LOGS, logs);
    return newLog;
  }

  getLogs() {
    return this.getItem(this.STORAGE_KEYS.LOGS);
  }

  // --- Users Operations ---
  getUsers() {
    return this.getItem(this.STORAGE_KEYS.USERS);
  }

  saveUser(userData) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.User_ID === userData.User_ID);
    let targetUser = null;

    if (index >= 0) {
      // update
      users[index] = { ...users[index], ...userData };
      targetUser = users[index];
      this.setItem(this.STORAGE_KEYS.USERS, users);
      this.addLog(userData.Updated_by || "Admin", "USER_UPDATE", `Update user ${userData.Username}`);
    } else {
      // create
      const newUser = {
        User_ID: userData.User_ID || ("USR-" + (users.length + 1).toString().padStart(3, "0")),
        Status_Aktif: "Aktif",
        Remember_Token: "",
        Token_Expiry: "",
        Last_Login: "-",
        ...userData
      };
      users.push(newUser);
      targetUser = newUser;
      this.setItem(this.STORAGE_KEYS.USERS, users);
      this.addLog(userData.Created_by || "Admin", "USER_CREATE", `Tambah user baru ${newUser.Username}`);
    }

    // Live Sync to Google Sheets
    this.sendGasRequest("saveUser", { data: targetUser, currentUser: userData.Created_by || userData.Updated_by || "Admin" });
    return targetUser;
  }

  deleteUser(userId, deletedBy = "Admin") {
    let users = this.getUsers();
    const user = users.find(u => u.User_ID === userId);
    if (!user) return false;
    users = users.filter(u => u.User_ID !== userId);
    this.setItem(this.STORAGE_KEYS.USERS, users);
    this.addLog(deletedBy, "USER_DELETE", `Hapus user ${user.Username}`);

    // Live Sync to Google Sheets
    this.sendGasRequest("deleteUser", { userId: userId, currentUser: deletedBy });
    return true;
  }

  // --- Armada Operations ---
  getArmada(filters = {}) {
    let list = this.getItem(this.STORAGE_KEYS.ARMADA);
    if (filters.pt && filters.pt !== "ALL") {
      const targetPt = String(filters.pt).trim().toLowerCase();
      list = list.filter(item => String(item.PT || "").trim().toLowerCase() === targetPt);
    }
    if (filters.depo && filters.depo !== "ALL") {
      const targetDepo = String(filters.depo).trim().toLowerCase();
      list = list.filter(item => String(item.Depo || "").trim().toLowerCase() === targetDepo);
    }
    if (filters.tipePengiriman && filters.tipePengiriman !== "ALL") {
      const targetTipe = String(filters.tipePengiriman).trim().toLowerCase();
      list = list.filter(item => String(item.Tipe_Pengiriman || "").trim().toLowerCase() === targetTipe);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(item =>
        (item.Nama_Driver && item.Nama_Driver.toLowerCase().includes(q)) ||
        (item.Nopol && item.Nopol.toLowerCase().includes(q)) ||
        (item.Vehicle_ID && item.Vehicle_ID.toLowerCase().includes(q)) ||
        (item.Jenis_Armada && item.Jenis_Armada.toLowerCase().includes(q)) ||
        (item.Depo && item.Depo.toLowerCase().includes(q)) ||
        (item.PT && item.PT.toLowerCase().includes(q))
      );
    }
    return list;
  }

  saveArmada(armadaItem, currentUser = "Operator") {
    const list = this.getItem(this.STORAGE_KEYS.ARMADA);
    const index = list.findIndex(a => a.Vehicle_ID === armadaItem.Vehicle_ID);
    let target = null;
    if (index >= 0) {
      list[index] = { ...list[index], ...armadaItem };
      target = list[index];
      this.setItem(this.STORAGE_KEYS.ARMADA, list);
      this.addLog(currentUser, "ARMADA_UPDATE", `Update unit armada ${armadaItem.Nopol} (${armadaItem.Vehicle_ID})`);
    } else {
      const newItem = {
        No: list.length + 1,
        Vehicle_ID: armadaItem.Vehicle_ID || "VEH-" + (100 + list.length + 1),
        ...armadaItem
      };
      list.push(newItem);
      target = newItem;
      this.setItem(this.STORAGE_KEYS.ARMADA, list);
      this.addLog(currentUser, "ARMADA_CREATE", `Tambah armada baru ${newItem.Nopol} (${newItem.Vehicle_ID})`);
    }

    this.sendGasRequest("saveArmada", { data: target, user: currentUser });
    return target;
  }

  deleteArmada(vehicleId, currentUser = "Operator") {
    let list = this.getItem(this.STORAGE_KEYS.ARMADA);
    const target = list.find(a => a.Vehicle_ID === vehicleId);
    if (!target) return false;
    list = list.filter(a => a.Vehicle_ID !== vehicleId);
    // Re-index No
    list.forEach((item, idx) => item.No = idx + 1);
    this.setItem(this.STORAGE_KEYS.ARMADA, list);
    this.addLog(currentUser, "ARMADA_DELETE", `Hapus unit armada ${target.Nopol}`);

    this.sendGasRequest("deleteArmada", { vehicleId: vehicleId, user: currentUser });
    return true;
  }

  // --- Standby Operations ---
  getStandby(filters = {}) {
    let list = this.getItem(this.STORAGE_KEYS.STANDBY);
    if (filters.pt && filters.pt !== "ALL") {
      const targetPt = String(filters.pt).trim().toLowerCase();
      list = list.filter(item => String(item.PT || "").trim().toLowerCase() === targetPt);
    }
    if (filters.depo && filters.depo !== "ALL") {
      const targetDepo = String(filters.depo).trim().toLowerCase();
      list = list.filter(item => String(item.Nama_Depo || item.Depo || "").trim().toLowerCase() === targetDepo);
    }
    if (filters.status && filters.status !== "ALL") {
      const targetStatus = String(filters.status).trim().toLowerCase();
      list = list.filter(item => String(item.Status || "").trim().toLowerCase() === targetStatus);
    }
    if (filters.startDate && filters.endDate) {
      list = list.filter(item => item.tanggal >= filters.startDate && item.tanggal <= filters.endDate);
    } else if (filters.date) {
      list = list.filter(item => item.tanggal === filters.date);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(item =>
        (item.Nama_Driver && item.Nama_Driver.toLowerCase().includes(q)) ||
        (item.Nopol && item.Nopol.toLowerCase().includes(q)) ||
        (item.Document_ID && item.Document_ID.toLowerCase().includes(q)) ||
        (item.Nama_Depo && item.Nama_Depo.toLowerCase().includes(q)) ||
        (item.PT && item.PT.toLowerCase().includes(q))
      );
    }
    return list;
  }

  saveStandby(standbyItem, currentUser = "Operator") {
    const list = this.getItem(this.STORAGE_KEYS.STANDBY);
    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    const index = list.findIndex(s => s.Document_ID === standbyItem.Document_ID);
    let target = null;

    if (index >= 0) {
      list[index] = {
        ...list[index],
        ...standbyItem,
        Updated_at: now,
        Updated_by: currentUser
      };
      target = list[index];
      this.setItem(this.STORAGE_KEYS.STANDBY, list);
      this.addLog(currentUser, "STANDBY_UPDATE", `Update data standby ${standbyItem.Document_ID} - Status ${standbyItem.Status}`);
    } else {
      const dateStr = (standbyItem.tanggal || new Date().toISOString().substring(0, 10)).replace(/-/g, "");
      const newDocId = `STB-${dateStr}-${(list.length + 1).toString().padStart(3, "0")}`;
      const newItem = {
        Document_ID: standbyItem.Document_ID || newDocId,
        Created_by: currentUser,
        Created_at: now,
        Updated_at: now,
        Updated_by: currentUser,
        ...standbyItem
      };
      list.push(newItem);
      target = newItem;
      this.setItem(this.STORAGE_KEYS.STANDBY, list);
      this.addLog(currentUser, "STANDBY_CREATE", `Tambah data standby ${newItem.Document_ID} (${newItem.Nopol} - ${newItem.Status})`);
    }

    this.sendGasRequest("saveStandby", { data: target, user: currentUser });
    return target;
  }

  deleteStandby(docId, currentUser = "Operator") {
    let list = this.getItem(this.STORAGE_KEYS.STANDBY);
    const target = list.find(s => s.Document_ID === docId);
    if (!target) return false;
    list = list.filter(s => s.Document_ID !== docId);
    this.setItem(this.STORAGE_KEYS.STANDBY, list);
    this.addLog(currentUser, "STANDBY_DELETE", `Hapus data standby ${docId}`);

    this.sendGasRequest("deleteStandby", { docId: docId, user: currentUser });
    return true;
  }

  // --- Muatan Operations ---
  getMuatan(filters = {}) {
    let list = this.getItem(this.STORAGE_KEYS.MUATAN);
    if (filters.jenisMuatan && filters.jenisMuatan !== "ALL") {
      const targetJenis = String(filters.jenisMuatan).trim().toLowerCase();
      list = list.filter(item => String(item.Jenis_Muatan || "").trim().toLowerCase() === targetJenis);
    }
    if (filters.pt && filters.pt !== "ALL") {
      const targetPt = String(filters.pt).trim().toLowerCase();
      list = list.filter(item => String(item.PT || "").trim().toLowerCase() === targetPt);
    }
    if (filters.depo && filters.depo !== "ALL") {
      const targetDepo = String(filters.depo).trim().toLowerCase();
      list = list.filter(item => String(item.Nama_Depo || item.Depo || "").trim().toLowerCase() === targetDepo);
    }
    if (filters.tipePengiriman && filters.tipePengiriman !== "ALL") {
      const targetTipe = String(filters.tipePengiriman).trim().toLowerCase();
      list = list.filter(item => String(item.Tipe_Pengiriman || "").trim().toLowerCase() === targetTipe);
    }
    if (filters.startDate && filters.endDate) {
      list = list.filter(item => item.tanggal >= filters.startDate && item.tanggal <= filters.endDate);
    } else if (filters.date) {
      list = list.filter(item => item.tanggal === filters.date);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(item =>
        (item.Nama_Driver && item.Nama_Driver.toLowerCase().includes(q)) ||
        (item.Nopol && item.Nopol.toLowerCase().includes(q)) ||
        (item.Nama_Product && item.Nama_Product.toLowerCase().includes(q)) ||
        (item.Document_ID && item.Document_ID.toLowerCase().includes(q)) ||
        (item.Nama_Depo && item.Nama_Depo.toLowerCase().includes(q)) ||
        (item.PT && item.PT.toLowerCase().includes(q))
      );
    }
    return list;
  }

  importMuatanBatch(items, jenisMuatan, currentUser = "Operator") {
    if (!items || !items.length) return { success: false, count: 0, message: "Tidak ada data untuk diimport." };

    const currentMuatan = this.getItem(this.STORAGE_KEYS.MUATAN);
    const now = new Date().toISOString().replace("T", " ").substring(0, 19);

    const preparedItems = items.map((row, idx) => {
      // PRD 5.2: Sistem secara otomatis menyisipkan kolom pertama dengan Jenis_Muatan ("BKB" atau "BTB")
      return {
        Jenis_Muatan: jenisMuatan, // Paksa Jenis_Muatan sesuai tempat upload
        Document_ID: row.Document_ID || `${jenisMuatan}-${Date.now().toString().slice(-6)}-${(idx + 1).toString().padStart(3, "0")}`,
        tanggal: row.tanggal || row.Tanggal || new Date().toISOString().substring(0, 10),
        PT: row.PT || "PT Tirta Makmur Jaya",
        Nama_Depo: row.Nama_Depo || row.Depo || "Depo Cakung Jakarta",
        Driver_ID: row.Driver_ID || "DRV-999",
        Nama_Driver: row.Nama_Driver || "Driver Mitra",
        Vehicle_ID: row.Vehicle_ID || "VEH-999",
        Nopol: row.Nopol || "B 0000 XYZ",
        Tipe_Pengiriman: row.Tipe_Pengiriman || "Retail",
        Product_ID: row.Product_ID || "PRD-GEN-01",
        Nama_Product: row.Nama_Product || "Produk Logistik",
        QTY: Number(row.QTY) || 0,
        Satuan: (row.Satuan || "BOX").toUpperCase(),
        Keterangan: row.Keterangan || (jenisMuatan === "BKB" ? "Pengiriman Rutin" : "Retur Barang"),
        Created_dms_by: row.Created_dms_by || "DMS_IMPORT",
        Uploaded_by: currentUser,
        Upload_at: now
      };
    });

    const updated = [...currentMuatan, ...preparedItems];
    this.setItem(this.STORAGE_KEYS.MUATAN, updated);
    this.addLog(currentUser, `IMPORT_${jenisMuatan}`, `Berhasil import ${preparedItems.length} record muatan ${jenisMuatan}`);

    // Live Sync to Google Sheets
    this.sendGasRequest("importMuatanBatch", { items: preparedItems, jenisMuatan: jenisMuatan, user: currentUser });

    return {
      success: true,
      count: preparedItems.length,
      message: `Berhasil mengimpor ${preparedItems.length} baris data ${jenisMuatan} ke DB_Muatan.`
    };
  }

  // --- Analytics: Dashboard 3.1 Armada ---
  getArmadaDashboardMetrics(filters = {}) {
    const armadaList = this.getArmada({ pt: filters.pt, depo: filters.depo });
    const allStandby = this.getStandby({ pt: filters.pt, depo: filters.depo });

    // Summary Cards
    const totalArmada = armadaList.length;
    const totalRetail = armadaList.filter(a => {
      const t = String(a.Tipe_Pengiriman || "").trim().toLowerCase();
      return t === "retail" || t.includes("retail");
    }).length;
    const totalDropping = armadaList.filter(a => {
      const t = String(a.Tipe_Pengiriman || "").trim().toLowerCase();
      return t === "dropping" || t.includes("drop");
    }).length;

    // Check currently active standby records for the latest day or unique standby vehicles
    // Standby total includes Standby, KIR, Perbaikan
    const activeStandbyVehicles = new Set();
    allStandby.forEach(stb => {
      activeStandbyVehicles.add(stb.Nopol);
    });
    const totalStandby = activeStandbyVehicles.size;

    // Progress bar: Persentase Jenis Armada terhadap Total Armada
    const jenisCount = {};
    armadaList.forEach(item => {
      const j = item.Jenis_Armada || "Lainnya";
      jenisCount[j] = (jenisCount[j] || 0) + 1;
    });

    const jenisArmadaPercentages = Object.entries(jenisCount).map(([jenis, count]) => {
      const pct = totalArmada > 0 ? ((count / totalArmada) * 100).toFixed(1) : 0;
      return { jenis, count, percentage: Number(pct) };
    }).sort((a, b) => b.count - a.count);

    // Bar Chart: Distribusi Nama Depo vs Jumlah Armada
    const depoCount = {};
    armadaList.forEach(item => {
      const d = item.Depo || "Depo Unknown";
      depoCount[d] = (depoCount[d] || 0) + 1;
    });

    // Pie Chart: Distribusi Tipe Muatan Armada (JUGS, SPS, MIX)
    const tipeMuatanCount = { JUGS: 0, SPS: 0, MIX: 0 };
    armadaList.forEach(item => {
      const tm = (item.Tipe_Muatan || "MIX").toUpperCase();
      if (tipeMuatanCount[tm] !== undefined) {
        tipeMuatanCount[tm]++;
      } else {
        tipeMuatanCount.MIX++;
      }
    });

    return {
      summary: {
        totalArmada,
        totalRetail,
        totalDropping,
        totalStandby
      },
      jenisArmadaPercentages,
      depoDistribution: {
        labels: Object.keys(depoCount),
        data: Object.values(depoCount)
      },
      tipeMuatanDistribution: {
        labels: ["JUGS", "SPS", "MIX"],
        data: [tipeMuatanCount.JUGS, tipeMuatanCount.SPS, tipeMuatanCount.MIX]
      }
    };
  }

  // --- Analytics: Dashboard 3.2 Armada Standby & Matrices ---
  getStandbyDashboardData(filters = {}) {
    const { pt, depo, startDate, endDate } = filters;
    const armadaList = this.getArmada({ pt, depo });
    const totalArmada = armadaList.length;

    // Filter standby by range and filters
    const standbyList = this.getStandby({ pt, depo, startDate, endDate });

    // Distinct date array sorted
    const dateSet = new Set();
    standbyList.forEach(s => dateSet.add(s.tanggal));

    // If range is specified, build full date sequence between startDate and endDate
    let dates = [];
    if (startDate && endDate) {
      const curr = new Date(startDate);
      const end = new Date(endDate);
      while (curr <= end) {
        dates.push(curr.toISOString().substring(0, 10));
        curr.setDate(curr.getDate() + 1);
      }
    } else {
      dates = Array.from(dateSet).sort();
    }
    if (dates.length === 0) {
      dates = [new Date().toISOString().substring(0, 10)];
    }

    // Counts by Status
    let totalStandby = 0;
    let totalKIR = 0;
    let totalPerbaikan = 0;

    standbyList.forEach(s => {
      if (s.Status === "Standby") totalStandby++;
      else if (s.Status === "KIR") totalKIR++;
      else if (s.Status === "Perbaikan") totalPerbaikan++;
    });

    const dayCount = Math.max(dates.length, 1);
    const avgDailyStandby = (totalStandby / dayCount).toFixed(1);
    const avgDailyKIR = (totalKIR / dayCount).toFixed(1);
    const avgDailyPerbaikan = (totalPerbaikan / dayCount).toFixed(1);

    // Matrix 1: Summary by Depo
    // Baris: Nama Depo, Kolom: Tanggal, Nilai: Total non-aktif, Hover: detail breakdown
    const uniqueDepos = Array.from(new Set(armadaList.map(a => a.Depo)));
    const matrixDepo = uniqueDepos.map(depoName => {
      const dateValues = {};
      dates.forEach(d => {
        const matches = standbyList.filter(s => s.Nama_Depo === depoName && s.tanggal === d);
        const count = matches.length;
        const standby = matches.filter(s => s.Status === "Standby").length;
        const kir = matches.filter(s => s.Status === "KIR").length;
        const perbaikan = matches.filter(s => s.Status === "Perbaikan").length;
        dateValues[d] = {
          total: count,
          standby,
          kir,
          perbaikan,
          tooltip: `Standby: ${standby}, KIR: ${kir}, Perbaikan: ${perbaikan}`
        };
      });
      return {
        depo: depoName,
        dates: dateValues
      };
    });

    // Matrix 2: Summary by Driver
    // Baris: Nama Driver, Kolom: Tanggal, Nilai Badge: S (Biru), K (Kuning), P (Merah), atau '-'
    const uniqueDrivers = Array.from(new Set(armadaList.map(a => a.Nama_Driver)));
    const matrixDriver = uniqueDrivers.map(driverName => {
      const driverObj = armadaList.find(a => a.Nama_Driver === driverName);
      const dateValues = {};
      dates.forEach(d => {
        const match = standbyList.find(s => s.Nama_Driver === driverName && s.tanggal === d);
        if (match) {
          let code = "S";
          let badgeClass = "badge-standby";
          if (match.Status === "KIR") {
            code = "K";
            badgeClass = "badge-kir";
          } else if (match.Status === "Perbaikan") {
            code = "P";
            badgeClass = "badge-perbaikan";
          }
          dateValues[d] = {
            status: match.Status,
            code,
            badgeClass,
            nopol: match.Nopol
          };
        } else {
          dateValues[d] = {
            status: "Active",
            code: "•",
            badgeClass: "badge-active",
            nopol: driverObj ? driverObj.Nopol : ""
          };
        }
      });
      return {
        driver: driverName,
        nopol: driverObj ? driverObj.Nopol : "-",
        depo: driverObj ? driverObj.Depo : "-",
        dates: dateValues
      };
    });

    return {
      summary: {
        totalArmada,
        totalStandby,
        totalKIR,
        totalPerbaikan,
        avgDailyStandby,
        avgDailyKIR,
        avgDailyPerbaikan
      },
      dates,
      matrixDepo,
      matrixDriver
    };
  }

  // --- Analytics: Dashboard 3.3 Dashboard Muatan Armada & Matrices ---
  getMuatanDashboardData(filters = {}) {
    const { pt, depo, jenisPengiriman, startDate, endDate } = filters;
    const muatanList = this.getMuatan({ pt, depo, tipePengiriman: jenisPengiriman, startDate, endDate });

    // Separate BKB and BTB
    const bkbList = muatanList.filter(m => m.Jenis_Muatan === "BKB");
    const btbList = muatanList.filter(m => m.Jenis_Muatan === "BTB");

    // Dates calculation
    let dates = [];
    if (startDate && endDate) {
      const curr = new Date(startDate);
      const end = new Date(endDate);
      while (curr <= end) {
        dates.push(curr.toISOString().substring(0, 10));
        curr.setDate(curr.getDate() + 1);
      }
    } else {
      const dSet = new Set(muatanList.map(m => m.tanggal));
      dates = Array.from(dSet).sort();
    }
    if (dates.length === 0) {
      dates = [new Date().toISOString().substring(0, 10)];
    }
    const dayCount = Math.max(dates.length, 1);

    // BKB totals
    let totalInBox = 0;
    let totalInJugs = 0;
    bkbList.forEach(item => {
      if (item.Satuan === "BOX") totalInBox += Number(item.QTY) || 0;
      else if (item.Satuan === "JUGS") totalInJugs += Number(item.QTY) || 0;
    });

    // BTB totals (Retur)
    let totalReturBox = 0;
    let totalReturJugs = 0;
    btbList.forEach(item => {
      if (item.Satuan === "BOX") totalReturBox += Number(item.QTY) || 0;
      else if (item.Satuan === "JUGS") totalReturJugs += Number(item.QTY) || 0;
    });

    const avgInBox = Math.round(totalInBox / dayCount);
    const avgInJugs = Math.round(totalInJugs / dayCount);
    const avgReturBox = Math.round(totalReturBox / dayCount);
    const avgReturJugs = Math.round(totalReturJugs / dayCount);

    // Weekly trendline calculations
    // Group dates by day or week
    const bkbTrend = { labels: dates, box: [], jugs: [] };
    const btbTrend = { labels: dates, box: [], jugs: [] };

    dates.forEach(d => {
      const bkbDay = bkbList.filter(m => m.tanggal === d);
      const btbDay = btbList.filter(m => m.tanggal === d);

      const dBox = bkbDay.filter(m => m.Satuan === "BOX").reduce((sum, r) => sum + (Number(r.QTY) || 0), 0);
      const dJugs = bkbDay.filter(m => m.Satuan === "JUGS").reduce((sum, r) => sum + (Number(r.QTY) || 0), 0);
      bkbTrend.box.push(dBox);
      bkbTrend.jugs.push(dJugs);

      const rBox = btbDay.filter(m => m.Satuan === "BOX").reduce((sum, r) => sum + (Number(r.QTY) || 0), 0);
      const rJugs = btbDay.filter(m => m.Satuan === "JUGS").reduce((sum, r) => sum + (Number(r.QTY) || 0), 0);
      btbTrend.box.push(rBox);
      btbTrend.jugs.push(rJugs);
    });

    // Distinct drivers from armada
    const armadaList = this.getArmada({ pt, depo });
    const drivers = Array.from(new Set(armadaList.map(a => a.Nama_Driver)));

    // Matrix 1: Summary by BKB (Rows: Driver, Cols: Dates, Value: Box & Jugs)
    const matrixBKB = drivers.map(driverName => {
      const driverObj = armadaList.find(a => a.Nama_Driver === driverName);
      const dateValues = {};
      dates.forEach(d => {
        const rows = bkbList.filter(m => m.Nama_Driver === driverName && m.tanggal === d);
        const box = rows.filter(r => r.Satuan === "BOX").reduce((sum, r) => sum + (Number(r.QTY) || 0), 0);
        const jugs = rows.filter(r => r.Satuan === "JUGS").reduce((sum, r) => sum + (Number(r.QTY) || 0), 0);
        dateValues[d] = { box, jugs };
      });
      return {
        driver: driverName,
        nopol: driverObj ? driverObj.Nopol : "-",
        dates: dateValues
      };
    });

    // Matrix 2: Summary by BTB / Retur (Rows: Driver, Cols: Dates, Value: Box & Jugs)
    const matrixBTB = drivers.map(driverName => {
      const driverObj = armadaList.find(a => a.Nama_Driver === driverName);
      const dateValues = {};
      dates.forEach(d => {
        const rows = btbList.filter(m => m.Nama_Driver === driverName && m.tanggal === d);
        const box = rows.filter(r => r.Satuan === "BOX").reduce((sum, r) => sum + (Number(r.QTY) || 0), 0);
        const jugs = rows.filter(r => r.Satuan === "JUGS").reduce((sum, r) => sum + (Number(r.QTY) || 0), 0);
        dateValues[d] = { box, jugs };
      });
      return {
        driver: driverName,
        nopol: driverObj ? driverObj.Nopol : "-",
        dates: dateValues
      };
    });

    return {
      summary: {
        totalInBox,
        totalInJugs,
        totalReturBox,
        totalReturJugs,
        avgInBox,
        avgInJugs,
        avgReturBox,
        avgReturJugs
      },
      dates,
      bkbTrend,
      btbTrend,
      matrixBKB,
      matrixBTB
    };
  }

  // --- SheetJS Excel Helpers ---
  exportToExcel(data, filename = "Export_Data.xlsx", sheetName = "Sheet1") {
    if (typeof XLSX === "undefined") {
      alert("Library XLSX (SheetJS) belum termuat.");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  }

  downloadBkbTemplate() {
    const sample = [
      {
        Document_ID: "BKB-20261020-001",
        tanggal: "2026-10-20",
        PT: "PT Tirta Makmur Jaya",
        Nama_Depo: "Depo Cakung Jakarta",
        Driver_ID: "DRV-001",
        Nama_Driver: "Budi Santoso",
        Vehicle_ID: "VEH-101",
        Nopol: "B 9123 TXR",
        Tipe_Pengiriman: "Retail",
        Product_ID: "PRD-BOX-01",
        Nama_Product: "Air Mineral Botol 600ml",
        QTY: 150,
        Satuan: "BOX",
        Keterangan: "Pengiriman Retail Toko",
        Created_dms_by: "DMS_USER"
      },
      {
        Document_ID: "BKB-20261020-002",
        tanggal: "2026-10-20",
        PT: "PT Tirta Makmur Jaya",
        Nama_Depo: "Depo Cakung Jakarta",
        Driver_ID: "DRV-001",
        Nama_Driver: "Budi Santoso",
        Vehicle_ID: "VEH-101",
        Nopol: "B 9123 TXR",
        Tipe_Pengiriman: "Retail",
        Product_ID: "PRD-JUG-01",
        Nama_Product: "Air Mineral Galon 19L",
        QTY: 80,
        Satuan: "JUGS",
        Keterangan: "Pengiriman Outlet Galon",
        Created_dms_by: "DMS_USER"
      }
    ];
    this.exportToExcel(sample, "Template_Import_BKB.xlsx", "Template_BKB");
  }

  downloadBtbTemplate() {
    const sample = [
      {
        Document_ID: "BTB-20261020-001",
        tanggal: "2026-10-20",
        PT: "PT Tirta Makmur Jaya",
        Nama_Depo: "Depo Cakung Jakarta",
        Driver_ID: "DRV-001",
        Nama_Driver: "Budi Santoso",
        Vehicle_ID: "VEH-101",
        Nopol: "B 9123 TXR",
        Tipe_Pengiriman: "Retail",
        Product_ID: "PRD-JUG-01",
        Nama_Product: "Air Mineral Galon 19L (Kosong)",
        QTY: 75,
        Satuan: "JUGS",
        Keterangan: "Retur Galon Kosong Siklus",
        Created_dms_by: "DMS_USER"
      },
      {
        Document_ID: "BTB-20261020-002",
        tanggal: "2026-10-20",
        PT: "PT Tirta Makmur Jaya",
        Nama_Depo: "Depo Cakung Jakarta",
        Driver_ID: "DRV-001",
        Nama_Driver: "Budi Santoso",
        Vehicle_ID: "VEH-101",
        Nopol: "B 9123 TXR",
        Tipe_Pengiriman: "Retail",
        Product_ID: "PRD-BOX-01",
        Nama_Product: "Air Mineral Botol 600ml",
        QTY: 4,
        Satuan: "BOX",
        Keterangan: "Retur Kardus Sobek",
        Created_dms_by: "DMS_USER"
      }
    ];
    this.exportToExcel(sample, "Template_Import_BTB.xlsx", "Template_BTB");
  }

  parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      if (typeof XLSX === "undefined") {
        reject(new Error("SheetJS library belum termuat."));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  }
}

// Global instance
window.dataStore = new DataStore();
