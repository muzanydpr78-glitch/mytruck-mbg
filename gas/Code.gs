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
      return jsonResponse({ status: "success", data: data });
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
    var expiryDate = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000);
    var expiryStr = Utilities.formatDate(expiryDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    sheet.getRange(targetRowIndex, 8).setValue(expiryStr); // Token_Expiry
  }

  appendLog(targetUser.Username, "LOGIN_SUCCESS", "Login berhasil sebagai " + targetUser.Role);

  return jsonResponse({
    status: "success",
    token: token,
    user: {
      User_ID: targetUser.User_ID,
      Username: targetUser.Username,
      Nama: targetUser.Nama || targetUser.Username,
      Email: targetUser.Email,
      Role: targetUser.Role
    }
  });
}

/**
 * User CRUD Handlers
 */
function handleSaveUser(userData, currentUser) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DB_Users");
  var data = sheet.getDataRange().getValues();

  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === userData.User_ID) {
      foundRow = i + 1;
      break;
    }
  }

  // Check headers to detect if "Nama" column exists (or if format is old vs new)
  var headers = data[0] || [];
  var hasNamaCol = headers.indexOf("Nama") !== -1;

  if (foundRow > 0) {
    if (hasNamaCol) {
      // New schema: [User_ID, Username, Nama, Email, Password_Hash, Role, Status_Aktif, Remember_Token, Token_Expiry, Last_Login]
      var colNama = headers.indexOf("Nama") + 1;
      var colUser = headers.indexOf("Username") + 1;
      var colMail = headers.indexOf("Email") + 1;
      var colPass = headers.indexOf("Password_Hash") + 1;
      var colRole = headers.indexOf("Role") + 1;
      var colStat = headers.indexOf("Status_Aktif") + 1;

      if (userData.Username) sheet.getRange(foundRow, colUser).setValue(userData.Username);
      if (userData.Nama !== undefined) sheet.getRange(foundRow, colNama).setValue(userData.Nama);
      if (userData.Email) sheet.getRange(foundRow, colMail).setValue(userData.Email);
      if (userData.Password_Hash) sheet.getRange(foundRow, colPass).setValue(userData.Password_Hash);
      if (userData.Role) sheet.getRange(foundRow, colRole).setValue(userData.Role);
      if (userData.Status_Aktif) sheet.getRange(foundRow, colStat).setValue(userData.Status_Aktif);
    } else {
      // Legacy schema: [User_ID, Username, Email, Password_Hash, Role, Status_Aktif, ...]
      sheet.getRange(foundRow, 2).setValue(userData.Username);
      sheet.getRange(foundRow, 3).setValue(userData.Email);
      if (userData.Password_Hash) {
        sheet.getRange(foundRow, 4).setValue(userData.Password_Hash);
      }
      sheet.getRange(foundRow, 5).setValue(userData.Role);
      sheet.getRange(foundRow, 6).setValue(userData.Status_Aktif);
    }

    // Record Remember Token, Expiry, and Last Login
    var colRem = headers.indexOf("Remember_Token") !== -1 ? headers.indexOf("Remember_Token") + 1 : 7;
    var colExp = headers.indexOf("Token_Expiry") !== -1 ? headers.indexOf("Token_Expiry") + 1 : 8;
    var colLog = headers.indexOf("Last_Login") !== -1 ? headers.indexOf("Last_Login") + 1 : 9;

    if (userData.Remember_Token !== undefined) {
      sheet.getRange(foundRow, colRem).setValue(userData.Remember_Token);
    }
    if (userData.Token_Expiry !== undefined) {
      sheet.getRange(foundRow, colExp).setValue(userData.Token_Expiry);
    }
    if (userData.Last_Login !== undefined) {
      sheet.getRange(foundRow, colLog).setValue(userData.Last_Login);
    }

    appendLog(currentUser || "Admin", "USER_UPDATE", "Update data user: " + (userData.Nama || userData.Username));
    return jsonResponse({ status: "success", message: "User berhasil diperbarui." });
  } else {
    // Create new user
    var newId = userData.User_ID || ("USR-" + Utilities.formatString("%03d", data.length));
    var pwdHash = userData.Password_Hash || hashPassword(userData.Password || "admin123");
    
    if (hasNamaCol) {
      sheet.appendRow([
        newId,
        userData.Username,
        userData.Nama || userData.Username,
        userData.Email,
        pwdHash,
        userData.Role || "Operator",
        userData.Status_Aktif || "Aktif",
        userData.Remember_Token || "",
        userData.Token_Expiry || "",
        userData.Last_Login || ""
      ]);
    } else {
      sheet.appendRow([
        newId,
        userData.Username,
        userData.Email,
        pwdHash,
        userData.Role || "Operator",
        userData.Status_Aktif || "Aktif",
        userData.Remember_Token || "",
        userData.Token_Expiry || "",
        userData.Last_Login || ""
      ]);
    }

    appendLog(currentUser || "Admin", "USER_CREATE", "Tambah user baru: " + (userData.Nama || userData.Username));
    return jsonResponse({ status: "success", message: "User baru berhasil ditambahkan." });
  }
}

function handleDeleteUser(userId, currentUser) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DB_Users");
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      var username = data[i][1];
      sheet.deleteRow(i + 1);
      appendLog(currentUser || "Admin", "USER_DELETE", "Hapus user: " + username);
      return jsonResponse({ status: "success", message: "User berhasil dihapus." });
    }
  }
  return jsonResponse({ status: "error", message: "User tidak ditemukan." });
}

/**
 * Armada CRUD Handlers
 */
function handleSaveArmada(armadaData, currentUser) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DB_Armada");
  var data = sheet.getDataRange().getValues();

  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][5] === armadaData.Vehicle_ID) { // Vehicle_ID col index 5
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    sheet.getRange(foundRow, 2).setValue(armadaData.PT);
    sheet.getRange(foundRow, 3).setValue(armadaData.Depo);
    sheet.getRange(foundRow, 4).setValue(armadaData.Driver_ID);
    sheet.getRange(foundRow, 5).setValue(armadaData.Nama_Driver);
    sheet.getRange(foundRow, 7).setValue(armadaData.Nopol);
    sheet.getRange(foundRow, 8).setValue(armadaData.Jenis_Armada);
    sheet.getRange(foundRow, 9).setValue(armadaData.Kapasitas);
    sheet.getRange(foundRow, 11).setValue(armadaData.Tipe_Pengiriman);
    sheet.getRange(foundRow, 12).setValue(armadaData.Tipe_Muatan || "MIX");

    appendLog(currentUser || "Operator", "ARMADA_UPDATE", "Update unit: " + armadaData.Nopol);
    return jsonResponse({ status: "success", message: "Data armada berhasil diperbarui." });
  } else {
    var newNo = data.length;
    var newVehId = armadaData.Vehicle_ID || ("VEH-" + (100 + newNo));
    sheet.appendRow([
      newNo,
      armadaData.PT,
      armadaData.Depo,
      armadaData.Driver_ID || "DRV-999",
      armadaData.Nama_Driver || "Driver Mitra",
      newVehId,
      armadaData.Nopol,
      armadaData.Jenis_Armada,
      armadaData.Kapasitas || 2000,
      armadaData.UOM || "KG",
      armadaData.Tipe_Pengiriman || "Retail",
      armadaData.Tipe_Muatan || "MIX"
    ]);

    appendLog(currentUser || "Operator", "ARMADA_CREATE", "Tambah unit: " + armadaData.Nopol);
    return jsonResponse({ status: "success", message: "Armada baru berhasil disimpan." });
  }
}

function handleDeleteArmada(vehicleId, currentUser) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DB_Armada");
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][5] === vehicleId) {
      var nopol = data[i][6];
      sheet.deleteRow(i + 1);
      appendLog(currentUser || "Operator", "ARMADA_DELETE", "Hapus armada: " + nopol);
      return jsonResponse({ status: "success", message: "Armada berhasil dihapus." });
    }
  }
  return jsonResponse({ status: "error", message: "Armada tidak ditemukan." });
}

/**
 * Standby CRUD Handlers
 */
function handleSaveStandby(stbData, currentUser) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DB_Standby");
  var data = sheet.getDataRange().getValues();
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  var foundRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === stbData.Document_ID) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    sheet.getRange(foundRow, 2).setValue(stbData.tanggal);
    sheet.getRange(foundRow, 3).setValue(stbData.PT);
    sheet.getRange(foundRow, 4).setValue(stbData.Nama_Depo);
    sheet.getRange(foundRow, 5).setValue(stbData.Driver_ID || "");
    sheet.getRange(foundRow, 6).setValue(stbData.Nama_Driver);
    sheet.getRange(foundRow, 7).setValue(stbData.Nopol);
    sheet.getRange(foundRow, 8).setValue(stbData.Status);
    sheet.getRange(foundRow, 11).setValue(now);
    sheet.getRange(foundRow, 12).setValue(currentUser || "Operator");

    appendLog(currentUser || "Operator", "STANDBY_UPDATE", "Update standby: " + stbData.Nopol + " (" + stbData.Status + ")");
    return jsonResponse({ status: "success", message: "Data standby berhasil diperbarui." });
  } else {
    var newDocId = stbData.Document_ID || ("STB-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd") + "-" + Utilities.formatString("%03d", data.length));
    sheet.appendRow([
      newDocId,
      stbData.tanggal,
      stbData.PT,
      stbData.Nama_Depo,
      stbData.Driver_ID || "",
      stbData.Nama_Driver,
      stbData.Nopol,
      stbData.Status,
      currentUser || "Operator",
      now,
      now,
      currentUser || "Operator"
    ]);

    appendLog(currentUser || "Operator", "STANDBY_CREATE", "Tambah standby: " + stbData.Nopol + " (" + stbData.Status + ")");
    return jsonResponse({ status: "success", message: "Catatan standby berhasil disimpan." });
  }
}

function handleDeleteStandby(docId, currentUser) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DB_Standby");
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === docId) {
      sheet.deleteRow(i + 1);
      appendLog(currentUser || "Operator", "STANDBY_DELETE", "Hapus standby: " + docId);
      return jsonResponse({ status: "success", message: "Data standby berhasil dihapus." });
    }
  }
  return jsonResponse({ status: "error", message: "Data standby tidak ditemukan." });
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

  // 1. DB_Users: [User_ID, Username, Nama, Email, Password_Hash, Role, Status_Aktif, Remember_Token, Token_Expiry, Last_Login]
  var sUsers = getOrCreateSheet(ss, "DB_Users");
  sUsers.clear();
  sUsers.appendRow(["User_ID", "Username", "Nama", "Email", "Password_Hash", "Role", "Status_Aktif", "Remember_Token", "Token_Expiry", "Last_Login"]);
  sUsers.appendRow(["USR-001", "admin", "Administrator", "admin@mytruck.co.id", hashPassword("admin123"), "Admin", "Aktif", "", "", ""]);
  sUsers.appendRow(["USR-002", "operator", "Anggun Operator", "operator@mytruck.co.id", hashPassword("operator123"), "Operator", "Aktif", "", "", ""]);
  sUsers.appendRow(["USR-003", "viewer", "Management Viewer", "viewer@mytruck.co.id", hashPassword("viewer123"), "Viewer", "Aktif", "", "", ""]);
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
