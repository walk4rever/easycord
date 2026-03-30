# Autoresearch ideas

- Consider prewarming the FFmpeg worker/core even earlier (for example after camera startup rather than at recording start) if the added background work does not hurt UX.
- Add a broader benchmark mix with shorter recordings / shorter overlap windows so cold-start changes are optimized against more than one 3-second sample length.
