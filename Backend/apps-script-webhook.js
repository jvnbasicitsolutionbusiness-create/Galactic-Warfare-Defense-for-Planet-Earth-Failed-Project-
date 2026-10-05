/**
 * Galactic Warfare: Defense for Planet Earth — Google Apps Script Webhook
 *
 * SPREADSHEET:  CHRONO-FRONT STORAGE
 * SHEET TAB:    GalacticWarfare
 *
 * COLUMN LAYOUT (matches the actual spreadsheet):
 *   A  Email
 *   B  Password        — salted SHA-256 hash: "<uuid>:<base64hash>"
 *   C  Command_N       — commander / player display name
 *   D  Modes Unlock    — unlocked game modes string
 *   E  Level           — integer, starts at 1
 *   F  Coins Collected — integer, starts at 0
 *
 * ─── ACTIONS ───────────────────────────────────────────────
 *   register      { action, email, password, commanderName }
 *   login         { action, email, password }
 *   saveProgress  { action, email, password, commanderName,
 *                   modesUnlock, level, coinsCollected }
 *   loadProgress  { action, email, password }
 *
 * ─── RESPONSES ─────────────────────────────────────────────
 *   { success: true,  ... }
 *   { success: false, message: "...", duplicate?: true }
 *
 * ─── HOW TO DEPLOY / UPDATE ────────────────────────────────
 *   1. Open the Google Sheet → Extensions → Apps Script.
 *   2. Replace ALL existing code with this file → Save (Ctrl+S).
 *   3. First time:
 *        Deploy → New deployment
 *        Type: Web App | Execute as: Me | Who has access: Anyone
 *        Copy the URL → paste into .env as GOOGLE_APPS_SCRIPT_URL
 *   4. After any code change:
 *        Deploy → Manage deployments → pencil icon
 *        Version: New version → Deploy
 *      The URL never changes — only the code behind it updates.
 */

// ─── Sheet configuration ──────────────────────────────────────────────────────

var SHEET_NAME = "GalacticWarfare";
var REQUEST_SPREADSHEET_ID = "";

var COL = {
  EMAIL:   1,   // A
  PASSWORD:2,   // B
  CMD_N:   3,   // C  (Command_N)
  MODES:   4,   // D  (Modes Unlock)
  LEVEL:   5,   // E
  COINS:   6    // F  (Coins Collected)
};

var HEADERS = ["Email", "Password", "Command_N", "Modes Unlock", "Level", "Coins Collected"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Returns the GalacticWarfare sheet, creating it with headers if absent. */
function getSheet() {
  var ss    = REQUEST_SPREADSHEET_ID
    ? SpreadsheetApp.openById(REQUEST_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }

  return sheet;
}

/** SHA-256 + base64 with a UUID salt. Returns "<salt>:<hash>". */
function hashPassword(password, salt) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + password,
    Utilities.Charset.UTF_8
  );
  return salt + ":" + Utilities.base64Encode(digest);
}

/** Returns { row, email } for an existing email, or null. */
function findPlayer(email) {
  var sheet   = getSheet();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) return null;

  var emails = sheet.getRange(2, COL.EMAIL, lastRow - 1, 1).getDisplayValues();
  var target = email.trim().toLowerCase();

  for (var i = 0; i < emails.length; i++) {
    if (emails[i][0].trim().toLowerCase() === target) {
      return { row: i + 2, email: emails[i][0] };
    }
  }
  return null;
}

/** Reads columns C-F for a given row and returns a progress object. */
function getPlayerProgress(row) {
  var sheet = getSheet();
  var data  = sheet.getRange(row, COL.CMD_N, 1, 4).getValues()[0];
  return {
    commanderName:  String(data[0] || "Commander"),
    modesUnlock:    String(data[1] || "Adventure"),
    level:          Number(data[2]) || 1,
    coinsCollected: Number(data[3]) || 0
  };
}

function getSavedProgression(uid) {
  var ss = REQUEST_SPREADSHEET_ID
    ? SpreadsheetApp.openById(REQUEST_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Progression");
  if (!sheet || sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
  var target = String(uid || "").trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() !== target) continue;
    try { return JSON.parse(rows[i][2]); } catch (e) { return null; }
  }
  return null;
}

function deviceAttemptKey(deviceId, email) {
  var source = String(deviceId || "unidentified") + ":" + String(email || "").trim().toLowerCase();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source, Utilities.Charset.UTF_8);
  return digest.map(function (byte) {
    var value = (byte + 256) % 256;
    return (value < 16 ? "0" : "") + value.toString(16);
  }).join("");
}

function getDeviceAttemptSheet() {
  var ss = REQUEST_SPREADSHEET_ID
    ? SpreadsheetApp.openById(REQUEST_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DeviceAttempts") || ss.insertSheet("DeviceAttempts");
  if (sheet.getLastRow() === 0) sheet.appendRow(["device_account_hash", "attempts", "locked_until"]);
  return sheet;
}

function getDeviceAttemptRecord(key) {
  var sheet = getDeviceAttemptSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sheet: sheet, row: -1, attempts: 0, lockedUntil: 0 };
  var keys = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i][0] === key) {
      var record = sheet.getRange(i + 2, 2, 1, 2).getValues()[0];
      return { sheet: sheet, row: i + 2, attempts: Number(record[0]) || 0, lockedUntil: Number(record[1]) || 0 };
    }
  }
  return { sheet: sheet, row: -1, attempts: 0, lockedUntil: 0 };
}

function saveDeviceAttemptRecord(record, key) {
  var row = record.row > 0 ? record.row : record.sheet.getLastRow() + 1;
  record.sheet.getRange(row, 1, 1, 3).setValues([[key, record.attempts, record.lockedUntil]]);
  record.row = row;
}

function recordDeviceLoginFailure(key) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var record = getDeviceAttemptRecord(key);
    record.attempts++;
    if (record.attempts >= 5) record.lockedUntil = Date.now() + 5 * 60 * 1000;
    saveDeviceAttemptRecord(record, key);
    return record;
  } finally {
    lock.releaseLock();
  }
}

function resetDeviceLoginFailures(key) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var record = getDeviceAttemptRecord(key);
    record.attempts = 0;
    record.lockedUntil = 0;
    saveDeviceAttemptRecord(record, key);
  } finally {
    lock.releaseLock();
  }
}

function getLoginLockKeys(data, email) {
  return [deviceAttemptKey("device:" + String(data.deviceId || "unidentified"), email)];
}

function checkDeviceLoginLock(data) {
  var email = String(data.email || "").trim().toLowerCase();
  var keys = getLoginLockKeys(data, email);
  var records = keys.map(getDeviceAttemptRecord);
  var record = records.find(function (item) { return item.lockedUntil && Date.now() < item.lockedUntil; });
  return {
    success: true,
    locked: !!record,
    attempts: record ? record.attempts : 0,
    lockedUntil: record ? record.lockedUntil : 0,
    remainingSeconds: record ? Math.ceil((record.lockedUntil - Date.now()) / 1000) : 0
  };
}

// ─── register ─────────────────────────────────────────────────────────────────

function registerPlayer(data) {
  // Accept either "commanderName" or "username" as the display-name field
  var email         = String(data.email         || "").trim().toLowerCase();
  var password      = String(data.password      || "");
  var commanderName = String(data.commanderName || data.username || "").trim();

  // ── Validation ──
  if (!email || !password || !commanderName) {
    return { success: false, message: "Please complete all required fields." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: "Please enter a valid email address." };
  }
  if (password.length < 8) {
    return { success: false, message: "Password must be at least 8 characters." };
  }
  if (commanderName.length < 3 || commanderName.length > 24) {
    return { success: false, message: "Commander name must be 3–24 characters." };
  }

  // ── Duplicate check + write under script lock ──
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (findPlayer(email)) {
      return {
        success:   false,
        duplicate: true,
        message:   "An account with this email already exists."
      };
    }

    var salt     = Utilities.getUuid();
    var stored   = hashPassword(password, salt);
    var sheet    = getSheet();

    sheet.appendRow([
      email,
      stored,
      commanderName,
      "Adventure",
      1,
      0
    ]);

    Logger.log("Registered: " + email + " (" + commanderName + ")");

    return {
      success:  true,
      message:  "Account registered successfully.",
      progress: {
        commanderName:  commanderName,
        modesUnlock:    "Adventure",
        level:          1,
        coinsCollected: 0
      }
    };

  } finally {
    lock.releaseLock();
  }
}

// ─── login ────────────────────────────────────────────────────────────────────

function loginPlayer(data) {
  var email    = String(data.email    || "").trim().toLowerCase();
  var password = String(data.password || "");

  if (!email || !password) {
    return { success: false, message: "Email and password are required." };
  }

  var lockKeys = getLoginLockKeys(data, email);
  var lockRecords = lockKeys.map(getDeviceAttemptRecord);
  var activeLock = lockRecords.find(function (record) { return record.lockedUntil && Date.now() < record.lockedUntil; });
  if (activeLock) {
    return {
      success: false,
      locked: true,
      attempts: activeLock.attempts,
      lockedUntil: activeLock.lockedUntil,
      remainingSeconds: Math.ceil((activeLock.lockedUntil - Date.now()) / 1000),
      message: "Authentication locked for five minutes after five failed attempts."
    };
  }
  lockRecords.forEach(function (record, index) {
    if (record.lockedUntil && Date.now() >= record.lockedUntil) resetDeviceLoginFailures(lockKeys[index]);
  });

  var player = findPlayer(email);
  if (!player) {
    var missingAttempts = lockKeys.map(recordDeviceLoginFailure);
    var missingCount = Math.max.apply(null, missingAttempts.map(function (record) { return record.attempts; }));
    return { success: false, message: "Invalid email or password.", attempts: missingCount, locked: missingCount >= 5 };
  }

  var sheet          = getSheet();
  var storedPassword = String(sheet.getRange(player.row, COL.PASSWORD).getValue());
  var colonIdx       = storedPassword.indexOf(":");

  if (colonIdx < 0) {
    return { success: false, message: "Account data is corrupted." };
  }

  var salt      = storedPassword.slice(0, colonIdx);
  var savedHash = storedPassword.slice(colonIdx + 1);
  var inputHash = Utilities.base64Encode(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      salt + password,
      Utilities.Charset.UTF_8
    )
  );

  if (inputHash !== savedHash) {
    var failedAttempts = lockKeys.map(recordDeviceLoginFailure);
    var failedCount = Math.max.apply(null, failedAttempts.map(function (record) { return record.attempts; }));
    return { success: false, message: "Invalid email or password.", attempts: failedCount, locked: failedCount >= 5 };
  }

  lockKeys.forEach(resetDeviceLoginFailures);

  // Update last-login timestamp in a comment cell (no dedicated column)
  // — we record it in the Logger only, preserving the 6-column layout.
  Logger.log("Login: " + email);

  return {
    success:  true,
    message:  "Login successful.",
    email:    player.email,
    deviceId: String(data.deviceId || ""),
    progress: getPlayerProgress(player.row),
    progression: getSavedProgression(player.email)
  };
}

// ─── saveProgress ─────────────────────────────────────────────────────────────

function saveProgress(data) {
  var email    = String(data.email    || "").trim().toLowerCase();
  var password = String(data.password || "");

  var player = findPlayer(email);
  if (!player) {
    return { success: false, message: "Player account not found." };
  }

  // Authenticate before writing
  var sheet   = getSheet();
  var stored  = String(sheet.getRange(player.row, COL.PASSWORD).getValue());
  var colIdx  = stored.indexOf(":");
  if (colIdx < 0) return { success: false, message: "Account data is corrupted." };

  var inputHash = Utilities.base64Encode(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      stored.slice(0, colIdx) + password,
      Utilities.Charset.UTF_8
    )
  );
  if (inputHash !== stored.slice(colIdx + 1)) {
    return { success: false, message: "Authentication failed." };
  }

  var level  = parseInt(data.level,          10);
  var coins  = parseInt(data.coinsCollected, 10);
  var name   = String(data.commanderName || "").trim().slice(0, 24);
  var modes  = String(data.modesUnlock   || "Adventure").trim().slice(0, 200);

  if (!Number.isInteger(level) || level < 1 || !Number.isInteger(coins) || coins < 0) {
    return { success: false, message: "Invalid progress data." };
  }

  sheet.getRange(player.row, COL.CMD_N, 1, 4).setValues([[name, modes, level, coins]]);

  return { success: true, message: "Progress saved." };
}

function saveProgression(data) {
  var uid = String(data.uid || "").trim().toLowerCase();
  var json = String(data.progression_json || "");
  if (!uid || !json) return { success: false, message: "Progression data is required." };
  JSON.parse(json);

  var ss = REQUEST_SPREADSHEET_ID
    ? SpreadsheetApp.openById(REQUEST_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Progression") || ss.insertSheet("Progression");
  if (sheet.getLastRow() === 0) sheet.appendRow(["uid", "commanderName", "progression_json", "saved_at"]);
  var lastRow = sheet.getLastRow();
  var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues() : [];
  var targetRow = -1;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === uid) { targetRow = i + 2; break; }
  }
  var values = [uid, String(data.commanderName || "Commander"), json, String(data.saved_at || new Date().toISOString())];
  if (targetRow < 0) sheet.appendRow(values);
  else sheet.getRange(targetRow, 1, 1, values.length).setValues([values]);
  return { success: true, message: "Progression saved." };
}

// ─── loadProgress ─────────────────────────────────────────────────────────────

function loadProgress(data) {
  var email    = String(data.email    || "").trim().toLowerCase();
  var password = String(data.password || "");

  var player = findPlayer(email);
  if (!player) {
    return { success: false, message: "Player account not found." };
  }

  var sheet  = getSheet();
  var stored = String(sheet.getRange(player.row, COL.PASSWORD).getValue());
  var colIdx = stored.indexOf(":");
  if (colIdx < 0) return { success: false, message: "Account data is corrupted." };

  var inputHash = Utilities.base64Encode(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      stored.slice(0, colIdx) + password,
      Utilities.Charset.UTF_8
    )
  );
  if (inputHash !== stored.slice(colIdx + 1)) {
    return { success: false, message: "Authentication failed." };
  }

  return {
    success:  true,
    message:  "Progress loaded.",
    progress: getPlayerProgress(player.row)
  };
}

// ─── HTTP entry points ────────────────────────────────────────────────────────

function doGet() {
  return jsonResponse({ success: true, message: "Galactic Warfare: Defense for Planet Earth API is running." });
}

function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    REQUEST_SPREADSHEET_ID = String(data.spreadsheetId || "").trim();
    var action = String(data.action || "").toLowerCase();

    switch (action) {
      case "register":     return jsonResponse(registerPlayer(data));
      case "login":        return jsonResponse(loginPlayer(data));
      case "checkloginlock": return jsonResponse(checkDeviceLoginLock(data));
      case "saveprogress": return jsonResponse(saveProgress(data));
      case "saveprogression": return jsonResponse(saveProgression(data));
      case "loadprogress": return jsonResponse(loadProgress(data));
      default:
        return jsonResponse({ success: false, message: "Unknown action: " + action });
    }
  } catch (err) {
    Logger.log("doPost error: " + err.message);
    return jsonResponse({ success: false, message: "Request failed: " + err.message });
  }
}
