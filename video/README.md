# Demo video

`demo-final.mp4` (1920x1080, 30 fps, ~88 s) is built with HyperFrames from real captures of
the running app. Large binaries (the MP4, the screen captures and the audio mix) are
git-ignored; this folder holds everything needed to rebuild them.

1. Start the app with a fresh cache so the agent run is live:
   `QLOO_CACHE_DIR=.cache/qloo-video PORT=8788 npm start`
2. Record the app (Chrome DevTools screencast, real speed):
   `python scripts/record_demo.py http://localhost:8788 video/work`
   then copy `video/work/{a_builder,b_plan,c_read}.mp4` into `video/hyperframes/assets/clips/`.
3. Section stills at 2x: `DSF=2 python scripts/capture.py http://localhost:8788 offsite video/work/hi`
4. Narration, captions and music: `python video/make_audio.py`
   (Edge neural TTS from `narration.json`; music synthesised in code; ducked pre-mix).
5. Composition: `python video/build_composition.py` (writes `hyperframes/index.html`).
6. Check and render: `cd video/hyperframes && npx hyperframes@0.8.160 check && npx hyperframes@0.8.160 render -o ../demo-final.mp4 -q delivery`
7. Thumbnail and vertical teaser: `python video/make_extras.py`

The speed-ups in the edit are labelled on screen (1.4x, 2x, 1.9x). No Veo or other
generated video is used; the only generated visuals are the mood stills listed in
`design/GENERATED_ASSETS.md`.
