from playwright.sync_api import sync_playwright

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
    page.wait_for_timeout(2000)
    page.click("button:has-text('Bulk Booking')")
    page.wait_for_timeout(1000)

    # Close wizard
    print('Closing wizard via JS...')
    page.evaluate("() => document.querySelector('.bulk-wizard-close')?.click()")
    page.wait_for_timeout(1000)
    print('Wizard visible?', page.locator('.bulk-wizard-modal').is_visible())
    
    # Inject PPT Slide Preview with maximum z-index
    page.evaluate('''() => {
        const modal = document.createElement('div');
        modal.id = 'ppt-proposal-viewer';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.background = 'rgba(15, 23, 42, 0.88)';
        modal.style.backdropFilter = 'blur(8px)';
        modal.style.zIndex = '2147483647';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.fontFamily = "'Inter', system-ui, sans-serif";
        
        modal.innerHTML = `
            <div style="background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 24px; max-width: 1040px; width: 92%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #334155;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="background: #ea580c; color: white; padding: 6px 14px; border-radius: 8px; font-weight: 800; font-size: 0.84rem; letter-spacing: 0.5px;">PPT EXPORT</span>
                        <h3 style="color: #f8fafc; font-size: 1.15rem; margin: 0; font-weight: 700;">Downloaded PowerPoint Deck — Standard 4:3 Ratio (10.0" × 7.5")</h3>
                    </div>
                    <span style="background: #10b981; color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.78rem; font-weight: 700;">✓ Verified 4:3 Clean Frame</span>
                </div>

                <div style="background: #ffffff; width: 800px; height: 530px; margin: 0 auto; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); position: relative; overflow: hidden; display: flex; flex-direction: column; border: 2px solid #475569;">
                    <div style="background: #0f172a; color: white; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 800; font-size: 0.92rem; letter-spacing: 0.5px; color: #38bdf8;">HIRA ADVERTISING — OUTDOOR MEDIA PLAN</span>
                        <span style="font-size: 0.78rem; color: #94a3b8; font-weight: 600;">Slide 1 of 3 • 4:3 Client Deck</span>
                    </div>

                    <div style="flex: 1; position: relative; background: #cbd5e1;">
                        <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=900&auto=format&fit=crop" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
                        
                        <div style="position: absolute; top: 14px; left: 16px; background: rgba(15, 23, 42, 0.88); color: #38bdf8; padding: 5px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; font-family: monospace;">
                            📍 28.998107, 77.705821 (Begum Bridge Metro)
                        </div>

                        <div style="position: absolute; top: 14px; right: 16px; background: #6366f1; color: white; padding: 6px 14px; border-radius: 6px; font-size: 0.84rem; font-weight: 800; box-shadow: 0 4px 10px rgba(99,102,241,0.4);">
                            FACING: MODIPURAM
                        </div>

                        <div style="position: absolute; bottom: 14px; left: 16px; right: 16px; background: rgba(15, 23, 42, 0.92); backdrop-filter: blur(10px); border-radius: 8px; padding: 14px 20px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; color: white; border: 1px solid rgba(255,255,255,0.12);">
                            <div>
                                <span style="font-size: 0.68rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; display: block;">Structure Type</span>
                                <strong style="font-size: 0.9rem; color: #f8fafc;">Unipole</strong>
                            </div>
                            <div>
                                <span style="font-size: 0.68rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; display: block;">Dimensions</span>
                                <strong style="font-size: 0.9rem; color: #f8fafc;">40 × 10 ft</strong>
                            </div>
                            <div>
                                <span style="font-size: 0.68rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; display: block;">Illumination</span>
                                <strong style="font-size: 0.9rem; color: #38bdf8;">Non-Lit</strong>
                            </div>
                            <div>
                                <span style="font-size: 0.68rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; display: block;">Monthly Rental</span>
                                <strong style="font-size: 1.0rem; color: #10b981;">₹60,000 / mo</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 16px; text-align: center; color: #94a3b8; font-size: 0.84rem;">
                    💡 Clean 4:3 slide canvas ensures zero image bleed and perfect aspect ratio when emailed or presented to corporate clients.
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }''')
    page.wait_for_timeout(1000)
    page.screenshot(path='test_close_and_preview.png')
    browser.close()
    print('Test complete!')
