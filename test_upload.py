from playwright.sync_api import sync_playwright
import os

xlsx_path = os.path.abspath(r'C:\Users\shri hari computer\OneDrive\Desktop\Sample_MultiClient_MediaPlan.xlsx')
pptx_path = os.path.abspath(r'C:\Users\shri hari computer\OneDrive\Desktop\Sample_Campaign_Artworks.pptx')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    page.goto('https://hoarding-hd9a.vercel.app/admin/dashboard')
    page.evaluate('''() => {
        localStorage.setItem('isAdminAuthenticated', 'true');
        localStorage.setItem('adh_admin_id', 'admin');
        localStorage.setItem('adh_admin_session', 'session-local-admin');
        localStorage.setItem('adhoardings_active_tab', 'dashboard');
    }''')
    page.goto('https://hoarding-hd9a.vercel.app/admin/dashboard')
    page.wait_for_timeout(2500)
    page.click("button:has-text('Bulk Booking')")
    page.wait_for_timeout(1000)

    print('Clicking Mode 2 card...')
    mode2_card = page.locator('.bulk-mode-card').nth(1)
    mode2_card.click()
    page.wait_for_timeout(800)

    # Use scoped selector inside .bulk-wizard-modal
    wizard_inputs = page.locator(".bulk-wizard-modal input[type='file']")
    print(f'Found {wizard_inputs.count()} wizard file inputs')
    
    wizard_inputs.nth(0).set_input_files(xlsx_path)
    page.wait_for_timeout(800)
    wizard_inputs.nth(1).set_input_files(pptx_path)
    page.wait_for_timeout(800)

    next_btn = page.locator('.btn-wizard-next')
    print('Next button disabled?', next_btn.is_disabled())
    if not next_btn.is_disabled():
        next_btn.click()
        page.wait_for_timeout(4000)
        print('Step 2 visible?', page.locator('.step-2-body').is_visible())
        page.screenshot(path='test_step2.png')
    browser.close()
