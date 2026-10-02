/**
 * Motionz Portal - Client Tracking Sheet Creator (Google Apps Script web app)
 *
 * The portal calls this when a new client portal is created. It copies the template
 * tracking sheet into the client folder, gives the client edit access, and returns the link.
 *
 * Setup (Project Settings > Script Properties):
 *   SHARED_SECRET  - same value as GOOGLE_SHEETS_SCRIPT_SECRET in the portal
 *   TEMPLATE_ID    - ID of the template Google Sheet (the long id in its URL)
 *   FOLDER_ID      - ID of the Drive folder where client sheets are stored
 *
 * Deploy: Deploy > New deployment > Web app, Execute as "Me", Who has access "Anyone".
 * Copy the Web app URL into GOOGLE_SHEETS_SCRIPT_URL in the portal.
 */

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (!props.getProperty('SHARED_SECRET') || body.secret !== props.getProperty('SHARED_SECRET')) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    var clientName = String(body.clientName || '').trim();
    var clientEmail = String(body.clientEmail || '').trim().toLowerCase();
    if (!clientName) {
      return json_({ ok: false, error: 'clientName is required' });
    }

    var result = createClientSheet_(clientName, clientEmail, props);
    return json_({ ok: true, spreadsheetId: result.id, url: result.url });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function createClientSheet_(clientName, clientEmail, props) {
  var template = DriveApp.getFileById(props.getProperty('TEMPLATE_ID'));
  var folder = DriveApp.getFolderById(props.getProperty('FOLDER_ID'));

  // Re-use an existing sheet for the same client instead of creating duplicates.
  var title = clientName + ' - Tracking';
  var existing = folder.getFilesByName(title);
  var file = existing.hasNext() ? existing.next() : template.makeCopy(title, folder);

  if (clientEmail) {
    file.addEditor(clientEmail); // Clients log calls and outcomes in the sheet, so they need edit access.
  }

  return { id: file.getId(), url: 'https://docs.google.com/spreadsheets/d/' + file.getId() + '/edit' };
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to check the setup and grant permissions. Creates a "Setup Test - Tracking" sheet. */
function testSetup() {
  var result = createClientSheet_('Setup Test', '', PropertiesService.getScriptProperties());
  Logger.log('Created: ' + result.url);
}
