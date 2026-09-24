# Phase 10: Playwright End-to-End (E2E) Test Suite

This document defines the core End-to-End (E2E) user flows automated using **Playwright**.

---

## 1. Core End-to-End Test Specs

### Flow 1: Admin Provisions New Client Portal from Master Template
```typescript
test('Admin should clone master template and provision a new portal', async ({ page }) => {
  // 1. Authenticate as Admin
  await loginAs(page, 'admin@motionz.ai');
  
  // 2. Navigate to Client Roster
  await page.goto('/admin/clients');
  await page.click('button:has-text("+ New Client Portal")');
  
  // 3. Fill Provisioning Modal
  await page.selectOption('#templateSelect', { label: 'Master Roofing Template' });
  await page.fill('#companyName', 'Apex Roofing Solutions');
  await page.fill('#ownerEmail', 'owner@apexroofing.com');
  await page.selectOption('#stateSelect', 'OH');
  await page.click('button:has-text("Provision Portal")');
  
  // 4. Verify Success & Redirection
  await expect(page.locator('.toast-success')).toContainText('Portal created successfully');
  await expect(page.locator('#portalUrl')).toContainText('/portal/apex-roofing-solutions');
});
```

---

### Flow 2: CSM Updates Onboarding Step & Uploads Contract
```typescript
test('CSM should update onboarding step status and upload legal agreement', async ({ page }) => {
  // 1. Authenticate as CSM
  await loginAs(page, 'csm@motionz.ai');
  
  // 2. Open Assigned Client Portal
  await page.goto('/csm/clients/apex-roofing-solutions');
  
  // 3. Override Step Status
  await page.click('[data-step-id="llc"] .btn-edit');
  await page.selectOption('#stepStatus', 'done');
  await page.fill('#doingText', 'LLC filing approved and EIN issued.');
  await page.click('button:has-text("Save Step")');
  await expect(page.locator('[data-step-id="llc"] .pill')).toHaveText('Done');
  
  // 4. Upload Contract PDF
  await page.setInputFiles('#contractUpload', 'tests/fixtures/sample-contract.pdf');
  await page.click('button:has-text("Upload Agreement")');
  await expect(page.locator('#contractList')).toContainText('sample-contract.pdf');
});
```

---

### Flow 3: Client Logs In, Checks Leads & Sends Outbound SMS
```typescript
test('Client should view live leads and send outbound SMS message', async ({ page }) => {
  // 1. Client Magic Link Login
  await page.goto('/auth/verify?token=valid_test_token');
  await expect(page).toHaveURL('/portal/apex-roofing-solutions');
  
  // 2. Open Performance Tab
  await page.click('nav >> text=Performance');
  await expect(page.locator('.metric >> text=Leads')).toBeVisible();
  
  // 3. Open Activity Feed Conversation
  await page.click('.act-item:first-child');
  await expect(page.locator('.act-convo')).toBeVisible();
  
  // 4. Compose and Send SMS
  await page.fill('.cv-input', 'Hi John, our technician will arrive tomorrow at 10 AM.');
  await page.click('.cv-send');
  await expect(page.locator('.cv-note')).toContainText('Sent ✓');
});
```

---

### Flow 4: Client Uses Roof Measurement Tool & Computes Product Ratio
```typescript
test('Client should calculate roof area and chemical product gallons on satellite map', async ({ page }) => {
  await loginAs(page, 'owner@apexroofing.com');
  await page.goto('/portal/apex-roofing-solutions#measure');
  
  // 1. Enter Address
  await page.fill('#rmAddr', '123 Main St, Columbus, OH');
  await page.click('#rmGo');
  await expect(page.locator('#rmMapWrap')).toBeVisible();
  
  // 2. Trace 4 Vertices on Canvas
  const canvas = page.locator('#rmCanvas');
  await canvas.click({ position: { x: 100, y: 100 } });
  await canvas.click({ position: { x: 300, y: 100 } });
  await canvas.click({ position: { x: 300, y: 300 } });
  await canvas.click({ position: { x: 100, y: 300 } });
  
  // 3. Select Pitch & Calculate
  await page.selectOption('#rmPitch', '6');
  await page.click('#rmCalc');
  
  // 4. Verify Calculations
  await expect(page.locator('.rm-sqft')).not.toHaveText('0');
  await expect(page.locator('.rm-results')).toContainText('OnyaRoof concentrate');
  await expect(page.locator('.rm-results')).toContainText('Backpack loads');
});
```
