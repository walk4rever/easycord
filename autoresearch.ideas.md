# Autoresearch ideas

- Consider prewarming the FFmpeg worker/core even earlier in the real app (for example after camera startup rather than only at recording start) if the added background work does not hurt UX.
- If confidence remains low because of variance, run multiple isolated cold contexts per scenario and aggregate medians to stabilize decisions before further tuning.
