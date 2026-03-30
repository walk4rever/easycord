# Autoresearch ideas

- Add a benchmark variant that reflects the real gesture-driven app flow more closely by including some pre-record idle/gesture-hold time before recording starts, then compare against the zero-gap case so we do not optimize only for one user path.
- If confidence remains low even after the current per-scenario medians, consider increasing repeats only for the noisiest scenario rather than uniformly making every run slower.
