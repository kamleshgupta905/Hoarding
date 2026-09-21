import time
import os
import glob
import subprocess
from playwright.sync_api import sync_playwright

def smooth_mouse_move(page, start_x, start_y, end_x, end_y, steps=25, delay=0.015):
    for i in range(steps + 1):
        x = start_x + (end_x - start_x) * (i / steps)
        y = start_y + (end_y - start_y) * (i / steps)
        page.mouse.move(x, y)
        time.sleep(delay)

def record_walkthrough():
    output_dir = os.path.abspath('recorded_tour')
    os.makedirs(output_dir, exist_ok=True)
    
    xlsx_path = os.path.abspath(r'C:\Users\shri hari computer\OneDrive\Desktop\Sample_MultiClient_MediaPlan.xlsx')
    pptx_path = os.path.abspath(r'C:\Users\shri hari computer\OneDrive\Desktop\Sample_Campaign_Artworks.pptx')
    voice_path = os.path.abspath(r'C:\Users\shri hari computer\OneDrive\Desktop\Heera_Dashboard_Narrator_Voice.wav')
    final_output = os.path.abspath(r'C:\Users\shri hari computer\OneDrive\Desktop\Heera_Advertising_Complete_Walkthrough.mp4')

    print("Launching Playwright Chromium at 1920x1080...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            record_video_dir=output_dir,
            record_video_size={'width': 1920, 'height': 1080}
        )
        page = context.new_page()

        # Step 0: Set auth
        print("Authenticating admin session...")
        page.goto('https://hoarding-hd9a.vercel.app/admin/login')
        page.wait_for_timeout(1500)
        page.evaluate("""() => {
            localStorage.setItem('isAdminAuthenticated', 'true');
            localStorage.setItem('adh_admin_id', 'admin');
            localStorage.setItem('adh_admin_session', 'session-local-admin');
            localStorage.setItem('adhoardings_active_tab', 'dashboard');
        }""")
        
        # Navigate to Dashboard
        page.goto('https://hoarding-hd9a.vercel.app/admin/dashboard')
        page.wait_for_timeout(3000)

        start_time = time.time()
        print("Recording Scene 1 (0s -> 30s): Overview & Header Bar...")
        smooth_mouse_move(page, 960, 540, 260, 85, steps=30)
        page.wait_for_timeout(3000)
        smooth_mouse_move(page, 260, 85, 670, 85, steps=30) # Excel Sync
        page.wait_for_timeout(4000)
        smooth_mouse_move(page, 670, 85, 765, 85, steps=25) # PPT Upload
        page.wait_for_timeout(4000)
        smooth_mouse_move(page, 765, 85, 930, 85, steps=30) # User Profile Hare Krishna
        page.wait_for_timeout(4000)
        while time.time() - start_time < 30:
            page.wait_for_timeout(500)

        print("Recording Scene 2 (30s -> 60s): Executive KPIs & Media Charts...")
        smooth_mouse_move(page, 930, 85, 270, 370, steps=30) # Revenue Card
        page.wait_for_timeout(4000)
        smooth_mouse_move(page, 270, 370, 630, 370, steps=25) # Active sites
        page.wait_for_timeout(4000)
        smooth_mouse_move(page, 630, 370, 820, 370, steps=25) # Verified sites
        page.wait_for_timeout(4000)
        page.mouse.wheel(0, 350)
        page.wait_for_timeout(2000)
        smooth_mouse_move(page, 820, 370, 450, 680, steps=30) # Unipoles bar
        page.wait_for_timeout(4000)
        smooth_mouse_move(page, 450, 680, 820, 680, steps=30) # Donut chart
        page.wait_for_timeout(4000)
        page.mouse.wheel(0, -350)
        page.wait_for_timeout(1000)
        while time.time() - start_time < 60:
            page.wait_for_timeout(500)

        print("Recording Scene 3 (60s -> 105s): Master Asset Inventory & Search...")
        try:
            page.click("text=Inventory", timeout=5000)
        except Exception:
            page.click("button:has-text('Inventory')", timeout=5000)
        page.wait_for_timeout(3000)
        
        # Search for Begum Bridge
        smooth_mouse_move(page, 100, 290, 520, 350, steps=30)
        try:
            search_input = page.locator("input[placeholder*='Search location']").first
            search_input.click()
            page.wait_for_timeout(500)
            search_input.fill("Begum Bridge")
            page.wait_for_timeout(3000)
        except Exception as e:
            print("Search fill note:", e)

        page.mouse.wheel(0, 200)
        page.wait_for_timeout(3000)
        smooth_mouse_move(page, 520, 350, 450, 540, steps=30)
        page.wait_for_timeout(4000)
        smooth_mouse_move(page, 450, 540, 830, 245, steps=30)
        page.wait_for_timeout(3000)
        smooth_mouse_move(page, 830, 245, 915, 245, steps=25)
        page.wait_for_timeout(4000)
        while time.time() - start_time < 105:
            page.wait_for_timeout(500)

        print("Recording Scene 4 (105s -> 145s): Single Site Booking Slot Modal...")
        try:
            booking_btn = page.locator("button[title*='Schedule'], button[title*='Book'], .qm-btn-primary, [aria-label*='book']").first
            booking_btn.click()
            page.wait_for_timeout(3000)
        except Exception as e:
            print("Booking modal click:", e)
            page.mouse.click(500, 520)
            page.wait_for_timeout(2000)

        smooth_mouse_move(page, 915, 245, 960, 480, steps=30)
        page.wait_for_timeout(5000)
        smooth_mouse_move(page, 960, 480, 1050, 680, steps=30)
        page.wait_for_timeout(5000)
        try:
            page.keyboard.press("Escape")
            page.wait_for_timeout(1000)
        except Exception:
            pass
        while time.time() - start_time < 145:
            page.wait_for_timeout(500)

        print("Recording Scene 5 (145s -> 195s): Upgraded Bulk Booking Wizard Ingestion...")
        try:
            page.click("text=Dashboard", timeout=5000)
            page.wait_for_timeout(2000)
            page.click("button:has-text('Bulk Booking')", timeout=5000)
            page.wait_for_timeout(3000)
        except Exception as e:
            print("Bulk booking click error:", e)

        # Select Mode 2
        try:
            page.click("text=Mode 2: Excel + PPT Bundle", timeout=4000)
            page.wait_for_timeout(2000)
        except Exception:
            pass

        # Set files
        try:
            excel_input = page.locator("input[type='file'][accept*='xlsx']").first
            excel_input.set_input_files(xlsx_path)
            page.wait_for_timeout(2000)
            
            ppt_input = page.locator("input[type='file'][accept*='pptx']").first
            ppt_input.set_input_files(pptx_path)
            page.wait_for_timeout(2500)
            
            # Click Review & Validate Bookings
            page.click("button:has-text('Review & Validate Bookings')", timeout=8000)
            page.wait_for_timeout(4000)
            print("Entered Step 2 successfully!")
        except Exception as e:
            print("File upload error:", e)

        while time.time() - start_time < 195:
            page.wait_for_timeout(500)

        print("Recording Scene 6 (195s -> 240s): Twin-Site Facing Matching & Client Filtering...")
        # Hover over stats bar (Date Clashes, Ready to Book)
        smooth_mouse_move(page, 960, 600, 600, 310, steps=30)
        page.wait_for_timeout(4000)
        
        # Click on client chips
        try:
            chips = page.locator(".client-chip")
            chip_count = chips.count()
            if chip_count > 1:
                chips.nth(1).click()
                page.wait_for_timeout(3000)
                chips.nth(0).click() # back to All Clients
                page.wait_for_timeout(2000)
        except Exception as e:
            print("Chip click:", e)

        # Scroll in table to showcase the Facing column prominently
        try:
            table_container = page.locator(".bulk-table-container, .bulk-matrix-table").first
            table_container.hover()
            smooth_mouse_move(page, 600, 310, 520, 500, steps=25) # Point directly to Facing column!
            page.wait_for_timeout(4000)
            page.mouse.wheel(0, 150)
            page.wait_for_timeout(3000)
            page.mouse.wheel(0, -150)
            page.wait_for_timeout(2000)
        except Exception as e:
            print("Table scroll:", e)

        while time.time() - start_time < 240:
            page.wait_for_timeout(500)

        print("Recording Scene 7 (240s -> 268s): Confirm & Book Sites (Success Screen)...")
        # Click Confirm & Book Sites
        try:
            commit_btn = page.locator(".btn-wizard-commit, button:has-text('Confirm & Book')").first
            commit_btn.click()
            page.wait_for_timeout(5000)
            print("Step 3 Success screen shown!")
        except Exception as e:
            print("Commit button error:", e)

        # Center mouse over success checkmark
        smooth_mouse_move(page, 520, 500, 960, 480, steps=30)
        page.wait_for_timeout(6000)

        # Close wizard modal
        try:
            page.click(".bulk-wizard-close, button:has-text('Done'), button:has-text('Close')", timeout=3000)
        except Exception:
            page.keyboard.press("Escape")
        page.wait_for_timeout(2000)

        while time.time() - start_time < 268:
            page.wait_for_timeout(500)

        print("Recording Scene 8 (268s -> 282s): Daily Updates & 50m Geofence Telemetry...")
        try:
            page.click("text=Daily Updates", timeout=5000)
            page.wait_for_timeout(3000)
        except Exception:
            pass

        smooth_mouse_move(page, 960, 480, 550, 320, steps=25)
        page.wait_for_timeout(3000)
        smooth_mouse_move(page, 550, 320, 960, 540, steps=25)

        while time.time() - start_time < 283:
            page.wait_for_timeout(500)

        print("Walkthrough recorded! Closing page context to flush video...")
        context.close()
        browser.close()

    webm_files = glob.glob(os.path.join(output_dir, '*.webm'))
    if not webm_files:
        raise RuntimeError("No recorded webm file found in output_dir!")
    recorded_webm = max(webm_files, key=os.path.getctime)
    print("Found recorded video:", recorded_webm)

    print(f"Muxing recorded video with narrator voice into {final_output}...")
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
