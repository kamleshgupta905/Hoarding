export const disableInspect = () => {
    // 🚫 Disable Right Click
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // 🚫 Disable Keyboard Shortcuts for DevTools
    document.addEventListener('keydown', (e) => {
        // F12
        if (e.key === 'F12') {
            e.preventDefault();
        }

        // Ctrl+Shift+I (DevTools)
        // Ctrl+Shift+J (Console)
        // Ctrl+Shift+C (Inspect Element)
        if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) {
            e.preventDefault();
        }

        // Ctrl+U (View Source)
        if (e.ctrlKey && e.key.toUpperCase() === 'U') {
            e.preventDefault();
        }
    });

    // 🚫 Detect DevTools Open (Optional - Consumes resources, keeping it simple for now)
    // Adding console warning
    console.log("%cStop!", "color: red; font-size: 50px; font-weight: bold;");
    console.log("%cThis is a protected area. Inspection is disabled.", "font-size: 20px;");
};
