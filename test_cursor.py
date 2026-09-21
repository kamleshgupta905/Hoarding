from playwright.sync_api import sync_playwright
import time

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

    # Inject realistic Windows mouse cursor
    page.evaluate('''() => {
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
    }''')

    # Move mouse over Bulk Booking button and click
    page.mouse.move(960, 540)
    time.sleep(0.5)
    page.mouse.move(1420, 160)
    time.sleep(0.5)
    page.mouse.down()
    page.screenshot(path='test_cursor_click.png')
    page.mouse.up()
    browser.close()
    print('Cursor test screenshot saved!')
