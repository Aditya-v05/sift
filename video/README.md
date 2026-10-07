# Landing page video

The demo on the landing page is edited here in [Remotion](https://www.remotion.dev) from a real screen recording of Sift on usepylon.com. The rendered files are `site/public/demo.mp4` (1600×1000) and `site/public/demo-m.mp4` (720×1280, for phones).

## The source (not committed)

`public/clean.mp4` is made from the raw screen recording (`*.mov`, kept local) with ffmpeg:

- cut to the first 26.5 s and converted to 30 fps;
- the macOS menu bar cropped off (`crop=2940:1838:0:74`);
- Chrome's "Relaunch to update" and "Ask Gemini" buttons and a personal bookmark painted over, for as long as the toolbar is visible (`drawbox`, t < 4.1 s);
- **the revealed email blurred from 11.7 s to 14.4 s** (`boxblur` over x 2226, y 1464, 300×62 in recording pixels). It first appears at about 11.77 s. This is only a safety net: the edit draws a made-up address, `dan@usepylon.example`, over it (see below).

It stays out of git because the raw clip shows that email unblurred after 14.4 s. The edit only uses 1.0–3.85 s, 4.3–14.0 s and 22.0–25.6 s, none of which shows it. Check every frame of the reveal again after any change to the cut.

## The edit (`src/Demo.tsx`)

- **Structure:** an intro card, then three clips from the recording (the icon click, the Pylon result through to the revealed contact, and Save), then a closing card.
- **Camera:** a rectangle of the recording per moment, eased between. Coordinates are recording pixels, and times are seconds of the original recording.
- **Captions:** one per moment, in their own band under the picture, so they never sit on the page's text.
- **Made-up email:** the revealed address belongs to a real person, so `FakeEmail` draws `dan@usepylon.example` over it in the panel's font and background, inside the camera's coordinate space, from 11.7 s to 14.4 s. `.example` is reserved and can never be anyone's.
- **Four formats** (`FORMATS` in `Demo.tsx`) share the timeline and differ in framing, caption size and cards:
  - `SiftDemo` (1600×1000) and `SiftDemoVertical` (720×1280) are for the site;
  - `SiftSocialPortrait` (1080×1350, 4:5) and `SiftSocialSquare` (1080×1080) are for LinkedIn and X feeds. They open on a hook card ("Know who to email before you leave their homepage."), use bigger captions for phones with the sound off, hold the end card longer (with the URL and "free and open source"), and show a thin progress line, since feeds have no scrubber;
  - `SiftSocialLandscape` (1920×1080, 16:9) is the same social cut for people who post landscape.
- **Thumbnails** (`src/Thumb.tsx`, stills `SiftSocial*Thumb`): no text, just the panel at Pylon 82% strong fit. They are made from `public/thumb-frame.png`, a still of `clean.mp4` at 6.6 s (`ffmpeg -ss 6.6 -i public/clean.mp4 -frames:v 1 public/thumb-frame.png`), before any contact or email is on screen. Don't seek `clean.mp4` from a still: `OffthreadVideo`'s `startFrom` in a Still landed on a later frame that shows the real email.

## Commands

```sh
cd video
npm install
npm run studio   # preview and scrub
npm run render          # the site cuts: out/demo.mp4, out/demo-m.mp4
npm run render:social   # feed cuts: out/sift-social-4x5.mp4, -1x1.mp4, -16x9.mp4 (upload as is)
npx remotion still src/index.ts SiftSocialPortraitThumb out/sift-thumb-4x5.png   # likewise Square / Landscape
```

Then re-encode for the web and copy to the site:

```sh
ffmpeg -i out/demo.mp4 -an -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart ../site/public/demo.mp4
ffmpeg -i out/demo-m.mp4 -an -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart ../site/public/demo-m.mp4
```

Remotion is free for individuals and companies of up to three people; see its license.

### Before posting to LinkedIn or X

Remotion writes full-range colour (`yuvj420p`) with no audio track. Re-encode to standard range with a silent audio track, which is what the platforms expect:

```sh
ffmpeg -i out/sift-social-4x5.mp4 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -shortest \
  -map 0:v -map 1:a -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 -profile:v high -level 4.1 -preset slow -crf 18 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 128k -movflags +faststart sift-social-4x5.mp4
```

## The treg demo (story `TREG`)

A second recording (2026-10-07, v0.3.1): switching the data source to treg in Settings, then browserbase.com scored against treg's own ICP, and the founder's email revealed for $0.026. Source prep for `public/treg.mp4` (kept local, like `clean.mp4`):

- Chrome's "Paused", "Action required" and "Ask Gemini" buttons are covered with strips of the frame's own empty toolbar and tab bar, stretched sideways. This stays in the video's native colour, since drawing colours shifted them.
- The revealed email is blurred from 22.95 s, the exact frame it appears.
- The macOS menu bar is cropped off.

In the edit, `TextPatch`es draw the made-up `paul@browserbase.example` over the address, and the label "engineering team shipping AI features" over "n engineering…" (a rule-maker bug since fixed). Both use the panel's white as Remotion decodes it, `#fcfcfc`.

```sh
npm run render:treg     # out/treg-16x9.mp4, treg-4x5.mp4, treg-1x1.mp4
npx remotion still src/index.ts TregPortraitThumb out/treg-thumb-Portrait.png   # also Landscape, Square
```

Then apply the export step above before posting.

## The showreel cuts (`src/Reel.tsx`)

Since 2026-10-08 the site's videos, and the style for new ones, are the showreel cuts: a motion-design reel built around real product footage.

- **Look:** a HUD frame on every shot (corner labels, a running timecode, a progress hairline, and a spec line carrying Sift's real numbers such as "Fit 82% · strong" or "quote · 3 companies · 0 credits"). Archivo (variable: weight and width) for the big type, Instrument Serif for captions, JetBrains Mono for labels. Night green, cream and mint only.
- **Motion:** 60 fps; springs (stiffness 190, damping 18) instead of eased fades; words rise letter by letter out of a mask; hard-cut word beats on solid grounds; layered bands that wipe across a cut; a 3D tile grid that flips to show ICP fit.
- **Footage:** the usepylon.com recording goes through `Demo.tsx`'s camera and text patches (`PYLON.camera`, `PYLON.patches`), so the email on screen is the made-up `dan@usepylon.example` and the clip ranges stay inside the ones checked above (1.0–3.85, 4.3–7.4, 7.9–14.0 s). The agent reel replays `site/agent-session.json` (the real tool calls) in a terminal panel.
- **Reels:** `home` (the extension) and `agents` (sift-gtm), each as `Reel{Home,Agents}{Landscape,Portrait,Square}` (1920×1080, 1080×1350, 1080×1080). A reel is a list of scenes, each with a length, what it renders, and what the HUD says at each frame.

```sh
npx remotion render src/index.ts ReelHomeLandscape out/reel/Home-Landscape.mp4 --crf=16   # likewise the other five
# the site: home 1600×900 (from Landscape) and 720×900 for phones (from Portrait); /agents 1280×720
ffmpeg -i out/reel/Home-Landscape.mp4 -an -vf "scale=1600:900:flags=lanczos,fps=30,format=yuv420p" -c:v libx264 -preset slow -crf 26 -movflags +faststart ../site/public/demo.mp4
```

The site copies are 30 fps to keep them small; the social files stay at 60 fps (use the LinkedIn/X recipe above, with `-level 4.2` for 1080p60).
