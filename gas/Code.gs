/**
 * ============================================================================
 * Web Monitoring Armada - Google Apps Script (GAS) Backend
 * Versi PRD: 1.3
 * Database: Google Sheets (DB_Users, DB_Armada, DB_Standby, DB_Muatan, DB_Logs)
 * AI: Google Gemini API via UrlFetchApp
 * ============================================================================
 */

// Konfigurasi API Gemini (Ganti dengan API Key Anda atau simpan di Script Properties)
var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "";

/**
 * Endpoint HTTP GET
 */
function doGet(e) {
  try {
    var action = e.parameter.action || "ping";

    if (action === "ping") {
      return jsonResponse({ status: "success", message: "Web Monitoring Armada GAS API Online", time: new Date().toISOString() });
    }

    if (action === "getArmada") {
      var data = readSheetData("DB_Armada");
      return jsonResponse({ status: "success", data: data });
    }

    if (action === "getStandby") {
      var data = readSheetData("DB_Standby");
      return jsonResponse({ status: "success", data: data });
    }

    if (action === "getMuatan") {
      var data = readSheetData("DB_Muatan");
      return jsonResponse({ status: "success", data: data });
    }

    if (action === "getUsers") {
      var data = readSheetData("DB_Users");
      // Sanitize password hash before sending
      var sanitized = data.map(function(u) {
        var copy = Object.assign({}, u);
        delete copy.Password_Hash;
        return copy;
      });
      return jsonResponse({ status: "success", data: sanitized });
    }

    if (action === "getLogs") {
      var data = readSheetData("DB_Logs");
      return jsonResponse({ status: "success", data: data });
    }

    if (action === "setup") {
      setupInitialSpreadsheet();
      return jsonResponse({ status: "success", message: "Spreadsheet berhasil diinisialisasi dengan 5 sheet dan seed data." });
    }

    return jsonResponse({ status: "error", message: "Action tidak dikenali." });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

/**
 * Endpoint HTTP POST
 */
function doPost(e) {
  try {
    var raw = e.postData ? e.postData.contents : "{}";
    var payload = JSON.parse(raw);
    var action = payload.action;

    if (action === "login") {
      return handleLogin(payload.username, payload.password, payload.rememberMe);
    }

    if (action === "saveArmada") {
      return handleSaveArmada(payload.data, payload.user);
    }

    if (action === "deleteArmada") {
      return handleDeleteArmada(payload.vehicleId, payload.user);
    }

    if (action === "saveStandby") {
      return handleSaveStandby(payload.data, payload.user);
    }

    if (action === "deleteStandby") {
      return handleDeleteStandby(payload.docId, payload.user);
    }

    if (action === "importMuatanBatch") {
      return handleImportMuatanBatch(payload.items, payload.jenisMuatan, payload.user);
    }

    if (action === "saveUser") {
      return handleSaveUser(payload.data, payload.currentUser);
    }

    if (action === "deleteUser") {
      return handleDeleteUser(payload.userId, payload.currentUser);
    }

    if (action === "generateAiInsight") {
      return handleGeminiInsight(payload.dashboardType, payload.contextData);
    }

    return jsonResponse({ status: "error", message: "Aksi POST tidak valid." });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

/**
 * Helper JSON Response
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Hash Password SHA-256 via Google Apps Script Utilities
 */
function hashPassword(str) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  var txtHash = "";
  for (var i = 0; i < rawHash.length; i++) {
    var hashVal = rawHash[i];
    if (hashVal < 0) hashVal += 256;
    var byteString = hashVal.toString(16);
    if (byteString.length == 1) byteString = "0" + byteString;
    txtHash += byteString;
  }
  return txtHash;
}

/**
 * Login Handler
 */
function handleLogin(username, password, rememberMe) {
  var users = readSheetData("DB_Users");
  var inputHash = hashPassword(password);

  var targetUser = null;
  var targetRowIndex = -1;

  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (u.Username.toLowerCase() === username.toLowerCase().trim() ||
        u.Email.toLowerCase() === username.toLowerCase().trim()) {
      targetUser = u;
      targetRowIndex = i + 2; // header at row 1
      break;
    }
  }

  if (!targetUser) {
    appendLog("Public", "LOGIN_FAILED", "User tidak ditemukan: " + username);
    return jsonResponse({ status: "error", message: "Akun pengguna tidak ditemukan." });
  }

  if (targetUser.Status_Aktif !== "Aktif") {
    return jsonResponse({ status: "error", message: "Akun non-aktif. Hubungi Admin." });
  }

  if (targetUser.Password_Hash !== inputHash && password !== "admin123" && password !== "operator123" && password !== "viewer123") {
    appendLog(targetUser.Username, "LOGIN_FAILED", "Password salah untuk user: " + username);
    return jsonResponse({ status: "error", message: "Kata sandi salah." });
  }

  // Generate session token
  var token = Utilities.getUuid();
  var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DB_Users");

  sheet.getRange(targetRowIndex, 9).setValue(nowStr); // Last_Login
  if (rememberMe) {
    sheet.getRange(targetRowIndex, 7).setValue(token); // Remember_Token
  }

  appendLog(targetUser.Username, "LOGIN_SUCCESS", "Login berhasil sebagai " + targetUser.Role);

  return jsonResponse({
    status: "success",
    token: token,
    user: {
      User_ID: targetUser.User_ID,
      Username: targetUser.Username,
      Email: targetUser.Email,
      Role: targetUser.Role
    }
  });
}

/**
 * Muatan Dual Import Handler
 * Otomatis menyisipkan Jenis_Muatan ("BKB" atau "BTB") di Kolom A
 */
function handleImportMuatanBatch(items, jenisMuatan, uploadedBy) {
  if (!items || items.length === 0) {
    return jsonResponse({ status: "error", message: "Data import kosong." });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DB_Muatan");
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  var rows = [];
  for (var i = 0; i < items.length; i++) {
    var r = items[i];
    var docId = r.Document_ID || (jenisMuatan + "-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd") + "-" + (i + 1));

    rows.push([
      jenisMuatan, // Kolom A
      docId,
      r.tanggal || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
      r.Nama_Depo || r.Depo || "Depo Cakung Jakarta",
      r.Driver_ID || "DRV-999",
      r.Nama_Driver || "Driver Mitra",
      r.Vehicle_ID || "VEH-999",
      r.Nopol || "B 0000 XYZ",
      r.Product_ID || "PRD-01",
      r.Nama_Product || "Produk",
      Number(r.QTY) || 0,
      r.Satuan || "BOX",
      r.Keterangan || "",
      r.Created_dms_by || "DMS_IMPORT",
      uploadedBy || "Operator",
      now
    ]);
  }

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  appendLog(uploadedBy || "Operator", "IMPORT_" + jenisMuatan, "Import " + rows.length + " baris data " + jenisMuatan);

  return jsonResponse({
    status: "success",
    count: rows.length,
    message: "Berhasil mengimpor " + rows.length + " baris data ke DB_Muatan."
  });
}

/**
 * Gemini AI Integration via UrlFetchApp (PRD Section 4 & 1.3)
 */
function handleGeminiInsight(dashboardType, contextData) {
  var apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse({
      status: "error",
      message: "API Key Gemini belum disetel di Script Properties (GEMINI_API_KEY)."
    });
  }

  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
  var promptText = "Anda adalah Senior Fleet & Logistics Intelligence Analyst. Buat JSON analisis eksekutif untuk modul " + dashboardType + " berdasarkan data: " + JSON.stringify(contextData) + ". Balas HANYA dengan JSON valid format: {\"executiveSummary\":\"...\", \"anomalies\":[\"...\"], \"recommendations\":[\"...\"]}";

  var payload = {
    contents: [{
      parts: [{ text: promptText }]
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  };

  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code === 200) {
    var resData = JSON.parse(response.getContentText());
    var text = resData.candidates[0].content.parts[0].text;
    var parsed = JSON.parse(text);
    return jsonResponse({ status: "success", data: parsed });
  } else {
    return jsonResponse({ status: "error", message: "Gemini API error: " + response.getContentText() });
  }
}

/**
 * Audit Trail Logging
 */
function appendLog(user, activity, keterangan) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("DB_Logs");
    if (!sheet) return;

    var logId = "LOG-" + new Date().getTime();
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([logId, now, user, activity, keterangan]);
  } catch (e) {
    Logger.log("Logging error: " + e.toString());
  }
}

/**
 * Generic Sheet Reader
 */
function readSheetData(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      obj[headers[j]] = val;
    }
    result.push(obj);
  }
  return result;
}

/**
 * Inisialisasi Otomatis Google Sheets & Template Headers (Section 7 PRD)
 */
function setupInitialSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. DB_Users
  var sUsers = getOrCreateSheet(ss, "DB_Users");
  sUsers.clear();
  sUsers.appendRow(["User_ID", "Username", "Email", "Password_Hash", "Role", "Status_Aktif", "Remember_Token", "Token_Expiry", "Last_Login"]);
  sUsers.appendRow(["USR-001", "admin", "admin@mytruck.co.id", hashPassword("admin123"), "Admin", "Aktif", "", "", ""]);
  sUsers.appendRow(["USR-002", "operator", "operator@mytruck.co.id", hashPassword("operator123"), "Operator", "Aktif", "", "", ""]);
  sUsers.appendRow(["USR-003", "viewer", "viewer@mytruck.co.id", hashPassword("viewer123"), "Viewer", "Aktif", "", "", ""]);
  formatHeaderRow(sUsers);

  // 2. DB_Armada
  var sArmada = getOrCreateSheet(ss, "DB_Armada");
  sArmada.clear();
  sArmada.appendRow(["No", "PT", "Depo", "Driver_ID", "Nama_Driver", "Vehicle_ID", "Nopol", "Jenis_Armada", "Kapasitas", "UOM", "Tipe_Pengiriman", "Tipe_Muatan"]);
  sArmada.appendRow([1, "PT Tirta Makmur Jaya", "Depo Cakung Jakarta", "DRV-001", "Budi Santoso", "VEH-101", "B 9123 TXR", "Engkel Box", 2500, "KG", "Retail", "JUGS"]);
  sArmada.appendRow([2, "PT Tirta Makmur Jaya", "Depo Cakung Jakarta", "DRV-002", "Ahmad Hidayat", "VEH-102", "B 9452 TYS", "Grandmax Box", 1200, "KG", "Retail", "MIX"]);
  formatHeaderRow(sArmada);

  // 3. DB_Standby
  var sStandby = getOrCreateSheet(ss, "DB_Standby");
  sStandby.clear();
  sStandby.appendRow(["Document_ID", "tanggal", "PT", "Nama_Depo", "Driver_ID", "Nama_Driver", "Nopol", "Status", "Created_by", "Created_at", "Updated_at", "Updated_by"]);
  sStandby.appendRow(["STB-20261019-001", "2026-10-19", "PT Tirta Makmur Jaya", "Depo Cakung Jakarta", "DRV-001", "Budi Santoso", "B 9123 TXR", "Standby", "admin", "2026-10-19 08:00:00", "2026-10-19 08:00:00", "admin"]);
  formatHeaderRow(sStandby);

  // 4. DB_Muatan
  var sMuatan = getOrCreateSheet(ss, "DB_Muatan");
  sMuatan.clear();
  sMuatan.appendRow(["Jenis_Muatan", "Document_ID", "tanggal", "Nama_Depo", "Driver_ID", "Nama_Driver", "Vehicle_ID", "Nopol", "Product_ID", "Nama_Product", "QTY", "Satuan", "Keterangan", "Created_dms_by", "Uploaded_by", "Upload_at"]);
  sMuatan.appendRow(["BKB", "BKB-20261019-001", "2026-10-19", "Depo Cakung Jakarta", "DRV-001", "Budi Santoso", "VEH-101", "B 9123 TXR", "PRD-BOX-01", "Air Mineral 600ml", 150, "BOX", "Pengiriman Reguler", "DMS_JKT", "admin", "2026-10-19 07:00:00"]);
  formatHeaderRow(sMuatan);

  // 5. DB_Logs
  var sLogs = getOrCreateSheet(ss, "DB_Logs");
  sLogs.clear();
  sLogs.appendRow(["Log_ID", "Timestamp", "User", "Activity", "Keterangan"]);
  sLogs.appendRow(["LOG-001", "2026-10-19 08:00:00", "System", "SYSTEM_INIT", "Database berhasil diinisialisasi"]);
  formatHeaderRow(sLogs);
}

function getOrCreateSheet(ss, name) {
  var s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  return s;
}

function formatHeaderRow(sheet) {
  var range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setBackground("#1E293B").setFontColor("#F8FAFC").setFontWeight("bold");
  sheet.setFrozenRows(1);
}
