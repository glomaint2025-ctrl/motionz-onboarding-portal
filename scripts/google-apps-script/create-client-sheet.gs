/**
 * Motionz Portal - Client Google Files (Google Apps Script web app)
 *
 * The portal calls this script when a client is added, set up again, or renamed.
 * Every client gets ONE Drive folder, named after the client, inside the parent folder:
 *
 *   <parent folder>/
 *     <Client>/
 *       <Client> - Tracking                 (copy of the tracking template)
 *       <Client> - Money Leak Calculator    (copy of the calculator template)
 *
 * Both files are shared with the client as editor. The script returns the links and the
 * portal saves them, so the client sees their own two files on the Results Tracking page.
 *
 * ---------------------------------------------------------------------------------------
 * SETUP (Project Settings > Script Properties)
 *   SHARED_SECRET           same value as GOOGLE_SHEETS_SCRIPT_SECRET in the portal
 *   TEMPLATE_ID             id of the tracking template sheet (the long id in its URL)
 *   CALCULATOR_TEMPLATE_ID  id of the Money Leak Calculator template sheet
 *                           (1pDXSCpnGIJXLnXheL-yQofUWvZ8mSDk-YM6nLl_pZrw)
 *   FOLDER_ID               id of the parent Drive folder that holds the client folders
 *
 * FIRST DEPLOY
 *   Deploy > New deployment > Web app, Execute as "Me", Who has access "Anyone".
 *   Copy the Web app URL into GOOGLE_SHEETS_SCRIPT_URL in the portal.
 *
 * UPDATING THE CODE (keeps the same web-app URL)
 *   1. Replace all the code in this file and save.
 *   2. Project Settings > Script Properties > add any new property (see above).
 *   3. Deploy > Manage deployments > edit (pencil) the existing deployment >
 *      Version: "New version" > Deploy.
 *   4. Select testSetup in the toolbar, press Run, and approve the Drive permission prompt.
 *      It creates a "Setup Test" folder with both files and logs the links. Delete it after.
 *
 * The account that deploys the script must be able to edit the parent folder, both
 * templates, and any tracking sheets created earlier (it owns the ones it created).
 * ---------------------------------------------------------------------------------------
 *
 * REQUESTS (JSON body, always with `secret`)
 *   action "provision" (also the default when no action is sent)
 *     { clientName, clientEmail?, folderId?, trackingSheetId?, calculatorSheetId? }
 *     -> { ok, folderId, folderUrl, spreadsheetId, url, calculatorId, calculatorUrl, warnings }
 *     `spreadsheetId` and `url` are the tracking sheet. Safe to call again: it reuses what exists.
 *   action "rename"
 *     { clientName, folderId?, trackingSheetId?, calculatorSheetId? }
 *     -> { ok, warnings }   File ids and links do not change.
 */

var TRACKING_SUFFIX = ' - Tracking';
var CALCULATOR_SUFFIX = ' - Money Leak Calculator';
/** The calculator tab clients should land on. Copies keep the tab ids of the template. */
var CALCULATOR_TAB_GID = '2143281968';
var MAX_NAME_LENGTH = 120;

function doPost(e) {
  var lock = null;
  try {
    var props = PropertiesService.getScriptProperties();
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (!props.getProperty('SHARED_SECRET') || body.secret !== props.getProperty('SHARED_SECRET')) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    // One request at a time, so two quick calls for the same client cannot create two folders.
    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      lock = null;
      return json_({ ok: false, error: 'The script is busy. Please try again in a moment.' });
    }

    var action = String(body.action || 'provision');
    if (action === 'provision') return json_(provision_(body, props));
    if (action === 'rename') return json_(rename_(body, props));
    return json_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: message_(err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ provision */

function provision_(body, props) {
  var clientName = cleanName_(body.clientName);
  var clientEmail = String(body.clientEmail || '').trim().toLowerCase();
  if (!clientName) return { ok: false, error: 'clientName is required' };

  var warnings = [];
  var parent = DriveApp.getFolderById(props.getProperty('FOLDER_ID'));
  var trackingTitle = clientName + TRACKING_SUFFIX;
  var calculatorTitle = clientName + CALCULATOR_SUFFIX;

  // Files the portal already knows about (an older client, or a repeat call).
  var knownTracking = fileById_(body.trackingSheetId);
  var knownCalculator = fileById_(body.calculatorSheetId);

  var folder = clientFolder_(parent, clientName, body.folderId, knownTracking);

  // Tracking sheet: the known one, else one with the expected name (in the client folder,
  // then in the parent folder where older sheets live), else a fresh copy of the template.
  var tracking =
    knownTracking ||
    fileByName_(folder, trackingTitle) ||
    fileByName_(parent, trackingTitle) ||
    DriveApp.getFileById(props.getProperty('TEMPLATE_ID')).makeCopy(trackingTitle, folder);
  moveInto_(tracking, folder); // moved, never duplicated; the id and link stay the same
  setName_(tracking, trackingTitle);

  // Calculator: the known one, else one with the expected name in the client folder, else a fresh copy.
  var calculator = knownCalculator || fileByName_(folder, calculatorTitle);
  if (!calculator) {
    var calculatorTemplateId = String(props.getProperty('CALCULATOR_TEMPLATE_ID') || '').trim();
    if (!calculatorTemplateId) {
      // A half-configured script must not block client creation.
      warnings.push('The calculator was not created: CALCULATOR_TEMPLATE_ID is not set in the script properties.');
    } else {
      try {
        calculator = DriveApp.getFileById(calculatorTemplateId).makeCopy(calculatorTitle, folder);
      } catch (err) {
        warnings.push('The calculator was not created: ' + message_(err));
      }
    }
  }
  if (calculator) {
    moveInto_(calculator, folder);
    setName_(calculator, calculatorTitle);
  }

  // Clients log calls and outcomes in both files, so they need edit access.
  if (clientEmail) {
    share_(tracking, clientEmail, 'tracking sheet', warnings);
    if (calculator) share_(calculator, clientEmail, 'calculator', warnings);
  }

  return {
    ok: true,
    folderId: folder.getId(),
    folderUrl: folderUrl_(folder.getId()),
    spreadsheetId: tracking.getId(),
    url: sheetUrl_(tracking.getId()),
    calculatorId: calculator ? calculator.getId() : null,
    calculatorUrl: calculator ? sheetUrl_(calculator.getId(), CALCULATOR_TAB_GID) : null,
    warnings: warnings,
  };
}

/**
 * Finds or creates the client's folder inside the parent folder.
 *
 * 1. If the portal sent a folder id that still works, use that folder (and keep its name current).
 * 2. Otherwise look for a folder with the client's name. Two clients can have the same name and
 *    must not share a folder, so a folder found by name is only reused when it is clearly free
 *    or clearly this client's: it is empty, or it already holds this client's tracking sheet.
 * 3. Otherwise create "<Client>", or "<Client> (2)", "<Client> (3)" ... when the name is taken.
 */
function clientFolder_(parent, clientName, folderId, knownTracking) {
  var known = folderById_(folderId);
  if (known) {
    setName_(known, freeFolderName_(parent, clientName, known.getId()));
    return known;
  }

  for (var n = 1; n <= 50; n++) {
    var name = n === 1 ? clientName : clientName + ' (' + n + ')';
    var matches = parent.getFoldersByName(name);
    var taken = false;
    while (matches.hasNext()) {
      var candidate = matches.next();
      if (candidate.isTrashed()) continue;
      if (isEmpty_(candidate) || (knownTracking && isInside_(knownTracking, candidate))) return candidate;
      taken = true;
    }
    if (!taken) return parent.createFolder(name);
  }
  throw new Error('Too many folders are named "' + clientName + '".');
}

/** The client name, or "<Client> (2)" etc. when a different folder in the parent already uses it. */
function freeFolderName_(parent, clientName, ownFolderId) {
  for (var n = 1; n <= 50; n++) {
    var name = n === 1 ? clientName : clientName + ' (' + n + ')';
    var matches = parent.getFoldersByName(name);
    var taken = false;
    while (matches.hasNext()) {
      var other = matches.next();
      if (!other.isTrashed() && other.getId() !== ownFolderId) taken = true;
    }
    if (!taken) return name;
  }
  return clientName;
}

/* --------------------------------------------------------------------- rename */

function rename_(body, props) {
  var clientName = cleanName_(body.clientName);
  if (!clientName) return { ok: false, error: 'clientName is required' };

  var warnings = [];

  if (body.folderId) {
    var folder = folderById_(body.folderId);
    if (!folder) {
      warnings.push('The Drive folder could not be found.');
    } else {
      try {
        var parent = DriveApp.getFolderById(props.getProperty('FOLDER_ID'));
        setName_(folder, freeFolderName_(parent, clientName, folder.getId()));
      } catch (err) {
        warnings.push('The Drive folder could not be renamed: ' + message_(err));
      }
    }
  }

  renameFile_(body.trackingSheetId, clientName + TRACKING_SUFFIX, 'tracking sheet', warnings);
  renameFile_(body.calculatorSheetId, clientName + CALCULATOR_SUFFIX, 'calculator', warnings);

  if (warnings.length) return { ok: false, error: warnings.join(' '), warnings: warnings };
  return { ok: true, warnings: warnings };
}

function renameFile_(fileId, title, label, warnings) {
  if (!fileId) return;
  var file = fileById_(fileId);
  if (!file) {
    warnings.push('The ' + label + ' could not be found.');
    return;
  }
  try {
    setName_(file, title);
  } catch (err) {
    warnings.push('The ' + label + ' could not be renamed: ' + message_(err));
  }
}

/* -------------------------------------------------------------------- helpers */

/** Makes a client name safe for Drive: no slashes or control characters, single spaces, sensible length. */
function cleanName_(value) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, MAX_NAME_LENGTH)
    .trim();
}

/** The file with this id, or null when the id is empty, wrong, not reachable or in the bin. */
function fileById_(id) {
  id = String(id || '').trim();
  if (!id) return null;
  try {
    var file = DriveApp.getFileById(id);
    return file.isTrashed() ? null : file;
  } catch (err) {
    return null;
  }
}

function folderById_(id) {
  id = String(id || '').trim();
  if (!id) return null;
  try {
    var folder = DriveApp.getFolderById(id);
    return folder.isTrashed() ? null : folder;
  } catch (err) {
    return null;
  }
}

/** The first file with this exact name directly inside the folder (ignoring the bin), or null. */
function fileByName_(folder, name) {
  var files = folder.getFilesByName(name);
  while (files.hasNext()) {
    var file = files.next();
    if (!file.isTrashed()) return file;
  }
  return null;
}

function isInside_(file, folder) {
  var parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folder.getId()) return true;
  }
  return false;
}

/** True when the folder holds no files and no folders (items in the bin do not count). */
function isEmpty_(folder) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    if (!files.next().isTrashed()) return false;
  }
  var folders = folder.getFolders();
  while (folders.hasNext()) {
    if (!folders.next().isTrashed()) return false;
  }
  return true;
}

function moveInto_(file, folder) {
  if (!isInside_(file, folder)) file.moveTo(folder);
}

/** Works for files and folders. Only writes when the name is different. */
function setName_(item, name) {
  if (item.getName() !== name) item.setName(name);
}

/** Gives the client edit access. Never throws: a sharing problem is reported as a warning. */
function share_(file, email, label, warnings) {
  try {
    var owner = file.getOwner();
    if (owner && String(owner.getEmail()).toLowerCase() === email) return;
    var editors = file.getEditors();
    for (var i = 0; i < editors.length; i++) {
      if (String(editors[i].getEmail()).toLowerCase() === email) return; // already an editor
    }
    file.addEditor(email);
  } catch (err) {
    warnings.push('The ' + label + ' could not be shared with ' + email + ': ' + message_(err));
  }
}

function sheetUrl_(id, gid) {
  return 'https://docs.google.com/spreadsheets/d/' + id + '/edit' + (gid ? '#gid=' + gid : '');
}

function folderUrl_(id) {
  return 'https://drive.google.com/drive/folders/' + id;
}

function message_(err) {
  return String(err && err.message ? err.message : err);
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once from the editor to check the setup and grant permissions.
 * Creates a "Setup Test" folder with both files and logs the links. Delete the folder afterwards.
 */
function testSetup() {
  var result = provision_({ clientName: 'Setup Test' }, PropertiesService.getScriptProperties());
  Logger.log('Folder:         ' + result.folderUrl);
  Logger.log('Tracking sheet: ' + result.url);
  Logger.log('Calculator:     ' + (result.calculatorUrl || 'not created'));
  if (result.warnings && result.warnings.length) Logger.log('Warnings: ' + result.warnings.join(' | '));
}
