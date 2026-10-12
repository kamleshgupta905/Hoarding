import os
from PIL import Image, ImageDraw

def make_icon(src_img, size, round_shape=False, is_foreground=False):
    # Base canvas
    if is_foreground:
        # Foreground is 108dp equivalent with transparent background or adaptive padding
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        # Center logo within 66% of the canvas
        logo_max_w = int(size * 0.72)
        logo_max_h = int(size * 0.72)
    else:
        # App icon with clean white card background
        canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
        logo_max_w = int(size * 0.82)
        logo_max_h = int(size * 0.82)

    # Scale logo preserving aspect ratio
    src_copy = src_img.copy()
    src_copy.thumbnail((logo_max_w, logo_max_h), Image.Resampling.LANCZOS)
    
    # Calculate position to center
    pos_x = (size - src_copy.width) // 2
    pos_y = (size - src_copy.height) // 2
    
    canvas.paste(src_copy, (pos_x, pos_y), src_copy if src_copy.mode == 'RGBA' else None)

    if round_shape and not is_foreground:
        # Create circular mask
        mask = Image.new('L', (size, size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size - 1, size - 1), fill=255)
        
        output = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        output.paste(canvas, (0, 0), mask=mask)
        return output
    elif not is_foreground:
        # Rounded rectangle for squircle
        corner_radius = int(size * 0.2)
        mask = Image.new('L', (size, size), 0)
        draw = ImageDraw.Draw(mask)
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=corner_radius, fill=255)
        
        output = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        output.paste(canvas, (0, 0), mask=mask)
        return output

    return canvas

def generate_all_icons():
    src_path = os.path.join('public', 'hira-logo.png')
    if not os.path.exists(src_path):
        src_path = os.path.join('public', 'heera-logo.png')
    
    print(f"Loading source logo: {src_path}")
    src_img = Image.open(src_path).convert('RGBA')

    configs = {
        'mipmap-mdpi': {'standard': 48, 'foreground': 108},
        'mipmap-hdpi': {'standard': 72, 'foreground': 162},
        'mipmap-xhdpi': {'standard': 96, 'foreground': 216},
        'mipmap-xxhdpi': {'standard': 144, 'foreground': 324},
        'mipmap-xxxhdpi': {'standard': 192, 'foreground': 432}
    }

    base_out = os.path.join('resources', 'android', 'res')
    os.makedirs(base_out, exist_ok=True)

    for folder_name, sizes in configs.items():
        folder_path = os.path.join(base_out, folder_name)
        os.makedirs(folder_path, exist_ok=True)

        std_size = sizes['standard']
        fg_size = sizes['foreground']

        # 1. Standard square/squircle launcher icon
        icon = make_icon(src_img, std_size, round_shape=False, is_foreground=False)
        icon.save(os.path.join(folder_path, 'ic_launcher.png'), 'PNG')

        # 2. Round launcher icon
        round_icon = make_icon(src_img, std_size, round_shape=True, is_foreground=False)
        round_icon.save(os.path.join(folder_path, 'ic_launcher_round.png'), 'PNG')

        # 3. Adaptive foreground icon
        fg_icon = make_icon(src_img, fg_size, round_shape=False, is_foreground=True)
        fg_icon.save(os.path.join(folder_path, 'ic_launcher_foreground.png'), 'PNG')

        print(f"Generated icons for {folder_name} (std: {std_size}px, fg: {fg_size}px)")

    # Also save app favicon / icon
    fav = make_icon(src_img, 192, round_shape=False, is_foreground=False)
    fav.save(os.path.join('public', 'app-icon-192.png'), 'PNG')
    fav512 = make_icon(src_img, 512, round_shape=False, is_foreground=False)
    fav512.save(os.path.join('public', 'app-icon-512.png'), 'PNG')

    # 4. Generate all splash screen drawables (pure white background with centered Heera logo)
    splash_configs = {
        'drawable': (480, 800),
        'drawable-port-mdpi': (320, 480),
        'drawable-port-hdpi': (480, 800),
        'drawable-port-xhdpi': (720, 1280),
        'drawable-port-xxhdpi': (960, 1600),
        'drawable-port-xxxhdpi': (1280, 1920),
        'drawable-land-mdpi': (480, 320),
        'drawable-land-hdpi': (800, 480),
        'drawable-land-xhdpi': (1280, 720),
        'drawable-land-xxhdpi': (1600, 960),
        'drawable-land-xxxhdpi': (1920, 1280)
    }

    for folder, (w, h) in splash_configs.items():
        folder_path = os.path.join(base_out, folder)
        os.makedirs(folder_path, exist_ok=True)
        canvas = Image.new('RGBA', (w, h), (255, 255, 255, 255))
        max_w = int(min(w, h) * 0.65)
        max_h = int(min(w, h) * 0.45)
        logo = src_img.copy()
        logo.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
        pos_x = (w - logo.width) // 2
        pos_y = (h - logo.height) // 2
        canvas.paste(logo, (pos_x, pos_y), logo)
        canvas.save(os.path.join(folder_path, 'splash.png'), 'PNG')
        print(f"Generated splash for {folder} ({w}x{h})")

    print("All Android app launcher icons & splash screens successfully generated!")

if __name__ == '__main__':
    generate_all_icons()

