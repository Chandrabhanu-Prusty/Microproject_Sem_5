import os
import sys
import subprocess
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RECORDINGS_DIR = os.path.join(BASE_DIR, "recordings")
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SCENES = [
    {
        "id": "scene1_intro",
        "audio": "01_intro.wav",
        "video": "scene1_intro.webm",
        "badge": "OVERVIEW · STEP 1/7",
        "title": "AWS SERVERLESS ARCHITECTURE & WORKFLOW",
        "subtitle": "Amazon API Gateway  |  AWS Lambda Node.js 22  |  6x DynamoDB Tables  |  Amazon S3",
        "accent": (59, 130, 246)
    },
    {
        "id": "scene2_attendee",
        "audio": "02_attendee_auth.wav",
        "video": "scene2_attendee.webm",
        "badge": "ATTENDEE · STEP 2/7",
        "title": "STAKEHOLDER 1: STUDENT ATTENDEE DISCOVERY & AUTH",
        "subtitle": "JWT Authentication  |  Real-Time Event Catalog  |  Live Capacity Quota Inspection",
        "accent": (16, 185, 129)
    },
    {
        "id": "scene3_ticket",
        "audio": "03_rsvp_ticket.wav",
        "video": "scene3_ticket.webm",
        "badge": "TICKETING · STEP 3/7",
        "title": "ATOMIC RSVP & CRYPTOGRAPHIC QR TICKET PASS",
        "subtitle": "DynamoDB ACID Reservation  |  Tamper-Proof HMAC Signature  |  Offline Printable Pass",
        "accent": (245, 158, 11)
    },
    {
        "id": "scene4_waitlist",
        "audio": "04_waitlist.wav",
        "video": "scene4_waitlist.webm",
        "badge": "WAITLIST · STEP 4/7",
        "title": "DETERMINISTIC FIFO WAITLIST & PROMOTION ENGINE",
        "subtitle": "Timestamp-Ordered Queue  |  Automatic Seat Reallocation on Cancellation  |  No Head-of-Line Blocking",
        "accent": (168, 85, 247)
    },
    {
        "id": "scene5_organizer",
        "audio": "05_organizer.wav",
        "video": "scene5_organizer.webm",
        "badge": "ORGANIZER · STEP 5/7",
        "title": "STAKEHOLDER 2: EVENT ORGANIZER STUDIO & STAFF DELEGATION",
        "subtitle": "Event Lifecycle Studio  |  S3 Direct Presigned Uploads  |  Coordinator Role Delegation",
        "accent": (236, 72, 153)
    },
    {
        "id": "scene6_coordinator",
        "audio": "06_coordinator_checkin.wav",
        "video": "scene6_coordinator.webm",
        "badge": "COORDINATOR · STEP 6/7",
        "title": "STAKEHOLDER 3: GATE SCANNER & FRAUD PREVENTION",
        "subtitle": "Live Camera Optical QR Scanner  |  Atomic Check-in State  |  Instant Duplicate Replay Rejection",
        "accent": (239, 68, 68)
    },
    {
        "id": "scene7_outro",
        "audio": "07_conclusion.wav",
        "video": "scene7_outro.webm",
        "badge": "CI/CD & OUTRO · STEP 7/7",
        "title": "AUTOMATED TEST SUITE & CLOUD-NATIVE RELIABILITY",
        "subtitle": "195 Backend Tests + 20 Frontend Tests Passing  |  Zero Infrastructure Overhead  |  Sub-150ms Latency",
        "accent": (34, 197, 94)
    }
]

def get_font(font_name, size):
    try:
        font_path = os.path.join("C:\\Windows\\Fonts", font_name)
        if os.path.exists(font_path):
            return ImageFont.truetype(font_path, size)
    except Exception:
        pass
    return ImageFont.load_default()

def create_scene_overlay(scene, output_path):
    # 1280x720 transparent image
    img = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Top Brand Header Bar
    draw.rectangle([(0, 0), (1280, 48)], fill=(15, 23, 42, 220))
    draw.line([(0, 48), (1280, 48)], fill=(51, 65, 85, 255), width=1)

    font_brand = get_font("segoeuib.ttf", 16)
    font_brand_sub = get_font("segoeui.ttf", 14)
    draw.text((24, 14), "MARQUE", font=font_brand, fill=(96, 165, 250))
    draw.text((95, 15), "|  Cloud Computing & Serverless Microproject Demonstration", font=font_brand_sub, fill=(203, 213, 225))

    # Right side tech pill in header
    right_pill_text = "AWS CLOUD ARCHITECTURE"
    draw.rounded_rectangle([(1020, 10), (1256, 38)], radius=6, fill=(30, 41, 59, 240), outline=(71, 85, 105, 255), width=1)
    font_pill = get_font("segoeuib.ttf", 12)
    draw.text((1045, 16), right_pill_text, font=font_pill, fill=(148, 163, 184))

    # Bottom Lower Third Banner
    banner_x0, banner_y0, banner_x1, banner_y1 = 24, 616, 1256, 704
    # Dark modern card background with glassmorphism gradient simulation
    draw.rounded_rectangle([(banner_x0, banner_y0), (banner_x1, banner_y1)], radius=12, fill=(11, 17, 32, 238), outline=(51, 65, 85, 230), width=1)

    # Left colored accent bar
    accent_color = scene["accent"]
    draw.rounded_rectangle([(banner_x0 + 8, banner_y0 + 12), (banner_x0 + 14, banner_y1 - 12)], radius=3, fill=accent_color)

    # Badge Pill
    badge_text = scene["badge"]
    font_badge = get_font("segoeuib.ttf", 11)
    badge_bg = (accent_color[0], accent_color[1], accent_color[2], 50)
    draw.rounded_rectangle([(banner_x0 + 26, banner_y0 + 12), (banner_x0 + 195, banner_y0 + 32)], radius=5, fill=badge_bg, outline=accent_color, width=1)
    draw.text((banner_x0 + 34, banner_y0 + 15), badge_text, font=font_badge, fill=(241, 245, 249))

    # Title
    font_title = get_font("segoeuib.ttf", 19)
    draw.text((banner_x0 + 210, banner_y0 + 12), scene["title"], font=font_title, fill=(255, 255, 255))

    # Subtitle
    font_sub = get_font("segoeui.ttf", 13)
    draw.text((banner_x0 + 26, banner_y0 + 48), scene["subtitle"], font=font_sub, fill=(147, 197, 253))

    img.save(output_path, "PNG")
    print(f"Generated overlay: {output_path}")

def get_media_duration(file_path):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(res.stdout.strip())

def process_scene(scene, index):
    audio_file = os.path.join(AUDIO_DIR, scene["audio"])
    video_file = os.path.join(RECORDINGS_DIR, scene["video"])
    overlay_png = os.path.join(OUTPUT_DIR, f"overlay_{scene['id']}.png")
    out_mp4 = os.path.join(OUTPUT_DIR, f"scene_{index:02d}_{scene['id']}.mp4")

    create_scene_overlay(scene, overlay_png)

    audio_dur = get_media_duration(audio_file)
    print(f"\nProcessing Scene {index}: {scene['id']}")
    print(f"Audio Duration: {audio_dur:.2f}s | Source: {video_file}")

    # Build ffmpeg command:
    # Overlay PNG on top of video, combine with narration audio, pad/loop video to audio duration
    # We use tpad to clone last frame if video is slightly shorter than audio
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", video_file,
        "-i", overlay_png,
        "-i", audio_file,
        "-filter_complex",
        f"[0:v]tpad=stop_mode=clone:stop_duration=5[vpad];[vpad][1:v]overlay=0:0[vout]",
        "-map", "[vout]",
        "-map", "2:a",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "faster",
        "-crf", "19",
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", f"{audio_dur:.3f}",
        out_mp4
    ]

    subprocess.run(ffmpeg_cmd, check=True)
    print(f"Generated Scene Segment: {out_mp4}")
    return out_mp4

def main():
    segment_files = []
    for idx, scene in enumerate(SCENES, start=1):
        seg = process_scene(scene, idx)
        segment_files.append(seg)

    # Concat demuxer
    concat_list_file = os.path.join(OUTPUT_DIR, "concat_list.txt")
    with open(concat_list_file, "w", encoding="utf-8") as f:
        for seg in segment_files:
            # Format file path for ffmpeg concat
            norm_path = seg.replace("\\", "/")
            f.write(f"file '{norm_path}'\n")

    final_output = os.path.join(OUTPUT_DIR, "MARQUE_3Min_Project_Demonstration.mp4")
    print("\nConcatenating all 7 scenes into final master video...")
    concat_cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_list_file,
        "-c", "copy",
        final_output
    ]
    subprocess.run(concat_cmd, check=True)

    # Copy to docs directory for project repository
    docs_output = os.path.join(os.path.dirname(BASE_DIR), "docs", "MARQUE_3Min_Project_Demonstration.mp4")
    os.makedirs(os.path.dirname(docs_output), exist_ok=True)
    import shutil
    shutil.copyfile(final_output, docs_output)

    total_dur = get_media_duration(final_output)
    print("\n=======================================================")
    print(f"SUCCESS! Master Video Demonstration Generated:")
    print(f"File: {final_output}")
    print(f"Docs Copy: {docs_output}")
    print(f"Total Duration: {total_dur:.2f} seconds ({total_dur/60:.2f} minutes)")
    print("=======================================================\n")

if __name__ == "__main__":
    main()
