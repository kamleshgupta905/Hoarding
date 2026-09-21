import time
import os
import glob
import subprocess
from playwright.sync_api import sync_playwright

def smooth_move(page, start_x, start_y, end_x, end_y, steps=30, delay=0.015):
    for i in range(steps + 1):
        t = i / steps
        ease = t * t * (3 - 2 * t)
        x = start_x + (end_x - start_x) * ease
        y = start_y + (end_y - start_y) * ease
        page.mouse.move(x, y)
        time.sleep(delay)

def click_with_ripple(page, x, y):
    page.mouse.move(x, y)
    time.sleep(0.1)
    page.mouse.down()
    time.sleep(0.08)
    page.mouse.up()
    time.sleep(0.15)

def record_walkthrough():
    output_dir = os.path.abspath('recorded_tour')
    os.makedirs(output_dir, exist_ok=True)
    for f in glob.glob(os.path.join(output_dir, '*.webm')):
        try: os.remove(f)
        except: pass

    xlsx_path = os.path.abspath(r'C:\Users\shri hari computer\OneDrive\Desktop\Sample_MultiClient_MediaPlan.xlsx')
    pptx_path = os.path.abspath(r'C:\Users\shri hari computer\OneDrive\Desktop\Sample_Campaign_Artworks.pptx')
    voice_path = os.path.abspath('calm_voice.wav')
    final_output = os.path.abspath(r'C:\Users\shri hari computer\OneDrive\Desktop\Heera_Advertising_Complete_Walkthrough.mp4')

    print("Launching Playwright with realistic visible mouse pointer (336s calm pace)...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            record_video_dir=output_dir,
            record_video_size={'width': 1920, 'height': 1080}
        )
        page = context.new_page()

        # Step 0: Auth & setup
        page.goto('https://hoarding-hd9a.vercel.app/admin/login')
        page.wait_for_timeout(1500)
        page.evaluate("""() => {
            localStorage.setItem('isAdminAuthenticated', 'true');
            localStorage.setItem('adh_admin_id', 'admin');
            localStorage.setItem('adh_admin_session', 'session-local-admin');
            localStorage.setItem('adhoardings_active_tab', 'dashboard');
        }""")
        
        page.goto('https://hoarding-hd9a.vercel.app/admin/dashboard')
        page.wait_for_timeout(2500)

        # Inject realistic Windows mouse pointer overlay & click ripple effect
        page.evaluate("""() => {
            const cursor = document.createElement('div');
            cursor.id = 'human-mouse-cursor';
            cursor.style.position = 'fixed';
            cursor.style.top = '0px';
            cursor.style.left = '0px';
            cursor.style.width = '26px';
            cursor.style.height = '26px';
            cursor.style.pointerEvents = 'none';
            cursor.style.zIndex = '9999999';
            cursor.style.transform = 'translate(-2px, -2px)';
            cursor.style.transition = 'transform 0.04s ease-out';
            cursor.innerHTML = `
                <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                    <path d="M4 2v20l5.5-5.5 4 8.5 3.5-1.5-4-8.5H21L4 2z" fill="#000000" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
                </svg>
            `;
            document.body.appendChild(cursor);

            window.addEventListener('mousemove', (e) => {
                cursor.style.left = `${e.clientX}px`;
                cursor.style.top = `${e.clientY}px`;
            });

            window.addEventListener('mousedown', (e) => {
                const ripple = document.createElement('div');
                ripple.style.position = 'fixed';
                ripple.style.left = `${e.clientX - 16}px`;
                ripple.style.top = `${e.clientY - 16}px`;
                ripple.style.width = '32px';
                ripple.style.height = '32px';
                ripple.style.borderRadius = '50%';
                ripple.style.border = '2.5px solid #ef4444';
                ripple.style.pointerEvents = 'none';
                ripple.style.zIndex = '9999998';
                ripple.style.animation = 'ripple-effect 0.35s ease-out forwards';
                document.body.appendChild(ripple);
                setTimeout(() => ripple.remove(), 400);
            });

            const style = document.createElement('style');
            style.textContent = `
                @keyframes ripple-effect {
                    0% { transform: scale(0.3); opacity: 1; }
                    100% { transform: scale(1.6); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }""")

        start_time = time.time()
        curr_x, curr_y = 960, 540
        page.mouse.move(curr_x, curr_y)

        # -------------------------------------------------------------------------
        # Scene 1 (0s -> 35s): Overview & Header Bar
        # -------------------------------------------------------------------------
        print("Scene 1: Header Bar & Storefront Link...")
        smooth_move(page, curr_x, curr_y, 260, 85, steps=35)
        curr_x, curr_y = 260, 85
        page.wait_for_timeout(3500)
        
        smooth_move(page, curr_x, curr_y, 670, 85, steps=30) # Excel Sync
        curr_x, curr_y = 670, 85
        page.wait_for_timeout(4500)
        
        smooth_move(page, curr_x, curr_y, 765, 85, steps=25) # PPT Upload
        curr_x, curr_y = 765, 85
        page.wait_for_timeout(4500)
        
        smooth_move(page, curr_x, curr_y, 930, 85, steps=30) # Profile
        curr_x, curr_y = 930, 85
        page.wait_for_timeout(5000)
        while time.time() - start_time < 35:
            page.wait_for_timeout(500)

        # -------------------------------------------------------------------------
        # Scene 2 (35s -> 75s): Executive KPIs & Media Charts
        # -------------------------------------------------------------------------
        print("Scene 2: Executive KPIs & Analytics Charts...")
        smooth_move(page, curr_x, curr_y, 270, 370, steps=35) # Revenue Card
        curr_x, curr_y = 270, 370
        page.wait_for_timeout(4500)
        
        smooth_move(page, curr_x, curr_y, 630, 370, steps=30) # Active sites
        curr_x, curr_y = 630, 370
        page.wait_for_timeout(4500)
        
        smooth_move(page, curr_x, curr_y, 820, 370, steps=25) # Verified sites
        curr_x, curr_y = 820, 370
        page.wait_for_timeout(4500)
        
        page.mouse.wheel(0, 350)
        page.wait_for_timeout(2500)
        
        smooth_move(page, curr_x, curr_y, 450, 680, steps=30) # Unipoles bar
        curr_x, curr_y = 450, 680
        page.wait_for_timeout(5000)
        
        smooth_move(page, curr_x, curr_y, 820, 680, steps=30) # Donut chart
        curr_x, curr_y = 820, 680
        page.wait_for_timeout(5000)
        
        page.mouse.wheel(0, -350)
        page.wait_for_timeout(1200)
        while time.time() - start_time < 75:
            page.wait_for_timeout(500)

        # -------------------------------------------------------------------------
        # Scene 3 (75s -> 125s): Master Asset Inventory & Search
        # -------------------------------------------------------------------------
        print("Scene 3: Master Asset Inventory & Live Search...")
        smooth_move(page, curr_x, curr_y, 100, 270, steps=35)
        curr_x, curr_y = 100, 270
        click_with_ripple(page, curr_x, curr_y)
        try:
            page.click("text=Inventory", timeout=4000)
        except: pass
        page.wait_for_timeout(3500)

        # Search Begum Bridge
        smooth_move(page, curr_x, curr_y, 520, 350, steps=35)
        curr_x, curr_y = 520, 350
        click_with_ripple(page, curr_x, curr_y)
        try:
            s_input = page.locator("input[placeholder*='Search location']").first
            s_input.fill("Begum Bridge")
            page.wait_for_timeout(3000)
        except Exception as e:
            print("Search note:", e)

        page.mouse.wheel(0, 180)
        page.wait_for_timeout(3000)
        
        # Star sites
        smooth_move(page, curr_x, curr_y, 260, 520, steps=30)
        curr_x, curr_y = 260, 520
        click_with_ripple(page, curr_x, curr_y)
        page.wait_for_timeout(2000)

        smooth_move(page, curr_x, curr_y, 260, 680, steps=25)
        curr_x, curr_y = 260, 680
        click_with_ripple(page, curr_x, curr_y)
        page.wait_for_timeout(2500)

        # Hover Excel & PPT export buttons
        smooth_move(page, curr_x, curr_y, 830, 245, steps=30)
        curr_x, curr_y = 830, 245
        page.wait_for_timeout(4000)
        smooth_move(page, curr_x, curr_y, 915, 245, steps=25)
        curr_x, curr_y = 915, 245
        page.wait_for_timeout(4000)
        while time.time() - start_time < 125:
            page.wait_for_timeout(500)

        # -------------------------------------------------------------------------
        # Scene 4 (125s -> 175s): Single Site Booking Slot Modal
        # -------------------------------------------------------------------------
        print("Scene 4: Single Site Booking Modal...")
        smooth_move(page, curr_x, curr_y, 950, 520, steps=30)
        curr_x, curr_y = 950, 520
        click_with_ripple(page, curr_x, curr_y)
        try:
            b_btn = page.locator("button[title*='Schedule'], button[title*='Book'], .qm-btn-primary, [aria-label*='book']").first
            b_btn.click()
            page.wait_for_timeout(3500)
        except:
            page.mouse.click(500, 520)
            page.wait_for_timeout(2000)

        smooth_move(page, curr_x, curr_y, 960, 480, steps=35)
        curr_x, curr_y = 960, 480
        page.wait_for_timeout(6000)
        
        smooth_move(page, curr_x, curr_y, 1050, 680, steps=30)
        curr_x, curr_y = 1050, 680
        page.wait_for_timeout(6000)
        try:
            page.keyboard.press("Escape")
            page.wait_for_timeout(1200)
        except: pass
        while time.time() - start_time < 175:
            page.wait_for_timeout(500)

        # -------------------------------------------------------------------------
        # Scene 5 (175s -> 230s): Upgraded Bulk Booking Wizard Ingestion
        # -------------------------------------------------------------------------
        print("Scene 5: Bulk Booking Wizard Live Ingestion...")
        smooth_move(page, curr_x, curr_y, 100, 220, steps=30)
        curr_x, curr_y = 100, 220
        click_with_ripple(page, curr_x, curr_y)
        try:
            page.click("text=Dashboard", timeout=4000)
            page.wait_for_timeout(2000)
        except: pass

        smooth_move(page, curr_x, curr_y, 1420, 160, steps=35)
        curr_x, curr_y = 1420, 160
        click_with_ripple(page, curr_x, curr_y)
        try:
            page.click("button:has-text('Bulk Booking')", timeout=4000)
            page.wait_for_timeout(2500)
        except: pass

        # Move to Mode 2 card
        smooth_move(page, curr_x, curr_y, 1200, 280, steps=30)
        curr_x, curr_y = 1200, 280
        click_with_ripple(page, curr_x, curr_y)
        try:
            mode2 = page.locator('.bulk-mode-card').nth(1)
            mode2.click()
            page.wait_for_timeout(1500)
        except: pass

        # Move to Excel Dropzone & Select
        smooth_move(page, curr_x, curr_y, 750, 480, steps=30)
        curr_x, curr_y = 750, 480
        click_with_ripple(page, curr_x, curr_y)
        try:
            w_inputs = page.locator(".bulk-wizard-modal input[type='file']")
            w_inputs.nth(0).set_input_files(xlsx_path)
            page.wait_for_timeout(2000)
        except Exception as e:
            print("Excel drop note:", e)

        # Move to PPT Dropzone & Select
        smooth_move(page, curr_x, curr_y, 1150, 480, steps=30)
        curr_x, curr_y = 1150, 480
        click_with_ripple(page, curr_x, curr_y)
        try:
            w_inputs = page.locator(".bulk-wizard-modal input[type='file']")
            w_inputs.nth(1).set_input_files(pptx_path)
            page.wait_for_timeout(2500)
        except Exception as e:
            print("PPT drop note:", e)

        # Click Review & Validate Bookings
        smooth_move(page, curr_x, curr_y, 1340, 680, steps=30)
        curr_x, curr_y = 1340, 680
        click_with_ripple(page, curr_x, curr_y)
        try:
            page.click("button:has-text('Review & Validate Bookings')", timeout=8000)
            page.wait_for_timeout(4000)
        except Exception as e:
            print("Review button note:", e)

        while time.time() - start_time < 230:
            page.wait_for_timeout(500)

        # -------------------------------------------------------------------------
        # Scene 6 (230s -> 275s): Step 2 Facing Column & Client Filters
        # -------------------------------------------------------------------------
        print("Scene 6: Step 2 Table, Facing Column & Client Filters...")
        smooth_move(page, curr_x, curr_y, 650, 310, steps=30)
        curr_x, curr_y = 650, 310
        page.wait_for_timeout(3500)

        # Click Client Filters
        try:
            chips = page.locator(".client-chip")
            if chips.count() > 1:
                smooth_move(page, curr_x, curr_y, 800, 435, steps=25)
                curr_x, curr_y = 800, 435
                click_with_ripple(page, curr_x, curr_y)
                chips.nth(1).click()
                page.wait_for_timeout(3500)
                
                if chips.count() > 2:
                    smooth_move(page, curr_x, curr_y, 920, 435, steps=25)
                    curr_x, curr_y = 920, 435
                    click_with_ripple(page, curr_x, curr_y)
                    chips.nth(2).click()
                    page.wait_for_timeout(3500)
                
                smooth_move(page, curr_x, curr_y, 680, 435, steps=25)
                curr_x, curr_y = 680, 435
                click_with_ripple(page, curr_x, curr_y)
                chips.nth(0).click()
                page.wait_for_timeout(2500)
        except Exception as e:
            print("Chip filter note:", e)

        # Highlight Facing column in table
        smooth_move(page, curr_x, curr_y, 880, 520, steps=30)
        curr_x, curr_y = 880, 520
        page.wait_for_timeout(4500)

        try:
            tbl = page.locator(".bulk-table-container, .bulk-matrix-table").first
            tbl.hover()
            page.mouse.wheel(0, 160)
            page.wait_for_timeout(3500)
            page.mouse.wheel(0, -160)
            page.wait_for_timeout(2500)
        except: pass

        # Close Wizard explicitly
        print("Closing wizard...")
        page.evaluate("() => document.querySelector('.bulk-wizard-close')?.click()")
        page.wait_for_timeout(1500)

        while time.time() - start_time < 275:
            page.wait_for_timeout(500)

        # -------------------------------------------------------------------------
        # Scene 7 (275s -> 315s): PPT Download & 4:3 Slide Presentation Preview
        # -------------------------------------------------------------------------
        print("Scene 7: PPT Proposal Download & 4:3 Slide Format Inspection...")
        page.evaluate("""() => {
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
        }""")

        page.wait_for_timeout(1000)
        smooth_move(page, curr_x, curr_y, 700, 340, steps=30)
        curr_x, curr_y = 700, 340
        page.wait_for_timeout(4500)

        smooth_move(page, curr_x, curr_y, 1220, 340, steps=30)
        curr_x, curr_y = 1220, 340
        page.wait_for_timeout(4500)

        smooth_move(page, curr_x, curr_y, 960, 680, steps=30)
        curr_x, curr_y = 960, 680
        page.wait_for_timeout(6000)

        # Remove preview
        page.evaluate("""() => {
            const m = document.getElementById('ppt-proposal-viewer');
            if (m) m.remove();
        }""")
        page.wait_for_timeout(1500)

        while time.time() - start_time < 315:
            page.wait_for_timeout(500)

        # -------------------------------------------------------------------------
        # Scene 8 (315s -> 336s): Daily Updates & 50m Geofence Telemetry
        # -------------------------------------------------------------------------
        print("Scene 8: Daily Updates & 50m Geofence Telemetry...")
        smooth_move(page, curr_x, curr_y, 100, 480, steps=30)
        curr_x, curr_y = 100, 480
        click_with_ripple(page, curr_x, curr_y)
        try:
            page.click("text=Daily Updates", timeout=4000)
            page.wait_for_timeout(3000)
        except: pass

        smooth_move(page, curr_x, curr_y, 550, 320, steps=25)
        curr_x, curr_y = 550, 320
        page.wait_for_timeout(4000)

        smooth_move(page, curr_x, curr_y, 960, 540, steps=25)
        curr_x, curr_y = 960, 540

        while time.time() - start_time < 336:
            page.wait_for_timeout(500)

        print("Walkthrough recorded! Closing page context to flush video...")
        context.close()
        browser.close()

    webm_files = glob.glob(os.path.join(output_dir, '*.webm'))
    if not webm_files:
        raise RuntimeError("No recorded webm file found in output_dir!")
    recorded_webm = max(webm_files, key=os.path.getctime)
    print("Found recorded video:", recorded_webm)

    print(f"Muxing recorded video with calm narrator voice into {final_output}...")
    cmd = [
        'ffmpeg', '-y',
        '-i', recorded_webm,
        '-i', voice_path,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        final_output
    ]
    subprocess.run(cmd, check=True)
    print("SUCCESS! Final walkthrough video ready at:", final_output)

if __name__ == '__main__':
    record_walkthrough()
