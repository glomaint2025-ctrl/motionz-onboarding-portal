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
 *       <uploaded contract files>           (added by the portal with "upload_file")
 *
 * Both sheets are shared with the client as editor. The script returns the links and the
 * portal saves them, so the client sees their own two files on the Results Tracking page.
 *
 * The portal also keeps Drive access in step with its own people ("set_access"): admins on
 * the parent folder, the client's CSM on the client folder, the client owner and team on the
 * two sheets, the client owner as viewer on uploaded contracts. Access is always given to
 * named email addresses. This script never turns on "anyone with the link" sharing.
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
 * UPDATING THE CODE / REDEPLOY (keeps the same web-app URL)
 *   1. Replace all the code in this file and save.
 *   2. Project Settings > Script Properties > add any new property (see above).
 *   3. Deploy > Manage deployments > edit (pencil) the existing deployment >
 *      Version: "New version" > Deploy. (Not "New deployment": that would change the URL.)
 *   4. Select testSetup in the toolbar, press Run, and approve any permission prompt Google shows.
 *      It creates a "Setup Test" folder with both files, uploads and bins a small test file,
 *      and tries the access actions with your own email only. The log ends with
 *      "File upload: OK" and "Access actions: OK". Delete the "Setup Test" folder afterwards.
 *
 *   Until step 3 is done the portal keeps working, but it shows "The Google script needs
 *   updating before Drive access can be managed." and changes no Drive access.
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
 *   action "list_access"
 *     { ids: [fileOrFolderId, ...] }   (at most 50)
 *     -> { ok, version, parentFolderId, scriptUser, parent: { id, ok, owner, editors, viewers },
 *          items: [{ id, ok, owner, editors, viewers, error? }] }
 *     Who can open each file or folder right now (emails in lower case). Changes nothing.
 *   action "set_access"
 *     { changes: [{ id, email, role: "editor" | "viewer" | "none" }] }   (at most 100)
 *     -> { ok, results: [{ id, email, role, ok, error? }] }
 *     Gives or removes one person's access to one file or folder. One bad address does not
 *     stop the rest. The owner and the account running this script are never changed.
 *   action "upload_file"
 *     { folderId, name, mimeType, base64 }   (at most 6 MB)
 *     -> { ok, fileId, url }   The folder must be inside the parent folder.
 *   action "trash_file"
 *     { fileId }  -> { ok }    Moves a file that is inside the parent folder to the bin.
 *
 *   list_access, set_access, upload_file and trash_file only ever touch the parent folder and
 *   what is inside it. None of them reads `clientName`, and none changes link sharing.
 */

var TRACKING_SUFFIX = ' - Tracking';
var CALCULATOR_SUFFIX = ' - Money Leak Calculator';
/** The calculator tab clients should land on. Copies keep the tab ids of the template. */
var CALCULATOR_TAB_GID = '2143281968';
var MAX_NAME_LENGTH = 120;
/** Returned by list_access so the portal can tell this script from an older one. */
var SCRIPT_VERSION = 3;
var MAX_ACCESS_CHANGES = 100;
var MAX_ACCESS_IDS = 50;
var MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
/** How far up the folder tree to look for the parent folder. Client files sit one or two levels down. */
var MAX_PARENT_DEPTH = 6;

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
    if (action === 'list_access') return json_(listAccess_(body, props));
    if (action === 'set_access') return json_(setAccess_(body, props));
    if (action === 'upload_file') return json_(uploadFile_(body, props));
    if (action === 'trash_file') return json_(trashFile_(body, props));
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

/* --------------------------------------------------------------------- access */

/**
 * Who can open each file or folder right now. Changes nothing.
 * The parent folder is always included, so the portal can tell who gets access from above.
 */
function listAccess_(body, props) {
  var ids = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length > MAX_ACCESS_IDS) return { ok: false, error: 'Too many ids in one call (the limit is ' + MAX_ACCESS_IDS + ').' };

  var parentId = String(props.getProperty('FOLDER_ID') || '').trim();
  var items = [];
  for (var i = 0; i < ids.length; i++) {
    items.push(describeAccess_(String(ids[i] || '').trim(), parentId));
  }
  return {
    ok: true,
    version: SCRIPT_VERSION,
    parentFolderId: parentId,
    scriptUser: scriptUserEmail_(),
    parent: describeAccess_(parentId, parentId),
    items: items,
  };
}

function describeAccess_(id, parentId) {
  var entry = { id: id, ok: false, owner: '', editors: [], viewers: [] };
  try {
    var item = itemById_(id);
    if (!item) {
      entry.error = 'Not found in Google Drive.';
      return entry;
    }
    if (!isUnderParent_(item, parentId)) {
      entry.error = 'This is not inside the parent folder.';
      return entry;
    }
    entry.owner = ownerEmail_(item);
    entry.editors = emails_(item.getEditors());
    entry.viewers = emails_(item.getViewers());
    entry.ok = true;
  } catch (err) {
    entry.error = message_(err);
  }
  return entry;
}

/**
 * Gives or removes access, one person and one file or folder at a time.
 * A problem with one address (for example one that is not a Google account) is reported for
 * that line only. Link sharing is never changed, so nothing becomes public.
 */
function setAccess_(body, props) {
  var changes = Array.isArray(body.changes) ? body.changes : null;
  if (!changes) return { ok: false, error: 'changes is required' };
  if (changes.length > MAX_ACCESS_CHANGES) {
    return { ok: false, error: 'Too many changes in one call (the limit is ' + MAX_ACCESS_CHANGES + ').' };
  }

  var parentId = String(props.getProperty('FOLDER_ID') || '').trim();
  var scriptUser = scriptUserEmail_();
  var found = {}; // id -> { item, allowed } so each file is looked up once
  var results = [];

  for (var i = 0; i < changes.length; i++) {
    var change = changes[i] || {};
    var id = String(change.id || '').trim();
    var email = String(change.email || '').trim().toLowerCase();
    var role = String(change.role || '');
    var result = { id: id, email: email, role: role, ok: false };
    results.push(result);

    try {
      if (!id || email.indexOf('@') < 1) throw new Error('An id and an email address are required.');
      if (role !== 'editor' && role !== 'viewer' && role !== 'none') throw new Error('Unknown role: ' + role);

      if (!found[id]) {
        var looked = itemById_(id);
        found[id] = { item: looked, allowed: looked ? isUnderParent_(looked, parentId) : false };
      }
      var item = found[id].item;
      if (!item) throw new Error('Not found in Google Drive.');
      if (!found[id].allowed) throw new Error('This is not inside the parent folder.');

      // The owner, and the account this script runs as, always keep the access they have.
      if (email === scriptUser || email === ownerEmail_(item)) {
        result.ok = true;
        result.skipped = 'owner';
        continue;
      }

      var isEditor = emails_(item.getEditors()).indexOf(email) !== -1;
      var isViewer = emails_(item.getViewers()).indexOf(email) !== -1;

      if (role === 'editor') {
        if (!isEditor) item.addEditor(email);
      } else if (role === 'viewer') {
        if (isEditor) removeQuietly_(item, email, true);
        if (isEditor || !isViewer) item.addViewer(email);
      } else {
        if (isEditor) removeQuietly_(item, email, true);
        if (isEditor || isViewer) removeQuietly_(item, email, false);
      }
      result.ok = true;
    } catch (err) {
      result.error = message_(err);
    }
  }

  return { ok: true, results: results };
}

/** Removes one person as editor (or as viewer). "They did not have access" is not an error. */
function removeQuietly_(item, email, asEditor) {
  try {
    if (asEditor) item.removeEditor(email);
    else item.removeViewer(email);
  } catch (err) {
    var list = emails_(asEditor ? item.getEditors() : item.getViewers());
    if (list.indexOf(email) !== -1) throw err; // still there, so it really failed
  }
}

/* --------------------------------------------------------------------- upload */

/** Saves one uploaded file (a contract) in a client's folder. Only named people can open it. */
function uploadFile_(body, props) {
  var parentId = String(props.getProperty('FOLDER_ID') || '').trim();
  var folder = folderById_(body.folderId);
  if (!folder) return { ok: false, error: 'The Drive folder could not be found.' };
  if (!isUnderParent_(folder, parentId)) return { ok: false, error: 'That folder is not inside the parent folder.' };

  var name = cleanName_(body.name) || 'Contract';
  var encoded = String(body.base64 || '');
  if (!encoded) return { ok: false, error: 'The file is empty.' };
  // Four base64 characters hold three bytes, so the size is known before decoding.
  if (encoded.length * 0.75 > MAX_UPLOAD_BYTES + 3) return { ok: false, error: 'The file is larger than 6 MB.' };

  var bytes = Utilities.base64Decode(encoded);
  if (!bytes.length) return { ok: false, error: 'The file is empty.' };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'The file is larger than 6 MB.' };

  var mimeType = String(body.mimeType || '').trim() || 'application/octet-stream';
  var file = folder.createFile(Utilities.newBlob(bytes, mimeType, name));
  return { ok: true, fileId: file.getId(), url: fileUrl_(file.getId()) };
}

/** Moves an uploaded file to the bin. Its viewers are removed first, so the client can no longer open it. */
function trashFile_(body, props) {
  var parentId = String(props.getProperty('FOLDER_ID') || '').trim();
  var id = String(body.fileId || '').trim();
  if (!id) return { ok: false, error: 'fileId is required' };

  var file;
  try {
    file = DriveApp.getFileById(id);
  } catch (err) {
    return { ok: true, alreadyGone: true }; // deleted by hand: nothing left to do
  }
  if (file.isTrashed()) return { ok: true, alreadyGone: true };
  if (!isUnderParent_(file, parentId)) return { ok: false, error: 'That file is not inside the parent folder.' };

  var scriptUser = scriptUserEmail_();
  var viewers = emails_(file.getViewers());
  for (var i = 0; i < viewers.length; i++) {
    if (viewers[i] === scriptUser) continue;
    try {
      file.removeViewer(viewers[i]);
    } catch (err) {
      // Access that comes from the folder cannot be removed here; the bin still hides the file.
    }
  }
  file.setTrashed(true);
  return { ok: true };
}

/* -------------------------------------------------------------------- helpers */

/** A folder or a file by id (in that order), or null. Items in the bin count as missing. */
function itemById_(id) {
  return folderById_(id) || fileById_(id);
}

/** True for the parent folder itself and for anything inside it, however deep (within reason). */
function isUnderParent_(item, parentId) {
  if (!parentId) return false;
  if (item.getId() === parentId) return true;
  var level = [item];
  for (var depth = 0; depth < MAX_PARENT_DEPTH && level.length; depth++) {
    var next = [];
    for (var i = 0; i < level.length; i++) {
      var parents = level[i].getParents();
      while (parents.hasNext()) {
        var parent = parents.next();
        if (parent.getId() === parentId) return true;
        next.push(parent);
      }
    }
    level = next;
  }
  // Google does not always report the parents of an item when the parent folder belongs to another
  // account (or is reached through a link). Fall back to looking through the parent folder itself.
  if (idsUnderParent_(parentId)[item.getId()] === true) return true;
  // The item may have been created earlier in this same run: look once more with a fresh list.
  UNDER_PARENT_CACHE_[parentId] = null;
  return idsUnderParent_(parentId)[item.getId()] === true;
}

var UNDER_PARENT_CACHE_ = {};

/** Ids of every client folder in the parent folder and of the files directly inside them. Built once per run. */
function idsUnderParent_(parentId) {
  if (UNDER_PARENT_CACHE_[parentId]) return UNDER_PARENT_CACHE_[parentId];
  var ids = {};
  try {
    var parent = DriveApp.getFolderById(parentId);
    var looseFiles = parent.getFiles();
    while (looseFiles.hasNext()) ids[looseFiles.next().getId()] = true;
    var folders = parent.getFolders();
    while (folders.hasNext()) {
      var folder = folders.next();
      ids[folder.getId()] = true;
      var files = folder.getFiles();
      while (files.hasNext()) ids[files.next().getId()] = true;
    }
  } catch (err) {
    // Leave the list empty: nothing is treated as inside a folder we cannot read.
  }
  UNDER_PARENT_CACHE_[parentId] = ids;
  return ids;
}

/** Lower-cased email addresses of a list of Drive users. People whose address Google hides are left out. */
function emails_(users) {
  var out = [];
  for (var i = 0; i < users.length; i++) {
    var email = String(users[i].getEmail() || '').trim().toLowerCase();
    if (email && out.indexOf(email) === -1) out.push(email);
  }
  return out;
}

function ownerEmail_(item) {
  try {
    var owner = item.getOwner();
    return owner ? String(owner.getEmail() || '').trim().toLowerCase() : '';
  } catch (err) {
    return ''; // items on a shared drive have no single owner
  }
}

/** The Google account this script runs as (it owns its own "My Drive"). Needs no extra permission. */
function scriptUserEmail_() {
  try {
    return ownerEmail_(DriveApp.getRootFolder());
  } catch (err) {
    return '';
  }
}

function fileUrl_(id) {
  return 'https://drive.google.com/file/d/' + id + '/view';
}

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
 * Run from the editor after every code update, to check the setup and grant permissions.
 * Creates a "Setup Test" folder with both files, uploads and bins a small test file, and tries
 * the access actions with your own email only (nobody else is emailed or given access).
 * Delete the "Setup Test" folder afterwards.
 */
function testSetup() {
  var props = PropertiesService.getScriptProperties();
  var result = provision_({ clientName: 'Setup Test' }, props);
  Logger.log('Folder:         ' + result.folderUrl);
  Logger.log('Tracking sheet: ' + result.url);
  Logger.log('Calculator:     ' + (result.calculatorUrl || 'not created'));
  if (result.warnings && result.warnings.length) Logger.log('Warnings: ' + result.warnings.join(' | '));
  if (!result.ok) return;

  var me = scriptUserEmail_();
  Logger.log('Script account: ' + (me || 'unknown'));

  // Upload a tiny file into the test folder, then move it to the bin again.
  var upload = uploadFile_(
    { folderId: result.folderId, name: 'Setup test file.txt', mimeType: 'text/plain', base64: Utilities.base64Encode('Setup test') },
    props
  );
  var binned = upload.ok ? trashFile_({ fileId: upload.fileId }, props) : { ok: false };
  Logger.log('File upload:    ' + (upload.ok && binned.ok ? 'OK' : 'FAILED ' + (upload.error || binned.error || '')));

  // Access actions on the test folder, using only this account's own address.
  var list = listAccess_({ ids: [result.folderId, result.spreadsheetId] }, props);
  var listOk = list.ok && list.parent.ok && list.items.length === 2 && list.items[0].ok && list.items[1].ok;
  var set = me ? setAccess_({ changes: [{ id: result.folderId, email: me, role: 'editor' }] }, props) : null;
  var setOk = !set || (set.ok && set.results.length === 1 && set.results[0].ok);
  Logger.log('Access actions: ' + (setOk && listOk ? 'OK' : 'FAILED ' + JSON.stringify({ set: set, list: list })));
  if (list.parent.ok) {
    Logger.log('Parent folder is shared with: ' + (list.parent.editors.concat(list.parent.viewers).join(', ') || 'nobody else'));
  }
}
